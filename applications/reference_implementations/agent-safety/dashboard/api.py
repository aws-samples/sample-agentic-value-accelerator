"""
Agent Safety Dashboard — FastAPI Backend (DynamoDB-Centralized)

DynamoDB is the single source of truth for ALL dashboard data.
The API reads only from DynamoDB. A sync endpoint populates DynamoDB
from AWS services (AgentCore, Budgets, CloudWatch, Evaluations).

Authentication:
  - Cognito User Pool (set COGNITO_* env vars to enable)
  - When enabled, all API endpoints require a valid JWT token
  - When disabled (env vars empty), auth is bypassed for local dev

Run locally (no auth):
    uvicorn api:app --reload --port 8000

Run with auth:
    COGNITO_USER_POOL_ID=us-east-1_xxx COGNITO_APP_CLIENT_ID=xxx \
    COGNITO_DOMAIN=myapp.auth.us-east-1.amazoncognito.com \
    uvicorn api:app --reload --port 8000

Environment Variables:
  AWS_PROFILE             - Named AWS profile (optional)
  AWS_REGION              - AWS region (default: us-east-1)
  COGNITO_USER_POOL_ID    - Cognito User Pool ID (empty = auth disabled)
  COGNITO_APP_CLIENT_ID   - Cognito App Client ID
  COGNITO_DOMAIN          - Cognito domain (e.g. myapp.auth.us-east-1.amazoncognito.com)
  COGNITO_REDIRECT_URI    - OAuth callback URL (default: auto-detect from request)
  REGISTRY_TABLE          - agent-registry table (default: agent-registry)
  SESSION_TABLE           - session-token-usage table (default: session-token-usage)
  INTERVENTION_TABLE      - intervention-log table (default: intervention-log)
  COST_SIGNALS_TABLE      - cost-signals table (default: cost-signals)
  OBS_SIGNALS_TABLE       - observability-signals table (default: observability-signals)
  EVAL_SIGNALS_TABLE      - evaluation-signals table (default: evaluation-signals)
  BUDGET_PREFIX           - AWS Budget name prefix (default: agent-)
  STOP_SESSIONS_LAMBDA    - Lambda for bulk stop (default: AgentSafety-StopSessions)
  ALLOWED_ORIGINS         - Comma-separated CORS origins (default: * for all)
"""

import json as _json
import logging
import os
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel

from ava_sso import (
    AVA_SSO_ENABLED,
    AVA_UI_LOGIN_URL,
    verify_ava_session,
)

try:
    from jose import jwt, JWTError, jwk
    JOSE_AVAILABLE = True
except ImportError:
    JOSE_AVAILABLE = False

# ---------------------------------------------------------------------------
# Config — all from environment variables
# ---------------------------------------------------------------------------
AWS_PROFILE = os.environ.get("AWS_PROFILE", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
REGISTRY_TABLE = os.environ.get("REGISTRY_TABLE", "agent-registry")
SESSION_TABLE = os.environ.get("SESSION_TABLE", "session-token-usage")
INTERVENTION_TABLE = os.environ.get("INTERVENTION_TABLE", "intervention-log")
COST_SIGNALS_TABLE = os.environ.get("COST_SIGNALS_TABLE", "cost-signals")
OBS_SIGNALS_TABLE = os.environ.get("OBS_SIGNALS_TABLE", "observability-signals")
EVAL_SIGNALS_TABLE = os.environ.get("EVAL_SIGNALS_TABLE", "evaluation-signals")
BUDGET_PREFIX = os.environ.get("BUDGET_PREFIX", "agent-")
STOP_SESSIONS_LAMBDA = os.environ.get("STOP_SESSIONS_LAMBDA", "AgentSafety-StopSessions")
KILL_SWITCH_LAMBDA = os.environ.get("KILL_SWITCH_LAMBDA", "agent-safety-kill-switch-KillSwitch")
AGENT_REGISTRY_REGION = os.environ.get("AGENT_REGISTRY_REGION", "") or AWS_REGION
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")

# CloudFront origin verification — set by CF template when CloudFront is enabled
# When set, only requests with this header value are allowed (rejects direct ALB access)
ORIGIN_VERIFY_HEADER = os.environ.get("ORIGIN_VERIFY_HEADER", "")

# Cognito auth — leave empty to disable auth (local dev mode)
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
COGNITO_APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID", "")
COGNITO_DOMAIN = os.environ.get("COGNITO_DOMAIN", "")
COGNITO_REDIRECT_URI = os.environ.get("COGNITO_REDIRECT_URI", "")
COGNITO_REGION = os.environ.get("COGNITO_REGION", "") or AWS_REGION
AUTH_ENABLED = bool(COGNITO_USER_POOL_ID and COGNITO_APP_CLIENT_ID)

ACTIVE_THRESHOLD_MIN = int(os.environ.get("ACTIVE_THRESHOLD_MIN", "6"))
IDLE_THRESHOLD_MIN = int(os.environ.get("IDLE_THRESHOLD_MIN", "30"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# AWS Clients — lazy init for portability
# ---------------------------------------------------------------------------
_session_kwargs: dict[str, str] = {"region_name": AWS_REGION}
if AWS_PROFILE:
    _session_kwargs["profile_name"] = AWS_PROFILE

_clients: dict[str, Any] = {}
AWS_ACCOUNT_ID = os.environ.get("AWS_ACCOUNT_ID", "")


def _get_session():
    if "session" not in _clients:
        _clients["session"] = boto3.Session(**_session_kwargs)
    return _clients["session"]


def _get_client(name: str):
    if name not in _clients:
        try:
            retry_cfg = Config(retries={"max_attempts": 3, "mode": "adaptive"})
            _clients[name] = _get_session().client(name, config=retry_cfg)
        except Exception as e:
            logger.warning(f"Cannot create {name} client: {e}")
            _clients[name] = None
    return _clients[name]


def _get_dynamodb():
    if "dynamodb" not in _clients:
        try:
            _clients["dynamodb"] = _get_session().resource("dynamodb", region_name=AWS_REGION)
        except Exception as e:
            logger.warning(f"Cannot create DynamoDB resource: {e}")
            _clients["dynamodb"] = None
    return _clients["dynamodb"]


def _get_account_id() -> str:
    global AWS_ACCOUNT_ID
    if not AWS_ACCOUNT_ID:
        try:
            sts = _get_client("sts")
            if sts:
                AWS_ACCOUNT_ID = sts.get_caller_identity()["Account"]
        except Exception:
            pass
    return AWS_ACCOUNT_ID


def _get_dynamo_table(table_name: str):
    ddb = _get_dynamodb()
    if not ddb:
        return None
    try:
        table = ddb.Table(table_name)
        table.load()
        return table
    except (ClientError, Exception):
        return None


def _classify_session_status(last_heartbeat_str: str, stored_status: str = "") -> str:
    if stored_status in ("terminated", "completed"):
        return "inactive"
    try:
        last_hb = datetime.fromisoformat(last_heartbeat_str)
        minutes_ago = (datetime.now(timezone.utc) - last_hb).total_seconds() / 60
        if minutes_ago <= ACTIVE_THRESHOLD_MIN:
            return "active"
        elif minutes_ago <= IDLE_THRESHOLD_MIN:
            return "idle"
        return "inactive"
    except (ValueError, TypeError):
        return "unknown"


def _normalize(name: str) -> str:
    return (name or "").lower().replace("-", "").replace("_", "")


logger.info(f"Dashboard config: region={AWS_REGION} | tables: registry={REGISTRY_TABLE}, sessions={SESSION_TABLE}, cost={COST_SIGNALS_TABLE}, obs={OBS_SIGNALS_TABLE}, eval={EVAL_SIGNALS_TABLE}")

# ---------------------------------------------------------------------------
# Settings — stored in registry table with special key
# ---------------------------------------------------------------------------
DEFAULT_SETTINGS = {
    "cost_warning_pct": 80,
    "cost_critical_pct": 95,
    "default_budget_usd": 2.0,
    "eval_harm_max": 1,
    "eval_bad_critical_pct": 50,
    "eval_bad_warning_pct": 20,
    "eval_harmfulness_threshold": 1,
    "eval_correctness_threshold": 1,
    "eval_goalsuccess_threshold": 1,
    "eval_helpfulness_threshold": 1,
    "eval_faithfulness_threshold": 1,
    "eval_toolselection_threshold": 1,
    "eval_toolparams_threshold": 1,
    "obs_latency_threshold": 10000,
    "obs_error_threshold": 5,
    "obs_token_threshold": 100000,
    "obs_invocation_threshold": 200,
    "obs_eval_periods": 3,
    "obs_datapoints_to_alarm": 2,
}

def _get_settings() -> dict:
    """Read settings from DynamoDB registry table (key: _settings)."""
    table = _get_dynamo_table(REGISTRY_TABLE)
    if not table:
        return dict(DEFAULT_SETTINGS)
    try:
        item = table.get_item(Key={"agent_name": "_settings"}).get("Item", {})
        result = dict(DEFAULT_SETTINGS)
        for k in DEFAULT_SETTINGS:
            if k in item:
                try:
                    result[k] = float(item[k])
                except (ValueError, TypeError):
                    pass
        return result
    except ClientError:
        return dict(DEFAULT_SETTINGS)

# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(title="Agent Safety Dashboard API", version="2.0.0")

_cors_origins = [o.strip() for o in ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_cors_origins, allow_methods=["GET", "POST"], allow_headers=["*"])

# ---------------------------------------------------------------------------
# Cognito JWT Auth Middleware
# ---------------------------------------------------------------------------
_jwks_cache: dict[str, Any] = {"keys": [], "fetched": False}

# Paths that don't require auth
AUTH_EXEMPT_PATHS = {"/", "/api/health", "/api/auth/config", "/api/auth/token"}


def _get_jwks() -> list[dict]:
    """Fetch and cache Cognito JWKS (public keys for JWT verification)."""
    if _jwks_cache["fetched"]:
        return _jwks_cache["keys"]
    if not COGNITO_USER_POOL_ID:
        return []
    jwks_url = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    try:
        with urllib.request.urlopen(jwks_url, timeout=5) as resp:
            data = _json.loads(resp.read())
            _jwks_cache["keys"] = data.get("keys", [])
            _jwks_cache["fetched"] = True
            logger.info(f"Fetched {len(_jwks_cache['keys'])} JWKS keys from Cognito")
    except Exception as e:
        logger.error(f"Failed to fetch JWKS: {e}")
    return _jwks_cache["keys"]


def _verify_token(token: str) -> dict | None:
    """Verify a Cognito JWT id_token. Returns claims dict or None."""
    if not JOSE_AVAILABLE:
        logger.warning("python-jose not installed — cannot verify JWT")
        return None
    keys = _get_jwks()
    if not keys:
        return None
    try:
        # Get the kid from token header
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        # Find matching key
        key = next((k for k in keys if k["kid"] == kid), None)
        if not key:
            return None
        # Verify and decode
        claims = jwt.decode(
            token, key, algorithms=["RS256"],
            audience=COGNITO_APP_CLIENT_ID,
            issuer=f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}",
            options={"verify_at_hash": False},
        )
        return claims
    except JWTError as e:
        logger.warning(f"JWT verification failed: {e}")
        return None


@app.middleware("http")
async def origin_verify_middleware(request: Request, call_next):
    """Reject direct ALB access when CloudFront origin verification is enabled."""
    if ORIGIN_VERIFY_HEADER:
        origin_header = request.headers.get("X-Origin-Verify", "")
        if origin_header != ORIGIN_VERIFY_HEADER:
            # Allow health check without origin verify (ALB health checks don't go through CF)
            if request.url.path == "/api/health":
                response = await call_next(request)
                return response
            return JSONResponse(status_code=403, content={"detail": "Direct access not allowed. Use the CloudFront URL."})
    response = await call_next(request)
    return response


# ---------------------------------------------------------------------------
# AVA FSI SSO middleware — runs BEFORE the Cognito auth middleware so a
# valid AVA handoff short-circuits the Cognito redirect. Dual-mode:
#
#   AVA_FSI_APP_SIGNING_SECRET set  → AVA SSO is the primary path.
#                                     Cognito middleware is bypassed for
#                                     AVA-authenticated requests. Missing
#                                     or invalid AVA cookie/token falls
#                                     through to the Cognito middleware,
#                                     which then applies its own logic
#                                     (redirect to Cognito Hosted UI or,
#                                     when AVA_UI_LOGIN_URL is set,
#                                     redirect back to AVA to log in).
#
#   AVA_FSI_APP_SIGNING_SECRET empty → AVA SSO middleware is a passthrough,
#                                     Cognito flow is unchanged. This is
#                                     the standalone-deploy path
#                                     (./deploy-all.sh from a laptop,
#                                     no control-plane involvement).
#
# See ava_sso.py for the token format and verification logic.
# ---------------------------------------------------------------------------


@app.middleware("http")
async def ava_sso_middleware(request: Request, call_next):
    """Consume an AVA handoff token or an ava_session cookie, if present.

    Three branches, mirroring case-management's jwt_auth_function.js:
      1. `?ava_token=<blob>` in query string  → bootstrap: verify, set
         httpOnly cookie, 302 to same URI without the token so the URL
         bar stays clean.
      2. `ava_session` cookie present         → verify, attach identity
         to request.state.user_email / user_sub. Downstream Cognito
         middleware sees state.ava_authenticated and skips its own check.
      3. Neither present, or verification fails → passthrough. Cognito
         middleware runs normally.
    """
    if not AVA_SSO_ENABLED:
        return await call_next(request)

    # Health path always bypasses auth (ALB probes).
    if request.url.path == "/api/health":
        return await call_next(request)

    # (1) Bootstrap — first click from the AVA UI carries ?ava_token=.
    ava_token_param = request.query_params.get("ava_token")
    if ava_token_param:
        claims = verify_ava_session(ava_token_param)
        if claims is None:
            # Bad or expired handoff — fall through to Cognito. Do NOT
            # set the cookie; Cognito middleware will 401 or redirect.
            return await call_next(request)
        # Strip ava_token from the URL, keep any other params.
        keep = [
            (k, v) for k, v in request.query_params.multi_items()
            if k != "ava_token"
        ]
        qs = "&".join(f"{k}={v}" for k, v in keep)
        clean_url = request.url.path + (f"?{qs}" if qs else "")
        resp = RedirectResponse(url=clean_url, status_code=302)
        resp.set_cookie(
            "ava_session",
            ava_token_param,
            max_age=3600,       # matches CloudFront Function Max-Age=3600
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
        )
        return resp

    # (2) Cookie — every subsequent request rides this branch.
    cookie_token = request.cookies.get("ava_session")
    if cookie_token:
        claims = verify_ava_session(cookie_token)
        if claims:
            # Attach identity in the same shape the Cognito middleware
            # would use, so any downstream code reading request.state
            # sees a uniform contract regardless of auth path.
            request.state.user_email = claims.get("email", "ava-user")
            request.state.user_sub = claims.get("sub", "")
            request.state.ava_authenticated = True
            return await call_next(request)

    # (3) No AVA session, or invalid one. Let the Cognito middleware
    # (or fallback logic below) handle the request.
    return await call_next(request)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Validate Cognito JWT on every request (when auth is enabled).

    Skipped when the caller has already been authenticated by the
    upstream AVA SSO middleware (request.state.ava_authenticated=True).
    """
    # Already authenticated by AVA SSO — pass through untouched.
    if getattr(request.state, "ava_authenticated", False):
        return await call_next(request)

    if not AUTH_ENABLED:
        # Auth disabled — pass through
        response = await call_next(request)
        return response

    # Skip auth for exempt paths
    if request.url.path in AUTH_EXEMPT_PATHS:
        response = await call_next(request)
        return response

    # Extract token from Authorization header
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        # In AVA-federated mode with a login URL configured, redirect a
        # top-level browser navigation back to AVA to authenticate. API
        # (XHR) callers still get 401 so the frontend can react. We
        # detect browser navigations by looking for a top-level Accept
        # header containing text/html.
        if AVA_SSO_ENABLED and AVA_UI_LOGIN_URL and "text/html" in request.headers.get("accept", ""):
            return RedirectResponse(url=AVA_UI_LOGIN_URL, status_code=302)
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid Authorization header"})

    token = auth_header[7:]  # Strip "Bearer "
    claims = _verify_token(token)
    if not claims:
        return JSONResponse(status_code=401, content={"detail": "Invalid or expired token"})

    # Attach user info to request state for downstream use
    request.state.user_email = claims.get("email", "unknown")
    request.state.user_sub = claims.get("sub", "")

    response = await call_next(request)
    return response


if AVA_SSO_ENABLED:
    logger.info("AVA SSO ENABLED — HMAC handoff via ava_session cookie is the primary auth path")
if AUTH_ENABLED:
    logger.info(f"Cognito auth ENABLED: pool={COGNITO_USER_POOL_ID}, client={COGNITO_APP_CLIENT_ID}")
else:
    logger.info("Cognito auth DISABLED (no COGNITO_USER_POOL_ID set) — all endpoints are open")




@app.get("/")
async def serve_dashboard():
    return FileResponse("index.html", media_type="text/html")


# ---------------------------------------------------------------------------
# Auth Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/auth/config")
async def auth_config(request: Request):
    """Return Cognito config for the frontend. No auth required.

    When AVA SSO is enabled we report `enabled: false` so index.html's
    existing "auth disabled, show app immediately" branch fires. The
    user still needs a valid `ava_session` cookie to hit any protected
    endpoint — the AVA SSO middleware enforces that server-side — but
    the frontend never tries to render the Cognito Hosted UI login,
    which is what produces the visible login screen users don't want.
    """
    if AVA_SSO_ENABLED:
        return {
            "enabled": False,
            "userPoolId": "",
            "clientId": "",
            "domain": "",
            "region": COGNITO_REGION,
            "redirectUri": "",
            "avaSsoEnabled": True,
        }
    # Auto-detect redirect URI from request if not set via env var
    # When behind CloudFront, the Host header is the ALB hostname (not CloudFront),
    # so we return empty and let the frontend use window.location.origin instead.
    redirect_uri = COGNITO_REDIRECT_URI
    if not redirect_uri and not ORIGIN_VERIFY_HEADER:
        # Not behind CloudFront — safe to auto-detect from Host header
        host = request.headers.get("host", "")
        scheme = request.headers.get("x-forwarded-proto", "https")
        if host:
            redirect_uri = f"{scheme}://{host}"
    return {
        "enabled": AUTH_ENABLED,
        "userPoolId": COGNITO_USER_POOL_ID,
        "clientId": COGNITO_APP_CLIENT_ID,
        "domain": COGNITO_DOMAIN,
        "region": COGNITO_REGION,
        "redirectUri": redirect_uri,
        "avaSsoEnabled": False,
    }


@app.post("/api/auth/token")
async def exchange_token(request: Request):
    """Exchange Cognito auth code for tokens. No auth required (this IS the login)."""
    body = await request.json()
    code = body.get("code", "")
    redirect_uri = body.get("redirect_uri", COGNITO_REDIRECT_URI)

    if not code or not COGNITO_DOMAIN:
        raise HTTPException(status_code=400, detail="code and COGNITO_DOMAIN required")

    # Exchange code for tokens via Cognito token endpoint
    token_url = f"https://{COGNITO_DOMAIN}/oauth2/token"
    data = (
        f"grant_type=authorization_code&code={code}"
        f"&client_id={COGNITO_APP_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
    ).encode()

    req = urllib.request.Request(token_url, data=data, method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            tokens = _json.loads(resp.read())
            return {
                "id_token": tokens.get("id_token", ""),
                "access_token": tokens.get("access_token", ""),
                "refresh_token": tokens.get("refresh_token", ""),
                "expires_in": tokens.get("expires_in", 3600),
            }
    except Exception as e:
        logger.error(f"Token exchange failed: {e}")
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {e}")


class StopSessionRequest(BaseModel):
    agent_runtime_id: str
    session_id: str
    reason: str
    admin_user: str


class StopAllSessionsRequest(BaseModel):
    agent_name: str
    reason: str
    admin_user: str
    session_id: str | None = None


class SetBudgetRequest(BaseModel):
    agent_name: str
    monthly_budget_usd: float


class KillSwitchRequest(BaseModel):
    reason: str
    admin_user: str


class AgentRevokeRequest(BaseModel):
    agent_name: str
    reason: str
    admin_user: str


class SettingsRequest(BaseModel):
    cost_warning_pct: float | None = None
    cost_critical_pct: float | None = None
    default_budget_usd: float | None = None
    eval_harm_max: float | None = None
    eval_bad_critical_pct: float | None = None
    eval_bad_warning_pct: float | None = None
    eval_harmfulness_threshold: float | None = None
    eval_correctness_threshold: float | None = None
    eval_goalsuccess_threshold: float | None = None
    eval_helpfulness_threshold: float | None = None
    eval_faithfulness_threshold: float | None = None
    eval_toolselection_threshold: float | None = None
    eval_toolparams_threshold: float | None = None
    obs_latency_threshold: float | None = None
    obs_error_threshold: float | None = None
    obs_token_threshold: float | None = None
    obs_invocation_threshold: float | None = None
    obs_eval_periods: float | None = None
    obs_datapoints_to_alarm: float | None = None


# ===================================================================
# SETTINGS ENDPOINTS
# ===================================================================

@app.get("/api/settings")
async def get_settings():
    """Return current dashboard settings."""
    return _get_settings()


@app.post("/api/settings")
async def save_settings(req: SettingsRequest):
    """Save dashboard settings to DynamoDB and apply budget changes to AWS."""
    table = _get_dynamo_table(REGISTRY_TABLE)
    if not table:
        raise HTTPException(status_code=500, detail=f"{REGISTRY_TABLE} not found")
    settings = _get_settings()
    # Only update fields that were provided
    if req.cost_warning_pct is not None:
        settings["cost_warning_pct"] = req.cost_warning_pct
    if req.cost_critical_pct is not None:
        settings["cost_critical_pct"] = req.cost_critical_pct
    if req.default_budget_usd is not None:
        settings["default_budget_usd"] = req.default_budget_usd
    if req.eval_harm_max is not None:
        settings["eval_harm_max"] = req.eval_harm_max
    if req.eval_bad_critical_pct is not None:
        settings["eval_bad_critical_pct"] = req.eval_bad_critical_pct
    if req.eval_bad_warning_pct is not None:
        settings["eval_bad_warning_pct"] = req.eval_bad_warning_pct
    for field in ["eval_harmfulness_threshold", "eval_correctness_threshold", "eval_goalsuccess_threshold",
                  "eval_helpfulness_threshold", "eval_faithfulness_threshold",
                  "eval_toolselection_threshold", "eval_toolparams_threshold",
                  "obs_latency_threshold", "obs_error_threshold", "obs_token_threshold",
                  "obs_invocation_threshold", "obs_eval_periods", "obs_datapoints_to_alarm"]:
        val = getattr(req, field, None)
        if val is not None:
            settings[field] = val
    # Save to DynamoDB
    try:
        item = {"agent_name": "_settings"}
        for k, v in settings.items():
            item[k] = str(v)
        table.put_item(Item=item)
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # If budget amount changed, update all AWS Budgets
    budget_results = {}
    if req.default_budget_usd is not None:
        budget_results = _apply_budget_amount(req.default_budget_usd)

    # If any eval threshold changed, update CloudWatch eval alarms
    eval_results = {}
    eval_fields = ["eval_harmfulness_threshold", "eval_correctness_threshold", "eval_goalsuccess_threshold",
                   "eval_helpfulness_threshold", "eval_faithfulness_threshold",
                   "eval_toolselection_threshold", "eval_toolparams_threshold"]
    if any(getattr(req, f, None) is not None for f in eval_fields):
        eval_results = _apply_eval_alarm_thresholds(settings)

    # If any obs setting changed, update CloudWatch anomaly alarms
    obs_results = {}
    obs_fields = ["obs_latency_threshold", "obs_error_threshold", "obs_token_threshold",
                  "obs_invocation_threshold", "obs_eval_periods", "obs_datapoints_to_alarm"]
    if any(getattr(req, f, None) is not None for f in obs_fields):
        obs_results = _apply_obs_alarm_settings(settings)

    return {"status": "ok", "settings": settings, "budget_updates": budget_results, "eval_updates": eval_results, "obs_updates": obs_results}


def _apply_budget_amount(new_amount: float) -> dict:
    """Update all agent-* AWS Budgets to the new amount."""
    budgets_client = _get_client("budgets")
    account_id = _get_account_id()
    if not budgets_client or not account_id:
        return {"status": "skipped", "detail": "Budgets client or account ID unavailable"}

    updated = 0
    errors = []
    try:
        for page in budgets_client.get_paginator("describe_budgets").paginate(AccountId=account_id):
            for b in page.get("Budgets", []):
                name = b.get("BudgetName", "")
                if not name.startswith(BUDGET_PREFIX):
                    continue
                try:
                    # Update the budget limit
                    b["BudgetLimit"]["Amount"] = str(new_amount)
                    budgets_client.update_budget(
                        AccountId=account_id,
                        NewBudget=b,
                    )
                    updated += 1
                    logger.info(f"Budget updated: {name} → ${new_amount}")
                except ClientError as e:
                    errors.append(f"{name}: {e}")
                    logger.warning(f"Failed to update budget {name}: {e}")
    except ClientError as e:
        return {"status": "error", "detail": str(e)}

    # Also update cost-signals DynamoDB to reflect new limit immediately
    cost_table = _get_dynamo_table(COST_SIGNALS_TABLE)
    if cost_table:
        try:
            for item in cost_table.scan().get("Items", []):
                actual = float(item.get("actual_spend_usd", 0))
                forecast = float(item.get("forecasted_spend_usd", 0))
                pct = (actual / new_amount * 100) if new_amount > 0 else 0
                fpct = (forecast / new_amount * 100) if new_amount > 0 else 0
                _s = _get_settings()
                sev = "critical" if pct >= _s.get("cost_critical_pct", 95) else ("medium" if pct >= _s.get("cost_warning_pct", 80) or fpct >= _s.get("cost_critical_pct", 95) else "low")
                cost_table.update_item(
                    Key={"agent_name": item["agent_name"]},
                    UpdateExpression="SET budget_limit_usd = :lim, pct_used = :pct, forecast_pct = :fpct, severity = :sev",
                    ExpressionAttributeValues={
                        ":lim": str(round(new_amount, 2)),
                        ":pct": str(round(pct, 1)),
                        ":fpct": str(round(fpct, 1)),
                        ":sev": sev,
                    },
                )
        except ClientError:
            pass

    return {"status": "ok", "budgets_updated": updated, "errors": errors}


def _apply_eval_alarm_thresholds(settings: dict) -> dict:
    """Update all AgentSafety-Eval-* CloudWatch alarms with new per-evaluator thresholds.

    The alarm uses a math expression that sums bad counts across evaluators.
    We rebuild the expression to only include evaluators whose threshold > 0,
    and set the alarm threshold to the sum of individual thresholds.
    """
    cw = _get_client("cloudwatch")
    if not cw:
        return {"status": "skipped", "detail": "CloudWatch client unavailable"}

    # Map settings keys to metric IDs in the alarm
    # The alarm has: h(harmfulness), c1+c2(correctness), g(goal), u1+u2(helpfulness), f1+f2(faithfulness)
    # We compute a combined threshold: sum of all individual thresholds
    harm_t = int(settings.get("eval_harmfulness_threshold", 1))
    corr_t = int(settings.get("eval_correctness_threshold", 1))
    goal_t = int(settings.get("eval_goalsuccess_threshold", 1))
    help_t = int(settings.get("eval_helpfulness_threshold", 1))
    faith_t = int(settings.get("eval_faithfulness_threshold", 1))
    tool_sel_t = int(settings.get("eval_toolselection_threshold", 1))
    tool_par_t = int(settings.get("eval_toolparams_threshold", 1))

    # The alarm threshold = 1 means "fire when total bad >= 1"
    # We set it to the minimum non-zero threshold so it fires early
    thresholds = [t for t in [harm_t, corr_t, goal_t, help_t, faith_t, tool_sel_t, tool_par_t] if t > 0]
    alarm_threshold = min(thresholds) if thresholds else 1

    # Find all eval alarms
    updated = 0
    errors = []
    try:
        for page in cw.get_paginator("describe_alarms").paginate(
            AlarmNamePrefix="AgentSafety-Eval-", AlarmTypes=["MetricAlarm"]
        ):
            for alarm in page.get("MetricAlarms", []):
                alarm_name = alarm.get("AlarmName", "")
                try:
                    # Update the threshold
                    cw.put_metric_alarm(
                        AlarmName=alarm_name,
                        AlarmDescription=alarm.get("AlarmDescription", ""),
                        Metrics=alarm.get("Metrics", []),
                        EvaluationPeriods=alarm.get("EvaluationPeriods", 1),
                        Threshold=float(alarm_threshold),
                        ComparisonOperator=alarm.get("ComparisonOperator", "GreaterThanOrEqualToThreshold"),
                        TreatMissingData=alarm.get("TreatMissingData", "notBreaching"),
                        AlarmActions=alarm.get("AlarmActions", []),
                        OKActions=alarm.get("OKActions", []),
                    )
                    updated += 1
                    logger.info(f"Eval alarm updated: {alarm_name} → threshold={alarm_threshold}")
                except ClientError as e:
                    errors.append(f"{alarm_name}: {e}")
                    logger.warning(f"Failed to update eval alarm {alarm_name}: {e}")
    except ClientError as e:
        return {"status": "error", "detail": str(e)}

    return {"status": "ok", "alarms_updated": updated, "threshold": alarm_threshold, "errors": errors}


def _apply_obs_alarm_settings(settings: dict) -> dict:
    """Update all observability threshold alarms with new settings."""
    cw = _get_client("cloudwatch")
    if not cw:
        return {"status": "skipped", "detail": "CloudWatch client unavailable"}

    eval_periods = int(settings.get("obs_eval_periods", 3))
    datapoints = int(settings.get("obs_datapoints_to_alarm", 2))

    obs_ns = "AgentCore/Agents"
    alarm_defs = [
        {"suffix": "high-latency", "metric": "InvocationLatency", "stat": "Average",
         "threshold": float(settings.get("obs_latency_threshold", 10000)),
         "desc": "High latency — avg response time exceeds threshold"},
        {"suffix": "error-rate", "metric": "InvocationError", "stat": "Sum",
         "threshold": float(settings.get("obs_error_threshold", 5)),
         "desc": "Error rate — errors per period exceed threshold"},
        {"suffix": "token-usage", "metric": "TotalTokens", "stat": "Sum",
         "threshold": float(settings.get("obs_token_threshold", 100000)),
         "desc": "Token usage — tokens per period exceed threshold"},
        {"suffix": "invocation-count", "metric": "InvocationCount", "stat": "Sum",
         "threshold": float(settings.get("obs_invocation_threshold", 200)),
         "desc": "Invocation count — invocations per period exceed threshold"},
    ]

    updated = 0
    errors = []
    try:
        composites = []
        for page in cw.get_paginator("describe_alarms").paginate(AlarmTypes=["CompositeAlarm"]):
            for a in page.get("CompositeAlarms", []):
                if a.get("AlarmName", "").endswith("-composite"):
                    composites.append(a)

        for comp in composites:
            comp_name = comp["AlarmName"]
            agent_name = comp_name.replace("-composite", "")

            for ad in alarm_defs:
                alarm_name = f"{agent_name}-{ad['suffix']}"
                try:
                    cw.put_metric_alarm(
                        AlarmName=alarm_name,
                        AlarmDescription=f"{ad['desc']} for {agent_name}",
                        Namespace=obs_ns,
                        MetricName=ad["metric"],
                        Dimensions=[{"Name": "AgentName", "Value": agent_name}],
                        Statistic=ad["stat"],
                        Period=300,
                        EvaluationPeriods=eval_periods,
                        DatapointsToAlarm=min(datapoints, eval_periods),
                        Threshold=ad["threshold"],
                        ComparisonOperator="GreaterThanThreshold",
                        TreatMissingData="notBreaching",
                    )
                    updated += 1
                except ClientError as e:
                    errors.append(f"{alarm_name}: {e}")
                    logger.warning(f"Failed to update obs alarm {alarm_name}: {e}")

    except ClientError as e:
        return {"status": "error", "detail": str(e)}

    return {"status": "ok", "alarms_updated": updated,
            "eval_periods": eval_periods, "datapoints": datapoints, "errors": errors}


# ===================================================================
# READ ENDPOINTS — All read from DynamoDB only
# ===================================================================

@app.get("/api/registry")
async def list_registry():
    table = _get_dynamo_table(REGISTRY_TABLE)
    if not table:
        return {"agents": [], "source": "table_not_found"}
    try:
        items = table.scan().get("Items", [])
        # Filter out the _settings item (used for dashboard config, not an agent)
        agents = [i for i in items if not i.get("agent_name", "").startswith("_")]
        return {"agents": agents}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/registry/{agent_name}")
async def get_registry_agent(agent_name: str):
    table = _get_dynamo_table(REGISTRY_TABLE)
    if not table:
        raise HTTPException(status_code=500, detail=f"{REGISTRY_TABLE} not found")
    try:
        item = table.get_item(Key={"agent_name": agent_name}).get("Item")
        if not item:
            raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
        return item
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agent-registry")
async def list_agent_registry_records():
    """List all records from AWS Agent Registry (agents, tools, MCP servers, skills)."""
    # Agent Registry is only available in certain regions (preview)
    AGENT_REGISTRY_SUPPORTED_REGIONS = {"us-east-1", "us-west-2", "ap-northeast-1", "ap-southeast-2", "eu-west-1"}
    if AGENT_REGISTRY_REGION not in AGENT_REGISTRY_SUPPORTED_REGIONS:
        return {
            "records": [], "registries": [], "total_records": 0,
            "region": AGENT_REGISTRY_REGION,
            "region_unsupported": True,
            "supported_regions": sorted(AGENT_REGISTRY_SUPPORTED_REGIONS),
            "error": f"Agent Registry is not available in {AGENT_REGISTRY_REGION}. "
                     f"It is currently available in: {', '.join(sorted(AGENT_REGISTRY_SUPPORTED_REGIONS))}. "
                     f"Deploy the dashboard in a supported region or set AGENT_REGISTRY_REGION to override.",
        }

    try:
        ctrl = _get_session().client(
            "bedrock-agentcore-control",
            region_name=AGENT_REGISTRY_REGION,
            config=Config(retries={"max_attempts": 3, "mode": "adaptive"}),
        )
    except Exception as e:
        return {"records": [], "registries": [], "error": f"Cannot create client for {AGENT_REGISTRY_REGION}: {e}"}

    # 1. List registries
    registries = []
    try:
        resp = ctrl.list_registries(status="READY")
        registries = resp.get("registries", [])
    except ClientError as e:
        return {"records": [], "registries": [], "error": f"list_registries failed: {e}"}
    except Exception as e:
        return {"records": [], "registries": [], "error": f"Agent Registry API unavailable: {e}"}

    if not registries:
        return {"records": [], "registries": [], "detail": "No registries found"}

    # 2. List records from each registry
    all_records = []
    for reg in registries:
        rid = reg.get("registryId", "")
        reg_name = reg.get("name", "")
        try:
            paginator = ctrl.get_paginator("list_registry_records")
            for page in paginator.paginate(registryId=rid):
                for rec in page.get("registryRecords", []):
                    rec["_registryName"] = reg_name
                    rec["_registryId"] = rid
                    # Convert datetimes to strings
                    for k in ("createdAt", "updatedAt"):
                        if hasattr(rec.get(k), "isoformat"):
                            rec[k] = rec[k].isoformat()
                    all_records.append(rec)
        except ClientError as e:
            logger.warning(f"list_registry_records failed for {rid}: {e}")

    # Serialize registry datetimes
    for reg in registries:
        for k in ("createdAt", "updatedAt"):
            if hasattr(reg.get(k), "isoformat"):
                reg[k] = reg[k].isoformat()

    return {
        "records": all_records,
        "registries": registries,
        "total_records": len(all_records),
        "total_registries": len(registries),
        "region": AGENT_REGISTRY_REGION,
    }


@app.get("/api/sessions")
async def list_sessions(agent_id: str | None = None):
    table = _get_dynamo_table(SESSION_TABLE)
    if not table:
        return {"sessions": [], "source": "table_not_found"}
    try:
        sessions = table.scan().get("Items", [])
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = []
    for s in sessions:
        s["computed_status"] = _classify_session_status(s.get("last_heartbeat", ""), s.get("status", ""))
        if s["computed_status"] == "inactive" and s.get("status") not in ("terminated", "completed"):
            s["status"] = "terminated"
            try:
                table.update_item(Key={"session_id": s["session_id"]}, UpdateExpression="SET #st = :s",
                    ExpressionAttributeNames={"#st": "status"}, ExpressionAttributeValues={":s": "terminated"})
            except ClientError:
                pass
        if agent_id and agent_id not in s.get("agent_runtime_arn", "") and agent_id not in s.get("agent_name", ""):
            continue
        result.append(s)

    status_order = {"active": 0, "idle": 1, "inactive": 2, "unknown": 3}
    result.sort(key=lambda x: (status_order.get(x["computed_status"], 9), x.get("last_heartbeat", "")))
    return {"sessions": result}


@app.get("/api/sessions/agent/{agent_name}")
async def list_agent_sessions(agent_name: str):
    norm_target = _normalize(agent_name)
    table = _get_dynamo_table(SESSION_TABLE)
    if not table:
        return {"sessions": [], "source": "table_not_found"}
    try:
        all_sessions = table.scan().get("Items", [])
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))
    result = []
    for s in all_sessions:
        if _normalize(s.get("agent_name", "")) != norm_target:
            continue
        s["computed_status"] = _classify_session_status(s.get("last_heartbeat", ""), s.get("status", ""))
        result.append(s)
    return {"sessions": result, "source": "dynamodb"}


@app.get("/api/interventions")
async def list_interventions(limit: int = 50):
    table = _get_dynamo_table(INTERVENTION_TABLE)
    if not table:
        return {"interventions": [], "source": "table_not_found"}
    try:
        items = table.scan(Limit=limit).get("Items", [])
        items.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return {"interventions": items}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/cost-signals")
async def get_cost_signals():
    table = _get_dynamo_table(COST_SIGNALS_TABLE)
    if not table:
        return {"signals": [], "source": "table_not_found"}
    try:
        signals = table.scan().get("Items", [])
        sev = {"critical": 0, "medium": 1, "low": 2}
        signals.sort(key=lambda x: (sev.get(x.get("severity", "low"), 9), -float(x.get("pct_used", 0))))
        return {"signals": signals}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/obs-signals")
async def get_obs_signals():
    table = _get_dynamo_table(OBS_SIGNALS_TABLE)
    if not table:
        return {"signals": [], "source": "table_not_found"}
    try:
        signals = table.scan().get("Items", [])
        sev = {"critical": 0, "medium": 1, "low": 2}
        signals.sort(key=lambda x: (sev.get(x.get("severity", "low"), 9), x.get("agent_name", "")))
        return {"signals": signals}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/obs-signals/{agent_name}/child-alarms")
async def get_obs_child_alarms(agent_name: str):
    """Return individual CloudWatch anomaly alarms for an agent (children of the composite)."""
    cw = _get_client("cloudwatch")
    if not cw:
        return {"alarms": [], "detail": "CloudWatch client unavailable"}

    suffixes = ["high-latency", "error-rate", "token-usage", "invocation-count"]
    child_names = [f"{agent_name}-{s}" for s in suffixes]

    try:
        resp = cw.describe_alarms(AlarmNames=child_names, AlarmTypes=["MetricAlarm"])
        alarms = []
        for a in resp.get("MetricAlarms", []):
            state = a.get("StateValue", "INSUFFICIENT_DATA")
            alarms.append({
                "alarm_name": a.get("AlarmName", ""),
                "state": state,
                "severity": "critical" if state == "ALARM" else ("medium" if state == "INSUFFICIENT_DATA" else "low"),
                "metric": a.get("MetricName", ""),
                "stat": a.get("Statistic", a.get("ExtendedStatistic", "")),
                "state_reason": a.get("StateReason", "") if state == "ALARM" else "",
                "state_updated": a.get("StateUpdatedTimestamp", "").isoformat() if hasattr(a.get("StateUpdatedTimestamp", ""), "isoformat") else str(a.get("StateUpdatedTimestamp", "")),
            })
        return {"alarms": alarms, "agent_name": agent_name}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/eval-signals")
async def get_eval_signals(endpoint: str | None = None):
    table = _get_dynamo_table(EVAL_SIGNALS_TABLE)
    if not table:
        return {"signals": [], "endpoints": [], "source": "table_not_found"}
    try:
        signals = table.scan().get("Items", [])

        # Extract endpoint from signal_key for items that don't have explicit endpoint field
        for s in signals:
            if "endpoint" not in s:
                sk = s.get("signal_key", "")
                if "#" in sk:
                    s["endpoint"] = sk.rsplit("#", 1)[1]
                else:
                    s["endpoint"] = "DEFAULT"

        # Collect unique endpoints for the dropdown
        endpoints = sorted(set(s.get("endpoint", "DEFAULT") for s in signals))

        # Filter by endpoint if requested
        if endpoint:
            signals = [s for s in signals if s.get("endpoint", "DEFAULT") == endpoint]

        sev = {"critical": 0, "medium": 1, "low": 2}
        signals.sort(key=lambda x: (sev.get(x.get("severity", "low"), 9), x.get("agent_name", ""), x.get("endpoint", "")))
        return {"signals": signals, "endpoints": endpoints}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===================================================================
# WRITE ENDPOINTS — Stop sessions, set budgets
# ===================================================================

def _cascade_session_terminated(agent_name: str, session_id: str):
    """Update signal tables when a session is stopped."""
    norm = _normalize(agent_name)
    now_iso = datetime.now(timezone.utc).isoformat()

    cost_table = _get_dynamo_table(COST_SIGNALS_TABLE)
    if cost_table:
        try:
            cost_table.update_item(Key={"agent_name": agent_name},
                UpdateExpression="SET last_action = :a, last_action_at = :t, last_action_session_id = :s",
                ExpressionAttributeValues={":a": "session_stopped", ":t": now_iso, ":s": session_id})
        except ClientError:
            pass

    obs_table = _get_dynamo_table(OBS_SIGNALS_TABLE)
    if obs_table:
        try:
            for item in obs_table.scan().get("Items", []):
                if _normalize(item.get("agent_name", "")) == norm:
                    obs_table.update_item(Key={"agent_name": item["agent_name"], "signal_key": item["signal_key"]},
                        UpdateExpression="SET last_action = :a, last_action_at = :t",
                        ExpressionAttributeValues={":a": "session_stopped", ":t": now_iso})
        except ClientError:
            pass

    eval_table = _get_dynamo_table(EVAL_SIGNALS_TABLE)
    if eval_table:
        try:
            for item in eval_table.scan().get("Items", []):
                if _normalize(item.get("agent_name", "")) == norm:
                    eval_table.update_item(Key={"agent_name": item["agent_name"], "signal_key": item["signal_key"]},
                        UpdateExpression="SET last_action = :a, last_action_at = :t",
                        ExpressionAttributeValues={":a": "session_stopped", ":t": now_iso})
        except ClientError:
            pass


def _notify_creator_of_stop(agent_name: str, reason: str, admin_user: str, session_id: str = ""):
    """Send SNS notification to the agent creator when their agent is stopped."""
    reg_table = _get_dynamo_table(REGISTRY_TABLE)
    if not reg_table:
        return
    try:
        item = reg_table.get_item(Key={"agent_name": agent_name}).get("Item", {})
        creator_email = item.get("creator_email", "")
        if not creator_email:
            return
    except ClientError:
        return

    sns = _get_client("sns")
    if not sns:
        return

    topic_name = f"agent-stop-notify-{creator_email.split('@')[0].replace('.', '-').replace('+', '-')}"
    try:
        topic_arn = sns.create_topic(Name=topic_name)["TopicArn"]
        subject = f"Agent Stop Action: {agent_name}"
        message = (
            f"An administrator has initiated a stop action on your agent '{agent_name}'.\n\n"
            f"Initiated by: {admin_user}\n"
            f"Reason: {reason}\n"
            + (f"Session(s): {session_id}\n" if session_id else "")
            + f"Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"
            f"If this was unexpected, please contact your administrator."
        )
        sns.publish(TopicArn=topic_arn, Subject=subject, Message=message)
    except ClientError as e:
        logger.warning(f"Failed to notify creator {creator_email} for {agent_name}: {e}")


@app.post("/api/interventions/stop-session")
async def stop_session(req: StopSessionRequest):
    if not req.reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    if not req.admin_user.strip():
        raise HTTPException(status_code=400, detail="admin_user is required")

    ctrl = _get_client("bedrock-agentcore-control")
    if not ctrl:
        raise HTTPException(status_code=503, detail="AgentCore client unavailable")

    try:
        rt = ctrl.get_agent_runtime(agentRuntimeId=req.agent_runtime_id)
        agent_runtime_arn = rt["agentRuntimeArn"]
        agent_name = rt["agentRuntimeName"]
    except ClientError as e:
        raise HTTPException(status_code=404, detail=f"Runtime {req.agent_runtime_id} not found")

    data_client = _get_client("bedrock-agentcore")
    client_token = f"stop-{req.session_id}-{uuid.uuid5(uuid.NAMESPACE_DNS, req.session_id)}"
    stop_result, stop_error = "stopped", ""
    try:
        data_client.stop_runtime_session(agentRuntimeArn=agent_runtime_arn, runtimeSessionId=req.session_id, clientToken=client_token)
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("ResourceNotFoundException", "404"):
            stop_result = "not_found"
        elif code == "ConflictException":
            stop_result = "already_stopping"
        else:
            stop_result, stop_error = "error", str(e)

    sess_table = _get_dynamo_table(SESSION_TABLE)
    if sess_table and stop_result in ("stopped", "already_stopping", "not_found"):
        try:
            sess_table.update_item(Key={"session_id": req.session_id}, UpdateExpression="SET #st = :s",
                ExpressionAttributeNames={"#st": "status"}, ExpressionAttributeValues={":s": "terminated"})
        except ClientError:
            pass

    intervention_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    int_table = _get_dynamo_table(INTERVENTION_TABLE)
    if int_table:
        item = {"intervention_id": intervention_id, "timestamp": now, "agent_runtime_arn": agent_runtime_arn,
            "agent_name": agent_name, "session_id": req.session_id, "action": "stop_session",
            "triggered_by": "human", "reason": req.reason, "admin_user": req.admin_user,
            "stop_result": stop_result, "rollback_status": "none"}
        if stop_error:
            item["error_detail"] = stop_error
        int_table.put_item(Item=item)

    if stop_result in ("stopped", "already_stopping"):
        _cascade_session_terminated(agent_name, req.session_id)
        _notify_creator_of_stop(agent_name, req.reason, req.admin_user, req.session_id)
    return {"status": stop_result, "intervention_id": intervention_id, "session_id": req.session_id, "agent_name": agent_name}


@app.post("/api/interventions/stop-all-sessions")
async def stop_all_sessions(req: StopAllSessionsRequest):
    if not req.reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    if not req.admin_user.strip():
        raise HTTPException(status_code=400, detail="admin_user is required")

    import json as _json
    lam = _get_client("lambda")
    if not lam:
        raise HTTPException(status_code=503, detail="Lambda client unavailable")
    try:
        response = lam.invoke(FunctionName=STOP_SESSIONS_LAMBDA, InvocationType="RequestResponse",
            Payload=_json.dumps({"agent_name": req.agent_name, "reason": req.reason, "admin_user": req.admin_user, "session_id": req.session_id or ""}))
        payload = _json.loads(response["Payload"].read())
        result = _json.loads(payload["body"]) if isinstance(payload.get("body"), str) else payload
        if payload.get("statusCode", 200) >= 400:
            raise HTTPException(status_code=payload["statusCode"], detail=result.get("error", "Lambda error"))
        for r in result.get("results", []):
            if r.get("status") in ("stopped", "not_found", "already_stopping"):
                _cascade_session_terminated(req.agent_name, r.get("session_id", ""))
        if any(r.get("status") in ("stopped", "not_found", "already_stopping") for r in result.get("results", [])):
            stopped_ids = [r["session_id"] for r in result.get("results", []) if r.get("status") in ("stopped", "not_found", "already_stopping")]
            _notify_creator_of_stop(req.agent_name, req.reason, req.admin_user, ", ".join(stopped_ids))
        return result
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"Lambda invoke failed: {e}")


@app.post("/api/registry/set-budget")
async def set_budget(req: SetBudgetRequest):
    if req.monthly_budget_usd < 0:
        raise HTTPException(status_code=400, detail="Budget must be >= 0")
    table = _get_dynamo_table(REGISTRY_TABLE)
    if not table:
        raise HTTPException(status_code=500, detail=f"{REGISTRY_TABLE} not found")
    now = datetime.now(timezone.utc).isoformat()
    try:
        table.update_item(Key={"agent_name": req.agent_name},
            UpdateExpression="SET monthly_budget_usd = :b, updated_at = :now",
            ExpressionAttributeValues={":b": str(req.monthly_budget_usd), ":now": now})
        return {"status": "ok", "agent_name": req.agent_name, "monthly_budget_usd": req.monthly_budget_usd}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===================================================================
# KILL SWITCH ENDPOINTS — Revoke/restore Bedrock access for all agents
# ===================================================================

@app.get("/api/kill-switch/status")
async def kill_switch_status():
    """Check if the kill switch is active."""
    lam = _get_client("lambda")
    if not lam:
        raise HTTPException(status_code=503, detail="Lambda client unavailable")
    try:
        response = lam.invoke(
            FunctionName=KILL_SWITCH_LAMBDA,
            InvocationType="RequestResponse",
            Payload=_json.dumps({"action": "status"}),
        )
        payload = _json.loads(response["Payload"].read())
        result = _json.loads(payload["body"]) if isinstance(payload.get("body"), str) else payload
        return result
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"Kill switch status failed: {e}")


@app.post("/api/kill-switch/revoke")
async def kill_switch_revoke(req: KillSwitchRequest):
    """Activate the kill switch — revoke Bedrock access for ALL agents."""
    if not req.reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    if not req.admin_user.strip():
        raise HTTPException(status_code=400, detail="admin_user is required")

    lam = _get_client("lambda")
    if not lam:
        raise HTTPException(status_code=503, detail="Lambda client unavailable")
    try:
        response = lam.invoke(
            FunctionName=KILL_SWITCH_LAMBDA,
            InvocationType="RequestResponse",
            Payload=_json.dumps({
                "action": "revoke",
                "reason": req.reason,
                "admin_user": req.admin_user,
            }),
        )
        payload = _json.loads(response["Payload"].read())
        result = _json.loads(payload["body"]) if isinstance(payload.get("body"), str) else payload
        if payload.get("statusCode", 200) >= 400:
            raise HTTPException(status_code=payload["statusCode"], detail=result.get("error", "Lambda error"))
        return result
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"Kill switch revoke failed: {e}")


@app.post("/api/kill-switch/restore")
async def kill_switch_restore(req: KillSwitchRequest):
    """Deactivate the kill switch — restore Bedrock access for ALL agents."""
    if not req.reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    if not req.admin_user.strip():
        raise HTTPException(status_code=400, detail="admin_user is required")

    lam = _get_client("lambda")
    if not lam:
        raise HTTPException(status_code=503, detail="Lambda client unavailable")
    try:
        response = lam.invoke(
            FunctionName=KILL_SWITCH_LAMBDA,
            InvocationType="RequestResponse",
            Payload=_json.dumps({
                "action": "restore",
                "reason": req.reason,
                "admin_user": req.admin_user,
            }),
        )
        payload = _json.loads(response["Payload"].read())
        result = _json.loads(payload["body"]) if isinstance(payload.get("body"), str) else payload
        if payload.get("statusCode", 200) >= 400:
            raise HTTPException(status_code=payload["statusCode"], detail=result.get("error", "Lambda error"))
        return result
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"Kill switch restore failed: {e}")


@app.post("/api/kill-switch/revoke-agent")
async def kill_switch_revoke_agent(req: AgentRevokeRequest):
    """Revoke Bedrock access for a SINGLE agent by attaching IAM deny policy."""
    if not req.reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    if not req.admin_user.strip():
        raise HTTPException(status_code=400, detail="admin_user is required")
    if not req.agent_name.strip():
        raise HTTPException(status_code=400, detail="agent_name is required")

    lam = _get_client("lambda")
    if not lam:
        raise HTTPException(status_code=503, detail="Lambda client unavailable")
    try:
        response = lam.invoke(
            FunctionName=KILL_SWITCH_LAMBDA,
            InvocationType="RequestResponse",
            Payload=_json.dumps({
                "action": "revoke",
                "agent_name": req.agent_name,
                "reason": req.reason,
                "admin_user": req.admin_user,
            }),
        )
        payload = _json.loads(response["Payload"].read())
        result = _json.loads(payload["body"]) if isinstance(payload.get("body"), str) else payload
        if payload.get("statusCode", 200) >= 400:
            raise HTTPException(status_code=payload["statusCode"], detail=result.get("error", "Lambda error"))
        return result
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"Agent revoke failed: {e}")


@app.post("/api/kill-switch/restore-agent")
async def kill_switch_restore_agent(req: AgentRevokeRequest):
    """Restore Bedrock access for a SINGLE agent by removing IAM deny policy."""
    if not req.reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    if not req.admin_user.strip():
        raise HTTPException(status_code=400, detail="admin_user is required")
    if not req.agent_name.strip():
        raise HTTPException(status_code=400, detail="agent_name is required")

    lam = _get_client("lambda")
    if not lam:
        raise HTTPException(status_code=503, detail="Lambda client unavailable")
    try:
        response = lam.invoke(
            FunctionName=KILL_SWITCH_LAMBDA,
            InvocationType="RequestResponse",
            Payload=_json.dumps({
                "action": "restore",
                "agent_name": req.agent_name,
                "reason": req.reason,
                "admin_user": req.admin_user,
            }),
        )
        payload = _json.loads(response["Payload"].read())
        result = _json.loads(payload["body"]) if isinstance(payload.get("body"), str) else payload
        if payload.get("statusCode", 200) >= 400:
            raise HTTPException(status_code=payload["statusCode"], detail=result.get("error", "Lambda error"))
        return result
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"Agent restore failed: {e}")

# ===================================================================
# SYNC ENDPOINT — Populates DynamoDB from AWS services
# ===================================================================

def _sync_registry() -> dict:
    table = _get_dynamo_table(REGISTRY_TABLE)
    ctrl = _get_client("bedrock-agentcore-control")
    if not table:
        return {"status": "error", "detail": f"{REGISTRY_TABLE} not found"}
    if not ctrl:
        return {"status": "skipped", "detail": "AgentCore client unavailable"}

    runtimes = []
    try:
        for page in ctrl.get_paginator("list_agent_runtimes").paginate():
            runtimes.extend(page.get("agentRuntimes", []))
    except ClientError as e:
        return {"status": "error", "detail": str(e)}

    # Fetch tags in parallel
    def _fetch_tags(arn):
        try:
            return (arn, ctrl.list_tags_for_resource(resourceArn=arn).get("tags", {}))
        except (ClientError, AttributeError):
            return (arn, {})

    tags_map = {}
    with ThreadPoolExecutor(max_workers=20) as pool:
        for arn, tags in pool.map(lambda a: _fetch_tags(a), [rt["agentRuntimeArn"] for rt in runtimes]):
            tags_map[arn] = tags

    now = datetime.now(timezone.utc).isoformat()
    synced = 0
    for rt in runtimes:
        name = rt["agentRuntimeName"]
        lupd = rt["lastUpdatedAt"].isoformat() if hasattr(rt["lastUpdatedAt"], "isoformat") else str(rt["lastUpdatedAt"])
        try:
            tags = tags_map.get(rt["agentRuntimeArn"], {})
            creator_email = tags.get("creator-email", "")
            table.update_item(Key={"agent_name": name},
                UpdateExpression=(
                    "SET agent_runtime_arn = :arn, agent_runtime_id = :rid, runtime_status = :st, "
                    "runtime_version = :ver, description = if_not_exists(description, :desc), "
                    "last_synced = :now, last_updated_at = :lupd, tags = :tags, "
                    "team = if_not_exists(team, :dt), environment = if_not_exists(environment, :de), "
                    "#s = if_not_exists(#s, :ds), created_at = if_not_exists(created_at, :now)"
                    + (", creator_email = :ce" if creator_email else "")),
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":arn": rt["agentRuntimeArn"], ":rid": rt["agentRuntimeId"],
                    ":st": rt["status"], ":ver": rt.get("agentRuntimeVersion", ""),
                    ":desc": rt.get("description", ""), ":now": now, ":lupd": lupd,
                    ":tags": tags,
                    ":dt": "default", ":de": "production", ":ds": "active",
                    **(({":ce": creator_email}) if creator_email else {})})
            synced += 1
        except ClientError:
            pass

    # Cleanup: mark agents as deleted if their runtime no longer exists
    removed = 0
    live_names = {rt["agentRuntimeName"] for rt in runtimes}
    try:
        existing = table.scan().get("Items", [])
        for item in existing:
            agent_name = item.get("agent_name", "")
            if agent_name not in live_names and item.get("runtime_status") not in ("DELETED", None):
                try:
                    table.update_item(
                        Key={"agent_name": agent_name},
                        UpdateExpression="SET runtime_status = :st, #s = :ds, deleted_at = :now",
                        ExpressionAttributeNames={"#s": "status"},
                        ExpressionAttributeValues={":st": "DELETED", ":ds": "deleted", ":now": now},
                    )
                    removed += 1
                except ClientError:
                    pass
    except ClientError:
        pass

    return {"status": "ok", "synced": synced, "total_runtimes": len(runtimes), "marked_deleted": removed}


# ===================================================================
# SIGNAL SYNC FUNCTIONS — REMOVED (Event-Driven Architecture)
# ===================================================================
# The following functions have been replaced by dedicated Lambda functions
# that run independently of the dashboard:
#
# _sync_cost_signals()  → cost_signal_event.py (SNS trigger)
#                        + cost_signal_poll.py (scheduled every 5 min)
#
# _sync_obs_signals()   → obs_signal_event.py (EventBridge alarm state change)
#                        + obs_signal_poll.py (scheduled every 5 min)
#
# _sync_eval_signals()  → eval_signal_event.py (EventBridge eval alarm change)
#                        + eval_signal_poll.py (scheduled every 15 min)
#
# The dashboard now reads signal data from DynamoDB only (GET endpoints).
# Signal data is written by the event-driven Lambdas deployed in the
# agent-safety-event-driven-signals CloudFormation stack.
# ===================================================================


def _sync_sessions_from_memory() -> dict:
    reg_table = _get_dynamo_table(REGISTRY_TABLE)
    sess_table = _get_dynamo_table(SESSION_TABLE)
    data_client = _get_client("bedrock-agentcore")
    if not reg_table or not sess_table or not data_client:
        return {"status": "skipped"}
    try:
        registry = reg_table.scan().get("Items", [])
    except ClientError:
        return {"status": "error"}
    synced = 0
    for agent in registry:
        mid = agent.get("memory_id", "")
        aname = agent.get("agent_name", "")
        if not mid:
            continue
        try:
            for page in data_client.get_paginator("list_sessions").paginate(memoryId=mid, actorId=aname):
                for s in page.get("sessionSummaries", []):
                    sid = s.get("sessionId", "")
                    if not sid:
                        continue
                    try:
                        sess_table.put_item(Item={"session_id": sid, "agent_name": aname, "status": "active",
                            "started_at": str(s.get("createdAt", "")), "source": "memory",
                            "last_heartbeat": str(s.get("createdAt", ""))},
                            ConditionExpression="attribute_not_exists(session_id)")
                        synced += 1
                    except ClientError:
                        pass
        except ClientError:
            pass
    return {"status": "ok", "sessions_synced": synced}


@app.post("/api/sync")
async def sync_all():
    """Sync registry and sessions only. Signal data is now event-driven (managed by dedicated Lambdas)."""
    import asyncio
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {
            "registry": loop.run_in_executor(pool, _sync_registry),
            "memory_sessions": loop.run_in_executor(pool, _sync_sessions_from_memory),
        }
        results = {}
        for key, future in futures.items():
            try:
                results[key] = await future
            except Exception as e:
                results[key] = {"status": "error", "detail": str(e)}

    # Auto-apply saved settings to any new/mismatched budgets and alarms
    try:
        settings = _get_settings()
        budget_amt = settings.get("default_budget_usd", 2.0)
        # Check if any budget doesn't match the saved amount
        budgets_client = _get_client("budgets")
        account_id = _get_account_id()
        if budgets_client and account_id:
            needs_update = False
            for page in budgets_client.get_paginator("describe_budgets").paginate(AccountId=account_id):
                for b in page.get("Budgets", []):
                    if b.get("BudgetName", "").startswith(BUDGET_PREFIX):
                        if float(b.get("BudgetLimit", {}).get("Amount", 0)) != budget_amt:
                            needs_update = True
                            break
                if needs_update:
                    break
            if needs_update:
                results["auto_apply_budgets"] = _apply_budget_amount(budget_amt)
                logger.info(f"Auto-applied budget amount ${budget_amt} to mismatched budgets")

        # Check if any eval alarm threshold doesn't match
        eval_fields = ["eval_harmfulness_threshold", "eval_correctness_threshold", "eval_goalsuccess_threshold",
                       "eval_helpfulness_threshold", "eval_faithfulness_threshold",
                       "eval_toolselection_threshold", "eval_toolparams_threshold"]
        thresholds = [int(settings.get(f, 1)) for f in eval_fields if int(settings.get(f, 1)) > 0]
        expected_threshold = min(thresholds) if thresholds else 1
        cw = _get_client("cloudwatch")
        if cw:
            try:
                for page in cw.get_paginator("describe_alarms").paginate(AlarmNamePrefix="AgentSafety-Eval-", AlarmTypes=["MetricAlarm"]):
                    for a in page.get("MetricAlarms", []):
                        if a.get("Threshold", 1) != expected_threshold:
                            results["auto_apply_eval"] = _apply_eval_alarm_thresholds(settings)
                            logger.info(f"Auto-applied eval threshold {expected_threshold}")
                            break
            except ClientError:
                pass

        # Check obs alarms band width
        expected_bw = float(settings.get("obs_band_width", 2))
        try:
            for page in cw.get_paginator("describe_alarms").paginate(AlarmTypes=["MetricAlarm"]):
                for a in page.get("MetricAlarms", []):
                    if a.get("AlarmName", "").endswith("-anomaly"):
                        for m in a.get("Metrics", []):
                            expr = m.get("Expression", "")
                            if "ANOMALY_DETECTION_BAND" in expr and f", {expected_bw})" not in expr:
                                results["auto_apply_obs"] = _apply_obs_alarm_settings(settings)
                                logger.info(f"Auto-applied obs band width {expected_bw}")
                                break
                        break
        except ClientError:
            pass
    except Exception as e:
        logger.warning(f"Auto-apply settings failed: {e}")

    return {"status": "ok", "synced_at": datetime.now(timezone.utc).isoformat(), "results": results}


@app.post("/api/sync/registry")
async def sync_registry_only():
    return _sync_registry()

# Signal sync endpoints removed — signals are now event-driven (managed by dedicated Lambdas).
# Cost, obs, and eval signals are written to DynamoDB by EventBridge-triggered and scheduled Lambdas.
# The dashboard only reads from DynamoDB via GET endpoints.

# ===================================================================
# HEALTH CHECK
# ===================================================================

@app.get("/api/health")
async def health(request: Request):
    """Health probe.

    /api/health is on the AUTH_EXEMPT_PATHS list because ALB target-group
    health checks need to reach it without a bearer token. That would
    otherwise make the endpoint anonymous-reachable and expose internal
    resource names via the `checks` body — which is exactly the finding
    that prompted this hardening.

    Posture: matches every other AVA-federated ref app (case-management,
    merchant-onboarding, sales-recommend, Foundry UCs), which all return
    302/401 to anonymous /health probes because their CloudFront edge
    functions block anonymous access. Agent Safety sits behind an ALB
    (not a static edge), so we enforce the same "no anonymous surface"
    contract inline here:

      - ALB target-group probes (User-Agent 'ELB-HealthChecker/...')
        → allowed, get the full detailed body for load-balancer scoring.
      - Authenticated dashboard users (valid AVA session cookie or
        Cognito Bearer) → allowed, get the full detailed body for
        operator observability.
      - Everyone else (external internet, curl without auth, uptime
        monitors without a token) → 401 Unauthorized. No body, no
        confirmation that this is Agent Safety, no table names.
    """
    ua = request.headers.get("user-agent", "")
    is_alb_probe = ua.startswith("ELB-HealthChecker")

    is_authenticated = False
    if not is_alb_probe:
        # /api/health is exempt from the middleware, so re-verify auth
        # in-line using the same order the ava_sso middleware uses.
        cookie_token = request.cookies.get("ava_session")
        if AVA_SSO_ENABLED and cookie_token and verify_ava_session(cookie_token):
            is_authenticated = True
        elif AUTH_ENABLED:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                claims = _verify_token(auth_header[7:])
                is_authenticated = claims is not None

    if not (is_alb_probe or is_authenticated):
        raise HTTPException(status_code=401, detail="Unauthorized")

    # ALB probe or authenticated user — safe to include the detailed checks.
    checks = {}
    for tbl in (REGISTRY_TABLE, SESSION_TABLE, INTERVENTION_TABLE, COST_SIGNALS_TABLE, OBS_SIGNALS_TABLE, EVAL_SIGNALS_TABLE):
        checks[f"dynamodb:{tbl}"] = "ok" if _get_dynamo_table(tbl) else "not_found"
    try:
        ctrl = _get_client("bedrock-agentcore-control")
        if ctrl:
            ctrl.list_agent_runtimes(maxResults=1)
            checks["agentcore"] = "ok"
        else:
            checks["agentcore"] = "client_unavailable"
    except Exception as e:
        checks["agentcore"] = f"error: {e}"
    all_ok = all(v == "ok" for k, v in checks.items() if k.startswith("dynamodb:"))
    return {"status": "ok" if all_ok else "degraded", "checks": checks}
