"""Identity Providers registry.

DDB-backed CRUD for user-registered OIDC identity providers (Microsoft Entra
ID, Okta, Auth0, generic OIDC). Includes a discovery-URL test so the wizard
can validate the endpoint before saving.

DDB schema (single-table): pk `provider_id` (uuid).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from urllib.parse import urlsplit, urlunsplit

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Depends as RBACDepends, Header
from pydantic import BaseModel, Field

from core import safe_fetch
from core.config import settings
from core.rbac import Role, require_role
from core.safe_fetch import SafeFetchError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/identity-providers", tags=["identity-providers"])

_ddb = None


def _table():
    global _ddb
    if _ddb is None:
        _ddb = boto3.resource("dynamodb", region_name=settings.AWS_REGION).Table(
            settings.IDENTITY_PROVIDERS_TABLE_NAME
        )
    return _ddb


# ─── Shapes ─────────────────────────────────────────────────────────────────


PROVIDER_TYPES = ["entra_id", "okta", "auth0", "generic_oidc"]

# AVA's RBAC roles — matches core/rbac.py::Role. Kept flat and short so
# claim-mapping stays operator-friendly. If AVA's role model expands, add
# entries here and every existing DDB row keeps working (rows are opaque
# strings — the backend doesn't validate against this list on read).
AVA_ROLES = ["ADMIN", "OPERATOR", "VIEWER"]


class ProviderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    provider_type: str = Field(..., description="entra_id | okta | auth0 | generic_oidc")
    discovery_url: str = Field(..., min_length=8, description="OIDC discovery URL (issuer + /.well-known/openid-configuration)")
    client_id: str = Field(..., min_length=1)
    client_secret: Optional[str] = None
    is_confidential: bool = Field(default=False, description="True for confidential clients (server-side); False for PKCE public clients")
    group_claim: str = Field(default="groups", description="Name of the claim carrying the user's group membership")
    claim_mappings: Dict[str, str] = Field(
        default_factory=dict,
        description="IdP group value → AVA role. Example: {'admins': 'ADMIN', 'analysts': 'VIEWER'}"
    )
    description: Optional[str] = None


class ProviderUpdate(BaseModel):
    name: Optional[str] = None
    discovery_url: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    is_confidential: Optional[bool] = None
    group_claim: Optional[str] = None
    claim_mappings: Optional[Dict[str, str]] = None
    description: Optional[str] = None


class DiscoveryTestRequest(BaseModel):
    discovery_url: str


# A real discovery document is a couple of KB (the keys live behind jwks_uri, not
# inline), so this is a 100x margin. The cap matters because /test-discovery
# reflects the fetched body back to the caller: without it, a caller-named host
# can stream as much as it likes through this response.
_DISCOVERY_MAX_BYTES = 256 * 1024

# The suffix the wizard appends when an operator pastes a bare issuer URL.
_WELL_KNOWN_PATH = "/.well-known/openid-configuration"

# Tested for separately, and looser on purpose: an issuer that publishes discovery
# at some other path ending in /openid-configuration was left alone before, and
# tightening this to _WELL_KNOWN_PATH would start rewriting - and so breaking - a
# URL that works today.
_DISCOVERY_SUFFIX = "/openid-configuration"

# urlopen sent `User-Agent: Python-urllib/<ver>` for free; the pinned-IP client
# sends no UA at all. WAF-fronted discovery endpoints (Front Door in front of
# login.microsoftonline.com, Akamai in front of Okta) commonly 403 an empty UA,
# which would surface here as an unexplained http_status_error.
_DISCOVERY_HEADERS = {"User-Agent": "AVA-control-plane/1.0"}

# Whether an operator can clear a refusal by listing the issuer's CIDR in
# SAFE_FETCH_ALLOWED_PRIVATE_CIDRS is `safe_fetch.is_allowlistable_refusal`'s answer,
# not this module's. There was a local frozenset here naming the three address classes
# the allowlist can relax; it was correct when written and would not have failed if
# safe_fetch added a fourth - the refusal would just quietly stop being explained. The
# rule now has one owner.
#
# What that owner refuses to call allowlistable, and why the wizard must not offer the
# setting for it: loopback, link-local and multicast can never be overridden
# (safe_fetch._ALLOWLIST_CANNOT_OVERRIDE - IMDS and the ECS credential endpoint are the
# assets being defended), so naming the setting there is advice that cannot work.

# Refusals that are the submitted URL's fault, not the IdP's. Reporting a typo'd
# scheme or hostname as 502 tells the operator to go debug a server that was never
# contacted.
_CLIENT_ERROR_REASONS = frozenset(
    {"invalid_url", "blocked_scheme", "blocked_url_credentials", "unresolvable_host"}
)


def _discovery_failure(e: SafeFetchError) -> HTTPException:
    """Turn a refusal into an HTTP error that names the reason and nothing else.

    Never the target, its resolved address or `str(e)`: this route hands the
    fetched document back to the caller, so echoing where the fetch went (or did
    not go) would turn a refusal into the port scan the refusal just prevented.
    `e.detail` carries the specifics and stays in the log.
    """
    detail = f"Discovery fetch failed: {e.reason}"

    if safe_fetch.is_allowlistable_refusal(e.reason):
        detail += (
            ". The issuer does not resolve to a publicly routable address. If this is an"
            " on-prem or VPC-internal IdP, add its CIDR to SAFE_FETCH_ALLOWED_PRIVATE_CIDRS"
            " on the backend and retry."
        )
    elif e.reason == "http_status_error":
        # The numeric status only, under a strict guard, so nothing but three digits
        # from `status=NNN` can ever reach the body. It is worth surfacing because
        # without it a typo'd tenant (404) is indistinguishable from an IdP outage
        # (503), and it leaks nothing: the status comes from a host that already
        # passed the address check, which the caller can reach directly anyway.
        status = e.detail.removeprefix("status=")
        if len(status) == 3 and status.isdigit():
            detail += f" (HTTP {status})"

    code = 400 if e.reason in _CLIENT_ERROR_REASONS else 502
    return HTTPException(status_code=code, detail=detail)


# ─── Routes ─────────────────────────────────────────────────────────────────


@router.get("/reference")
async def get_reference(_=RBACDepends(require_role(Role.VIEWER))):
    """Static enum data the wizard needs: provider types, AVA roles, discovery-URL hints."""
    return {
        "provider_types": [
            {"id": "entra_id",     "label": "Microsoft Entra ID",  "hint": "https://login.microsoftonline.com/{tenant-id}/v2.0", "group_claim": "roles"},
            {"id": "okta",         "label": "Okta",                "hint": "https://{your-domain}.okta.com",                  "group_claim": "groups"},
            {"id": "auth0",        "label": "Auth0",               "hint": "https://{your-domain}.auth0.com/",                "group_claim": "https://your-namespace/roles"},
            {"id": "generic_oidc", "label": "Generic OIDC",        "hint": "https://your-issuer.example.com",                 "group_claim": "groups"},
        ],
        "ava_roles": AVA_ROLES,
    }


# ─── System (Cognito) provider ─────────────────────────────────────────────
#
# AVA is signed in with a Cognito user pool. Exposing it in the Identity list
# makes the "who's authenticating me" answer explicit, and gives operators a
# quick summary (pool id, hosted UI, MFA config, group count) without hunting
# in the AWS Console.
#
# This is READ-ONLY on purpose. The pool itself is owned by Terraform in the
# control-plane stack; AVA has no legitimate need to mutate it via the UI,
# and doing so would violate the split between the identity-plane (federated
# providers registered by AVA) and the primary auth (Cognito owned by TF).

_SYSTEM_CACHE: Dict[str, Any] = {"at": 0.0, "value": None}
_SYSTEM_CACHE_TTL_SECONDS = 60


@router.get("/system")
async def get_system_provider(_=RBACDepends(require_role(Role.VIEWER))):
    """Synthetic Cognito provider derived from live pool state.

    Cached for 60s in-process so repeated page loads don't hammer Cognito
    (DescribeUserPool + DescribeUserPoolDomain + ListGroups).
    """
    import time
    now = time.time()
    if _SYSTEM_CACHE["value"] and (now - _SYSTEM_CACHE["at"] < _SYSTEM_CACHE_TTL_SECONDS):
        return _SYSTEM_CACHE["value"]

    pool_id = (settings.COGNITO_USER_POOL_ID or "").strip()
    client_id = (settings.COGNITO_CLIENT_ID or "").strip()
    region = (settings.COGNITO_REGION or settings.AWS_REGION or "us-east-1").strip()

    if not pool_id or not client_id:
        # Nothing wired — return a stubbed placeholder so the UI can still
        # render the row and prompt for Terraform apply.
        placeholder = {
            "provider_id": "system-cognito",
            "provider_type": "cognito",
            "name": "AVA Cognito (not configured)",
            "discovery_url": "",
            "client_id": "",
            "is_confidential": False,
            "group_claim": "cognito:groups",
            "claim_mappings": {},
            "description": "COGNITO_USER_POOL_ID / COGNITO_CLIENT_ID not set on the backend. Run deploy-full.sh to provision the pool.",
            "status": "unconfigured",
            "source": "system",
            "created_at": "",
            "updated_at": "",
        }
        _SYSTEM_CACHE.update({"at": now, "value": placeholder})
        return placeholder

    discovery_url = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/openid-configuration"

    # Live enrichment — everything below is best-effort; individual failures
    # degrade gracefully rather than 500 the endpoint.
    name = f"AVA Cognito · {pool_id}"
    mfa_configuration = "OFF"
    hosted_ui_domain = ""
    estimated_users = None
    groups: List[str] = []

    try:
        idp = boto3.client("cognito-idp", region_name=region)
        try:
            pool = idp.describe_user_pool(UserPoolId=pool_id).get("UserPool", {}) or {}
            if pool.get("Name"):
                name = f"AVA Cognito · {pool['Name']}"
            mfa_configuration = str(pool.get("MfaConfiguration") or "OFF")
            estimated_users = pool.get("EstimatedNumberOfUsers")
            domain = pool.get("Domain")
            if domain:
                # Custom domain wins; otherwise it's the *.auth.<region>.amazoncognito.com host.
                custom = pool.get("CustomDomain")
                hosted_ui_domain = custom or f"{domain}.auth.{region}.amazoncognito.com"
        except ClientError as e:
            logger.warning(f"DescribeUserPool failed: {e}")

        try:
            gresp = idp.list_groups(UserPoolId=pool_id, Limit=60)
            groups = [g.get("GroupName") for g in gresp.get("Groups", []) if g.get("GroupName")]
        except ClientError as e:
            logger.warning(f"ListGroups failed: {e}")
    except Exception as e:
        logger.warning(f"cognito-idp client init failed: {e}")

    # Auto-derive claim mappings from pool groups. Convention: group names
    # containing "admin" / "operator" / "viewer" / "user" map to the
    # corresponding AVA role. Unmatched groups still appear in the response
    # via the `groups` field so operators can decide whether to formalize
    # them.
    claim_mappings: Dict[str, str] = {}
    for g in groups:
        low = g.lower()
        if "admin" in low:
            claim_mappings[g] = "ADMIN"
        elif "operator" in low:
            claim_mappings[g] = "OPERATOR"
        elif "viewer" in low or "user" in low:
            claim_mappings[g] = "VIEWER"

    result = {
        "provider_id": "system-cognito",
        "provider_type": "cognito",
        "name": name,
        "discovery_url": discovery_url,
        "client_id": client_id,
        "is_confidential": False,
        "group_claim": "cognito:groups",
        "claim_mappings": claim_mappings,
        "description": "",
        "status": "active",
        "source": "system",
        "region": region,
        "pool_id": pool_id,
        "hosted_ui_domain": hosted_ui_domain,
        "mfa_configuration": mfa_configuration,
        "estimated_users": estimated_users,
        "groups": groups,
        "created_at": "",
        "updated_at": "",
    }
    _SYSTEM_CACHE.update({"at": now, "value": result})
    return result


@router.post("/test-discovery")
async def test_discovery(req: DiscoveryTestRequest, _=RBACDepends(require_role(Role.VIEWER))):
    """Fetch the OIDC discovery document so the wizard can validate before saving.

    Returns the parsed metadata (issuer, authorization_endpoint, token_endpoint,
    jwks_uri, supported claims) or an error the UI can surface.
    """
    url = req.discovery_url.strip()
    try:
        # Auto-append the well-known path if the issuer alone was given, matching on
        # the parsed path rather than the whole string. Microsoft documents
        # `.../.well-known/openid-configuration?appid=<client-id>`, which an
        # endswith() test on the raw URL misses: it would append the suffix a second
        # time and drop the query. The rewrite happens before the fetch, so the URL
        # safe_fetch validates is the one that is actually requested.
        parts = urlsplit(url)
        base_path = parts.path.rstrip("/")
        if not base_path.endswith(_DISCOVERY_SUFFIX):
            url = urlunsplit(parts._replace(path=base_path + _WELL_KNOWN_PATH))
    except ValueError as e:
        # urlsplit rejects a malformed URL (an unclosed IPv6 literal, say) before
        # safe_fetch ever sees it. %r on the exception, not the URL, and repr either
        # way: the message can quote the host the caller sent.
        logger.warning("test-discovery got an unparseable url: %r", e)
        raise HTTPException(status_code=400, detail="invalid_url")

    try:
        discovery = safe_fetch.fetch_json(
            url, timeout=10, max_bytes=_DISCOVERY_MAX_BYTES, headers=_DISCOVERY_HEADERS
        )
    except SafeFetchError as e:
        # %r, not an f-string: discovery_url is caller-controlled and can carry
        # CR/LF, which interpolated raw would let a VIEWER forge whole log records
        # in CloudWatch. The slice bounds what one request can write.
        logger.warning("test-discovery refused url=%r: %s (%s)", url[:256], e.reason, e.detail)
        raise _discovery_failure(e)
    except Exception:
        # Not every failure arrives as a SafeFetchError, and the ones that do not are
        # caller-reachable: `a..example.com` makes getaddrinfo raise UnicodeError
        # from its IDNA step, and a remote `Location: http://[::1` makes safe_fetch's
        # redirect urljoin raise ValueError. Without this arm both are unhandled
        # 500s with a traceback, where the wizard needs a refusal it can show.
        logger.warning("test-discovery failed url=%r", url[:256], exc_info=True)
        raise HTTPException(status_code=502, detail="Discovery fetch failed: fetch_failed")

    return {"ok": True, "discovery": discovery, "resolved_url": url}


@router.get("/list")
async def list_providers(_=RBACDepends(require_role(Role.VIEWER))):
    if not settings.IDENTITY_PROVIDERS_TABLE_NAME:
        return {"providers": [], "warning": "IDENTITY_PROVIDERS_TABLE_NAME not configured"}
    try:
        resp = _table().scan()
        items = resp.get("Items", []) or []
        # Never leak client_secret to list callers.
        for it in items:
            it.pop("client_secret", None)
        return {"providers": items}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{provider_id}")
async def get_provider(provider_id: str, _=RBACDepends(require_role(Role.VIEWER))):
    try:
        resp = _table().get_item(Key={"provider_id": provider_id})
        item = resp.get("Item")
        if not item:
            raise HTTPException(status_code=404, detail=f"Identity provider {provider_id} not found")
        item.pop("client_secret", None)
        return item
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", status_code=201)
async def register_provider(
    req: ProviderCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    # VIEWER floor — Approval Policies decide who has to sign off.
    # Default seed requires ADMIN (identity registration has high blast
    # radius: it changes how users authenticate).
    _=RBACDepends(require_role(Role.VIEWER)),
):
    if req.provider_type not in PROVIDER_TYPES:
        raise HTTPException(status_code=400, detail=f"provider_type must be one of {PROVIDER_TYPES}")
    if not settings.IDENTITY_PROVIDERS_TABLE_NAME:
        raise HTTPException(status_code=503, detail="IDENTITY_PROVIDERS_TABLE_NAME not configured")
    bad_roles = [r for r in req.claim_mappings.values() if r not in AVA_ROLES]
    if bad_roles:
        raise HTTPException(status_code=400, detail=f"Unknown AVA roles: {bad_roles}. Allowed: {AVA_ROLES}")

    # Consult Approval Policies. Identity is NOT a registry record — it
    # lives in the identity_providers DDB table — but the policy engine
    # is resource-agnostic, so we pass `kind='identity'` and let the
    # matching policy decide. Deny → 403; auto-approve → status='active';
    # require_approval → status='pending' + queue row.
    from services import approval_policy_engine as policy
    verdict = policy.evaluate(kind="identity", resource_id=req.name.strip(), action="register")
    if verdict.mode == policy.MODE_DENY:
        raise HTTPException(
            status_code=403,
            detail=f"Approval Policy denies identity registration for '{req.name.strip()}': {verdict.reason or 'no reason given'}",
        )
    approved = verdict.mode == policy.MODE_AUTO_APPROVE

    now = datetime.now(timezone.utc).isoformat()
    provider_id = str(uuid.uuid4())
    item: Dict[str, Any] = {
        "provider_id": provider_id,
        "name": req.name.strip(),
        "provider_type": req.provider_type,
        "discovery_url": req.discovery_url.strip(),
        "client_id": req.client_id.strip(),
        "is_confidential": req.is_confidential,
        "group_claim": req.group_claim.strip(),
        "claim_mappings": req.claim_mappings or {},
        "description": (req.description or "").strip(),
        # Status mirrors the policy verdict — 'active' means the IdP is
        # ready to federate; 'pending' means it exists but sign-in flows
        # should NOT accept tokens from it until an approver moves it.
        # (The federation-issue-tokens code path — v2 — will refuse
        # non-'active' providers as a safety measure.)
        "status": "active" if approved else "pending",
        "created_at": now,
        "updated_at": now,
    }
    if req.client_secret:
        # Note: production should store this in Secrets Manager, not DDB. This
        # is v1 scaffolding — flagged in the UI copy.
        item["client_secret"] = req.client_secret
    try:
        _table().put_item(Item=item)
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Approval-queue row when the policy required approval. The queue's
    # approve/deny handler will flip the DDB status when the decision
    # lands (see approval_requests.py::_record_decision hook — extended
    # below to handle the 'identity:*' kind).
    if not approved:
        try:
            from services.agent_registry_client import enqueue_approval
            # Adapt: enqueue_approval was written for registry records —
            # here we pass a small dict shaped like a record so the queue
            # writer picks up the same fields.
            enqueue_approval(
                record={
                    "recordId": provider_id,
                    "recordArn": "",
                    "displayName": req.name.strip(),
                    "name": req.name.strip(),
                },
                kind="identity",
                requested_by=x_user_email or "unknown",
                justification=f"Register IdP '{req.name.strip()}' ({req.provider_type}) — discovery {req.discovery_url.strip()}",
                verdict=verdict,
            )
        except Exception as e:
            logger.warning(f"enqueue_approval for identity {provider_id} failed: {e}")

    # Response should not echo the secret back.
    item.pop("client_secret", None)
    return item


@router.patch("/{provider_id}")
async def update_provider(provider_id: str, req: ProviderUpdate, _=RBACDepends(require_role(Role.OPERATOR))):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    expr_names = {f"#{k}": k for k in updates}
    expr_values = {f":{k}": v for k, v in updates.items()}
    set_clause = ", ".join(f"#{k} = :{k}" for k in updates)
    try:
        resp = _table().update_item(
            Key={"provider_id": provider_id},
            UpdateExpression=f"SET {set_clause}",
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ReturnValues="ALL_NEW",
        )
        item = resp.get("Attributes") or {}
        item.pop("client_secret", None)
        return item
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{provider_id}", status_code=204)
async def delete_provider(provider_id: str, _=RBACDepends(require_role(Role.OPERATOR))):
    try:
        _table().delete_item(Key={"provider_id": provider_id})
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))
