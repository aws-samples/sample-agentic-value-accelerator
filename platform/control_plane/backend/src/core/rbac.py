"""Role-Based Access Control middleware with Cognito JWT validation"""

import json
import logging
import time
from enum import IntEnum
from typing import Optional
from urllib.request import urlopen

from fastapi import HTTPException, Request

from core.config import settings

logger = logging.getLogger(__name__)


def _is_dev_auth_allowed() -> bool:
    """Check if dev auth bypass is allowed in current environment.

    Dev auth is never allowed in production, even if USE_DEV_AUTH=True.
    """
    if settings.ENVIRONMENT.lower() == "production":
        if settings.USE_DEV_AUTH:
            logger.warning(
                "USE_DEV_AUTH is True but ENVIRONMENT=production - dev auth bypass disabled"
            )
        return False
    return settings.USE_DEV_AUTH


class Role(IntEnum):
    VIEWER = 0
    OPERATOR = 1
    ADMIN = 2

ROLE_MAP = {"viewer": Role.VIEWER, "operator": Role.OPERATOR, "admin": Role.ADMIN}

# Cached JWKS
_jwks_cache: Optional[dict] = None
_jwks_cache_time: float = 0
_JWKS_CACHE_TTL = 3600  # 1 hour


def _get_jwks() -> dict:
    global _jwks_cache, _jwks_cache_time
    if _jwks_cache and (time.time() - _jwks_cache_time) < _JWKS_CACHE_TTL:
        return _jwks_cache
    url = f"https://cognito-idp.{settings.COGNITO_REGION}.amazonaws.com/{settings.COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    with urlopen(url) as resp:
        _jwks_cache = json.loads(resp.read())
    _jwks_cache_time = time.time()
    return _jwks_cache


def _decode_jwt(token: str) -> dict:
    """Decode and verify a Cognito JWT token."""
    try:
        import jwt as pyjwt
        from jwt import PyJWKClient
    except ImportError:
        # Fallback: if PyJWT not installed, decode without verification in dev mode
        if _is_dev_auth_allowed():
            logger.warning("PyJWT not installed - using unverified decode in dev mode")
            import base64
            payload = token.split(".")[1]
            payload += "=" * (4 - len(payload) % 4)
            return json.loads(base64.b64decode(payload))
        raise HTTPException(status_code=500, detail="PyJWT not installed")

    jwks_url = f"https://cognito-idp.{settings.COGNITO_REGION}.amazonaws.com/{settings.COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    jwk_client = PyJWKClient(jwks_url)
    signing_key = jwk_client.get_signing_key_from_jwt(token)
    return pyjwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=settings.COGNITO_CLIENT_ID,
        issuer=f"https://cognito-idp.{settings.COGNITO_REGION}.amazonaws.com/{settings.COGNITO_USER_POOL_ID}",
    )


def _extract_role(request: Request) -> Role:
    auth = request.headers.get("Authorization", "")
    dev_auth_allowed = _is_dev_auth_allowed()

    # Dev mode: check for x-user-email header to simulate different users
    if dev_auth_allowed:
        user_email = request.headers.get("x-user-email", "admin@example.com").lower()
        # Map user email to role
        if user_email == "demo@example.com":
            logger.warning("Dev auth bypass: granting VIEWER role for demo user")
            return Role.VIEWER
        elif user_email in ["admin@example.com", "dev@example.com"]:
            logger.warning("Dev auth bypass: granting ADMIN role for dev user")
            return Role.ADMIN
        # Default to admin in dev mode if no token
        if not auth:
            logger.warning("Dev auth bypass: no auth header, granting ADMIN role")
            return Role.ADMIN

    if not auth or not auth.startswith("Bearer "):
        if dev_auth_allowed:
            logger.warning("Dev auth bypass: missing/invalid auth header, granting ADMIN role")
            return Role.ADMIN
        raise HTTPException(status_code=401, detail="Missing authorization token")

    token = auth.split(" ", 1)[1]

    # Skip validation in dev mode when Cognito is not configured
    if dev_auth_allowed and not settings.COGNITO_USER_POOL_ID:
        role_str = request.headers.get("x-user-role", "admin").lower()
        logger.warning(f"Dev auth bypass: Cognito not configured, using x-user-role header ({role_str})")
        return ROLE_MAP.get(role_str, Role.VIEWER)

    try:
        claims = _decode_jwt(token)
    except Exception as e:
        # Log only the error type to avoid leaking sensitive info from error messages
        logger.error(f"JWT validation failed: {type(e).__name__}")
        logger.debug(f"JWT error details (debug only): {e}")
        if dev_auth_allowed:
            logger.warning("Dev auth bypass: JWT validation failed, granting ADMIN role")
            return Role.ADMIN
        raise HTTPException(status_code=401, detail="Invalid token")

    # Extract role from cognito:groups
    groups = claims.get("cognito:groups", [])
    if "admin" in groups:
        return Role.ADMIN
    if "operator" in groups:
        return Role.OPERATOR
    return Role.VIEWER


def require_role(min_role: Role):
    async def checker(request: Request):
        user_role = _extract_role(request)
        if user_role < min_role:
            raise HTTPException(status_code=403, detail=f"Requires {min_role.name.lower()} role or higher")
        return user_role
    return checker
