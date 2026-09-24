"""Background producer for REAL, telemetry-derived LLM-quality metrics.

The Govern "LLM Quality" dashboard reads the custom CloudWatch namespace
``AVA/LLMQuality`` (via ``govern_llm_quality_service``). When that namespace is
empty the service falls back to ``_MOCK_VALUES`` and reports ``live=False``.
Nothing publishes to the namespace internally, so out of the box the dashboard is
mock.

This module closes that gap. On its own interval (a daemon thread, mirroring
``core/cache_prewarm.py``) it reads the account's LIVE governance telemetry,
derives genuine quality signals from it, and publishes ONLY those signals to the
namespace via the service's existing ``publish_batch(...)`` publisher. Once real
metrics flow, the service's unchanged read path returns ``live=True`` honestly.

Derivation mapping (signal -> dimension):
  - Bedrock evaluation jobs (STRONGEST, most direct) — per-metric mean scores
    parsed from completed jobs' S3 output:
        groundedness / faithfulness -> groundedness
        (context) relevance         -> relevance
        (logical) coherence         -> coherence
        citation precision/coverage -> citation_accuracy
  - Bedrock Guardrails telemetry (AWS/Bedrock/Guardrails):
        ContentPolicy intervention rate            -> harmful_rate
        ContextualGroundingPolicy intervention rate-> groundedness (proxy, ONLY
            used when no completed eval job already gave a direct groundedness)
  - Bedrock invocation-safety telemetry (invocation logs):
        guardrail_intervened rate -> refusal_rate
        output-token sum / calls  -> tokens_per_response

HONESTY (load-bearing): a dimension is published ONLY when the signal that feeds
it is actually LIVE this cycle. No completed eval jobs -> no eval-derived quality
scores. No guardrail invocations -> no harmful_rate / grounding proxy. No
invocation logs -> no refusal_rate / tokens_per_response. Nothing synthetic or
random is ever published. latency_p99 is deliberately NOT published here — the
read path already sources it directly from the AWS/Bedrock namespace.

Best-effort: every signal read is guarded and the whole cycle is wrapped so the
daemon thread never dies. Controlled by GOVERN_LLM_QUALITY_INTERVAL (seconds;
0 = publish once at startup only; <0 = disabled), mirroring GOVERN_PREWARM_INTERVAL.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_DEFAULT_INTERVAL_S = 300  # 5 min — quality telemetry moves slowly; upstream reads are TTL-cached
_STARTUP_DELAY_S = 12      # let uvicorn bind + the first cache pre-warm settle before self-deriving
_MAX_COMPLETED_JOBS = 5    # cap S3 result parses per cycle (results are cached ~30 min upstream)
_EVAL_WINDOW_DAYS = 30     # guardrail telemetry window
_INVOCATION_WINDOW_DAYS = 7


def _norm(metric_name: str) -> str:
    """Normalize a Bedrock eval metric name for matching (drop prefix, punctuation, case)."""
    tail = (metric_name or "").split(".")[-1]
    return tail.lower().replace(" ", "").replace("_", "").replace("-", "")


def _eval_dim_value(metric_name: str):
    """Map a Bedrock eval metric name to a quality-dimension enum value, or None.

    Only the four dimensions that evaluation jobs measure directly are mapped;
    every other metric (accuracy, toxicity, completeness, …) is intentionally
    left unmapped so we never fabricate a dimension from an unrelated score.
    """
    n = _norm(metric_name)
    if "groundedness" in n or "faithful" in n:
        return "groundedness"
    if "citation" in n:
        return "citation_accuracy"
    if "coherence" in n:  # matches "coherence" and "logicalcoherence"
        return "coherence"
    if "relevance" in n:  # matches "relevance", "contextrelevance", "answerrelevance"
        return "relevance"
    return None


def _derive_and_publish(region: str) -> None:
    """Run one derive+publish cycle for a single region. Guarded per-signal."""
    # Lazy imports keep the app-startup import graph clean and avoid any import-time
    # coupling with main.py (matches cache_prewarm's minimal top-level imports).
    from models.govern_llm_quality import (
        LlmQualityDimension as D,
        LlmQualityMetric,
        get_dimension_metadata,
    )
    from services.govern_evals_service import GovernEvalsService
    from services.govern_guardrails_service import GovernGuardrailsService
    from services.govern_invocation_safety_service import GovernInvocationSafetyService
    from services.govern_llm_quality_service import GovernLlmQualityService

    derived: dict = {}     # dimension -> published value
    sources: dict = {}     # dimension -> provenance label (for the log line)
    skipped: list[str] = []

    # --- Signal 1: Bedrock evaluation jobs (direct quality scores, strongest) ---
    try:
        evals = GovernEvalsService(region=region)
        jobs_resp = evals.get_jobs(max_jobs=100)
        if not jobs_resp.live:
            skipped.append("eval quality dims (ListEvaluationJobs not live)")
        else:
            completed = [j for j in jobs_resp.jobs if (j.status or "").lower() == "completed"]
            if not completed:
                skipped.append("eval quality dims (no completed eval jobs)")
            else:
                sums: dict = {}
                counts: dict = {}
                parsed_jobs = 0
                attempted = completed[:_MAX_COMPLETED_JOBS]
                # Why each unread job was unread. get_job_scores_by_name distinguishes
                # job-not-found / no-output / no-results / unavailable-fallback, and that
                # provenance is the ONLY thing separating "we never read a job" from "we
                # read them and they measure other dimensions" further down.
                unreadable: list[str] = []
                for job in attempted:
                    scores = evals.get_job_scores_by_name(job.name)
                    if not scores.live:
                        unreadable.append(scores.source or "unknown")
                        continue
                    parsed_jobs += 1
                    for ms in scores.metrics:
                        dv = _eval_dim_value(ms.metric)
                        if dv is None:
                            continue
                        # Eval means are typically 0-1; scale to Percent. Values already
                        # >1 are treated as an explicit percent. Clamp to [0, 100].
                        val = ms.mean_score * 100.0 if ms.mean_score <= 1.0 else ms.mean_score
                        val = max(0.0, min(100.0, val))
                        weight = max(1, ms.count)
                        sums[dv] = sums.get(dv, 0.0) + val * weight
                        counts[dv] = counts.get(dv, 0) + weight
                if sums:
                    for dv, total_w in counts.items():
                        dim = D(dv)
                        derived[dim] = round(sums[dv] / total_w, 2)
                        sources[dim] = f"bedrock-eval-jobs({parsed_jobs})"
                elif parsed_jobs == 0:
                    # MECHANISM: empty `sums` has two unrelated causes and this branch
                    # used to report only the second one — "completed jobs carry no
                    # groundedness/… metrics", a claim about the CONTENT of the scores.
                    # When parsed_jobs == 0 no job's scores were read at all (S3 results
                    # absent/denied, job unresolvable), so their content is UNKNOWN. The
                    # misattribution failed silently — both causes land on the same empty
                    # dict — and sent an operator debugging "no LLM quality data" to
                    # inspect eval metrics that were never fetched, instead of to the S3
                    # output location and its permissions.
                    reasons = ", ".join(sorted(set(unreadable))) or "unknown"
                    skipped.append(
                        f"eval quality dims (scores unreadable for all {len(attempted)} completed "
                        f"job(s) attempted — content unknown; causes: {reasons})"
                    )
                else:
                    # Scores WERE read here, so the content claim is earned. It still
                    # covers two possibilities that cannot be told apart from an empty
                    # `sums`, so name both rather than assert one.
                    partial = f", {len(unreadable)} unreadable" if unreadable else ""
                    skipped.append(
                        f"eval quality dims (read {parsed_jobs} completed job(s){partial}; their "
                        "scores map to no groundedness/relevance/coherence/citation metric — either "
                        "no metrics were returned or every returned metric is an unmapped dimension)"
                    )
    except Exception as e:  # noqa: BLE001 — best-effort; never crash the cycle
        logger.info("LLM quality producer: eval signal skipped: %s", e)
        skipped.append("eval quality dims (error)")

    # --- Signal 2: Bedrock Guardrails telemetry ---
    try:
        gr = GovernGuardrailsService(region=region).get_telemetry(days=_EVAL_WINDOW_DAYS)
        if gr.live and gr.total_invocations > 0:
            by_policy = {p.policy_type: p.interventions for p in (gr.by_policy or [])}
            content_intv = by_policy.get("ContentPolicy", 0)
            grounding_intv = by_policy.get("ContextualGroundingPolicy", 0)

            # harmful_rate: share of guardrail-checked calls tripping the content policy.
            harmful = max(0.0, min(100.0, content_intv / gr.total_invocations * 100.0))
            derived[D.HARMFUL_RATE] = round(harmful, 2)
            sources[D.HARMFUL_RATE] = "guardrails-ContentPolicy"

            # grounding proxy — 100 minus the contextual-grounding intervention rate.
            # Only when a completed eval job did NOT already give a direct groundedness,
            # so we publish exactly one groundedness datapoint per cycle (eval wins).
            if D.GROUNDEDNESS not in derived:
                grounded = 100.0 - (grounding_intv / gr.total_invocations * 100.0)
                grounded = max(0.0, min(100.0, grounded))
                derived[D.GROUNDEDNESS] = round(grounded, 2)
                sources[D.GROUNDEDNESS] = "guardrails-ContextualGrounding"
        else:
            skipped.append("harmful_rate + grounding proxy (no live guardrail invocations)")
    except Exception as e:  # noqa: BLE001
        logger.info("LLM quality producer: guardrail signal skipped: %s", e)
        skipped.append("harmful_rate + grounding proxy (error)")

    # --- Signal 3: Bedrock invocation-safety telemetry ---
    try:
        inv = GovernInvocationSafetyService(region=region).get_telemetry(days=_INVOCATION_WINDOW_DAYS)
        if inv.live and inv.completion_calls > 0:
            refusal = max(0.0, min(100.0, inv.intervention_rate_pct))
            derived[D.REFUSAL_RATE] = round(refusal, 2)
            sources[D.REFUSAL_RATE] = "invocation-safety-guardrail_intervened"

            if inv.output_tokens > 0 and inv.total_calls > 0:
                derived[D.TOKENS_PER_RESPONSE] = round(inv.output_tokens / inv.total_calls, 2)
                sources[D.TOKENS_PER_RESPONSE] = "invocation-safety-output-tokens"
            else:
                skipped.append("tokens_per_response (no output-token sums recorded)")
        else:
            skipped.append("refusal_rate + tokens_per_response (no live invocation logs)")
    except Exception as e:  # noqa: BLE001
        logger.info("LLM quality producer: invocation-safety signal skipped: %s", e)
        skipped.append("refusal_rate + tokens_per_response (error)")

    # --- Publish (only what is genuinely live this cycle) ---
    if not derived:
        logger.info(
            "LLM quality producer: no live signals this cycle — published nothing (skipped: %s)",
            "; ".join(skipped) or "none",
        )
        return

    now = datetime.now(timezone.utc)
    # model_id / use_case left None on purpose: publishing with EMPTY CloudWatch
    # dimensions is what makes the read path (get_metric_statistics, Dimensions=[])
    # actually retrieve these datapoints and report live=True.
    metrics = [
        LlmQualityMetric(
            dimension=dim,
            value=value,
            unit=get_dimension_metadata(dim)["unit"],
            timestamp=now,
        )
        for dim, value in derived.items()
    ]

    publisher = GovernLlmQualityService(region=region)
    resp = asyncio.run(publisher.publish_batch(metrics))

    published_summary = ", ".join(
        f"{dim.value}={derived[dim]} [{sources.get(dim, '?')}]" for dim in derived
    )
    logger.info(
        "LLM quality producer published %s/%s metrics to %s in %s: %s%s",
        resp.published,
        len(metrics),
        publisher.namespace,
        region,
        published_summary,
        f" | skipped: {'; '.join(skipped)}" if skipped else "",
    )


def start_llm_quality_producer() -> None:
    """Start the background LLM-quality producer.

    No-op when GOVERN_LLM_QUALITY_INTERVAL<0. Runs in a daemon thread and never
    blocks startup or request handling; every cycle is best-effort.
    """
    try:
        interval = int(os.environ.get("GOVERN_LLM_QUALITY_INTERVAL", str(_DEFAULT_INTERVAL_S)))
    except ValueError:
        interval = _DEFAULT_INTERVAL_S
    if interval < 0:
        logger.info("LLM quality producer disabled (GOVERN_LLM_QUALITY_INTERVAL<0)")
        return

    def _loop() -> None:
        # Lazy import so a settings issue can't break the app's import graph.
        from core.config import settings
        region = settings.GOVERN_AWS_REGION
        time.sleep(_STARTUP_DELAY_S)
        while True:
            start = time.monotonic()
            try:
                _derive_and_publish(region)
            except Exception as e:  # noqa: BLE001 — never let the producer thread die
                logger.warning("LLM quality producer cycle failed (non-fatal): %s", e)
            logger.info("LLM quality producer cycle finished in %.1fs", time.monotonic() - start)
            if interval == 0:
                break  # publish once at startup only
            time.sleep(interval)

    threading.Thread(target=_loop, daemon=True, name="govern-llm-quality-producer").start()
    logger.info("LLM quality producer started (interval=%ss)", interval)
