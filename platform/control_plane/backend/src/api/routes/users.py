"""User and authentication API routes"""

from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from core.rbac import Role, _extract_role

router = APIRouter(prefix="/users", tags=["users"])

# The value core/rbac.py:88 defaults `x-user-email` to when dev auth is allowed. This route
# does not invent it: it is the exact string the RBAC layer resolved the ADMIN grant from in
# the same request, so echoing it is what keeps `email` and `role` describing one principal.
# It is used ONLY on that dev path - never as a general fallback.
_DEV_DEFAULT_EMAIL = "admin@example.com"


class UserInfo(BaseModel):
    email: str
    role: str
    role_level: int
    can_deploy: bool


@router.get("/me", response_model=UserInfo)
async def get_current_user(request: Request):
    """Get current user information including role.

    `email` and `role` are resolved from the same inputs in the same precedence order, so
    the two fields in one response can never describe different principals:

    1. `x-user-email`, but only when dev auth is allowed. That is the header
       core/rbac.py:86-99 keys the dev role off (and what the UI's user switcher sets), and
       a transport-level header outranks anything the caller asserts in a body or query.
    2. The `email` claim of a verified Cognito JWT - the only trustworthy identity once dev
       auth is off.
    3. `admin@example.com`, and only when dev auth is allowed and neither of the above
       produced an email, because that is the default core/rbac.py:88 just granted the role
       for. Disagreeing with it would make the two fields describe different users.
    4. `"unknown"`.

    Step 4 used to be `admin@example.com`, and it was the fallback on EVERY path rather
    than only the dev one - most importantly on the production path, where a verified JWT
    whose claims happen to carry no `email` key returned that literal next to whatever role
    its `cognito:groups` said. A missing claim has to read as a gap; a plausible address
    reads as a real person, so nobody goes looking for the missing identity.
    """
    from core.rbac import _decode_jwt, _is_dev_auth_allowed

    # Raises 401 for missing/invalid auth before anything below, so every branch here runs
    # only for a request the RBAC layer already accepted. That is also why "JWT decode
    # failed while dev auth is off" is unreachable in this function: _extract_role decodes
    # the same token first and raises 401 on failure.
    role = _extract_role(request)

    # _is_dev_auth_allowed(), not settings.USE_DEV_AUTH: rbac refuses the dev bypass when
    # ENVIRONMENT=production even with USE_DEV_AUTH=True, and this route must not honour a
    # caller-supplied identity header on a path where rbac ignored it.
    dev_auth_allowed = _is_dev_auth_allowed()

    email: Optional[str] = None

    if dev_auth_allowed:
        email = request.headers.get("x-user-email")

    if not email:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            try:
                email = _decode_jwt(auth.split(" ", 1)[1]).get("email")
            except Exception:
                # _extract_role already decided what a bad token means (401 outside dev,
                # ADMIN inside it). All this adds is that no email could be established.
                email = None

    if not email and dev_auth_allowed:
        email = _DEV_DEFAULT_EMAIL

    return UserInfo(
        email=email or "unknown",
        role=role.name.lower(),
        role_level=int(role),
        can_deploy=role >= Role.OPERATOR,
    )
