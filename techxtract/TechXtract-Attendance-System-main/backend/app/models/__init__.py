import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from backend.app.db.session import Base

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    COORDINATOR = "COORDINATOR"
    STUDENT = "STUDENT"

class EventStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"
    ARCHIVED = "ARCHIVED"

class AttendanceStatus(str, enum.Enum):
    PRESENT = "PRESENT"
    LATE = "LATE"
    EXCUSED = "EXCUSED"
    ABSENT = "ABSENT"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default=UserRole.COORDINATOR.value, nullable=False)
    status = Column(String(50), default="ACTIVE", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    created_events = relationship("Event", back_populates="creator")

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    enrollment_no = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(255), index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=True)
    department = Column(String(100), index=True, nullable=False)
    year = Column(String(50), nullable=False, default="3rd Year")
    section = Column(String(50), nullable=True, default="A")
    barcode_value = Column(String(255), unique=True, index=True, nullable=True)
    qr_token = Column(String(255), unique=True, index=True, nullable=False)
    barcode_image_filename = Column(String(255), nullable=True)
    status = Column(String(50), default="ACTIVE", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    registrations = relationship("EventRegistration", back_populates="student", cascade="all, delete-orphan")
    attendances = relationship("Attendance", back_populates="student", cascade="all, delete-orphan")

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_code = Column(String(100), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    type = Column(String(100), nullable=False, default="WORKSHOP") # WORKSHOP, BOOTCAMP, MEETING, RECRUITMENT, COMPETITION
    venue = Column(String(255), nullable=False)
    start_datetime = Column(DateTime, nullable=False, index=True)
    end_datetime = Column(DateTime, nullable=False)
    registration_required = Column(Boolean, default=False, nullable=False)
    attendance_required = Column(Boolean, default=True, nullable=False)
    late_threshold_minutes = Column(Integer, default=15, nullable=False)
    status = Column(String(50), default=EventStatus.DRAFT.value, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    creator = relationship("User", back_populates="created_events")
    registrations = relationship("EventRegistration", back_populates="event", cascade="all, delete-orphan")
    attendances = relationship("Attendance", back_populates="event", cascade="all, delete-orphan")
    audit_logs = relationship("AttendanceAuditLog", back_populates="event", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_events_start_datetime", "start_datetime"),
        Index("idx_events_status", "status"),
    )

class EventRegistration(Base):
    __tablename__ = "event_registrations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    registered_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    registered_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(50), default="CONFIRMED", nullable=False)

    event = relationship("Event", back_populates="registrations")
    student = relationship("Student", back_populates="registrations")

    __table_args__ = (
        UniqueConstraint("event_id", "student_id", name="uq_event_registration"),
        Index("idx_registration_event_student", "event_id", "student_id"),
    )

class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(50), default=AttendanceStatus.PRESENT.value, nullable=False)
    marked_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    marked_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    scan_method = Column(String(50), default="BARCODE", nullable=False) # BARCODE, QR, MANUAL
    device_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    event = relationship("Event", back_populates="attendances")
    student = relationship("Student", back_populates="attendances")
    marker = relationship("User")
    audit_logs = relationship("AttendanceAuditLog", back_populates="attendance", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("event_id", "student_id", name="uq_event_attendance"),
        Index("idx_attendance_event", "event_id"),
        Index("idx_attendance_student", "student_id"),
        Index("idx_attendance_marked_at", "marked_at"),
    )

class AttendanceAuditLog(Base):
    __tablename__ = "attendance_audit_log"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    attendance_id = Column(Integer, ForeignKey("attendance.id", ondelete="SET NULL"), nullable=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(50), nullable=False) # SCAN_RECORDED, CORRECTION, MANUAL_ENTRY, STATUS_CHANGE
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    performed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    performed_by_name = Column(String(255), nullable=True)
    metadata_json = Column(Text, nullable=False, default="{}")
    previous_hash = Column(String(64), nullable=False)
    record_hash = Column(String(64), nullable=False)

    attendance = relationship("Attendance", back_populates="audit_logs")
    event = relationship("Event", back_populates="audit_logs")
    student = relationship("Student")
    actor = relationship("User")

    __table_args__ = (
        Index("idx_audit_event", "event_id"),
        Index("idx_audit_student", "student_id"),
        Index("idx_audit_timestamp", "timestamp"),
    )
