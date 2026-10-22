import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from backend.app.db.session import get_db
from backend.app.models import Student, User, UserRole, Attendance, Event
from backend.app.schemas import StudentResponse, StudentCreate, StudentUpdate
from backend.app.core.security import get_current_user, require_roles

router = APIRouter(prefix="/students", tags=["Students"])

@router.get("", response_model=dict)
def list_students(
    search: Optional[str] = None,
    department: Optional[str] = None,
    year: Optional[str] = None,
    section: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Student)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Student.name.ilike(s),
                Student.enrollment_no.ilike(s),
                Student.barcode_value.ilike(s),
                Student.email.ilike(s)
            )
        )
    if department:
        query = query.filter(Student.department == department)
    if year:
        query = query.filter(Student.year == year)
    if section:
        query = query.filter(Student.section == section)
    if status:
        query = query.filter(Student.status == status)

    total = query.count()
    items = query.order_by(Student.enrollment_no.asc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit if total > 0 else 1,
        "items": [StudentResponse.from_orm(item) for item in items]
    }

@router.get("/departments", response_model=List[str])
def get_unique_departments(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    results = db.query(Student.department).distinct().all()
    return sorted([r[0] for r in results if r[0]])

@router.get("/{id}", response_model=dict)
def get_student(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    student = db.query(Student).filter(Student.id == id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Fetch attendance history with eagerly-loaded event data (avoids N+1 queries)
    history = (
        db.query(Attendance)
        .options(joinedload(Attendance.event))
        .filter(Attendance.student_id == student.id)
        .order_by(Attendance.marked_at.desc())
        .all()
    )

    history_list = []
    for att in history:
        ev = att.event
        history_list.append({
            "attendance_id": att.id,
            "event_id": att.event_id,
            "event_title": ev.title if ev else "Unknown Event",
            "event_code": ev.event_code if ev else "",
            "status": att.status,
            "marked_at": att.marked_at,
            "scan_method": att.scan_method
        })

    return {
        "student": StudentResponse.from_orm(student),
        "attendance_history": history_list,
        "total_attended": len(history_list)
    }

@router.post("", response_model=StudentResponse, dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))])
def create_student(
    student_in: StudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify uniqueness of enrollment_no
    existing_enroll = db.query(Student).filter(Student.enrollment_no == student_in.enrollment_no).first()
    if existing_enroll:
        raise HTTPException(status_code=400, detail=f"Student with enrollment #{student_in.enrollment_no} already exists")

    # Verify barcode uniqueness if provided
    if student_in.barcode_value:
        existing_barcode = db.query(Student).filter(Student.barcode_value == student_in.barcode_value).first()
        if existing_barcode:
            raise HTTPException(status_code=400, detail=f"Barcode value '{student_in.barcode_value}' is already assigned to {existing_barcode.name}")

    # Verify email uniqueness if provided
    if student_in.email:
        existing_email = db.query(Student).filter(Student.email == student_in.email.strip().lower()).first()
        if existing_email:
            raise HTTPException(status_code=400, detail=f"Email '{student_in.email}' is already registered to {existing_email.name} ({existing_email.enrollment_no})")

    qr_token = f"STU-{uuid.uuid4().hex[:12].upper()}"

    new_student = Student(
        enrollment_no=student_in.enrollment_no.strip(),
        name=student_in.name.strip(),
        email=student_in.email.strip().lower() if student_in.email else None,
        department=student_in.department.strip(),
        year=student_in.year.strip(),
        section=student_in.section.strip() if student_in.section else "A",
        barcode_value=student_in.barcode_value.strip() if student_in.barcode_value else None,
        qr_token=qr_token,
        barcode_image_filename=student_in.barcode_image_filename,
        status="ACTIVE"
    )
    db.add(new_student)
    db.commit()
    db.refresh(new_student)
    return new_student

@router.patch("/{id}", response_model=StudentResponse, dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))])
def update_student(
    id: int,
    student_in: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    student = db.query(Student).filter(Student.id == id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if student_in.barcode_value and student_in.barcode_value != student.barcode_value:
        existing = db.query(Student).filter(Student.barcode_value == student_in.barcode_value, Student.id != id).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Barcode value '{student_in.barcode_value}' is already assigned to {existing.name}")
        student.barcode_value = student_in.barcode_value

    if student_in.name is not None:
        student.name = student_in.name
    if student_in.email is not None:
        norm_email = student_in.email.strip().lower() if student_in.email.strip() else None
        # Verify email uniqueness on update
        if norm_email and norm_email != (student.email or "").lower():
            existing_email = db.query(Student).filter(Student.email == norm_email, Student.id != id).first()
            if existing_email:
                raise HTTPException(status_code=400, detail=f"Email '{norm_email}' is already registered to {existing_email.name} ({existing_email.enrollment_no})")
        student.email = norm_email
    if student_in.department is not None:
        student.department = student_in.department
    if student_in.year is not None:
        student.year = student_in.year
    if student_in.section is not None:
        student.section = student_in.section
    if student_in.status is not None:
        student.status = student_in.status

    db.commit()
    db.refresh(student)
    return student

@router.post("/import", response_model=dict, dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value]))])
async def import_students_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Import students from CSV file.
    Expected CSV columns: enrollment_no, name, email, department, year, section, barcode_value
    """
    import csv
    import io

    content = await file.read()
    try:
        decoded = content.decode("utf-8")
    except Exception:
        decoded = content.decode("latin1")

    reader = csv.DictReader(io.StringIO(decoded))
    
    total = 0
    added = 0
    skipped_duplicates = 0
    errors = []

    for idx, row in enumerate(reader, start=2): # line 1 is header
        total += 1
        enroll = row.get("enrollment_no", "").strip()
        name = row.get("name", "").strip()
        dept = row.get("department", "Technical Team").strip()
        year = row.get("year", "3rd Year").strip()
        sec = row.get("section", "A").strip()
        email = row.get("email", "").strip() or None
        barcode_val = row.get("barcode_value", "").strip() or None

        if not enroll or not name:
            errors.append(f"Row #{idx}: Missing enrollment_no or name")
            continue

        existing_enroll = db.query(Student).filter(Student.enrollment_no == enroll).first()
        if existing_enroll:
            skipped_duplicates += 1
            continue

        if barcode_val:
            existing_b = db.query(Student).filter(Student.barcode_value == barcode_val).first()
            if existing_b:
                errors.append(f"Row #{idx}: Barcode {barcode_val} already exists for {existing_b.name}")
                continue

        qr_token = f"STU-{uuid.uuid4().hex[:12].upper()}"
        new_s = Student(
            enrollment_no=enroll,
            name=name,
            email=email,
            department=dept,
            year=year,
            section=sec,
            barcode_value=barcode_val,
            qr_token=qr_token,
            status="ACTIVE"
        )
        db.add(new_s)
        added += 1

    db.commit()
    return {
        "total_rows": total,
        "successfully_added": added,
        "skipped_duplicates": skipped_duplicates,
        "errors_count": len(errors),
        "errors": errors[:20] # Preview top 20 errors
    }
