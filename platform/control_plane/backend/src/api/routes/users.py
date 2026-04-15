"""User and authentication API routes"""

from fastapi import APIRouter, Request
from pydantic import BaseModel

from core.rbac import Role, _extract_role

router = APIRouter(prefix="/users", tags=["users"])


class UserInfo(BaseModel):
    email: str
    role: str
    role_level: int
    can_deploy: bool


@router.get("/me", response_model=UserInfo)
async def get_current_user(request: Request):
    """
    Get current user information including role
    """
    from core.rbac import _decode_jwt
    from core.config import settings

    # Extract role from request
    role = _extract_role(request)

    # Get email from JWT token or dev mode header
    email = "admin@example.com"

    # Try to extract email from JWT token
    auth = request.headers.get("Authorization", "")
    if auth and auth.startswith("Bearer "):
        token = auth.split(" ", 1)[1]
        try:
            claims = _decode_jwt(token)
            email = claims.get("email", email)
        except Exception:
            # Fall back to dev mode header if JWT decode fails
            if settings.USE_DEV_AUTH:
                email = request.headers.get("x-user-email", email)
    elif settings.USE_DEV_AUTH:
        # Dev mode: use x-user-email header
        email = request.headers.get("x-user-email", email)

    return UserInfo(
        email=email,
        role=role.name.lower(),
        role_level=int(role),
        can_deploy=role >= Role.OPERATOR
    )
