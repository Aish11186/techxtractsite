from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field, ConfigDict

# ----------------- AUTH & USER -----------------
class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_id: int
    name: str
    email: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str = "COORDINATOR"
    status: str = "ACTIVE"

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ----------------- STUDENT -----------------
class StudentBase(BaseModel):
    enrollment_no: str
    name: str
    email: Optional[EmailStr] = None
    department: str
    year: str = "3rd Year"
    section: Optional[str] = "A"
    barcode_value: Optional[str] = None
    barcode_image_filename: Optional[str] = None
    status: str = "ACTIVE"

class StudentCreate(StudentBase):
    pass

class StudentUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    department: Optional[str] = None
    year: Optional[str] = None
    section: Optional[str] = None
    barcode_value: Optional[str] = None
    status: Optional[str] = None

class StudentResponse(StudentBase):
    id: int
    qr_token: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class StudentImportRow(BaseModel):
    enrollment_no: str
    name: str
    email: Optional[str] = None
    department: str
    year: Optional[str] = "3rd Year"
    section: Optional[str] = "A"
    barcode_value: Optional[str] = None

# ----------------- EVENT -----------------
class EventBase(BaseModel):
    event_code: str
    title: str
    description: Optional[str] = None
    type: str = "WORKSHOP" # WORKSHOP, BOOTCAMP, MEETING, RECRUITMENT, COMPETITION
    venue: str
    start_datetime: datetime
    end_datetime: datetime
    registration_required: bool = False
    attendance_required: bool = True
    late_threshold_minutes: int = 15

class EventCreate(EventBase):
    pass

class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    venue: Optional[str] = None
    start_datetime: Optional[datetime] = None
    end_datetime: Optional[datetime] = None
    registration_required: Optional[bool] = None
    attendance_required: Optional[bool] = None
    late_threshold_minutes: Optional[int] = None
    status: Optional[str] = None

class EventResponse(EventBase):
    id: int
    status: str
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    total_registered: Optional[int] = 0
    total_present: Optional[int] = 0
    total_late: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)

# ----------------- REGISTRATION -----------------
class RegistrationCreate(BaseModel):
    student_id: int

class BulkRegistrationCreate(BaseModel):
    student_ids: List[int]

class RegistrationResponse(BaseModel):
    id: int
    event_id: int
    student_id: int
    registered_at: datetime
    status: str
    student: Optional[StudentResponse] = None

    model_config = ConfigDict(from_attributes=True)

# ----------------- SCAN & ATTENDANCE -----------------
class ScanRequest(BaseModel):
    student_identifier: str = Field(..., description="Barcode decoded value, QR token, or enrollment number")
    scan_method: str = Field("BARCODE", description="BARCODE, QR, or MANUAL")
    device_id: Optional[str] = Field("scanner-01", description="Device / station identifier")

class StudentSummary(BaseModel):
    id: int
    name: str
    enrollment_no: str
    department: str
    year: str
    barcode_value: Optional[str] = None

class ScanResponse(BaseModel):
    status: str # SUCCESS, DUPLICATE, UNREGISTERED, INVALID_IDENTIFIER, EVENT_CLOSED, UNAUTHORIZED, SERVER_ERROR
    message: str
    student: Optional[StudentSummary] = None
    attendance_status: Optional[str] = None # PRESENT, LATE, etc.
    marked_at: Optional[datetime] = None
    scan_id: Optional[int] = None
    event_stats: Optional[Dict[str, int]] = None

class AttendanceCorrectionRequest(BaseModel):
    new_status: str # PRESENT, LATE, EXCUSED, ABSENT
    reason: str = Field(..., min_length=3, description="Mandatory audit explanation for the correction")

class AttendanceResponse(BaseModel):
    id: int
    event_id: int
    student_id: int
    status: str
    marked_at: datetime
    marked_by_id: int
    scan_method: str
    device_id: Optional[str] = None
    created_at: datetime
    student: Optional[StudentSummary] = None

    model_config = ConfigDict(from_attributes=True)

# ----------------- AUDIT & REPORTS -----------------
class AuditLogResponse(BaseModel):
    id: int
    attendance_id: Optional[int] = None
    event_id: int
    student_id: int
    action: str
    timestamp: datetime
    performed_by_name: Optional[str] = None
    metadata_json: str
    previous_hash: str
    record_hash: str

    model_config = ConfigDict(from_attributes=True)

class AuditVerifyResponse(BaseModel):
    verified: bool
    total_records: int
    message: str
    broken_record_id: Optional[int] = None
    checked_records: Optional[int] = None
    reason: Optional[str] = None

class EventReport(BaseModel):
    event_id: int
    event_code: str
    title: str
    status: str
    venue: str
    start_datetime: datetime
    total_registered: int
    total_present: int
    total_late: int
    total_excused: int
    total_absent: int
    attendance_percentage: float

class StudentReport(BaseModel):
    student_id: int
    enrollment_no: str
    name: str
    department: str
    year: str
    registered_events: int
    attended_events: int
    late_events: int
    absent_events: int
    attendance_percentage: float

class SocietyReport(BaseModel):
    total_students: int
    total_events: int
    total_attendance_volume: int
    average_attendance_percentage: float
    active_events_count: int
