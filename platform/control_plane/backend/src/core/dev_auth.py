"""
Development authentication bypass
For local testing without Cognito
"""

from typing import Dict
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer

security = HTTPBearer(auto_error=False)

# Mock user database for development
DEV_USERS = {
    "admin@example.com": {
        "user_id": "dev-admin-123",
        "username": "admin",
        "email": "admin@example.com",
        "groups": ["admins"]
    },
    "demo@example.com": {
        "user_id": "dev-demo-456",
        "username": "demo",
        "email": "demo@example.com",
        "groups": ["viewers"]
    }
}


def get_current_user_dev(credentials=Depends(security)) -> Dict:
    """
    Development authentication that bypasses Cognito
    Returns a mock user based on x-user-email header
    """
    from fastapi import Request
    from starlette.requests import Request as StarletteRequest

    # Try to get user email from request header (for testing different users)
    # In a real scenario, this would come from the JWT token
    # For now, we'll default to admin

    # Default to admin user
    return DEV_USERS["admin@example.com"]


def get_dev_user_by_email(email: str) -> Dict:
    """
    Get development user by email
    """
    user = DEV_USERS.get(email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User not found: {email}"
        )
    return user


def require_admin_dev(user: Dict = Depends(get_current_user_dev)) -> Dict:
    """
    Development admin check
    """
    if "admins" not in user.get("groups", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user
