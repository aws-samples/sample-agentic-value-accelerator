"""
Security and authentication utilities
"""

import json
import requests
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict

from core.config import settings

# HTTP Bearer security scheme
security = HTTPBearer()

# Cache for Cognito public keys
_cognito_keys: Optional[Dict] = None


def get_cognito_public_keys() -> Dict:
    """
    Fetch Cognito public keys for JWT validation

    Returns:
        Dictionary of public keys
    """
    global _cognito_keys

    if _cognito_keys is None:
        keys_url = (
            f"https://cognito-idp.{settings.COGNITO_REGION}.amazonaws.com/"
            f"{settings.COGNITO_USER_POOL_ID}/.well-known/jwks.json"
        )

        response = requests.get(keys_url)
        response.raise_for_status()
        _cognito_keys = response.json()

    return _cognito_keys


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict:
    """
    Verify JWT token from Cognito

    Args:
        credentials: HTTP Authorization header credentials

    Returns:
        Decoded JWT claims

    Raises:
        HTTPException: If token is invalid
    """
    token = credentials.credentials

    try:
        # Get Cognito public keys
        keys = get_cognito_public_keys()

        # Decode header to get kid
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")

        if not kid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing kid"
            )

        # Find the correct key
        key = None
        for k in keys["keys"]:
            if k["kid"] == kid:
                key = k
                break

        if not key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: kid not found"
            )

        # Verify and decode token
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=settings.COGNITO_CLIENT_ID,
            options={"verify_exp": True}
        )

        return claims

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )


def get_current_user(claims: Dict = Depends(verify_token)) -> Dict:
    """
    Get current user from JWT claims

    Args:
        claims: JWT claims from verify_token

    Returns:
        User information dictionary
    """
    return {
        "user_id": claims.get("sub"),
        "username": claims.get("cognito:username"),
        "email": claims.get("email"),
        "groups": claims.get("cognito:groups", [])
    }


def require_admin(user: Dict = Depends(get_current_user)) -> Dict:
    """
    Require user to be in admin group

    Args:
        user: Current user from get_current_user

    Returns:
        User information if admin

    Raises:
        HTTPException: If user is not admin
    """
    if "admins" not in user.get("groups", []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    return user
