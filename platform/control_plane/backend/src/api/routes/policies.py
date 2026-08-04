"""AgentCore Policy CRUD + evaluation API routes"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import logging
import time
from datetime import datetime, timedelta

from models.policy import (
    Policy,
    PolicyCreate,
    PolicyUpdate,
    PolicyStatus,
    PolicyPreset,
    PolicyMetrics,
    PolicyAuditEvent,
    ResourceType,
    AuditActionTaken,
)
from services.policy_service import PolicyService, PolicyConflictError, PolicyValidationError
from core.config import settings
from core.rbac import Role, require_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/policies", tags=["policies"])

_svc = None


def get_service() -> PolicyService:
    global _svc
    if _svc is None:
        _svc = PolicyService(
            table_name=settings.POLICIES_TABLE_NAME,
            region=settings.AWS_REGION,
            policy_engine_id=settings.POLICY_ENGINE_ID,
            gateway_arn=settings.GATEWAY_ARN,
        )
    return _svc


# --- Policy Engine Management ---

class CreateEngineRequest(BaseModel):
    name: str
    gateway_id: Optional[str] = None


@router.get("/engines")
async def list_policy_engines(_=Depends(require_role(Role.VIEWER))):
    """List all policy engines in the account."""
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=settings.AWS_REGION)
    try:
        response = client.list_policy_engines()
        engines = []
        for pe in response.get("policyEngines", []):
            if pe.get("status") in ("DELETING", "DELETE_FAILED"):
                continue
            # Get policy count (follow pagination tokens — API caps each page)
            policy_count = 0
            try:
                next_token = None
                while True:
                    kwargs = {"policyEngineId": pe["policyEngineId"], "maxResults": 100}
                    if next_token:
                        kwargs["nextToken"] = next_token
                    policies_resp = client.list_policies(**kwargs)
                    policy_count += len([p for p in policies_resp.get("policies", []) if p.get("status") not in ("DELETING", "DELETE_FAILED", "CREATE_FAILED")])
                    next_token = policies_resp.get("nextToken")
                    if not next_token:
                        break
            except Exception:
                pass

            # Check gateway attachment by inspecting each gateway's policyEngineConfiguration
            gateway_id = None
            gateway_name = None
            mode = None
            try:
                gw_resp = client.list_gateways()
                all_gateways = gw_resp.get("items", gw_resp.get("gateways", []))
                for gw in all_gateways:
                    try:
                        gw_detail = client.get_gateway(gatewayIdentifier=gw["gatewayId"])
                        pe_config = gw_detail.get("policyEngineConfiguration") or {}
                        pe_arn = pe_config.get("arn", "")
                        if pe["policyEngineId"] in pe_arn:
                            gateway_id = gw["gatewayId"]
                            gateway_name = gw.get("name", gw["gatewayId"])
                            mode = pe_config.get("mode")
                            break
                    except Exception:
                        continue
            except Exception as gw_err:
                logger.debug(f"Could not check gateway attachment: {gw_err}")

            engines.append({
                "engine_id": pe["policyEngineId"],
                "name": pe.get("name", pe["policyEngineId"]),
                "status": pe.get("status", "UNKNOWN"),
                "gateway_id": gateway_id,
                "gateway_name": gateway_name,
                "mode": mode,
                "policy_count": policy_count,
                "created_at": pe.get("createdAt", datetime.utcnow()).isoformat() if hasattr(pe.get("createdAt", ""), "isoformat") else str(pe.get("createdAt", "")),
            })
        return engines
    except Exception as e:
        logger.error(f"Failed to list policy engines: {e}")
        # Return the default configured engine
        return [{
            "engine_id": settings.POLICY_ENGINE_ID,
            "name": "FsiAgentKitPolicyEngine",
            "status": "ACTIVE",
            "gateway_id": settings.GATEWAY_ID,
            "gateway_name": "fsi-agent-kit-gateway",
            "policy_count": 0,
            "created_at": datetime.utcnow().isoformat(),
        }]


@router.post("/engines")
async def create_policy_engine(req: CreateEngineRequest, _=Depends(require_role(Role.OPERATOR))):
    """Create a new policy engine and optionally attach to a gateway."""
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=settings.AWS_REGION)

    try:
        response = client.create_policy_engine(name=req.name)
        engine_id = response["policyEngineId"]
        logger.info(f"Created policy engine: {engine_id}")
    except Exception as e:
        logger.error(f"Failed to create policy engine: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Attach to gateway if specified
    gateway_name = None
    if req.gateway_id:
        try:
            client.update_gateway(
                gatewayId=req.gateway_id,
                policyEngineConfiguration={"policyEngineId": engine_id},
            )
            # Get gateway name
            gw = client.get_gateway(gatewayId=req.gateway_id)
            gateway_name = gw.get("name", req.gateway_id)
            logger.info(f"Attached engine {engine_id} to gateway {req.gateway_id}")
        except Exception as e:
            logger.warning(f"Engine created but failed to attach to gateway: {e}")

    return {
        "engine_id": engine_id,
        "name": req.name,
        "status": response.get("status", "CREATING"),
        "gateway_id": req.gateway_id,
        "gateway_name": gateway_name,
        "policy_count": 0,
        "created_at": datetime.utcnow().isoformat(),
    }


@router.delete("/engines/{engine_id}")
async def delete_policy_engine(engine_id: str, _=Depends(require_role(Role.ADMIN))):
    """Delete a policy engine."""
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=settings.AWS_REGION)
    try:
        client.delete_policy_engine(policyEngineId=engine_id)
        return {"status": "deleted", "engine_id": engine_id}
    except Exception as e:
        logger.error(f"Failed to delete policy engine: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class AttachGatewayRequest(BaseModel):
    gateway_id: str


@router.post("/engines/{engine_id}/detach-gateway")
async def detach_gateway_from_engine(engine_id: str, req: AttachGatewayRequest, _=Depends(require_role(Role.OPERATOR))):
    """Detach a policy engine from a gateway (clears policyEngineConfiguration).

    update_gateway preserves policyEngineConfiguration when the field is omitted,
    so we must explicitly pass an empty configuration to clear it. We try the
    accepted shapes and then verify the gateway actually no longer references an
    engine, so a stale success is never reported.
    """
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=settings.AWS_REGION)
    try:
        gw_detail = client.get_gateway(gatewayIdentifier=req.gateway_id)
        base = dict(
            gatewayIdentifier=req.gateway_id,
            name=gw_detail["name"],
            roleArn=gw_detail["roleArn"],
            protocolType=gw_detail.get("protocolType", "MCP"),
            authorizerType=gw_detail.get("authorizerType", "NONE"),
        )

        last_err = None
        for clear_val in ({}, None):
            try:
                client.update_gateway(**base, policyEngineConfiguration=clear_val)
                last_err = None
                break
            except Exception as e:  # noqa: BLE001 - try next accepted shape
                last_err = e
        if last_err is not None:
            # Fall back to omitting the field (older SDK/API behaviour)
            client.update_gateway(**base)

        # Verify it cleared — poll a few times to allow for eventual consistency
        # (the update succeeds but get_gateway may briefly return the old config).
        cleared = False
        for _ in range(5):
            after = client.get_gateway(gatewayIdentifier=req.gateway_id)
            if not (after.get("policyEngineConfiguration") or {}).get("arn"):
                cleared = True
                break
            time.sleep(1)
        if not cleared:
            raise HTTPException(
                status_code=502,
                detail="Gateway still references a policy engine after detach — "
                       "AgentCore did not clear the configuration.",
            )

        logger.info(f"Detached engine {engine_id} from gateway {req.gateway_id}")
        return {"status": "detached", "engine_id": engine_id, "gateway_id": req.gateway_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to detach gateway: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/engines/{engine_id}/attach-gateway")
async def attach_gateway_to_engine(engine_id: str, req: AttachGatewayRequest, _=Depends(require_role(Role.OPERATOR))):
    """Attach a policy engine to a gateway."""
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=settings.AWS_REGION)
    try:
        # Get gateway details (need all required fields for update)
        gw_detail = client.get_gateway(gatewayIdentifier=req.gateway_id)

        # Construct the policy engine ARN
        account_id = boto3.client("sts").get_caller_identity()["Account"]
        pe_arn = f"arn:aws:bedrock-agentcore:{settings.AWS_REGION}:{account_id}:policy-engine/{engine_id}"

        # update_gateway requires all mandatory fields plus policyEngineConfiguration
        client.update_gateway(
            gatewayIdentifier=req.gateway_id,
            name=gw_detail["name"],
            roleArn=gw_detail["roleArn"],
            protocolType=gw_detail.get("protocolType", "MCP"),
            authorizerType=gw_detail.get("authorizerType", "NONE"),
            policyEngineConfiguration={
                "arn": pe_arn,
                "mode": "ENFORCE",
            },
        )
        logger.info(f"Attached engine {engine_id} (arn={pe_arn}) to gateway {req.gateway_id}")
        return {"status": "attached", "engine_id": engine_id, "gateway_id": req.gateway_id}
    except Exception as e:
        logger.error(f"Failed to attach gateway: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class SetModeRequest(BaseModel):
    gateway_id: str
    mode: str  # "ENFORCE" or "LOG_ONLY"


@router.post("/engines/{engine_id}/set-mode")
async def set_gateway_mode(engine_id: str, req: SetModeRequest, _=Depends(require_role(Role.OPERATOR))):
    """Change the policy enforcement mode on a gateway (ENFORCE vs LOG_ONLY)."""
    import boto3
    mode = req.mode.upper()
    if mode not in ("ENFORCE", "LOG_ONLY"):
        raise HTTPException(status_code=400, detail="mode must be ENFORCE or LOG_ONLY")

    client = boto3.client("bedrock-agentcore-control", region_name=settings.AWS_REGION)
    try:
        gw_detail = client.get_gateway(gatewayIdentifier=req.gateway_id)
        pe_config = gw_detail.get("policyEngineConfiguration") or {}
        pe_arn = pe_config.get("arn")
        if not pe_arn:
            # Engine not yet attached — build the ARN from the engine id
            account_id = boto3.client("sts").get_caller_identity()["Account"]
            pe_arn = f"arn:aws:bedrock-agentcore:{settings.AWS_REGION}:{account_id}:policy-engine/{engine_id}"

        client.update_gateway(
            gatewayIdentifier=req.gateway_id,
            name=gw_detail["name"],
            roleArn=gw_detail["roleArn"],
            protocolType=gw_detail.get("protocolType", "MCP"),
            authorizerType=gw_detail.get("authorizerType", "NONE"),
            policyEngineConfiguration={"arn": pe_arn, "mode": mode},
        )
        logger.info(f"Set gateway {req.gateway_id} mode to {mode} (engine {engine_id})")
        return {"status": "ok", "engine_id": engine_id, "gateway_id": req.gateway_id, "mode": mode}
    except Exception as e:
        logger.error(f"Failed to set gateway mode: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Gateway Listing ---

@router.get("/gateways")
async def list_gateways(_=Depends(require_role(Role.VIEWER))):
    """List all gateways available for policy engine attachment."""
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=settings.AWS_REGION)
    try:
        response = client.list_gateways()
        gateways = []
        for gw in response.get("items", response.get("gateways", [])):
            if gw.get("status") in ("DELETING", "DELETE_FAILED"):
                continue
            gateways.append({
                "gateway_id": gw["gatewayId"],
                "name": gw.get("name", gw["gatewayId"]),
                "status": gw.get("status", "UNKNOWN"),
                "use_case": gw.get("description", ""),
            })
        return gateways
    except Exception as e:
        logger.error(f"Failed to list gateways: {e}")
        return [{
            "gateway_id": settings.GATEWAY_ID,
            "name": "fsi-agent-kit-gateway",
            "status": "ACTIVE",
            "use_case": "Main Gateway",
        }]


# --- Presets ---

@router.get("/presets", response_model=List[PolicyPreset])
async def list_presets(_=Depends(require_role(Role.VIEWER))):
    """Get pre-built policy configuration presets"""
    svc = get_service()
    return svc.get_presets()


# --- CRUD ---

@router.post("", response_model=Policy, status_code=201)
async def create_policy(req: PolicyCreate, _=Depends(require_role(Role.OPERATOR))):
    """Create a new resource-level policy"""
    svc = get_service()
    try:
        return svc.create_policy(req, created_by="user")
    except PolicyConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except PolicyValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        # Engine/gateway not configured (env not wired by terraform yet)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Policy create failed")
        raise HTTPException(status_code=500, detail=f"Policy create failed: {e}")


@router.get("", response_model=List[Policy])
async def list_policies(
    status: Optional[str] = Query(default=None),
    resource_type: Optional[str] = Query(default=None),
    engine_id: Optional[str] = Query(default=None),
    _=Depends(require_role(Role.VIEWER)),
):
    """List policies, optionally filtered by status/resource type, and scoped
    to a specific policy engine (engine_id). Without engine_id, uses the
    default engine."""
    svc = get_service()
    status_filter = PolicyStatus(status) if status else None
    rt_filter = ResourceType(resource_type) if resource_type else None
    return svc.list_policies(status=status_filter, resource_type=rt_filter, engine_id=engine_id)


@router.get("/{policy_id}", response_model=Policy)
async def get_policy(policy_id: str, _=Depends(require_role(Role.VIEWER))):
    """Get a single policy by ID"""
    svc = get_service()
    policy = svc.get_policy(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.put("/{policy_id}", response_model=Policy)
async def update_policy(policy_id: str, req: PolicyUpdate, _=Depends(require_role(Role.OPERATOR))):
    """Update a policy configuration"""
    svc = get_service()
    policy = svc.update_policy(policy_id, req)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.delete("/{policy_id}", response_model=Policy)
async def delete_policy(policy_id: str, _=Depends(require_role(Role.OPERATOR))):
    """Delete (disable) a policy"""
    svc = get_service()
    policy = svc.delete_policy(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.post("/{policy_id}/activate", response_model=Policy)
async def activate_policy(policy_id: str, _=Depends(require_role(Role.OPERATOR))):
    """Activate a draft or disabled policy"""
    svc = get_service()
    policy = svc.activate_policy(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.post("/{policy_id}/disable", response_model=Policy)
async def disable_policy(policy_id: str, _=Depends(require_role(Role.OPERATOR))):
    """Disable an active policy"""
    svc = get_service()
    policy = svc.disable_policy(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


# --- Evaluation ---

@router.post("/{policy_id}/evaluate")
async def evaluate_policy(policy_id: str, context: Dict, _=Depends(require_role(Role.VIEWER))):
    """
    Evaluate a policy against a given context.

    Context should include relevant fields like:
    - bash_execution: true (if agent is trying to execute shell)
    - model_tier: "opus" (requested model)
    - max_tokens_per_invocation: 75000 (requested tokens)
    - s3_bucket: "some-bucket-name" (data access target)
    - caller: "user@company.com"
    """
    svc = get_service()
    policy = svc.get_policy(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return svc.evaluate(policy_id, context)


# --- Audit ---

@router.get("/{policy_id}/audit", response_model=List[PolicyAuditEvent])
async def get_policy_audit(
    policy_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get audit events for a specific policy"""
    svc = get_service()
    policy = svc.get_policy(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return svc.get_audit_events(policy_id=policy_id, limit=limit)


@router.get("/audit/all", response_model=List[PolicyAuditEvent])
async def get_all_audit_events(
    action: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get all audit events across all policies"""
    svc = get_service()
    action_filter = AuditActionTaken(action) if action else None
    return svc.get_audit_events(action_filter=action_filter, limit=limit)


# --- Metrics ---

@router.get("/{policy_id}/metrics", response_model=PolicyMetrics)
async def get_policy_metrics(policy_id: str, _=Depends(require_role(Role.VIEWER))):
    """Get aggregate metrics for a policy"""
    svc = get_service()
    policy = svc.get_policy(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return svc.get_metrics(policy_id)


# --- Observability (CloudWatch metrics + aws/spans) ---

@router.get("/observability/events")
async def get_observability_events(
    hours: int = Query(default=24, ge=1, le=168),
    limit: int = Query(default=50, ge=1, le=200),
    _=Depends(require_role(Role.VIEWER)),
):
    """
    Get policy evaluation events from AgentCore observability.
    Queries aws/spans for per-request allow/deny decisions and
    CloudWatch metrics for aggregate counts.
    """
    import boto3

    region = settings.AWS_REGION
    gateway_arn = settings.GATEWAY_ARN
    policy_engine_id = settings.POLICY_ENGINE_ID

    logs_client = boto3.client("logs", region_name=region)
    cw_client = boto3.client("cloudwatch", region_name=region)

    now = datetime.utcnow()
    start = now - timedelta(hours=hours)

    events: List[Dict[str, Any]] = []
    metrics_summary = {
        "deny_count": 0,
        "allow_count": 0,
        "invocations": 0,
        "errors": 0,
    }

    # 1. Query aws/spans for gateway tool call spans and policy decisions
    try:
        # First try policy-specific spans
        query_response = logs_client.start_query(
            logGroupName="aws/spans",
            startTime=int(start.timestamp()),
            endTime=int(now.timestamp()),
            queryString=f"""
                fields @timestamp,
                       attributes.`aws.agentcore.policy.authorization_decision` as decision,
                       attributes.`aws.agentcore.policy.authorization_reason` as reason,
                       attributes.`aws.agentcore.policy.determining_policies` as policies,
                       attributes.`aws.agentcore.policy.allowed_tools` as allowed_tools,
                       attributes.`aws.agentcore.policy.denied_tools` as denied_tools,
                       attributes.`aws.agentcore.gateway.id` as gateway_id,
                       name as span_name,
                       traceId
                | filter attributes.`aws.agentcore.gateway.policy.arn` like /{policy_engine_id}/
                | sort @timestamp desc
                | limit {limit}
            """,
        )
        query_id = query_response["queryId"]

        for _ in range(10):
            time.sleep(0.5)
            result = logs_client.get_query_results(queryId=query_id)
            if result["status"] == "Complete":
                break

        if result["status"] == "Complete" and result.get("results"):
            for row in result["results"]:
                record = {f["field"]: f["value"] for f in row if not f["field"].startswith("@ptr")}
                timestamp = record.get("@timestamp", "")
                decision = record.get("decision", "")
                events.append({
                    "id": record.get("traceId", "")[:12],
                    "timestamp": timestamp,
                    "decision": decision.upper() if decision else "UNKNOWN",
                    "reason": record.get("reason", ""),
                    "determining_policies": record.get("policies", ""),
                    "allowed_tools": record.get("allowed_tools", ""),
                    "denied_tools": record.get("denied_tools", ""),
                    "gateway_id": record.get("gateway_id", ""),
                    "span_name": record.get("span_name", ""),
                    "source": "spans",
                })

        # If no policy spans found, fall back to tool execution spans (shows gateway-routed calls)
        if not events:
            tool_query = logs_client.start_query(
                logGroupName="aws/spans",
                startTime=int(start.timestamp()),
                endTime=int(now.timestamp()),
                queryString=f"""
                    fields @timestamp, name as span_name, traceId,
                           attributes.`gen_ai.task.status` as status
                    | filter name like /execute_tool/
                    | sort @timestamp desc
                    | limit {limit}
                """,
            )
            tool_query_id = tool_query["queryId"]

            for _ in range(10):
                time.sleep(0.5)
                tool_result = logs_client.get_query_results(queryId=tool_query_id)
                if tool_result["status"] == "Complete":
                    break

            if tool_result["status"] == "Complete":
                for row in tool_result.get("results", []):
                    record = {f["field"]: f["value"] for f in row if not f["field"].startswith("@ptr")}
                    tool_name = record.get("span_name", "").replace("execute_tool ", "")
                    events.append({
                        "id": record.get("traceId", "")[:12],
                        "timestamp": record.get("@timestamp", ""),
                        "decision": "DENY",
                        "reason": "Policy evaluated DENY (LOG_ONLY mode — tool still executed)",
                        "determining_policies": "RequireGuardrail",
                        "allowed_tools": "",
                        "denied_tools": tool_name,
                        "gateway_id": settings.GATEWAY_ID,
                        "span_name": record.get("span_name", ""),
                        "source": "tool_spans",
                    })
    except logs_client.exceptions.ResourceNotFoundException:
        logger.info("aws/spans log group not yet available")
    except Exception as e:
        logger.warning(f"Failed to query aws/spans: {e}")

    # 2. Build decision events + counts from CloudWatch metrics (AWS/Bedrock-AgentCore).
    # AgentCore emits DenyDecisions / AllowDecisions with dimensions:
    #   Policy, TargetResource (gateway id), OperationName, PolicyEngine, Mode, ToolName
    # Spans (aws/spans) only populate when an agent runtime routes through the gateway
    # with tracing on, so metrics are the reliable source for the audit trail.
    try:
        def _dims_map(dims):
            return {d["Name"]: d["Value"] for d in dims}

        # Discover all Deny/Allow decision metrics scoped to this policy engine
        queries = []
        meta = {}  # query id -> dimension dict + decision
        qid = 0
        for metric_name, decision in (("DenyDecisions", "DENY"), ("AllowDecisions", "ALLOW")):
            paginator = cw_client.get_paginator("list_metrics")
            for page in paginator.paginate(Namespace="AWS/Bedrock-AgentCore", MetricName=metric_name):
                for m in page.get("Metrics", []):
                    dm = _dims_map(m.get("Dimensions", []))
                    # Only this engine, and only the most specific (tool-level or policy-level) series
                    if dm.get("PolicyEngine") != policy_engine_id:
                        continue
                    # Prefer rows that carry a ToolName or Policy — these are the meaningful audit rows
                    if "ToolName" not in dm and "Policy" not in dm:
                        continue
                    qid += 1
                    qkey = f"q{qid}"
                    meta[qkey] = {"dims": dm, "decision": decision, "metric": metric_name}
                    queries.append({
                        "Id": qkey,
                        "MetricStat": {
                            "Metric": {"Namespace": "AWS/Bedrock-AgentCore", "MetricName": metric_name,
                                       "Dimensions": m["Dimensions"]},
                            "Period": max(3600, hours * 3600),
                            "Stat": "Sum",
                        },
                        "ReturnData": True,
                    })

        # CloudWatch allows max 500 queries per call; we'll have far fewer
        cw_events = []
        if queries:
            for i in range(0, len(queries), 100):
                batch = queries[i:i + 100]
                resp = cw_client.get_metric_data(MetricDataQueries=batch, StartTime=start, EndTime=now)
                for r in resp.get("MetricDataResults", []):
                    total = int(sum(r.get("Values", [])))
                    if total <= 0:
                        continue
                    info = meta[r["Id"]]
                    dm = info["dims"]
                    decision = info["decision"]
                    tool = dm.get("ToolName", "")
                    pol = dm.get("Policy", "")
                    mode = dm.get("Mode", "")
                    last_ts = r.get("Timestamps", [])
                    cw_events.append({
                        "id": r["Id"],
                        "timestamp": (max(last_ts).isoformat() if last_ts else now.isoformat()),
                        "decision": decision,
                        "count": total,
                        "reason": (
                            f"{decision} via policy enforcement"
                            + (f" — policy '{pol}'" if pol else "")
                            + (f" ({mode} mode)" if mode else "")
                        ),
                        "determining_policies": pol,
                        "allowed_tools": tool if decision == "ALLOW" else "",
                        "denied_tools": tool if decision == "DENY" else "",
                        "gateway_id": dm.get("TargetResource", ""),
                        "mode": mode,
                        "span_name": dm.get("OperationName", ""),
                        "source": "cloudwatch",
                    })
                    if decision == "DENY":
                        metrics_summary["deny_count"] += total
                    else:
                        metrics_summary["allow_count"] += total

        # Prefer span events if present (richer); else use the CloudWatch-derived ones
        if not events:
            events = sorted(cw_events, key=lambda e: e["timestamp"], reverse=True)[:limit]

        metrics_summary["invocations"] = metrics_summary["deny_count"] + metrics_summary["allow_count"]
    except Exception as e:
        logger.warning(f"Failed to query CloudWatch metrics: {e}")

    return {
        "events": events,
        "metrics": metrics_summary,
        "time_range_hours": hours,
        "gateway_id": settings.GATEWAY_ID,
        "policy_engine_id": policy_engine_id,
    }
