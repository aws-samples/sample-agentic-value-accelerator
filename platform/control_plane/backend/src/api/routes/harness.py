"""Bedrock AgentCore Harness API routes.

Wraps the `bedrock-agentcore-control` and `bedrock-agentcore` APIs so the UI
can drive the harness product area without exposing raw SDK calls to the
frontend. v1 scope is intentionally narrow:

  * list / get / create / update / delete a harness
  * list versions + list / update endpoints (promote/rollback DEFAULT)
  * invoke_harness with SSE streaming
  * list foundation models for the dynamic model dropdown

Advanced knobs (skills, BYO container, VPC/EFS/S3 mounts, custom JWT auth,
inline function tools, InvokeAgentRuntimeCommand shell, harness export)
are deferred to v2 per the locked design in memory/project_harness_module.md.

Execution-role auto-provisioning is handled by the harness_execution_role
Terraform module; this route only *references* the role ARN.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Depends as RBACDepends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core.config import settings
from core.rbac import Role, require_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/harness", tags=["harness"])


# ─── Boto3 clients (lazy) ───────────────────────────────────────────────────

_control_client = None
_data_client = None
_bedrock_client = None


def _control():
    global _control_client
    if _control_client is None:
        _control_client = boto3.client("bedrock-agentcore-control", region_name=settings.AWS_REGION)
    return _control_client


def _data():
    global _data_client
    if _data_client is None:
        _data_client = boto3.client("bedrock-agentcore", region_name=settings.AWS_REGION)
    return _data_client


def _bedrock():
    global _bedrock_client
    if _bedrock_client is None:
        _bedrock_client = boto3.client("bedrock", region_name=settings.AWS_REGION)
    return _bedrock_client


# ─── Request / response shapes ──────────────────────────────────────────────


class ToolConfig(BaseModel):
    """Simplified v1 tool config. Only the four types the wizard exposes.

    * agentcore_browser  — one-line toggle
    * agentcore_code_interpreter — one-line toggle
    * remote_mcp — URL + optional bearer header
    * agentcore_gateway — pre-existing gateway ARN
    """
    type: str
    name: str
    url: Optional[str] = None
    header_name: Optional[str] = None
    header_value: Optional[str] = None
    gateway_arn: Optional[str] = None


class MemoryConfig(BaseModel):
    mode: str = Field(default="managed", description="managed | disabled | byo")
    strategies: List[str] = Field(default_factory=lambda: ["SEMANTIC", "SUMMARIZATION"])
    event_expiry_duration: int = 30
    byo_memory_arn: Optional[str] = None


class GuardrailConfig(BaseModel):
    guardrail_id: str
    guardrail_version: str = "DRAFT"


class HarnessCreateRequest(BaseModel):
    harness_name: str = Field(..., min_length=1, max_length=100)
    execution_role_arn: Optional[str] = Field(
        default=None,
        description="If omitted, falls back to HARNESS_EXECUTION_ROLE_ARN (auto-provisioned by Terraform).",
    )
    system_prompt: Optional[str] = None
    model_id: Optional[str] = Field(
        default=None,
        description="If omitted, harness defaults to Claude Sonnet 4.6 on Bedrock.",
    )
    api_format: str = Field(default="converse_stream", description="converse_stream|responses|chat_completions")
    tools: List[ToolConfig] = Field(default_factory=list)
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    guardrail: Optional[GuardrailConfig] = None
    max_iterations: Optional[int] = None
    timeout_seconds: Optional[int] = None
    max_tokens: Optional[int] = None
    tags: Dict[str, str] = Field(default_factory=dict)


class HarnessUpdateRequest(BaseModel):
    system_prompt: Optional[str] = None
    model_id: Optional[str] = None
    api_format: Optional[str] = None
    tools: Optional[List[ToolConfig]] = None
    memory: Optional[MemoryConfig] = None
    guardrail: Optional[GuardrailConfig] = None
    max_iterations: Optional[int] = None
    timeout_seconds: Optional[int] = None
    max_tokens: Optional[int] = None


class HarnessInvokeRequest(BaseModel):
    harness_arn: str
    session_id: str = Field(..., min_length=33, description="runtimeSessionId must be ≥33 chars per API contract")
    actor_id: Optional[str] = None
    message: str


class HarnessEndpointUpdateRequest(BaseModel):
    target_version: str


# ─── Helpers ────────────────────────────────────────────────────────────────


def _build_tools_sdk(tools: List[ToolConfig]) -> List[Dict[str, Any]]:
    """Translate the UI-friendly ToolConfig into the SDK shape.

    Only v1 tool types. Anything unknown is rejected — v2 will extend this.
    """
    out: List[Dict[str, Any]] = []
    for t in tools:
        if t.type == "agentcore_browser":
            out.append({"type": "agentcore_browser", "name": t.name or "browser"})
        elif t.type == "agentcore_code_interpreter":
            out.append({"type": "agentcore_code_interpreter", "name": t.name or "code_interpreter"})
        elif t.type == "remote_mcp":
            if not t.url:
                raise HTTPException(status_code=400, detail=f"remote_mcp tool '{t.name}' missing url")
            remote_cfg: Dict[str, Any] = {"url": t.url}
            if t.header_name and t.header_value:
                remote_cfg["headers"] = {t.header_name: t.header_value}
            out.append({"type": "remote_mcp", "name": t.name, "config": {"remoteMcp": remote_cfg}})
        elif t.type == "agentcore_gateway":
            if not t.gateway_arn:
                raise HTTPException(status_code=400, detail=f"agentcore_gateway tool '{t.name}' missing gateway_arn")
            out.append(
                {
                    "type": "agentcore_gateway",
                    "name": t.name,
                    "config": {"agentCoreGateway": {"gatewayArn": t.gateway_arn}},
                }
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported tool type '{t.type}' in v1")
    return out


def _build_model_sdk(model_id: Optional[str], api_format: str, guardrail: Optional[GuardrailConfig]) -> Optional[Dict[str, Any]]:
    """Build the model config block. Only Bedrock-side models in v1.

    Guardrail is attached as `additionalParams.guardrailConfig` per the docs —
    requires `apiFormat=converse_stream`, which is our default.
    """
    if not model_id and not guardrail:
        return None
    bedrock_cfg: Dict[str, Any] = {}
    if model_id:
        bedrock_cfg["modelId"] = model_id
    if api_format:
        bedrock_cfg["apiFormat"] = api_format
    if guardrail:
        bedrock_cfg["additionalParams"] = {
            "guardrailConfig": {
                "guardrailIdentifier": guardrail.guardrail_id,
                "guardrailVersion": guardrail.guardrail_version,
                "trace": "enabled_full",
            }
        }
    return {"bedrockModelConfig": bedrock_cfg}


def _build_memory_sdk(mem: MemoryConfig) -> Dict[str, Any]:
    # The AgentCore `memory` parameter is a tagged union of three flat keys.
    # The current boto3 schema (verified via ParamValidationError) rejects any
    # wrapper: it must be `{disabled}`, `{agentCoreMemoryConfiguration}`, or
    # `{managedMemoryConfiguration}` at the top level. An earlier version of
    # this function wrapped everything in `optionalValue` based on a stale
    # UpdateHarness error; that wrapper is invalid for both create and update
    # in the current SDK.
    if mem.mode == "disabled":
        return {"disabled": {}}
    if mem.mode == "byo":
        if not mem.byo_memory_arn:
            raise HTTPException(status_code=400, detail="byo memory requires byo_memory_arn")
        return {"agentCoreMemoryConfiguration": {"arn": mem.byo_memory_arn}}
    return {
        "managedMemoryConfiguration": {
            "strategies": mem.strategies,
            "eventExpiryDuration": mem.event_expiry_duration,
        }
    }


def _summarize_harness(h: Dict[str, Any]) -> Dict[str, Any]:
    """Collapse a full GetHarness response into a UI-shaped card row.

    ListHarnesses summaries include only a subset of fields (no model/tools),
    which is why those show as "default" on the landing until a full
    GetHarness fetch. The version field is `harnessVersion` in the wire
    shape.
    """
    model = h.get("model") or {}
    return {
        "harness_id": h.get("harnessId"),
        "harness_arn": h.get("harnessArn") or h.get("arn"),
        "harness_name": h.get("harnessName"),
        "status": h.get("status"),
        "model_id": (
            (model.get("bedrockModelConfig") or {}).get("modelId")
            or (model.get("openAiModelConfig") or {}).get("modelId")
            or (model.get("liteLlmModelConfig") or {}).get("modelId")
        ),
        "tools": [t.get("name") for t in (h.get("tools") or []) if isinstance(t, dict)],
        "version": h.get("harnessVersion") or h.get("version"),
        "updated_at": (h.get("updatedAt") or "").isoformat() if hasattr(h.get("updatedAt", ""), "isoformat") else str(h.get("updatedAt") or ""),
        "created_at": (h.get("createdAt") or "").isoformat() if hasattr(h.get("createdAt", ""), "isoformat") else str(h.get("createdAt") or ""),
    }


# ─── Routes ─────────────────────────────────────────────────────────────────


@router.get("/defaults")
async def get_defaults(_=RBACDepends(require_role(Role.VIEWER))):
    """Return the auto-provisioned execution role ARN + region.

    The Create wizard reads this so users never see the IAM plumbing — the
    field is pre-filled and the user just clicks Create.
    """
    return {
        "execution_role_arn": settings.HARNESS_EXECUTION_ROLE_ARN,
        "aws_region": settings.AWS_REGION,
    }


@router.get("/foundation-models")
async def list_foundation_models(_=RBACDepends(require_role(Role.VIEWER))):
    """Dynamic model dropdown source. Filters to text-output, on-demand models."""
    try:
        resp = _bedrock().list_foundation_models(
            byOutputModality="TEXT",
            byInferenceType="ON_DEMAND",
        )
        models = []
        for m in resp.get("modelSummaries", []):
            models.append(
                {
                    "modelId": m.get("modelId"),
                    "modelName": m.get("modelName"),
                    "providerName": m.get("providerName"),
                    "inputModalities": m.get("inputModalities", []),
                    "outputModalities": m.get("outputModalities", []),
                }
            )
        return {"models": models}
    except ClientError as e:
        logger.error(f"list_foundation_models failed: {e}")
        raise HTTPException(status_code=500, detail=f"Bedrock list-foundation-models failed: {e}")


@router.get("/list")
async def list_harnesses(_=RBACDepends(require_role(Role.VIEWER))):
    """List every harness in this account/region.

    NOTE: The real API response uses the key `harnesses` (verified against
    boto3). Older docs use `harnessSummaries`; we accept either for
    resilience against SDK drift.
    """
    try:
        resp = _control().list_harnesses()
        rows = resp.get("harnesses") or resp.get("harnessSummaries") or []
        return {"harnesses": [_summarize_harness(h) for h in rows]}
    except ClientError as e:
        logger.error(f"list_harnesses failed: {e}")
        # Gracefully degrade — return empty list rather than 500 so the UI still renders
        # if the API is unavailable in this region.
        return {"harnesses": [], "warning": str(e)}


@router.get("/{harness_id}")
async def get_harness(harness_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    try:
        resp = _control().get_harness(harnessId=harness_id)
        # GetHarness returns { "harness": { ... } } — unwrap so the frontend
        # can read fields at the top level (harnessName, systemPrompt,
        # createdAt, updatedAt, model, tools, etc).
        return resp.get("harness") or resp
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            raise HTTPException(status_code=404, detail=f"Harness {harness_id} not found")
        logger.error(f"get_harness failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", status_code=201)
async def create_harness(req: HarnessCreateRequest, _=RBACDepends(require_role(Role.OPERATOR))):
    """Create a new harness. Execution role must exist (auto-provisioned by TF)."""
    role_arn = (req.execution_role_arn or settings.HARNESS_EXECUTION_ROLE_ARN or "").strip()
    if not role_arn:
        raise HTTPException(
            status_code=400,
            detail=(
                "No execution role available. Either pass execution_role_arn "
                "or apply the control-plane Terraform (which auto-provisions "
                "HARNESS_EXECUTION_ROLE_ARN)."
            ),
        )
    kwargs: Dict[str, Any] = {
        "harnessName": req.harness_name,
        "executionRoleArn": role_arn,
    }
    if req.system_prompt:
        kwargs["systemPrompt"] = [{"text": req.system_prompt}]
    model_block = _build_model_sdk(req.model_id, req.api_format, req.guardrail)
    if model_block:
        kwargs["model"] = model_block
    if req.tools:
        kwargs["tools"] = _build_tools_sdk(req.tools)
    kwargs["memory"] = _build_memory_sdk(req.memory)
    if req.max_iterations is not None:
        kwargs["maxIterations"] = req.max_iterations
    if req.timeout_seconds is not None:
        kwargs["timeoutSeconds"] = req.timeout_seconds
    if req.max_tokens is not None:
        kwargs["maxTokens"] = req.max_tokens
    if req.tags:
        kwargs["tags"] = req.tags

    try:
        resp = _control().create_harness(**kwargs)
        return resp
    except ClientError as e:
        logger.error(f"create_harness failed: {e}")
        raise HTTPException(status_code=500, detail=f"CreateHarness failed: {e}")


@router.patch("/{harness_id}")
async def update_harness(harness_id: str, req: HarnessUpdateRequest, _=RBACDepends(require_role(Role.OPERATOR))):
    kwargs: Dict[str, Any] = {"harnessId": harness_id}
    if req.system_prompt is not None:
        kwargs["systemPrompt"] = [{"text": req.system_prompt}]
    if req.model_id or req.guardrail:
        model_block = _build_model_sdk(req.model_id, req.api_format or "converse_stream", req.guardrail)
        if model_block:
            kwargs["model"] = model_block
    if req.tools is not None:
        kwargs["tools"] = _build_tools_sdk(req.tools)
    if req.memory is not None:
        kwargs["memory"] = _build_memory_sdk(req.memory)
    if req.max_iterations is not None:
        kwargs["maxIterations"] = req.max_iterations
    if req.timeout_seconds is not None:
        kwargs["timeoutSeconds"] = req.timeout_seconds
    if req.max_tokens is not None:
        kwargs["maxTokens"] = req.max_tokens

    try:
        resp = _control().update_harness(**kwargs)
        # Boto3 responses can contain datetimes; unwrap and let FastAPI's
        # jsonable_encoder handle them. Also mirror the get_harness contract:
        # unwrap the { "harness": { ... } } envelope if present so the UI can
        # read fields at the top level after the round-trip.
        return resp.get("harness") if isinstance(resp, dict) and "harness" in resp else resp
    except ClientError as e:
        logger.error(f"update_harness ClientError: {e}")
        raise HTTPException(status_code=500, detail=f"UpdateHarness failed: {e}")
    except Exception as e:
        # ParamValidationError, BotoCoreError, JSON serialization issues, etc.
        # would otherwise fall through as opaque "Internal server error".
        # Log full traceback and echo the type/message so the wizard can show
        # something actionable instead of a naked 500.
        logger.exception("update_harness unhandled exception")
        raise HTTPException(
            status_code=500,
            detail=f"UpdateHarness {type(e).__name__}: {e}",
        )


@router.delete("/{harness_id}", status_code=204)
async def delete_harness(harness_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    try:
        _control().delete_harness(harnessId=harness_id)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            return
        logger.error(f"delete_harness failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Versions + endpoints ───────────────────────────────────────────────────


@router.get("/{harness_id}/versions")
async def list_versions(harness_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    try:
        resp = _control().list_harness_versions(harnessId=harness_id)
        return {"versions": resp.get("harnessVersions", [])}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{harness_id}/endpoints")
async def list_endpoints(harness_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    try:
        resp = _control().list_harness_endpoints(harnessId=harness_id)
        return {"endpoints": resp.get("endpoints", [])}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{harness_id}/endpoints/{endpoint_name}")
async def update_endpoint(
    harness_id: str,
    endpoint_name: str,
    req: HarnessEndpointUpdateRequest,
    _=RBACDepends(require_role(Role.OPERATOR)),
):
    """Promote or roll back an endpoint to a specific version."""
    try:
        return _control().update_harness_endpoint(
            harnessId=harness_id,
            endpointName=endpoint_name,
            targetVersion=req.target_version,
        )
    except ClientError as e:
        logger.error(f"update_harness_endpoint failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Invoke (SSE) ───────────────────────────────────────────────────────────


def _sse_stream(req: HarnessInvokeRequest):
    """Yield SSE-formatted events for the frontend EventSource.

    We flatten the InvokeHarness event stream into `event: <type>\\ndata: <json>\\n\\n`
    so the browser can parse each chunk without special-casing binary framing.

    IMPORTANT: boto3's EventStream raises EventStreamError lazily while the
    iterator advances — not on the initial invoke_harness() call. We therefore
    have to guard *both* the invoke call and every iteration step, otherwise
    a runtime-level error (legacy model access denied, throttling, guardrail
    block, etc.) bubbles all the way up to the ASGI layer and the frontend
    sees a generic 503 instead of a readable error.
    """
    from botocore.exceptions import EventStreamError  # local import — narrow scope

    kwargs: Dict[str, Any] = {
        "harnessArn": req.harness_arn,
        "runtimeSessionId": req.session_id,
        "messages": [{"role": "user", "content": [{"text": req.message}]}],
    }
    if req.actor_id:
        kwargs["actorId"] = req.actor_id

    try:
        resp = _data().invoke_harness(**kwargs)
    except ClientError as e:
        logger.error(f"invoke_harness failed: {e}")
        yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
        return

    stream = resp.get("stream")
    if stream is None:
        yield f"event: error\ndata: {json.dumps({'message': 'InvokeHarness returned no stream.'})}\n\n"
        return

    # Manual iteration so we can catch EventStreamError per-chunk.
    it = iter(stream)
    while True:
        try:
            event = next(it)
        except StopIteration:
            break
        except EventStreamError as e:
            # Extract the nested message when present so the UI shows the real
            # cause (e.g. "This Model is marked by provider as Legacy…").
            resp_body = getattr(e, "response", None) or {}
            err = (resp_body.get("Error") or {}) if isinstance(resp_body, dict) else {}
            code = err.get("Code") or type(e).__name__
            msg = err.get("Message") or str(e)
            logger.error(f"InvokeHarness event stream error: {code}: {msg}")
            yield f"event: error\ndata: {json.dumps({'code': code, 'message': msg})}\n\n"
            return
        except Exception as e:
            logger.exception("Unhandled error while streaming harness response")
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
            return

        # boto3 gives us one dict per event with exactly one top-level key.
        # Some events carry `bytes` payloads (raw ConverseStream chunks); those
        # need to be decoded to UTF-8 text so the browser can JSON.parse them.
        # Otherwise json.dumps produces `"b'\\x7b...'"` — a python-repr string
        # the frontend can't unwrap, causing "no response" symptoms even when
        # the harness returned a valid answer.
        for name, payload in event.items():
            payload = _normalize_stream_payload(payload)
            logger.info(f"InvokeHarness event name={name} keys={list(payload.keys()) if isinstance(payload, dict) else type(payload).__name__}")
            try:
                data = json.dumps(payload, default=str)
            except Exception:
                data = json.dumps({"repr": repr(payload)})
            yield f"event: {name}\ndata: {data}\n\n"

    yield "event: done\ndata: {}\n\n"


def _normalize_stream_payload(payload: Any) -> Any:
    """Decode bytes members inside an InvokeHarness event so the SSE frame is
    plain JSON the browser can parse.

    boto3 sometimes surfaces a chunk as {"bytes": b'{"delta":{"text":"…"}}'}
    (or as a top-level bytes value). json.dumps(bytes, default=str) produces
    a python `repr` string, not the underlying JSON — so the frontend's
    extractText walks a string it can't parse and renders nothing.
    """
    if isinstance(payload, dict):
        out: Dict[str, Any] = {}
        for k, v in payload.items():
            if k == "bytes" and isinstance(v, (bytes, bytearray)):
                # ConverseStream event stream chunks are UTF-8 JSON bytes.
                try:
                    decoded = v.decode("utf-8")
                except Exception:
                    decoded = v.decode("utf-8", errors="replace")
                # Try to parse the decoded chunk as JSON so the frontend gets
                # a real object to walk instead of an opaque string. Fall back
                # to the raw decoded text if it isn't valid JSON.
                try:
                    out[k] = json.loads(decoded)
                except Exception:
                    out[k] = decoded
            elif isinstance(v, (bytes, bytearray)):
                try:
                    out[k] = v.decode("utf-8")
                except Exception:
                    out[k] = v.decode("utf-8", errors="replace")
            else:
                out[k] = _normalize_stream_payload(v)
        return out
    if isinstance(payload, list):
        return [_normalize_stream_payload(v) for v in payload]
    if isinstance(payload, (bytes, bytearray)):
        try:
            return payload.decode("utf-8")
        except Exception:
            return payload.decode("utf-8", errors="replace")
    return payload


@router.post("/invoke")
async def invoke_harness(req: HarnessInvokeRequest, _=RBACDepends(require_role(Role.OPERATOR))):
    """SSE-streamed InvokeHarness proxy.

    Frontend consumes with `new EventSource('/api/v1/harness/invoke', ...)` — the
    Fetch API + ReadableStream also work since the response is `text/event-stream`.
    """
    return StreamingResponse(_sse_stream(req), media_type="text/event-stream")
