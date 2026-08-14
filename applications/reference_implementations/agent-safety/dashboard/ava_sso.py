"""AVA FSI SSO — HMAC handoff verification for the Agent Safety dashboard.

Companion of the AVA control-plane token minter (backend/src/api/routes/
fsi_sso.py) and the CloudFront-Function verifier that ships with the other
reference apps (case-management/jwt_auth_function.js,
merchant-onboarding/.../jwt_auth_function.js).

Difference from those apps: Agent Safety is a FastAPI app on ECS behind an
ALB (not a static SPA on S3), so we can't do the verification at the
CloudFront edge — the FastAPI backend has its own request lifecycle that
needs to know about the identity. We verify the same HMAC handoff token
here, in-process, before any endpoint runs.

The AVA UI opens Agent Safety with `?ava_token=<jwt-shaped blob>` (see
platform/control_plane/frontend/src/lib/fsiAppLink.ts). The token is a
three-part `header.payload.HMAC-SHA256(header.payload, SIGNING_SECRET)`
signed by the AVA backend, valid for ~1 hour.

The middleware in api.py handles:
  - First hop: consume `?ava_token=<blob>`, verify HMAC, set an httpOnly
    `ava_session` cookie, 302 to the URL without the token param.
  - Subsequent hops: verify the `ava_session` cookie the same way.
  - Failure: 302 to AVA_UI_LOGIN_URL (federated mode) or fall through to
    the existing Cognito flow (standalone mode).

When AVA_FSI_APP_SIGNING_SECRET is empty (standalone deployment, direct
`./deploy.sh` outside the AVA control plane), verify_ava_session returns
None for every input — the app falls back to its Cognito-based auth
exactly like it does today. Zero regression path for that case.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Optional

logger = logging.getLogger(__name__)

# HMAC secret shared with the AVA backend's fsi_sso.py minter and (for the
# S3-fronted ref apps) the CloudFront Function. Empty => AVA SSO disabled.
AVA_FSI_APP_SIGNING_SECRET: bytes = os.environ.get(
    "AVA_FSI_APP_SIGNING_SECRET", ""
).encode()

# Where to send an unauthenticated caller when we're in AVA-federated mode.
# Populated at deploy time from the control plane's `ava_ui_login_url`
# terraform output.
AVA_UI_LOGIN_URL: str = os.environ.get("AVA_UI_LOGIN_URL", "")

# Whether AVA SSO is the active auth mode. Toggle is purely based on
# whether the operator gave us a signing secret at deploy time.
AVA_SSO_ENABLED: bool = bool(AVA_FSI_APP_SIGNING_SECRET)


def _b64url_decode(s: str) -> bytes:
    """URL-safe base64 decode with automatic '=' padding fix.

    The AVA minter strips trailing '=' per RFC 7515 §2 (base64url) but
    Python's `urlsafe_b64decode` requires the padding. Add it back before
    decoding to avoid `binascii.Error: Invalid base64-encoded string`.
    """
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def verify_ava_session(token: Optional[str]) -> Optional[dict]:
    """HMAC-verify an AVA handoff token. Returns claims dict or None.

    Token shape: `<header_b64url>.<payload_b64url>.<sig_b64url>` where
    sig = HMAC-SHA256(header + '.' + payload, SIGNING_SECRET), base64url
    with padding stripped.

    Returns None (never raises) on ANY failure — bad shape, bad signature,
    expired, or missing secret. Callers treat None as "not authenticated
    via AVA" and can fall through to the Cognito path.
    """
    if not AVA_FSI_APP_SIGNING_SECRET or not token:
        return None
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts

        # Constant-time HMAC compare — same as the CloudFront Function's
        # constantTimeEquals implementation (jwt_auth_function.js:30).
        signing_input = f"{header_b64}.{payload_b64}".encode()
        expected_sig_bytes = hmac.new(
            AVA_FSI_APP_SIGNING_SECRET, signing_input, hashlib.sha256
        ).digest()
        expected_sig = (
            base64.urlsafe_b64encode(expected_sig_bytes).rstrip(b"=").decode()
        )
        if not hmac.compare_digest(expected_sig, sig_b64):
            logger.warning("ava_sso: signature mismatch")
            return None

        payload = json.loads(_b64url_decode(payload_b64).decode())
        exp = payload.get("exp", 0)
        if not isinstance(exp, (int, float)) or exp < time.time():
            logger.warning("ava_sso: token expired (exp=%s)", exp)
            return None
        return payload
    except Exception as e:
        # Deliberately swallow — treat any parse/decode error as "bad
        # token" and let the caller fall through. Never leak the reason
        # to the caller (no oracle) but do log for operator debugging.
        logger.warning("ava_sso: verification failed: %s", type(e).__name__)
        return None
