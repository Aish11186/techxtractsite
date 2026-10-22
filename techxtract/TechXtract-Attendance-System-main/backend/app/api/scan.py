import asyncio
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models import User, UserRole
from backend.app.schemas import ScanRequest, ScanResponse
from backend.app.services.attendance_service import process_attendance_scan, notifier
from backend.app.services.barcode_decoder import decode_code128_image
from backend.app.core.security import get_current_user, require_roles

router = APIRouter(prefix="/events", tags=["Attendance Scanning"])

@router.post(
    "/{event_id}/attendance/scan",
    response_model=ScanResponse,
    dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))]
)
async def scan_attendance(
    event_id: int,
    scan_req: ScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Primary High-Throughput Attendance Scanning Endpoint.
    Handles USB Barcode scanners, Camera Scanners, and Manual entries.
    Executes authoritative server validation, database atomic insert,
    and SHA-256 audit chaining.
    """
    res = process_attendance_scan(db, event_id, scan_req, current_user)

    # If scan succeeded, trigger WebSocket broadcast asynchronously to connected dashboards
    if res.status == "SUCCESS":
        asyncio.create_task(
            notifier.broadcast_event_update(
                event_id,
                {
                    "type": "ATTENDANCE_RECORDED",
                    "student_name": res.student.name if res.student else "Student",
                    "enrollment_no": res.student.enrollment_no if res.student else "",
                    "status": res.attendance_status,
                    "marked_at": res.marked_at.isoformat() if res.marked_at else "",
                    "stats": res.event_stats
                }
            )
        )

    return res

@router.post(
    "/{event_id}/attendance/scan-image",
    response_model=ScanResponse,
    dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))]
)
async def scan_attendance_image(
    event_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Direct image/photo/screenshot barcode decoding and attendance processing.
    Decodes Code 128 barcodes from raw uploads and dark-mode phone screenshots.
    """
    content = await file.read()
    decoded_code, err = decode_code128_image(content)
    if not decoded_code:
        return ScanResponse(
            status="INVALID_IDENTIFIER",
            message=f"Could not decode Code 128 barcode from image: {err or 'Unrecognized pattern'}"
        )

    scan_req = ScanRequest(
        student_identifier=decoded_code,
        scan_method="IMAGE_UPLOAD",
        device_id="image-decoder"
    )
    res = process_attendance_scan(db, event_id, scan_req, current_user)
    if res.status == "SUCCESS":
        asyncio.create_task(
            notifier.broadcast_event_update(
                event_id,
                {
                    "type": "ATTENDANCE_RECORDED",
                    "student_name": res.student.name if res.student else "Student",
                    "enrollment_no": res.student.enrollment_no if res.student else "",
                    "status": res.attendance_status,
                    "marked_at": res.marked_at.isoformat() if res.marked_at else "",
                    "stats": res.event_stats
                }
            )
        )
    return res
