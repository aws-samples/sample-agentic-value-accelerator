"""
Development authentication bypass
For local testing without Cognito
"""

from typing import Dict
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer

# The real group names, imported rather than restated. This module used to mint
# "admins"/"viewers" and check "admins", which is self-consistent and matches no
# deployment: Terraform creates "admin"/"operator"/"viewer". Because the mock and the
# mock's own check were wrong together, local dev passed while require_admin in
# core/security.py could never pass against a real pool. Importing the names is what
# makes that class of drift impossible rather than merely fixed once.
#
# core.cognito_groups, not core.security: this module has no JWT dependency, and
# core/auth.py resolves to it whenever USE_DEV_AUTH is on, so importing the production
# auth module for two strings would put python-jose on the dev-auth import path.
from core.cognito_groups import ADMIN_GROUP, VIEWER_GROUP

security = HTTPBearer(auto_error=False)


class DevUser:
    """Mock user object that mimics JWT token structure."""
    def __init__(self, user_id: str, username: str, email: str, groups: list):
        self.sub = user_id  # JWT 'sub' claim
        self.user_id = user_id
        self.username = username
        self.email = email
        self.groups = groups

    def get(self, key, default=None):
        return getattr(self, key, default)


# Mock user database for development
DEV_USERS = {
    "admin@example.com": DevUser(
        user_id="dev-admin-123",
        username="admin",
        email="admin@example.com",
        groups=[ADMIN_GROUP]
    ),
    "demo@example.com": DevUser(
        user_id="dev-demo-456",
        username="demo",
        email="demo@example.com",
        groups=[VIEWER_GROUP]
    ),
}


def get_current_user_dev(credentials=Depends(security)) -> DevUser:
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


def get_dev_user_by_email(email: str) -> DevUser:
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


def require_admin_dev(user: DevUser = Depends(get_current_user_dev)) -> DevUser:
    """
    Development admin check

    Same group name as core/security.py's require_admin, by import. A dev check that
    accepts a group the production check refuses is worse than no dev check: it reports
    success for a request that would 403 in the deployment it is standing in for.
    """
    if ADMIN_GROUP not in user.groups:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user
