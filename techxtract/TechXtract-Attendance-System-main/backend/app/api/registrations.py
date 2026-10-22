from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError

from backend.app.db.session import get_db
from backend.app.models import Event, Student, EventRegistration, User, UserRole
from backend.app.schemas import RegistrationResponse, RegistrationCreate, BulkRegistrationCreate, StudentResponse
from backend.app.core.security import get_current_user, require_roles

router = APIRouter(prefix="/events", tags=["Registrations"])

@router.get("/{event_id}/registrations", response_model=List[RegistrationResponse])
def get_event_registrations(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    regs = (
        db.query(EventRegistration)
        .options(joinedload(EventRegistration.student))
        .filter(EventRegistration.event_id == event_id)
        .order_by(EventRegistration.registered_at.desc())
        .all()
    )
    result = []
    for r in regs:
        st = r.student
        res = RegistrationResponse(
            id=r.id,
            event_id=r.event_id,
            student_id=r.student_id,
            registered_at=r.registered_at,
            status=r.status,
            student=StudentResponse.from_orm(st) if st else None
        )
        result.append(res)
    return result

@router.post("/{event_id}/registrations", response_model=RegistrationResponse, dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))])
def register_student(
    event_id: int,
    reg_in: RegistrationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    student = db.query(Student).filter(Student.id == reg_in.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    existing = (
        db.query(EventRegistration)
        .filter(
            EventRegistration.event_id == event_id,
            EventRegistration.student_id == student.id
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"Student {student.name} is already registered for this event")

    try:
        new_reg = EventRegistration(
            event_id=event_id,
            student_id=student.id,
            registered_at=datetime.utcnow(),
            registered_by_id=current_user.id,
            status="CONFIRMED"
        )
        db.add(new_reg)
        db.commit()
        db.refresh(new_reg)
        return RegistrationResponse(
            id=new_reg.id,
            event_id=new_reg.event_id,
            student_id=new_reg.student_id,
            registered_at=new_reg.registered_at,
            status=new_reg.status,
            student=StudentResponse.from_orm(student)
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Student is already registered (concurrent request)")

@router.post("/{event_id}/registrations/bulk", response_model=dict, dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))])
def bulk_register_students(
    event_id: int,
    bulk_in: BulkRegistrationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    added = 0
    skipped = 0
    # Deduplicate student IDs to prevent redundant DB queries and potential constraint violations
    unique_student_ids = list(dict.fromkeys(bulk_in.student_ids))
    for sid in unique_student_ids:
        exists = db.query(EventRegistration).filter(
            EventRegistration.event_id == event_id,
            EventRegistration.student_id == sid
        ).first()
        if exists:
            skipped += 1
            continue

        st = db.query(Student).filter(Student.id == sid).first()
        if not st:
            skipped += 1
            continue

        r = EventRegistration(
            event_id=event_id,
            student_id=sid,
            registered_at=datetime.utcnow(),
            registered_by_id=current_user.id,
            status="CONFIRMED"
        )
        db.add(r)
        added += 1

    db.commit()
    return {
        "event_id": event_id,
        "successfully_registered": added,
        "already_registered_or_invalid": skipped
    }

@router.delete("/{event_id}/registrations/{student_id}", dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))])
def remove_registration(
    event_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    reg = db.query(EventRegistration).filter(
        EventRegistration.event_id == event_id,
        EventRegistration.student_id == student_id
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")

    db.delete(reg)
    db.commit()
    return {"message": "Registration cancelled successfully"}
