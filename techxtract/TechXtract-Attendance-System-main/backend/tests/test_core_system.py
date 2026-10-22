import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.main import app
from backend.app.db.session import Base, get_db
from backend.app.core.config import settings
from backend.app.models import User, UserRole, Student, Event, EventStatus, EventRegistration, Attendance, AttendanceAuditLog
from backend.app.core.security import get_password_hash
from backend.app.core.audit_chain import verify_audit_chain

from sqlalchemy.pool import StaticPool

# Test database setup (in-memory sqlite with StaticPool to retain tables across threads)
TEST_DATABASE_URL = "sqlite:///:memory:"
engine_test = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

client = TestClient(app)

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine_test)
    db = TestingSessionLocal()

    # Create admin
    admin = User(
        email="admin@test.edu",
        name="Test Admin",
        hashed_password=get_password_hash("Admin123"),
        role=UserRole.SUPER_ADMIN.value,
        status="ACTIVE"
    )
    # Create coordinator
    coord = User(
        email="coord@test.edu",
        name="Test Coordinator",
        hashed_password=get_password_hash("Coord123"),
        role=UserRole.COORDINATOR.value,
        status="ACTIVE"
    )
    db.add_all([admin, coord])
    db.flush()

    # Create students
    s1 = Student(
        enrollment_no="14114899001",
        name="Vihaan Goyal",
        email="vihaan@test.edu",
        department="Technical Team",
        year="3rd Year",
        barcode_value="TXT_TH_017_Vihaan_Goyal",
        qr_token="STU-TEST-001",
        status="ACTIVE"
    )
    s2 = Student(
        enrollment_no="14114899002",
        name="Hitesh Tyagi",
        email="hitesh@test.edu",
        department="Executive Board",
        year="4th Year",
        barcode_value="TXT_PRESIDENT_HITESH_TYAGI",
        qr_token="STU-TEST-002",
        status="ACTIVE"
    )
    s3 = Student(
        enrollment_no="14114899003",
        name="Unregistered Student",
        email="unreg@test.edu",
        department="Operations Team",
        year="2nd Year",
        barcode_value="TXT_OT_999_Unregistered",
        qr_token="STU-TEST-003",
        status="ACTIVE"
    )
    db.add_all([s1, s2, s3])
    db.flush()

    # Create open event with registration required
    now = datetime.utcnow()
    ev_open = Event(
        event_code="EVT-TEST-OPEN",
        title="Open Workshop",
        type="WORKSHOP",
        venue="Lab 1",
        start_datetime=now - timedelta(minutes=10),
        end_datetime=now + timedelta(hours=2),
        registration_required=True,
        attendance_required=True,
        late_threshold_minutes=30,
        status=EventStatus.OPEN.value,
        created_by_id=admin.id
    )
    # Create closed event
    ev_closed = Event(
        event_code="EVT-TEST-CLOSED",
        title="Closed Workshop",
        type="WORKSHOP",
        venue="Lab 2",
        start_datetime=now - timedelta(days=1),
        end_datetime=now - timedelta(days=1, hours=-2),
        registration_required=True,
        attendance_required=True,
        late_threshold_minutes=15,
        status=EventStatus.CLOSED.value,
        created_by_id=admin.id
    )
    db.add_all([ev_open, ev_closed])
    db.flush()

    # Register s1 to ev_open and ev_closed
    reg1 = EventRegistration(
        event_id=ev_open.id,
        student_id=s1.id,
        registered_at=now,
        status="CONFIRMED"
    )
    reg2 = EventRegistration(
        event_id=ev_closed.id,
        student_id=s1.id,
        registered_at=now,
        status="CONFIRMED"
    )
    db.add_all([reg1, reg2])
    db.commit()
    db.close()
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine_test)

def test_login_and_auth():
    # Valid login
    res = client.post("/api/auth/login", json={"email": "admin@test.edu", "password": "Admin123"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["role"] == "SUPER_ADMIN"

    # Invalid login
    res_bad = client.post("/api/auth/login", json={"email": "admin@test.edu", "password": "WrongPassword"})
    assert res_bad.status_code == 401

def test_scan_flow_and_duplicate_prevention():
    # Login as coordinator
    login_res = client.post("/api/auth/login", json={"email": "coord@test.edu", "password": "Coord123"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    db = TestingSessionLocal()
    ev = db.query(Event).filter(Event.event_code == "EVT-TEST-OPEN").first()
    db.close()

    # 1. Valid scan for registered student
    scan_payload = {
        "student_identifier": "TXT_TH_017_Vihaan_Goyal",
        "scan_method": "BARCODE",
        "device_id": "scanner-usb-01"
    }
    res = client.post(f"/api/events/{ev.id}/attendance/scan", json=scan_payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "SUCCESS"
    assert data["attendance_status"] == "PRESENT"
    assert data["student"]["name"] == "Vihaan Goyal"

    # 2. Duplicate scan -> MUST REJECT
    res_dup = client.post(f"/api/events/{ev.id}/attendance/scan", json=scan_payload, headers=headers)
    assert res_dup.status_code == 200
    data_dup = res_dup.json()
    assert data_dup["status"] == "DUPLICATE"
    assert "already recorded" in data_dup["message"].lower()

    # 3. Student scan without pre-registration -> MUST SUCCEED (no pre-registration required)
    unreg_payload = {
        "student_identifier": "TXT_OT_999_Unregistered",
        "scan_method": "BARCODE",
        "device_id": "scanner-usb-01"
    }
    res_unreg = client.post(f"/api/events/{ev.id}/attendance/scan", json=unreg_payload, headers=headers)
    assert res_unreg.status_code == 200
    data_unreg = res_unreg.json()
    assert data_unreg["status"] == "SUCCESS"
    assert data_unreg["attendance_status"] == "PRESENT"
    assert data_unreg["student"]["name"] == "Unregistered Student"

    # 4. Unknown barcode -> MUST REJECT
    bad_payload = {
        "student_identifier": "NON_EXISTENT_BARCODE_XYZ",
        "scan_method": "BARCODE",
        "device_id": "scanner-usb-01"
    }
    res_bad = client.post(f"/api/events/{ev.id}/attendance/scan", json=bad_payload, headers=headers)
    assert res_bad.status_code == 200
    data_bad = res_bad.json()
    assert data_bad["status"] == "INVALID_IDENTIFIER"

def test_closed_event_rejection():
    login_res = client.post("/api/auth/login", json={"email": "coord@test.edu", "password": "Coord123"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    db = TestingSessionLocal()
    ev_closed = db.query(Event).filter(Event.event_code == "EVT-TEST-CLOSED").first()
    db.close()

    scan_payload = {
        "student_identifier": "TXT_TH_017_Vihaan_Goyal",
        "scan_method": "BARCODE",
        "device_id": "scanner-01"
    }
    res = client.post(f"/api/events/{ev_closed.id}/attendance/scan", json=scan_payload, headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "EVENT_CLOSED"

def test_attendance_correction_and_audit_hash_chain():
    login_res = client.post("/api/auth/login", json={"email": "admin@test.edu", "password": "Admin123"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    db = TestingSessionLocal()
    att = db.query(Attendance).first()
    assert att is not None
    att_id = att.id
    db.close()

    # Perform controlled correction
    corr_payload = {
        "new_status": "EXCUSED",
        "reason": "Student attended conference session desk instead"
    }
    corr_res = client.post(f"/api/attendance/{att_id}/correction", json=corr_payload, headers=headers)
    assert corr_res.status_code == 200
    assert corr_res.json()["status"] == "EXCUSED"

    # Verify audit hash chain integrity
    verify_res = client.get("/api/audit/verify", headers=headers)
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert verify_data["verified"] is True
    assert verify_data["total_records"] >= 2 # 1 scan + 1 correction

def test_audit_chain_tamper_detection():
    login_res = client.post("/api/auth/login", json={"email": "admin@test.edu", "password": "Admin123"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Deliberately modify an existing audit record's metadata behind the scenes
    db = TestingSessionLocal()
    first_log = db.query(AttendanceAuditLog).first()
    assert first_log is not None
    original_meta = first_log.metadata_json
    first_log.metadata_json = '{"tampered": true}'
    db.commit()

    # Integrity verification must now FAIL and pinpoint the exact tampered record!
    verify_fail = client.get("/api/audit/verify", headers=headers)
    assert verify_fail.status_code == 200
    data = verify_fail.json()
    assert data["verified"] is False
    assert data["broken_record_id"] == first_log.id
    assert "tampered" in data["reason"].lower() or "mismatch" in data["reason"].lower()

    # Restore to clean state
    first_log.metadata_json = original_meta
    db.commit()
    db.close()

def test_csv_export():
    login_res = client.post("/api/auth/login", json={"email": "admin@test.edu", "password": "Admin123"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    db = TestingSessionLocal()
    ev = db.query(Event).filter(Event.event_code == "EVT-TEST-OPEN").first()
    db.close()

    res = client.get(f"/api/reports/event/{ev.id}/export/csv", headers=headers)
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    content = res.text
    assert "Enrollment No,Name,Department" in content
    assert "Vihaan Goyal" in content
