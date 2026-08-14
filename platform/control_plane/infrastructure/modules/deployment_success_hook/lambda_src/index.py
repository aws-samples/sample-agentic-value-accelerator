"""Auto-publish deployed applications as AGENT records in the AVA registry.

Triggered by an EventBridge rule that watches the deployment Step Function
for SUCCEEDED executions. The event payload carries the state machine's
input (which includes `deployment_id`); we look up the deployment in DDB,
extract the runtime reference from `outputs`, and create an AGENT record
in AWS Agent Registry (`Kind=agent` + `Source=foundry-deploy`).

Additive to the existing pipeline — the Step Function is unchanged.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from typing import Any, Dict, Optional

import boto3
from botocore.exceptions import ClientError

log = logging.getLogger()
log.setLevel(logging.INFO)

REGISTRY_ID = os.environ["AGENT_REGISTRY_ID"]
DEPLOYMENTS_TABLE = os.environ["DEPLOYMENTS_TABLE_NAME"]
# Optional — when set, the Lambda writes an audit-only "approved" queue
# row after each successful publish so the Approval Queue mirrors every
# auto-approved Foundry deploy. If the env var is unset (older module
# version), the queue write is skipped and only the registry record is
# created.
APPROVAL_REQUESTS_TABLE = os.environ.get("APPROVAL_REQUESTS_TABLE_NAME", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

_ddb = boto3.resource("dynamodb", region_name=AWS_REGION).Table(DEPLOYMENTS_TABLE)
_reg = boto3.client("agent-registry-control", region_name=AWS_REGION)
_queue = (
    boto3.resource("dynamodb", region_name=AWS_REGION).Table(APPROVAL_REQUESTS_TABLE)
    if APPROVAL_REQUESTS_TABLE
    else None
)


_NAME_SAFE = re.compile(r"[^a-zA-Z0-9-_]+")


def _build_record_name(display_name: str) -> str:
    slug = _NAME_SAFE.sub("-", (display_name or "agent").strip()).strip("-")
    suffix = uuid.uuid4().hex[:8]
    return f"agent-{slug[:60]}-{suffix}"


def _get_deployment(deployment_id: str) -> Optional[Dict[str, Any]]:
    try:
        resp = _ddb.get_item(Key={"pk": f"DEPLOY#{deployment_id}", "sk": "META"})
    except ClientError as e:
        log.warning("get_deployment failed for %s: %s", deployment_id, e)
        return None
    return resp.get("Item")


def _already_published(deployment_id: str) -> bool:
    """Check whether a prior invocation already created an AGENT record for
    this deployment. Uses ListRegistryRecords + ListTagsForResource because
    ListRegistryRecords doesn't return tags. Best-effort — a false negative
    just creates a second record, which is annoying but not corrupting.
    """
    token: Optional[str] = None
    for _ in range(50):
        kwargs: Dict[str, Any] = {
            "registryId": REGISTRY_ID,
            "maxResults": 100,
            "filters": [{"name": "recordType", "values": ["AGENT"]}],
        }
        if token:
            kwargs["nextToken"] = token
        try:
            resp = _reg.list_registry_records(**kwargs)
        except ClientError as e:
            log.warning("list_registry_records probe failed: %s", e)
            return False
        for rec in resp.get("registryRecords") or []:
            arn = rec.get("recordArn")
            if not arn:
                continue
            try:
                tag_resp = _reg.list_tags_for_resource(resourceArn=arn)
            except ClientError:
                continue
            tags = tag_resp.get("tags") or {}
            if tags.get("DeploymentId") == deployment_id:
                log.info("deployment %s already published as record %s", deployment_id, rec.get("recordId"))
                return True
        token = resp.get("nextToken")
        if not token:
            break
    return False


def _wait_for_status(record_id: str, target: set, timeout_s: int = 15) -> Optional[str]:
    deadline = time.monotonic() + timeout_s
    last: Optional[str] = None
    while time.monotonic() < deadline:
        try:
            rec = _reg.get_registry_record(registryId=REGISTRY_ID, recordId=record_id)
            last = rec.get("status")
            if last in target:
                return last
        except ClientError:
            pass
        time.sleep(0.5)
    log.warning("record %s did not reach %s within %ss (last=%s)", record_id, target, timeout_s, last)
    return last


def _publish(deployment: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Create an AGENT record for a DEPLOYED deployment.

    Mirrors backend `publish_deployed_app_as_agent`: runtime_ref preference
    is ui_url → agent_runtime_arn → agentcore_runtime_id → deployment_id.

    Returns a summary of the created record so the caller can chain a queue
    write. Returns None if the create succeeded but no recordId came back.
    """
    deployment_id = deployment["deployment_id"]
    template_id = deployment.get("template_id", "")
    display_name = (
        deployment.get("deployment_name")
        or deployment.get("template_id")
        or f"deployment-{deployment_id[:8]}"
    )
    outputs = deployment.get("outputs") or {}

    frontend_url = (
        outputs.get("ui_url")
        or outputs.get("app_url")
        or outputs.get("AmplifyUrl")
        or outputs.get("dashboard_url")
        or ""
    )
    runtime_arn = outputs.get("agent_runtime_arn") or outputs.get("agentcore_runtime_arn") or ""
    runtime_id = outputs.get("agentcore_runtime_id") or ""
    if frontend_url:
        runtime, runtime_ref = "web-app", frontend_url
    elif runtime_arn:
        runtime, runtime_ref = "bedrock-agentcore-runtime", runtime_arn
    elif runtime_id:
        runtime, runtime_ref = "bedrock-agentcore-runtime", runtime_id
    else:
        runtime, runtime_ref = "deployment", deployment_id

    description = (
        f"Auto-published on successful deploy of {template_id} "
        f"(deployment_id={deployment_id})."
    )
    data = {
        "name": display_name,
        "runtime": runtime,
        "runtime_ref": runtime_ref,
        "capabilities": [],
        "auth_hint": "none",
        "category": "foundry-deploy",
        "source": "auto-published",
        "deployment_id": deployment_id,
        "template_id": template_id,
        "description": description,
    }
    tags = {
        "ManagedBy": "AVA",
        "Kind": "agent",
        "Source": "foundry-deploy",
        "DeploymentId": deployment_id or "unknown",
    }

    record_name = _build_record_name(display_name)
    try:
        create_resp = _reg.create_registry_record(
            registryId=REGISTRY_ID,
            recordType="AGENT",
            name=record_name,
            displayName=display_name,
            description=description,
            descriptors={"custom": {"data": json.dumps(data)}},
            recordVersion="1",
            tags=tags,
        )
    except ClientError as e:
        log.error("create_registry_record failed for deployment %s: %s", deployment_id, e)
        raise

    record_id = (create_resp.get("recordArn") or "").rsplit("/", 1)[-1]
    if not record_id:
        log.error("create_registry_record returned no recordArn for deployment %s", deployment_id)
        return

    # CREATING → DRAFT → PENDING_APPROVAL → APPROVED. Each transition is
    # non-instant; downstream calls that assume the next state fail with
    # ConflictException / ValidationException.
    _wait_for_status(record_id, target={"DRAFT"}, timeout_s=15)
    try:
        _reg.submit_registry_record_for_approval(registryId=REGISTRY_ID, recordId=record_id)
    except ClientError as e:
        log.warning("submit_registry_record_for_approval failed for %s: %s", record_id, e)

    _wait_for_status(record_id, target={"PENDING_APPROVAL"}, timeout_s=15)
    try:
        _reg.update_registry_record_status(
            registryId=REGISTRY_ID,
            recordId=record_id,
            status="APPROVED",
            statusReason="Auto-approved by AVA policy (Foundry deploy hook)",
        )
    except ClientError as e:
        log.warning("update_registry_record_status→APPROVED failed for %s: %s", record_id, e)

    log.info(
        "auto-published deployment %s as agent %s (runtime=%s, ref=%.60s)",
        deployment_id,
        record_id,
        runtime,
        runtime_ref,
    )
    return {
        "recordId": record_id,
        "recordArn": create_resp.get("recordArn") or "",
        "displayName": display_name,
        "runtime": runtime,
        "runtime_ref": runtime_ref,
        "deployment_id": deployment_id,
        "template_id": template_id,
    }


def _write_queue_row(record: Dict[str, Any], deployment: Dict[str, Any]) -> None:
    """Write an audit-only 'approved' row to the Approval Queue so the queue
    mirrors every auto-approved Foundry deploy. Matches the row shape the
    backend `agent_registry_client.enqueue_approval` writes for manual
    publish flows (`resource_kind='registry_record:agent'`).

    Best-effort — a queue-write failure is logged but never bubbles up
    (the registry record already exists; queue divergence is annoying but
    not corrupting).
    """
    if _queue is None:
        log.info("APPROVAL_REQUESTS_TABLE_NAME not configured; skipping queue row")
        return
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    requester = deployment.get("requested_by") or deployment.get("created_by") or "system"
    sla_hours = 72
    decisions = [
        {
            "by": "system",
            "outcome": "approved",
            "comment": "Auto-approved by AVA policy (Foundry deploy hook)",
            "at": now.isoformat(),
        }
    ]
    row = {
        "request_id": str(uuid.uuid4()),
        "resource_kind": "registry_record:agent",
        "resource_id": record.get("recordId") or "",
        "resource_label": record.get("displayName") or record.get("recordId") or "",
        "action": "publish",
        "justification": (
            f"Auto-published from Foundry deploy (template={record.get('template_id', '')}, "
            f"deployment_id={record.get('deployment_id', '')})"
        ),
        "policy_id": "",
        "policy_name": "AVA Default: Application deploy auto-approves",
        "verdict_snapshot": {},
        "required_role": "OPERATOR",
        "quorum": 1,
        "sla_hours": sla_hours,
        "requested_by": requester,
        "status": "approved",
        "decisions": decisions,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=sla_hours)).isoformat(),
        "registry_record_id": record.get("recordId") or "",
        "registry_record_arn": record.get("recordArn") or "",
    }
    try:
        _queue.put_item(Item=row)
        log.info(
            "wrote approval-queue row for deployment %s (record %s)",
            record.get("deployment_id"),
            record.get("recordId"),
        )
    except ClientError as e:
        log.warning("failed to write approval-queue row for record %s: %s", record.get("recordId"), e)


def _extract_deployment_id(event: Dict[str, Any]) -> Optional[str]:
    """Pull deployment_id out of the SFN state-change event.

    EventBridge state-change events for Step Functions carry:
      detail.input  — JSON string of the SM's input
      detail.output — JSON string of the SM's output (on SUCCEEDED)
    We prefer output.deployment_id, falling back to input.deployment_id.
    """
    detail = event.get("detail") or {}
    for key in ("output", "input"):
        blob = detail.get(key)
        if not blob:
            continue
        try:
            parsed = json.loads(blob) if isinstance(blob, str) else blob
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and parsed.get("deployment_id"):
            return parsed["deployment_id"]
    return None


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    log.info("event: %s", json.dumps(event)[:2000])
    deployment_id = _extract_deployment_id(event)
    if not deployment_id:
        log.warning("no deployment_id in event; skipping")
        return {"ok": False, "reason": "no deployment_id"}

    deployment = _get_deployment(deployment_id)
    if not deployment:
        log.warning("deployment %s not found in DDB", deployment_id)
        return {"ok": False, "reason": "deployment not found"}

    if (deployment.get("status") or "").lower() != "deployed":
        log.info(
            "deployment %s status=%s (not 'deployed'); skipping auto-publish",
            deployment_id,
            deployment.get("status"),
        )
        return {"ok": False, "reason": "status not deployed"}

    if _already_published(deployment_id):
        return {"ok": True, "reason": "already published"}

    try:
        record_summary = _publish(deployment)
    except Exception as e:  # noqa: BLE001
        log.exception("publish failed for deployment %s: %s", deployment_id, e)
        return {"ok": False, "error": str(e)}

    # Best-effort audit-only queue row so the Approval Queue mirrors this
    # auto-approved publish. Never bubble a failure — the registry record
    # already exists and is the source of truth.
    if record_summary:
        try:
            _write_queue_row(record_summary, deployment)
        except Exception as e:  # noqa: BLE001
            log.warning("_write_queue_row raised for deployment %s: %s", deployment_id, e)

    return {"ok": True}
