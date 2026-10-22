import hashlib
import json
from datetime import datetime
from typing import Optional, Dict, Any, Tuple, List
from sqlalchemy.orm import Session

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

def canonicalize_audit_payload(
    attendance_id: Optional[int],
    event_id: int,
    student_id: int,
    action: str,
    timestamp: datetime,
    performed_by_id: Optional[int],
    metadata_json: str
) -> str:
    """
    Produce a deterministic, sorted, canonical string representation of an audit entry.
    """
    try:
        parsed_meta = json.loads(metadata_json) if isinstance(metadata_json, str) else metadata_json
    except Exception:
        parsed_meta = {"raw": str(metadata_json)}

    # Ensure deterministic json with sorted keys and no unnecessary whitespaces
    sorted_meta_str = json.dumps(parsed_meta, sort_keys=True, separators=(',', ':'))

    canonical_dict = {
        "action": str(action).strip().upper(),
        "attendance_id": attendance_id if attendance_id is not None else None,
        "event_id": int(event_id),
        "metadata": sorted_meta_str,
        "performed_by_id": performed_by_id if performed_by_id is not None else None,
        "student_id": int(student_id),
        "timestamp_iso": timestamp.isoformat() if isinstance(timestamp, datetime) else str(timestamp)
    }

    return json.dumps(canonical_dict, sort_keys=True, separators=(',', ':'))

def compute_record_hash(canonical_payload: str, previous_hash: str) -> str:
    """
    Computes SHA-256(canonical_payload + previous_hash)
    """
    hasher = hashlib.sha256()
    hasher.update((canonical_payload + previous_hash).encode("utf-8"))
    return hasher.hexdigest()

def get_latest_audit_hash(db: Session) -> str:
    """
    Retrieves the record_hash of the most recent audit entry, or returns GENESIS_HASH if empty.
    """
    from backend.app.models import AttendanceAuditLog
    last_record = db.query(AttendanceAuditLog).order_by(AttendanceAuditLog.id.desc()).first()
    if last_record and last_record.record_hash:
        return last_record.record_hash
    return GENESIS_HASH

def verify_audit_chain(db: Session) -> Dict[str, Any]:
    """
    Walks the entire audit log in sequential ID order and validates the cryptographic hash chain.
    Returns audit status, total records checked, and details of any broken links.
    """
    from backend.app.models import AttendanceAuditLog

    records: List[AttendanceAuditLog] = db.query(AttendanceAuditLog).order_by(AttendanceAuditLog.id.asc()).all()
    
    if not records:
        return {
            "verified": True,
            "total_records": 0,
            "message": "Audit log is empty. Chain is pristine.",
            "broken_record_id": None
        }

    expected_prev_hash = GENESIS_HASH

    for idx, rec in enumerate(records):
        # 1. Verify previous_hash matches prior record's record_hash
        if rec.previous_hash != expected_prev_hash:
            reason_msg = f"Previous hash mismatch at record #{rec.id}. Expected {expected_prev_hash}, found {rec.previous_hash}."
            return {
                "verified": False,
                "total_records": len(records),
                "checked_records": idx,
                "broken_record_id": rec.id,
                "message": reason_msg,
                "reason": reason_msg
            }

        # 2. Re-compute canonical payload and SHA-256 hash
        payload = canonicalize_audit_payload(
            attendance_id=rec.attendance_id,
            event_id=rec.event_id,
            student_id=rec.student_id,
            action=rec.action,
            timestamp=rec.timestamp,
            performed_by_id=rec.performed_by_id,
            metadata_json=rec.metadata_json
        )
        calculated_hash = compute_record_hash(payload, rec.previous_hash)

        if calculated_hash != rec.record_hash:
            reason_msg = f"Record hash mismatch at record #{rec.id}. Payload tampered! Calculated {calculated_hash}, found {rec.record_hash}."
            return {
                "verified": False,
                "total_records": len(records),
                "checked_records": idx,
                "broken_record_id": rec.id,
                "message": reason_msg,
                "reason": reason_msg
            }

        expected_prev_hash = rec.record_hash

    return {
        "verified": True,
        "total_records": len(records),
        "message": f"Audit integrity verified. All {len(records)} records match cryptographic chain.",
        "broken_record_id": None
    }
