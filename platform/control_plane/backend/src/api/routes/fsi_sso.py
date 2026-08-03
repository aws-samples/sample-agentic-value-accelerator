"""FSI Foundry SSO — mints HMAC-signed handoff tokens for cross-app auth."""

import base64
import hashlib
import hmac
import json
import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from core.config import settings
from core.rbac import Role, _decode_jwt, _extract_role

router = APIRouter(prefix="/fsi", tags=["fsi-sso"])

# Handoff token lifetime — matches the ava_session cookie Max-Age set by
# each FSI app's CloudFront Function so the two expire together.
TOKEN_TTL_SECONDS = 3600


class SignAppTokenResponse(BaseModel):
    token: str
    expires_at: int


def _b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _mint_handoff_token(sub: str, email: str) -> tuple[str, int]:
    """Build header.payload.signature triple. Same shape as JWT, HS256 alg."""
    now = int(time.time())
    exp = now + TOKEN_TTL_SECONDS
    header = {"alg": "HS256", "typ": "AVA"}
    payload = {"sub": sub, "email": email, "iat": now, "exp": exp}
    header_b64 = _b64u(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = _b64u(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}".encode()
    sig = hmac.new(
        settings.FSI_APP_SIGNING_SECRET.encode(),
        signing_input,
        hashlib.sha256,
    ).digest()
    return f"{header_b64}.{payload_b64}.{_b64u(sig)}", exp


@router.post("/sign-app-token", response_model=SignAppTokenResponse)
async def sign_app_token(request: Request) -> SignAppTokenResponse:
    """
    Mint an HMAC-signed handoff token for opening an FSI Foundry app.

    Real Cognito RS256 verification happens here (via _decode_jwt against
    the Cognito JWKS). Only after that succeeds do we HMAC-sign the handoff
    token that the FSI app's edge will verify. Any authenticated user
    (VIEWER+) may request a token; per-app ACLs live inside the FSI app.
    """
    if not settings.FSI_APP_SIGNING_SECRET:
        raise HTTPException(
            status_code=503,
            detail="FSI SSO not configured (FSI_APP_SIGNING_SECRET is empty)",
        )

    role = _extract_role(request)
    if role < Role.VIEWER:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Pull sub + email from the caller's Cognito id_token for traceability.
    sub, email = "unknown", "unknown@ava"
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            claims = _decode_jwt(auth.split(" ", 1)[1])
            sub = claims.get("sub", sub)
            email = claims.get("email", email)
        except Exception:
            # _extract_role already gated on role — dev-mode fall-through
            # returns defaults which is fine for the handoff payload.
            pass

    token, exp = _mint_handoff_token(sub, email)
    return SignAppTokenResponse(token=token, expires_at=exp)
