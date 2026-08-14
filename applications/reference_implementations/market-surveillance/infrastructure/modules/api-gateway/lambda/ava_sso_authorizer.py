"""Dual-token API Gateway REST v1 Lambda authorizer.

Accepts either:

  1. AVA FSI SSO handoff token — HMAC-SHA256 signed by the AVA control
     plane's fsi_sso.py minter, verified with the shared
     AVA_FSI_APP_SIGNING_SECRET. Users click Open App in the AVA UI and
     the CloudFront viewer-request Function (cloudfront/ava_sso_function.
     js.tftpl) drops an ava_session cookie which the Next.js UI then
     forwards as `Authorization: Bearer <cookie>`.

  2. Cognito RS256 id_token — issued by the market-surveillance Cognito
     user pool. Users who logged in via the app's own /login form get
     this from Amplify. Verified against the pool's JWKS.

Returns an API Gateway REST v1 IAM policy (Allow or Deny). Context
fields (sub, email) are forwarded to Lambda via
event.requestContext.authorizer.

Environment variables (set by Terraform):

  AVA_FSI_APP_SIGNING_SECRET  Shared HMAC secret. Empty → AVA path
                              disabled; only Cognito tokens accepted.
  COGNITO_USER_POOL_ID        Cognito pool id (for JWKS + issuer check).
                              Empty → Cognito path disabled; only AVA
                              tokens accepted. When BOTH are empty,
                              the authorizer denies every request
                              (fail-closed).
  COGNITO_APP_CLIENT_ID       Expected `aud` claim on the id_token.
                              Empty means don't check audience — useful
                              when multiple app clients share the pool.
  AWS_REGION                  Auto-set by Lambda.

Design notes:

  * We DON'T re-fetch JWKS on every invocation. `_jwks` is a module-level
    cache; Lambda's warm container reuse means one fetch per cold start.
  * All verification is local (HMAC or RS256) — no network calls to
    Cognito. Fast (<10 ms warm).
  * On any verification failure we return Deny, not raise. Raising causes
    API Gateway to 500 with a generic error; explicit Deny gives the
    caller 403 with a clear denial reason in CloudWatch.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import urllib.request
from typing import Any, Dict, Optional

logger = logging.getLogger()
logger.setLevel(logging.INFO)

AVA_SIGNING_SECRET: bytes = os.environ.get("AVA_FSI_APP_SIGNING_SECRET", "").encode()
COGNITO_USER_POOL_ID: str = os.environ.get("COGNITO_USER_POOL_ID", "")
COGNITO_APP_CLIENT_ID: str = os.environ.get("COGNITO_APP_CLIENT_ID", "")
COGNITO_REGION: str = os.environ.get("AWS_REGION", "us-east-1")

# JWKS cache — populated on first Cognito verification.
_jwks: Optional[Dict[str, Any]] = None


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _verify_ava(token: str) -> Optional[Dict[str, Any]]:
    """HMAC-SHA256 verify an AVA handoff token. Returns claims or None."""
    if not AVA_SIGNING_SECRET or not token:
        return None
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}".encode()
        expected = (
            base64.urlsafe_b64encode(
                hmac.new(AVA_SIGNING_SECRET, signing_input, hashlib.sha256).digest()
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
    except Exception as e:  # noqa: BLE001
        logger.debug("AVA verify failed: %s", type(e).__name__)
        return None


def _load_jwks() -> Dict[str, Any]:
    """Fetch and cache Cognito's JWKS. One-shot per warm container."""
    global _jwks
    if _jwks is not None:
        return _jwks
    if not COGNITO_USER_POOL_ID:
        _jwks = {"keys": []}
        return _jwks
    url = (
        f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/"
        f"{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    )
    with urllib.request.urlopen(url, timeout=5) as resp:
        _jwks = json.loads(resp.read())
    logger.info("JWKS loaded: %d keys", len(_jwks.get("keys", [])))
    return _jwks


def _verify_cognito(token: str) -> Optional[Dict[str, Any]]:
    """RS256 verify a Cognito id_token against the pool's JWKS. Returns
    claims or None. Uses python-jose which comes with `cryptography`.
    """
    if not COGNITO_USER_POOL_ID or not token:
        return None
    try:
        # Lazy import so cold-start doesn't pay the jose import cost when
        # only the AVA path is used.
        from jose import jwt as jose_jwt  # type: ignore
        from jose.utils import base64url_decode as _  # noqa: F401

        unverified_header = jose_jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        keys = _load_jwks().get("keys", [])
        key = next((k for k in keys if k.get("kid") == kid), None)
        if not key:
            logger.warning("Cognito verify: kid %s not in JWKS", kid)
            return None

        issuer = (
            f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/"
            f"{COGNITO_USER_POOL_ID}"
        )
        options: Dict[str, Any] = {"verify_at_hash": False}
        audience = COGNITO_APP_CLIENT_ID if COGNITO_APP_CLIENT_ID else None
        if not audience:
            options["verify_aud"] = False

        claims = jose_jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=audience,
            issuer=issuer,
            options=options,
        )
        return claims
    except Exception as e:  # noqa: BLE001
        logger.warning("Cognito verify failed: %s", type(e).__name__)
        return None


def _extract_token(event: Dict[str, Any]) -> str:
    """Read the raw token from the Authorization header. API Gateway
    REST v1 puts it in `event.authorizationToken` for TOKEN authorizers,
    or `event.headers.Authorization` for REQUEST authorizers. We wire
    this as a TOKEN authorizer so `authorizationToken` is the primary
    source; fall back to headers just in case.
    """
    tok = event.get("authorizationToken") or ""
    if not tok:
        headers = event.get("headers") or {}
        tok = headers.get("Authorization") or headers.get("authorization") or ""
    if tok.lower().startswith("bearer "):
        tok = tok[7:].strip()
    return tok


def _policy(effect: str, method_arn: str, principal: str, ctx: Dict[str, str]) -> Dict[str, Any]:
    """Build an API Gateway REST v1 authorizer response.

    We wildcard the resource to the full API's ARN prefix so a single
    Allow policy covers every route in the current stage — API Gateway
    caches per (authorizer, token) pair and re-uses across methods.
    """
    # method_arn shape: arn:aws:execute-api:<region>:<account>:<api-id>/<stage>/<verb>/<path>
    parts = method_arn.split("/")
    api_arn_prefix = f"{parts[0]}/{parts[1]}/*/*" if len(parts) >= 3 else method_arn
    return {
        "principalId": principal or "anonymous",
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "execute-api:Invoke",
                    "Effect": effect,
                    "Resource": [api_arn_prefix],
                }
            ],
        },
        # Context values MUST be strings; forwarded to the backend Lambda
        # as event.requestContext.authorizer.<key>.
        "context": {k: str(v) for k, v in ctx.items()},
    }


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method_arn = event.get("methodArn", "")
    token = _extract_token(event)

    if not token:
        logger.info("no token in request")
        return _policy("Deny", method_arn, "anonymous", {"reason": "no_token"})

    # AVA path first — HMAC is cheaper than RS256 + JWKS.
    claims = _verify_ava(token)
    if claims:
        principal = str(claims.get("sub") or claims.get("email") or "ava-user")
        return _policy(
            "Allow",
            method_arn,
            principal,
            {
                "sub": str(claims.get("sub", "")),
                "email": str(claims.get("email", "")),
                "auth_source": "ava_sso",
            },
        )

    # Cognito path.
    claims = _verify_cognito(token)
    if claims:
        principal = str(claims.get("sub") or claims.get("email") or "cognito-user")
        return _policy(
            "Allow",
            method_arn,
            principal,
            {
                "sub": str(claims.get("sub", "")),
                "email": str(claims.get("email", "")),
                "auth_source": "cognito",
            },
        )

    logger.info("token rejected by both AVA and Cognito verifiers")
    return _policy("Deny", method_arn, "anonymous", {"reason": "invalid_token"})
