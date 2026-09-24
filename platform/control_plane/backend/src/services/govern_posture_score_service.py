"""Govern Posture Score service — calculates overall governance health metric.

Aggregates signals from multiple governance services:
- Harness policy service: policy coverage
- Harness killswitch: killswitch readiness
- Harness audit service: audit completeness
- Operations service (DynamoDB incident + SLA breach store): incident response
- Validation service: validation coverage
- AIDLC service: detection breadth

Uses the TTL cache to avoid repeated expensive calculations. Score is cached
for 5 minutes. Logs calculations to audit trail for compliance.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from core.ttl_cache import get_or_load
from core.harness_killswitch import get_killswitch_status, probe_killswitch_table
from models.govern_posture_score import (
    DIMENSION_CONFIG,
    DimensionFinding,
    DimensionRecommendation,
    DimensionScore,
    PostureDimension,
    PostureGrade,
    PostureHistoryEntry,
    PostureHistoryResponse,
    PostureRecommendation,
    PostureRecommendationsResponse,
    PostureScore,
    PostureTrend,
    UnscoredReason,
    calculate_grade,
)

logger = logging.getLogger(__name__)


# Harness identity is reported in two vocabularies that must be compared as one.
#
#   discovery (AidlcHarnessType, models/govern_aidlc.py:220)
#       claude-code, kiro-ide, kiro-cli, codex-cli, opencode, q-desktop, cursor, copilot
#   policy store (govern_harness_policy.py:57, free-form str)
#       documented as "e.g., claude_code, kiro, codex"
#
# Both are collapsed to a canonical FAMILY key. Several discovery values map to one
# family on purpose: kiro-ide and kiro-cli are two surfaces of the same product, and a
# single `kiro` policy governs both. Add a row here when a new harness is supported;
# an unmapped value falls through to its separator-normalised form, which is the old
# behaviour and is safe (it simply will not match a differently-named policy).
_HARNESS_FAMILY_ALIASES = {
    "claude_code": "claude_code",
    "claude": "claude_code",
    "kiro_ide": "kiro",
    "kiro_cli": "kiro",
    "kiro": "kiro",
    "codex_cli": "codex",
    "codex": "codex",
    "q_desktop": "q_desktop",
    "q_cli": "q_desktop",
    "amazon_q": "q_desktop",
    "github_copilot": "copilot",
    "copilot": "copilot",
    "opencode": "opencode",
    "cursor": "cursor",
}


def _normalize_harness_key(raw: str) -> str:
    """Canonical family key for a harness type from either vocabulary.

    Lowercases and unifies separators first, then applies the family alias table.
    Unmapped values return the separator-normalised form rather than raising, so a
    newly-added harness degrades to "no policy matched" instead of breaking the score.
    """
    if not raw:
        return ""
    key = raw.strip().lower().replace("-", "_").replace(".", "_").replace(" ", "_")
    return _HARNESS_FAMILY_ALIASES.get(key, key)


# Cache TTL for posture score (5 minutes)
_SCORE_TTL = 300
_HISTORY_TTL = 600

# Trailing window for the incident-response dimension, in days. 30 rather than the 7 the
# old CloudTrail-based version used: incidents here are records a human filed, not API
# calls, so they arrive far more sparsely than Bedrock invocations and a 7-day window
# would report "nothing assessed" on an account that handled three incidents last month.
_INCIDENT_WINDOW_DAYS = 30


class GovernPostureScoreService:
    """Service for calculating and retrieving governance posture scores."""

    # In-memory history store (would be DynamoDB in production)
    _history: List[PostureHistoryEntry] = []
    _last_calculation: Optional[datetime] = None

    def __init__(self, region: str = "us-east-1"):
        self.region = region
        # Lazy-load dependent services
        self._harness_policy_svc = None
        self._harness_audit_svc = None
        self._validation_svc = None
        self._aidlc_svc = None
        self._operations_svc = None

    def _get_harness_policy_service(self):
        """Lazy load harness policy service."""
        if self._harness_policy_svc is None:
            try:
                from services.govern_harness_policy_service import GovernHarnessPolicyService
                self._harness_policy_svc = GovernHarnessPolicyService()
            except Exception as e:
                logger.warning(f"Could not load harness policy service: {e}")
        return self._harness_policy_svc

    def _get_harness_audit_service(self):
        """Lazy load harness audit service."""
        if self._harness_audit_svc is None:
            try:
                from services.govern_harness_audit_service import GovernHarnessAuditService
                self._harness_audit_svc = GovernHarnessAuditService()
            except Exception as e:
                logger.warning(f"Could not load harness audit service: {e}")
        return self._harness_audit_svc

    def _get_validation_service(self):
        """Lazy load the validation panel service - a TIER 1 control-plane table.

        GovernValidationService touches exactly one thing: a DynamoDB table
        (govern_validation_service.py:77-78 builds a single boto3 dynamodb resource and
        nothing else). It reads and WRITES it - create_panel, submit_finding, finalize -
        so it is single-region by construction and resolves through
        region_config.table_region(), never through the governed-region tiers. Verified by
        reading the service rather than inferring from the name: there is no Bedrock,
        CloudWatch, or AgentCore call anywhere in it.

        Two defects were stacked here, and BOTH failed silently:

        1. region=self.region. self.region is settings.GOVERN_AWS_REGION - the governed
           FLEET region - because that is what govern_posture_score.py:41 passes in. The
           panel table is control-plane. Measured just now:
           fsi-control-plane-govern-validation-panel exists in us-east-2 and does not
           exist in us-east-1, while the compose file sets AWS_REGION=us-east-2 and
           GOVERN_AWS_REGION=us-east-1. So every panel read went to the region the table
           is not in. This is the same one-field-two-meanings bug already fixed for the
           operations table below, and it is the branch's central defect class precisely
           because a cross-region DynamoDB call does not fail in a way anyone notices.

        2. getattr(settings, 'GOVERN_VALIDATION_TABLE', 'fsi-control-plane-validation').
           There is no GOVERN_VALIDATION_TABLE setting - the real one is
           GOVERN_VALIDATION_PANEL_TABLE_NAME (core/config.py:116), so the getattr ALWAYS
           fell through to its literal default, and that default names a table that exists
           in neither region. The getattr made a hard misconfiguration look like
           defensive coding.

        Why neither surfaced: GovernValidationService.list_panels wraps its scan in a bare
        `except Exception` and falls back to the class-level in-memory `_mem` dict
        (govern_validation_service.py:159-160). A wrong region or a missing table both
        raise, both get swallowed, and `_mem` is empty in a fresh process - so
        _calc_validation_coverage saw total_panels == 0 and returned the NOTHING_ASSESSED
        branch with live=True, source="validation-service", note "No validation panels
        created yet". A broken lookup rendered as a confident, live-badged governance gap.
        There was no exception to catch and no live=False to propagate, which is exactly
        the symptom this tier discipline exists to prevent.
        """
        if self._validation_svc is None:
            try:
                from services.govern_validation_service import GovernValidationService
                from core import region_config
                from core.config import settings

                self._validation_svc = GovernValidationService(
                    table_name=settings.GOVERN_VALIDATION_PANEL_TABLE_NAME,
                    region=region_config.table_region("GOVERN_VALIDATION_PANEL"),
                )
            except Exception as e:
                logger.warning(f"Could not load validation service: {e}")
        return self._validation_svc

    def _get_aidlc_service(self):
        """Lazy load AIDLC service."""
        if self._aidlc_svc is None:
            try:
                from services.govern_aidlc_service import GovernAidlcService
                self._aidlc_svc = GovernAidlcService(region=self.region)
            except Exception as e:
                logger.warning(f"Could not load AIDLC service: {e}")
        return self._aidlc_svc

    def _get_operations_service(self):
        """Lazy load the operations service — the incident and SLA-breach store.

        Replaces the trail (CloudTrail) service that incident_response used to reach
        for. CloudTrail records AI *API calls*; an incident is a record a human filed
        about something going wrong. Scoring incident response off a Bedrock
        invocation count measured the wrong population entirely, and the count was
        only ever a denominator for a hardcoded 0.8 multiplier anyway.
        """
        if self._operations_svc is None:
            try:
                from services.govern_operations_service import GovernOperationsService
                from core import region_config
                from core.config import settings

                # region=table_region("GOVERN_OPERATIONS"), NOT self.region.
                #
                # self.region is GOVERN_AWS_REGION - the region of the governed FLEET -
                # because that is what the posture route passes in. The operations TABLE
                # lives somewhere else: measured just now, fsi-control-plane-govern-operations
                # is ACTIVE in us-east-2 and does not exist in us-east-1. Passing self.region
                # would make every query raise ResourceNotFoundException, which _query_items
                # swallows into _table_ok=False - so this dimension would report "operations
                # store unreachable" forever, on an account where the store is up and
                # answering. govern_operations.py:82-97 has the same note for the same reason.
                self._operations_svc = GovernOperationsService(
                    table_name=settings.GOVERN_OPERATIONS_TABLE_NAME,
                    region=region_config.table_region("GOVERN_OPERATIONS"),
                    govern_region=self.region,
                )
            except Exception as e:
                logger.warning(f"Could not load operations service: {e}")
        return self._operations_svc

    def calculate_posture(self) -> PostureScore:
        """Calculate the overall governance posture score with caching.

        Returns cached score if available and fresh (within TTL). Otherwise
        computes new score from all dimension services.
        """
        result, cached_at = get_or_load(
            f"posture-score:{self.region}",
            _SCORE_TTL,
            self._calculate_posture_impl,
            should_cache=lambda r: True,  # Always cache even partial results
        )

        # Mark if result came from cache
        if result.calculated_at and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # (or result.cached_at) would append a stamp per hit and grow the cached
            # note without bound. model_copy swaps only these top-level scalars,
            # leaving the cache entry intact.
            result = result.model_copy(
                update={
                    "cached_at": datetime.fromtimestamp(cached_at, tz=timezone.utc),
                    "note": f"{result.note} | {stamp}" if result.note else stamp,
                }
            )

        return result

    def _calculate_posture_impl(self) -> PostureScore:
        """Internal implementation of posture calculation."""
        now = datetime.now(timezone.utc)
        dimensions: List[DimensionScore] = []
        any_live = False
        all_live = True

        # Calculate each dimension
        for dimension in PostureDimension:
            dim_score = self._calculate_dimension(dimension)
            dim_score.weighted_contribution = (
                dim_score.score * dim_score.weight if dim_score.score is not None else None
            )
            dimensions.append(dim_score)
            if dim_score.live:
                any_live = True
            else:
                all_live = False

        # Calculate overall score over SCORED dimensions only, renormalised by their
        # weight. Dividing by the full weight while unmeasured dimensions contributed an
        # arbitrary midpoint meant half of this graded score was invented - measured on the
        # reference account, audit_completeness (0.20), validation_coverage (0.15) and
        # killswitch_ready (0.15) all reported zero items assessed.
        #
        # The population of this mean is unchanged (score is not None). What changed is which
        # dimensions can BE in it: every exception handler in this file used to substitute an
        # invented score rather than None, so a dimension that failed outright still landed in
        # the numerator AND the denominator. Measured on the reference account before this
        # change, on one request: killswitch_ready, incident_response and detection_breadth all
        # raised; killswitch returned None correctly, but incident_response returned 75.0 (with
        # a fabricated items_assessed=10 / items_compliant=7) and detection_breadth returned
        # 33.3. The response was 79.2 (C) at measured_weight_pct=50.0, and
        #   (0.25*100.0 + 0.15*75.0 + 0.10*33.3) / 0.50 = 79.2
        # reproduces it exactly - so half of the "measured" half was invention, and the only
        # dimension with anything behind it was policy_coverage at 0.25.
        scored = [d for d in dimensions if d.score is not None]
        measured_weight = sum(d.weight for d in scored)
        # Provenance is tracked separately from completeness. measured_weight_pct answers "how
        # much of the model is in this number"; it counts a score derived from seeded data the
        # same as one read from an AWS API, which is how a detection_breadth computed off a
        # mock harness inventory passed as measured. live_weight_pct answers "how much of it
        # was actually observed", and the gap between the two is the honest caveat.
        live_scored_weight = sum(d.weight for d in scored if d.live)
        total_weight = sum(d.weight for d in dimensions)
        overall_score = (
            round(sum(d.weighted_contribution or 0.0 for d in scored) / measured_weight, 1)
            if measured_weight > 0
            else 0.0
        )
        measured_weight_pct = round((measured_weight / total_weight * 100), 1) if total_weight > 0 else 0.0
        live_weight_pct = round((live_scored_weight / total_weight * 100), 1) if total_weight > 0 else 0.0
        unmeasured = [d.dimension.value for d in dimensions if d.score is None]
        failed = [
            d.dimension.value
            for d in dimensions
            if d.unscored_reason == UnscoredReason.CALCULATION_FAILED
        ]
        nothing_assessed = [
            d.dimension.value
            for d in dimensions
            if d.unscored_reason == UnscoredReason.NOTHING_ASSESSED
        ]
        seeded_scored = [d.dimension.value for d in scored if not d.live]

        grade, grade_label = calculate_grade(overall_score)

        # Determine trend from history
        trend, trend_delta = self._calculate_trend(overall_score)

        # Store in history
        self._store_history_entry(overall_score, grade, dimensions)

        # Build source summary
        sources = list(set(d.source for d in dimensions))
        source_summary = ", ".join(sources[:3])
        if len(sources) > 3:
            source_summary += f" +{len(sources)-3} more"

        # Build note if any caveats.
        #
        # Ordered worst-first and each caveat named separately, because the previous single
        # line ("N of 6 dimensions not scored") could not say which of two very different
        # things had happened, and the frontend tooltip that renders it asserts the wrong one
        # ("These assessed no items"). A dimension that raised is a broken integration; a
        # dimension with nothing to assess is a governance gap. Same None, opposite fix.
        notes = []
        if measured_weight <= 0:
            notes.append(
                "NOT A MEASUREMENT: no dimension produced a score, so overall_score=0.0 and "
                "grade F are placeholders required by the response schema, not findings"
            )
        if failed:
            notes.append(
                f"{len(failed)} of {len(dimensions)} dimensions FAILED to compute and are "
                f"excluded from the score: {', '.join(failed)}"
            )
        if nothing_assessed:
            notes.append(
                f"{len(nothing_assessed)} of {len(dimensions)} dimensions assessed nothing "
                f"and are excluded from the score: {', '.join(nothing_assessed)}"
            )
        if measured_weight_pct < 100:
            notes.append(f"Graded on {measured_weight_pct:.0f}% of the dimension weight")
        if seeded_scored:
            notes.append(
                f"Only {live_weight_pct:.0f}% of total weight came from live AWS reads; "
                f"scored from seeded or fallback data: {', '.join(seeded_scored)}"
            )

        logger.info(
            "Posture score calculated: %.1f (%s), trend=%s (%+.1f), "
            "graded on %.0f%% of weight (%.0f%% live), failed=%s, nothing_assessed=%s",
            overall_score, grade.value, trend.value, trend_delta,
            measured_weight_pct, live_weight_pct,
            ",".join(failed) or "none", ",".join(nothing_assessed) or "none",
        )

        return PostureScore(
            overall_score=overall_score,
            grade=grade,
            grade_label=grade_label,
            dimensions=dimensions,
            trend=trend,
            trend_delta=trend_delta,
            calculated_at=now,
            live=all_live,
            partial_live=any_live and not all_live,
            source=source_summary,
            measured_weight_pct=measured_weight_pct,
            live_weight_pct=live_weight_pct,
            unmeasured_dimensions=unmeasured,
            failed_dimensions=failed,
            note="; ".join(notes) if notes else None,
        )

    def _calculate_dimension(self, dimension: PostureDimension) -> DimensionScore:
        """Calculate score for a single dimension."""
        config = DIMENSION_CONFIG[dimension]

        if dimension == PostureDimension.POLICY_COVERAGE:
            return self._calc_policy_coverage()
        elif dimension == PostureDimension.KILLSWITCH_READY:
            return self._calc_killswitch_ready()
        elif dimension == PostureDimension.AUDIT_COMPLETENESS:
            return self._calc_audit_completeness()
        elif dimension == PostureDimension.INCIDENT_RESPONSE:
            return self._calc_incident_response()
        elif dimension == PostureDimension.VALIDATION_COVERAGE:
            return self._calc_validation_coverage()
        elif dimension == PostureDimension.DETECTION_BREADTH:
            return self._calc_detection_breadth()

        # Fallback for unknown dimension
        return DimensionScore(
            dimension=dimension,
            label=config["label"],
            description=config["description"],
            # None, not 50: a dimension this service does not know how to calculate has no
            # score, and half marks would quietly prop up the overall figure.
            score=None,
            unscored_reason=UnscoredReason.CALCULATION_FAILED,
            weight=config["weight"],
            live=False,
            source="fallback",
            note="Unknown dimension — this service has no calculator for it, so it is not scored",
        )

    def _calc_policy_coverage(self) -> DimensionScore:
        """Calculate policy coverage dimension: % of harnesses with policies."""
        config = DIMENSION_CONFIG[PostureDimension.POLICY_COVERAGE]
        findings: List[DimensionFinding] = []
        recommendations: List[DimensionRecommendation] = []

        try:
            svc = self._get_harness_policy_service()
            if svc:
                policies = svc.list_policies()
                total_policies = policies.total
                enabled_policies = sum(1 for p in policies.policies if p.enabled)

                # Also check AIDLC for discovered harnesses
                aidlc_svc = self._get_aidlc_service()
                if aidlc_svc:
                    harnesses_resp, _ = aidlc_svc.discover_harnesses(days=7)
                    total_harness_types = len(harnesses_resp.harnesses)
                    # Check which harness types have policies.
                    #
                    # The two sides use genuinely DIFFERENT vocabularies, not just
                    # different separators. Discovery emits AidlcHarnessType values
                    # (claude-code, kiro-ide, kiro-cli, codex-cli, q-desktop, ...) while
                    # the policy store keys by product FAMILY - its own field doc says
                    # "e.g., claude_code, kiro, codex" (govern_harness_policy.py:57).
                    #
                    # A plain "-" -> "_" replace only bridges claude-code -> claude_code.
                    # kiro-ide became kiro_ide and never matched a `kiro` policy;
                    # codex-cli never matched `codex`. Two of the four harness types
                    # discovered in this account were therefore reported as
                    # "detected but has no policy" at -10 points each, on a dimension
                    # carrying 25% of the posture score, no matter what policies existed.
                    #
                    # Mapped explicitly because the relationship is semantic: kiro-ide and
                    # kiro-cli are two surfaces of ONE product that one policy covers.
                    # String munging cannot know that.
                    policy_types = set(
                        _normalize_harness_key(p.harness_type)
                        for p in policies.policies if p.enabled
                    )
                    discovered_types = set(
                        _normalize_harness_key(h.harness_type.value)
                        for h in harnesses_resp.harnesses
                    )
                    covered = len(discovered_types & policy_types)
                    uncovered = discovered_types - policy_types

                    # Each uncovered harness type costs exactly its share of the dimension:
                    # score is covered/total*100, so one gap out of four is 25 points, not the
                    # flat -10 this used to report. -10 was a severity rating dressed as a
                    # score delta, which is the ambiguity that let DimensionFinding.impact
                    # drift to a -10..10 bound that the honest producers could not satisfy.
                    per_type_points = round(100.0 / max(total_harness_types, 1), 1)
                    for ut in list(uncovered)[:5]:
                        findings.append(DimensionFinding(
                            item=ut,
                            status="missing",
                            detail=f"Harness type '{ut}' detected but has no policy",
                            impact=-per_type_points,
                        ))
                        recommendations.append(DimensionRecommendation(
                            action=f"Create policy for {ut} harness type",
                            impact=f"+{per_type_points} points",
                            effort="medium",
                            priority=1,
                        ))

                    if total_harness_types == 0:
                        # None, not "100 if any policy exists else 50". Coverage is a ratio and
                        # discovery found no harnesses, so there is no denominator. Awarding
                        # 100 for "nothing was detected and some policy exists" scored the
                        # absence of evidence as perfect compliance - and an account where
                        # harness discovery is misconfigured looks exactly like one with no
                        # harnesses.
                        return DimensionScore(
                            dimension=PostureDimension.POLICY_COVERAGE,
                            label=config["label"],
                            description=config["description"],
                            score=None,
                            unscored_reason=UnscoredReason.NOTHING_ASSESSED,
                            weight=config["weight"],
                            items_assessed=0,
                            items_compliant=0,
                            live=harnesses_resp.live and policies.live,
                            source="harness-policy,aidlc",
                            note=(
                                "No harness types discovered, so policy coverage has no "
                                f"denominator — not scored ({enabled_policies} enabled "
                                "policies exist, but nothing to apply them to was found)"
                            ),
                        )

                    score = (covered / total_harness_types) * 100

                    return DimensionScore(
                        dimension=PostureDimension.POLICY_COVERAGE,
                        label=config["label"],
                        description=config["description"],
                        score=round(score, 1),
                        weight=config["weight"],
                        findings=findings,
                        recommendations=recommendations,
                        items_assessed=total_harness_types,
                        items_compliant=covered,
                        live=harnesses_resp.live and policies.live,
                        source="harness-policy,aidlc",
                    )

                # No harness discovery available.
                #
                # None, not `min(100, enabled_policies * 15)`. That formula is invented
                # arithmetic: 15 points per policy has no basis, and seven policies would
                # have reported 100% coverage without ever learning what needed covering.
                # Coverage is policies-over-harnesses; with no harness inventory the numerator
                # is knowable and the denominator is not, so the ratio is not computable.
                return DimensionScore(
                    dimension=PostureDimension.POLICY_COVERAGE,
                    label=config["label"],
                    description=config["description"],
                    score=None,
                    unscored_reason=UnscoredReason.CALCULATION_FAILED,
                    weight=config["weight"],
                    items_assessed=0,
                    items_compliant=0,
                    live=False,
                    source="harness-policy",
                    note=(
                        f"Harness discovery unavailable, so coverage cannot be computed — "
                        f"{enabled_policies} of {total_policies} policies are enabled, but "
                        "the set of harnesses they should cover is unknown. Restore the AIDLC "
                        "discovery service to score this dimension."
                    ),
                )

        except Exception as e:
            logger.warning(f"Policy coverage calculation failed: {e}")

        # None, not 50. The exception path verified nothing, so there is no coverage figure -
        # only the knowledge that we could not get one. A literal 50 on the heaviest dimension
        # (0.25) put a quarter of a graded posture score behind a number no service produced,
        # and counted it inside measured_weight_pct as though it had been measured.
        return DimensionScore(
            dimension=PostureDimension.POLICY_COVERAGE,
            label=config["label"],
            description=config["description"],
            score=None,
            unscored_reason=UnscoredReason.CALCULATION_FAILED,
            weight=config["weight"],
            live=False,
            source="fallback",
            note="Policy coverage calculation failed — dimension not scored",
            recommendations=[
                DimensionRecommendation(
                    action="Configure harness policy service",
                    impact="+50 points potential",
                    effort="medium",
                    priority=1,
                )
            ],
        )

    def _calc_killswitch_ready(self) -> DimensionScore:
        """Calculate killswitch readiness: is emergency shutoff configured?"""
        config = DIMENSION_CONFIG[PostureDimension.KILLSWITCH_READY]
        findings: List[DimensionFinding] = []
        recommendations: List[DimensionRecommendation] = []

        try:
            status = get_killswitch_status()

            # Score based on killswitch configuration:
            # - DynamoDB table exists: +40
            # - Env var method available: +20
            # - Sentinel file method available: +20
            # - Currently not accidentally triggered: +20
            score = 0.0
            checks_passed = 0
            total_checks = 4

            # Probe the DynamoDB source for real.
            #
            # This used to be inferred as
            #     status.source == KillswitchSource.DYNAMODB or not status.disabled
            # which is unconditionally True whenever the kill-switch is NOT triggered, i.e.
            # in normal operation. So the dimension awarded itself 40 of 100 points for a
            # check it never performed, under the finding text "DynamoDB kill-switch source
            # is available". Measured just now, fsi-control-plane-harness-killswitch exists
            # in neither us-east-1 nor us-east-2 - the claim was false on the very account
            # the dashboard reports on. The left operand cannot help either:
            # status.source == DYNAMODB only when the kill-switch is currently TRIGGERED via
            # DynamoDB, so the healthy case can never satisfy it. And `not status.disabled`
            # is already scored below as the current_state check, so the same boolean was
            # carrying 60 of the 100 points.
            #
            # Reachability is not observable from KillswitchStatus at all
            # (_check_dynamodb returns None for both "absent" and "present but off"), so
            # probe_killswitch_table() looks directly. This whole path had never once
            # executed before - the findings below raised on DimensionFinding.impact's old
            # -10..10 bound - so fixing that bound is what makes this claim reachable, and
            # shipping the inference alongside it would have turned a dimension that failed
            # loudly into one that quietly asserted a false 40 under live=True.
            dynamodb_available, dynamodb_detail = probe_killswitch_table()
            if dynamodb_available:
                score += 40
                checks_passed += 1
                findings.append(DimensionFinding(
                    item="dynamodb",
                    status="ready",
                    detail=dynamodb_detail,
                    impact=40.0,
                ))
            else:
                findings.append(DimensionFinding(
                    item="dynamodb",
                    status="unavailable",
                    detail=dynamodb_detail,
                    impact=0.0,
                ))
                recommendations.append(DimensionRecommendation(
                    action="Configure DynamoDB kill-switch table",
                    impact="+40 points",
                    effort="medium",
                    priority=2,
                ))

            # The next two checks are CONSTANTS, not measurements: core.harness_killswitch
            # always compiles _check_env_var and _check_sentinel_file, so both mechanisms are
            # present in every build and these 40 points can never be withheld. They are a
            # fixed floor under this dimension's score, which means the score's real range is
            # 40-100, not 0-100. The finding text says "mechanism present in this build" rather
            # than the old "is available" so nobody reads a code-path fact as a configuration
            # state. Rebalancing or dropping them is a rubric change - it would move the
            # dimension's meaning for reasons unrelated to the defects being fixed here - so it
            # is deliberately left for a separate decision rather than folded in silently.
            score += 20
            checks_passed += 1
            findings.append(DimensionFinding(
                item="env_var",
                status="ready",
                detail=(
                    "Environment variable kill-switch (AVA_HARNESS_DISABLED) mechanism is "
                    "present in this build — requires no provisioning"
                ),
                impact=20.0,
            ))

            score += 20
            checks_passed += 1
            findings.append(DimensionFinding(
                item="sentinel_file",
                status="ready",
                detail=(
                    "Sentinel file kill-switch (.ava-harness-disabled) mechanism is present in "
                    "this build — requires no provisioning"
                ),
                impact=20.0,
            ))

            # Check that it's not currently triggered (unless intentionally)
            if not status.disabled:
                score += 20
                checks_passed += 1
                findings.append(DimensionFinding(
                    item="current_state",
                    status="enabled",
                    detail="Kill-switch is not currently triggered",
                    impact=20.0,
                ))
            else:
                findings.append(DimensionFinding(
                    item="current_state",
                    status="triggered",
                    detail=f"Kill-switch is active: {status.reason}",
                    impact=0.0,
                ))

            return DimensionScore(
                dimension=PostureDimension.KILLSWITCH_READY,
                label=config["label"],
                description=config["description"],
                score=min(100.0, score),
                weight=config["weight"],
                findings=findings,
                recommendations=recommendations,
                items_assessed=total_checks,
                items_compliant=checks_passed,
                live=True,
                source="harness-killswitch",
                note=(
                    "Two of the four checks (env var, sentinel file) are code-path mechanisms "
                    "present in every build, so 40 points are a fixed floor; only the DynamoDB "
                    "probe and the current trigger state can vary"
                ),
            )

        except Exception as e:
            logger.warning(f"Killswitch readiness check failed: {e}")

        return DimensionScore(
            dimension=PostureDimension.KILLSWITCH_READY,
            label=config["label"],
            description=config["description"],
            # None, not 40. This is the EXCEPTION path - the readiness check threw, so
            # nothing was verified. Awarding 40 of 100 at 0.15 weight meant a failing
            # kill-switch check still contributed to a graded posture score, and the caller
            # could not tell the difference between "partially ready" and "could not check".
            score=None,
            unscored_reason=UnscoredReason.CALCULATION_FAILED,
            weight=config["weight"],
            live=False,
            source="fallback",
            note="Kill-switch service check failed — dimension not scored",
        )

    def _calc_audit_completeness(self) -> DimensionScore:
        """Calculate audit completeness: % of runs with audit artifacts."""
        config = DIMENSION_CONFIG[PostureDimension.AUDIT_COMPLETENESS]
        findings: List[DimensionFinding] = []
        recommendations: List[DimensionRecommendation] = []

        try:
            svc = self._get_harness_audit_service()
            if svc:
                runs = svc.list_runs(limit=100)
                total_runs = len(runs)

                if total_runs == 0:
                    return DimensionScore(
                        dimension=PostureDimension.AUDIT_COMPLETENESS,
                        label=config["label"],
                        description=config["description"],
                        # None, not 50: no harness run has been audited, so there is nothing
                        # to score. A midpoint here put half marks into a graded posture on
                        # the strength of an empty result set.
                        score=None,
                        unscored_reason=UnscoredReason.NOTHING_ASSESSED,
                        weight=config["weight"],
                        items_assessed=0,
                        items_compliant=0,
                        live=True,
                        source="harness-audit",
                        note="No harness runs recorded yet — dimension not scored",
                        recommendations=[
                            DimensionRecommendation(
                                action="Start auditing harness operations",
                                impact="+50 points potential",
                                effort="low",
                                priority=1,
                            )
                        ],
                    )

                # Check runs for completeness (has artifacts and summary)
                complete_runs = 0
                incomplete_runs = []
                for run in runs:
                    if len(run.artifacts) > 0 and run.summary.total_artifacts > 0:
                        complete_runs += 1
                    else:
                        incomplete_runs.append(run.run_id)

                # One incomplete run out of N costs 100/N points, because score is
                # complete_runs/total_runs*100. The old flat -5 was a severity rating in
                # points' clothing: with 100 runs assessed it overstated each run's cost
                # fivefold, and with 5 runs it understated it fourfold.
                per_run_points = round(100.0 / max(total_runs, 1), 1)
                for rid in incomplete_runs[:5]:
                    findings.append(DimensionFinding(
                        item=rid,
                        status="incomplete",
                        detail="Run has no audit artifacts",
                        impact=-per_run_points,
                    ))

                # total_runs == 0 returned above, so no midpoint fallback is needed here. The
                # `else 50.0` that used to sit on this line was unreachable, but an unreachable
                # invented number is still an invitation to reintroduce a reachable one.
                score = (complete_runs / total_runs) * 100

                if score < 80:
                    recommendations.append(DimensionRecommendation(
                        action="Enable audit artifact generation for all harness runs",
                        impact=f"+{round((100-score)*0.8, 0)} points potential",
                        effort="medium",
                        priority=1,
                    ))

                return DimensionScore(
                    dimension=PostureDimension.AUDIT_COMPLETENESS,
                    label=config["label"],
                    description=config["description"],
                    score=round(score, 1),
                    weight=config["weight"],
                    findings=findings,
                    recommendations=recommendations,
                    items_assessed=total_runs,
                    items_compliant=complete_runs,
                    live=True,
                    source="harness-audit",
                )

        except Exception as e:
            logger.warning(f"Audit completeness calculation failed: {e}")

        # None, not 50 — the exception path read no runs, so completeness is unknown. Note the
        # asymmetry with the 0-runs case above: that one reached the audit store and found it
        # empty (a measured zero, live), this one did not get an answer at all.
        return DimensionScore(
            dimension=PostureDimension.AUDIT_COMPLETENESS,
            label=config["label"],
            description=config["description"],
            score=None,
            unscored_reason=UnscoredReason.CALCULATION_FAILED,
            weight=config["weight"],
            live=False,
            source="fallback",
            note="Audit completeness calculation failed — dimension not scored",
        )

    def _calc_incident_response(self) -> DimensionScore:
        """Incident response: share of recorded incidents and SLA breaches responded to.

        Reads the Operations store (DynamoDB, fsi-control-plane-govern-operations).

        What this replaced, and why not simply repairing it:

        The old implementation called `svc.get_candidate_events(days=7)` on
        GovernTrailService, which has no such method - its public surface is
        get_ai_activity() and get_ai_callers(). So it raised AttributeError on that
        line every single time and had never once executed further. Two lines past
        the raise sat the reason that mattered:

            total_incidents = len(candidate_events.events)
            handled_count = int(total_incidents * 0.8)   # "assume 80% are handled"

        The dimension's entire metric was a hardcoded 0.8. Implementing
        get_candidate_events() would have converted a dimension that failed loudly
        into one that quietly reported an invented 80% as a measured governance
        score - strictly worse, and precisely what this branch exists to remove.

        The population was also wrong twice over. CloudTrail "candidate events" are
        AI API calls, not incidents, so the denominator counted Bedrock invocations
        and called them incidents. And nothing in this system stores an
        incident-response SLA: SLATarget covers availability / latency / error_rate /
        throughput only, and even those have no measured value -
        GovernOperationsService._compute_sla_compliance used to return the hardcoded
        99.95 / 150ms / 0.1% and now returns None, because nothing samples an SLA's
        target population over its window. "Within SLA" was therefore never measurable
        for any metric, let alone for incident response, so the claim is dropped rather
        than approximated - see DIMENSION_CONFIG.

        What IS stored and is therefore what this measures: whether each recorded
        incident and SLA breach was responded to at all. Response, not timeliness.
        """
        config = DIMENSION_CONFIG[PostureDimension.INCIDENT_RESPONSE]
        findings: List[DimensionFinding] = []
        recommendations: List[DimensionRecommendation] = []

        try:
            svc = self._get_operations_service()
            if svc:
                from models.govern_operations import IncidentStatus

                incidents_resp = svc.list_incidents(days=_INCIDENT_WINDOW_DAYS, limit=200)
                incidents = incidents_resp.incidents

                # SLA breaches are folded in only when that read is demonstrably live, and
                # `live` from get_sla_breaches now means what it says.
                #
                # It used to be `live = len(items) > 0` there, so an empty-but-reachable
                # breach table and an unreachable one both reported live=False,
                # source="memory". From out here those two states were indistinguishable,
                # so this code had to treat ANY empty breach read as unknown and drop it
                # from the denominator - counting an unknown as zero would let a broken
                # table silently improve the ratio. get_sla_breaches has since been given
                # the same tri-state arms as _fetch_incidents (rows / not-configured /
                # query-failed / measured-zero), so a measured zero arrives as live=True
                # with an empty list and is now correctly included: it adds 0 to both the
                # numerator and the denominator, which is the honest contribution of "we
                # asked and there are no breaches".
                #
                # The exclusion below therefore fires only for the genuinely unknown cases
                # now - table not configured, or the most recent query failed.
                breaches: list = []
                breaches_note = None
                try:
                    breaches_resp = svc.get_sla_breaches(days=_INCIDENT_WINDOW_DAYS)
                    if breaches_resp.live:
                        breaches = list(breaches_resp.breaches)
                    else:
                        breaches_note = (
                            "SLA breaches excluded from the denominator: the breach store "
                            "reported live=False, so its contents are unknown rather than "
                            "empty (store status: "
                            f"{breaches_resp.note or breaches_resp.source})"
                        )
                except Exception as breach_err:  # noqa: BLE001 - one store must not sink both
                    breaches_note = f"SLA breaches could not be read ({type(breach_err).__name__})"

                # An incident has been RESPONDED to once it leaves the untouched OPEN state -
                # someone moved it to investigating / identified / monitoring, or resolved it.
                # update_incident() is the only writer of those transitions and it stamps the
                # timeline, so the transition is a real human action, not an inferred one.
                responded_incidents = [i for i in incidents if i.status != IncidentStatus.OPEN]
                # A breach has been responded to once acknowledged, or ended (breach_end is
                # what resolve_sla_breach sets and is what "resolved" means for a breach).
                responded_breaches = [
                    b for b in breaches if b.acknowledged or b.breach_end is not None
                ]

                total_items = len(incidents) + len(breaches)
                responded_count = len(responded_incidents) + len(responded_breaches)

                if total_items == 0:
                    # None, not 100 and not 0. Same reasoning the CloudTrail version already
                    # carried and the only part of it worth keeping: an empty window is also
                    # what an unused tracker looks like, and a perfect score for an empty
                    # result rewards the absence of evidence.
                    #
                    # live comes from incidents_resp, so a measured zero from a reachable
                    # DynamoDB table is still LIVE data - "we asked and there are none" is a
                    # measurement. It is source/note that say the store is empty, never `live`.
                    # Measured just now against the demo account, this is the live state:
                    # /govern/operations/incidents?days=30 returns live=true, source=dynamodb,
                    # 0 rows, note "No incidents recorded in the Operations store."
                    note = (
                        f"No incidents recorded in the Operations store in the past "
                        f"{_INCIDENT_WINDOW_DAYS} days — not scored, because an empty tracker "
                        f"and a tracker nobody files into look identical from here. "
                        f"Store status: {incidents_resp.note or incidents_resp.source}. "
                        f"Timeliness is not part of this dimension either way: no "
                        f"incident-response SLA target is stored anywhere in this system."
                    )
                    if breaches_note:
                        note = f"{note} {breaches_note}."
                    return DimensionScore(
                        dimension=PostureDimension.INCIDENT_RESPONSE,
                        label=config["label"],
                        description=config["description"],
                        score=None,
                        unscored_reason=UnscoredReason.NOTHING_ASSESSED,
                        weight=config["weight"],
                        items_assessed=0,
                        items_compliant=0,
                        live=incidents_resp.live,
                        source=incidents_resp.source,
                        note=note,
                        recommendations=[
                            DimensionRecommendation(
                                action="Record incidents in the Operations Hub as they occur",
                                impact="Makes this dimension scoreable",
                                effort="low",
                                priority=1,
                            )
                        ],
                    )

                # Each unresponded item costs its share of the dimension, on the same
                # points-of-100 scale as every other finding in this file.
                per_item_points = round(100.0 / total_items, 1)
                for inc in [i for i in incidents if i.status == IncidentStatus.OPEN][:5]:
                    findings.append(DimensionFinding(
                        item=inc.id,
                        status="unresponded",
                        detail=(
                            f"{inc.severity.value} incident '{inc.title}' is still open with no "
                            f"status change recorded"
                        ),
                        impact=-per_item_points,
                    ))
                for br in [
                    b for b in breaches if not b.acknowledged and b.breach_end is None
                ][:5]:
                    findings.append(DimensionFinding(
                        item=br.id,
                        status="unresponded",
                        detail=(
                            f"SLA breach on '{br.sla_name}' is neither acknowledged nor resolved"
                        ),
                        impact=-per_item_points,
                    ))

                score = (responded_count / total_items) * 100

                if score < 100:
                    recommendations.append(DimensionRecommendation(
                        action="Acknowledge or resolve the open incidents and SLA breaches",
                        impact=f"+{round(100 - score, 1)} points",
                        effort="low",
                        priority=1,
                    ))

                # Truncation has to be visible: list_incidents paginates, so with more than
                # `limit` incidents in the window the ratio describes a page, not the window.
                notes = [
                    "Measures whether each item was responded to, NOT whether it was "
                    "responded to within a target time — no incident-response SLA is stored "
                    "in this system, so timeliness is unmeasurable here.",
                    f"Population: {len(incidents)} incidents + {len(breaches)} SLA breaches "
                    f"over {_INCIDENT_WINDOW_DAYS} days.",
                ]
                if incidents_resp.total > len(incidents):
                    notes.append(
                        f"Only the first {len(incidents)} of {incidents_resp.total} incidents in "
                        f"the window were assessed, so this is a page, not the whole window."
                    )
                if breaches_note:
                    notes.append(f"{breaches_note}.")
                if incidents_resp.note:
                    notes.append(f"Store status: {incidents_resp.note}")

                return DimensionScore(
                    dimension=PostureDimension.INCIDENT_RESPONSE,
                    label=config["label"],
                    description=config["description"],
                    score=round(score, 1),
                    weight=config["weight"],
                    findings=findings,
                    recommendations=recommendations,
                    items_assessed=total_items,
                    items_compliant=responded_count,
                    live=incidents_resp.live,
                    source=incidents_resp.source,
                    note=" ".join(notes),
                )

        except Exception as e:
            logger.warning(f"Incident response calculation failed: {e}")

        # None, not 75 with a fabricated items_assessed=10 / items_compliant=7 under
        # source="mock-fallback". Because the old happy path always raised AttributeError, this
        # branch WAS the dimension: measured on the reference account it contributed 75.0 at
        # 0.15 weight to a 79.2 score, inside a measured_weight_pct that claimed 50% of the
        # model had been measured. Ten incidents that do not exist were reported as assessed.
        return DimensionScore(
            dimension=PostureDimension.INCIDENT_RESPONSE,
            label=config["label"],
            description=config["description"],
            score=None,
            unscored_reason=UnscoredReason.CALCULATION_FAILED,
            weight=config["weight"],
            items_assessed=0,
            items_compliant=0,
            live=False,
            source="fallback",
            note=(
                "Operations store could not be read, so incident response is not scored. "
                "Populated by incidents and SLA breaches in the DynamoDB table named by "
                "GOVERN_OPERATIONS_TABLE_NAME, in the region resolved by "
                "region_config.table_region('GOVERN_OPERATIONS')."
            ),
        )

    def _calc_validation_coverage(self) -> DimensionScore:
        """Calculate validation coverage: % of high-risk ops with panel review."""
        config = DIMENSION_CONFIG[PostureDimension.VALIDATION_COVERAGE]
        findings: List[DimensionFinding] = []
        recommendations: List[DimensionRecommendation] = []

        try:
            svc = self._get_validation_service()
            if svc:
                panels = svc.list_panels(limit=100)
                total_panels = len(panels)

                if total_panels == 0:
                    return DimensionScore(
                        dimension=PostureDimension.VALIDATION_COVERAGE,
                        label=config["label"],
                        description=config["description"],
                        # None, not 50 — same reasoning as audit_completeness above.
                        score=None,
                        unscored_reason=UnscoredReason.NOTHING_ASSESSED,
                        weight=config["weight"],
                        items_assessed=0,
                        items_compliant=0,
                        live=True,
                        source="validation-service",
                        note="No validation panels created yet — dimension not scored",
                        recommendations=[
                            DimensionRecommendation(
                                action="Create validation panels for high-risk operations",
                                impact="+50 points potential",
                                effort="medium",
                                priority=2,
                            )
                        ],
                    )

                # Count finalized panels
                finalized = sum(1 for p in panels if p.finalized_at is not None)
                # Count passed panels
                passed = sum(
                    1 for p in panels
                    if p.final_verdict and p.final_verdict.value == "validated"
                )

                # One pending panel out of N costs 100/N points — score is
                # finalized/total_panels*100. Flat -5 was a severity rating, not a score delta.
                per_panel_points = round(100.0 / max(total_panels, 1), 1)
                for panel in panels[:5]:
                    if not panel.finalized_at:
                        findings.append(DimensionFinding(
                            item=panel.panel_id,
                            status="pending",
                            detail=f"Validation panel for {panel.target_type.value} pending review",
                            impact=-per_panel_points,
                        ))

                # total_panels == 0 returned above; the old `else 50.0` here was unreachable.
                score = (finalized / total_panels) * 100

                if score < 80:
                    recommendations.append(DimensionRecommendation(
                        action="Complete pending validation panel reviews",
                        impact=f"+{round((100-score)*0.6, 0)} points",
                        effort="medium",
                        priority=2,
                    ))

                return DimensionScore(
                    dimension=PostureDimension.VALIDATION_COVERAGE,
                    label=config["label"],
                    description=config["description"],
                    score=round(score, 1),
                    weight=config["weight"],
                    findings=findings,
                    recommendations=recommendations,
                    items_assessed=total_panels,
                    items_compliant=finalized,
                    live=True,
                    source="validation-service",
                )

        except Exception as e:
            logger.warning(f"Validation coverage calculation failed: {e}")

        # None, not 60 with a fabricated 5 assessed / 3 compliant. "Using estimated data" was
        # the giveaway: nothing was estimated from anything, the numbers were literals, and
        # they entered the weighted mean at 0.15 as though five panels had been inspected.
        return DimensionScore(
            dimension=PostureDimension.VALIDATION_COVERAGE,
            label=config["label"],
            description=config["description"],
            score=None,
            unscored_reason=UnscoredReason.CALCULATION_FAILED,
            weight=config["weight"],
            items_assessed=0,
            items_compliant=0,
            live=False,
            source="fallback",
            note="Validation panel store could not be read — dimension not scored",
        )

    def _calc_detection_breadth(self) -> DimensionScore:
        """Calculate detection breadth: multi-source detection active."""
        config = DIMENSION_CONFIG[PostureDimension.DETECTION_BREADTH]
        findings: List[DimensionFinding] = []
        recommendations: List[DimensionRecommendation] = []

        try:
            svc = self._get_aidlc_service()
            if svc:
                harnesses_resp, killswitch_active = svc.discover_harnesses(days=7)

                if killswitch_active:
                    return DimensionScore(
                        dimension=PostureDimension.DETECTION_BREADTH,
                        label=config["label"],
                        description=config["description"],
                        # None, not 0. A kill-switch that blocked discovery means detection was
                        # not RUN, not that no source is active - and 0 is the score for "zero
                        # of three sources active", a measured total failure. It also dragged
                        # the weighted mean down while counting inside measured_weight_pct as
                        # though breadth had been assessed.
                        score=None,
                        unscored_reason=UnscoredReason.CALCULATION_FAILED,
                        weight=config["weight"],
                        items_assessed=0,
                        items_compliant=0,
                        live=False,
                        source="killswitch-blocked",
                        note=(
                            "Harness detection blocked by the kill-switch, so no detection "
                            "source could be assessed — not scored"
                        ),
                    )

                # Score based on number of detection sources active
                sources_used = set(harnesses_resp.sources_used) if harnesses_resp.sources_used else set()
                possible_sources = {"cloudtrail", "config_file", "git_commit"}
                # Count the sources that MATCHED possible_sources, not len(sources_used).
                # The findings below are emitted per possible_source, so a value discovery
                # started reporting that is not in possible_sources (a fourth harness signal,
                # say) would have raised the score with no finding to explain it - the score
                # and its own evidence would disagree. min(100, ...) hid that rather than
                # fixing it.
                active = {
                    source
                    for source in possible_sources
                    if any(
                        (s.value if hasattr(s, 'value') else str(s)) == source
                        for s in sources_used
                    )
                }
                active_sources = len(active)

                # 100/3 points per source, on the points-of-dimension-score scale that
                # DimensionFinding.impact now declares. This value - 33.3 - is one of the two
                # that used to blow up validation against the old -10..10 bound and take the
                # whole dimension with it, which is why detection_breadth had never computed.
                per_source_points = round(100.0 / len(possible_sources), 1)
                for source in sorted(possible_sources):
                    if source in active:
                        findings.append(DimensionFinding(
                            item=source,
                            status="active",
                            detail=f"Detection source '{source}' is active",
                            impact=per_source_points,
                        ))
                    else:
                        findings.append(DimensionFinding(
                            item=source,
                            status="inactive",
                            detail=f"Detection source '{source}' is not active",
                            impact=0.0,
                        ))
                        recommendations.append(DimensionRecommendation(
                            action=f"Enable {source} detection source",
                            impact=f"+{per_source_points} points",
                            effort="medium",
                            priority=2,
                        ))

                score = (active_sources / len(possible_sources)) * 100

                return DimensionScore(
                    dimension=PostureDimension.DETECTION_BREADTH,
                    label=config["label"],
                    description=config["description"],
                    score=round(score, 1),
                    weight=config["weight"],
                    findings=findings,
                    recommendations=recommendations,
                    items_assessed=len(possible_sources),
                    items_compliant=active_sources,
                    # Passed straight through from discovery. When discovery is seeded
                    # (source="mock") this dimension is a score computed off seeded input, and
                    # live=False is the only thing that says so - which is why the aggregate
                    # now reports live_weight_pct separately from measured_weight_pct.
                    live=harnesses_resp.live,
                    source=harnesses_resp.source,
                )

        except Exception as e:
            logger.warning(f"Detection breadth calculation failed: {e}")

        # None, not 33.3 with "assuming single source". Assuming is not measuring. Because the
        # 33.3 findings above raised on DimensionFinding.impact's old -10..10 bound, this
        # branch WAS the dimension on every request: measured on the reference account it
        # contributed 33.3 at 0.10 weight to a 79.2 score, and asserted one active detection
        # source that nothing had looked for.
        return DimensionScore(
            dimension=PostureDimension.DETECTION_BREADTH,
            label=config["label"],
            description=config["description"],
            score=None,
            unscored_reason=UnscoredReason.CALCULATION_FAILED,
            weight=config["weight"],
            items_assessed=0,
            items_compliant=0,
            live=False,
            source="fallback",
            note="Harness detection sources could not be enumerated — dimension not scored",
            recommendations=[
                DimensionRecommendation(
                    action="Configure multi-source harness detection",
                    impact="+66 points potential",
                    effort="medium",
                    priority=2,
                )
            ],
        )

    def _calculate_trend(self, current_score: float) -> Tuple[PostureTrend, float]:
        """Calculate trend direction from history."""
        if len(type(self)._history) < 2:
            return PostureTrend.STABLE, 0.0

        # Look at score from ~7 days ago (or oldest available)
        target_time = datetime.now(timezone.utc) - timedelta(days=7)
        old_entry = None
        for entry in type(self)._history:
            if entry.timestamp <= target_time:
                old_entry = entry
                break
        if old_entry is None and type(self)._history:
            old_entry = type(self)._history[-1]

        if old_entry is None:
            return PostureTrend.STABLE, 0.0

        delta = current_score - old_entry.overall_score
        if delta > 5:
            return PostureTrend.IMPROVING, round(delta, 1)
        elif delta < -5:
            return PostureTrend.DEGRADING, round(delta, 1)
        else:
            return PostureTrend.STABLE, round(delta, 1)

    def _store_history_entry(
        self,
        score: float,
        grade: PostureGrade,
        dimensions: List[DimensionScore],
    ) -> None:
        """Store a history entry in memory."""
        entry = PostureHistoryEntry(
            timestamp=datetime.now(timezone.utc),
            overall_score=score,
            grade=grade,
            dimensions={d.dimension.value: d.score for d in dimensions},
        )
        type(self)._history.insert(0, entry)
        # Keep only 90 days of history
        if len(type(self)._history) > 90 * 24:  # Assuming hourly entries max
            type(self)._history = type(self)._history[:90 * 24]

    def get_dimension_details(self, dimension: PostureDimension) -> DimensionScore:
        """Get detailed information about a specific dimension."""
        return self._calculate_dimension(dimension)

    def get_recommendations(self) -> PostureRecommendationsResponse:
        """Get prioritized recommendations to improve the posture score."""
        posture = self.calculate_posture()
        recommendations: List[PostureRecommendation] = []

        # Collect all dimension recommendations
        for dim in posture.dimensions:
            # An unscored dimension has no baseline to project from, so "current 50 ->
            # projected 70" would be arithmetic on an invented starting point. Its
            # recommendation is still worth surfacing, but with no numeric projection.
            if dim.score is None:
                for rec in dim.recommendations:
                    recommendations.append(PostureRecommendation(
                        action=rec.action,
                        dimension=dim.dimension,
                        current_score=None,
                        projected_score=None,
                        overall_impact=round((rec.priority * dim.weight * 10) / 5, 1),
                        effort=rec.effort,
                        priority=rec.priority,
                        reasoning=f"{dim.label} is not scored yet ({dim.note or 'no items assessed'}): {rec.impact}",
                    ))
                continue

            for rec in dim.recommendations:
                # Estimate overall impact based on dimension weight
                estimated_impact = (rec.priority * dim.weight * 10) / 5
                recommendations.append(PostureRecommendation(
                    action=rec.action,
                    dimension=dim.dimension,
                    current_score=dim.score,
                    projected_score=min(100.0, dim.score + float(rec.impact.split('+')[1].split()[0]) if '+' in rec.impact else dim.score + 10),
                    overall_impact=round(estimated_impact, 1),
                    effort=rec.effort,
                    priority=rec.priority,
                    reasoning=f"{dim.label}: {rec.impact}",
                ))

        # Sort by priority then impact
        recommendations.sort(key=lambda r: (r.priority, -r.overall_impact))

        # Calculate projected score if all recommendations implemented
        # Project only from dimensions that have a baseline, renormalised by their weight -
        # matching how overall_score is computed. Including unscored dimensions would project
        # improvement from a number nobody measured.
        scored_dims = [d for d in posture.dimensions if d.score is not None]
        projected_dims = {d.dimension: min(100.0, (d.score or 0.0) + 20) for d in scored_dims}
        scored_weight = sum(d.weight for d in scored_dims)
        projected_score = (
            sum(projected_dims[d.dimension] * d.weight for d in scored_dims) / scored_weight
            if scored_weight > 0
            else 0.0
        )

        projected_grade, _ = calculate_grade(projected_score)

        return PostureRecommendationsResponse(
            recommendations=recommendations[:10],  # Top 10
            current_score=posture.overall_score,
            current_grade=posture.grade,
            projected_score=round(projected_score, 1),
            projected_grade=projected_grade,
            live=posture.live,
            source=posture.source,
        )

    def get_history(self, days: int = 30) -> PostureHistoryResponse:
        """Get posture score history for the specified period."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        entries = [e for e in type(self)._history if e.timestamp >= cutoff]

        if not entries:
            # Generate mock history for demo
            entries = self._generate_mock_history(days)

        current_score = entries[0].overall_score if entries else 70.0
        period_start_score = entries[-1].overall_score if entries else 65.0

        delta = current_score - period_start_score
        if delta > 5:
            trend = PostureTrend.IMPROVING
        elif delta < -5:
            trend = PostureTrend.DEGRADING
        else:
            trend = PostureTrend.STABLE

        return PostureHistoryResponse(
            entries=entries,
            period_days=days,
            current_score=current_score,
            period_start_score=period_start_score,
            trend=trend,
            trend_delta=round(delta, 1),
            live=False,
            source="history-store",
        )

    def _generate_mock_history(self, days: int) -> List[PostureHistoryEntry]:
        """Generate mock history data for demo purposes."""
        import random
        entries = []
        base_score = 65.0
        now = datetime.now(timezone.utc)

        for i in range(days, -1, -1):
            # Gradually improving trend with some noise
            score = base_score + (days - i) * 0.3 + random.uniform(-3, 3)
            score = max(40, min(95, score))
            grade, _ = calculate_grade(score)
            entries.append(PostureHistoryEntry(
                timestamp=now - timedelta(days=i),
                overall_score=round(score, 1),
                grade=grade,
                dimensions={
                    "policy_coverage": round(score + random.uniform(-5, 5), 1),
                    "killswitch_ready": round(score + random.uniform(-10, 10), 1),
                    "audit_completeness": round(score + random.uniform(-5, 5), 1),
                    "incident_response": round(score + random.uniform(-8, 8), 1),
                    "validation_coverage": round(score + random.uniform(-5, 5), 1),
                    "detection_breadth": round(score + random.uniform(-3, 3), 1),
                },
            ))

        return entries
