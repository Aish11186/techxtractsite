from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models import AttendanceAuditLog, User, UserRole
from backend.app.schemas import AuditLogResponse, AuditVerifyResponse
from backend.app.core.security import get_current_user, require_roles
from backend.app.core.audit_chain import verify_audit_chain

router = APIRouter(prefix="/audit", tags=["Audit Log & Integrity"])

@router.get("", response_model=List[AuditLogResponse], dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))])
def list_audit_logs(
    event_id: Optional[int] = None,
    student_id: Optional[int] = None,
    action: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(AttendanceAuditLog)
    if event_id:
        query = query.filter(AttendanceAuditLog.event_id == event_id)
    if student_id:
        query = query.filter(AttendanceAuditLog.student_id == student_id)
    if action:
        query = query.filter(AttendanceAuditLog.action == action.upper())

    logs = query.order_by(AttendanceAuditLog.id.desc()).limit(limit).all()
    return logs

@router.get("/verify", response_model=AuditVerifyResponse, dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))])
def run_audit_verification(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Administrative Cryptographic Audit Verification.
    Walks the append-only attendance audit chain sequentially, recalculating
    canonical SHA-256 hashes to guarantee data immutability and detect any unauthorized tampering.
    """
    result = verify_audit_chain(db)
    return AuditVerifyResponse(**result)

@router.post("/verify", response_model=AuditVerifyResponse, dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value, UserRole.COORDINATOR.value]))])
def run_audit_verification_post(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = verify_audit_chain(db)
    return AuditVerifyResponse(**result)
