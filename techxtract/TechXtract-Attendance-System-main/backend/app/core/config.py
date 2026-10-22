import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "TechX Attendance & Event Management System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./techx_attendance.db")
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "techx-society-attendance-secret-key-2026-prod-grade-sha256")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]
    
    # Barcodes
    BARCODE_DIR: str = os.getenv(
        "BARCODE_DIR",
        (
            os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../barcodes real"))
            if os.path.exists(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../barcodes real")))
            else (
                os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../barcodes"))
                if os.path.exists(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../barcodes")))
                else (
                    os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../barcodes copy"))
                    if os.path.exists(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../barcodes copy")))
                    else os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../barcode copy"))
                )
            )
        )
    )
    
    model_config = SettingsConfigDict(case_sensitive=True)

settings = Settings()
