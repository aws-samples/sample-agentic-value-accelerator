"""Govern Resource Tags service — real governed denominator + governance-tag coverage.

Live AWS source:
  - resourcegroupstaggingapi:GetResources scoped to AI resource types
    (ResourceTypeFilters = ['bedrock', 'bedrock-agentcore', 'sagemaker']) → the
    account's AI estate (Bedrock agents/guardrails/KBs, AgentCore runtimes/gateways,
    SageMaker domains/endpoints/apps), each with its tag set.

Why this exists — it replaces two fabricated frontend guesses in useLiveKPIs.ts:
  1. governedPct computed as `guardrailsWithMetrics * 3` (a made-up "≈3 agents per
     guardrail" heuristic) over an arbitrary `totalAgents + externalAgents(45)` base.
  2. hardcoded scope/env defaults.

Instead we compute a REAL governed denominator: of the AI resources actually present
in the account, how many carry a governance owner and/or project tag, plus per-dimension
tag coverage (owner / project / env / scope). This is a defensible, auditable number —
governance-tag coverage of the live AI estate — not a multiplier.

Governance dimensions map onto the account's real tag keys (case-insensitive,
whole-key synonyms). Confirmed present in us-east-1 (boto3, live): agentcore:project-name,
agentcore:created-by, agentcore:target-name, Project, project, team, plus AWS-injected
keys (sagemaker:domain-arn, etc.). Standard estate keys (Application, Environment, app,
Component, Purpose, Owner, env) are also recognised.

Response shape (verified live, resourcegroupstaggingapi):
  GetResources → ResourceTagMappingList[]{ResourceARN, Tags[]{Key, Value}}, PaginationToken

Conventions: single boto3 client scoped to settings.GOVERN_AWS_REGION, short TTL cache
via core.ttl_cache.get_or_load (only live results cached), and MANDATORY masking of every
account id / ARN / identity before exposure. Honest live/source/note; degrades to
live=False (never fabricates) when the API is unreachable, not permitted, or the AI
estate is empty (no denominator to compute).
"""

from __future__ import annotations

import logging
import re
from typing import Dict, List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, Field

from core.ttl_cache import get_or_load
from core.security_utils import mask_account_id, mask_arn_in_text, mask_identity

logger = logging.getLogger(__name__)

# Read-through cache TTL (seconds). Tag inventory of the AI estate barely moves.
_TAGS_TTL = 300  # 5 min

# resourcegroupstaggingapi GetResources returns at most 100 items per page.
_RESOURCES_PER_PAGE = 100
_MAX_RESOURCES = 1000

# AI resource-type service prefixes to scope GetResources (ResourceTypeFilters).
# A bare service prefix matches every resource type in that service.
_AI_RESOURCE_TYPES = ["bedrock", "bedrock-agentcore", "sagemaker"]

# ── Governance-tag synonym sets (lower-cased, whole-key match) ──
# A resource "has" a dimension if any of its tag keys matches that dimension's set.
_OWNER_KEYS = {
    "agentcore:created-by", "created-by", "createdby", "created_by",
    "owner", "owned-by", "ownedby", "team", "contact", "contact-email",
    "poc", "maintainer",
}
_PROJECT_KEYS = {
    "agentcore:project-name", "project-name", "projectname", "project",
    "application", "app", "app-name", "appname", "component",
    "service-name", "servicename", "workload", "system",
}
_ENV_KEYS = {
    "environment", "env", "stage", "tier", "deployment-stage", "lifecycle",
}
_SCOPE_KEYS = {
    "agentcore:target-name", "scope", "purpose", "classification",
    "data-classification", "dataclassification", "sensitivity",
    "confidentiality", "business-unit", "businessunit", "domain",
    "cost-center", "costcenter",
}

# Owner tag values can be caller identities (e.g. an assumed-role ARN) — mask harder.
_ARN_LIKE = re.compile(r"arn:aws", re.IGNORECASE)


def _err_code(err: Exception) -> str:
    return getattr(err, "response", {}).get("Error", {}).get("Code", "") if hasattr(err, "response") else ""


def _service_from_arn(arn: str) -> str:
    """service namespace from arn:partition:service:region:account:resource."""
    parts = arn.split(":")
    return parts[2] if len(parts) > 2 else ""


def _region_from_arn(arn: str) -> Optional[str]:
    parts = arn.split(":")
    return (parts[3] if len(parts) > 3 else "") or None


def _resource_type_from_arn(arn: str) -> Optional[str]:
    """Best-effort resource type from the resource segment (type/id or type:id)."""
    resource = arn.split(":", 5)[5] if arn.count(":") >= 5 else ""
    if ":" in resource:
        return resource.split(":", 1)[0] or None
    if "/" in resource:
        return resource.split("/", 1)[0] or None
    return None


def _mask_tag_value(key_lower: str, value: str) -> str:
    """Mask an arbitrary tag value before frontend exposure.

    Always strips account ids. If the value embeds an ARN (e.g.
    sagemaker:domain-arn), reduce it. If the key is an owner/identity dimension,
    additionally collapse it to a masked identity so caller principals never leak.
    """
    v = mask_account_id(value) or ""
    if _ARN_LIKE.search(v):
        v = mask_arn_in_text(v) or v
    if key_lower in _OWNER_KEYS:
        v = mask_identity(v) or v
    return v


class GovernanceTaggedResource(BaseModel):
    """One AI-estate resource with its governance-tag coverage (account id masked)."""

    arn: Optional[str] = Field(None, description="Resource ARN with the 12-digit account id masked")
    service: str = Field("", description="AWS service namespace, e.g. bedrock-agentcore")
    resource_type: Optional[str] = Field(None, description="Resource type segment, e.g. runtime / agent / domain")
    region: Optional[str] = None
    has_owner: bool = False
    has_project: bool = False
    has_env: bool = False
    has_scope: bool = False
    governed: bool = Field(False, description="Carries an owner AND/OR project tag (counts toward governed denominator)")
    tags: Dict[str, str] = Field(default_factory=dict, description="Masked tag key→value set")


class GovernanceResourceTagsResponse(BaseModel):
    """Governed denominator + governance-tag coverage of the live AI estate."""

    resource_types_scanned: List[str] = Field(default_factory=list, description="ResourceTypeFilters used")
    total_ai_resources: int = Field(0, description="AI-estate resources returned by the scoped GetResources")

    with_owner: int = 0
    with_project: int = 0
    with_env: int = 0
    with_scope: int = 0

    owner_coverage_pct: float = Field(0.0, description="% of AI resources carrying an owner tag")
    project_coverage_pct: float = Field(0.0, description="% carrying a project tag")
    env_coverage_pct: float = Field(0.0, description="% carrying an environment tag")
    scope_coverage_pct: float = Field(0.0, description="% carrying a scope/classification tag")

    governance_tagged: int = Field(0, description="Resources carrying at least one governance tag (any dimension)")
    ungoverned: int = Field(0, description="Resources carrying no governance tag at all")
    tag_coverage_pct: float = Field(0.0, description="% carrying at least one governance tag")

    governed_denominator: int = Field(0, description="Resources carrying an owner AND/OR project tag — the real governed base")
    governed_pct: int = Field(0, description="governed_denominator / total_ai_resources, rounded to a whole %")

    by_type: Dict[str, int] = Field(default_factory=dict, description="Count per AI service namespace")
    tag_keys_observed: List[str] = Field(default_factory=list, description="Distinct tag keys seen (masked)")
    sample_resources: List[GovernanceTaggedResource] = Field(
        default_factory=list, description="A capped sample of resources with their coverage (account ids masked)"
    )

    live: bool
    source: str
    note: Optional[str] = None


class GovernResourceTagsService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._rgt = None

    def _rgt_client(self):
        # resourcegroupstaggingapi is regional — scope it to the govern region so the
        # denominator reflects the AI estate in the account's governed region.
        if self._rgt is None:
            self._rgt = boto3.client("resourcegroupstaggingapi", region_name=self.region)
        return self._rgt

    def get_resource_tags(
        self,
        max_resources: int = _MAX_RESOURCES,
        max_samples: int = 25,
    ) -> GovernanceResourceTagsResponse:
        """Cached wrapper around the live governance-tag coverage fetch (5 min TTL).

        Only live results are cached, so a transient AWS failure never poisons the
        cache for the whole TTL.
        """
        key = f"govern:resource-tags:{self.region}:{max_resources}:{max_samples}"
        result, _ = get_or_load(
            key,
            _TAGS_TTL,
            lambda: self._fetch_resource_tags(max_resources, max_samples),
            should_cache=lambda r: r.live,
        )
        return result

    def _fetch_resource_tags(self, max_resources: int, max_samples: int) -> GovernanceResourceTagsResponse:
        """Live governed denominator + governance-tag coverage of the AI estate.

        Paginates the AI-scoped GetResources, classifies each resource against the
        owner/project/env/scope synonym sets, and masks account ids / ARNs / owner
        identities in every exposed field. An empty AI estate degrades to live=False
        (there is no meaningful governed denominator to report) rather than emitting
        a fabricated 0-of-0 percentage; an API/permission failure likewise degrades.
        """
        client = self._rgt_client()
        try:
            total = 0
            with_owner = with_project = with_env = with_scope = 0
            governance_tagged = 0
            governed_denominator = 0
            by_type: Dict[str, int] = {}
            tag_keys: set[str] = set()
            samples: List[GovernanceTaggedResource] = []

            per_page = max(1, min(_RESOURCES_PER_PAGE, max_resources))
            pagination_token = ""

            while total < max_resources:
                kwargs: Dict[str, object] = {
                    "ResourcesPerPage": per_page,
                    "ResourceTypeFilters": _AI_RESOURCE_TYPES,
                }
                if pagination_token:
                    kwargs["PaginationToken"] = pagination_token
                page = client.get_resources(**kwargs)

                for item in page.get("ResourceTagMappingList", []):
                    arn = item.get("ResourceARN", "") or ""
                    if not arn:
                        continue
                    total += 1

                    service = _service_from_arn(arn)
                    by_type[service] = by_type.get(service, 0) + 1

                    # Classify by lower-cased tag keys; mask keys + values for exposure.
                    raw_keys_lower: set[str] = set()
                    masked_tags: Dict[str, str] = {}
                    for tag in item.get("Tags", []):
                        raw_key = tag.get("Key", "")
                        if not raw_key:
                            continue
                        key_lower = raw_key.lower()
                        raw_keys_lower.add(key_lower)
                        masked_key = mask_account_id(raw_key) or raw_key
                        masked_tags[masked_key] = _mask_tag_value(key_lower, tag.get("Value", "") or "")
                        tag_keys.add(masked_key)

                    has_owner = bool(raw_keys_lower & _OWNER_KEYS)
                    has_project = bool(raw_keys_lower & _PROJECT_KEYS)
                    has_env = bool(raw_keys_lower & _ENV_KEYS)
                    has_scope = bool(raw_keys_lower & _SCOPE_KEYS)

                    with_owner += has_owner
                    with_project += has_project
                    with_env += has_env
                    with_scope += has_scope

                    if has_owner or has_project or has_env or has_scope:
                        governance_tagged += 1
                    is_governed = has_owner or has_project
                    if is_governed:
                        governed_denominator += 1

                    if len(samples) < max_samples:
                        samples.append(GovernanceTaggedResource(
                            arn=mask_account_id(arn),
                            service=service,
                            resource_type=_resource_type_from_arn(arn),
                            region=_region_from_arn(arn),
                            has_owner=has_owner,
                            has_project=has_project,
                            has_env=has_env,
                            has_scope=has_scope,
                            governed=is_governed,
                            tags=masked_tags,
                        ))

                    if total >= max_resources:
                        break

                pagination_token = page.get("PaginationToken", "") or ""
                if not pagination_token:
                    break

            # Empty AI estate → honest degrade: no denominator to compute.
            if total == 0:
                return GovernanceResourceTagsResponse(
                    resource_types_scanned=list(_AI_RESOURCE_TYPES),
                    live=False,
                    source="resourcegroupstaggingapi:GetResources",
                    note=(
                        "No AI-estate resources (bedrock / bedrock-agentcore / sagemaker) found in "
                        f"{self.region} — no governed denominator to compute."
                    ),
                )

            def pct(n: int) -> float:
                return round(n / total * 100, 1)

            # Ungoverned = ordered worst-first for a useful default; and note when
            # coverage is perfect vs partial so the UI can be honest either way.
            ungoverned = total - governance_tagged
            note = None
            if governance_tagged < total:
                note = (
                    f"{ungoverned} of {total} AI resources carry no owner/project/env/scope tag "
                    "— apply governance tags to close the gap."
                )
            samples.sort(key=lambda r: (r.governed, r.has_owner, r.has_project, r.service))

            return GovernanceResourceTagsResponse(
                resource_types_scanned=list(_AI_RESOURCE_TYPES),
                total_ai_resources=total,
                with_owner=with_owner,
                with_project=with_project,
                with_env=with_env,
                with_scope=with_scope,
                owner_coverage_pct=pct(with_owner),
                project_coverage_pct=pct(with_project),
                env_coverage_pct=pct(with_env),
                scope_coverage_pct=pct(with_scope),
                governance_tagged=governance_tagged,
                ungoverned=ungoverned,
                tag_coverage_pct=pct(governance_tagged),
                governed_denominator=governed_denominator,
                governed_pct=round(governed_denominator / total * 100),
                by_type=dict(sorted(by_type.items(), key=lambda kv: (-kv[1], kv[0]))),
                tag_keys_observed=sorted(tag_keys),
                sample_resources=samples,
                live=True,
                source="resourcegroupstaggingapi:GetResources",
                note=note,
            )

        except (ClientError, BotoCoreError) as err:
            code = _err_code(err)
            logger.warning("Resource-tag coverage unavailable (%s): %s", code, err)
            return GovernanceResourceTagsResponse(
                resource_types_scanned=list(_AI_RESOURCE_TYPES),
                live=False,
                source="resourcegroupstaggingapi:GetResources",
                note=f"Resource Groups Tagging unreachable or tag:GetResources not granted ({code or type(err).__name__}).",
            )
