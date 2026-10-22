# TechX Attendance & Society Event Management System

An enterprise-grade, authoritative Society Event & Attendance Management System engineered for college technical societies (TechXtract). Built with **FastAPI**, **Next.js**, **PostgreSQL / SQLite**, and **Tailwind CSS**, featuring high-throughput physical USB barcode and QR camera scanning, race-condition duplicate prevention, append-only cryptographic **SHA-256 hash chaining**, controlled auditable corrections, live attendance dashboards, and RFC-4180 CSV exports.

---

## 1. Overview & Core Architecture

The system replaces manual spreadsheets and unverified check-ins with an authoritative server-side architecture. It integrates an authentic dataset of 114 pre-existing member Code 128 barcodes, decoding the actual encoded symbology rather than guessing based on filenames.

### Primary Roles
- **Super Admin**: Manage students, import master records, create and lifecycle-manage events, manage coordinators, perform controlled auditable corrections, view and export society reports, inspect and cryptographically verify the audit hash chain.
- **Event Coordinator**: Access permitted events, manage registrations, control attendance windows, operate the high-throughput scanner terminal, and export event attendance reports.
- **Student**: View verified profile, registered events, personal attendance history, and associated barcode asset.

### Key Architectural Tenets
1. **Backend is Authoritative**: The frontend never determines eligibility, registration status, duplicate status, or attendance validity. Every single scan is validated atomically on the server.
2. **Database-Level Uniqueness**: Concurrency race conditions (e.g., two scanners scanning the same barcode simultaneously) are blocked by database-level `UNIQUE(event_id, student_id)` constraints.
3. **Cryptographic SHA-256 Audit Log**: Every scan, correction, or status change writes to an append-only audit log where `record_hash = SHA256(canonical_payload + previous_hash)`. Any tampering or record omission invalidates the entire chain, detectable via the `/api/audit/verify` verification engine.
4. **Physical USB Scanner Optimization**: Input remains continuously auto-focused with immediate keyboard/Enter dispatch, instant audio feedback (synthesized Web Audio chimes), and semantic color cues (green/amber/red).

---

## 2. Technology Stack

- **Backend**: Python 3.9+, FastAPI, SQLAlchemy, Pydantic v2, Pillow (barcode raster engine), Passlib/Bcrypt, PyJWT, WebSockets.
- **Frontend**: Next.js 16 (React 19, App Router, TypeScript), Tailwind CSS, Lucide Icons, Web Audio API, `@zxing/browser` (camera QR fallback).
- **Database**: PostgreSQL (Supabase production ready) / SQLite (zero-dependency local development).
- **Symbology**: Code 128 (Subsets B & C) with dynamic code switching and modulo-103 checksum validation.

---

## 3. Repository & Folder Structure

```
techXAttendance/
├── .env.example                     # Unified environment template
├── techx_attendance.db              # SQLite development database (pre-seeded)
├── barcodes/                        # 114 canonical society member Code 128 GIF files
│   ├── 7_TXT_TH_017_Vihaan_Goyal.gif
│   ├── 1_TXT_PRESIDENT_HITESH_TYAGI.gif
│   └── ...
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI application entry & static routes
│   │   ├── core/
│   │   │   ├── config.py            # App settings (Pydantic Settings)
│   │   │   ├── security.py          # Bcrypt hashing & JWT token handling
│   │   │   ├── dependencies.py      # Auth & RBAC dependencies
│   │   │   └── audit_chain.py       # SHA-256 cryptographic audit chaining engine
│   │   ├── db/
│   │   │   └── session.py           # SQLAlchemy engine & session factory
│   │   ├── models/                  # Relational models (users, students, events, attendances, audit)
│   │   ├── schemas/                 # Pydantic validation schemas
│   │   ├── services/
│   │   │   ├── barcode_decoder.py   # Pure Python Code 128 raster decoder
│   │   │   └── attendance_service.py # 14-step authoritative scan workflow
│   │   └── api/
│   │       ├── auth.py              # Login & current user profile
│   │       ├── students.py          # Student CRUD, search, pagination, CSV import
│   │       ├── events.py            # Event CRUD & lifecycle transitions
│   │       ├── registrations.py     # Student registration & bulk registration
│   │       ├── scan.py              # High-throughput attendance scan endpoint
│   │       ├── attendance.py        # Attendance records & controlled corrections
│   │       ├── reports.py           # Society, event, student metrics & RFC-4180 CSV export
│   │       ├── audit.py             # Audit inspection & hash-chain verification
│   │       └── websocket.py         # Real-time WebSocket broadcasting
│   ├── scripts/
│   │   ├── import_barcodes.py       # Programmatic barcode decoder & student importer
│   │   └── seed_demo_data.py        # Realistic society events & registrations seeder
│   └── tests/
│       ├── test_core_system.py      # Core unit & integration test suite (6 tests)
│       └── test_real_barcodes_e2e.py# End-to-end test with real physical .gif barcode files
└── frontend/
    ├── package.json
    ├── src/
    │   ├── app/
    │   │   ├── login/               # Secure terminal authentication
    │   │   ├── dashboard/           # Society attendance overview & metrics
    │   │   ├── events/              # Event management & creation
    │   │   │   ├── [id]/            # Event detail, attendance table, registrations
    │   │   │   └── [id]/scanner/    # High-throughput USB & Camera scanner terminal
    │   │   ├── students/            # Student master registry & barcode visualizer
    │   │   ├── reports/             # Turnout metrics & CSV export center
    │   │   └── audit/               # Cryptographic audit hash chain inspector
    │   ├── components/
    │   │   ├── scanner/             # ScannerTerminal with focus lock & audio feedback
    │   │   ├── shell/               # Sidebar & Context Header
    │   │   └── correction-modal.tsx # Auditable attendance correction dialog
    │   ├── lib/
    │   │   ├── api.ts               # Type-safe API client
    │   │   ├── auth-context.tsx     # Session management & RBAC guards
    │   │   └── sound.ts             # Web Audio procedural sound synth
    │   └── types/                   # TypeScript interfaces
```

---

## 4. Barcode Dataset Analysis

The provided dataset contains 114 `.gif` files in `barcodes/`. 

### Key Findings & Symbology Discovery
- **Symbology**: The barcodes are encoded in **Code 128 (Subsets B & C)**.
- **Prefix Decoupling & Natural Ordering**: The filename prefix represents the natural generation index (`1, 2, 3, 4, 5, 6, 7, 8, 9, 10`). The import engine applies natural numerical sorting (`natural_sort_key`) rather than naive string lexicographical sorting so `1_...` files are sequenced before `2_...` and `10_...` comes tenth.
- **Decoding Mechanism**: Built a pure Python + Pillow raster decoder (`backend/app/services/barcode_decoder.py`) that extracts 1D scanlines, detects start patterns (Start B / Start C), tracks dynamic subset switching, and validates the modulo-103 checksum.
- **Asset Directories**: Supports both `barcodes copy/` and `barcodes/` seamlessly with auto-fallback.
- **Result**: **114 of 114 barcodes decoded with 100% accuracy**.

---

## 5. Getting Started & Local Development

### Prerequisites
- Python 3.9 or higher
- Node.js 18+ and npm
- (Optional) PostgreSQL / Supabase account for production deployment

### Step 1: Backend Setup
```bash
# Navigate to workspace
cd techXAttendance

# Create virtual environment & activate
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install fastapi uvicorn sqlalchemy pydantic pydantic-settings python-multipart pillow bcrypt pyjwt websockets pytest httpx

# (Optional) Re-import barcodes and re-seed demo events:
PYTHONPATH=. python3 backend/scripts/import_barcodes.py
PYTHONPATH=. python3 backend/scripts/seed_demo_data.py

# Start FastAPI server:
PYTHONPATH=. uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
The backend API is now running at `http://127.0.0.1:8000`. Swagger documentation is available at `http://127.0.0.1:8000/docs`.

### Step 2: Frontend Setup
```bash
# In a separate terminal:
cd techXAttendance/frontend

# Install dependencies:
npm install

# Start Next.js development server:
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 6. Pre-Configured Test Credentials

| Role | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@techxtract.edu` | `Admin@12345` | Full administrative control, student imports, audit chain verification, corrections |
| **Event Coordinator** | `coordinator@techxtract.edu` | `Coord@12345` | Event lifecycle, registration, high-throughput scanning, CSV exports |

---

## 7. Operational Workflow & Critical Scenarios

### High-Throughput USB Barcode Scanning
1. Open any active event (`OPEN` status), e.g., `/events/1`.
2. Click **Open Scanner Terminal** (`/events/1/scanner`).
3. Connect any standard USB barcode scanner (configured as keyboard wedge).
4. Scan the barcode image or type the barcode string and press `Enter`:
   - `TXT_TH_017_Vihaan_Goyal`
   - `TXT_PRESIDENT_HITESH_TYAGI`
   - `TXT_VICE_PRESIDENT_Yaniya`
   - `TXT_TH_F_01_Rishu`
5. **Immediate Feedback**:
   - **Green Card**: `SUCCESS - Attendance marked` (High chime plays, count increments).
   - **Amber Card**: `DUPLICATE - Attendance already marked` (Double-beep warning plays).
   - **Red Card**: `UNREGISTERED` or `EVENT_CLOSED` or `INVALID_IDENTIFIER` (Low buzzer plays).
6. The scan input retains focus automatically — no mouse interaction is required between students in a queue.

### Controlled Auditable Correction
1. On the Event Detail page (`/events/1`), locate any marked student in the attendance table.
2. Click **Correct Status**.
3. Select new state (e.g., `PRESENT` → `EXCUSED`) and enter a mandatory reason:
   *"Student scanned wrong desk at entry gate"*.
4. Submit the correction. The operational attendance record updates immediately, and an immutable entry is appended to `attendance_audit_log` with an updated SHA-256 hash.

### Cryptographic Audit Verification
1. Navigate to `/audit`.
2. Inspect the sequential chain of records showing `previous_hash` and `record_hash`.
3. Click **Verify Chain Integrity**:
   - The server iteratively recalculates `SHA256(canonical_payload + previous_hash)` starting from the genesis block (`00000000...0000`).
   - Displays **CHAIN PRISTINE** if untouched, or flags the exact compromised record if database tampering occurred.

---

## 8. Running Automated Tests

Run the test suite via `pytest`:
```bash
cd techXAttendance
PYTHONPATH=. ./venv/bin/pytest backend/tests -v
```

All 7 core test scenarios execute in isolated transactional environments:
1. `test_login_and_auth`: Validates JWT token generation, password verification, and RBAC enforcement.
2. `test_scan_flow_and_duplicate_prevention`: Verifies valid scan, database-level duplicate prevention, and count consistency.
3. `test_closed_event_rejection`: Ensures attendance is rejected on `DRAFT`, `SCHEDULED`, or `CLOSED` events.
4. `test_attendance_correction_and_audit_hash_chain`: Tests controlled corrections with audit reasons and SHA-256 chain construction.
5. `test_audit_chain_tamper_detection`: Injects out-of-band tampering into the database and validates that the verification engine flags the corrupted record.
6. `test_csv_export`: Verifies RFC-4180 streaming CSV output headers and student attendance data.
7. `test_real_barcode_end_to_end_scanning`: Uses 5 real physical `.gif` files from `barcodes/`, decodes them, scans them against the live API, and validates duplicate rejection.

---

## 9. Production Deployment Guide

### Deploying Database (Supabase)
1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Retrieve your PostgreSQL connection string:
   `postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres`
3. Set `DATABASE_URL` in your production environment variables.
4. Run `Base.metadata.create_all(bind=engine)` or apply migrations to create all tables and unique constraints.

### Deploying Backend (FastAPI)
- Compatible with Render, Railway, AWS ECS, or Fly.io.
- Command: `uvicorn backend.app.main:app --host 0.0.0.0 --port 8000`
- Set `SECRET_KEY`, `DATABASE_URL`, and `BARCODE_DIR` environment variables.

### Deploying Frontend (Vercel)
- Deploy the `frontend/` directory to Vercel.
- Configure `NEXT_PUBLIC_API_URL` to point to your deployed backend domain (e.g., `https://api.techxtract.edu/api`).
- Run `npm run build` to confirm zero build errors.

---

## 10. Security & Compliance Checklist

- [x] Passwords salted and hashed with `bcrypt`.
- [x] JWT sessions with expiration and RBAC role validation.
- [x] Database-level `UNIQUE(event_id, student_id)` preventing concurrent duplicate scans.
- [x] All business logic and status validation enforced on the backend.
- [x] Cryptographic SHA-256 audit hash chaining for anti-tamper compliance.
- [x] No secrets committed to source control; `.env.example` provided.
- [x] RFC-4180 compliant CSV exports with authentication verification.
