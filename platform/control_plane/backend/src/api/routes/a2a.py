"""A2A Servers registry — backed by AWS Agent Registry (record type AGENT).

Aug 2026 migration: what used to live in DynamoDB (`a2a_agents`) now
lives as records in the AVA registry (AWS Agent Registry). Curated
reference A2A servers still ship as `data/a2a_curated.json`.

Response shape (`{agent_id, name, endpoint, ...}`) is preserved so the
frontend keeps working. `agent_id` now maps to the registry `recordId`.
Registration fetches the AgentCard from the endpoint's well-known URL
and stores it inside the record's `data` blob so consumers don't need to
issue a live fetch to know what the peer can do.

`endpoint` is caller-supplied, so that fetch goes through `core.safe_fetch`
and only reaches public addresses. A peer on 10.x, an internal ALB or any
other private address is refused with a 400 that names
SAFE_FETCH_ALLOWED_PRIVATE_CIDRS, which is the setting an operator adds it
to - and so does the /fetch-card preview, as a 502, because that is the
endpoint the Create form hits first. This is a deliberate behaviour change
for on-prem and VPC-internal
deployments: those peers were fetched before and now need one line of
configuration. Registering them unfetched instead would store a URL nothing
validated and show an agent with an empty capability set.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional
from urllib.parse import urljoin

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends as RBACDepends, Header, HTTPException
from pydantic import BaseModel, Field

from core import safe_fetch
from core.config import settings
from core.rbac import Role, require_role
from core.safe_fetch import SafeFetchError
from services import agent_registry_client as reg
from services import approval_policy_engine as policy

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/a2a", tags=["a2a"])


def _curated_path() -> str:
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "data",
        "a2a_curated.json",
    )


# ─── Shapes ─────────────────────────────────────────────────────────────────


class A2aAgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    endpoint: str = Field(..., min_length=8, description="Base URL for the A2A agent (agent_card at /.well-known/agent.json)")
    description: Optional[str] = None
    category: str = Field(default="custom")
    auth_hint: str = Field(default="none", description="none | api_key | oauth2 | bearer | sigv4")
    delegation_mode: str = Field(default="m2m", description="m2m | obo")
    source: str = Field(default="custom", description="custom | curated")
    curated_id: Optional[str] = None


class A2aAgentUpdate(BaseModel):
    name: Optional[str] = None
    endpoint: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    auth_hint: Optional[str] = None
    delegation_mode: Optional[str] = None


class AgentCardFetchRequest(BaseModel):
    endpoint: str = Field(..., min_length=8)


_STATUS_MAP: Dict[str, str] = {
    "APPROVED":         "active",
    "PENDING_APPROVAL": "pending",
    "DRAFT":            "pending",
    "REJECTED":         "rejected",
    "DEPRECATED":       "deprecated",
    "CREATING":         "pending",
    "UPDATING":         "pending",
    "CREATE_FAILED":    "failed",
    "UPDATE_FAILED":    "failed",
}


def _to_ui(record: Dict[str, Any]) -> Dict[str, Any]:
    """Translate an AWS Agent Registry record into the frontend's expected
    `{agent_id, name, endpoint, ...}` shape.

    The descriptor's `data` is the full A2A AgentCard JSON — AVA-specific
    extras (agent_card_url, curated_id, source, ...) are under
    `_meta.ava`. The card's own `url` is the effective endpoint.
    """
    descriptor = ((record.get("descriptors") or {}).get("a2aAgentCard") or {})
    card = descriptor.get("dataParsed") or {}
    ava = dict((card.get("_meta") or {}).get("ava") or {})
    data: Dict[str, Any] = {
        "agent_card_url": ava.get("agent_card_url") or card.get("url", ""),
        "auth_hint":      ava.get("auth_hint", "none"),
        "delegation_mode":ava.get("delegation_mode", "m2m"),
        "category":       ava.get("category", "custom"),
        "source":         ava.get("source", "custom"),
        "curated_id":     ava.get("curated_id"),
        "agent_card":     card,
        "description":    card.get("description", ""),
        "name":           card.get("name", ""),
    }
    status_upper = record.get("status", "")
    return {
        "agent_id":        record.get("recordId") or "",
        "record_arn":      record.get("recordArn") or "",
        "name":            record.get("displayName") or data.get("name") or record.get("name") or "",
        "endpoint":        data.get("agent_card_url", ""),
        "description":     record.get("description") or data.get("description", ""),
        "auth_hint":       data.get("auth_hint", "none"),
        "delegation_mode": data.get("delegation_mode", "m2m"),
        "category":        data.get("category", "custom"),
        "source":          data.get("source", "custom"),
        "curated_id":      data.get("curated_id"),
        "agent_card":      data.get("agent_card") or {},
        "status":          _STATUS_MAP.get(status_upper, status_upper.lower() or "unknown"),
        "status_raw":      status_upper,
        "created_at":      record.get("createdAt") or "",
        "updated_at":      record.get("updatedAt") or "",
    }


# An AgentCard is a small JSON document. The cap matters because `endpoint` is
# caller-supplied: an endless response body would otherwise be a
# memory-exhaustion primitive against the backend.
_AGENT_CARD_MAX_BYTES = 256 * 1024

# Transport failures that collapse into one outward category.
#
# Refused vs. timed out vs. TLS-failed is exactly the closed-vs-filtered
# distinction a port scanner reads off a target, and none of it is actionable for
# the caller: the specific reason goes to the log, where an operator can see it
# and a caller cannot.
#
# These three are the whole collapse set - every OTHER reason safe_fetch can raise
# keeps its own category, which is more than the "it answered HTTP" ones. It also
# covers unresolvable_host (a DNS answer the caller can get themselves),
# too_many_redirects, invalid_url and the blocked_* refusals. The reasons that do
# mean something answered (http_status_error, invalid_json_response,
# response_too_large) tell a caller the port is open, but by then the fetch already
# happened, and no operator can debug a real peer without knowing whether it
# returned a 404 or returned HTML.
# `test_the_collapse_table_covers_every_reason_safe_fetch_can_raise` is the drift
# guard: a new reason in safe_fetch has to be assigned to one side or the other.
_OPAQUE_FETCH_REASONS = frozenset({"fetch_failed", "fetch_timeout", "tls_error"})


class CardFetchError(HTTPException):
    """The 502 raised by `_fetch_agent_card`, carrying the stable reason too.

    `register_agent` tolerates a peer that did not answer but must not tolerate an
    endpoint the address guard refused outright, and telling those apart by
    matching on `detail` - a human-facing string - would break the first time it
    is reworded. Still an HTTPException, so every `except HTTPException` around a
    card fetch keeps working.

    `hint` is for a caller that can add an operator-facing sentence the fetch itself
    has no business deciding on - see the /fetch-card route. It is a parameter rather
    than the route building its own HTTPException so that the reason survives on the
    exception that actually leaves the process.
    """

    def __init__(self, reason: str, *, hint: str = "") -> None:
        detail = f"Failed to fetch AgentCard: {reason}"
        if hint:
            detail += f". {hint}"
        super().__init__(status_code=502, detail=detail)
        self.reason = reason


def _refused_by_policy(reason: str) -> bool:
    """Whether the guard will never fetch this endpoint, vs. the peer not answering now.

    Every scheme, credential and address refusal safe_fetch raises is named
    `blocked_*`, and `invalid_url` is the parse-level equivalent. Every other
    reason - fetch_failed and unresolvable_host through to http_status_error - is
    a peer that may well answer on the next attempt, which is what the degrade
    path in `register_agent` exists for.
    """
    return reason.startswith("blocked_") or reason == "invalid_url"


# The one sentence that makes a refusal actionable, and the only place it is written.
#
# Appended only when `safe_fetch.is_allowlistable_refusal` says the setting could
# actually clear this refusal. It cannot clear loopback, link-local, multicast or the
# unspecified address (safe_fetch._ALLOWLIST_CANNOT_OVERRIDE - IMDS and the ECS
# credential endpoint are the assets being defended), and a non-http scheme or an
# unparseable URL is not an address at all. Offering the setting for those sends an
# operator to edit config, restart the backend and conclude the platform is broken
# when nothing changes.
_ALLOWLIST_HINT = (
    "If this peer is on a private or on-prem network this platform is meant to reach, "
    "add its CIDR to SAFE_FETCH_ALLOWED_PRIVATE_CIDRS on the backend."
)


def _refusal_response(reason: str) -> HTTPException:
    """The error for a mutation naming an endpoint the guard will not fetch.

    A 400 and not a 502: nothing upstream was contacted, let alone failed - the
    submitted endpoint is the problem. It names the reason category and, where the
    allowlist can help, the setting an operator can change - and never the resolved
    address, because that is the one thing a refusal must not hand back (see
    SafeFetchError.reason).
    """
    detail = f"Endpoint refused by the outbound fetch guard ({reason})."
    if safe_fetch.is_allowlistable_refusal(reason):
        detail += f" {_ALLOWLIST_HINT}"
    return HTTPException(status_code=400, detail=detail)


def _fetch_agent_card(endpoint: str) -> tuple[str, Dict[str, Any]]:
    """Fetch the well-known AgentCard from an endpoint.

    Returns (resolved_url, parsed_card). Raises CardFetchError - a 502 - if the
    fetch or the parse fails, or if the guard refuses the endpoint outright;
    `.reason` is what tells those two apart, see `_refused_by_policy`.

    `endpoint` arrives in a request body, so this goes through safe_fetch:
    plain `urlopen` made every route below a proxy for whatever the backend can
    reach and the caller cannot (instance metadata, VPC-internal admin ports).
    Validation is applied to `url` - the well-known rewrite happens first, so
    what gets checked is what actually gets fetched. A peer on a private or
    on-prem address is therefore refused as well, unless an operator has
    allowlisted its CIDR in SAFE_FETCH_ALLOWED_PRIVATE_CIDRS.
    """
    url = endpoint.strip().rstrip("/")
    if not url.endswith("agent.json"):
        try:
            url = urljoin(url + "/", ".well-known/agent.json")
        except ValueError as exc:
            # The rewrite parses the endpoint too, so a malformed authority raises
            # here - before safe_fetch, and this line used to sit above the try below.
            # Measured on this image (CPython 3.14): urljoin('http://[::1/',
            # '.well-known/agent.json') raises ValueError('Invalid IPv6 URL') out of
            # urlsplit. Unguarded that is an unhandled 500 with a traceback that also
            # walks past the degrade paths in register_agent/update_agent, and the
            # same string ending in agent.json skipped the rewrite and came back a
            # tidy `invalid_url` - two answers for one input. So: the same reason,
            # which `_refused_by_policy` already treats as a refusal.
            #
            # %r on both. The endpoint is caller-supplied, and one urllib.parse
            # ValueError interpolates the netloc it rejected ("netloc '...' contains
            # invalid ...", read in the installed urllib/parse.py), so the exception
            # message is caller-influenced too. repr escapes CR/LF either way.
            logger.warning("AgentCard endpoint is unparseable: %r (%r)", endpoint[:256], exc)
            raise CardFetchError("invalid_url") from exc
    try:
        card = safe_fetch.fetch_json(url, timeout=10, max_bytes=_AGENT_CARD_MAX_BYTES)
    except SafeFetchError as exc:
        # The target and the address it resolved to stay in the log. Echoing them
        # back to the caller is what turned this refusal into a working internal
        # port scanner, so the response carries the stable category only.
        #
        # `%r`, not `%s`: `url` is caller-supplied, and an endpoint that already
        # ends in agent.json is logged exactly as it arrived. A CR/LF in it would
        # otherwise forge a second line in a log this product treats as evidence.
        logger.warning("AgentCard fetch failed for %r: %s (%s)", url, exc.reason, exc.detail)
        raise CardFetchError(
            "fetch_failed" if exc.reason in _OPAQUE_FETCH_REASONS else exc.reason
        ) from exc
    except Exception:
        # Not everything a caller can trigger arrives as a SafeFetchError:
        # getaddrinfo raises UnicodeError on an over-long IDNA label (validated
        # before the try block that would normalise it) and json.loads raises
        # RecursionError on a deeply nested body that fits under the cap. Letting
        # either escape turns this controlled 502 into an unhandled 500, which
        # also walks past the `except HTTPException` degrade paths below - so a
        # registration that used to survive an odd endpoint would hard-fail, and
        # every attempt would write a traceback at ERROR on demand.
        logger.exception("AgentCard fetch raised an unexpected error for %r", url)
        raise CardFetchError("fetch_failed")
    if not isinstance(card, dict):
        # A card that is a JSON array or scalar would be stored in the registry
        # record and then read as a dict by _to_ui, which fails much later.
        logger.warning("AgentCard at %r is not a JSON object: %s", url, type(card).__name__)
        raise CardFetchError("invalid_card_shape")
    return url, card


# ─── Routes ─────────────────────────────────────────────────────────────────


@router.get("/curated")
async def list_curated(_=RBACDepends(require_role(Role.VIEWER))):
    """Reference A2A agents — demos + samples. Not vetted for production."""
    path = _curated_path()
    if not os.path.exists(path):
        return {"agents": [], "warning": f"a2a_curated.json not found at {path}"}
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"failed to read a2a_curated.json: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_agents(_=RBACDepends(require_role(Role.VIEWER))):
    """Registered A2A servers — from AWS Agent Registry, record type AGENT."""
    if not reg._registry_id():
        return {
            "agents": [],
            "warning": "AGENT_REGISTRY_ID is empty; registry not configured on this backend.",
        }
    try:
        # A2A servers and Agents both live under recordType=AGENT — the
        # `Kind` tag is what distinguishes them. Without this filter the
        # A2A page rendered every AGENT record (including Kind=agent
        # entries produced by Foundry deploys) and looked like it was
        # showing MCP servers to the user.
        records = reg.list_records(record_type="AGENT", tag_filter={"Kind": "a2a"})
        return {"agents": [_to_ui(r) for r in records]}
    except ClientError as e:
        logger.error(f"list A2A records failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_id}")
async def get_agent(agent_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    try:
        rec = reg.get_record(agent_id)
        return _to_ui(rec)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            raise HTTPException(status_code=404, detail=f"A2A agent {agent_id} not found")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fetch-card")
async def fetch_agent_card(req: AgentCardFetchRequest, _=RBACDepends(require_role(Role.VIEWER))):
    """Fetch the well-known AgentCard so the Create form can preview it.

    A refusal the allowlist could clear says so here too, not only on the mutation
    paths. This is the endpoint an operator hits first - the "Fetch card" button in
    A2aCreate.tsx - so it is the one that most needs to be actionable, and it was
    answering a bare `blocked_private_address` while POST /a2a explained itself. The
    detail reaches the operator verbatim: components/a2a/api.ts puts `detail` into the
    Error it throws and the form renders that string.

    Still a 502 with the same category as `_fetch_agent_card` raised, so the added
    sentence is the only difference; nothing here learns the address either.
    """
    try:
        url, card = _fetch_agent_card(req.endpoint)
    except CardFetchError as e:
        if not safe_fetch.is_allowlistable_refusal(e.reason):
            raise
        raise CardFetchError(e.reason, hint=_ALLOWLIST_HINT) from e
    return {"agent_card": card, "resolved_url": url}


@router.post("", status_code=201)
async def register_agent(
    req: A2aAgentCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    # VIEWER floor — the policy engine decides whether approval is needed.
    _=RBACDepends(require_role(Role.VIEWER)),
):
    """Publish an A2A server. Policy engine decides auto-approve vs. queue vs. deny.

    A peer that does not answer is still registered, with an empty card that the
    next endpoint update refetches. An endpoint the outbound fetch guard refuses
    (private, loopback, link-local, non-http scheme) is not: see
    `_refusal_response` for why that is a 400 rather than a silent 201.
    """
    if not reg._registry_id():
        raise HTTPException(
            status_code=503,
            detail="AGENT_REGISTRY_ID not configured. Backend can't publish A2A records until the AVA registry is wired.",
        )
    verdict = policy.evaluate(kind="a2a", resource_id=req.name.strip(), action="register")
    if verdict.mode == policy.MODE_DENY:
        raise HTTPException(
            status_code=403,
            detail=f"Approval Policy denies A2A registration for '{req.name.strip()}': {verdict.reason or 'no reason given'}",
        )
    final_status = "APPROVED" if verdict.mode == policy.MODE_AUTO_APPROVE else "PENDING_APPROVAL"

    # Fetch the AgentCard once — the record carries it inline so downstream
    # consumers don't need to hit the endpoint again for capabilities.
    try:
        resolved_url, card = _fetch_agent_card(req.endpoint)
    except CardFetchError as e:
        if _refused_by_policy(e.reason):
            # Registering anyway would persist a URL nothing validated and answer
            # 201 for an agent with no capabilities, no description and an
            # endpoint that will never be fetched - explained only by a WARNING in
            # the backend log. Refuse, and name the setting that makes a private
            # peer reachable so the refusal is actionable.
            logger.warning("A2A registration refused by the fetch guard: %s", e.reason)
            raise _refusal_response(e.reason) from e
        logger.warning("AgentCard fetch during register failed: %s", e.reason)
        resolved_url = req.endpoint.strip()
        card = {}
    except HTTPException as e:
        # Any other HTTPException out of the fetch keeps the old degrade path
        # rather than failing the registration.
        logger.warning("AgentCard fetch during register failed: %s", e.detail)
        resolved_url = req.endpoint.strip()
        card = {}

    try:
        record = reg.publish_a2a_server(
            display_name=req.name.strip(),
            agent_card_url=resolved_url,
            agent_card=card,
            description=(req.description or "").strip(),
            curated_id=req.curated_id,
            extra={
                "category":        req.category,
                "auth_hint":       req.auth_hint,
                "delegation_mode": req.delegation_mode,
                "source":          req.source,
            },
            final_status=final_status,
        )
    except ClientError as e:
        logger.error(f"publish_a2a_server failed: {e}")
        raise HTTPException(status_code=500, detail=f"CreateRegistryRecord failed: {e}")
    except Exception as e:
        logger.exception("publish_a2a_server unhandled")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")

    if verdict.mode == policy.MODE_REQUIRE_APPROVAL:
        reg.enqueue_approval(
            record=record,
            kind="a2a",
            requested_by=x_user_email or "unknown",
            justification=f"Register A2A server '{req.name.strip()}' at {req.endpoint.strip()}",
            verdict=verdict,
        )
    return _to_ui(record)


@router.patch("/{agent_id}")
async def update_agent(agent_id: str, req: A2aAgentUpdate, _=RBACDepends(require_role(Role.OPERATOR))):
    """Update mutable fields on an A2A record.

    Endpoint change re-fetches the AgentCard so the stored `data.agent_card`
    stays in sync with the peer's current capabilities.
    """
    try:
        current = reg.get_record(agent_id)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            raise HTTPException(status_code=404, detail=f"A2A agent {agent_id} not found")
        raise HTTPException(status_code=500, detail=str(e))

    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    descriptor = (current.get("descriptors") or {}).get("a2aAgentCard") or {}
    data = dict(descriptor.get("dataParsed") or {})

    if "endpoint" in updates:
        try:
            resolved_url, card = _fetch_agent_card(updates["endpoint"])
            data["agent_card_url"] = resolved_url
            data["agent_card"] = card
        except CardFetchError as e:
            if _refused_by_policy(e.reason):
                # Same reasoning as register_agent: recording an endpoint the guard
                # refuses, next to a card fetched from the old one, leaves the
                # record describing neither.
                logger.warning("A2A endpoint update refused by the fetch guard: %s", e.reason)
                raise _refusal_response(e.reason) from e
            # Peer down: take the new endpoint, keep the last known card.
            data["agent_card_url"] = updates["endpoint"]
        except HTTPException:
            data["agent_card_url"] = updates["endpoint"]
    for k in ("auth_hint", "delegation_mode", "category", "description"):
        if k in updates:
            data[k] = updates[k]
    if "name" in updates:
        data["name"] = updates["name"]

    from services.agent_registry_client import control_client, _registry_id
    import json as _json
    kwargs: Dict[str, Any] = {
        "registryId": _registry_id(),
        "recordId": agent_id,
        "descriptors": {
            "optionalValue": {
                "a2aAgentCard": {
                    "data": _json.dumps(data),
                    "dataSchemaVersion": "1.0",
                }
            }
        },
    }
    if "name" in updates:
        kwargs["displayName"] = {"optionalValue": updates["name"]}
    if "description" in updates:
        kwargs["description"] = {"optionalValue": updates["description"]}
    try:
        control_client().update_registry_record(**kwargs)
        return _to_ui(reg.get_record(agent_id))
    except ClientError as e:
        logger.error(f"update A2A record failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    """Deprecate the A2A record (soft delete)."""
    try:
        reg.deprecate(agent_id, reason="Deprecated via AVA A2A Servers page")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException", "NotFoundException"):
            return
        raise HTTPException(status_code=500, detail=str(e))
