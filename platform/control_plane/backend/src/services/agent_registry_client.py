"""Shared helpers for the AWS Agent Registry (`agent-registry-control`).

MCP servers and A2A servers both persist as AWS Agent Registry records
rather than DDB rows now (Aug 2026 migration). Both routes converge on
the same handful of operations: create-record-in-DRAFT, submit-for-approval,
list, get, deprecate. This module keeps the boto3 plumbing + serialization
in one place so `mcp.py` and `a2a.py` don't repeat it.

Record layout used by AVA:
  * `recordType`     — 'MCP' or 'AGENT' (the API's enum names)
  * `name`           — URL-safe id, unique in the registry
  * `displayName`    — what the user typed
  * `description`    — free text
  * `descriptors.<kind>.data`
                     — JSON string carrying AVA-specific fields
                       (url, auth_hint, curated_id, etc.). The registry
                       stores it opaquely; only AVA reads it back.
  * `tags`           — {ManagedBy: AVA, Kind: mcp|a2a}

Approval flow (per Q2=b):
  1. `create_registry_record` → status DRAFT
  2. `submit_registry_record_for_approval` → status PENDING_APPROVAL
  3. Backend also writes an entry into the `approval_requests` table so
     the Operate → Approval Queue shows it (see mcp.py / a2a.py).
  4. Operator approves via the queue → `update_registry_record_status`
     with status=APPROVED.
"""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

import boto3
from botocore.exceptions import ClientError

from core.config import settings

logger = logging.getLogger(__name__)

# Cached clients — one per module load, lazy-initialized on first use.
_control = None


def control_client():
    global _control
    if _control is None:
        _control = boto3.client("agent-registry-control", region_name=settings.AWS_REGION)
    return _control


def _registry_id() -> str:
    """Return the AVA registry ID with defensive cleanup.

    In production we saw `AGENT_REGISTRY_ID` env arrive as
    ``"4h0JCw88RghhrH3v\\nNone"`` because Terraform's `terraform output
    -raw` printed a literal `None` line when a downstream module output
    was empty, and the shell concatenation captured both lines. The
    boto3 call then failed regex validation because the newline+`None`
    trailer isn't `[a-zA-Z0-9]{12,16}`.

    Rather than fix that at deploy time (which is fragile — the same
    class of bug can recur on any env var wired through Terraform + a
    shell), we defensively pick the first non-empty, non-``None`` line
    from whatever the env var carries. Under-normal inputs are pass-
    through; polluted inputs are cleaned.
    """
    raw = (settings.AGENT_REGISTRY_ID or "").strip()
    if not raw:
        return ""
    for line in raw.splitlines():
        line = line.strip()
        if line and line != "None":
            return line
    return ""


# ─── Naming ─────────────────────────────────────────────────────────────

# AWS Agent Registry record names accept a limited character set.  We
# sanitize the user's display name and append a short uuid so names are
# unique in the registry even when two users pick the same display name.
_NAME_ALLOWED = re.compile(r"[^A-Za-z0-9._-]")


def build_record_name(kind: str, display_name: str) -> str:
    """Return a URL-safe registry record name.

    Format: ``{kind}-{sanitized-display}-{uuid8}``. Kind is a short prefix
    ('mcp' / 'a2a') so operators can guess the type from the name at a
    glance in the AWS console.
    """
    slug = _NAME_ALLOWED.sub("-", (display_name or "").strip())
    slug = re.sub(r"-+", "-", slug).strip("-.")
    if not slug:
        slug = "unnamed"
    return f"{kind}-{slug[:40]}-{uuid.uuid4().hex[:8]}"


# ─── Record creation ────────────────────────────────────────────────────


def create_record(
    *,
    kind: str,  # 'mcp' or 'a2a'
    record_type: str,  # 'MCP' or 'AGENT'
    descriptor_key: str,  # 'mcpServer' or 'a2aAgentCard'
    display_name: str,
    description: str,
    data_payload: Dict[str, Any],
    data_schema_version: str = "1.0",
    tags: Optional[Dict[str, str]] = None,
    final_status: str = "PENDING_APPROVAL",  # or "APPROVED" for auto-approve path
) -> Dict[str, Any]:
    """Create a record and move it to `final_status`.

    `final_status` is either `PENDING_APPROVAL` (default — route through
    the queue) or `APPROVED` (policy said auto-approve, so skip the
    queue). The record is created in DRAFT either way — this function
    submits + optionally flips to APPROVED via UpdateRegistryRecordStatus.

    Returns the record shape after status flip — `{recordArn, recordId,
    name, status, ...}`.
    """
    if not _registry_id():
        raise RuntimeError(
            "AGENT_REGISTRY_ID env var is empty (or contained only whitespace / 'None'). "
            "Backend can't publish to the AVA registry until Terraform apply completes "
            "and the ECS task picks up the new env vars."
        )
    c = control_client()
    name = build_record_name(kind, display_name)
    merged_tags = {"ManagedBy": "AVA", "Kind": kind, **(tags or {})}

    # Build the descriptor block. `custom` accepts ONLY `data` (no
    # dataSchemaVersion / additionalData / source). Every other typed
    # descriptor (mcpServer, a2aAgentCard, agentSkillsDefinition) also
    # accepts `dataSchemaVersion`. Sending it on `custom` returns
    # ParamValidationError: "Unknown parameter in descriptors.custom:
    # 'dataSchemaVersion', must be one of: data".
    _descriptor: Dict[str, Any] = {"data": json.dumps(data_payload)}
    if descriptor_key != "custom":
        _descriptor["dataSchemaVersion"] = data_schema_version

    resp = c.create_registry_record(
        registryId=_registry_id(),
        recordType=record_type,
        name=name,
        displayName=(display_name or "").strip() or name,
        description=(description or "").strip(),
        descriptors={descriptor_key: _descriptor},
        recordVersion="1",
        tags=merged_tags,
    )
    record_id = _extract_record_id(resp.get("recordArn", ""))
    # AWS creates records in `CREATING` state; submit-for-approval requires
    # DRAFT. Poll a few times before submitting or we get
    # ConflictException: cannot be modified while in CREATING state.
    _wait_for_status(record_id, target={"DRAFT"}, timeout_s=15)
    # Move DRAFT → PENDING_APPROVAL (always — records must be submitted
    # to exit DRAFT). Then, if the caller wants auto-approve, follow
    # with a status flip to APPROVED via UpdateRegistryRecordStatus.
    try:
        c.submit_registry_record_for_approval(
            registryId=_registry_id(),
            recordId=record_id,
        )
    except ClientError as e:
        logger.warning(f"submit_registry_record_for_approval failed for {record_id}: {e}")

    if final_status == "APPROVED":
        # UpdateRegistryRecordStatus rejects DRAFT → APPROVED. The valid
        # path is DRAFT → PENDING_APPROVAL → APPROVED. Wait for the submit
        # above to land the record in PENDING_APPROVAL before flipping.
        _wait_for_status(record_id, target={"PENDING_APPROVAL"}, timeout_s=15)
        try:
            c.update_registry_record_status(
                registryId=_registry_id(),
                recordId=record_id,
                status="APPROVED",
                statusReason="Auto-approved by AVA policy (no active require_approval policy matched)",
            )
        except ClientError as e:
            logger.warning(f"auto-approve status flip failed for {record_id}: {e}")

    return get_record(record_id)


def _wait_for_status(record_id: str, *, target: set, timeout_s: int = 15) -> Optional[str]:
    """Poll GetRegistryRecord until the record's status is in `target`
    or the timeout elapses. Returns the last observed status (or None).

    Used to bridge async status transitions in AWS Agent Registry:
      * CREATING → DRAFT after CreateRegistryRecord
      * DRAFT → PENDING_APPROVAL after SubmitRegistryRecordForApproval
    Both transitions are non-instant; downstream calls that assume the
    new state fail with ConflictException / ValidationException.
    """
    deadline = time.monotonic() + timeout_s
    last_status: Optional[str] = None
    while time.monotonic() < deadline:
        try:
            rec = get_record(record_id)
            last_status = rec.get("status")
            if last_status in target:
                return last_status
        except ClientError:
            pass
        time.sleep(0.5)
    logger.warning(
        f"_wait_for_status: record {record_id} did not reach {target} within {timeout_s}s "
        f"(last observed: {last_status})"
    )
    return last_status


def submit_for_approval(record_id: str) -> Dict[str, Any]:
    c = control_client()
    return c.submit_registry_record_for_approval(
        registryId=_registry_id(),
        recordId=record_id,
    )


def set_status(record_id: str, status: str, reason: str = "") -> Dict[str, Any]:
    """Move a record to `status` (APPROVED / REJECTED / DEPRECATED).

    AWS enforces valid transitions:
      DRAFT → {PENDING_APPROVAL, DEPRECATED, DRAFT, UPDATING}
      PENDING_APPROVAL → {APPROVED, REJECTED, DEPRECATED, PENDING_APPROVAL, UPDATING}
      APPROVED → {DEPRECATED, UPDATING}
    In particular, DRAFT → APPROVED is NOT valid — attempting it returns
    ValidationException. To keep the queue's approve action working on
    records that got stuck in DRAFT (e.g. because submit-for-approval
    raced with CREATING), submit them for approval first and wait for
    PENDING_APPROVAL to land, then flip to the requested status.
    """
    c = control_client()
    current = None
    try:
        current = get_record(record_id).get("status")
    except ClientError:
        current = None

    if current == "DRAFT" and status in ("APPROVED", "REJECTED"):
        try:
            c.submit_registry_record_for_approval(
                registryId=_registry_id(),
                recordId=record_id,
            )
        except ClientError as e:
            logger.warning(
                f"set_status: submit-for-approval to unblock DRAFT→{status} failed for {record_id}: {e}"
            )
        _wait_for_status(record_id, target={"PENDING_APPROVAL"}, timeout_s=15)

    return c.update_registry_record_status(
        registryId=_registry_id(),
        recordId=record_id,
        status=status,
        statusReason=reason or f"Set to {status} by AVA",
    )


def deprecate(record_id: str, reason: str = "Deprecated via AVA") -> Dict[str, Any]:
    return set_status(record_id, "DEPRECATED", reason)


# ─── Record read ────────────────────────────────────────────────────────


def get_record(record_id: str) -> Dict[str, Any]:
    """Return the record with its `data` payload already deserialized.

    The AWS shape carries `descriptors.<kind>.data` as a JSON string; we
    parse it back into a dict for consumers. Timestamps become ISO strings
    so the FastAPI JSON serializer can encode them.
    """
    c = control_client()
    resp = c.get_registry_record(
        registryId=_registry_id(),
        recordId=record_id,
    )
    return _hydrate(resp)


def list_records(
    record_type: Optional[str] = None,
    max_results: int = 100,
    tag_filter: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """List every record of a given type (paginated).

    If `tag_filter` is supplied, records that don't match ALL of those
    tag key/value pairs are dropped client-side. Used to distinguish
    A2A Servers (tag `Kind=a2a`) from Agents (tag `Kind=agent`) — both
    live as recordType=AGENT in AWS Agent Registry but AVA surfaces them
    as separate views because the semantics differ (A2A = protocol peers
    with AgentCards; Agents = runtime-bound / MCP-callable / auto-
    registered peers).

    We don't push tag filtering to the API filter block because the API
    doesn't support arbitrary tag filters in v1 preview — client-side
    filter is cheap at expected volume (dozens per environment).
    """
    c = control_client()
    kwargs: Dict[str, Any] = {
        "registryId": _registry_id(),
        "maxResults": max_results,
    }
    if record_type:
        kwargs["filters"] = [{"name": "recordType", "values": [record_type]}]
    out: List[Dict[str, Any]] = []
    token: Optional[str] = None
    for _ in range(50):  # runaway guard — 50 pages × 100 = 5000 records
        if token:
            kwargs["nextToken"] = token
        resp = c.list_registry_records(**kwargs)
        for rec in resp.get("registryRecords") or []:
            hydrated = _hydrate(rec)
            if tag_filter:
                # Tags are NOT returned by ListRegistryRecords or
                # GetRegistryRecord — they only come from the separate
                # ListTagsForResource call keyed on the record ARN.
                tags = hydrated.get("tags") or {}
                if not tags and hydrated.get("recordArn"):
                    try:
                        tag_resp = c.list_tags_for_resource(resourceArn=hydrated["recordArn"])
                        tags = tag_resp.get("tags") or {}
                    except ClientError:
                        tags = {}
                if not all(tags.get(k) == v for k, v in tag_filter.items()):
                    continue
                # Cache the resolved tags on the record so downstream
                # callers (UI mappers) don't need to re-fetch.
                hydrated["tags"] = tags
            out.append(hydrated)
        token = resp.get("nextToken")
        if not token:
            break
    return out


def delete_record(record_id: str) -> None:
    """Hard delete. Only ADMIN should ever hit this route — the normal
    lifecycle path is DEPRECATED (set_status) so the record stays around
    for audit."""
    c = control_client()
    c.delete_registry_record(
        registryId=_registry_id(),
        recordId=record_id,
    )


# ─── Internal helpers ───────────────────────────────────────────────────


def _extract_record_id(record_arn: str) -> str:
    """Registry record ARN shape:
        arn:aws:agent-registry:<region>:<acct>:registry/<rid>/record/<recid>
    Returns the last segment.
    """
    if not record_arn:
        return ""
    return record_arn.rsplit("/", 1)[-1]


def _hydrate(rec: Dict[str, Any]) -> Dict[str, Any]:
    """Parse `descriptors.<kind>.data` JSON string back into a dict,
    stringify timestamps, and return a plain dict the caller can pass to
    FastAPI response serialization.
    """
    out = dict(rec)
    # Serialize timestamps
    for k in ("createdAt", "updatedAt"):
        v = out.get(k)
        if v is not None and hasattr(v, "isoformat"):
            out[k] = v.isoformat()
    # Deserialize the `data` string on each descriptor kind that carries one
    desc = out.get("descriptors") or {}
    for key in ("mcpServer", "a2aAgentCard", "agentSkillsDefinition", "custom"):
        inner = desc.get(key)
        if isinstance(inner, dict) and isinstance(inner.get("data"), str):
            try:
                inner["dataParsed"] = json.loads(inner["data"])
            except json.JSONDecodeError:
                inner["dataParsed"] = None
    # Ensure the top-level 'recordId' is populated even if the API only
    # returned recordArn (some paginated shapes elide it).
    if not out.get("recordId") and out.get("recordArn"):
        out["recordId"] = _extract_record_id(out["recordArn"])
    return out


# ─── Convenience wrappers for the two shapes AVA uses today ────────────
# Each wrapper takes the AVA-visible fields, packs them into the `data`
# JSON blob, and delegates to `create_record`. Keeps mcp.py / a2a.py free
# of serialization details.


def publish_mcp_server(
    *,
    display_name: str,
    url: str,
    auth_hint: str = "none",
    description: str = "",
    curated_id: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
    final_status: str = "PENDING_APPROVAL",
) -> Dict[str, Any]:
    """Publish an MCP server as an AWS Agent Registry record.

    The registry validates `descriptors.mcpServer.data` against the
    official MCP server.json schema. Minimum shape per AWS docs:
        {name, description, version}
    `name` should be a namespace-slash-name (e.g. "my-org/weather"). AVA
    stores its extra fields (url, auth_hint, curated_id, ...) inside
    `_meta.ava` so validation passes while the AVA UI can still reconstruct
    them on read. `_meta` is allowed by the schema (draft-07 permits
    unknown properties by default).
    """
    # Sanitize the display name into an MCP-conformant namespaced name.
    # Schema allows `[a-zA-Z0-9-_/.]` (informal); we keep it safe.
    import re as _re
    slug = _re.sub(r'[^A-Za-z0-9._-]', '-', display_name).strip('-') or "server"
    mcp_name = f"ava/{slug}"[:100]
    ava_extras: Dict[str, Any] = {"url": url, "auth_hint": auth_hint}
    if curated_id: ava_extras["curated_id"] = curated_id
    if extra:      ava_extras.update(extra)
    data = {
        "name":        mcp_name,
        "description": (description or f"AVA-registered MCP server: {display_name}")[:1000],
        "version":     "1.0.0",
        "_meta":       {"ava": ava_extras},
    }
    return create_record(
        kind="mcp",
        record_type="MCP",
        descriptor_key="mcpServer",
        display_name=display_name,
        description=description,
        data_payload=data,
        data_schema_version="2025-12-11",  # latest per AWS docs
        final_status=final_status,
    )


def publish_deployed_app_as_agent(
    *,
    display_name: str,
    runtime: str,
    runtime_ref: str,
    description: str = "",
    capabilities: Optional[List[str]] = None,
    deployment_id: str = "",
    template_id: str = "",
    final_status: str = "APPROVED",
) -> Dict[str, Any]:
    """Auto-publish a successfully-deployed Foundry / reference app as
    an AGENT record in the AVA registry.

    Called from the deploy path on success — the app becomes discoverable
    in Registry → Agents without a separate registration step. Tags carry
    the deployment_id + template_id so the record can be cross-linked
    with the deployment record for audit.

    `final_status` defaults to APPROVED because the policy engine already
    OK'd the deploy at request-creation time. If your org later flips
    application.deploy to require_approval, this call sites still tags
    the record; the approval flow just goes through the queue instead.
    """
    data = {
        "name": display_name,
        "runtime": runtime,
        "runtime_ref": runtime_ref,
        "capabilities": capabilities or [],
        "auth_hint": "none",
        "category": "foundry-deploy",
        "source": "auto-published",
        "deployment_id": deployment_id,
        "template_id": template_id,
        "description": description,
    }
    return create_record(
        kind="agent",
        record_type="AGENT",
        descriptor_key="custom",
        display_name=display_name,
        description=description,
        data_payload=data,
        tags={
            "Kind": "agent",
            "Source": "foundry-deploy",
            "DeploymentId": deployment_id or "unknown",
        },
        final_status=final_status,
    )


def publish_a2a_server(
    *,
    display_name: str,
    agent_card_url: str,
    agent_card: Dict[str, Any],
    description: str = "",
    curated_id: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
    final_status: str = "PENDING_APPROVAL",
) -> Dict[str, Any]:
    """Publish an A2A server as an AWS Agent Registry AGENT record with
    an a2aAgentCard descriptor.

    The registry validates `descriptors.a2aAgentCard.data` against the
    A2A AgentCard schema (v0.3). Required top-level fields per AWS docs:
        {name, description, version, protocolVersion, url, capabilities,
         defaultInputModes, defaultOutputModes, skills[]}
    When the caller supplies a live-fetched AgentCard, we start from it
    and fill in any missing required fields; that way an unreachable-
    at-register-time endpoint can still create a valid record.
    """
    # Start from the fetched card if valid, then top up any missing
    # required fields. Frontend fetches the card at wizard time; a
    # non-live endpoint yields {} — we still produce a valid stub.
    card: Dict[str, Any] = dict(agent_card) if isinstance(agent_card, dict) else {}
    card.setdefault("name", display_name)
    card.setdefault("description", description or f"AVA-registered A2A server: {display_name}")
    card.setdefault("version", "1.0.0")
    card.setdefault("protocolVersion", "0.3.0")
    card.setdefault("url", agent_card_url)
    card.setdefault("capabilities", {})
    card.setdefault("defaultInputModes", ["text/plain"])
    card.setdefault("defaultOutputModes", ["text/plain"])
    card.setdefault(
        "skills",
        [{"id": "default-skill", "name": "Default", "description": "Default skill", "tags": ["general"]}],
    )
    # AVA extras go inside _meta so the AgentCard passes schema validation.
    meta = dict(card.get("_meta") or {})
    ava = dict(meta.get("ava") or {})
    ava["agent_card_url"] = agent_card_url
    if curated_id: ava["curated_id"] = curated_id
    if extra:      ava.update(extra)
    meta["ava"] = ava
    card["_meta"] = meta
    return create_record(
        kind="a2a",
        record_type="AGENT",
        descriptor_key="a2aAgentCard",
        display_name=display_name,
        description=description,
        data_payload=card,
        data_schema_version="0.3",  # only version AWS supports today
        final_status=final_status,
    )


# ─── Approval-Queue integration hook ───────────────────────────────────
# Every publish also creates a row in the `approval_requests` DDB table so
# operators can approve/deny through the existing Operate → Approval Queue
# UI. The queue's approve handler in turn calls `set_status(APPROVED)` on
# the registry record; deny calls `set_status(REJECTED)`.


def enqueue_approval(
    *,
    record: Dict[str, Any],
    kind: str,
    requested_by: str,
    justification: str = "",
    verdict: Optional[Any] = None,  # PolicyVerdict (avoid circular import)
    initial_status: str = "pending",  # 'pending' | 'approved' — for audit-only rows
    action: str = "publish",  # 'publish' | 'deploy' | 'delete' | ...
) -> Optional[str]:
    """Best-effort — write an Approval Queue row for the just-created
    record. If a `verdict` is supplied (from approval_policy_engine.evaluate)
    it carries the required_role / quorum / sla_hours from the matched
    policy plus a full snapshot for audit; otherwise the row falls back to
    'OPERATOR / quorum=1 / sla=72h' defaults.
    """
    if not settings.APPROVAL_REQUESTS_TABLE_NAME:
        logger.warning("APPROVAL_REQUESTS_TABLE_NAME not set; skipping queue row for record")
        return None

    from datetime import datetime, timedelta, timezone

    # Pull policy details off the verdict if present. Duck-typed to avoid
    # importing the dataclass here (which would create a services→services
    # dependency cycle).
    policy_id     = getattr(verdict, "policy_id", "") or ""
    policy_name   = getattr(verdict, "policy_name", "") or f"AVA Registry: {kind.upper()} publish"
    required_role = getattr(verdict, "required_role", "OPERATOR") or "OPERATOR"
    quorum        = int(getattr(verdict, "quorum", 1) or 1)
    sla_hours     = int(getattr(verdict, "sla_hours", 72) or 72)
    snapshot      = dict(getattr(verdict, "snapshot", {}) or {})

    request_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    # For `initial_status='approved'` (audit-only rows), record a
    # synthetic decision so the queue row's `decisions[]` isn't empty
    # and the "who approved this" column in the UI has content.
    decisions: List[Dict[str, Any]] = []
    if initial_status == "approved":
        decisions.append({
            "by": requested_by or "system",
            "outcome": "approved",
            "comment": "Auto-approved by policy (audit-only row)",
            "at": now.isoformat(),
        })
    row = {
        "request_id": request_id,
        "resource_kind": f"registry_record:{kind}",  # e.g. registry_record:mcp
        "resource_id": record.get("recordId") or "",
        "resource_label": record.get("displayName") or record.get("name") or "",
        "action": action,
        "justification": justification,
        "policy_id": policy_id,
        "policy_name": policy_name,
        # Snapshot of the matched policy — persisted so audit sees the
        # exact rule that fired, even if the policy is later edited.
        "verdict_snapshot": snapshot,
        "required_role": required_role,
        "quorum": quorum,
        "sla_hours": sla_hours,
        "requested_by": requested_by or "unknown",
        "status": initial_status,
        "decisions": decisions,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=sla_hours)).isoformat(),
        # Extra field so the queue's approve handler knows to route through
        # the registry instead of just flipping the queue row's status.
        "registry_record_id": record.get("recordId") or "",
        "registry_record_arn": record.get("recordArn") or "",
    }
    try:
        ddb = boto3.resource("dynamodb", region_name=settings.AWS_REGION).Table(
            settings.APPROVAL_REQUESTS_TABLE_NAME
        )
        ddb.put_item(Item=row)
        return request_id
    except ClientError as e:
        logger.warning(f"Failed to write approval-queue row for record {row['resource_id']}: {e}")
        return None
