"""LLM Gateway (LiteLLM) API routes.

Endpoints surface the deployed gateway's runtime state — instances, config,
virtual keys, spend, and audit — to the Control Plane UI. The gateway itself
is provisioned by the `llm-gateway` Terraform template; this router talks to
the deployment via AWS (ECS / SSM / Secrets Manager / CloudWatch / DDB) and
proxies the LiteLLM admin API for live state where it makes sense.

Wherever the deployment doesn't yet exist (or AWS access isn't wired), routes
return a minimal stub payload so the UI can render — same pattern as
policies.py and guardrails.py.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core import region_config
from core.config import settings
from core.rbac import Role, require_role

if TYPE_CHECKING:  # annotations only; core.safe_fetch is imported where it is used
    from core.safe_fetch import SafeResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/llm-gateway", tags=["llm-gateway"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class GatewayInstance(BaseModel):
    id: str
    name: str
    endpoint: str
    admin_ui_url: str
    status: str
    region: str
    environment: str
    enabled_models: List[str] = Field(default_factory=list)
    attached_guardrail_id: Optional[str] = None
    langfuse_attached: bool = False
    deployed_at: Optional[str] = None
    config_parameter_name: Optional[str] = None
    cluster_name: Optional[str] = None
    service_name: Optional[str] = None
    audit_log_group: Optional[str] = None
    master_key_secret_arn: Optional[str] = None


class DeployRequest(BaseModel):
    project_name: str = "llm-gateway"
    aws_region: str = "us-east-1"
    environment: str = "dev"
    master_key: str
    enabled_models: Optional[List[str]] = None
    attach_guardrail_id: Optional[str] = ""
    attach_guardrail_version: Optional[str] = "DRAFT"
    langfuse_host: Optional[str] = ""
    existing_vpc_id: Optional[str] = ""
    cognito_user_pool_id: Optional[str] = ""
    litellm_version: Optional[str] = "main-stable"


class ConfigUpdate(BaseModel):
    config_yaml: str = Field(..., description="Full rendered config.yaml")


class VirtualKeyCreate(BaseModel):
    name: str
    team_id: Optional[str] = None
    models: Optional[List[str]] = None
    max_budget: Optional[float] = None
    budget_duration: Optional[str] = "30d"
    tpm_limit: Optional[int] = None
    rpm_limit: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _aws_region() -> str:
    return getattr(settings, "AWS_REGION", os.getenv("AWS_REGION", "us-east-1"))


def _gateway_id_from_settings() -> Optional[str]:
    """Configured default gateway id (set by the deploy pipeline).
    Falls back to 'local-gateway' when LITELLM_GATEWAY_URL is set
    so docker-compose setups always surface an instance."""
    gw_id = getattr(settings, "LLM_GATEWAY_ID", None) or os.getenv("LLM_GATEWAY_ID")
    if gw_id:
        return gw_id
    # If a gateway URL is configured but no explicit ID, use a synthetic one
    if os.getenv("LITELLM_GATEWAY_URL"):
        return "local-gateway"
    return None


def _stub_instance(gateway_id: str) -> GatewayInstance:
    return GatewayInstance(
        id=gateway_id,
        name=gateway_id,
        endpoint=os.getenv("LLM_GATEWAY_ENDPOINT", "") or os.getenv("LITELLM_GATEWAY_URL", ""),
        admin_ui_url=os.getenv("LLM_GATEWAY_ADMIN_URL", ""),
        status="NOT_DEPLOYED" if not (os.getenv("LLM_GATEWAY_ENDPOINT", "") or os.getenv("LITELLM_GATEWAY_URL", "")) else "DEPLOYED",
        region=_aws_region(),
        environment="dev",
        enabled_models=[],
        attached_guardrail_id=None,
        langfuse_attached=False,
        deployed_at=None,
    )


# Body cap for the LiteLLM admin-API JSON calls (config, models, virtual keys,
# spend, audit).
#
# safe_fetch's 5 MiB default is sized for a caller-supplied agent card. These are
# our own gateway's admin documents, and /spend/logs plus /global/spend/report
# return one row per request, so a 30-day window on a busy gateway is legitimately
# tens of MiB. `urlopen(...).read()` was unbounded; a cap still has to exist here
# (an unbounded read of a compromised responder is a memory DoS), but it has to be
# above the real answer, and going over it has to be an error - see _gateway_fetch.
#
# Every _gateway_json call site inherits it from that function's default - eight of
# them today: /v1/models, /key/generate, the key-list read (/key/list, then
# /key/info), the two per-key /key/info lookups, the spend report, the model-level
# spend report, and audit. get_config's /config/yaml attempts are the exception and
# pass it by hand, because they want the response object rather than just the
# parsed body. Grep for both names before adding another admin call.
_ADMIN_API_MAX_BYTES = 32 * 1024 * 1024

# How much of an upstream error body may reach a client-visible field.
_ERROR_SNIPPET_CHARS = 2000


def _gateway_fetch(
    url: str,
    *,
    timeout: float,
    require_ok: bool = True,
    **kwargs: Any,
) -> "SafeResponse":
    """Call the configured gateway. No redirect, so the master key cannot be replayed.

    `fetch_internal` and not `fetch`: the endpoint is platform configuration, and
    depending on the deployment topology it is either a private ALB address
    (`infrastructure/modules/litellm`) or a public CloudFront domain
    (`templates/llm-gateway`). The address class therefore is not a useful gate on
    this value at all, in either direction. What `fetch_internal` buys us is the
    redirect refusal: `urllib`'s redirect handler forwards every header except
    content-length and content-type, so a 302 from the gateway - or from anything
    else answering on that address - replayed the `Authorization: Bearer <master
    key>` these calls carry to whatever host the Location header named. A gateway
    of ours never redirects.

    The trust assumption this rests on, stated plainly because nothing here checks
    it: `url` is built from `outputs.gateway_endpoint` (our own deployment record)
    or `LLM_GATEWAY_ENDPOINT` / `LITELLM_GATEWAY_URL`. Both are platform-written.
    A caller-supplied URL must go through `safe_fetch.fetch`, not through here.

    `require_ok` restores what `urlopen` did: it raised HTTPError on 4xx/5xx, and
    the callers below rely on that to fall through to the next API path or to a
    stub payload. `fetch_internal` returns the response instead, so a 404 body
    would otherwise be parsed as data. Only the playground relay, which hands the
    gateway's own error body back to the UI, passes require_ok=False.
    """
    from core import safe_fetch

    resp = safe_fetch.fetch_internal(url, timeout=timeout, **kwargs)
    if require_ok and not (200 <= resp.status < 300):
        raise safe_fetch.SafeFetchError("http_status_error", f"status={resp.status} url={url}")
    if resp.truncated:
        # A body cut at max_bytes is not a smaller answer, it is a broken one, and
        # every caller below swallows the parse failure it causes: get_spend then
        # reports total_usd 0.0 and get_audit rows [], neither distinguishable in
        # the UI from a real zero. Refuse instead, the way safe_fetch.fetch_json
        # does, so the failure is visible rather than plausible.
        raise safe_fetch.SafeFetchError("response_too_large", f"body exceeded max_bytes for {url}")
    return resp


def _gateway_json(url: str, *, timeout: float, max_bytes: int = _ADMIN_API_MAX_BYTES, **kwargs: Any) -> Any:
    """_gateway_fetch plus JSON parsing, for the callers that only want a body.

    Every caller is reading a LiteLLM admin document, so the cap defaults to
    _ADMIN_API_MAX_BYTES rather than safe_fetch's agent-card-sized 5 MiB.
    """
    return _gateway_fetch(url, timeout=timeout, max_bytes=max_bytes, **kwargs).json()


def _fetch_reason(exc: BaseException) -> str:
    """The part of a fetch failure that is safe to put in a response body.

    `SafeFetchError.reason` is a stable category; `str(exc)` and `.detail` name
    the host and the resolved address, and echoing those back would turn a
    refusal into the port scan it just prevented. Logs get _fetch_log_detail.

    Duck-typed rather than isinstance, so formatting an error cannot itself raise
    an import error inside the except block that is trying to report one.
    """
    reason = getattr(exc, "reason", None)
    return reason if isinstance(reason, str) and reason else type(exc).__name__


def _log_safe(text: str) -> str:
    """Flatten control characters before a string reaches a log line.

    Fetch details carry the URL that failed, and two of the URLs below embed a key
    hash the gateway handed us (`/key/info?key=...`). A CR/LF in there forges a
    whole log record, so anything this process did not author gets flattened.
    """
    return "".join(ch if ch.isprintable() else " " for ch in text)


def _fetch_log_detail(exc: BaseException) -> str:
    """Logs only. Carries the host and resolved address _fetch_reason drops."""
    detail = getattr(exc, "detail", None)
    if isinstance(detail, str) and detail:
        return _log_safe(f"{_fetch_reason(exc)} ({detail})")
    return _log_safe(str(exc))


def _upstream_error_text(resp: "SafeResponse") -> str:
    """The part of a non-2xx gateway body worth showing the operator.

    LiteLLM puts the useful sentence ("model not found", "budget exceeded") in
    `error.message`, so prefer that. Anything else - a CloudFront 502 page, an
    nginx banner, a LiteLLM traceback - is relayed only as a bounded snippet:
    this is upstream content going straight into a client-visible field, and the
    body can be megabytes of HTML.
    """
    try:
        body = resp.json()
    except Exception:
        body = None

    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str) and error["message"]:
            return error["message"][:_ERROR_SNIPPET_CHARS]
        if isinstance(error, str) and error:
            return error[:_ERROR_SNIPPET_CHARS]
        upstream_detail = body.get("detail")
        if isinstance(upstream_detail, str) and upstream_detail:
            return upstream_detail[:_ERROR_SNIPPET_CHARS]

    return resp.text[:_ERROR_SNIPPET_CHARS] or f"status {resp.status}"


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@router.get("/health")
async def health(_=Depends(require_role(Role.VIEWER))) -> Dict[str, Any]:
    """Probe the configured gateway endpoint. Returns deployed=false when
    the gateway isn't provisioned yet."""
    endpoint = os.getenv("LLM_GATEWAY_ENDPOINT", "") or os.getenv("LITELLM_GATEWAY_URL", "")
    if not endpoint:
        return {"deployed": False, "status": "not_deployed"}

    try:
        # Try /health/liveliness first, fall back to /health
        for path in ["/health/liveliness", "/health"]:
            try:
                if _gateway_fetch(f"{endpoint}{path}", timeout=5).status == 200:
                    return {"deployed": True, "status": "ok", "endpoint": endpoint}
            except Exception:
                continue
        return {"deployed": True, "status": "degraded", "endpoint": endpoint}
    except Exception as exc:  # pragma: no cover — best-effort probe
        logger.debug("LLM gateway health probe failed: %s", exc)
        return {"deployed": True, "status": "unreachable", "endpoint": endpoint}


# ---------------------------------------------------------------------------
# Instances (one per deployment)
# ---------------------------------------------------------------------------

@router.get("/instances", response_model=List[GatewayInstance])
async def list_instances(_=Depends(require_role(Role.VIEWER))) -> List[GatewayInstance]:
    """List deployed LLM Gateway instances. In local mode (LOCAL_MODE=true),
    returns a stub instance without calling DynamoDB. In production mode,
    reads from the deployments DDB table."""
    return await _list_instances_internal()


async def _list_instances_internal() -> List[GatewayInstance]:
    """Internal helper — fetches instances without auth check."""

    # Local mode: skip DynamoDB entirely — only Bedrock calls go to AWS
    # LOCAL_MODE is set only in docker-compose.yaml, never in ECS task definitions
    if os.getenv("LOCAL_MODE", "").lower() in ("true", "1", "yes"):
        gid = _gateway_id_from_settings() or "local-gateway"
        return [_stub_instance(gid)]

    try:
        import boto3

        # table_region("DEPLOYMENTS") for the table specifically, not _aws_region(). The
        # tier is the same (this is AVA's own deployments table), but _aws_region() reads
        # AWS_REGION with no way to override it per table, so DEPLOYMENTS_TABLE_REGION was
        # honoured by litellm.py's read of this exact table and ignored here. The two
        # readers then scanned different regions and this one returned no gateway
        # instances - an empty list, not an error. _aws_region() stays correct for the
        # ssm / ecs / s3 / logs clients below, which are the gateway's own infra.
        ddb = boto3.resource("dynamodb", region_name=region_config.table_region("DEPLOYMENTS"))
        table_name = getattr(settings, "DEPLOYMENTS_TABLE_NAME", None) or os.getenv("DEPLOYMENTS_TABLE_NAME")
        if not table_name:
            return []

        table = ddb.Table(table_name)
        resp = table.scan(
            FilterExpression="template_id = :t",
            ExpressionAttributeValues={":t": "llm-gateway"},
        )
        out: List[GatewayInstance] = []
        for item in resp.get("Items", []):
            outputs = item.get("outputs") or {}
            params = item.get("parameters") or {}
            out.append(GatewayInstance(
                id=item.get("deployment_id", item.get("id", "unknown")),
                name=item.get("project_name", "llm-gateway"),
                endpoint=str(outputs.get("gateway_endpoint", "")),
                admin_ui_url=str(outputs.get("admin_ui_url", "")),
                status=str(item.get("status", "UNKNOWN")),
                region=str(item.get("region", _aws_region())),
                environment=str(params.get("environment", "dev")),
                enabled_models=list(params.get("enabled_models", []) or []),
                attached_guardrail_id=str(params.get("attach_guardrail_id", "")) or None,
                langfuse_attached=bool(params.get("langfuse_host")),
                deployed_at=str(item.get("created_at", "")) or None,
                config_parameter_name=str(outputs.get("config_parameter_name", "")) or None,
                cluster_name=str(outputs.get("cluster_name", "")) or None,
                service_name=str(outputs.get("service_name", "")) or None,
                audit_log_group=str(outputs.get("audit_log_group_name", "")) or None,
                master_key_secret_arn=str(outputs.get("master_key_secret_arn", "")) or None,
            ))

        # If no instances found but gateway is reachable, auto-register it
        if not out:
            endpoint = os.getenv("LLM_GATEWAY_ENDPOINT", "") or os.getenv("LITELLM_GATEWAY_URL", "")
            if endpoint:
                try:
                    if _gateway_fetch(f"{endpoint}/health", timeout=5).status == 200:
                        table.put_item(Item={
                            "pk": "DEPLOYMENT#llm-gateway-auto",
                            "sk": "METADATA",
                            "deployment_id": "llm-gateway-auto",
                            "project_name": "llm-gateway",
                            "template_id": "llm-gateway",
                            "status": "DEPLOYED",
                            "region": _aws_region(),
                            "created_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
                            "parameters": {
                                "environment": os.getenv("ENVIRONMENT", "dev"),
                                "enabled_models": [],
                            },
                            "outputs": {
                                "gateway_endpoint": endpoint,
                                "cluster_name": os.getenv("LITELLM_ECS_CLUSTER", ""),
                                "service_name": os.getenv("LITELLM_ECS_SERVICE", ""),
                            },
                        })
                        logger.info("Auto-registered LLM gateway at %s", endpoint)
                        return await _list_instances_internal()
                except Exception as reg_exc:
                    logger.debug("Auto-registration failed: %s", _fetch_log_detail(reg_exc))

        return out
    except Exception as exc:
        logger.warning("Falling back to stub instance list: %s", exc)
        gid = _gateway_id_from_settings()
        return [_stub_instance(gid)] if gid else []


@router.get("/instances/{gateway_id}", response_model=GatewayInstance)
async def get_instance(gateway_id: str, _=Depends(require_role(Role.VIEWER))) -> GatewayInstance:
    return await _get_instance_by_id(gateway_id)


async def _get_instance_by_id(gateway_id: str) -> GatewayInstance:
    """Internal helper to look up a gateway instance (no auth check)."""
    for inst in await _list_instances_internal():
        if inst.id == gateway_id or inst.name == gateway_id:
            return inst
    raise HTTPException(status_code=404, detail="Gateway not found")


# ---------------------------------------------------------------------------
# Deploy (delegates to the existing Step Functions / CodeBuild deploy pipeline)
# ---------------------------------------------------------------------------

@router.post("/deploy")
async def deploy(req: DeployRequest, _=Depends(require_role(Role.OPERATOR))) -> Dict[str, Any]:
    """Kick off a deployment of the `llm-gateway` template.

    Delegates to the same `DeploymentService.create_deployment` path every
    other AVA template uses (Foundation Stack, Guardrails, etc.) — which
    writes a row to the deployments DDB table and starts the CodeBuild +
    Step Functions pipeline. We just hand it the LLM Gateway template id,
    iac_type=terraform, and the user-supplied parameters."""
    try:
        from models.deployment import DeploymentCreate
        from services.deployment_service import DeploymentService

        svc = DeploymentService(
            table_name=settings.DEPLOYMENTS_TABLE_NAME,
            region=_aws_region(),
        )

        parameters: Dict[str, Any] = {
            "project_name": req.project_name,
            "aws_region": req.aws_region,
            "environment": req.environment,
            "master_key": req.master_key,
            "litellm_version": req.litellm_version or "main-stable",
        }
        if req.enabled_models:
            parameters["enabled_models"] = req.enabled_models
        if req.attach_guardrail_id:
            parameters["attach_guardrail_id"] = req.attach_guardrail_id
            parameters["attach_guardrail_version"] = req.attach_guardrail_version or "DRAFT"
        if req.langfuse_host:
            parameters["langfuse_host"] = req.langfuse_host
        if req.existing_vpc_id:
            parameters["existing_vpc_id"] = req.existing_vpc_id
        if req.cognito_user_pool_id:
            parameters["cognito_user_pool_id"] = req.cognito_user_pool_id

        deployment = svc.create_deployment(DeploymentCreate(
            deployment_name=req.project_name,
            template_id="llm-gateway",
            iac_type="terraform",
            aws_region=req.aws_region,
            parameters=parameters,
        ))
        return {
            "deployment_id": deployment.deployment_id,
            "status": deployment.status,
            "project_name": req.project_name,
        }
    except HTTPException:
        raise
    except Exception:
        # A category, not `{exc}`: a botocore error stringifies with the full table
        # name / ARN, account id included, and this detail reaches the client. The
        # logger.exception above already carries the whole traceback.
        logger.exception("Failed to submit LLM Gateway deploy")
        raise HTTPException(status_code=500, detail="Deploy submission failed")


# ---------------------------------------------------------------------------
# Config (SSM Parameter is the source of truth, ECS reads it on boot)
# ---------------------------------------------------------------------------

@router.get("/{gateway_id}/config")
async def get_config(gateway_id: str, _=Depends(require_role(Role.VIEWER))) -> Dict[str, Any]:
    inst = await _get_instance_by_id(gateway_id)
    logger.info(
        "get_config: id=%s config_parameter_name=%r endpoint=%r",
        inst.id, inst.config_parameter_name, inst.endpoint,
    )

    # Local mode: read config from mounted file (no AWS calls)
    local_config_path = os.getenv("LITELLM_LOCAL_CONFIG_PATH", "")
    if os.getenv("LOCAL_MODE", "").lower() in ("true", "1", "yes") and local_config_path and os.path.isfile(local_config_path):
        with open(local_config_path, "r") as f:
            return {"config_yaml": f.read(), "version": 0}

    # Primary path: read from SSM Parameter (production / Terraform-deployed gateways)
    if inst.config_parameter_name:
        try:
            import boto3
            ssm = boto3.client("ssm", region_name=_aws_region())
            resp = ssm.get_parameter(Name=inst.config_parameter_name)
            return {"config_yaml": resp["Parameter"]["Value"], "version": resp["Parameter"]["Version"]}
        except Exception:
            # Reason only, same discipline as _fetch_reason: a ParameterNotFound or
            # AccessDeniedException stringifies with the SSM parameter name and the
            # account id, and this route is Role.VIEWER.
            logger.exception("Failed to read LLM Gateway config from SSM")
            raise HTTPException(status_code=500, detail="Config read from SSM failed")

    # Fallback: read config directly from the running gateway (local dev / docker-compose)
    endpoint = inst.endpoint or os.getenv("LITELLM_GATEWAY_URL", "")
    master_key = os.getenv("LITELLM_MASTER_KEY", "")
    s3_bucket = os.getenv("LITELLM_CONFIG_S3_BUCKET", "")
    s3_prefix = os.getenv("LITELLM_CONFIG_S3_PREFIX", "litellm")
    logger.info("get_config fallback: endpoint=%r master_key_set=%s s3_bucket=%r", endpoint, bool(master_key), s3_bucket)

    # Try S3 first (most reliable for AWS deployments)
    if s3_bucket:
        try:
            import boto3
            s3 = boto3.client("s3", region_name=_aws_region())
            s3_key = f"{s3_prefix}/config-latest.yaml"
            logger.info("Reading config from S3: s3://%s/%s", s3_bucket, s3_key)
            resp = s3.get_object(Bucket=s3_bucket, Key=s3_key)
            config_yaml = resp["Body"].read().decode("utf-8")
            return {"config_yaml": config_yaml, "version": 0}
        except Exception as exc:
            logger.warning("S3 config read failed: %s", exc)

    # Fallback: read from LiteLLM admin API
    if endpoint:
        import json

        # Try multiple auth header styles and API paths (varies by LiteLLM version)
        last_exc: Optional[BaseException] = None

        config_attempts = [
            # LiteLLM main-latest: GET /config/yaml needs config_info body (unusual but how litellm works)
            {"method": "GET", "path": "/config/yaml", "data": b'{"config_info": true}', "content_type": "application/json"},
            # Some versions need it as a POST
            {"method": "POST", "path": "/config/yaml", "data": b'{"config_info": true}', "content_type": "application/json"},
            # Query param variant
            {"method": "GET", "path": "/config/yaml?config_info=true", "data": None, "content_type": None},
            # Older LiteLLM path
            {"method": "GET", "path": "/get/config/yaml", "data": None, "content_type": None},
        ]

        for attempt in config_attempts:
            try:
                url = f"{endpoint}{attempt['path']}"
                hdrs = {"Authorization": f"Bearer {master_key}"} if master_key else {}
                if attempt["content_type"]:
                    hdrs["Content-Type"] = attempt["content_type"]
                logger.info("Attempting config read: %s %s", attempt["method"], url)
                # max_bytes explicitly: this is one of the admin-API reads
                # _ADMIN_API_MAX_BYTES exists for, and it is the only one that stays
                # on _gateway_fetch rather than _gateway_json (the success log below
                # reports the body size, so it needs the response, not just the
                # body). Without this argument it silently kept safe_fetch's 5 MiB
                # default, which _gateway_fetch's truncation refusal turns into a 502
                # for every attempt - so the only admin read that has to opt into the
                # cap by hand was also the only one that could not exceed 5 MiB.
                resp = _gateway_fetch(
                    url,
                    method=attempt["method"],
                    headers=hdrs,
                    body=attempt["data"],
                    timeout=10,
                    max_bytes=_ADMIN_API_MAX_BYTES,
                )
                logger.info(
                    "Config read SUCCESS from %s %s (status=%s, len=%d)",
                    attempt["method"], url, resp.status, len(resp.body),
                )
                body = resp.json()
                config_data = body.get("config", body)
                if isinstance(config_data, dict):
                    try:
                        import yaml
                        config_yaml = yaml.dump(config_data, default_flow_style=False, sort_keys=False)
                    except ImportError:
                        config_yaml = json.dumps(config_data, indent=2)
                else:
                    config_yaml = str(config_data)
                return {"config_yaml": config_yaml, "version": 0}
            except Exception as exc:
                logger.warning(
                    "Config read attempt %s %s%s failed: %s",
                    attempt["method"], endpoint, attempt["path"], _fetch_log_detail(exc),
                )
                last_exc = exc
                continue

        raise HTTPException(
            status_code=502,
            detail=f"Config read from gateway failed after trying all paths: {_fetch_reason(last_exc)}",
        )

    raise HTTPException(status_code=404, detail="No config source available: no SSM parameter and no gateway endpoint")


@router.put("/{gateway_id}/config")
async def update_config(gateway_id: str, req: ConfigUpdate, _=Depends(require_role(Role.OPERATOR))) -> Dict[str, Any]:
    """Write a new config.yaml to SSM and trigger an ECS service redeploy
    so the proxy picks it up. This keeps the container image immutable and
    every edit lands in CloudTrail."""
    inst = await _get_instance_by_id(gateway_id)

    # Primary path: write to SSM + redeploy ECS (production / Terraform-deployed)
    if inst.config_parameter_name:
        try:
            import boto3

            ssm = boto3.client("ssm", region_name=_aws_region())
            ssm.put_parameter(
                Name=inst.config_parameter_name,
                Value=req.config_yaml,
                Overwrite=True,
                Type="String",
                Tier="Advanced",
            )

            ecs = boto3.client("ecs", region_name=_aws_region())
            if inst.cluster_name and inst.service_name:
                ecs.update_service(
                    cluster=inst.cluster_name,
                    service=inst.service_name,
                    forceNewDeployment=True,
                )

            return {"status": "ok", "rollout": "ECS forceNewDeployment triggered"}
        except Exception:
            # As in get_config: the boto3 text names the parameter, the cluster and
            # the account. The traceback is in the log, not in the response.
            logger.exception("Failed to update LLM Gateway config")
            raise HTTPException(status_code=500, detail="Config update failed")

    # Fallback: push config via the gateway admin API (local dev / docker-compose)
    endpoint = inst.endpoint or os.getenv("LITELLM_GATEWAY_URL", "")
    master_key = os.getenv("LITELLM_MASTER_KEY", "")
    s3_bucket = os.getenv("LITELLM_CONFIG_S3_BUCKET", "")
    s3_prefix = os.getenv("LITELLM_CONFIG_S3_PREFIX", "litellm")

    # Write to S3 + trigger ECS redeploy (AWS deployment without SSM)
    if s3_bucket:
        try:
            import boto3

            s3 = boto3.client("s3", region_name=_aws_region())
            s3_key = f"{s3_prefix}/config-latest.yaml"
            version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            versioned_key = f"{s3_prefix}/config-{version}.yaml"

            # Write both latest and versioned copy
            s3.put_object(Bucket=s3_bucket, Key=s3_key, Body=req.config_yaml.encode())
            s3.put_object(Bucket=s3_bucket, Key=versioned_key, Body=req.config_yaml.encode())
            logger.info("Config written to s3://%s/%s", s3_bucket, s3_key)

            # Trigger ECS rolling update so the gateway picks up the new config
            ecs_cluster = inst.cluster_name or os.getenv("LITELLM_ECS_CLUSTER", "")
            ecs_service = inst.service_name or os.getenv("LITELLM_ECS_SERVICE", "")
            if ecs_cluster and ecs_service:
                ecs = boto3.client("ecs", region_name=_aws_region())
                ecs.update_service(
                    cluster=ecs_cluster,
                    service=ecs_service,
                    forceNewDeployment=True,
                )
                return {"status": "ok", "rollout": "Config saved to S3 + ECS forceNewDeployment triggered"}
            return {"status": "ok", "rollout": "Config saved to S3 (no ECS service to redeploy)"}
        except Exception:
            # The bucket name and the account id live in the boto3 message; keep both
            # out of the response body.
            logger.exception("S3 config update failed")
            raise HTTPException(status_code=500, detail="Config update to S3 failed")

    # Local dev fallback: push via gateway admin API
    if endpoint:
        try:
            import json

            # The response body is deliberately unread: this path only cares that the
            # gateway accepted the push, which _gateway_fetch's status check asserts.
            _gateway_fetch(
                f"{endpoint}/config/update",
                method="POST",
                body=json.dumps({"config_yaml": req.config_yaml}),
                headers={
                    "Content-Type": "application/json",
                    **({"Authorization": f"Bearer {master_key}"} if master_key else {}),
                },
                timeout=10,
            )
            return {"status": "ok", "rollout": "Config pushed to gateway (local dev)"}
        except Exception as exc:
            logger.warning("Fallback config update via gateway failed: %s", _fetch_log_detail(exc))
            raise HTTPException(
                status_code=500,
                detail=f"Config update failed (fallback): {_fetch_reason(exc)}",
            )

    raise HTTPException(status_code=404, detail="Config parameter unknown for this gateway and gateway unreachable")


# ---------------------------------------------------------------------------
# Models exposed by the gateway (from LiteLLM /v1/models)
# ---------------------------------------------------------------------------

@router.get("/{gateway_id}/models")
async def list_models(gateway_id: str, _=Depends(require_role(Role.VIEWER))) -> List[Dict[str, Any]]:
    inst = await _get_instance_by_id(gateway_id)
    if not inst.endpoint:
        return []

    master_key = _resolve_master_key(inst)
    try:
        payload = _gateway_json(
            f"{inst.endpoint}/v1/models",
            headers={"Authorization": f"Bearer {master_key}"} if master_key else {},
            timeout=8,
        )
        models = payload.get("data", [])
        # Fix owned_by — LiteLLM defaults to "openai" for all models
        for m in models:
            m["owned_by"] = _infer_model_owner(m.get("id", ""))
        # De-duplicate: the gateway config has both display aliases (e.g., "Claude Haiku 4.5")
        # and raw Bedrock model ID aliases (e.g., "us.anthropic.claude-haiku-4-5-20251001-v1:0")
        # for routing purposes. The UI should only show display aliases (human-readable names).
        models = _filter_display_models(models)
        return models
    except Exception as exc:
        logger.warning("Failed to fetch /v1/models: %s", _fetch_log_detail(exc))
        # Fallback: surface the configured list so the UI never shows empty
        return [{"id": m, "object": "model", "owned_by": _infer_model_owner(m)} for m in inst.enabled_models]


def _filter_display_models(models: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """De-duplicate raw Bedrock model IDs *only when* human-readable display
    aliases are also present.

    Some gateway configs register both a display alias (e.g., "Claude Haiku 4.5")
    and a raw Bedrock ID / cross-region inference profile
    (e.g., "us.anthropic.claude-haiku-4-5-20251001-v1:0") for the same model. In
    that case the UI should show only the display aliases.

    However, many configs use the inference-profile IDs *as* the model names and
    have no separate display aliases. Filtering those out would leave the UI
    empty, so if every model looks like a raw ID we keep them all.
    """
    import re

    # Raw Bedrock model IDs / cross-region inference profiles start with a
    # dot-separated provider prefix (us.anthropic.*, us.amazon.*, openai.*, ...).
    raw_id_pattern = re.compile(
        r"^(us\.|eu\.|apac\.|global\.|openai\.|anthropic\.|amazon\.|meta\.|mistral\.|cohere\.)"
    )

    display = [m for m in models if not raw_id_pattern.match(m.get("id", ""))]
    # Only drop the raw IDs when there are display aliases to fall back on.
    # Otherwise (raw-ID-only configs) return the full list so the UI isn't empty.
    return display if display else models


# ---------------------------------------------------------------------------
# Virtual keys (LiteLLM admin endpoint /key/generate)
# ---------------------------------------------------------------------------

@router.post("/{gateway_id}/virtual-keys")
async def create_virtual_key(gateway_id: str, req: VirtualKeyCreate, _=Depends(require_role(Role.OPERATOR))) -> Dict[str, Any]:
    inst = await _get_instance_by_id(gateway_id)
    if not inst.endpoint:
        raise HTTPException(status_code=503, detail="Gateway endpoint unavailable")

    master_key = _resolve_master_key(inst)
    try:
        import json

        payload = req.model_dump(exclude_none=True)
        # LiteLLM /key/generate names the human-readable label `key_alias`, not
        # `name`. Without this mapping the created key shows a blank alias in the UI.
        if "name" in payload:
            payload["key_alias"] = payload.pop("name")
        return _gateway_json(
            f"{inst.endpoint}/key/generate",
            method="POST",
            body=json.dumps(payload),
            headers={
                "Authorization": f"Bearer {master_key}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
    except Exception as exc:
        logger.exception("Virtual key create failed: %s", _fetch_log_detail(exc))
        raise HTTPException(
            status_code=502,
            detail=f"LiteLLM /key/generate failed: {_fetch_reason(exc)}",
        )


@router.get("/{gateway_id}/virtual-keys")
async def list_virtual_keys(gateway_id: str, _=Depends(require_role(Role.VIEWER))) -> List[Dict[str, Any]]:
    inst = await _get_instance_by_id(gateway_id)
    if not inst.endpoint:
        return []

    master_key = _resolve_master_key(inst)
    try:
        # Try /key/list first, then /key/info
        for path in ["/key/list", "/key/info"]:
            try:
                payload = _gateway_json(
                    f"{inst.endpoint}{path}",
                    headers={"Authorization": f"Bearer {master_key}"},
                    timeout=10,
                )

                # Normalize response to list
                if isinstance(payload, dict):
                    items = payload.get("keys", payload.get("data", []))
                elif isinstance(payload, list):
                    items = payload
                else:
                    continue

                # If items are already dicts with key_alias, return directly
                if items and isinstance(items[0], dict):
                    return items

                # Items are key hash strings — fetch full info for each
                result = []
                for key_hash in items:
                    if not isinstance(key_hash, str) or not key_hash:
                        continue
                    try:
                        key_info = _gateway_json(
                            f"{inst.endpoint}/key/info?key={key_hash}",
                            headers={"Authorization": f"Bearer {master_key}"},
                            timeout=5,
                        )
                        if isinstance(key_info, dict):
                            # /key/info returns {"info": {...}, "key": "..."} or just the object
                            info = key_info.get("info", key_info)
                            result.append(info)
                        elif isinstance(key_info, list) and key_info:
                            result.append(key_info[0] if isinstance(key_info[0], dict) else {"token": key_hash})
                    except Exception:
                        result.append({"token": key_hash, "key_alias": key_hash[:12] + "..."})
                return result
            except Exception as exc:
                logger.warning("Key list path %s failed: %s", path, _fetch_log_detail(exc))
                continue
        return []
    except Exception as exc:
        logger.warning("Falling back to empty key list: %s", _fetch_log_detail(exc))
        return []


def _infer_model_owner(model_name: str) -> str:
    """Map a model display name to its provider for the owned_by field."""
    name_lower = model_name.lower()
    if "claude" in name_lower or "anthropic" in name_lower:
        return "anthropic"
    if "gpt" in name_lower or "openai" in name_lower:
        return "openai"
    if "nova" in name_lower or "amazon" in name_lower or "titan" in name_lower:
        return "amazon"
    if "mistral" in name_lower:
        return "mistral"
    if "llama" in name_lower or "meta" in name_lower:
        return "meta"
    if "cohere" in name_lower or "command" in name_lower:
        return "cohere"
    return "bedrock"


def _resolve_master_key(inst: GatewayInstance) -> str:
    """Fetch the gateway master key from Secrets Manager — never echo it back.

    Resolution order:
      1. The instance's own master_key_secret_arn (from the deployment record's
         DDB outputs) — this is the authoritative per-gateway source and works
         for any dynamically-deployed gateway without static wiring.
      2. LLM_GATEWAY_MASTER_KEY_SECRET_ARN env var (static override).
      3. Plaintext env vars (LLM_GATEWAY_MASTER_KEY / LITELLM_MASTER_KEY) —
         local dev / docker-compose.
    """
    secret_arn = (
        getattr(inst, "master_key_secret_arn", None)
        or os.getenv("LLM_GATEWAY_MASTER_KEY_SECRET_ARN", "")
    )
    if not secret_arn:
        # Check multiple env var names (deployment configs vary)
        return (
            os.getenv("LLM_GATEWAY_MASTER_KEY", "")
            or os.getenv("LITELLM_MASTER_KEY", "")
        )

    try:
        import boto3
        import json as _json

        sm = boto3.client("secretsmanager", region_name=_aws_region())
        secret_str = sm.get_secret_value(SecretId=secret_arn)["SecretString"]
        try:
            data = _json.loads(secret_str)
        except (ValueError, TypeError):
            # Secret stored as a plaintext key string, not JSON.
            return secret_str
        return data.get("master_key") or data.get("api_key") or ""
    except Exception as exc:
        logger.warning("Failed to resolve master key from secret %s: %s", secret_arn, exc)
        return ""


# ---------------------------------------------------------------------------
# Spend (LiteLLM /spend/keys + /spend/users), or empty when not deployed
# ---------------------------------------------------------------------------

@router.get("/{gateway_id}/spend")
async def get_spend(
    gateway_id: str,
    days: int = Query(default=30, ge=1, le=90),
    _=Depends(require_role(Role.VIEWER)),
) -> Dict[str, Any]:
    inst = await _get_instance_by_id(gateway_id)
    if not inst.endpoint:
        return {"days": days, "total_usd": 0.0, "by_key": [], "by_model": []}

    master_key = _resolve_master_key(inst)
    try:
        start = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
        end = datetime.utcnow().strftime("%Y-%m-%d")

        # Fetch overall spend from /spend/logs (daily aggregation)
        spend_paths = [
            f"/global/spend/report?start_date={start}&end_date={end}",
            f"/spend/logs?start_date={start}&end_date={end}",
            "/global/spend",
        ]
        total = 0.0
        by_key: List[Dict[str, Any]] = []
        by_model: List[Dict[str, Any]] = []

        for path in spend_paths:
            try:
                url = f"{inst.endpoint}{path}"
                logger.info("Attempting spend fetch: %s", url)
                payload = _gateway_json(
                    url, headers={"Authorization": f"Bearer {master_key}"}, timeout=10
                )
                logger.info("Spend fetch succeeded from %s", path)

                # Normalize response
                if isinstance(payload, dict) and "data" in payload:
                    payload = payload["data"]
                if isinstance(payload, list):
                    skip_fields = {"users", "models", "model", "spend", "startTime", "endTime", "call_type", "None"}
                    key_spend: Dict[str, float] = {}
                    for entry in payload:
                        if not isinstance(entry, dict):
                            continue
                        total += float(entry.get("spend", 0) or 0)
                        for k, v in entry.items():
                            if k in skip_fields:
                                continue
                            if isinstance(v, (int, float)) and v > 0:
                                key_spend[k] = key_spend.get(k, 0) + v
                    by_key = [{"api_key": k, "spend": s} for k, s in sorted(key_spend.items(), key=lambda x: -x[1])]
                elif isinstance(payload, dict):
                    total = float(payload.get("total_spend", 0.0))
                    by_key = payload.get("spend_per_key", [])
                    by_model = payload.get("spend_per_model", [])
                break  # success, stop trying paths
            except Exception as path_exc:
                logger.warning("Spend path %s failed: %s", path, _fetch_log_detail(path_exc))
                continue

        # Fetch model-level spend separately (different endpoint)
        if not by_model:
            model_paths = [
                f"/global/spend/models?start_date={start}&end_date={end}",
                f"/spend/logs?start_date={start}&end_date={end}&group_by=model",
            ]
            for mpath in model_paths:
                try:
                    mpayload = _gateway_json(
                        f"{inst.endpoint}{mpath}",
                        headers={"Authorization": f"Bearer {master_key}"},
                        timeout=10,
                    )
                    if isinstance(mpayload, list):
                        model_spend_map: Dict[str, float] = {}
                        for entry in mpayload:
                            if isinstance(entry, dict):
                                m = entry.get("model", entry.get("models", ""))
                                if isinstance(m, list):
                                    m = m[0] if m else ""
                                s = float(entry.get("spend", entry.get("total_spend", 0)) or 0)
                                if m and s > 0:
                                    model_spend_map[m] = model_spend_map.get(m, 0) + s
                        by_model = [{"model": m, "spend": s} for m, s in sorted(model_spend_map.items(), key=lambda x: -x[1])]
                    if by_model:
                        break
                except Exception:
                    continue

        # Resolve key hashes to human-readable names
        if by_key:
            for entry in by_key:
                key_hash = entry.get("api_key", "")
                if key_hash and len(key_hash) > 20 and key_hash != "litellm_proxy_master_key":
                    try:
                        key_info = _gateway_json(
                            f"{inst.endpoint}/key/info?key={key_hash}",
                            headers={"Authorization": f"Bearer {master_key}"},
                            timeout=5,
                        )
                        info = key_info.get("info", key_info) if isinstance(key_info, dict) else {}
                        alias = info.get("key_alias") or info.get("key_name", "")
                        if alias:
                            entry["key_alias"] = alias
                    except Exception:
                        pass
                elif key_hash == "litellm_proxy_master_key":
                    entry["key_alias"] = "Master Key"

        return {"days": days, "total_usd": total, "by_key": by_key, "by_model": by_model}
    except Exception as exc:
        logger.warning("Spend fetch failed, returning zeros: %s", _fetch_log_detail(exc))
        return {"days": days, "total_usd": 0.0, "by_key": [], "by_model": []}


# ---------------------------------------------------------------------------
# Audit — pulls from CloudWatch Logs (AWS) or LiteLLM spend/logs API (local)
# ---------------------------------------------------------------------------

@router.get("/{gateway_id}/audit")
async def get_audit(
    gateway_id: str,
    hours: int = Query(default=24, ge=1, le=168),
    limit: int = Query(default=100, ge=1, le=500),
    _=Depends(require_role(Role.VIEWER)),
) -> Dict[str, Any]:
    """Fetch request-level audit data.

    Two modes:
      1. CloudWatch Logs Insights — used when audit_log_group is configured
         (AWS deployments provisioned via Terraform).
      2. LiteLLM API fallback — queries /spend/logs for request-level records
         stored in the gateway's Postgres DB. Works for docker-compose / local
         dev and as a resilient fallback when CloudWatch isn't available.

    Returns a structured response with source indicator so the UI can adapt.
    """
    inst = await _get_instance_by_id(gateway_id)

    # ---- Mode 1: CloudWatch Logs Insights (AWS deployments) ----
    if inst.audit_log_group:
        try:
            import boto3

            logs = boto3.client("logs", region_name=_aws_region())
            now = datetime.now(timezone.utc)
            start = now - timedelta(hours=hours)

            q = logs.start_query(
                logGroupName=inst.audit_log_group,
                startTime=int(start.timestamp()),
                endTime=int(now.timestamp()),
                queryString=(
                    "fields @timestamp, @message "
                    "| filter @message like /\\\"request_id\\\"/ "
                    f"| sort @timestamp desc | limit {limit}"
                ),
            )
            qid = q["queryId"]
            for _ in range(20):
                time.sleep(0.5)
                result = logs.get_query_results(queryId=qid)
                if result.get("status") == "Complete":
                    break
            rows: List[Dict[str, Any]] = []
            for row in result.get("results", []):
                entry = {f["field"]: f["value"] for f in row if not f["field"].startswith("@ptr")}
                rows.append(entry)
            return {"source": "cloudwatch", "log_group": inst.audit_log_group, "rows": rows}
        except Exception as exc:
            logger.warning("CloudWatch audit fetch failed, trying LiteLLM fallback: %s", exc)
            # Fall through to Mode 2

    # ---- Mode 2: LiteLLM API fallback (local dev / docker-compose / resilience) ----
    endpoint = inst.endpoint or os.getenv("LITELLM_GATEWAY_URL", "")
    if not endpoint:
        return {"source": "none", "log_group": None, "rows": []}

    master_key = _resolve_master_key(inst)
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours)
    start_date = start.strftime("%Y-%m-%d %H:%M:%S")
    end_date = now.strftime("%Y-%m-%d %H:%M:%S")

    # Try multiple LiteLLM endpoints for request-level logs
    audit_paths = [
        f"/spend/logs?start_date={start_date}&end_date={end_date}",
        f"/global/spend/logs?start_date={start_date}&end_date={end_date}",
        "/spend/logs",
    ]

    for path in audit_paths:
        try:
            url = f"{endpoint}{path}"
            logger.info("Attempting audit fetch from LiteLLM API: %s", url)
            payload = _gateway_json(
                url,
                headers={"Authorization": f"Bearer {master_key}"} if master_key else {},
                timeout=15,
            )

            # Normalize response — LiteLLM returns a list of spend log entries
            entries = payload if isinstance(payload, list) else payload.get("data", [])

            # Transform to structured audit rows
            rows = []
            for entry in entries[:limit]:
                if not isinstance(entry, dict):
                    continue
                row: Dict[str, Any] = {
                    "request_id": entry.get("request_id", ""),
                    "timestamp": entry.get("startTime") or entry.get("start_time") or entry.get("created_at", ""),
                    "model": entry.get("model", ""),
                    "api_key": entry.get("api_key", ""),
                    "key_alias": entry.get("key_alias") or entry.get("key_name", ""),
                    "status": _audit_status(entry),
                    "tokens": {
                        "prompt": entry.get("prompt_tokens") or entry.get("input_tokens", 0),
                        "completion": entry.get("completion_tokens") or entry.get("output_tokens", 0),
                        "total": entry.get("total_tokens", 0),
                    },
                    "spend_usd": float(entry.get("spend", 0) or 0),
                    "end_user": entry.get("end_user") or entry.get("user", ""),
                    "team_id": entry.get("team_id", ""),
                    "cache_hit": entry.get("cache_hit") or entry.get("cache_key") is not None,
                }
                # Include response time if available
                start_time = entry.get("startTime") or entry.get("start_time", "")
                end_time = entry.get("endTime") or entry.get("end_time", "")
                if start_time and end_time:
                    try:
                        from datetime import datetime as _dt
                        # Try ISO format parsing (stdlib, no dateutil dependency)
                        st = _dt.fromisoformat(str(start_time).replace("Z", "+00:00"))
                        et = _dt.fromisoformat(str(end_time).replace("Z", "+00:00"))
                        row["duration_ms"] = int((et - st).total_seconds() * 1000)
                    except Exception:
                        pass
                rows.append(row)

            # Sort by timestamp descending
            rows.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
            return {"source": "litellm_api", "log_group": None, "rows": rows}
        except Exception as exc:
            logger.warning("Audit path %s failed: %s", path, _fetch_log_detail(exc))
            continue

    return {"source": "none", "log_group": None, "rows": []}


def _audit_status(entry: Dict[str, Any]) -> str:
    """Derive a human-friendly status from a spend log entry."""
    if entry.get("error"):
        return "error"
    if entry.get("status") and str(entry["status"]).lower() in ("success", "200"):
        return "success"
    if entry.get("completion_tokens") or entry.get("output_tokens"):
        return "success"
    if entry.get("status"):
        return str(entry["status"]).lower()
    return "unknown"


# ---------------------------------------------------------------------------
# Playground — proxies chat completions through the backend so the browser
# doesn't need direct access to the internal ALB.
# ---------------------------------------------------------------------------

class PlaygroundRequest(BaseModel):
    model: str
    messages: List[Dict[str, str]]
    max_tokens: int = 600
    virtual_key: Optional[str] = None


@router.post("/{gateway_id}/playground")
async def playground(gateway_id: str, req: PlaygroundRequest, _=Depends(require_role(Role.OPERATOR))) -> Dict[str, Any]:
    """Proxy a chat completion request to the LiteLLM gateway.

    The browser can't reach the internal ALB directly, so this endpoint
    relays the request using the master key (or a user-supplied virtual key)
    for authentication."""
    inst = await _get_instance_by_id(gateway_id)
    endpoint = inst.endpoint or os.getenv("LITELLM_GATEWAY_URL", "")
    if not endpoint:
        raise HTTPException(status_code=503, detail="Gateway endpoint unavailable")

    # Use the provided virtual key, or fall back to the gateway master key
    # (resolved per-instance from Secrets Manager — same path key creation uses).
    # This matches the UI hint "uses master key if empty".
    auth_key = req.virtual_key or _resolve_master_key(inst)
    if not auth_key:
        raise HTTPException(
            status_code=503,
            detail="No virtual key provided and the gateway master key could not be resolved.",
        )

    try:
        import json

        payload = json.dumps({
            "model": req.model,
            "messages": req.messages,
            "max_tokens": req.max_tokens,
        })

        # require_ok=False: a non-2xx body is the useful part here. LiteLLM explains
        # a bad model id or an exhausted budget in it, and the UI shows that text.
        # That is the gateway's own content, not the target address `urlopen` used
        # to leak, so relaying it is unchanged.
        #
        # A body over the cap is refused by _gateway_fetch, which raises
        # response_too_large rather than handing back JSON that lost its tail. This
        # relay was always one buffered read, so nothing here streams.
        resp = _gateway_fetch(
            f"{endpoint}/v1/chat/completions",
            method="POST",
            body=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {auth_key}",
            },
            timeout=60,
            require_ok=False,
        )
        if not (200 <= resp.status < 300):
            raise HTTPException(
                status_code=502,
                detail=f"Gateway request failed: {_upstream_error_text(resp)}",
            )
        return resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Playground request failed: %s", _fetch_log_detail(exc))
        raise HTTPException(status_code=502, detail=f"Gateway request failed: {_fetch_reason(exc)}")
