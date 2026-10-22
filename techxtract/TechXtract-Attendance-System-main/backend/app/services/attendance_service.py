import json
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.app.models import Event, Student, EventRegistration, Attendance, AttendanceAuditLog, User
from backend.app.schemas import ScanRequest, ScanResponse, StudentSummary
from backend.app.core.audit_chain import (
    canonicalize_audit_payload,
    compute_record_hash,
    get_latest_audit_hash
)

# In-memory WebSocket manager registry for live broadcast
class AttendanceNotifier:
    def __init__(self):
        self._connections: Dict[int, list] = {}

    def register(self, event_id: int, websocket):
        if event_id not in self._connections:
            self._connections[event_id] = []
        self._connections[event_id].append(websocket)

    def unregister(self, event_id: int, websocket):
        if event_id in self._connections and websocket in self._connections[event_id]:
            self._connections[event_id].remove(websocket)

    async def broadcast_event_update(self, event_id: int, data: dict):
        if event_id in self._connections:
            closed = []
            for ws in self._connections[event_id]:
                try:
                    await ws.send_json(data)
                except Exception:
                    closed.append(ws)
            for ws in closed:
                self.unregister(event_id, ws)

notifier = AttendanceNotifier()

def process_attendance_scan(
    db: Session,
    event_id: int,
    scan_req: ScanRequest,
    current_user: User
) -> ScanResponse:
    """
    Authoritative, atomic attendance processing routine.
    Validates event state, resolves student identifier, enforces registration constraints,
    atomically records attendance with DB uniqueness, and appends to SHA-256 audit log.
    """
    # 1. Fetch and validate event
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        return ScanResponse(
            status="SERVER_ERROR",
            message=f"Event #{event_id} does not exist"
        )

    # 2. Check if event is open for attendance
    if event.status != "OPEN":
        return ScanResponse(
            status="EVENT_CLOSED",
            message=f"Event '{event.title}' is currently {event.status}. Attendance can only be recorded when status is OPEN."
        )

    # 3. Resolve student from identifier
    raw_id = scan_req.student_identifier.strip()
    student = (
        db.query(Student)
        .filter(
            (Student.barcode_value == raw_id) |
            (Student.qr_token == raw_id) |
            (Student.enrollment_no == raw_id)
        )
        .first()
    )

    if not student:
        return ScanResponse(
            status="INVALID_IDENTIFIER",
            message=f"No student record found matching identifier '{raw_id}'"
        )

    if student.status != "ACTIVE":
        return ScanResponse(
            status="INVALID_IDENTIFIER",
            message=f"Student account ({student.name}) is inactive or suspended"
        )

    student_summary = StudentSummary(
        id=student.id,
        name=student.name,
        enrollment_no=student.enrollment_no,
        department=student.department,
        year=student.year,
        barcode_value=student.barcode_value
    )

    # 4. Registration requirement for attendance removed:
    # All valid members/students can scan attendance directly.
    # Auto-record registration record if not present so event stats remain consistent.
    reg = (
        db.query(EventRegistration)
        .filter(
            EventRegistration.event_id == event.id,
            EventRegistration.student_id == student.id
        )
        .first()
    )
    if not reg:
        new_reg = EventRegistration(
            event_id=event.id,
            student_id=student.id,
            registered_by_id=current_user.id
        )
        db.add(new_reg)
        db.flush()

    # 5. Check duplicate attendance
    existing_attendance = (
        db.query(Attendance)
        .filter(
            Attendance.event_id == event.id,
            Attendance.student_id == student.id
        )
        .first()
    )
    if existing_attendance:
        marked_time_str = existing_attendance.marked_at.strftime("%I:%M %p")
        return ScanResponse(
            status="DUPLICATE",
            message=f"Attendance already recorded for {student.name} at {marked_time_str} ({existing_attendance.status})",
            student=student_summary,
            attendance_status=existing_attendance.status,
            marked_at=existing_attendance.marked_at,
            scan_id=existing_attendance.id
        )

    # 6. Determine attendance status: PRESENT vs LATE
    now = datetime.utcnow()
    att_status = "PRESENT"
    if event.late_threshold_minutes and event.start_datetime:
        minutes_elapsed = (now - event.start_datetime).total_seconds() / 60.0
        if minutes_elapsed > event.late_threshold_minutes:
            att_status = "LATE"

    # 7. Atomic transaction insertion with audit log chaining
    try:
        new_attendance = Attendance(
            event_id=event.id,
            student_id=student.id,
            status=att_status,
            marked_at=now,
            marked_by_id=current_user.id,
            scan_method=scan_req.scan_method.upper(),
            device_id=scan_req.device_id
        )
        db.add(new_attendance)
        db.flush() # Flush to assign new_attendance.id while keeping transaction open

        # 8. Cryptographic audit log chaining
        previous_hash = get_latest_audit_hash(db)
        meta_dict = {
            "scanner": {
                "type": scan_req.scan_method.upper(),
                "device_id": scan_req.device_id
            },
            "scan_method": scan_req.scan_method.upper(),
            "student_identifier": raw_id,
            "status_assigned": att_status,
            "event_title": event.title
        }
        meta_str = json.dumps(meta_dict, sort_keys=True)
        canonical_payload = canonicalize_audit_payload(
            attendance_id=new_attendance.id,
            event_id=event.id,
            student_id=student.id,
            action="SCAN_RECORDED",
            timestamp=now,
            performed_by_id=current_user.id,
            metadata_json=meta_str
        )
        record_hash = compute_record_hash(canonical_payload, previous_hash)

        audit_entry = AttendanceAuditLog(
            attendance_id=new_attendance.id,
            event_id=event.id,
            student_id=student.id,
            action="SCAN_RECORDED",
            timestamp=now,
            performed_by_id=current_user.id,
            performed_by_name=current_user.name,
            metadata_json=meta_str,
            previous_hash=previous_hash,
            record_hash=record_hash
        )
        db.add(audit_entry)
        db.commit()
        db.refresh(new_attendance)

        # 9. Calculate running stats
        total_present = db.query(Attendance).filter(Attendance.event_id == event.id, Attendance.status.in_(["PRESENT", "LATE"])).count()
        total_reg = db.query(EventRegistration).filter(EventRegistration.event_id == event.id).count()

        return ScanResponse(
            status="SUCCESS",
            message=f"Attendance marked as {att_status}",
            student=student_summary,
            attendance_status=att_status,
            marked_at=new_attendance.marked_at,
            scan_id=new_attendance.id,
            event_stats={
                "present": total_present,
                "registered": total_reg
            }
        )

    except IntegrityError:
        db.rollback()
        # Concurrency race condition caught at DB uniqueness level
        duplicate_att = (
            db.query(Attendance)
            .filter(Attendance.event_id == event.id, Attendance.student_id == student.id)
            .first()
        )
        return ScanResponse(
            status="DUPLICATE",
            message=f"Concurrent scan detected: attendance already registered for {student.name}",
            student=student_summary,
            attendance_status=duplicate_att.status if duplicate_att else "PRESENT",
            marked_at=duplicate_att.marked_at if duplicate_att else now,
            scan_id=duplicate_att.id if duplicate_att else None
        )
    except Exception as e:
        db.rollback()
        return ScanResponse(
            status="SERVER_ERROR",
            message=f"Server error recording attendance: {str(e)}"
        )
