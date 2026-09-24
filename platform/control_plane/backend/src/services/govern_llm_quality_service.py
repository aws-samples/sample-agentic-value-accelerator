"""Govern LLM Quality service — publish and read custom CloudWatch metrics for LLM quality.

Publishes to and reads from a custom CloudWatch namespace (AVA/LLMQuality) for LLM
output quality metrics: groundedness, relevance, coherence, harmful/refusal rates,
latency, token efficiency, and citation accuracy.

Also checks Bedrock guardrails for contextual grounding policy (hallucination checks)
and manages anomaly detection alarms + a pre-built governance dashboard.

Follows the govern_guardrails / govern_trail convention: lazy boto3 clients, honest
live/source/note flags, graceful live=False fallback that never raises, short TTL.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

import boto3
from botocore.exceptions import BotoCoreError, ClientError, ParamValidationError

from core.ttl_cache import get_or_load
from models.govern_llm_quality import (
    CreateAlarmsResponse,
    CreateDashboardResponse,
    LlmMonitoringStatus,
    LlmQualityDatapoint,
    LlmQualityDimension,
    LlmQualityMetric,
    LlmQualitySnapshot,
    LlmQualityTrend,
    PublishMetricsResponse,
    get_dimension_metadata,
)

logger = logging.getLogger(__name__)

# CloudWatch reports a missing dashboard as error code `ResourceNotFound`. The code, not
# `cw.exceptions.DashboardNotFoundError`, is what can actually be matched on — see the
# comment at the GetDashboard call. `ResourceNotFoundException` is here because sibling AWS
# services spell the same condition that way and this check is cheap to keep robust.
_DASHBOARD_ABSENT_CODES = frozenset({"ResourceNotFound", "ResourceNotFoundException"})

_STATUS_TTL = 60  # 1 min — status checks are slow (dashboard/alarms)
_METRICS_TTL = 30  # 30s — near-real-time metric values

# Metric names in CloudWatch (snake_case for consistency)
_METRIC_NAMES = {
    LlmQualityDimension.GROUNDEDNESS: "groundedness_score",
    LlmQualityDimension.RELEVANCE: "relevance_score",
    LlmQualityDimension.COHERENCE: "coherence_score",
    LlmQualityDimension.HARMFUL_RATE: "harmful_rate",
    LlmQualityDimension.REFUSAL_RATE: "refusal_rate",
    LlmQualityDimension.LATENCY_P99: "latency_p99_ms",
    LlmQualityDimension.TOKENS_PER_RESPONSE: "tokens_per_response",
    LlmQualityDimension.CITATION_ACCURACY: "citation_accuracy",
}

# Default units for each dimension
_UNITS = {
    LlmQualityDimension.GROUNDEDNESS: "Percent",
    LlmQualityDimension.RELEVANCE: "Percent",
    LlmQualityDimension.COHERENCE: "Percent",
    LlmQualityDimension.HARMFUL_RATE: "Percent",
    LlmQualityDimension.REFUSAL_RATE: "Percent",
    LlmQualityDimension.LATENCY_P99: "Milliseconds",
    LlmQualityDimension.TOKENS_PER_RESPONSE: "Count",
    LlmQualityDimension.CITATION_ACCURACY: "Percent",
}

# Mock values when no real data exists (reasonable demo values)
_MOCK_VALUES = {
    LlmQualityDimension.GROUNDEDNESS: 87.5,
    LlmQualityDimension.RELEVANCE: 92.3,
    LlmQualityDimension.COHERENCE: 89.1,
    LlmQualityDimension.HARMFUL_RATE: 0.3,
    LlmQualityDimension.REFUSAL_RATE: 2.1,
    LlmQualityDimension.LATENCY_P99: 1250.0,
    LlmQualityDimension.TOKENS_PER_RESPONSE: 412.0,
    LlmQualityDimension.CITATION_ACCURACY: 78.9,
}


class GovernLlmQualityService:
    """Service for LLM quality monitoring via CloudWatch."""

    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self.namespace = "AVA/LLMQuality"
        self._cw: Optional[boto3.client] = None
        self._bedrock: Optional[boto3.client] = None

    def _cloudwatch_client(self):
        if self._cw is None:
            self._cw = boto3.client("cloudwatch", region_name=self.region)
        return self._cw

    def _bedrock_client(self):
        if self._bedrock is None:
            self._bedrock = boto3.client("bedrock", region_name=self.region)
        return self._bedrock

    # -------------------------------------------------------------------------
    # Publish Metrics
    # -------------------------------------------------------------------------

    async def publish_metric(self, metric: LlmQualityMetric) -> bool:
        """Publish a single LLM quality metric to CloudWatch.

        Returns True on success, False on failure.
        """
        try:
            cw = self._cloudwatch_client()
            dimensions = []
            if metric.model_id:
                dimensions.append({"Name": "ModelId", "Value": metric.model_id})
            if metric.use_case:
                dimensions.append({"Name": "UseCase", "Value": metric.use_case})

            metric_name = _METRIC_NAMES.get(metric.dimension, metric.dimension.value)
            cw.put_metric_data(
                Namespace=self.namespace,
                MetricData=[
                    {
                        "MetricName": metric_name,
                        "Dimensions": dimensions,
                        "Timestamp": metric.timestamp,
                        "Value": metric.value,
                        "Unit": metric.unit,
                    }
                ],
            )
            return True
        except (ClientError, BotoCoreError) as e:
            logger.warning("Failed to publish metric %s: %s", metric.dimension, e)
            return False

    async def publish_batch(self, metrics: List[LlmQualityMetric]) -> PublishMetricsResponse:
        """Publish multiple metrics (batched, max 1000 per call).

        Returns count of successfully published metrics.
        """
        if not metrics:
            return PublishMetricsResponse(published=0, failed=0, note="No metrics provided")

        try:
            cw = self._cloudwatch_client()
            metric_data = []

            for m in metrics:
                dimensions = []
                if m.model_id:
                    dimensions.append({"Name": "ModelId", "Value": m.model_id})
                if m.use_case:
                    dimensions.append({"Name": "UseCase", "Value": m.use_case})

                metric_name = _METRIC_NAMES.get(m.dimension, m.dimension.value)
                metric_data.append(
                    {
                        "MetricName": metric_name,
                        "Dimensions": dimensions,
                        "Timestamp": m.timestamp,
                        "Value": m.value,
                        "Unit": m.unit,
                    }
                )

            # CloudWatch allows max 1000 metrics per put_metric_data call
            published = 0
            for i in range(0, len(metric_data), 1000):
                chunk = metric_data[i : i + 1000]
                cw.put_metric_data(Namespace=self.namespace, MetricData=chunk)
                published += len(chunk)

            return PublishMetricsResponse(
                published=published,
                failed=len(metrics) - published,
                note=f"Published {published} metrics to {self.namespace}",
            )
        except (ClientError, BotoCoreError) as e:
            logger.warning("Failed to publish batch metrics: %s", e)
            return PublishMetricsResponse(
                published=0,
                failed=len(metrics),
                live=False,
                note=f"CloudWatch error: {e}",
            )

    # -------------------------------------------------------------------------
    # Read Current Metrics
    # -------------------------------------------------------------------------

    def get_current_metrics(self, period_minutes: int = 5) -> LlmQualitySnapshot:
        """Cached wrapper around the live metric fetch."""
        result, cached_at = get_or_load(
            f"llm_quality:current:{self.region}:{period_minutes}",
            _METRICS_TTL,
            lambda: self._fetch_current_metrics(period_minutes),
            should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} . {stamp}" if result.note else stamp}
            )
        return result

    def _fetch_current_metrics(self, period_minutes: int = 5) -> LlmQualitySnapshot:
        """Get latest values for all LLM quality dimensions from CloudWatch.

        First tries the custom AVA/LLMQuality namespace. If empty, pulls what we can
        from AWS/Bedrock (latency, invocations) and uses mock values for the rest.
        """
        try:
            cw = self._cloudwatch_client()
            end = datetime.now(timezone.utc)
            start = end - timedelta(minutes=max(period_minutes, 60))  # At least 1 hour lookback for Bedrock
            period = max(60, period_minutes * 60)  # At least 1 minute

            metrics: List[LlmQualityMetric] = []
            has_real_data = False
            sources_used = set()

            # Try to get real latency from AWS/Bedrock namespace
            bedrock_latency = None
            try:
                resp = cw.get_metric_statistics(
                    Namespace="AWS/Bedrock",
                    MetricName="InvocationLatency",
                    Dimensions=[],
                    StartTime=start,
                    EndTime=end,
                    Period=300,  # 5-min period for Bedrock metrics
                    Statistics=["Average"],  # Use Average (p99 requires ExtendedStatistics)
                )
                datapoints = resp.get("Datapoints", [])
                if datapoints:
                    latest = max(datapoints, key=lambda d: d.get("Timestamp", datetime.min))
                    bedrock_latency = latest.get("Average")
                    if bedrock_latency:
                        has_real_data = True
                        sources_used.add("AWS/Bedrock")
            except (ClientError, BotoCoreError) as e:
                logger.debug("Could not get Bedrock latency: %s", e)

            for dim in LlmQualityDimension:
                metric_name = _METRIC_NAMES.get(dim, dim.value)
                value = None
                ts = end

                # Special handling for latency - use Bedrock metrics if available
                if dim == LlmQualityDimension.LATENCY_P99 and bedrock_latency:
                    value = bedrock_latency
                    ts = end
                else:
                    # Try custom namespace
                    try:
                        resp = cw.get_metric_statistics(
                            Namespace=self.namespace,
                            MetricName=metric_name,
                            Dimensions=[],  # Aggregate across all dimensions
                            StartTime=start,
                            EndTime=end,
                            Period=period,
                            Statistics=["Average"],
                        )
                        datapoints = resp.get("Datapoints", [])
                        if datapoints:
                            has_real_data = True
                            sources_used.add(self.namespace)
                            latest = max(datapoints, key=lambda d: d.get("Timestamp", datetime.min))
                            value = latest.get("Average", 0.0)
                            ts = latest.get("Timestamp", end)
                    except (ClientError, BotoCoreError) as e:
                        logger.debug("No data for %s: %s", metric_name, e)

                # Fall back to mock value if no real data
                if value is None:
                    value = _MOCK_VALUES.get(dim, 0.0)

                metrics.append(
                    LlmQualityMetric(
                        dimension=dim,
                        value=round(value, 2),
                        unit=_UNITS.get(dim, "None"),
                        timestamp=ts if hasattr(ts, "isoformat") else end,
                    )
                )

            source_str = "+".join(sorted(sources_used)) if sources_used else "mock-fallback"
            return LlmQualitySnapshot(
                metrics=metrics,
                period_minutes=period_minutes,
                live=has_real_data,
                source=source_str,
                note=(
                    None
                    if has_real_data
                    else f"No custom metrics in {self.namespace} yet - showing sample values (latency from AWS/Bedrock if available)"
                ),
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("LLM quality metrics unavailable: %s", e)
            # Return mock data as graceful fallback
            now = datetime.now(timezone.utc)
            metrics = [
                LlmQualityMetric(
                    dimension=dim,
                    value=_MOCK_VALUES.get(dim, 0.0),
                    unit=_UNITS.get(dim, "None"),
                    timestamp=now,
                )
                for dim in LlmQualityDimension
            ]
            return LlmQualitySnapshot(
                metrics=metrics,
                period_minutes=period_minutes,
                live=False,
                source="unavailable-fallback",
                note="CloudWatch unreachable or cloudwatch:GetMetricStatistics not granted",
            )

    # -------------------------------------------------------------------------
    # Metric Trends
    # -------------------------------------------------------------------------

    def get_metric_trend(
        self, dimension: LlmQualityDimension, hours: int = 24
    ) -> LlmQualityTrend:
        """Cached wrapper around the live trend fetch."""
        result, cached_at = get_or_load(
            f"llm_quality:trend:{self.region}:{dimension.value}:{hours}",
            _METRICS_TTL,
            lambda: self._fetch_metric_trend(dimension, hours),
            should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} . {stamp}" if result.note else stamp}
            )
        return result

    def _fetch_metric_trend(
        self, dimension: LlmQualityDimension, hours: int = 24
    ) -> LlmQualityTrend:
        """Get time series for a specific dimension."""
        try:
            cw = self._cloudwatch_client()
            end = datetime.now(timezone.utc)
            start = end - timedelta(hours=hours)
            # Period: 5 min for short windows, 1 hour for longer
            period = 300 if hours <= 6 else 3600

            metric_name = _METRIC_NAMES.get(dimension, dimension.value)
            meta = get_dimension_metadata(dimension)

            resp = cw.get_metric_statistics(
                Namespace=self.namespace,
                MetricName=metric_name,
                Dimensions=[],
                StartTime=start,
                EndTime=end,
                Period=period,
                Statistics=["Average"],
            )

            datapoints = []
            raw = resp.get("Datapoints", [])
            if raw:
                # Sort by timestamp ascending
                raw.sort(key=lambda d: d.get("Timestamp", datetime.min))
                for dp in raw:
                    ts = dp.get("Timestamp")
                    datapoints.append(
                        LlmQualityDatapoint(
                            timestamp=ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                            value=round(dp.get("Average", 0.0), 2),
                            unit=meta.get("unit", "None"),
                        )
                    )
                return LlmQualityTrend(
                    dimension=dimension,
                    label=meta.get("label", dimension.value),
                    datapoints=datapoints,
                    period_hours=hours,
                    live=True,
                    source="cloudwatch",
                )
            else:
                # No real data — generate mock trend
                return self._generate_mock_trend(dimension, hours)

        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("LLM quality trend unavailable for %s: %s", dimension, e)
            return self._generate_mock_trend(dimension, hours, error=True)

    def _generate_mock_trend(
        self, dimension: LlmQualityDimension, hours: int, error: bool = False
    ) -> LlmQualityTrend:
        """Generate mock trend data for demo purposes."""
        import random

        meta = get_dimension_metadata(dimension)
        base_value = _MOCK_VALUES.get(dimension, 50.0)
        datapoints = []
        now = datetime.now(timezone.utc)
        num_points = min(hours, 24)  # Max 24 points

        for i in range(num_points):
            ts = now - timedelta(hours=num_points - i - 1)
            # Add some variance
            variance = base_value * 0.1
            value = base_value + random.uniform(-variance, variance)
            # Keep in reasonable bounds
            value = max(0.0, min(100.0 if "Percent" in meta.get("unit", "") else value * 2, value))
            datapoints.append(
                LlmQualityDatapoint(
                    timestamp=ts.isoformat(),
                    value=round(value, 2),
                    unit=meta.get("unit", "None"),
                )
            )

        return LlmQualityTrend(
            dimension=dimension,
            label=meta.get("label", dimension.value),
            datapoints=datapoints,
            period_hours=hours,
            live=False,
            source="mock-fallback" if not error else "unavailable-fallback",
            note=(
                f"No data in {self.namespace} for {dimension.value} - showing sample trend"
                if not error
                else "CloudWatch unreachable"
            ),
        )

    # -------------------------------------------------------------------------
    # Monitoring Status
    # -------------------------------------------------------------------------

    def get_monitoring_status(self) -> LlmMonitoringStatus:
        """Cached wrapper around the status check (60s TTL - these checks are slow)."""
        result, cached_at = get_or_load(
            f"llm_quality:status:{self.region}",
            _STATUS_TTL,
            lambda: self._fetch_monitoring_status(),
            should_cache=lambda r: r.live,
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} . {stamp}" if result.note else stamp}
            )
        return result

    def _namespace_has_metrics(
        self, cw, namespace: str
    ) -> Tuple[Optional[bool], Optional[str]]:
        """Does `namespace` hold at least one CloudWatch metric?

        Returns (answer, caveat). `answer` is True/False when ListMetrics answered, and
        None when the probe could not be completed. Callers MUST NOT collapse None to
        False: a measured zero from a reachable API is live data, a failed call is not.
        `caveat` is a sentence for the response note, non-None exactly when answer is None.

        WHY THIS IS ONE UNPAGINATED CALL: the only question asked of the response is
        non-emptiness, so there is nothing to page for and no result to bound. The
        previous implementation passed `Limit=1` to say "I only need one" - but
        cloudwatch:ListMetrics has no Limit parameter, so botocore rejected the request
        during serialization, before any network I/O, with ParamValidationError. That
        subclasses BotoCoreError, so the surrounding `except (ClientError, BotoCoreError)`
        caught a *programming* error as though AWS had failed. Seen from outside, both
        namespace flags read False on every request for the entire life of the code, with
        no log line at any level - invisible even to log aggregation.

        Verified against the botocore model shipped in the backend image (botocore
        1.43.85): ListMetrics accepts exactly Namespace, MetricName, Dimensions,
        NextToken, RecentlyActive, IncludeLinkedAccounts, OwningAccount. Re-derive with
        `client.meta.service_model.operation_model("ListMetrics").input_shape.members`
        rather than from the API docs. That model is authoritative for whether a
        parameter EXISTS; it is NOT authoritative for value bounds, because botocore's
        range_check enforces only `min` and never `max`.

        RecentlyActive="PT3H" would also narrow the answer and is deliberately not used:
        it changes the question to "reported a datapoint in the last 3 hours", which would
        make the flag flap off during any idle window instead of reporting whether the
        namespace is in use at all.

        ParamValidationError is deliberately re-raised rather than degraded here. It
        reaches the one handler in _fetch_monitoring_status that knows a malformed request
        is our defect, so this class of bug can never again be absorbed as an AWS-side
        failure. Omitting it from the handler below is NOT enough - see that clause.
        """
        try:
            resp = cw.list_metrics(Namespace=namespace)
        except ParamValidationError:
            # MUST precede the BotoCoreError handler, not merely be absent from it:
            # ParamValidationError IS a BotoCoreError, so `except (ClientError,
            # BotoCoreError)` alone catches it and we are back to the original defect.
            raise
        except (ClientError, BotoCoreError) as e:
            # WARNING, not debug: this is the only signal that a flag the UI reads went
            # unmeasured. Not ERROR - a missing cloudwatch:ListMetrics grant is a benign
            # and expected deployment state, and the response degrades honestly.
            logger.warning(
                "cloudwatch:ListMetrics failed for namespace %s (%s); reporting the "
                "metrics probe as not measured rather than as zero metrics.",
                namespace,
                e,
            )
            return None, f"Could not check {namespace} for metrics: ListMetrics unavailable."

        if resp.get("Metrics"):
            return True, None
        if resp.get("NextToken"):
            # CloudWatch may hand back an empty page that still carries a token, so an
            # empty first page is a measured zero only when no further page is offered.
            return None, (
                f"Could not confirm whether {namespace} has metrics: ListMetrics returned "
                "an empty first page with more pages pending."
            )
        return False, None

    def _fetch_monitoring_status(self) -> LlmMonitoringStatus:
        """Check what monitoring infrastructure is active.

        Every probe below separates "AWS answered, and the answer was nothing" from "the
        probe did not complete". The first is live data; the second degrades `live` and
        names itself in the note, so an unmeasured flag cannot render as a confident zero
        under a Live badge. Each probe also re-raises ParamValidationError ahead of its
        AWS-failure handler, so a malformed request surfaces at the boundary instead of
        being mistaken for an outage.

        Consequence worth knowing: a persistently failing probe means live=False, and
        get_monitoring_status caches only on live=True, so every probe re-runs on each
        request until it recovers. That is the intended trade - a wrong flag under a Live
        badge is worse than repeating four list/describe calls - but it does mean the 60s
        TTL stops absorbing traffic while any probe is broken.
        """
        try:
            cw = self._cloudwatch_client()
            bedrock = self._bedrock_client()
            caveats: List[str] = []

            # 1. Check if guardrails exist (with or without contextual grounding)
            guardrail_monitoring = False
            has_grounding_policy = False
            guardrails_caveat: Optional[str] = None
            try:
                resp = bedrock.list_guardrails(maxResults=50)
                guardrails = resp.get("guardrails", [])
                if guardrails:
                    # If any guardrails exist, consider basic monitoring active
                    guardrail_monitoring = True
                    # Check for contextual grounding (advanced)
                    for g in guardrails[:5]:  # Only check first 5 to avoid slowness
                        try:
                            details = bedrock.get_guardrail(
                                guardrailIdentifier=g.get("id"),
                                guardrailVersion=g.get("version", "DRAFT"),
                            )
                            if details.get("contextualGroundingPolicyConfig"):
                                has_grounding_policy = True
                                break
                        except ParamValidationError:
                            raise
                        except (ClientError, BotoCoreError):
                            pass
            except ParamValidationError:
                raise
            except (ClientError, BotoCoreError) as e:
                guardrails_caveat = "Could not list Bedrock guardrails."
                logger.warning(
                    "bedrock:ListGuardrails failed (%s); guardrail_monitoring_active is "
                    "reported as unmeasured rather than as zero guardrails.",
                    e,
                )

            # Also check if AWS/Bedrock namespace has metrics (invocations flowing)
            bedrock_metrics_active, bedrock_caveat = self._namespace_has_metrics(
                cw, "AWS/Bedrock"
            )
            if bedrock_metrics_active:
                # Bedrock is being used even without guardrails
                guardrail_monitoring = True
            # Carry a probe caveat only where it changes what can be claimed: once either
            # probe has proved monitoring is on, the other's failure cannot make the True
            # any less measured. The WARNING above records it either way.
            if not guardrail_monitoring:
                caveats.extend(c for c in (guardrails_caveat, bedrock_caveat) if c)

            # 2. Check if custom metrics exist in namespace
            custom_metrics, custom_caveat = self._namespace_has_metrics(cw, self.namespace)
            custom_metrics_active = custom_metrics is True
            if custom_caveat:
                caveats.append(custom_caveat)

            # 3. List alarms with llm- prefix
            active_alarms: List[str] = []
            alarms_in_alarm: List[str] = []
            try:
                resp = cw.describe_alarms(AlarmNamePrefix="llm-", MaxRecords=100)
                for alarm in resp.get("MetricAlarms", []):
                    name = alarm.get("AlarmName", "")
                    active_alarms.append(name)
                    if alarm.get("StateValue") == "ALARM":
                        alarms_in_alarm.append(name)
                # Also check composite alarms
                for alarm in resp.get("CompositeAlarms", []):
                    name = alarm.get("AlarmName", "")
                    active_alarms.append(name)
                    if alarm.get("StateValue") == "ALARM":
                        alarms_in_alarm.append(name)
                if resp.get("NextToken"):
                    # MaxRecords=100 is DescribeAlarms' own ceiling, so a token means the
                    # list is a page, not the set. The UI prints len(active_alarms) as
                    # "N alarms configured", which would then be a floor presented as a
                    # total - say so instead of paging a display-only count.
                    caveats.append(
                        f"Alarm list capped at the first {len(active_alarms)} llm- alarms; "
                        "more exist."
                    )
            except ParamValidationError:
                raise
            except (ClientError, BotoCoreError) as e:
                caveats.append("Could not list llm- alarms: DescribeAlarms unavailable.")
                logger.warning(
                    "cloudwatch:DescribeAlarms failed (%s); the alarm list is unmeasured, "
                    "so reporting zero alarms would have been a guess.",
                    e,
                )

            # 4. Check if dashboard exists
            dashboard_deployed = False
            try:
                cw.get_dashboard(DashboardName="AVA-LLM-Quality")
                dashboard_deployed = True
            except ParamValidationError:
                raise
            except (ClientError, BotoCoreError) as e:
                # Match on the error CODE, not on `cw.exceptions.DashboardNotFoundError`.
                # That attribute exists and reads like the right handler, but it can never
                # fire: botocore keys the exception class it raises on the wire error code
                # ("ResourceNotFound"), while also synthesising a separate attribute named
                # after the model's shape ("DashboardNotFoundError"). Measured - the two are
                # unrelated classes with no inheritance between them, so the old handler was
                # dead code and every missing dashboard fell through to the branch below.
                #
                # The cost was not the wrong `dashboard_deployed` (False either way). It was
                # that a MEASURED ABSENCE - the API answered clearly, "does not exist" - was
                # published as an unmeasured failure. That added a caveat which is simply not
                # true, and because any unmeasured field drops the whole payload off Live,
                # the honest readings of guardrail monitoring, custom metrics and alarms all
                # lost their Live badge along with it.
                code = (
                    e.response.get("Error", {}).get("Code", "")
                    if isinstance(e, ClientError) else ""
                )
                if code in _DASHBOARD_ABSENT_CODES:
                    pass  # A measured absence: the API answered, and it is not there.
                else:
                    caveats.append(
                        "Could not check whether the AVA-LLM-Quality dashboard exists."
                    )
                    logger.warning(
                        "cloudwatch:GetDashboard failed for AVA-LLM-Quality (%s); "
                        "dashboard_deployed is unmeasured, not a confirmed absence.",
                        e,
                    )

            fully_measured = not caveats
            return LlmMonitoringStatus(
                guardrail_monitoring_active=guardrail_monitoring,
                custom_metrics_active=custom_metrics_active,
                active_alarms=active_alarms,
                alarms_in_alarm=alarms_in_alarm,
                dashboard_deployed=dashboard_deployed,
                namespace=self.namespace,
                # Any unmeasured field drops the whole payload off Live: the model carries
                # one `live` for all of it, and the UI gates its Live badge on that alone.
                live=fully_measured,
                source="aws-apis" if fully_measured else "aws-apis-partial",
                note=None if fully_measured else " ".join(caveats),
            )

        except ParamValidationError as e:
            # A malformed AWS request is our defect, not an AWS outage, and must never be
            # reported as one. botocore raises this during serialization, before any
            # network I/O, and it subclasses BotoCoreError - which is exactly how
            # `Limit=1` on cloudwatch:ListMetrics survived here unnoticed: the broad
            # handler below absorbed it as an AWS-side failure, so the namespace flags
            # read False on every request and nothing was logged at any level.
            # ERROR because it is a code defect; no traceback because botocore's message
            # already names the offending parameter and the full set of valid ones.
            logger.error(
                "Malformed AWS request while checking LLM monitoring status: %s. "
                "Reporting the status as not measured; this is a code defect in this "
                "service, not an AWS failure.",
                e,
            )
            return LlmMonitoringStatus(
                guardrail_monitoring_active=False,
                custom_metrics_active=False,
                active_alarms=[],
                alarms_in_alarm=[],
                dashboard_deployed=False,
                namespace=self.namespace,
                live=False,
                source="request-error",
                note=(
                    "Monitoring status could not be measured: an AWS request built by "
                    "this service was malformed. Nothing here is a measured zero."
                ),
            )
        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Monitoring status unavailable: %s", e)
            return LlmMonitoringStatus(
                guardrail_monitoring_active=False,
                custom_metrics_active=False,
                active_alarms=[],
                alarms_in_alarm=[],
                dashboard_deployed=False,
                namespace=self.namespace,
                live=False,
                source="unavailable-fallback",
                note="Could not query AWS APIs for monitoring status",
            )

    # -------------------------------------------------------------------------
    # Dashboard Management
    # -------------------------------------------------------------------------

    async def create_dashboard(self) -> CreateDashboardResponse:
        """Create or update the LLM quality CloudWatch dashboard."""
        try:
            cw = self._cloudwatch_client()
            dashboard_name = "AVA-LLM-Quality"
            dashboard_body = self._get_dashboard_json()

            # Check if it already exists
            existing = False
            try:
                cw.get_dashboard(DashboardName=dashboard_name)
                existing = True
            except Exception:
                pass

            cw.put_dashboard(DashboardName=dashboard_name, DashboardBody=dashboard_body)

            return CreateDashboardResponse(
                dashboard_name=dashboard_name,
                created=not existing,
                note=f"Dashboard {'updated' if existing else 'created'} in {self.region}",
            )
        except (ClientError, BotoCoreError) as e:
            logger.warning("Failed to create dashboard: %s", e)
            return CreateDashboardResponse(
                dashboard_name="AVA-LLM-Quality",
                created=False,
                live=False,
                note=f"Failed to create dashboard: {e}",
            )

    def _get_dashboard_json(self) -> str:
        """Return the dashboard JSON body."""
        dashboard = {
            "widgets": [
                # Row 1: Summary stats
                {
                    "type": "metric",
                    "x": 0,
                    "y": 0,
                    "width": 6,
                    "height": 6,
                    "properties": {
                        "title": "Groundedness Score",
                        "metrics": [
                            [self.namespace, "groundedness_score", {"stat": "Average"}]
                        ],
                        "period": 300,
                        "region": self.region,
                        "view": "gauge",
                        "yAxis": {"left": {"min": 0, "max": 100}},
                    },
                },
                {
                    "type": "metric",
                    "x": 6,
                    "y": 0,
                    "width": 6,
                    "height": 6,
                    "properties": {
                        "title": "Relevance Score",
                        "metrics": [
                            [self.namespace, "relevance_score", {"stat": "Average"}]
                        ],
                        "period": 300,
                        "region": self.region,
                        "view": "gauge",
                        "yAxis": {"left": {"min": 0, "max": 100}},
                    },
                },
                {
                    "type": "metric",
                    "x": 12,
                    "y": 0,
                    "width": 6,
                    "height": 6,
                    "properties": {
                        "title": "Harmful Rate",
                        "metrics": [
                            [self.namespace, "harmful_rate", {"stat": "Average"}]
                        ],
                        "period": 300,
                        "region": self.region,
                        "view": "gauge",
                        "yAxis": {"left": {"min": 0, "max": 10}},
                        "annotations": {
                            "horizontal": [
                                {"value": 1, "label": "Warning", "color": "#ff7f0e"},
                                {"value": 5, "label": "Critical", "color": "#d62728"},
                            ]
                        },
                    },
                },
                {
                    "type": "metric",
                    "x": 18,
                    "y": 0,
                    "width": 6,
                    "height": 6,
                    "properties": {
                        "title": "Latency P99",
                        "metrics": [
                            [self.namespace, "latency_p99_ms", {"stat": "Average"}]
                        ],
                        "period": 300,
                        "region": self.region,
                        "view": "gauge",
                        "yAxis": {"left": {"min": 0, "max": 5000}},
                    },
                },
                # Row 2: Time series
                {
                    "type": "metric",
                    "x": 0,
                    "y": 6,
                    "width": 12,
                    "height": 6,
                    "properties": {
                        "title": "Quality Scores Over Time",
                        "metrics": [
                            [self.namespace, "groundedness_score", {"label": "Groundedness"}],
                            [self.namespace, "relevance_score", {"label": "Relevance"}],
                            [self.namespace, "coherence_score", {"label": "Coherence"}],
                            [
                                self.namespace,
                                "citation_accuracy",
                                {"label": "Citation Accuracy"},
                            ],
                        ],
                        "period": 300,
                        "region": self.region,
                        "view": "timeSeries",
                        "stacked": False,
                        "yAxis": {"left": {"min": 0, "max": 100}},
                    },
                },
                {
                    "type": "metric",
                    "x": 12,
                    "y": 6,
                    "width": 12,
                    "height": 6,
                    "properties": {
                        "title": "Safety Metrics Over Time",
                        "metrics": [
                            [self.namespace, "harmful_rate", {"label": "Harmful Rate"}],
                            [self.namespace, "refusal_rate", {"label": "Refusal Rate"}],
                        ],
                        "period": 300,
                        "region": self.region,
                        "view": "timeSeries",
                        "stacked": False,
                        "yAxis": {"left": {"min": 0, "max": 10}},
                    },
                },
                # Row 3: Performance
                {
                    "type": "metric",
                    "x": 0,
                    "y": 12,
                    "width": 12,
                    "height": 6,
                    "properties": {
                        "title": "Latency P99 Over Time",
                        "metrics": [
                            [self.namespace, "latency_p99_ms", {"stat": "p99"}]
                        ],
                        "period": 300,
                        "region": self.region,
                        "view": "timeSeries",
                        "annotations": {
                            "horizontal": [
                                {"value": 2000, "label": "SLA Target", "color": "#ff7f0e"}
                            ]
                        },
                    },
                },
                {
                    "type": "metric",
                    "x": 12,
                    "y": 12,
                    "width": 12,
                    "height": 6,
                    "properties": {
                        "title": "Tokens Per Response",
                        "metrics": [
                            [
                                self.namespace,
                                "tokens_per_response",
                                {"stat": "Average", "label": "Avg Tokens"},
                            ],
                            [
                                self.namespace,
                                "tokens_per_response",
                                {"stat": "p99", "label": "P99 Tokens"},
                            ],
                        ],
                        "period": 300,
                        "region": self.region,
                        "view": "timeSeries",
                    },
                },
            ]
        }
        return json.dumps(dashboard)

    # -------------------------------------------------------------------------
    # Alarm Management
    # -------------------------------------------------------------------------

    async def create_anomaly_alarms(self) -> CreateAlarmsResponse:
        """Create anomaly detection alarms for key metrics."""
        try:
            cw = self._cloudwatch_client()
            alarm_configs = [
                {
                    "name": "llm-groundedness-anomaly",
                    "metric": "groundedness_score",
                    "description": "Groundedness score anomaly detection",
                    "threshold_direction": "LESS_THAN_LOWER_THRESHOLD",
                },
                {
                    "name": "llm-harmful-rate-spike",
                    "metric": "harmful_rate",
                    "description": "Harmful content rate spike detection",
                    "threshold_direction": "GREATER_THAN_UPPER_THRESHOLD",
                },
                {
                    "name": "llm-latency-anomaly",
                    "metric": "latency_p99_ms",
                    "description": "Latency P99 anomaly detection",
                    "threshold_direction": "GREATER_THAN_UPPER_THRESHOLD",
                },
                {
                    "name": "llm-refusal-rate-spike",
                    "metric": "refusal_rate",
                    "description": "Refusal rate spike detection",
                    "threshold_direction": "GREATER_THAN_UPPER_THRESHOLD",
                },
            ]

            created_alarms: List[str] = []
            skipped = 0

            for config in alarm_configs:
                try:
                    # Check if alarm exists
                    resp = cw.describe_alarms(AlarmNames=[config["name"]])
                    if resp.get("MetricAlarms") or resp.get("CompositeAlarms"):
                        skipped += 1
                        continue

                    # Create anomaly detection model ID
                    model_id = f"m_{config['name'].replace('-', '_')}"

                    # Create the alarm with anomaly detection
                    cw.put_metric_alarm(
                        AlarmName=config["name"],
                        AlarmDescription=config["description"],
                        ActionsEnabled=True,
                        MetricName=config["metric"],
                        Namespace=self.namespace,
                        Statistic="Average",
                        Period=300,
                        EvaluationPeriods=3,
                        DatapointsToAlarm=2,
                        Threshold=0,  # Anomaly detection uses bands, not static threshold
                        ComparisonOperator="LessThanLowerOrGreaterThanUpperThreshold",
                        ThresholdMetricId=model_id,
                        Metrics=[
                            {
                                "Id": "m1",
                                "MetricStat": {
                                    "Metric": {
                                        "Namespace": self.namespace,
                                        "MetricName": config["metric"],
                                    },
                                    "Period": 300,
                                    "Stat": "Average",
                                },
                                "ReturnData": True,
                            },
                            {
                                "Id": model_id,
                                "Expression": f"ANOMALY_DETECTION_BAND(m1, 2)",
                                "Label": f"{config['metric']} expected",
                                "ReturnData": True,
                            },
                        ],
                        TreatMissingData="notBreaching",
                    )
                    created_alarms.append(config["name"])
                except (ClientError, BotoCoreError) as e:
                    logger.warning("Failed to create alarm %s: %s", config["name"], e)

            return CreateAlarmsResponse(
                alarm_names=created_alarms,
                created=len(created_alarms),
                skipped=skipped,
                note=f"Created {len(created_alarms)} alarms, skipped {skipped} existing",
            )
        except (ClientError, BotoCoreError) as e:
            logger.warning("Failed to create alarms: %s", e)
            return CreateAlarmsResponse(
                alarm_names=[],
                created=0,
                skipped=0,
                live=False,
                note=f"Failed to create alarms: {e}",
            )
