import os
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.db.session import SessionLocal
from backend.app.models import Event, Student, Attendance, EventRegistration
from backend.app.services.barcode_decoder import decode_code128_image

client = TestClient(app)

def test_real_barcode_end_to_end_scanning():
    app.dependency_overrides.clear()
    # 1. Login as coordinator
    login_res = client.post("/api/auth/login", json={"email": "coordinator@techxtract.edu", "password": "Coord@12345"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    import uuid
    from datetime import datetime, timedelta

    db = SessionLocal()
    # Create a dedicated fresh open event for this E2E test run
    event_code = f"EVT-E2E-{uuid.uuid4().hex[:6].upper()}"
    coord = db.query(Event).first().created_by_id
    event = Event(
        event_code=event_code,
        title="Real Barcode E2E Validation Event",
        type="WORKSHOP",
        venue="Robotics Lab",
        start_datetime=datetime.utcnow() - timedelta(minutes=5),
        end_datetime=datetime.utcnow() + timedelta(hours=2),
        registration_required=True,
        attendance_required=True,
        late_threshold_minutes=30,
        status="OPEN",
        created_by_id=coord
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    event_id = event.id

    # 2. Pick representative real barcode GIF files from different categories
    barcode_folder = next(
        (cand for cand in ["barcodes real", "barcodes", "barcodes copy", "barcode copy"] if os.path.exists(cand)),
        "barcodes"
    )
    test_barcodes = [
        (f"{barcode_folder}/7_TXT_TH_017_Vihaan_Goyal.gif", "Vihaan Goyal"),
        (f"{barcode_folder}/1_TXT_PRESIDENT_HITESH_TYAGI.gif", "Hitesh Tyagi"),
        (f"{barcode_folder}/4_TXT_VICE_PRESIDENT_Yaniya.gif", "Yaniya"),
        (f"{barcode_folder}/10_TXT_GP_011_Parth_Agarwal.gif", "Parth Agarwal"),
        (f"{barcode_folder}/10_TXT_OT_0015_Gaurisha_Bhatia.gif", "Gaurisha Bhatia"),
    ]

    for gif_path, expected_name in test_barcodes:
        # A. Decode actual raster barcode
        decoded_val, err = decode_code128_image(gif_path)
        assert err is None
        assert decoded_val is not None

        # B. Verify student exists in DB
        student = db.query(Student).filter(Student.barcode_value == decoded_val).first()
        assert student is not None, f"Student with barcode {decoded_val} not in DB"
        assert expected_name.lower() in student.name.lower()

        # Ensure registered
        is_reg = db.query(EventRegistration).filter(
            EventRegistration.event_id == event_id,
            EventRegistration.student_id == student.id
        ).first()
        if not is_reg:
            db.add(EventRegistration(event_id=event_id, student_id=student.id, status="CONFIRMED"))
            db.commit()

        # C. First scan -> MUST BE SUCCESS
        scan_payload = {
            "student_identifier": decoded_val,
            "scan_method": "BARCODE",
            "device_id": "usb-scanner-station-01"
        }
        res1 = client.post(f"/api/events/{event_id}/attendance/scan", json=scan_payload, headers=headers)
        assert res1.status_code == 200
        data1 = res1.json()
        assert data1["status"] == "SUCCESS"
        assert data1["student"]["name"].lower() == student.name.lower()
        assert data1["attendance_status"] in ["PRESENT", "LATE"]

        # D. Immediate re-scan -> MUST BE DUPLICATE
        res2 = client.post(f"/api/events/{event_id}/attendance/scan", json=scan_payload, headers=headers)
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["status"] == "DUPLICATE"
        assert "already recorded" in data2["message"].lower()

    # E. Check cryptographic audit log verification
    verify_res = client.get("/api/audit/verify", headers=headers)
    assert verify_res.status_code == 200
    assert verify_res.json()["verified"] is True
    assert verify_res.json()["total_records"] >= len(test_barcodes)

    db.close()

def test_scan_image_dark_mode_screenshot():
    import io
    from PIL import Image
    from datetime import datetime, timedelta

    app.dependency_overrides.clear()
    login_res = client.post("/api/auth/login", json={"email": "coordinator@techxtract.edu", "password": "Coord@12345"})
    assert login_res.status_code == 200
    headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    db = SessionLocal()
    import uuid
    coord = db.query(Event).first().created_by_id
    event = Event(
        event_code=f"EVT-SCREENSHOT-{uuid.uuid4().hex[:6].upper()}",
        title="Screenshot Test Event",
        type="WORKSHOP",
        venue="Main Hall",
        start_datetime=datetime.utcnow() - timedelta(minutes=5),
        end_datetime=datetime.utcnow() + timedelta(hours=2),
        registration_required=False,
        attendance_required=True,
        status="OPEN",
        created_by_id=coord
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    # Simulate dark mode mobile screenshot (1080x2400 black background with centered barcode)
    bg = Image.new('RGB', (1080, 2400), (18, 18, 24))
    barcode = Image.open('barcodes/1_TXT_GNRL_SECR_Sachin_Gautam.gif')
    bg.paste(barcode, ((1080 - barcode.width) // 2, (2400 - barcode.height) // 2))

    buf = io.BytesIO()
    bg.save(buf, format='PNG')
    buf.seek(0)

    # Post to /api/events/{event.id}/attendance/scan-image
    res = client.post(
        f"/api/events/{event.id}/attendance/scan-image",
        files={"file": ("screenshot.png", buf, "image/png")},
        headers=headers
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "SUCCESS"
    assert "Sachin Gautam" in data["student"]["name"]
    assert data["student"]["barcode_value"] == "TXT_GNRL_SECR_Sachin_Gautam"

    db.close()
