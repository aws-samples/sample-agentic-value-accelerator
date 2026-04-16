"""
Health check API routes
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
import logging

from core.database import get_db
from services import S3Service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint

    Checks:
    - API is running
    - Database is accessible
    - S3 is accessible

    Returns:
        Health status
    """
    status_checks = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "checks": {}
    }

    # Check database connectivity
    try:
        db.execute(text("SELECT 1"))
        status_checks["checks"]["database"] = "connected"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        status_checks["status"] = "unhealthy"
        status_checks["checks"]["database"] = f"error: {str(e)}"

    # Check S3 accessibility
    try:
        s3_service = S3Service()
        if s3_service.check_bucket_accessible():
            status_checks["checks"]["s3"] = "accessible"
        else:
            status_checks["status"] = "degraded"
            status_checks["checks"]["s3"] = "not accessible"
    except Exception as e:
        logger.error(f"S3 health check failed: {e}")
        status_checks["status"] = "degraded"
        status_checks["checks"]["s3"] = f"error: {str(e)}"

    return status_checks


@router.get("/ping")
async def ping():
    """
    Simple ping endpoint

    Returns:
        Pong response
    """
    return {"ping": "pong", "timestamp": datetime.utcnow().isoformat()}
