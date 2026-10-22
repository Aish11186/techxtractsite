from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta

from backend.app.db.session import get_db
from backend.app.models import User, UserRole
from backend.app.schemas import LoginRequest, Token, UserResponse, UserCreate
from backend.app.core.security import verify_password, create_access_token, get_current_user, require_roles, get_password_hash

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=Token)
def login(login_req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_req.email).first()
    if not user or not verify_password(login_req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive. Please contact the administrator."
        )

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role, "email": user.email}
    )
    return Token(
        access_token=access_token,
        token_type="bearer",
        role=user.role,
        user_id=user.id,
        name=user.name,
        email=user.email
    )

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/coordinators", response_model=UserResponse, dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value]))])
def create_coordinator(coord_in: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == coord_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    new_user = User(
        email=coord_in.email,
        name=coord_in.name,
        hashed_password=get_password_hash(coord_in.password),
        role=coord_in.role or UserRole.COORDINATOR.value,
        status="ACTIVE"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("/coordinators", response_model=list[UserResponse], dependencies=[Depends(require_roles([UserRole.SUPER_ADMIN.value]))])
def list_coordinators(db: Session = Depends(get_db)):
    return db.query(User).filter(User.role.in_([UserRole.COORDINATOR.value, UserRole.SUPER_ADMIN.value])).all()
