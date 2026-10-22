import io
import csv
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from backend.app.db.session import get_db
from backend.app.models import Event, Student, Attendance, EventRegistration, User, UserRole
from backend.app.schemas import EventReport, StudentReport, SocietyReport
from backend.app.core.security import get_current_user, require_roles

router = APIRouter(prefix="/reports", tags=["Reports & Exports"])

@router.get("/event/{event_id}", response_model=EventReport)
def get_event_report(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    total_registered = db.query(EventRegistration).filter(EventRegistration.event_id == event_id).count()
    attendances = db.query(Attendance).filter(Attendance.event_id == event_id).all()

    present_count = sum(1 for a in attendances if a.status == "PRESENT")
    late_count = sum(1 for a in attendances if a.status == "LATE")
    excused_count = sum(1 for a in attendances if a.status == "EXCUSED")
    total_attended = present_count + late_count

    absent_count = max(0, total_registered - total_attended - excused_count)
    pct = round((total_attended / total_registered * 100), 2) if total_registered > 0 else 0.0

    return EventReport(
        event_id=event.id,
        event_code=event.event_code,
        title=event.title,
        status=event.status,
        venue=event.venue,
        start_datetime=event.start_datetime,
        total_registered=total_registered,
        total_present=present_count,
        total_late=late_count,
        total_excused=excused_count,
        total_absent=absent_count,
        attendance_percentage=pct
    )

@router.get("/event/{event_id}/export/csv")
def export_event_attendance_csv(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Export verified attendance data for an event as an RFC-4180 compliant CSV.
    Protected endpoint: requires authenticated user.
    """
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    attendances = (
        db.query(Attendance)
        .options(joinedload(Attendance.student))
        .filter(Attendance.event_id == event_id)
        .order_by(Attendance.marked_at.asc())
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)

    # Write headers
    writer.writerow([
        "Enrollment No",
        "Name",
        "Department",
        "Year",
        "Section",
        "Event Code",
        "Event Title",
        "Status",
        "Scan Method",
        "Device ID",
        "Marked Time (UTC)",
        "Marked Time (Local Formatted)"
    ])

    for a in attendances:
        st = a.student
        writer.writerow([
            st.enrollment_no if st else "N/A",
            st.name if st else "Unknown",
            st.department if st else "N/A",
            st.year if st else "N/A",
            st.section if st else "N/A",
            event.event_code,
            event.title,
            a.status,
            a.scan_method,
            a.device_id or "default",
            a.marked_at.isoformat(),
            a.marked_at.strftime("%Y-%m-%d %H:%M:%S")
        ])

    output.seek(0)
    filename = f"attendance_{event.event_code}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/student/{student_id}", response_model=StudentReport)
def get_student_report(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    regs = db.query(EventRegistration).filter(EventRegistration.student_id == student_id).count()
    atts = db.query(Attendance).filter(Attendance.student_id == student_id).all()

    attended = sum(1 for a in atts if a.status in ["PRESENT", "LATE"])
    late = sum(1 for a in atts if a.status == "LATE")
    absent = max(0, regs - attended)
    pct = round((attended / regs * 100), 2) if regs > 0 else 0.0

    return StudentReport(
        student_id=student.id,
        enrollment_no=student.enrollment_no,
        name=student.name,
        department=student.department,
        year=student.year,
        registered_events=regs,
        attended_events=attended,
        late_events=late,
        absent_events=absent,
        attendance_percentage=pct
    )

@router.get("/society", response_model=SocietyReport)
def get_society_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total_students = db.query(Student).count()
    total_events = db.query(Event).count()
    active_events = db.query(Event).filter(Event.status == "OPEN").count()
    total_attendance = db.query(Attendance).count()

    total_regs = db.query(EventRegistration).count()
    avg_pct = round((total_attendance / total_regs * 100), 2) if total_regs > 0 else 0.0

    return SocietyReport(
        total_students=total_students,
        total_events=total_events,
        total_attendance_volume=total_attendance,
        average_attendance_percentage=avg_pct,
        active_events_count=active_events
    )
