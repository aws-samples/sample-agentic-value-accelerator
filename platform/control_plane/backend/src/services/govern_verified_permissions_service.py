"""Govern Verified Permissions service — real Cedar authZ policy stores.

Read-only, read-through + cached. Discovers Amazon Verified Permissions policy
stores and, per store, the policy population broken down by Cedar effect
(permit / forbid), the presence of a schema, and the count of identity sources.
This is the real policy-as-code substrate that backs AgentCore / A2A governance:
each store is a Cedar authorization engine, each STATIC/TEMPLATE_LINKED policy a
permit-or-forbid rule an agent is evaluated against.

Every AWS call is independently graceful — one unavailable sub-call (e.g. a store
with no schema) never breaks the rest of the response, but it is never silent
either: a per-store read that was denied or unreachable takes the whole response
to live=False and names the failed call in the note, because "0 policies" and
"could not read the policies" are different claims. When the Verified
Permissions source itself is unreachable / not permitted, the response
honestly degrades to live=False with a clear note (never fabricated data).

Shape notes (verified live, us-east-1, boto3 verifiedpermissions):
  - list_policy_stores → policyStores[]{policyStoreId, arn, createdDate, lastUpdatedDate}
  - list_policies      → policies[]{policyId, policyType (STATIC|TEMPLATE_LINKED),
                                    effect (Permit|Forbid), principal, actions, definition, ...}
  - get_schema         → {schema (str), namespaces[], createdDate, lastUpdatedDate}
                         (raises ResourceNotFoundException when no schema is attached)
  - list_identity_sources → identitySources[]{identitySourceId, ...}
  - get_policy_store   → {arn, validationSettings{mode}, deletionProtection, cedarVersion, ...}
"""

from __future__ import annotations

import logging
import time
from typing import List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, Field

from core.config import settings
from core.security_utils import mask_account_id, mask_arn
from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

_TTL = 300  # 5 min — policy stores barely move minute-to-minute.


# ─────────────────── Response models (inline; keeps this a 2-file source) ───────────────────


class VerifiedPermissionsStore(BaseModel):
    """One Cedar authZ policy store with its policy/schema/identity-source posture."""

    policy_store_id: str
    arn: Optional[str] = None  # masked to resource tail — never the raw account ARN
    # Policy population broken down by Cedar effect.
    total_policies: int = 0
    permit_count: int = 0
    forbid_count: int = 0
    # Policy population broken down by kind.
    static_count: int = 0
    template_linked_count: int = 0
    # Schema presence (a store may govern without a published schema).
    schema_present: bool = False
    schema_namespaces: List[str] = Field(default_factory=list)
    # Identity sources (Cognito / OIDC token providers wired to the store).
    identity_source_count: int = 0
    # Store metadata.
    cedar_version: Optional[str] = None
    validation_mode: Optional[str] = None
    deletion_protection: Optional[str] = None
    created_at: Optional[str] = None
    last_updated_at: Optional[str] = None


class VerifiedPermissionsStoresResponse(BaseModel):
    stores: List[VerifiedPermissionsStore] = Field(default_factory=list)
    total_stores: int = 0
    total_policies: int = 0
    total_permit: int = 0
    total_forbid: int = 0
    total_identity_sources: int = 0
    stores_with_schema: int = 0
    live: bool = False
    source: str = ""
    note: Optional[str] = None


def _iso(v) -> Optional[str]:
    return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v else None)


class GovernVerifiedPermissionsService:
    """Read-only view over Amazon Verified Permissions (Cedar authZ) policy stores."""

    def __init__(self, region: str = settings.GOVERN_AWS_REGION):
        self.region = region

    def _client(self):
        return boto3.client("verifiedpermissions", region_name=self.region)

    # ─────────────────── Public (cached) ───────────────────

    def get_stores(self) -> VerifiedPermissionsStoresResponse:
        result, cached_at = get_or_load(
            f"verified-permissions:stores:{self.region}", _TTL,
            self._fetch_stores, should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} · {stamp}" if result.note else stamp}
            )
        return result

    # ─────────────────── Fetch ───────────────────

    def _list_policy_stores(self, vp) -> list:
        stores: list = []
        try:
            paginator = vp.get_paginator("list_policy_stores")
            for page in paginator.paginate():
                stores.extend(page.get("policyStores", []))
        except (AttributeError, KeyError, ValueError):
            # No paginator available — fall back to a single call.
            stores = vp.list_policy_stores().get("policyStores", [])
        return stores

    def _fetch_stores(self) -> VerifiedPermissionsStoresResponse:
        try:
            vp = self._client()
            raw_stores = self._list_policy_stores(vp)
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Verified Permissions ListPolicyStores unavailable: %s", e)
            return VerifiedPermissionsStoresResponse(
                live=False, source="unavailable-fallback",
                note="Amazon Verified Permissions unreachable or not permitted (verifiedpermissions:ListPolicyStores).",
            )

        stores: List[VerifiedPermissionsStore] = []
        # Sub-reads that did not happen. Collected (deduped, order preserved) so the
        # response can say which call failed instead of publishing the default it left
        # behind as if it had been measured.
        failed_reads: List[str] = []
        metadata_failures: List[str] = []
        for s in raw_stores:
            psid = s.get("policyStoreId", "")
            store = VerifiedPermissionsStore(
                policy_store_id=psid,
                # mask_arn reduces the full ARN to its resource tail — the raw
                # 12-digit account id in the ARN never reaches the frontend.
                arn=mask_arn(s.get("arn")),
                created_at=_iso(s.get("createdDate")),
                last_updated_at=_iso(s.get("lastUpdatedDate")),
            )
            for reason in (
                self._enrich_policies(vp, psid, store),
                self._enrich_schema(vp, psid, store),
                self._enrich_identity_sources(vp, psid, store),
            ):
                if reason and reason not in failed_reads:
                    failed_reads.append(reason)
            # GetPolicyStore only fills fields that are already Optional (cedar_version,
            # validation_mode, deletion_protection), so a failure there leaves them
            # honestly unknown rather than a fabricated number. That earns a note, not
            # live=False - unlike the three reads above, which the UI renders as counts.
            meta_reason = self._enrich_store_metadata(vp, psid, store)
            if meta_reason and meta_reason not in metadata_failures:
                metadata_failures.append(meta_reason)
            stores.append(store)

        stores.sort(key=lambda x: x.total_policies, reverse=True)

        total_policies = sum(s.total_policies for s in stores)
        total_permit = sum(s.permit_count for s in stores)
        total_forbid = sum(s.forbid_count for s in stores)
        total_id_sources = sum(s.identity_source_count for s in stores)
        with_schema = sum(1 for s in stores if s.schema_present)

        if not stores:
            note_parts = ["No Verified Permissions policy stores in this region (none created yet)."]
        elif failed_reads:
            # The permit/forbid/schema rollup is deliberately not restated here: it is
            # missing every store whose read was denied, and a precise-looking summary is
            # exactly the thing that gets believed and closed.
            note_parts = [
                f"{len(stores)} Cedar policy store(s) found, but {', '.join(failed_reads)} "
                f"failed for at least one store, so the policy, schema and identity-source "
                f"counts are incomplete and not a measurement."
            ]
        else:
            note_parts = [
                f"{len(stores)} Cedar policy store(s) · {total_policies} policies "
                f"({total_permit} permit / {total_forbid} forbid) · "
                f"{with_schema} with schema · {total_id_sources} identity source(s)."
            ]
        if metadata_failures:
            note_parts.append(
                f"{', '.join(metadata_failures)} failed for at least one store; its Cedar "
                f"version, validation mode and deletion protection are unknown, not absent."
            )

        return VerifiedPermissionsStoresResponse(
            stores=stores,
            total_stores=len(stores),
            total_policies=total_policies,
            total_permit=total_permit,
            total_forbid=total_forbid,
            total_identity_sources=total_id_sources,
            stores_with_schema=with_schema,
            # ListPolicyStores succeeding only makes the store roster real. A denied
            # per-store read means these counts were never measured, and the model has no
            # way to say "unknown" for them (total_policies etc. are non-Optional ints the
            # UI renders as numbers), so the whole response degrades rather than shipping
            # a fabricated zero under a Live badge.
            live=not failed_reads,
            source="verifiedpermissions" if not failed_reads else "verifiedpermissions-partial",
            note=" ".join(note_parts),
        )

    # ─────────────────── Per-store enrichment (each independently graceful) ───────────────────
    #
    # Each returns None when the read actually happened (including a genuine empty result)
    # or a short reason naming the failed call when it did not. Previously every one of
    # these swallowed the error at logger.info and left the model default in place, so a
    # store whose ListPolicies / GetSchema / ListIdentitySources was denied rendered as
    # total_policies=0 / schema_present=False under live=True with no note at all. An
    # unreadable store was indistinguishable from an empty one, and "no policies here" is
    # the reassuring reading of the two - the one that gets believed instead of chased.

    def _enrich_policies(self, vp, psid: str, store: VerifiedPermissionsStore) -> Optional[str]:
        try:
            policies: list = []
            try:
                paginator = vp.get_paginator("list_policies")
                for page in paginator.paginate(policyStoreId=psid):
                    policies.extend(page.get("policies", []))
            except (AttributeError, KeyError, ValueError):
                policies = vp.list_policies(policyStoreId=psid).get("policies", [])

            for p in policies:
                store.total_policies += 1
                effect = (p.get("effect") or "").lower()
                if effect == "permit":
                    store.permit_count += 1
                elif effect == "forbid":
                    store.forbid_count += 1
                ptype = (p.get("policyType") or "").upper()
                if ptype == "STATIC":
                    store.static_count += 1
                elif ptype == "TEMPLATE_LINKED":
                    store.template_linked_count += 1
            return None
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Verified Permissions ListPolicies for store unavailable: %s", e)
            code = e.response.get("Error", {}).get("Code", "") if isinstance(e, ClientError) else ""
            return f"verifiedpermissions:ListPolicies ({code or type(e).__name__})"

    def _enrich_schema(self, vp, psid: str, store: VerifiedPermissionsStore) -> Optional[str]:
        try:
            resp = vp.get_schema(policyStoreId=psid)
            store.schema_present = bool(resp.get("schema"))
            store.schema_namespaces = list(resp.get("namespaces") or [])
            return None
        except ClientError as e:
            # ResourceNotFoundException = store exists but has no schema attached. That is
            # a real measurement of the store, so it stays a success and keeps live=True.
            if "ResourceNotFoundException" in str(e):
                store.schema_present = False
                return None
            logger.info("Verified Permissions GetSchema for store unavailable: %s", e)
            code = e.response.get("Error", {}).get("Code", "")
            return f"verifiedpermissions:GetSchema ({code or type(e).__name__})"
        except (BotoCoreError, KeyError, ValueError) as e:
            logger.info("Verified Permissions GetSchema for store unavailable: %s", e)
            return f"verifiedpermissions:GetSchema ({type(e).__name__})"

    def _enrich_identity_sources(self, vp, psid: str, store: VerifiedPermissionsStore) -> Optional[str]:
        try:
            count = 0
            try:
                paginator = vp.get_paginator("list_identity_sources")
                for page in paginator.paginate(policyStoreId=psid):
                    count += len(page.get("identitySources", []))
            except (AttributeError, KeyError, ValueError):
                count = len(vp.list_identity_sources(policyStoreId=psid).get("identitySources", []))
            store.identity_source_count = count
            return None
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Verified Permissions ListIdentitySources for store unavailable: %s", e)
            code = e.response.get("Error", {}).get("Code", "") if isinstance(e, ClientError) else ""
            return f"verifiedpermissions:ListIdentitySources ({code or type(e).__name__})"

    def _enrich_store_metadata(self, vp, psid: str, store: VerifiedPermissionsStore) -> Optional[str]:
        try:
            resp = vp.get_policy_store(policyStoreId=psid)
            store.cedar_version = resp.get("cedarVersion")
            store.deletion_protection = resp.get("deletionProtection")
            vs = resp.get("validationSettings") or {}
            store.validation_mode = vs.get("mode")
            # Prefer the store-level ARN from GetPolicyStore too — always masked.
            if resp.get("arn"):
                store.arn = mask_arn(resp.get("arn"))
            return None
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.info("Verified Permissions GetPolicyStore for store unavailable: %s", e)
            code = e.response.get("Error", {}).get("Code", "") if isinstance(e, ClientError) else ""
            return f"verifiedpermissions:GetPolicyStore ({code or type(e).__name__})"
