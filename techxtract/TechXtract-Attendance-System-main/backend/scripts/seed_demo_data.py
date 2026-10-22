import os
import sys
from datetime import datetime, timedelta

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.app.db.session import SessionLocal, Base, engine
from backend.app.models import User, UserRole, Event, EventStatus, Student, EventRegistration, Attendance, AttendanceAuditLog
from backend.app.core.security import get_password_hash
from backend.app.core.audit_chain import canonicalize_audit_payload, compute_record_hash, get_latest_audit_hash

def seed_system():
    print("=" * 60)
    print("TechX Attendance — Seeding Operational & Administrative Data")
    print("=" * 60)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # 1. Seed Administrative and Coordinator Users
    users_data = [
        {
            "email": "admin@techxtract.edu",
            "name": "Society Super Admin",
            "password": "Admin@12345",
            "role": UserRole.SUPER_ADMIN.value
        },
        {
            "email": "coordinator@techxtract.edu",
            "name": "Event Coordinator",
            "password": "Coord@12345",
            "role": UserRole.COORDINATOR.value
        },
        {
            "email": "vihaan@techxtract.edu",
            "name": "Vihaan Goyal (Tech Lead)",
            "password": "Coord@12345",
            "role": UserRole.COORDINATOR.value
        }
    ]

    admin_user = None
    coord_user = None

    for u in users_data:
        existing = db.query(User).filter(User.email == u["email"]).first()
        if not existing:
            user_obj = User(
                email=u["email"],
                name=u["name"],
                hashed_password=get_password_hash(u["password"]),
                role=u["role"],
                status="ACTIVE"
            )
            db.add(user_obj)
            db.flush()
            if u["role"] == UserRole.SUPER_ADMIN.value:
                admin_user = user_obj
            elif not coord_user:
                coord_user = user_obj
            print(f"Created user: {u['email']} [{u['role']}]")
        else:
            if u["role"] == UserRole.SUPER_ADMIN.value:
                admin_user = existing
            elif not coord_user:
                coord_user = existing
            print(f"User already exists: {u['email']}")

    db.commit()

    # 2. Seed Realistic Technical Society Events
    now = datetime.utcnow()
    events_data = [
        {
            "event_code": "EVT-2026-001",
            "title": "Cyber Security & Reverse Engineering Workshop",
            "description": "Hands-on vulnerability analysis, network packet sniffing, and secure binary reversing session.",
            "type": "WORKSHOP",
            "venue": "Seminar Hall 1, Block C",
            "start_datetime": now - timedelta(hours=1),
            "end_datetime": now + timedelta(hours=3),
            "registration_required": True,
            "attendance_required": True,
            "late_threshold_minutes": 20,
            "status": EventStatus.OPEN.value,
            "creator_id": admin_user.id
        },
        {
            "event_code": "EVT-2026-002",
            "title": "Web Development & Cloud Computing Bootcamp",
            "description": "Comprehensive full-stack deployment pipeline using Next.js, FastAPI, and Docker on cloud infrastructure.",
            "type": "BOOTCAMP",
            "venue": "Tech Lab 3, Ground Floor",
            "start_datetime": now + timedelta(days=2),
            "end_datetime": now + timedelta(days=2, hours=4),
            "registration_required": True,
            "attendance_required": True,
            "late_threshold_minutes": 15,
            "status": EventStatus.SCHEDULED.value,
            "creator_id": coord_user.id
        },
        {
            "event_code": "EVT-2026-003",
            "title": "TechX Annual Recruitment & Orientation Drive",
            "description": "Society orientation, domain overviews, problem statements, and initial round interviews.",
            "type": "RECRUITMENT",
            "venue": "Auditorium Main Stage",
            "start_datetime": now - timedelta(minutes=30),
            "end_datetime": now + timedelta(hours=4),
            "registration_required": False, # Open event
            "attendance_required": True,
            "late_threshold_minutes": 30,
            "status": EventStatus.OPEN.value,
            "creator_id": admin_user.id
        },
        {
            "event_code": "EVT-2026-004",
            "title": "Core Technical Team Sprint & Review",
            "description": "Sprint planning, architecture demo review, and infrastructure audit.",
            "type": "MEETING",
            "venue": "Innovation Cell Room 102",
            "start_datetime": now - timedelta(days=1),
            "end_datetime": now - timedelta(days=1, hours=-2),
            "registration_required": True,
            "attendance_required": True,
            "late_threshold_minutes": 10,
            "status": EventStatus.CLOSED.value,
            "creator_id": admin_user.id
        }
    ]

    seeded_events = {}
    for ed in events_data:
        existing = db.query(Event).filter(Event.event_code == ed["event_code"]).first()
        if not existing:
            ev = Event(
                event_code=ed["event_code"],
                title=ed["title"],
                description=ed["description"],
                type=ed["type"],
                venue=ed["venue"],
                start_datetime=ed["start_datetime"],
                end_datetime=ed["end_datetime"],
                registration_required=ed["registration_required"],
                attendance_required=ed["attendance_required"],
                late_threshold_minutes=ed["late_threshold_minutes"],
                status=ed["status"],
                created_by_id=ed["creator_id"]
            )
            db.add(ev)
            db.flush()
            seeded_events[ed["event_code"]] = ev
            print(f"Created event: {ed['event_code']} — {ed['title']} [{ed['status']}]")
        else:
            seeded_events[ed["event_code"]] = existing
            print(f"Event already exists: {ed['event_code']}")

    db.commit()

    # 3. Register students to events
    students = db.query(Student).limit(60).all()
    if students:
        event_1 = seeded_events.get("EVT-2026-001")
        event_4 = seeded_events.get("EVT-2026-004")

        reg_count = 0
        for s in students[:45]: # Register first 45 students to EVT-2026-001
            exists = db.query(EventRegistration).filter(
                EventRegistration.event_id == event_1.id,
                EventRegistration.student_id == s.id
            ).first()
            if not exists:
                reg = EventRegistration(
                    event_id=event_1.id,
                    student_id=s.id,
                    registered_at=now - timedelta(days=1),
                    registered_by_id=admin_user.id,
                    status="CONFIRMED"
                )
                db.add(reg)
                reg_count += 1

        for s in students[:20]: # Register first 20 students to EVT-2026-004
            exists = db.query(EventRegistration).filter(
                EventRegistration.event_id == event_4.id,
                EventRegistration.student_id == s.id
            ).first()
            if not exists:
                reg = EventRegistration(
                    event_id=event_4.id,
                    student_id=s.id,
                    registered_at=now - timedelta(days=2),
                    registered_by_id=admin_user.id,
                    status="CONFIRMED"
                )
                db.add(reg)

        db.commit()
        print(f"Registered {reg_count} students to {event_1.event_code}")

    db.close()
    print("=" * 60)
    print("SEEDING COMPLETE!")
    print("Default Super Admin: admin@techxtract.edu / Admin@12345")
    print("Default Coordinator: coordinator@techxtract.edu / Coord@12345")
    print("=" * 60)

if __name__ == "__main__":
    seed_system()
