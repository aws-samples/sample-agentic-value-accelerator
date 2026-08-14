"""API Gateway Lambda authorizer — verifies AVA FSI SSO handoff tokens.

Same trust anchor as case-management/jwt_auth_function.js (CloudFront
Function on the frontend distribution) and the AVA control plane's
fsi_sso.py token minter: HMAC-SHA256 over `header.payload` with the
shared AVA_FSI_APP_SIGNING_SECRET.

Why a Lambda authorizer instead of API Gateway's built-in JWT
authorizer:

  - The AVA CP mints its own HMAC-signed handoff tokens, not raw
    Cognito RS256 id_tokens. API Gateway's built-in JWT authorizer
    only understands RS256/ES256 JWTs against JWKS endpoints — it
    can't verify HMAC.
  - The case-management frontend already carries the AVA HMAC token
    in an `ava_session` cookie set by the CloudFront Function at
    the frontend edge. Reusing that same token means the UI needs
    zero Cognito Amplify integration — it just forwards the cookie
    to the API as `Authorization: Bearer <token>`.

Environment:
  AVA_FSI_APP_SIGNING_SECRET  HMAC secret shared with the AVA CP.
                              Empty => authorizer denies everything
                              (fail-closed). deploy.sh only attaches
                              this authorizer to routes when the
                              secret is set, so the empty-secret path
                              only fires if someone attaches it
                              manually and forgets to set the env.
"""

import base64
import hashlib
import hmac
import json
import os
import time


SIGNING_SECRET = os.environ.get("AVA_FSI_APP_SIGNING_SECRET", "").encode()


def _b64url_decode(s: str) -> bytes:
    """URL-safe base64 decode with automatic '=' padding fix."""
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _verify(token: str) -> dict | None:
    """Verify an AVA HMAC handoff token. Returns claims or None."""
    if not SIGNING_SECRET or not token:
        return None
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}".encode()
        expected = (
            base64.urlsafe_b64encode(
                hmac.new(SIGNING_SECRET, signing_input, hashlib.sha256).digest()
            )
            .rstrip(b"=")
            .decode()
        )
        if not hmac.compare_digest(expected, sig_b64):
            return None
        payload = json.loads(_b64url_decode(payload_b64).decode())
        exp = payload.get("exp", 0)
        if not isinstance(exp, (int, float)) or exp < time.time():
            return None
        return payload
    except Exception:
        return None


def _extract_token(event: dict) -> str:
    """Read the token from either Authorization: Bearer <t> or the
    ava_session cookie. Case-management's UI sends the cookie value
    as a bearer token; the CloudFront Function on the frontend edge
    keeps the cookie as httpOnly for defense in depth.
    """
    headers = event.get("headers") or {}
    # HTTP API v2 lowercases header names by default
    auth = headers.get("authorization") or headers.get("Authorization") or ""
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    # Fallback: cookie
    cookie = headers.get("cookie") or headers.get("Cookie") or ""
    for pair in cookie.split(";"):
        pair = pair.strip()
        if pair.startswith("ava_session="):
            return pair[len("ava_session="):]
    return ""


def handler(event, context):
    """API Gateway v2 Lambda authorizer (simple response, IAM=false).

    Return `{ "isAuthorized": True/False, "context": {...} }`. The
    context flows into the downstream Lambda as
    event.requestContext.authorizer.lambda for optional identity use.
    """
    token = _extract_token(event)
    claims = _verify(token)
    if not claims:
        return {"isAuthorized": False}
    return {
        "isAuthorized": True,
        "context": {
            "sub": str(claims.get("sub", "")),
            "email": str(claims.get("email", "")),
        },
    }
