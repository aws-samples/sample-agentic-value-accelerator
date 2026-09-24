"""Govern Security Hub AI Inventory service — discovers AI workloads via Security Hub.

Queries Security Hub for AI-related resources (Bedrock, SageMaker) to support
the AI asset inventory and shadow AI detection. Follows the govern_cost
convention: honest live/source/note, graceful live=False fallback, TTL cache.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, replace as dataclass_replace
from typing import Callable, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError, ParamValidationError

from core.aws_paging import PageResult, paginate_bounded
from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)

_CACHE_TTL = 300  # 5 min

# Per-request page sizes, set to each API's real maximum rather than a round number.
# A round number here is precisely how this bug class starts: it reads as a performance
# knob, so nobody revisits it, and then it becomes a ceiling on a reported total.
_BEDROCK_MAX = 1000       # bedrock:ListGuardrails maxResults max
_BEDROCK_AGENT_MAX = 1000  # bedrock-agent:ListAgents / ListKnowledgeBases maxResults max
_SAGEMAKER_MAX = 100      # sagemaker:ListEndpoints / ListModels MaxResults max
_SECURITY_HUB_MAX = 100   # securityhub:GetFindings MaxResults max

# Ceiling on Security Hub findings SCANNED for AI resources. The AI test is client-side,
# so this bounds the scan, not the matches - which is why hitting it makes with_findings a
# floor rather than a total.
_MAX_FINDINGS_SCANNED = 2000


@dataclass
class AIAssetSummary:
    """Summary of discovered AI assets from Security Hub."""
    total: int
    bedrock_models: int
    bedrock_agents: int
    bedrock_guardrails: int
    bedrock_knowledge_bases: int
    sagemaker_endpoints: int
    sagemaker_models: int
    with_findings: int
    critical_high: int
    live: bool
    source: str
    note: Optional[str] = None
    # True only when every category was walked to the end of its list, so `total` is an
    # exact count. False means `total` is a FLOOR, and `note` says which category capped.
    complete: bool = True
    # At least one category could not be read. Its 0 is an artifact of the failure, so
    # `total` is an undercount by an unknown amount - and this response must not be cached,
    # because it says nothing about the account for that category.
    degraded: bool = False


class GovernSecurityHubAIService:
    """Service for discovering AI assets via Security Hub and related APIs."""

    # Resource types that indicate AI workloads
    AI_RESOURCE_TYPES = [
        "AwsBedrock",
        "AwsBedrockAgent",
        "AwsBedrockGuardrail",
        "AwsBedrockKnowledgeBase",
        "AwsSageMakerEndpoint",
        "AwsSageMakerModel",
        "AwsSageMakerNotebookInstance",
    ]

    # Keywords in resource IDs/ARNs that indicate AI workloads
    AI_KEYWORDS = ["bedrock", "sagemaker", "ml.", "ai-", "llm", "agent"]

    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._sh = None
        self._bedrock = None

    def _security_hub_client(self):
        if self._sh is None:
            self._sh = boto3.client("securityhub", region_name=self.region)
        return self._sh

    def _bedrock_client(self):
        if self._bedrock is None:
            self._bedrock = boto3.client("bedrock", region_name=self.region)
        return self._bedrock

    def get_ai_inventory(self) -> AIAssetSummary:
        """Get cached AI asset inventory (5 min TTL)."""
        # should_cache rejects a degraded read, not a falsy one. A measured zero from
        # reachable Bedrock/SageMaker IS live data and must cache; a zero produced by an
        # AccessDenied on one category must not, because it says nothing about the account
        # and would then be served as "0 AI assets" for the whole TTL. Truthiness
        # (`bool(r.total)`) cannot tell those two apart, which is why `degraded` exists.
        result, cached_at = get_or_load(
            f"security_hub_ai:inventory:{self.region}",
            _CACHE_TTL,
            self._fetch_ai_inventory,
            should_cache=lambda r: r.live and not r.degraded,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # AIAssetSummary is a @dataclass, not a pydantic BaseModel, so it has no
            # model_copy — calling it raised AttributeError on every cache hit, which
            # only reproduced on the SECOND request inside a TTL window (the block is
            # guarded on cached_at being >= 2s old), so a single cold call never hit it.
            # dataclasses.replace is the equivalent: a shallow copy that swaps this one
            # top-level scalar and leaves the cached instance and its nested lists intact.
            result = dataclass_replace(
                result,
                note=f"{result.note} · {stamp}" if result.note else stamp,
            )
        return result

    @staticmethod
    def _guarded(label: str, read: Callable[[], PageResult]) -> PageResult:
        """Run one inventory read so that a failure lands as FAILED, never as a silent 0.

        This replaces six `except Exception: pass` blocks. Under those, a category that
        errored contributed 0 to the sum and was indistinguishable from a category that was
        genuinely empty - so `total` was reported as "N AI assets discovered" when it could
        be an undercount caused entirely by errors.

        `paginate_bounded` already reports every ClientError / BotoCoreError as
        `failed`; this wrapper covers what it cannot, namely client construction (a bad
        region or a missing endpoint raises before any request) and an unexpected response
        shape. ParamValidationError still propagates: it means THIS code built a malformed
        request, and reporting our own bug as a failed AWS integration would hide it.
        """
        try:
            return read()
        except ParamValidationError:
            raise
        except Exception as e:  # noqa: BLE001 - narrowed by the re-raise above
            logger.warning("AI inventory read '%s' failed: %s", label, e)
            return PageResult(items=[], failed=True, error=str(e), op=label)

    def _bedrock_models(self) -> PageResult:
        """Foundation models. Not paged, and correctly so.

        `bedrock:ListFoundationModels` takes no maxResults and its response shape carries no
        token (verified on botocore 1.43.10: output is `modelSummaries` alone), so one call
        returns the whole list. This count was never capped.
        """
        resp = self._bedrock_client().list_foundation_models()
        return PageResult(items=list(resp.get("modelSummaries") or []), op="list_foundation_models")

    def _fetch_ai_inventory(self) -> AIAssetSummary:
        """Fetch AI asset inventory from Security Hub and Bedrock APIs.

        Every count below is paged to completion within a bound. Before, each was one
        capped page: six `maxResults=50` reads summed into a `total` presented as
        "N AI assets discovered", so an account with 60 SageMaker models reported 50 and
        nothing anywhere said the number was short.
        """
        bedrock_agent = None

        def _agent_client():
            nonlocal bedrock_agent
            if bedrock_agent is None:
                bedrock_agent = boto3.client("bedrock-agent", region_name=self.region)
            return bedrock_agent

        # (count key, human label, read). Each read pages to the end of its list.
        readers: list[tuple[str, str, Callable[[], PageResult]]] = [
            ("bedrock_models", "Bedrock foundation models", self._bedrock_models),
            ("bedrock_guardrails", "Bedrock guardrails", lambda: paginate_bounded(
                self._bedrock_client(), "list_guardrails", "guardrails",
                page_size=_BEDROCK_MAX)),
            ("bedrock_agents", "Bedrock agents", lambda: paginate_bounded(
                _agent_client(), "list_agents", "agentSummaries",
                page_size=_BEDROCK_AGENT_MAX)),
            ("bedrock_knowledge_bases", "Bedrock knowledge bases", lambda: paginate_bounded(
                _agent_client(), "list_knowledge_bases", "knowledgeBaseSummaries",
                page_size=_BEDROCK_AGENT_MAX)),
            ("sagemaker_endpoints", "SageMaker endpoints", lambda: paginate_bounded(
                boto3.client("sagemaker", region_name=self.region),
                "list_endpoints", "Endpoints", page_size=_SAGEMAKER_MAX)),
            ("sagemaker_models", "SageMaker models", lambda: paginate_bounded(
                boto3.client("sagemaker", region_name=self.region),
                "list_models", "Models", page_size=_SAGEMAKER_MAX)),
        ]

        reads: dict[str, PageResult] = {}
        labels: dict[str, str] = {}
        for key, label, read in readers:
            reads[key] = self._guarded(label, read)
            labels[key] = label

        counts = {key: len(r.items) for key, r in reads.items()}
        sh_findings, critical_high, sh_read = self._ai_findings()

        total = sum(counts.values())
        floors = sorted(labels[k] for k, r in reads.items() if r.truncated or r.timed_out)
        failures = sorted(labels[k] for k, r in reads.items() if r.failed)

        # A category is "measured" when its read did not fail. At least one such category is
        # what makes this response live - NOT `total > 0`, which would call an all-failed
        # read live the moment any other source happened to return something, and not the
        # old `len(sources) > 0` either, since `sources` was appended unconditionally after
        # the inner try blocks and so was non-empty even when all six reads had failed.
        bedrock_ok = any(not reads[k].failed for k in
                         ("bedrock_models", "bedrock_guardrails", "bedrock_agents",
                          "bedrock_knowledge_bases"))
        sagemaker_ok = any(not reads[k].failed for k in
                           ("sagemaker_endpoints", "sagemaker_models"))
        sources = []
        # Reached, not "returned findings": Security Hub with zero AI findings is a measured
        # zero and still a source. The old test (`with_findings > 0`) conflated an empty
        # result with an unreachable service.
        if sh_read is not None and not sh_read.failed:
            sources.append("SecurityHub")
        if bedrock_ok:
            sources.append("Bedrock")
        if sagemaker_ok:
            sources.append("SageMaker")

        if sh_read is not None and (sh_read.truncated or sh_read.timed_out):
            floors.append("Security Hub AI findings")
        if sh_read is not None and sh_read.failed:
            failures.append("Security Hub AI findings")

        complete = not floors and not failures
        parts = []
        if total > 0 or not complete:
            parts.append(
                f"{total} AI assets discovered" if complete
                else f"at least {total} AI assets discovered"
            )
        if floors:
            parts.append(
                f"paging stopped at its bound for {', '.join(floors)}, so those counts are "
                "floors"
            )
        if failures:
            parts.append(
                f"{', '.join(failures)} could not be read, so the total is an undercount by "
                "an unknown amount"
            )

        return AIAssetSummary(
            total=total,
            bedrock_models=counts["bedrock_models"],
            bedrock_agents=counts["bedrock_agents"],
            bedrock_guardrails=counts["bedrock_guardrails"],
            bedrock_knowledge_bases=counts["bedrock_knowledge_bases"],
            sagemaker_endpoints=counts["sagemaker_endpoints"],
            sagemaker_models=counts["sagemaker_models"],
            with_findings=sh_findings,
            critical_high=critical_high,
            live=bool(sources),
            source="+".join(sources) if sources else "none",
            # None on a clean measured zero. A caveat that does not apply is unfalsifiable,
            # and it teaches a reader to ignore the ones that do.
            note="; ".join(parts) if parts else None,
            complete=complete,
            degraded=bool(failures),
        )

    def _ai_findings(self) -> tuple[int, int, Optional[PageResult]]:
        """Count ACTIVE Security Hub findings on AI resources, and the CRITICAL/HIGH subset.

        Returns (ai_finding_count, critical_high_count, read). `read` is None only when the
        Security Hub client itself could not be built.

        The AI test is client-side, so the bound applies to findings SCANNED rather than to
        matches. That is why a truncated scan makes the returned counts floors: the
        unscanned tail may hold more AI findings. The predecessor stopped at 200 matches with
        no disclosure at all.
        """
        try:
            sh = self._security_hub_client()
        except (BotoCoreError, ClientError) as e:
            logger.warning("Security Hub client unavailable: %s", e)
            return 0, 0, None

        read = self._guarded("Security Hub AI findings", lambda: paginate_bounded(
            sh, "get_findings", "Findings",
            max_items=_MAX_FINDINGS_SCANNED,
            page_size=_SECURITY_HUB_MAX,
            Filters={"RecordState": [{"Value": "ACTIVE", "Comparison": "EQUALS"}]},
        ))

        ai_findings = 0
        critical_high = 0
        for finding in read.items:
            for res in finding.get("Resources", []) or []:
                res_type = res.get("Type", "") or ""
                res_id = (res.get("Id", "") or "").lower()
                is_ai = (
                    any(t in res_type for t in ("Bedrock", "SageMaker"))
                    or any(kw in res_id for kw in self.AI_KEYWORDS)
                )
                if is_ai:
                    ai_findings += 1
                    if finding.get("Severity", {}).get("Label", "") in ("CRITICAL", "HIGH"):
                        critical_high += 1
                    break
        return ai_findings, critical_high, read
