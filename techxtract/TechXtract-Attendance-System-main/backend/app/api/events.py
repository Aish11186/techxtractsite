from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.app.db.session import get_db
from backend.app.models import Event, EventStatus, User, UserRole, Attendance, EventRegistration, AttendanceAuditLog
from backend.app.schemas import EventResponse, EventCreate, EventUpdate
from backend.app.core.security import get_current_user, require_roles

router = APIRouter(prefix="/events", tags=["Events"])

# Valid state machine transitions
ALLOWED_TRANSITIONS = {
    EventStatus.DRAFT.value: [EventStatus.SCHEDULED.value, EventStatus.OPEN.value, EventStatus.CANCELLED.value],
    EventStatus.SCHEDULED.value: [EventStatus.OPEN.value, EventStatus.CANCELLED.value, EventStatus.DRAFT.value],
    EventStatus.OPEN.value: [EventStatus.CLOSED.value, EventStatus.CANCELLED.value],
    EventStatus.CLOSED.value: [EventStatus.ARCHIVED.value, EventStatus.OPEN.value],
    EventStatus.CANCELLED.value: [EventStatus.ARCHIVED.value, EventStatus.DRAFT.value],
    EventStatus.ARCHIVED.value: []
}

def enrich_event_stats(event: Event, db: Session) -> dict:
    registered = db.query(EventRegistration).filter(EventRegistration.event_id == event.id).count()
    present = db.query(Attendance).filter(Attendance.event_id == event.id, Attendance.status == "PRESENT").count()
    late = db.query(Attendance).filter(Attendance.event_id == event.id, Attendance.status == "LATE").count()

    res = EventResponse.from_orm(event)
    res.total_registered = registered
    res.total_present = present
    res.total_late = late
    return res

@router.get("", response_model=List[EventResponse])
def list_events(
    status: Optional[str] = None,
    type: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Event)
    if status:
        query = query.filter(Event.status == status)
    if type:
        query = query.filter(Event.type == type)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(or_(Event.title.ilike(s), Event.event_code.ilike(s), Event.venue.ilike(s)))

    events = query.order_by(Event.start_datetime.desc()).all()
    return [enrich_event_stats(e, db) for e in events]

@router.get("/{id}", response_model=EventResponse)
def get_event(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    event = db.query(Event).filter(Event.id == id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return enrich_event_stats(event, db)

@router.post("", response_model=EventResponse, dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))])
def create_event(
    event_in: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing = db.query(Event).filter(Event.event_code == event_in.event_code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Event code '{event_in.event_code}' already exists")

    if event_in.end_datetime <= event_in.start_datetime:
        raise HTTPException(status_code=400, detail="End datetime must be after start datetime")

    new_event = Event(
        event_code=event_in.event_code.strip().upper(),
        title=event_in.title.strip(),
        description=event_in.description,
        type=event_in.type.strip().upper(),
        venue=event_in.venue.strip(),
        start_datetime=event_in.start_datetime,
        end_datetime=event_in.end_datetime,
        registration_required=event_in.registration_required,
        attendance_required=event_in.attendance_required,
        late_threshold_minutes=event_in.late_threshold_minutes,
        status=EventStatus.DRAFT.value,
        created_by_id=current_user.id
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    return enrich_event_stats(new_event, db)

@router.patch("/{id}", response_model=EventResponse, dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))])
def update_event(
    id: int,
    event_in: EventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    event = db.query(Event).filter(Event.id == id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # If coordinator, ensure they own the event or are Super Admin
    if current_user.role != UserRole.SUPER_ADMIN.value and event.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this event")

    # Status transition check
    if event_in.status and event_in.status != event.status:
        allowed = ALLOWED_TRANSITIONS.get(event.status, [])
        if event_in.status not in allowed and current_user.role != UserRole.SUPER_ADMIN.value:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition event lifecycle from {event.status} to {event_in.status}. Allowed: {', '.join(allowed)}"
            )
        event.status = event_in.status

    if event_in.title is not None:
        event.title = event_in.title
    if event_in.description is not None:
        event.description = event_in.description
    if event_in.type is not None:
        event.type = event_in.type
    if event_in.venue is not None:
        event.venue = event_in.venue
    if event_in.start_datetime is not None:
        event.start_datetime = event_in.start_datetime
    if event_in.end_datetime is not None:
        event.end_datetime = event_in.end_datetime

    # Validate chronological ordering after applying updates
    effective_start = event.start_datetime
    effective_end = event.end_datetime
    if effective_end <= effective_start:
        raise HTTPException(status_code=400, detail="End datetime must be after start datetime")

    if event_in.registration_required is not None:
        event.registration_required = event_in.registration_required
    if event_in.attendance_required is not None:
        event.attendance_required = event_in.attendance_required
    if event_in.late_threshold_minutes is not None:
        event.late_threshold_minutes = event_in.late_threshold_minutes

    db.commit()
    db.refresh(event)
    return enrich_event_stats(event, db)

@router.post("/{id}/status/{new_status}", response_model=EventResponse, dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))])
def change_event_status(
    id: int,
    new_status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    event = db.query(Event).filter(Event.id == id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership guard: coordinators can only change their own events
    if current_user.role != UserRole.SUPER_ADMIN.value and event.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this event")

    target_status = new_status.upper()
    allowed = ALLOWED_TRANSITIONS.get(event.status, [])
    if target_status not in allowed and current_user.role != UserRole.SUPER_ADMIN.value:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition event from {event.status} to {target_status}. Allowed: {', '.join(allowed)}"
        )

    event.status = target_status
    db.commit()
    db.refresh(event)
    return enrich_event_stats(event, db)

@router.delete("/{id}", dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value]))])
def delete_event(id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Protect cryptographic audit chain: prevent hard deletion of events with audit logs
    audit_count = db.query(AttendanceAuditLog).filter(AttendanceAuditLog.event_id == id).count()
    if audit_count > 0:
        # Soft-delete: archive the event instead of destroying audit chain integrity
        event.status = EventStatus.ARCHIVED.value
        db.commit()
        return {
            "message": f"Event #{id} ({event.title}) has been archived (cannot hard-delete: {audit_count} audit log entries exist to preserve chain integrity)"
        }

    db.delete(event)
    db.commit()
    return {"message": f"Event #{id} ({event.title}) deleted successfully"}
