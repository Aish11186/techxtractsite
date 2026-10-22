import json
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from backend.app.db.session import get_db
from backend.app.models import Attendance, Event, Student, User, UserRole, AttendanceAuditLog
from backend.app.schemas import AttendanceResponse, AttendanceCorrectionRequest, StudentSummary
from backend.app.core.security import get_current_user, require_roles
from backend.app.core.audit_chain import canonicalize_audit_payload, compute_record_hash, get_latest_audit_hash

router = APIRouter(tags=["Attendance"])

@router.get("/events/{event_id}/attendance", response_model=List[AttendanceResponse])
def get_event_attendance(
    event_id: int,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Attendance).options(joinedload(Attendance.student)).filter(Attendance.event_id == event_id)
    if status:
        query = query.filter(Attendance.status == status.upper())

    records = query.order_by(Attendance.marked_at.desc()).all()
    results = []
    for r in records:
        st = r.student
        summary = None
        if st:
            summary = StudentSummary(
                id=st.id,
                name=st.name,
                enrollment_no=st.enrollment_no,
                department=st.department,
                year=st.year,
                barcode_value=st.barcode_value
            )
        res = AttendanceResponse(
            id=r.id,
            event_id=r.event_id,
            student_id=r.student_id,
            status=r.status,
            marked_at=r.marked_at,
            marked_by_id=r.marked_by_id,
            scan_method=r.scan_method,
            device_id=r.device_id,
            created_at=r.created_at,
            student=summary
        )
        results.append(res)
    return results

@router.post(
    "/attendance/{attendance_id}/correction",
    response_model=AttendanceResponse,
    dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))]
)
def correct_attendance(
    attendance_id: int,
    corr_req: AttendanceCorrectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Controlled attendance correction workflow.
    Validates permissions, updates operational state, and writes an immutable audit record
    into the SHA-256 cryptographic chain with previous state, new state, and mandatory reason.
    """
    att = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    old_status = att.status
    target_status = corr_req.new_status.strip().upper()
    if target_status not in ["PRESENT", "LATE", "EXCUSED", "ABSENT"]:
        raise HTTPException(status_code=400, detail=f"Invalid attendance status: {target_status}")

    if old_status == target_status:
        raise HTTPException(status_code=400, detail="New status must be different from current status")

    now = datetime.utcnow()
    att.status = target_status
    att.updated_at = now

    # Append-only cryptographic audit record
    previous_hash = get_latest_audit_hash(db)
    meta_dict = {
        "correction": {
            "previous_status": old_status,
            "new_status": target_status,
            "reason": corr_req.reason.strip()
        },
        "corrected_by": current_user.email
    }
    meta_str = json.dumps(meta_dict, sort_keys=True)
    canonical_payload = canonicalize_audit_payload(
        attendance_id=att.id,
        event_id=att.event_id,
        student_id=att.student_id,
        action="CORRECTION",
        timestamp=now,
        performed_by_id=current_user.id,
        metadata_json=meta_str
    )
    record_hash = compute_record_hash(canonical_payload, previous_hash)

    audit_entry = AttendanceAuditLog(
        attendance_id=att.id,
        event_id=att.event_id,
        student_id=att.student_id,
        action="CORRECTION",
        timestamp=now,
        performed_by_id=current_user.id,
        performed_by_name=current_user.name,
        metadata_json=meta_str,
        previous_hash=previous_hash,
        record_hash=record_hash
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(att)

    st = db.query(Student).filter(Student.id == att.student_id).first()
    summary = StudentSummary(
        id=st.id,
        name=st.name,
        enrollment_no=st.enrollment_no,
        department=st.department,
        year=st.year,
        barcode_value=st.barcode_value
    ) if st else None

    return AttendanceResponse(
        id=att.id,
        event_id=att.event_id,
        student_id=att.student_id,
        status=att.status,
        marked_at=att.marked_at,
        marked_by_id=att.marked_by_id,
        scan_method=att.scan_method,
        device_id=att.device_id,
        created_at=att.created_at,
        student=summary
    )
