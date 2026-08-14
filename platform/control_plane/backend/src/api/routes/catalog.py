"""Unified Build → Catalog aggregator.

Returns a single normalized list across every live resource in the account:

  * Harnesses           (bedrock-agentcore-control:ListHarnesses)
  * AgentCore Runtimes  (bedrock-agentcore-control:ListAgentRuntimes)
  * Deployments         (DDB — frontier agents, custom agents, FSI Foundry, templates)

Each item collapses to the same shape so the UI grid can render them without
knowing anything about the source. Type-specific detail pages own the deep
information.

Design decision: this route READS from existing sources; it does not maintain
a shadow inventory table. That way there's no drift risk between the catalog
view and the individual type-specific pages.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends as RBACDepends
from pydantic import BaseModel

from core.config import settings
from core.rbac import Role, require_role
from services.deployment_service import DeploymentService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/catalog", tags=["catalog"])


class CatalogItem(BaseModel):
    """UI-friendly shape. Any field may be empty — the frontend renders '—'."""

    id: str
    name: str
    type: str  # "harness" | "memory" | "agentcore-runtime" | "frontier-agent" | "custom-agent" | "app" | "template" | "mcp-server" | "agent" | "a2a-agent"
    status: str
    framework: str = ""
    guardrail_attached: bool = False
    updated_at: str = ""
    detail_href: str = ""
    # extras the card can surface without cluttering the shape
    model_id: str = ""
    aws_region: str = ""
    # AWS Agent Registry cross-reference. One of:
    #   'in_registry'     — published + APPROVED
    #   'pending'         — published but still PENDING_APPROVAL / DRAFT
    #   'rejected'        — published then REJECTED
    #   'deprecated'      — published then DEPRECATED
    #   'not_in_registry' — resource kind is publishable but no record found
    #   'not_applicable'  — resource kind isn't published to the registry
    #                       today (harness / memory / runtime / deployment)
    registry_status: str = "not_applicable"
    registry_record_id: str = ""


_control_client = None
_deploy_svc: Optional[DeploymentService] = None


def _control():
    global _control_client
    if _control_client is None:
        _control_client = boto3.client(
            "bedrock-agentcore-control", region_name=settings.AWS_REGION
        )
    return _control_client


def _svc() -> DeploymentService:
    global _deploy_svc
    if _deploy_svc is None:
        _deploy_svc = DeploymentService(
            table_name=settings.DEPLOYMENTS_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _deploy_svc


def _isoformat(v: Any) -> str:
    if v is None:
        return ""
    if hasattr(v, "isoformat"):
        try:
            return v.isoformat()
        except Exception:
            return str(v)
    return str(v)


def _detail_href_for_deployment(template_id: str, deployment_id: str) -> str:
    """Map a deployment record to the type-specific detail page."""
    t = (template_id or "").lower()
    if t.startswith("frontier-agents-"):
        agent_id = template_id.replace("frontier-agents-", "", 1)
        return f"/aaas/aws-agents/{agent_id}"
    if t.startswith("custom-agent"):
        return "/aaas/custom/my-agents"
    if t.startswith("app-factory"):
        return "/applications/my-apps"
    # FSI Foundry use cases and reference implementations all land in DeploymentDetail
    return f"/deployments/{deployment_id}"


def _classify_deployment_type(template_id: str) -> str:
    t = (template_id or "").lower()
    if t.startswith("frontier-agents-"):
        return "frontier-agent"
    if t.startswith("custom-agent"):
        return "custom-agent"
    if t.startswith("app-factory"):
        return "app"
    if t.startswith("foundation-stack"):
        return "template"
    return "app"


# Allow-list of statuses considered "live and usable." Anything else
# (CREATING, UPDATING, CREATE_FAILED, pending, deploying, failed, destroyed, …)
# is filtered out server-side so the catalog never surfaces noise.
_HARNESS_READY_STATUSES = {"READY"}
_RUNTIME_READY_STATUSES = {"READY"}
_DEPLOYMENT_READY_STATUSES = {"deployed"}


@router.get("", response_model=List[CatalogItem])
async def list_catalog(_=RBACDepends(require_role(Role.VIEWER))):
    """Union of harnesses + agentcore runtimes + deployment records.

    Only returns resources in a terminal-ready state — READY for AgentCore
    resources, `deployed` for deployment records. Anything mid-flight or
    failed is filtered out so operators see only usable resources.

    Failures on any single source degrade gracefully — an unreachable API
    contributes zero items rather than 500-ing the whole request. The UI
    surfaces the aggregate count and lets the user filter further.
    """
    items: List[CatalogItem] = []

    # 1) Harnesses
    # NOTE: The real API returns `harnesses` (verified against boto3).
    # Older doc drafts used `harnessSummaries`; accept either for safety.
    try:
        resp = _control().list_harnesses()
        for h in resp.get("harnesses") or resp.get("harnessSummaries") or []:
            status = str(h.get("status") or "")
            if status not in _HARNESS_READY_STATUSES:
                continue
            hid = h.get("harnessId") or ""
            model = h.get("model", {}) or {}
            model_id = (
                (model.get("bedrockModelConfig") or {}).get("modelId")
                or (model.get("openAiModelConfig") or {}).get("modelId")
                or (model.get("liteLlmModelConfig") or {}).get("modelId")
                or ""
            )
            items.append(
                CatalogItem(
                    id=hid,
                    name=h.get("harnessName") or hid,
                    type="harness",
                    status=str(h.get("status") or ""),
                    framework="Strands (managed)",
                    updated_at=_isoformat(h.get("updatedAt")),
                    detail_href=f"/harness/{hid}" if hid else "/harness",
                    model_id=str(model_id),
                    aws_region=settings.AWS_REGION,
                )
            )
    except ClientError as e:
        logger.warning(f"list_harnesses failed for catalog: {e}")

    # 2) AgentCore Runtimes (direct — anything created outside AVA lands here too)
    try:
        resp = _control().list_agent_runtimes()
        harness_ids_seen = {i.id for i in items if i.type == "harness"}
        for r in resp.get("agentRuntimes", []) or resp.get("agentRuntimeSummaries", []):
            status = str(r.get("status") or "")
            if status not in _RUNTIME_READY_STATUSES:
                continue
            rid = r.get("agentRuntimeId") or r.get("agentRuntimeArn") or ""
            # Skip runtimes that are the backing store for a harness we already listed.
            # Harness runtime IDs share the harness ID; harmless heuristic to dedupe.
            if any(hid and hid in rid for hid in harness_ids_seen):
                continue
            items.append(
                CatalogItem(
                    id=rid,
                    name=r.get("agentRuntimeName") or rid,
                    type="agentcore-runtime",
                    status=str(r.get("status") or ""),
                    framework="AgentCore Runtime",
                    updated_at=_isoformat(r.get("lastUpdatedAt") or r.get("createdAt")),
                    detail_href="/deployments",  # no per-runtime page yet
                    aws_region=settings.AWS_REGION,
                )
            )
    except ClientError as e:
        logger.warning(f"list_agent_runtimes failed for catalog: {e}")

    # 3) Memory instances
    try:
        resp = _control().list_memories()
        for m in resp.get("memories") or resp.get("memorySummaries") or []:
            status = str(m.get("status") or "")
            # Memory has ACTIVE / READY variants across SDK versions — treat both as ready.
            if status not in {"ACTIVE", "READY"}:
                continue
            mid = m.get("memoryId") or m.get("id") or ""
            items.append(
                CatalogItem(
                    id=mid,
                    name=m.get("name") or mid,
                    type="memory",
                    status=status,
                    framework="AgentCore Memory",
                    updated_at=_isoformat(m.get("updatedAt") or m.get("createdAt")),
                    detail_href="/memory",
                    aws_region=settings.AWS_REGION,
                )
            )
    except ClientError as e:
        logger.warning(f"list_memories failed for catalog: {e}")

    # 4-5) MCP Servers + A2A Servers — sourced from AWS Agent Registry.
    # Aug 2026 migration: both live as records under the AVA registry.
    # We map registry approval status → catalog registry_status so the UI
    # can show a "Registered" badge (green) vs. "Pending" (amber) vs.
    # "Rejected" (red) per row. Kinds that AREN'T published to the registry
    # today (harness / memory / runtime / deployment) keep the default
    # registry_status='not_applicable' and render neutral.
    _REG_STATUS_MAP = {
        "APPROVED":         "in_registry",
        "PENDING_APPROVAL": "pending",
        "DRAFT":            "pending",
        "REJECTED":         "rejected",
        "DEPRECATED":       "deprecated",
        "CREATING":         "pending",
        "UPDATING":         "pending",
        "CREATE_FAILED":    "rejected",
        "UPDATE_FAILED":    "rejected",
    }
    try:
        from services import agent_registry_client as reg
        # MCP records
        for r in reg.list_records(record_type="MCP"):
            data = ((r.get("descriptors") or {}).get("mcpServer") or {}).get("dataParsed") or {}
            reg_status = _REG_STATUS_MAP.get(r.get("status", ""), "not_in_registry")
            items.append(
                CatalogItem(
                    id=str(r.get("recordId") or ""),
                    name=str(r.get("displayName") or data.get("name") or r.get("name") or ""),
                    type="mcp-server",
                    # Catalog's own "status" column mirrors the registry status
                    # (active / pending / rejected / deprecated) so an operator
                    # sees the true lifecycle state, not a stale "active".
                    status=("active" if reg_status == "in_registry" else reg_status),
                    framework=str(data.get("source") or "custom"),
                    updated_at=str(r.get("updatedAt") or ""),
                    detail_href="/mcp",
                    aws_region=settings.AWS_REGION,
                    registry_status=reg_status,
                    registry_record_id=str(r.get("recordId") or ""),
                )
            )
        # AGENT records — recordType=AGENT is used by BOTH plain Agents and
        # A2A Servers; the tag `Kind` splits them (Kind=agent vs Kind=a2a).
        # Plain Agents (Kind=agent) — runtime-bound / MCP-callable — link to
        # /registry/agents. A2A Servers (Kind=a2a) — A2A-protocol peers with
        # AgentCards — link to /a2a. Descriptor shape also differs:
        # Agents use `custom`, A2A Servers use `a2aAgentCard`.
        for r in reg.list_records(record_type="AGENT", tag_filter={"Kind": "agent"}):
            data = ((r.get("descriptors") or {}).get("custom") or {}).get("dataParsed") or {}
            reg_status = _REG_STATUS_MAP.get(r.get("status", ""), "not_in_registry")
            items.append(
                CatalogItem(
                    id=str(r.get("recordId") or ""),
                    name=str(r.get("displayName") or data.get("name") or r.get("name") or ""),
                    type="agent",
                    status=("active" if reg_status == "in_registry" else reg_status),
                    framework=str(data.get("source") or "custom"),
                    updated_at=str(r.get("updatedAt") or ""),
                    detail_href="/registry/agents",
                    aws_region=settings.AWS_REGION,
                    registry_status=reg_status,
                    registry_record_id=str(r.get("recordId") or ""),
                )
            )
        for r in reg.list_records(record_type="AGENT", tag_filter={"Kind": "a2a"}):
            data = ((r.get("descriptors") or {}).get("a2aAgentCard") or {}).get("dataParsed") or {}
            reg_status = _REG_STATUS_MAP.get(r.get("status", ""), "not_in_registry")
            items.append(
                CatalogItem(
                    id=str(r.get("recordId") or ""),
                    name=str(r.get("displayName") or data.get("name") or r.get("name") or ""),
                    type="a2a-agent",
                    status=("active" if reg_status == "in_registry" else reg_status),
                    framework=str(data.get("source") or "custom"),
                    updated_at=str(r.get("updatedAt") or ""),
                    detail_href="/a2a",
                    aws_region=settings.AWS_REGION,
                    registry_status=reg_status,
                    registry_record_id=str(r.get("recordId") or ""),
                )
            )
    except Exception as e:
        logger.warning(f"Agent Registry scan failed for catalog: {e}")

    # 6) Deployments from DDB
    try:
        for d in _svc().list_deployments():
            status_val = str(d.status.value if hasattr(d.status, "value") else d.status)
            if status_val not in _DEPLOYMENT_READY_STATUSES:
                continue
            dtype = _classify_deployment_type(d.template_id or "")
            guardrail_present = False
            params = d.parameters or {}
            for k in ("guardrail_id", "guardrail_arn", "guardrail_identifier"):
                if params.get(k):
                    guardrail_present = True
                    break
            items.append(
                CatalogItem(
                    id=d.deployment_id,
                    name=d.deployment_name or d.deployment_id,
                    type=dtype,
                    status=str(d.status.value if hasattr(d.status, "value") else d.status),
                    framework=str(params.get("framework") or params.get("framework_id") or d.framework_id or ""),
                    guardrail_attached=guardrail_present,
                    updated_at=d.updated_at or d.created_at,
                    detail_href=_detail_href_for_deployment(d.template_id or "", d.deployment_id),
                    aws_region=d.aws_region or settings.AWS_REGION,
                )
            )
    except Exception as e:
        logger.warning(f"deployment scan failed for catalog: {e}")

    # Newest first
    items.sort(key=lambda i: i.updated_at or "", reverse=True)
    return items
