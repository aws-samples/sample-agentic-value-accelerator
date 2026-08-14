"""Identity Providers registry.

DDB-backed CRUD for user-registered OIDC identity providers (Microsoft Entra
ID, Okta, Auth0, generic OIDC). Includes a discovery-URL test so the wizard
can validate the endpoint before saving.

DDB schema (single-table): pk `provider_id` (uuid).
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from urllib.parse import urljoin

import boto3
import urllib.request
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, Depends as RBACDepends, Header
from pydantic import BaseModel, Field

from core.config import settings
from core.rbac import Role, require_role

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
    # Auto-append the well-known path if the issuer alone was given.
    if not url.endswith("/openid-configuration"):
        url = urljoin(url.rstrip("/") + "/", ".well-known/openid-configuration")
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            body = resp.read().decode("utf-8")
        return {"ok": True, "discovery": json.loads(body), "resolved_url": url}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Discovery fetch failed from {url}: {e}")


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
