"""Approval Queue — live requests waiting for a decision.

A request is created (by the caller who tried a gated action, or manually
via the demo POST here) and moves through:
    pending → approved | denied | expired | cancelled

Each request carries the policy that matched, the requester, the target
resource, and — when quorum > 1 — the running vote count. v1 does not
enforce quorum across multiple approvers; approving once flips the state.
Cross-quorum voting is a v2 follow-up.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Depends as RBACDepends, Header
from pydantic import BaseModel, Field

from core.config import settings
from core.rbac import Role, require_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/approval-requests", tags=["approval-requests"])

_ddb = None


def _table():
    global _ddb
    if _ddb is None:
        _ddb = boto3.resource("dynamodb", region_name=settings.AWS_REGION).Table(
            settings.APPROVAL_REQUESTS_TABLE_NAME
        )
    return _ddb


STATUSES = ("pending", "approved", "denied", "expired", "cancelled")


class RequestCreate(BaseModel):
    resource_kind: str = Field(..., description="application | harness | memory | mcp | a2a | identity")
    resource_id: str
    resource_label: Optional[str] = None
    action: str = Field(..., description="deploy | delete | invoke | update | register")
    justification: Optional[str] = None
    policy_id: Optional[str] = Field(default=None, description="If known — the policy that gated this")
    policy_name: Optional[str] = None
    required_role: str = Field(default="ADMIN")
    quorum: int = Field(default=1, ge=1, le=5)
    sla_hours: int = Field(default=24, ge=1, le=168)


class RequestDecision(BaseModel):
    comment: Optional[str] = None


class BatchDecisionRequest(BaseModel):
    """Approve or deny multiple queue rows in one operator action.

    UI hands us a list of request_ids selected via checkbox column. We
    process them serially — each row runs through the same
    `_record_decision` path a single-row approve would (registry hook +
    identity hook + queue-row update). Any per-row failure is captured
    per row without aborting the batch.
    """
    request_ids: List[str] = Field(..., min_length=1, max_length=200, description="Queue row IDs to decide on. Max 200 per batch to keep the API call bounded.")
    comment: Optional[str] = Field(default=None, description="Applied to every row in the batch. Individual rows can't have distinct comments in a batch call — that's a per-row Approve flow.")


def _sla_expiry(created_at: datetime, sla_hours: int) -> str:
    return (created_at + timedelta(hours=sla_hours)).isoformat()


@router.get("/list")
async def list_requests(
    status: Optional[str] = None,
    _=RBACDepends(require_role(Role.VIEWER)),
):
    """Return every request, or filter by status.

    Kept as a full scan for v1 — expected volume is low (dozens per day
    at most). Add a GSI-backed status-first query when the queue grows
    beyond that.
    """
    if not settings.APPROVAL_REQUESTS_TABLE_NAME:
        return {"requests": [], "warning": "APPROVAL_REQUESTS_TABLE_NAME not configured"}
    if status and status not in STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {list(STATUSES)}")
    try:
        resp = _table().scan()
        rows = resp.get("Items", []) or []
        if status:
            rows = [r for r in rows if r.get("status") == status]
        # Newest first — DDB scans are unordered.
        rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
        return {"requests": rows}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{request_id}")
async def get_request(request_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    try:
        resp = _table().get_item(Key={"request_id": request_id})
        item = resp.get("Item")
        if not item:
            raise HTTPException(status_code=404, detail=f"Approval request {request_id} not found")
        return item
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", status_code=201)
async def create_request(
    req: RequestCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=RBACDepends(require_role(Role.OPERATOR)),
):
    """Open a new pending request.

    Anyone with OPERATOR+ can open a request. The actual gated action
    handler (deploy, delete) would call this from its own path — for now
    v1 exposes the endpoint so the demo flow (a UI "Request approval to
    delete X" button) can create rows without a backend integration.
    """
    if not settings.APPROVAL_REQUESTS_TABLE_NAME:
        raise HTTPException(status_code=503, detail="APPROVAL_REQUESTS_TABLE_NAME not configured")
    now = datetime.now(timezone.utc)
    item: Dict[str, Any] = {
        "request_id": str(uuid.uuid4()),
        "resource_kind": req.resource_kind,
        "resource_id": req.resource_id,
        "resource_label": (req.resource_label or req.resource_id).strip(),
        "action": req.action,
        "justification": (req.justification or "").strip(),
        "policy_id": req.policy_id or "",
        "policy_name": (req.policy_name or "").strip(),
        "required_role": req.required_role,
        "quorum": req.quorum,
        "sla_hours": req.sla_hours,
        "requested_by": x_user_email or "unknown",
        "status": "pending",
        "decisions": [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "expires_at": _sla_expiry(now, req.sla_hours),
    }
    try:
        _table().put_item(Item=item)
        return item
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


def _record_decision(
    request_id: str,
    outcome: str,
    approver: str,
    comment: str,
) -> Dict[str, Any]:
    """Mutate a pending request to approved/denied/cancelled.

    v1 flips status on a single vote — quorum is stored on the row but
    not yet enforced. When a second approver would push it over quorum,
    we'll switch this to append to `decisions` and only flip on quorum met.
    """
    if outcome not in ("approved", "denied", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Invalid outcome '{outcome}'")
    try:
        cur = _table().get_item(Key={"request_id": request_id}).get("Item")
        if not cur:
            raise HTTPException(status_code=404, detail=f"Approval request {request_id} not found")
        if cur.get("status") != "pending":
            raise HTTPException(
                status_code=409,
                detail=f"Request is already {cur.get('status')} — cannot record a new decision",
            )
        now = datetime.now(timezone.utc).isoformat()
        decision = {"by": approver, "outcome": outcome, "comment": comment, "at": now}
        prior = cur.get("decisions") or []
        new_decisions = list(prior) + [decision]

        # Registry-record hook — when a queue row was created by the MCP or
        # A2A publish flow (resource_kind='registry_record:mcp|a2a'), the
        # approve/deny decision must also flip the AWS Agent Registry
        # record's status. Otherwise the record stays PENDING_APPROVAL
        # in AWS while the queue row says approved/denied — divergent.
        resource_kind = (cur.get("resource_kind") or "").strip()
        target_id = (cur.get("registry_record_id") or cur.get("resource_id") or "").strip()
        if resource_kind.startswith("registry_record:") and target_id:
            sub_kind = resource_kind.split(":", 1)[1] if ":" in resource_kind else ""
            # Identity providers live in DDB, not the AWS registry — the
            # queue row uses `resource_kind='registry_record:identity'`
            # for uniformity but flipping status means an UpdateItem, not
            # a UpdateRegistryRecordStatus call.
            if sub_kind == "identity":
                try:
                    import boto3
                    from core.config import settings as _s
                    ddb_status = {"approved": "active", "denied": "rejected", "cancelled": "cancelled"}[outcome]
                    boto3.resource("dynamodb", region_name=_s.AWS_REGION).Table(
                        _s.IDENTITY_PROVIDERS_TABLE_NAME
                    ).update_item(
                        Key={"provider_id": target_id},
                        UpdateExpression="SET #st = :st, #u = :u",
                        ExpressionAttributeNames={"#st": "status", "#u": "updated_at"},
                        ExpressionAttributeValues={
                            ":st": ddb_status,
                            ":u": datetime.now(timezone.utc).isoformat(),
                        },
                    )
                except Exception as e:
                    logger.warning(
                        f"Identity provider status flip failed for {target_id} (target={outcome}): {e}"
                    )
            else:
                # MCP / A2A / Skill / Custom — real AWS Agent Registry records.
                try:
                    from services import agent_registry_client as reg
                    target = {"approved": "APPROVED", "denied": "REJECTED", "cancelled": "DEPRECATED"}[outcome]
                    reg.set_status(
                        target_id,
                        status=target,
                        reason=comment or f"{outcome.title()} via AVA Approval Queue by {approver}",
                    )
                except Exception as e:
                    # Log and continue — flipping the queue row is still valuable
                    # even if the registry update fails; the operator can retry
                    # via the Registry UI or re-approve later.
                    logger.warning(
                        f"Registry record status update failed for {target_id} "
                        f"({resource_kind}, target={outcome}): {e}"
                    )

        resp = _table().update_item(
            Key={"request_id": request_id},
            UpdateExpression="SET #st = :st, #d = :d, #u = :u",
            ExpressionAttributeNames={"#st": "status", "#d": "decisions", "#u": "updated_at"},
            ExpressionAttributeValues={":st": outcome, ":d": new_decisions, ":u": now},
            ReturnValues="ALL_NEW",
        )
        return resp.get("Attributes") or {}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{request_id}/approve")
async def approve_request(
    request_id: str,
    body: RequestDecision,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=RBACDepends(require_role(Role.ADMIN)),
):
    return _record_decision(
        request_id, "approved", x_user_email or "unknown", (body.comment or "").strip()
    )


@router.post("/{request_id}/deny")
async def deny_request(
    request_id: str,
    body: RequestDecision,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=RBACDepends(require_role(Role.ADMIN)),
):
    return _record_decision(
        request_id, "denied", x_user_email or "unknown", (body.comment or "").strip()
    )


# ─── Batch decision endpoints ─────────────────────────────────────────
# Bulk-approve or bulk-deny a set of queue rows in one call. The UI
# feeds a list of request_ids selected via the checkbox column. We loop
# through each row and reuse `_record_decision` (which carries the
# registry/identity status-flip hooks), so a batch decision behaves
# identically to N single-row decisions — plus a summary response so
# the UI knows which rows succeeded and which failed.


def _batch_decide(
    outcome: str,
    request_ids: List[str],
    approver: str,
    comment: str,
) -> Dict[str, Any]:
    """Run `_record_decision` for each id, collecting per-row results.

    Returns:
      {
        "outcome": "approved|denied",
        "attempted": N,
        "succeeded": [...ids...],
        "failed": [{request_id, error}, ...],
      }

    We never raise on partial failure — the client gets a 200 with
    per-row detail. A whole-batch failure (auth, malformed body) still
    returns HTTP error via FastAPI's normal path.
    """
    succeeded: List[str] = []
    failed: List[Dict[str, str]] = []
    # De-dupe defensively — UI shouldn't send duplicates but nothing
    # stops it. Preserve order for deterministic response.
    seen = set()
    unique_ids = []
    for rid in request_ids:
        if rid and rid not in seen:
            seen.add(rid)
            unique_ids.append(rid)
    for rid in unique_ids:
        try:
            _record_decision(rid, outcome, approver, comment)
            succeeded.append(rid)
        except HTTPException as e:
            failed.append({"request_id": rid, "error": f"{e.status_code}: {e.detail}"})
        except Exception as e:
            failed.append({"request_id": rid, "error": f"{type(e).__name__}: {e}"})
    return {
        "outcome": outcome,
        "attempted": len(unique_ids),
        "succeeded": succeeded,
        "failed": failed,
    }


@router.post("/batch-approve")
async def batch_approve(
    body: BatchDecisionRequest,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=RBACDepends(require_role(Role.ADMIN)),
):
    """Approve up to 200 queue rows in one call. Per-row failures are
    reported in the response; the batch as a whole always returns 200."""
    return _batch_decide(
        "approved",
        body.request_ids,
        x_user_email or "unknown",
        (body.comment or "").strip(),
    )


@router.post("/batch-deny")
async def batch_deny(
    body: BatchDecisionRequest,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=RBACDepends(require_role(Role.ADMIN)),
):
    """Deny up to 200 queue rows in one call. Same response shape as batch-approve."""
    return _batch_decide(
        "denied",
        body.request_ids,
        x_user_email or "unknown",
        (body.comment or "").strip(),
    )


@router.post("/{request_id}/cancel")
async def cancel_request(
    request_id: str,
    body: RequestDecision,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=RBACDepends(require_role(Role.OPERATOR)),
):
    """Requesters can cancel their own pending request.

    v1 doesn't validate that x-user-email == requested_by; that check is
    trivial to add once we start enforcing the queue against real actions.
    """
    return _record_decision(
        request_id, "cancelled", x_user_email or "unknown", (body.comment or "").strip()
    )


@router.get("/summary/counts")
async def summary_counts(_=RBACDepends(require_role(Role.VIEWER))):
    """Cheap counts for the Operate landing tile / sidebar badge."""
    if not settings.APPROVAL_REQUESTS_TABLE_NAME:
        return {"pending": 0, "approved": 0, "denied": 0, "total": 0}
    try:
        resp = _table().scan()
        rows: List[Dict[str, Any]] = resp.get("Items", []) or []
        counts = {s: 0 for s in STATUSES}
        for r in rows:
            counts[r.get("status", "pending")] = counts.get(r.get("status", "pending"), 0) + 1
        return {**counts, "total": len(rows)}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))
