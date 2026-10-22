import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.core.config import settings
from backend.app.db.session import engine, Base
import backend.app.models # Ensure all models are registered with Base

# Import API routers
from backend.app.api.auth import router as auth_router
from backend.app.api.students import router as students_router
from backend.app.api.events import router as events_router
from backend.app.api.registrations import router as registrations_router
from backend.app.api.scan import router as scan_router
from backend.app.api.attendance import router as attendance_router
from backend.app.api.reports import router as reports_router
from backend.app.api.audit import router as audit_router
from backend.app.api.websocket import router as ws_router

# Initialize database schema tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Enterprise-grade Society Event & Attendance Management System with Barcode/QR Scanning, DB Uniqueness, Append-Only Cryptographic Audit Log, and Live Dashboards.",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In development allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static barcode directory if it exists
barcode_dir = settings.BARCODE_DIR
if not os.path.exists(barcode_dir):
    # Try relative workspace fallback
    workspace_barcodes = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../barcodes"))
    if os.path.exists(workspace_barcodes):
        barcode_dir = workspace_barcodes

if os.path.exists(barcode_dir):
    app.mount("/static/barcodes", StaticFiles(directory=barcode_dir), name="barcodes")

# Register API routers under /api
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(students_router, prefix=settings.API_V1_STR)
app.include_router(events_router, prefix=settings.API_V1_STR)
app.include_router(registrations_router, prefix=settings.API_V1_STR)
app.include_router(scan_router, prefix=settings.API_V1_STR)
app.include_router(attendance_router, prefix=settings.API_V1_STR)
app.include_router(reports_router, prefix=settings.API_V1_STR)
app.include_router(audit_router, prefix=settings.API_V1_STR)
app.include_router(ws_router, prefix=settings.API_V1_STR)

@app.get("/api/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }

# Mount main TechXtract website static files (index.html, about.html, members.html, events.html, attendance.html)
main_site_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
if os.path.exists(main_site_dir) and os.path.exists(os.path.join(main_site_dir, "index.html")):
    app.mount("/", StaticFiles(directory=main_site_dir, html=True), name="main_site")

