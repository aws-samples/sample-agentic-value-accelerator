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
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

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
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")

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
async def auth_middleware(request: Request, call_next):
    """Validate Cognito JWT on every request (when auth is enabled)."""
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
async def auth_config():
    """Return Cognito config for the frontend. No auth required."""
    return {
        "enabled": AUTH_ENABLED,
        "userPoolId": COGNITO_USER_POOL_ID,
        "clientId": COGNITO_APP_CLIENT_ID,
        "domain": COGNITO_DOMAIN,
        "region": COGNITO_REGION,
        "redirectUri": COGNITO_REDIRECT_URI,
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


class SetBudgetRequest(BaseModel):
    agent_name: str
    monthly_budget_usd: float


# ===================================================================
# READ ENDPOINTS — All read from DynamoDB only
# ===================================================================

@app.get("/api/registry")
async def list_registry():
    table = _get_dynamo_table(REGISTRY_TABLE)
    if not table:
        return {"agents": [], "source": "table_not_found"}
    try:
        return {"agents": table.scan().get("Items", [])}
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


@app.get("/api/eval-signals")
async def get_eval_signals():
    table = _get_dynamo_table(EVAL_SIGNALS_TABLE)
    if not table:
        return {"signals": [], "source": "table_not_found"}
    try:
        signals = table.scan().get("Items", [])
        sev = {"critical": 0, "medium": 1, "low": 2}
        signals.sort(key=lambda x: (sev.get(x.get("severity", "low"), 9), x.get("agent_name", "")))
        return {"signals": signals}
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
    if sess_table and stop_result in ("stopped", "not_found", "already_stopping"):
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

    _cascade_session_terminated(agent_name, req.session_id)
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
            Payload=_json.dumps({"agent_name": req.agent_name, "reason": req.reason, "admin_user": req.admin_user}))
        payload = _json.loads(response["Payload"].read())
        result = _json.loads(payload["body"]) if isinstance(payload.get("body"), str) else payload
        if payload.get("statusCode", 200) >= 400:
            raise HTTPException(status_code=payload["statusCode"], detail=result.get("error", "Lambda error"))
        for r in result.get("results", []):
            if r.get("status") in ("stopped", "not_found", "already_stopping"):
                _cascade_session_terminated(req.agent_name, r.get("session_id", ""))
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
            table.update_item(Key={"agent_name": name},
                UpdateExpression=(
                    "SET agent_runtime_arn = :arn, agent_runtime_id = :rid, runtime_status = :st, "
                    "runtime_version = :ver, description = if_not_exists(description, :desc), "
                    "last_synced = :now, last_updated_at = :lupd, tags = :tags, "
                    "team = if_not_exists(team, :dt), environment = if_not_exists(environment, :de), "
                    "#s = if_not_exists(#s, :ds), created_at = if_not_exists(created_at, :now)"),
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":arn": rt["agentRuntimeArn"], ":rid": rt["agentRuntimeId"],
                    ":st": rt["status"], ":ver": rt.get("agentRuntimeVersion", ""),
                    ":desc": rt.get("description", ""), ":now": now, ":lupd": lupd,
                    ":tags": tags_map.get(rt["agentRuntimeArn"], {}),
                    ":dt": "default", ":de": "production", ":ds": "active"})
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


def _sync_cost_signals() -> dict:
    table = _get_dynamo_table(COST_SIGNALS_TABLE)
    budgets_client = _get_client("budgets")
    account_id = _get_account_id()
    if not table:
        return {"status": "error", "detail": f"{COST_SIGNALS_TABLE} not found"}
    if not budgets_client or not account_id:
        return {"status": "skipped", "detail": "Budgets client or account ID unavailable"}

    # Load registry — only show agents that are registered
    reg_table = _get_dynamo_table(REGISTRY_TABLE)
    registry_names = set()
    if reg_table:
        try:
            registry_names = {_normalize(r.get("agent_name", "")) for r in reg_table.scan().get("Items", [])}
        except ClientError:
            pass

    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + 86400
    written = 0
    synced_agents = set()
    try:
        for page in budgets_client.get_paginator("describe_budgets").paginate(AccountId=account_id):
            for b in page.get("Budgets", []):
                name = b.get("BudgetName", "")
                if not name.startswith(BUDGET_PREFIX):
                    continue
                agent_name = name[len(BUDGET_PREFIX):]
                # Only include agents that exist in the registry
                if registry_names and _normalize(agent_name) not in registry_names:
                    continue
                synced_agents.add(agent_name)
                limit = float(b.get("BudgetLimit", {}).get("Amount", 0))
                actual = float(b.get("CalculatedSpend", {}).get("ActualSpend", {}).get("Amount", 0))
                fr = b.get("CalculatedSpend", {}).get("ForecastedSpend", {}).get("Amount")
                forecast = float(fr) if fr is not None else 0.0
                pct = (actual / limit * 100) if limit > 0 else 0.0
                fpct = (forecast / limit * 100) if limit > 0 else 0.0
                sev = "critical" if pct >= 100 else ("medium" if pct >= 80 or fpct >= 100 else "low")
                try:
                    table.put_item(Item={"agent_name": agent_name, "budget_name": name,
                        "budget_limit_usd": str(round(limit, 2)), "actual_spend_usd": str(round(actual, 4)),
                        "forecasted_spend_usd": str(round(forecast, 4)), "pct_used": str(round(pct, 1)),
                        "forecast_pct": str(round(fpct, 1)), "severity": sev,
                        "synced_at": now.isoformat(), "expires_at": expires_at})
                    written += 1
                except ClientError:
                    pass
    except ClientError as e:
        return {"status": "error", "detail": str(e)}

    # Cleanup: remove DynamoDB entries for budgets that no longer exist
    removed = 0
    try:
        existing = table.scan().get("Items", [])
        for item in existing:
            if item.get("agent_name") not in synced_agents:
                try:
                    table.delete_item(Key={"agent_name": item["agent_name"]})
                    removed += 1
                except ClientError:
                    pass
    except ClientError:
        pass

    return {"status": "ok", "signals_written": written, "removed": removed}


def _sync_obs_signals() -> dict:
    """Sync CloudWatch alarms into observability-signals DynamoDB table."""
    table = _get_dynamo_table(OBS_SIGNALS_TABLE)
    cw = _get_client("cloudwatch")
    if not table:
        return {"status": "error", "detail": f"{OBS_SIGNALS_TABLE} not found"}
    if not cw:
        return {"status": "skipped", "detail": "CloudWatch client unavailable"}

    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + 86400

    alarms = []
    try:
        for page in cw.get_paginator("describe_alarms").paginate(AlarmTypes=["MetricAlarm", "CompositeAlarm"]):
            alarms.extend(page.get("MetricAlarms", []))
            alarms.extend(page.get("CompositeAlarms", []))
    except ClientError as e:
        return {"status": "error", "detail": str(e)}

    # Load registry for agent name matching
    reg_table = _get_dynamo_table(REGISTRY_TABLE)
    registry = reg_table.scan().get("Items", []) if reg_table else []
    registry_names = {_normalize(r.get("agent_name", "")) for r in registry}

    def _extract_agent(alarm):
        name = alarm.get("AlarmName", "")
        desc = alarm.get("AlarmDescription", "")
        if name.startswith("AgentSafety-"):
            parts = name.split("-", 2)
            if len(parts) >= 3:
                return parts[2]
        for a in registry:
            an = a.get("agent_name", "")
            if an and (an in name or an in desc):
                return an
        for dim in alarm.get("Dimensions", []):
            if dim.get("Name") == "service.name" and dim.get("Value", "").endswith(".DEFAULT"):
                return dim["Value"].replace(".DEFAULT", "")
        return None

    written = 0
    # Aggregate: one signal per agent (worst severity wins)
    agent_signals: dict[str, dict] = {}
    for alarm in alarms:
        agent_name = _extract_agent(alarm)
        if not agent_name:
            continue
        if registry_names and _normalize(agent_name) not in registry_names:
            continue
        state = alarm.get("StateValue", "INSUFFICIENT_DATA")
        sev = "critical" if state == "ALARM" else ("medium" if state == "INSUFFICIENT_DATA" else "low")
        aname = alarm.get("AlarmName", "")
        updated = alarm.get("StateUpdatedTimestamp", "")
        if hasattr(updated, "isoformat"):
            updated = updated.isoformat()
        # Only show StateReason when alarm is in ALARM state
        reason = alarm.get("StateReason", "") if state == "ALARM" else ""
        desc = alarm.get("AlarmDescription", "") or f"Alarm {aname}: {state}"

        sev_rank = {"critical": 2, "medium": 1, "low": 0}
        existing = agent_signals.get(agent_name)
        if existing is None or sev_rank.get(sev, 0) > sev_rank.get(existing["severity"], 0):
            # This alarm is worse — use it as the representative
            agent_signals[agent_name] = {
                "agent_name": agent_name, "signal_key": agent_name,
                "signal_type": "alarm", "severity": sev, "alarm_state": state,
                "alarm_name": aname, "current_value": state, "baseline_value": "OK",
                "description": (reason[:200] if reason else desc[:200]),
                "state_updated_at": str(updated), "generated_at": now.isoformat(),
                "expires_at": expires_at,
                "_alarm_count": (existing["_alarm_count"] if existing else 0) + 1,
            }
        elif existing:
            existing["_alarm_count"] = existing.get("_alarm_count", 1) + 1

    # Write aggregated signals to DynamoDB
    for agent_name, sig in agent_signals.items():
        count = sig.pop("_alarm_count", 1)
        if count > 1:
            sig["description"] = f"[{count} alarms] " + sig["description"]
        try:
            table.put_item(Item=sig)
            written += 1
        except ClientError:
            pass

    # Cleanup: remove DynamoDB entries for agents whose alarms no longer exist
    removed = 0
    synced_keys = {sig["signal_key"] for sig in agent_signals.values()}
    try:
        existing = table.scan().get("Items", [])
        for item in existing:
            if item.get("signal_key") not in synced_keys and item.get("agent_name") not in agent_signals:
                try:
                    table.delete_item(Key={"agent_name": item["agent_name"], "signal_key": item["signal_key"]})
                    removed += 1
                except ClientError:
                    pass
    except ClientError:
        pass

    return {"status": "ok", "signals_written": written, "alarms_checked": len(alarms), "removed": removed}


def _sync_eval_signals() -> dict:
    """Sync evaluation signals: alarm state + per-evaluator scores from CloudWatch."""
    table = _get_dynamo_table(EVAL_SIGNALS_TABLE)
    ctrl = _get_client("bedrock-agentcore-control")
    cw = _get_client("cloudwatch")
    if not table:
        return {"status": "error", "detail": f"{EVAL_SIGNALS_TABLE} not found"}
    if not ctrl:
        return {"status": "skipped", "detail": "AgentCore client unavailable"}

    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + 86400
    eval_ns = "Bedrock-AgentCore/Evaluations"

    # Load registry for filtering
    reg_table = _get_dynamo_table(REGISTRY_TABLE)
    registry_names = set()
    if reg_table:
        try:
            registry_names = {_normalize(r.get("agent_name", "")) for r in reg_table.scan().get("Items", [])}
        except ClientError:
            pass

    # Get eval configs
    configs = []
    try:
        for page in ctrl.get_paginator("list_online_evaluation_configs").paginate():
            configs.extend(page.get("onlineEvaluationConfigs", []))
    except (ClientError, AttributeError):
        return {"status": "skipped", "detail": "Evaluation API unavailable"}

    if not configs:
        return {"status": "ok", "signals_written": 0, "configs_found": 0}

    # Get all eval-related alarms
    eval_alarms = {}
    if cw:
        try:
            for page in cw.get_paginator("describe_alarms").paginate(AlarmNamePrefix="AgentSafety-Eval-", AlarmTypes=["MetricAlarm", "CompositeAlarm"]):
                for a in page.get("MetricAlarms", []):
                    eval_alarms[a["AlarmName"]] = a
                for a in page.get("CompositeAlarms", []):
                    eval_alarms[a["AlarmName"]] = a
        except ClientError:
            pass

    evaluators = [
        {"id": "Builtin.Harmfulness", "bad": "Harmful", "good": "Not Harmful"},
        {"id": "Builtin.Correctness", "bad": "Incorrect", "good": "Correct"},
        {"id": "Builtin.Helpfulness", "bad": "Not Helpful", "good": "Helpful"},
        {"id": "Builtin.GoalSuccessRate", "bad": "No", "good": "Yes"},
        {"id": "Builtin.ToolSelectionAccuracy", "bad": "No", "good": "Yes"},
        {"id": "Builtin.ToolParameterAccuracy", "bad": "No", "good": "Yes"},
        {"id": "Builtin.Faithfulness", "bad": "Not Faithful", "good": "Faithful"},
    ]

    written = 0
    synced_agents = set()

    for cfg in configs:
        cname = cfg.get("onlineEvaluationConfigName", "")
        config_id = cfg.get("onlineEvaluationConfigId", "")
        agent_name = cname.replace("eval_", "", 1) if cname.startswith("eval_") else cname
        if registry_names and _normalize(agent_name) not in registry_names:
            continue
        synced_agents.add(agent_name)
        svc = f"{agent_name}.DEFAULT"
        alarm_name = f"AgentSafety-Eval-{agent_name}"

        # Write alarm summary
        alarm = eval_alarms.get(alarm_name, {})
        alarm_state = alarm.get("StateValue", "INSUFFICIENT_DATA")
        alarm_reason = alarm.get("StateReason", "") if alarm_state == "ALARM" else ""
        alarm_updated = alarm.get("StateUpdatedTimestamp", "")
        if hasattr(alarm_updated, "isoformat"):
            alarm_updated = alarm_updated.isoformat()
        sev = "critical" if alarm_state == "ALARM" else ("medium" if alarm_state == "INSUFFICIENT_DATA" else "low")

        try:
            table.put_item(Item={
                "agent_name": agent_name, "signal_key": "alarm_summary",
                "alarm_name": alarm_name, "alarm_state": alarm_state,
                "alarm_reason": alarm_reason, "alarm_updated_at": str(alarm_updated),
                "eval_config_id": config_id, "eval_config_name": cname,
                "evaluator_count": len(evaluators), "sampling_pct": "100.0",
                "severity": sev, "synced_at": now.isoformat(), "expires_at": expires_at,
            })
            written += 1
        except ClientError:
            pass

        # Write per-evaluator scores
        if cw:
            for ev in evaluators:
                bad_count, good_count = 0, 0
                try:
                    for label, target in [(ev["bad"], "bad"), (ev["good"], "good")]:
                        resp = cw.get_metric_statistics(Namespace=eval_ns, MetricName=ev["id"],
                            Dimensions=[{"Name": "service.name", "Value": svc}, {"Name": "label", "Value": label}],
                            StartTime=now - timedelta(hours=1), EndTime=now, Period=3600, Statistics=["Sum"])
                        total = sum(dp.get("Sum", 0) for dp in resp.get("Datapoints", []))
                        if target == "bad":
                            bad_count = total
                        else:
                            good_count = total
                except ClientError:
                    continue
                total_count = bad_count + good_count
                bad_pct = (bad_count / total_count * 100) if total_count > 0 else 0
                if ev["id"] == "Builtin.Harmfulness":
                    esev = "critical" if bad_count >= 1 else "low"
                elif bad_pct >= 50:
                    esev = "critical"
                elif bad_pct >= 20:
                    esev = "medium"
                else:
                    esev = "low"
                try:
                    table.put_item(Item={
                        "agent_name": agent_name, "signal_key": ev["id"],
                        "evaluator_name": ev["id"].replace("Builtin.", ""), "severity": esev,
                        "bad_count": int(bad_count), "good_count": int(good_count),
                        "total_count": int(total_count), "bad_pct": str(round(bad_pct, 1)),
                        "description": f"{ev['id'].replace('Builtin.', '')}: {int(bad_count)} {ev['bad'].lower()} / {int(total_count)} total ({bad_pct:.1f}%)" if total_count > 0 else f"{ev['id'].replace('Builtin.', '')}: waiting for data",
                        "config_name": cname, "synced_at": now.isoformat(), "expires_at": expires_at,
                    })
                    written += 1
                except ClientError:
                    pass

    # Cleanup: remove entries for agents that no longer have eval configs
    removed = 0
    try:
        existing = table.scan().get("Items", [])
        for item in existing:
            if item.get("agent_name") not in synced_agents:
                try:
                    table.delete_item(Key={"agent_name": item["agent_name"], "signal_key": item["signal_key"]})
                    removed += 1
                except ClientError:
                    pass
    except ClientError:
        pass

    return {"status": "ok", "signals_written": written, "configs_found": len(configs), "removed": removed}


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
    results = {}
    results["registry"] = _sync_registry()
    results["cost_signals"] = _sync_cost_signals()
    results["obs_signals"] = _sync_obs_signals()
    results["eval_signals"] = _sync_eval_signals()
    results["memory_sessions"] = _sync_sessions_from_memory()
    return {"status": "ok", "synced_at": datetime.now(timezone.utc).isoformat(), "results": results}


@app.post("/api/sync/registry")
async def sync_registry_only():
    return _sync_registry()

@app.post("/api/sync/cost-signals")
async def sync_cost_only():
    return _sync_cost_signals()

@app.post("/api/sync/obs-signals")
async def sync_obs_only():
    return _sync_obs_signals()

@app.post("/api/sync/eval-signals")
async def sync_eval_only():
    return _sync_eval_signals()

# ===================================================================
# HEALTH CHECK
# ===================================================================

@app.get("/api/health")
async def health():
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
