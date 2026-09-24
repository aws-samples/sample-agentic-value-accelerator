"""Govern Governance Posture service — live KMS encryption evidence + preventive SCPs.

Read-through (no DynamoDB). Two live AWS sources:
  - kms:ListKeys + ListAliases + DescribeKey + GetKeyRotationStatus
      → encryption-at-rest evidence (customer- vs AWS-managed keys, rotation)
  - organizations:ListPolicies (SERVICE_CONTROL_POLICY) + ListTargetsForPolicy
      → preventive controls (Service Control Policies) and their attachment

Follows the govern_knowledge_bases / govern_models slice convention: lazy
region-scoped boto3 clients, honest live/source/note flags, a short TTL cache,
and a graceful live=False fallback that NEVER raises.

Organizations note: ListPolicies frequently returns AccessDenied when the
backend account is NOT the Organizations management / delegated-admin account.
That is a legitimate, honest non-live result — reported with an explanatory
note, not surfaced as an error. An account whose only SCP is the AWS-managed
default `FullAWSAccess` is a valid LIVE result (no custom restrictive SCPs).

Account/ARN safety: full account-bearing ARNs are masked before exposure
(core.security_utils.mask_account_id) — the frontend shortens further.
"""

from __future__ import annotations

import logging
import re

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.security_utils import mask_account_id
from core.ttl_cache import get_or_load
from models.govern_governance import (
    AwsKmsInventoryResponse,
    AwsKmsKey,
    AwsResourceInventoryResponse,
    AwsScpPolicy,
    AwsScpResponse,
    AwsTaggedResource,
)

logger = logging.getLogger(__name__)

# Read-through cache TTLs (seconds). Key/policy inventories barely move.
_KMS_TTL = 300  # 5 min
_SCP_TTL = 300  # 5 min
_INVENTORY_TTL = 300  # 5 min

# Bound the per-key describe/rotation fan-out so a large account can't stall a page.
_MAX_KEYS = 100
_MAX_POLICIES = 100
_MAX_RESOURCES = 500

# resourcegroupstaggingapi GetResources returns at most 100 items per page.
_RESOURCES_PER_PAGE = 100

# Services whose very presence marks a resource as part of the AI estate.
_AI_SERVICES = {
    "bedrock",
    "bedrock-agent",
    "bedrock-agentcore",
    "sagemaker",
    "comprehend",
    "textract",
    "transcribe",
    "polly",
    "translate",
    "rekognition",
}

# Tag key/value tokens (case-insensitive, whole-token) that flag a resource as
# AI-related. Whole-token matching (not substring) keeps this deterministic and
# avoids over-tagging (e.g. "email" must not match "ai", "html" must not match "ml").
_AI_TAG_TOKENS = {"ai", "genai", "llm", "bedrock", "agentcore", "sagemaker", "ml", "model", "rag"}

# Split tag text into alphanumeric tokens for whole-token AI matching.
_TOKEN_SPLIT = re.compile(r"[^a-z0-9]+")

# Organizations error codes that mean "not available to this account" rather than a fault.
_ORG_UNAVAILABLE_CODES = {
    "AccessDeniedException",
    "AccessDenied",
    "AWSOrganizationsNotInUseException",
    "OrganizationsNotInUseException",
}


def _err_code(err: Exception) -> str:
    return getattr(err, "response", {}).get("Error", {}).get("Code", "") if hasattr(err, "response") else ""


class GovernGovernanceService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._kms = None
        self._org = None
        self._rgt = None

    def _kms_client(self):
        if self._kms is None:
            self._kms = boto3.client("kms", region_name=self.region)
        return self._kms

    def _org_client(self):
        # Organizations is a global service; endpoints live in us-east-1. Scoping the
        # client to the govern region is harmless (boto3 routes to the global endpoint).
        if self._org is None:
            self._org = boto3.client("organizations", region_name=self.region)
        return self._org

    def _rgt_client(self):
        # resourcegroupstaggingapi is regional — scope it to the govern region so the
        # inventory reflects tagged resources in the account's AI estate region.
        if self._rgt is None:
            self._rgt = boto3.client("resourcegroupstaggingapi", region_name=self.region)
        return self._rgt

    # ─────────────────────────── KMS ───────────────────────────

    def get_kms_inventory(self, max_keys: int = _MAX_KEYS) -> AwsKmsInventoryResponse:
        """Cached wrapper around the live KMS inventory fetch (5 min TTL)."""
        key = f"govern:governance:kms:{self.region}:{max_keys}"
        result, _ = get_or_load(
            key, _KMS_TTL, lambda: self._load_kms_inventory(max_keys),
            should_cache=lambda r: r.live,
        )
        return result

    def _load_kms_inventory(self, max_keys: int) -> AwsKmsInventoryResponse:
        """Live KMS key + alias inventory as encryption-at-rest evidence."""
        client = self._kms_client()
        try:
            # 1) Alias map: TargetKeyId -> display alias (strip the "alias/" prefix).
            #    aliases_total counts every alias in the account (incl. AWS-managed).
            alias_by_key: dict[str, str] = {}
            aliases_total = 0
            try:
                a_paginator = client.get_paginator("list_aliases")
                for page in a_paginator.paginate():
                    for a in page.get("Aliases", []):
                        aliases_total += 1
                        target = a.get("TargetKeyId")
                        name = a.get("AliasName", "")
                        if target and target not in alias_by_key:
                            alias_by_key[target] = name[len("alias/"):] if name.startswith("alias/") else name
            except (ClientError, BotoCoreError) as alias_err:
                logger.debug("kms:ListAliases failed: %s", alias_err)

            # 2) Keys (paginated, capped), enriched with DescribeKey (+ rotation for CMKs).
            keys: list[AwsKmsKey] = []
            customer_managed = aws_managed = with_rotation = 0

            k_paginator = client.get_paginator("list_keys")
            for page in k_paginator.paginate(PaginationConfig={"MaxItems": max_keys}):
                for entry in page.get("Keys", []):
                    key_id = entry.get("KeyId", "")
                    if not key_id:
                        continue

                    manager = ""
                    enabled = False
                    key_spec = None
                    description = None
                    creation_date = None
                    arn = entry.get("KeyArn")
                    rotation_enabled = None

                    try:
                        meta = client.describe_key(KeyId=key_id).get("KeyMetadata", {})
                        manager = meta.get("KeyManager", "") or ""
                        enabled = bool(meta.get("Enabled", False))
                        key_spec = meta.get("KeySpec") or meta.get("CustomerMasterKeySpec")
                        description = meta.get("Description") or None
                        arn = meta.get("Arn", arn)
                        cd = meta.get("CreationDate")
                        creation_date = cd.isoformat() if cd else None
                    except (ClientError, BotoCoreError) as detail_err:
                        logger.debug("kms:DescribeKey %s failed: %s", key_id, detail_err)

                    if manager == "CUSTOMER":
                        customer_managed += 1
                        # Rotation status is only valid for symmetric CMKs; guard others.
                        try:
                            rs = client.get_key_rotation_status(KeyId=key_id)
                            rotation_enabled = bool(rs.get("KeyRotationEnabled", False))
                            if rotation_enabled:
                                with_rotation += 1
                        except (ClientError, BotoCoreError) as rot_err:
                            logger.debug("kms:GetKeyRotationStatus %s unsupported/failed: %s", key_id, rot_err)
                    elif manager == "AWS":
                        aws_managed += 1

                    keys.append(AwsKmsKey(
                        key_id=key_id,
                        alias=alias_by_key.get(key_id),
                        arn=mask_account_id(arn),
                        manager=manager,
                        enabled=enabled,
                        rotation_enabled=rotation_enabled,
                        key_spec=key_spec,
                        description=description,
                        creation_date=creation_date,
                    ))

            keys.sort(key=lambda k: (k.manager != "CUSTOMER", (k.alias or k.key_id).lower()))
            note = None if keys else "No KMS keys returned for this region."
            return AwsKmsInventoryResponse(
                keys=keys,
                total=len(keys),
                customer_managed=customer_managed,
                aws_managed=aws_managed,
                with_rotation=with_rotation,
                aliases_total=aliases_total,
                live=True,
                source="kms:ListKeys + ListAliases + DescribeKey + GetKeyRotationStatus",
                note=note,
            )
        except (ClientError, BotoCoreError) as err:
            code = _err_code(err)
            logger.warning("KMS inventory unavailable (%s): %s", code, err)
            return AwsKmsInventoryResponse(
                live=False,
                source="unavailable-fallback",
                note=f"KMS unreachable or kms:ListKeys not granted ({code or type(err).__name__}).",
            )

    # ─────────────────────────── SCPs ───────────────────────────

    def get_scp_policies(self, max_policies: int = _MAX_POLICIES) -> AwsScpResponse:
        """Cached wrapper around the live SCP fetch (5 min TTL)."""
        key = f"govern:governance:scp:{self.region}:{max_policies}"
        result, _ = get_or_load(
            key, _SCP_TTL, lambda: self._load_scp_policies(max_policies),
            should_cache=lambda r: r.live,
        )
        return result

    def _load_scp_policies(self, max_policies: int) -> AwsScpResponse:
        """Live Service Control Policies (preventive controls) + attachment counts."""
        client = self._org_client()
        try:
            policies: list[AwsScpPolicy] = []
            aws_managed_count = custom_count = 0

            p_paginator = client.get_paginator("list_policies")
            for page in p_paginator.paginate(Filter="SERVICE_CONTROL_POLICY",
                                              PaginationConfig={"MaxItems": max_policies}):
                for p in page.get("Policies", []):
                    pid = p.get("Id", "")
                    if not pid:
                        continue
                    is_managed = bool(p.get("AwsManaged", False))
                    if is_managed:
                        aws_managed_count += 1
                    else:
                        custom_count += 1

                    # Attachment count is best-effort; guard so one failure never blanks the list.
                    attached = None
                    try:
                        count = 0
                        t_paginator = client.get_paginator("list_targets_for_policy")
                        for t_page in t_paginator.paginate(PolicyId=pid):
                            count += len(t_page.get("Targets", []))
                        attached = count
                    except (ClientError, BotoCoreError) as tgt_err:
                        logger.debug("organizations:ListTargetsForPolicy %s failed: %s", pid, tgt_err)

                    policies.append(AwsScpPolicy(
                        id=pid,
                        name=p.get("Name", pid),
                        arn=mask_account_id(p.get("Arn")),
                        description=p.get("Description") or None,
                        aws_managed=is_managed,
                        attached_target_count=attached,
                    ))

            # An org whose only SCP is the AWS-managed default is a valid live result.
            if custom_count == 0:
                note = "Only the AWS-managed default FullAWSAccess SCP is present — no custom restrictive SCPs are defined."
            else:
                note = None
            return AwsScpResponse(
                policies=policies,
                total=len(policies),
                aws_managed_count=aws_managed_count,
                custom_count=custom_count,
                live=True,
                source="organizations:ListPolicies (SERVICE_CONTROL_POLICY) + ListTargetsForPolicy",
                note=note,
            )
        except ClientError as err:
            code = _err_code(err)
            if code in _ORG_UNAVAILABLE_CODES:
                logger.info("Organizations SCPs unavailable to this account (%s)", code)
                return AwsScpResponse(
                    live=False,
                    source="unavailable-fallback",
                    note="Requires AWS Organizations management or delegated-admin access to enumerate Service Control Policies.",
                )
            logger.warning("Organizations ListPolicies failed (%s): %s", code, err)
            return AwsScpResponse(
                live=False,
                source="unavailable-fallback",
                note=f"AWS Organizations call failed ({code or 'ClientError'}).",
            )
        except BotoCoreError as err:
            logger.warning("Organizations unreachable: %s", err)
            return AwsScpResponse(
                live=False,
                source="unavailable-fallback",
                note="AWS Organizations unreachable.",
            )

    # ─────────────────────── AI Estate Inventory ───────────────────────

    def get_resource_inventory(self, max_resources: int = _MAX_RESOURCES) -> AwsResourceInventoryResponse:
        """Cached wrapper around the live tagged-resource inventory fetch (5 min TTL)."""
        key = f"govern:governance:inventory:{self.region}:{max_resources}"
        result, _ = get_or_load(
            key, _INVENTORY_TTL, lambda: self._fetch_resource_inventory(max_resources),
            should_cache=lambda r: r.live,
        )
        return result

    @staticmethod
    def _parse_arn(arn: str) -> tuple[str, str | None, str | None]:
        """Best-effort (service, resource_type, region) from an ARN.

        arn:partition:service:region:account:resource — resource may be
        "type/id", "type:id", or a bare id. Type is taken from the resource
        segment (":" checked before "/" so log-group:/aws/... yields "log-group").
        """
        parts = arn.split(":")
        service = parts[2] if len(parts) > 2 else ""
        region = (parts[3] if len(parts) > 3 else "") or None
        resource_type: str | None = None
        # Everything after the 5th colon is the resource portion (may hold ":" or "/").
        resource = arn.split(":", 5)[5] if arn.count(":") >= 5 else ""
        if ":" in resource:
            resource_type = resource.split(":", 1)[0]
        elif "/" in resource:
            resource_type = resource.split("/", 1)[0]
        return service, (resource_type or None), region

    @staticmethod
    def _is_ai_related(service: str, tags: dict) -> bool:
        """Deterministic AI-estate heuristic: known AI service, or an AI token
        appears as a whole token in any tag key/value."""
        if service in _AI_SERVICES:
            return True
        for key, value in tags.items():
            for text in (key, value):
                if not text:
                    continue
                for token in _TOKEN_SPLIT.split(text.lower()):
                    if token in _AI_TAG_TOKENS:
                        return True
        return False

    def _fetch_resource_inventory(self, max_resources: int) -> AwsResourceInventoryResponse:
        """Live tagged-resource inventory of the AI estate via Resource Groups Tagging.

        Paginates GetResources (PaginationToken), caps total items at max_resources,
        masks account ids in every ARN and tag value, and flags AI-related resources
        deterministically. An empty result in a reachable region is a valid live
        result; a ClientError/BotoCoreError degrades to an honest live=False fallback.
        """
        client = self._rgt_client()
        try:
            resources: list[AwsTaggedResource] = []
            by_service: dict[str, int] = {}
            tag_keys: set[str] = set()
            ai_related = 0
            per_page = max(1, min(_RESOURCES_PER_PAGE, max_resources))
            pagination_token = ""

            while len(resources) < max_resources:
                kwargs = {"ResourcesPerPage": per_page}
                if pagination_token:
                    kwargs["PaginationToken"] = pagination_token
                page = client.get_resources(**kwargs)

                for item in page.get("ResourceTagMappingList", []):
                    arn = item.get("ResourceARN", "") or ""
                    if not arn:
                        continue
                    service, resource_type, region = self._parse_arn(arn)

                    # Mask account ids in both tag keys and values before exposure.
                    tags: dict[str, str] = {}
                    for tag in item.get("Tags", []):
                        raw_key = tag.get("Key", "")
                        if not raw_key:
                            continue
                        masked_key = mask_account_id(raw_key) or raw_key
                        tags[masked_key] = mask_account_id(tag.get("Value", "")) or ""

                    is_ai = self._is_ai_related(service, tags)
                    if is_ai:
                        ai_related += 1
                    by_service[service] = by_service.get(service, 0) + 1
                    tag_keys.update(tags.keys())

                    resources.append(AwsTaggedResource(
                        arn=mask_account_id(arn),
                        service=service,
                        resource_type=resource_type,
                        region=region,
                        ai_related=is_ai,
                        tags=tags,
                    ))
                    if len(resources) >= max_resources:
                        break

                pagination_token = page.get("PaginationToken", "") or ""
                if not pagination_token:
                    break

            # AI-related first, then by service, for a useful default ordering.
            resources.sort(key=lambda r: (not r.ai_related, r.service, r.resource_type or ""))
            note = None if resources else (
                "No tagged resources found in this region — apply tags or enable resource tagging."
            )
            return AwsResourceInventoryResponse(
                resources=resources,
                total=len(resources),
                by_service=dict(sorted(by_service.items(), key=lambda kv: (-kv[1], kv[0]))),
                ai_related=ai_related,
                tag_keys=sorted(tag_keys),
                live=True,
                source="resourcegroupstaggingapi:GetResources",
                note=note,
            )
        except (ClientError, BotoCoreError) as err:
            code = _err_code(err)
            logger.warning("Resource inventory unavailable (%s): %s", code, err)
            return AwsResourceInventoryResponse(
                live=False,
                source="unavailable-fallback",
                note=f"Resource Groups Tagging unreachable or tag:GetResources not granted ({code or type(err).__name__}).",
            )
