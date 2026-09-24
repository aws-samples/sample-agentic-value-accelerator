"""Govern Capacity service — reads AWS Service Quotas for capacity management.

Read-through (no DynamoDB): AWS Service Quotas and CloudWatch are the sources
of truth. Follows the Govern service convention — constructed with a region,
creates its own boto3 clients, and degrades gracefully: if Service Quotas is
unreachable or access is denied, it returns a `live=False` fallback rather
than raising, so the FinOps capacity surface still renders and can badge the
data honestly.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.config import settings
from core.ttl_cache import get_or_load
from models.govern_capacity import (
    AlertsResponse,
    CapacityAlert,
    QuotaIncreaseRequest,
    QuotaIncreaseResponse,
    QuotasResponse,
    ServiceQuota,
    UsageDataPoint,
    UsageHistoryResponse,
)

logger = logging.getLogger(__name__)

# Cache TTL: 5 minutes for quota data (doesn't change frequently)
_QUOTA_TTL = 300

# AI-relevant services to monitor. `code` is a Service Quotas ServiceCode, which is
# NOT always the obvious name: CloudWatch is "monitoring". It was "cloudwatch" here,
# which Service Quotas rejects with NoSuchResourceException ("This service is not
# available in the current Region" - verified against us-east-1), and the per-service
# except block swallowed it, so CloudWatch quotas were never monitored at all and the
# only trace was a warning log. Confirm any new code with
# `aws service-quotas list-services` rather than guessing.
AI_SERVICES = [
    {"code": "bedrock", "name": "Amazon Bedrock"},
    {"code": "sagemaker", "name": "Amazon SageMaker"},
    {"code": "lambda", "name": "AWS Lambda"},
    {"code": "monitoring", "name": "Amazon CloudWatch"},
    {"code": "iam", "name": "AWS IAM"},
]

# Key quotas to monitor per service (quota codes vary - these are examples)
SERVICE_QUOTA_FOCUS = {
    "bedrock": [
        "Concurrent model invocations",
        "Provisioned throughput",
        "Custom model training jobs",
        "Knowledge bases",
        "Agents",
    ],
    "sagemaker": [
        "ml.p4d.24xlarge for endpoint usage",
        "ml.g5.xlarge for endpoint usage",
        "Training jobs",
        "Endpoints",
        "Models",
    ],
    "lambda": [
        "Concurrent executions",
        "Function and layer storage",
        "Elastic network interfaces per VPC",
    ],
    "monitoring": [
        "Custom metrics",
        "Alarms",
        "Metric streams",
        "Log groups",
    ],
    "iam": [
        "Roles",
        "Users",
        "Policies",
        "Instance profiles",
    ],
}

# RequestedServiceQuotaChange.Status, grouped by what it means for the operator.
# AWS's enum is PENDING | CASE_OPENED | APPROVED | DENIED | CASE_CLOSED | NOT_APPROVED |
# INVALID_REQUEST. Only APPROVED means the limit actually moved; PENDING and CASE_OPENED
# mean AWS accepted the request, which is not the same thing and must not be reported as
# capacity granted. CASE_CLOSED is terminal but does not say which way it went, so it is
# in no set and falls through to the raw status being surfaced.
_OPEN_REQUEST_STATUSES = {"PENDING", "CASE_OPENED"}
_APPROVED_REQUEST_STATUSES = {"APPROVED"}
_REJECTED_REQUEST_STATUSES = {"DENIED", "NOT_APPROVED", "INVALID_REQUEST"}

# Callers (and the /history/{service} path) still use the friendly name for CloudWatch.
# Accepting it keeps those URLs working instead of answering "Unknown service code".
_SERVICE_CODE_ALIASES = {"cloudwatch": "monitoring"}


def _normalize_service_code(service_code: str) -> str:
    code = (service_code or "").strip().lower()
    return _SERVICE_CODE_ALIASES.get(code, code)


# GetMetricStatistics only accepts these five names in Statistics. Service Quotas
# returns its recommendation in the same vocabulary, but an unrecognized value would
# make CloudWatch raise InvalidParameterValue and lose the usage number entirely, so
# anything outside the set falls back to Maximum.
_CW_STATISTICS = {"Average", "Maximum", "Minimum", "Sum", "SampleCount"}


def _usage_statistic(usage_metric: Optional[dict]) -> str:
    """Which CloudWatch statistic represents usage for this quota.

    Service Quotas publishes MetricStatisticRecommendation per quota (Maximum for
    point-in-time quotas like Lambda concurrent executions, Sum for rate quotas).
    Reading Sum with Maximum, or the reverse, returns a plausible wrong number
    without any error, so the recommendation is honored when AWS supplies one.
    """
    if not usage_metric:
        return "Maximum"
    recommended = (usage_metric.get("MetricStatisticRecommendation") or "").strip()
    return recommended if recommended in _CW_STATISTICS else "Maximum"


def _quota_cache_note(result, cached_at: float):
    """Stamp an honest 'cached as of' age onto a live quota response."""
    if not getattr(result, "live", False):
        return result
    age = time.time() - cached_at
    if age < 2:
        return result
    stamp = f"Cached {int(age)}s ago"
    # ttl_cache hands back the object it still holds, so mutating result.note
    # would append a stamp per hit and grow the cached note without bound.
    # model_copy swaps only this top-level scalar, leaving the cache entry intact.
    note = f"{result.note} · {stamp}" if result.note else stamp
    return result.model_copy(update={"note": note})


def _strip_cache_stamp(note: Optional[str]) -> Optional[str]:
    """Drop the "Cached Ns ago" segment _quota_cache_note appends.

    Alerts and history are derived from the cached quota response, so re-using its
    note verbatim would nest one surface's cache age inside another's and then stamp
    the result again. The caveats in the note (partial read failures, empty result)
    are still worth carrying; the age is not.
    """
    if not note:
        return None
    kept = [p.strip() for p in note.split(" · ") if not p.strip().startswith("Cached ")]
    return " · ".join(kept) or None


def _trend(values: List[float]) -> str:
    """Direction of a usage series: compare the mean of each half, 10% deadband.

    Two points are the minimum: a single datapoint has no direction, and calling it
    "stable" is the honest answer rather than implying a flat line was observed.
    """
    if len(values) < 2:
        return "stable"
    mid = len(values) // 2
    first = sum(values[:mid]) / mid
    second = sum(values[mid:]) / (len(values) - mid)
    if second > first * 1.1:
        return "increasing"
    if second < first * 0.9:
        return "decreasing"
    return "stable"


def _get_status(usage_pct: float) -> str:
    """Determine status based on usage percentage."""
    if usage_pct >= 90:
        return "critical"
    elif usage_pct >= 80:
        return "warning"
    elif usage_pct >= 70:
        return "attention"
    return "ok"


class GovernCapacityService:
    def __init__(self):
        """Reads the GOVERNED region's quotas (tier 2), resolved here, not by the caller.

        There is deliberately no `region` parameter. This service is only ever a
        governed-fleet reader, and the previous shape - accept a region, then override it
        with GOVERN_AWS_REGION - was two traps stacked: it let a caller pass the wrong
        tier, then ignored the argument without an error, so a future caller legitimately
        wanting another region would also have been silently overridden.

        The wrong tier is not a cosmetic mistake here. The only route that builds this
        service used to hand it settings.AWS_REGION - the CONTROL-PLANE region, us-east-2
        in the demo account - while the fleet whose capacity this surface governs runs in
        GOVERN_AWS_REGION (us-east-1). Service Quotas is per-region and does not error on
        the wrong region; it answers with that region's own inventory. Verified: us-east-1
        lists "(Managed Knowledge Bases) Knowledge bases per account" (L-5C7643AC) and
        us-east-2 does not, and the QuotaArn is region-scoped, so an increase submitted
        against the control-plane region raises a limit in a region nothing runs in while
        the UI reports success. See core/region_config.py, tier 2.

        This surface is declared SINGLE_REGION (see api/routes/govern_capacity.py), so it
        reads the primary governed region rather than fanning out over
        get_governed_regions(). If it ever needs fan-out, the extension point is
        core.multiregion.run_over_regions over that set - not a caller-supplied region.
        """
        governed = (settings.GOVERN_AWS_REGION or "").strip()
        self.region = governed or "us-east-1"
        self._sq_client = None
        self._cw_client = None

    def _sq(self):
        """Lazy Service Quotas client."""
        if self._sq_client is None:
            self._sq_client = boto3.client("service-quotas", region_name=self.region)
        return self._sq_client

    def _cw(self):
        """Lazy CloudWatch client."""
        if self._cw_client is None:
            self._cw_client = boto3.client("cloudwatch", region_name=self.region)
        return self._cw_client

    def get_quotas(self) -> QuotasResponse:
        """Get all AI-relevant service quotas with usage (cached 5 min)."""
        key = f"capacity:quotas:{self.region}"
        result, cached_at = get_or_load(
            key, _QUOTA_TTL, self._fetch_quotas,
            should_cache=lambda r: r.live,
        )
        return _quota_cache_note(result, cached_at)

    def _fetch_quotas(self) -> QuotasResponse:
        """Fetch quotas from AWS Service Quotas API."""
        quotas = []
        # `reached` separates "Service Quotas answered and this region genuinely has no
        # matching quota" from "every call failed". Both used to produce quotas == [] and
        # therefore live=False, which badged a real measurement as unavailable. A reachable
        # API that returns nothing is live data; only an unreachable one is a fallback.
        reached = False
        failures: List[str] = []
        # Quotas whose usage AWS does not publish a metric for. They render as 0% and the
        # note has to say why, or an unmeasurable quota looks like an idle one.
        unmeasured = 0
        try:
            for svc in AI_SERVICES:
                try:
                    # List applied quotas (includes default and any increases)
                    paginator = self._sq().get_paginator("list_service_quotas")
                    for page in paginator.paginate(ServiceCode=svc["code"]):
                        reached = True
                        for q in page.get("Quotas", []):
                            quota_name = q.get("QuotaName", "")
                            # Filter to focus quotas if we have a list
                            focus_list = SERVICE_QUOTA_FOCUS.get(svc["code"], [])
                            if focus_list and not any(f.lower() in quota_name.lower() for f in focus_list):
                                continue

                            value = q.get("Value", 0)
                            # None means AWS publishes no usage metric for this quota (or
                            # CloudWatch had nothing), which is not the same as zero usage.
                            measured = self._get_quota_usage(
                                svc["code"], q.get("QuotaCode", ""), q.get("UsageMetric")
                            )
                            if measured is None:
                                unmeasured += 1
                            usage = measured if measured is not None else 0.0
                            usage_pct = (usage / value * 100) if value > 0 else 0

                            quotas.append(ServiceQuota(
                                service_code=svc["code"],
                                service_name=svc["name"],
                                quota_code=q.get("QuotaCode", ""),
                                quota_name=quota_name,
                                value=value,
                                unit=q.get("Unit", "None"),
                                usage=usage,
                                usage_pct=round(usage_pct, 1),
                                adjustable=q.get("Adjustable", False),
                                global_quota=q.get("GlobalQuota", False),
                                status=_get_status(usage_pct),
                            ))
                except (BotoCoreError, ClientError) as e:
                    # Per-service failure is survivable (a service may not exist in this
                    # region), but it is recorded so the response can say which services
                    # are missing instead of silently reporting a short list as complete.
                    logger.warning("Failed to fetch quotas for %s: %s", svc["code"], e)
                    failures.append(svc["code"])
                    continue

            if not reached:
                logger.warning(
                    "Service Quotas returned nothing for any of %s in %s; treating as unavailable.",
                    ", ".join(s["code"] for s in AI_SERVICES), self.region,
                )
                return self._mock_quotas_response()

            # Sort by usage percentage (critical first)
            quotas.sort(key=lambda q: q.usage_pct, reverse=True)

            at_risk = sum(1 for q in quotas if q.usage_pct >= 80)
            critical = sum(1 for q in quotas if q.usage_pct >= 90)

            notes: List[str] = []
            if not quotas:
                notes.append(
                    f"Service Quotas answered for {self.region} but no quota matched the "
                    "monitored set (see SERVICE_QUOTA_FOCUS)."
                )
            if failures:
                notes.append(
                    f"Quotas for {', '.join(sorted(failures))} could not be read in "
                    f"{self.region}, so those services are not represented."
                )
            if unmeasured:
                notes.append(
                    f"{unmeasured} of {len(quotas)} quotas show 0% because AWS publishes "
                    "no CloudWatch usage metric for them, not because they are idle."
                )

            return QuotasResponse(
                quotas=quotas,
                total_monitored=len(quotas),
                at_risk_count=at_risk,
                critical_count=critical,
                # Reached the API: the count is measured, including a measured zero.
                live=True,
                source="service-quotas",
                note=" ".join(notes) or None,
            )

        except (BotoCoreError, ClientError) as e:
            logger.warning("Service Quotas unavailable: %s", e)
            return self._mock_quotas_response()

    def _get_quota_usage(
        self, service_code: str, quota_code: str, usage_metric: Optional[dict]
    ) -> Optional[float]:
        """Current usage for a quota from CloudWatch, or None if it cannot be measured.

        None and 0.0 are different answers and used to be conflated: every quota AWS
        publishes no UsageMetric for (most of Bedrock's) reported usage 0.0, which the
        UI drew as 0% of limit under a live badge - indistinguishable from a genuinely
        idle quota. The caller counts the Nones and says so in the response note.
        """
        if not usage_metric:
            return None

        try:
            namespace = usage_metric.get("MetricNamespace")
            metric_name = usage_metric.get("MetricName")
            dimensions = usage_metric.get("MetricDimensions", {})

            if not namespace or not metric_name:
                return None

            cw_dimensions = [{"Name": k, "Value": v} for k, v in dimensions.items()]

            end_time = datetime.now(timezone.utc)
            start_time = end_time - timedelta(hours=1)

            # Service Quotas tells us which statistic actually represents usage for this
            # quota (MetricStatisticRecommendation, e.g. "Maximum" for Lambda concurrent
            # executions, "Sum" for some rate quotas). Hardcoding Maximum reads the wrong
            # number for the latter without failing, so honor the recommendation.
            statistic = _usage_statistic(usage_metric)

            response = self._cw().get_metric_statistics(
                Namespace=namespace,
                MetricName=metric_name,
                Dimensions=cw_dimensions,
                StartTime=start_time,
                EndTime=end_time,
                Period=3600,
                Statistics=[statistic],
            )

            datapoints = response.get("Datapoints", [])
            if datapoints:
                # A datapoint that exists and reads 0 IS a measurement of zero usage,
                # so this returns 0.0 rather than None.
                return float(max(dp.get(statistic) or 0.0 for dp in datapoints))

        except (BotoCoreError, ClientError) as e:
            logger.debug("Could not get usage for %s/%s: %s", service_code, quota_code, e)

        return None

    def get_alerts(self) -> AlertsResponse:
        """Get quotas approaching their limits (>70% used)."""
        key = f"capacity:alerts:{self.region}"
        result, cached_at = get_or_load(
            key, _QUOTA_TTL, self._fetch_alerts,
            should_cache=lambda r: r.live,
        )
        return _quota_cache_note(result, cached_at)

    def _fetch_alerts(self) -> AlertsResponse:
        """Fetch quotas that are approaching limits."""
        # get_quotas(), not _fetch_quotas(): alerts are a pure projection of the quota
        # list, so they must read through the same 5-minute cache. Calling the fetcher
        # directly re-ran the whole Service Quotas + CloudWatch fan-out on every alerts
        # request and could disagree with /quotas rendered on the same screen.
        quotas_resp = self.get_quotas()
        if not quotas_resp.live:
            return AlertsResponse(
                alerts=[],
                warning_count=0,
                critical_count=0,
                live=False,
                source="unavailable-fallback",
                note="Service Quotas unavailable — cannot determine at-risk quotas.",
            )

        alerts = []
        for q in quotas_resp.quotas:
            if q.usage_pct < 70:
                continue

            severity = "critical" if q.usage_pct >= 90 else "warning"
            recommendation = self._get_recommendation(q, severity)

            alerts.append(CapacityAlert(
                service_code=q.service_code,
                service_name=q.service_name,
                quota_code=q.quota_code,
                quota_name=q.quota_name,
                value=q.value,
                usage=q.usage,
                usage_pct=q.usage_pct,
                severity=severity,
                recommendation=recommendation,
            ))

        warning_count = sum(1 for a in alerts if a.severity == "warning")
        critical_count = sum(1 for a in alerts if a.severity == "critical")

        notes: List[str] = []
        if not alerts:
            notes.append(
                f"All {quotas_resp.total_monitored} monitored quotas in {self.region} are "
                "below 70% of their limit."
            )
        # Carry the quota response's own caveat (partial read failure, empty match) so
        # "no alerts" is not read as "nothing is at risk" when a service could not be read.
        inherited = _strip_cache_stamp(quotas_resp.note)
        if inherited:
            notes.append(inherited)

        return AlertsResponse(
            alerts=alerts,
            warning_count=warning_count,
            critical_count=critical_count,
            live=True,
            source="service-quotas",
            note=" ".join(notes) or None,
        )

    def _get_recommendation(self, quota: ServiceQuota, severity: str) -> str:
        """Generate a recommendation for a quota at risk."""
        if not quota.adjustable:
            return f"This quota is not adjustable. Consider optimizing usage or contact AWS Support."

        if severity == "critical":
            return f"Request an immediate quota increase via Service Quotas console or submit a support ticket."

        return f"Consider requesting a quota increase before usage reaches critical levels."

    def get_history(self, service_code: str, days: int = 7) -> UsageHistoryResponse:
        """Get usage trend for a service from CloudWatch."""
        # Normalize before the cache key so /history/cloudwatch and /history/monitoring
        # share one entry instead of fetching the same series twice.
        code = _normalize_service_code(service_code)
        key = f"capacity:history:{self.region}:{code}:{days}"
        result, cached_at = get_or_load(
            key, _QUOTA_TTL, lambda: self._fetch_history(code, days),
            should_cache=lambda r: r.live,
        )
        return _quota_cache_note(result, cached_at)

    def _empty_history(
        self,
        service_code: str,
        service_name: str,
        source: str,
        note: str,
        current_usage: float = 0.0,
        current_limit: float = 0.0,
    ) -> UsageHistoryResponse:
        """A history response with no series, always live=False.

        Every caller of this helper failed to obtain datapoints. An empty chart under a
        Live badge reads as "usage was zero all week" rather than "there is no series",
        which is the specific confusion the honesty gating exists to prevent. Where the
        limit and current usage ARE measured they are still returned, and the note says so.
        """
        return UsageHistoryResponse(
            service_code=service_code,
            service_name=service_name,
            data_points=[],
            period_start="",
            period_end="",
            current_usage=current_usage,
            current_limit=current_limit,
            trend="stable",
            live=False,
            source=source,
            note=note,
        )

    def _fetch_history(self, service_code: str, days: int = 7) -> UsageHistoryResponse:
        """Fetch usage history from CloudWatch for a service.

        The series is real CloudWatch data: Service Quotas publishes a UsageMetric for
        the quotas it can measure (namespace, metric name, dimensions, and the statistic
        that represents usage), and this queries it at daily resolution.

        It previously returned primary_quota.usage multiplied by a per-index fudge factor
        ("variation = 1 + i * 0.01") under live=True / source="cloudwatch", so an idle
        fleet still drew a rising line and `trend` reported "increasing" from that
        arithmetic alone. Quotas AWS publishes no usage metric for - which is most of
        Bedrock's - now degrade honestly rather than inventing a shape.
        """
        code = _normalize_service_code(service_code)
        svc_info = next((s for s in AI_SERVICES if s["code"] == code), None)
        if not svc_info:
            return self._empty_history(
                service_code, service_code, "invalid-service",
                f"Unknown service code '{service_code}'. Monitored codes: "
                + ", ".join(s["code"] for s in AI_SERVICES) + ".",
            )

        # get_quotas(), not _fetch_quotas(): read through the shared 5-minute cache so
        # the chart cannot contradict the quota table rendered beside it, and so one
        # chart per service does not re-run the whole quota fan-out.
        quotas_resp = self.get_quotas()
        if not quotas_resp.live:
            return self._empty_history(
                code, svc_info["name"], "unavailable-fallback",
                f"Service Quotas is unavailable in {self.region}, so the quota to trend "
                "cannot be identified.",
            )

        service_quotas = [q for q in quotas_resp.quotas if q.service_code == code]
        if not service_quotas:
            return self._empty_history(
                code, svc_info["name"], "no-quotas",
                f"No monitored {svc_info['name']} quota exists in {self.region}.",
            )

        # Highest-usage quota: the one whose trend actually matters for capacity planning.
        primary_quota = max(service_quotas, key=lambda q: q.usage_pct)
        measured = {"current_usage": primary_quota.usage, "current_limit": primary_quota.value}

        quota, describe_error, _ = self._describe_quota(code, primary_quota.quota_code)
        usage_metric = (quota or {}).get("UsageMetric") or {}
        namespace = usage_metric.get("MetricNamespace")
        metric_name = usage_metric.get("MetricName")
        if not namespace or not metric_name:
            detail = f" Quota lookup: {describe_error}" if describe_error else ""
            return self._empty_history(
                code, svc_info["name"], "no-usage-metric",
                f"AWS publishes no CloudWatch usage metric for '{primary_quota.quota_name}' "
                f"({primary_quota.quota_code}), so no usage history exists to trend. The "
                f"limit ({primary_quota.value:g}) and current usage ({primary_quota.usage:g}) "
                f"are live from Service Quotas in {self.region}.{detail}",
                **measured,
            )

        statistic = _usage_statistic(usage_metric)
        dimensions = [
            {"Name": k, "Value": v}
            for k, v in (usage_metric.get("MetricDimensions") or {}).items()
        ]
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(days=days)

        try:
            resp = self._cw().get_metric_statistics(
                Namespace=namespace,
                MetricName=metric_name,
                Dimensions=dimensions,
                StartTime=start_time,
                EndTime=end_time,
                Period=86400,  # one point per day; days is capped at 30 by the route
                Statistics=[statistic],
            )
        except (BotoCoreError, ClientError) as e:
            logger.warning(
                "Usage history for %s/%s unavailable in %s: %s",
                code, primary_quota.quota_code, self.region, e,
            )
            return self._empty_history(
                code, svc_info["name"], "unavailable-fallback",
                f"CloudWatch {namespace}/{metric_name} could not be read in {self.region} "
                f"({type(e).__name__}); the limit and current usage are still live from "
                "Service Quotas.",
                **measured,
            )

        raw = sorted(resp.get("Datapoints", []), key=lambda d: d["Timestamp"])
        if not raw:
            return self._empty_history(
                code, svc_info["name"], "no-datapoints",
                f"CloudWatch returned no {statistic} datapoints for {namespace}/"
                f"{metric_name} in {self.region} over the last {days}d, so there is no "
                f"trend to draw. The limit ({primary_quota.value:g}) is live from Service "
                "Quotas.",
                **measured,
            )

        # `limit` repeats the currently applied quota on every point. Service Quotas
        # exposes only the value in force now, not a history of applied values, so a
        # limit raised mid-window is drawn at its current height across the whole window.
        data_points = [
            UsageDataPoint(
                timestamp=dp["Timestamp"].isoformat(),
                value=round(float(dp.get(statistic) or 0.0), 2),
                limit=primary_quota.value,
            )
            for dp in raw
        ]

        notes = [
            f"Daily {statistic} of {namespace}/{metric_name}, the usage metric AWS "
            f"publishes for '{primary_quota.quota_name}' in {self.region}. The limit line "
            f"is the quota applied now ({primary_quota.value:g}); Service Quotas does not "
            "expose historical limits."
        ]
        if len(data_points) < days:
            notes.append(
                f"{len(data_points)} of {days} days have datapoints - CloudWatch omits "
                "periods with no activity."
            )

        return UsageHistoryResponse(
            service_code=code,
            service_name=svc_info["name"],
            data_points=data_points,
            period_start=data_points[0].timestamp,
            period_end=data_points[-1].timestamp,
            current_usage=primary_quota.usage,
            current_limit=primary_quota.value,
            trend=_trend([dp.value for dp in data_points]),
            live=True,
            source="cloudwatch",
            note=" ".join(notes),
        )

    def _describe_quota(
        self, service_code: str, quota_code: str
    ) -> Tuple[Optional[dict], Optional[str], bool]:
        """Look up one quota: (quota dict, error message, whether AWS answered).

        GetServiceQuota returns the APPLIED value, which only exists once a quota has
        been adjusted; for a quota still sitting at its default it raises
        NoSuchResourceException. The old increase path called only GetServiceQuota and
        let that exception fall through to a generic failure, so requesting an increase
        on a never-adjusted quota - the overwhelmingly common case - reported a hard
        error. GetAWSDefaultServiceQuota is the documented companion and supplies the
        default value plus Adjustable.

        NoSuchResourceException also covers a genuinely wrong code or a quota absent
        from this region; both lookups then fail and that is reported as the error.
        """
        try:
            quota = self._sq().get_service_quota(
                ServiceCode=service_code, QuotaCode=quota_code
            ).get("Quota")
            if quota:
                return quota, None, True
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code != "NoSuchResourceException":
                return None, self._sq_error_message(e, service_code, quota_code), True
        except BotoCoreError as e:
            return None, f"Service Quotas unreachable in {self.region} ({type(e).__name__}).", False

        try:
            quota = self._sq().get_aws_default_service_quota(
                ServiceCode=service_code, QuotaCode=quota_code
            ).get("Quota")
            if quota:
                return quota, None, True
        except ClientError as e:
            return None, self._sq_error_message(e, service_code, quota_code), True
        except BotoCoreError as e:
            return None, f"Service Quotas unreachable in {self.region} ({type(e).__name__}).", False

        return (
            None,
            f"Service Quotas returned no quota '{quota_code}' for service "
            f"'{service_code}' in {self.region}.",
            True,
        )

    def _sq_error_message(self, e: ClientError, service_code: str, quota_code: str) -> str:
        """Turn a Service Quotas ClientError into something a FinOps operator can act on.

        Every branch names the region, because the most expensive failure mode on this
        surface is a call that succeeded against the wrong region (see __init__).
        """
        code = e.response.get("Error", {}).get("Code", "")
        detail = e.response.get("Error", {}).get("Message", "").strip()
        where = f"{service_code}/{quota_code} in {self.region}"
        if code == "NoSuchResourceException":
            return (
                f"No quota {where}. Service Quotas is per-region: the quota may exist in "
                "another region, or the service code may be wrong (CloudWatch is "
                "'monitoring')."
            )
        if code in ("AccessDeniedException", "DependencyAccessDeniedException"):
            missing = (
                "servicequotas:RequestServiceQuotaIncrease (and support:* for the case it "
                "opens)"
                if code == "DependencyAccessDeniedException"
                else "servicequotas:GetServiceQuota / RequestServiceQuotaIncrease"
            )
            return f"Access denied for {where}. The control plane role needs {missing}. {detail}".strip()
        if code == "InvalidResourceStateException":
            return f"Service Quotas rejected the state of {where}: {detail or code}"
        if code == "TooManyRequestsException":
            return f"Service Quotas throttled the request for {where}. Retry shortly."
        if code == "ServiceException":
            return f"Service Quotas returned a server error for {where}: {detail or code}"
        return f"Service Quotas error {code or type(e).__name__} for {where}: {detail}".strip()

    def _pending_change(self, service_code: str, quota_code: str) -> Optional[dict]:
        """The open increase request for this quota, if one exists.

        Called only after ResourceAlreadyExistsException, so the answer can name the
        existing case instead of telling the operator "already pending" with no way to
        find it. Filtering client-side rather than passing Status= keeps a future enum
        value from turning this diagnostic lookup into a validation error.
        """
        try:
            history = self._sq().list_requested_service_quota_change_history_by_quota(
                ServiceCode=service_code, QuotaCode=quota_code, MaxResults=20
            ).get("RequestedQuotas", [])
        except (BotoCoreError, ClientError) as e:
            logger.info(
                "Could not list pending quota changes for %s/%s in %s: %s",
                service_code, quota_code, self.region, e,
            )
            return None
        open_requests = [
            r for r in history if (r.get("Status") or "").upper() in _OPEN_REQUEST_STATUSES
        ]
        # botocore hands back timezone-aware datetimes; the sentinel has to be aware too
        # or a request missing Created makes the comparison raise TypeError.
        oldest = datetime.min.replace(tzinfo=timezone.utc)
        open_requests.sort(key=lambda r: r.get("Created") or oldest, reverse=True)
        return open_requests[0] if open_requests else None

    def request_increase(self, request: QuotaIncreaseRequest) -> QuotaIncreaseResponse:
        """Submit a real quota increase to AWS Service Quotas.

        This is a genuine write: RequestServiceQuotaIncrease opens a request (and, for
        most quotas, an AWS Support case) against `self.region`, the GOVERNED region.
        Three things the caller needs to know, all reflected in `message`:

          - The request's `reason` is NOT transmitted. RequestServiceQuotaIncrease takes
            only ServiceCode, QuotaCode and DesiredValue; there is no justification
            field. The reason is logged here so the decision is recoverable, but nobody
            at AWS reads it. Presenting the form as if AWS receives a justification is
            the kind of quiet lie this codebase is trying to remove.
          - The region is the governed one, named in every message, because a request
            filed against the wrong region succeeds and raises a limit nothing uses.
          - Status is AWS's, not ours: PENDING/CASE_OPENED means AWS accepted the
            request, not that capacity increased.
        """
        service_code = _normalize_service_code(request.service_code)
        quota_code = (request.quota_code or "").strip()

        quota, lookup_error, reached = self._describe_quota(service_code, quota_code)
        if quota is None:
            # A failed lookup is reported as an error, never as "denied": denied implies
            # AWS judged the request, and nothing was submitted here.
            return QuotaIncreaseResponse(
                case_id=None, request_id=None, status="error",
                message=lookup_error or f"Could not read quota {service_code}/{quota_code} in {self.region}.",
                live=reached,
                source="service-quotas" if reached else "unavailable-fallback",
            )

        current_value = quota.get("Value")
        quota_name = quota.get("QuotaName") or quota_code
        # Service Quotas reports an absent unit as the literal string "None".
        unit = quota.get("Unit") or ""
        unit = "" if unit == "None" else unit
        at_clause = (
            f", currently {current_value:g} {unit}".rstrip()
            if isinstance(current_value, (int, float))
            else ""
        )

        # The two pre-flight rejections below are "invalid", not "denied". Both used to
        # return "denied", which reads as AWS's verdict on a submitted request - but
        # nothing was submitted, and the route layer could not tell them apart from a real
        # AWS denial because all three carry live=true with case_id/request_id of None.
        # "error" would be wrong too: GetServiceQuota answered, so both numbers quoted
        # below are measured and there is nothing for the operator to retry or repair.
        # It is the request that cannot be filed. See models/govern_capacity.py.
        if not quota.get("Adjustable", False):
            return QuotaIncreaseResponse(
                case_id=None, request_id=None, status="invalid",
                message=(
                    f"'{quota_name}' in {self.region} is not adjustable through Service "
                    f"Quotas{at_clause}, so the requested {request.desired_value:g} cannot "
                    "be filed here. Open an AWS Support case, or reduce usage."
                ),
                live=True, source="service-quotas",
            )

        # Service Quotas rejects a decrease with IllegalArgumentException. Catching it
        # here lets the answer show both numbers instead of relaying an opaque error.
        if isinstance(current_value, (int, float)) and request.desired_value <= current_value:
            return QuotaIncreaseResponse(
                case_id=None, request_id=None, status="invalid",
                message=(
                    f"Requested {request.desired_value:g} is not above the current limit "
                    f"of {current_value:g} for '{quota_name}' in {self.region}. Service "
                    "Quotas only processes increases."
                ),
                live=True, source="service-quotas",
            )

        logger.info(
            "Requesting quota increase: %s/%s in %s from %s to %s. Reason (recorded here "
            "only, not sent to AWS): %s",
            service_code, quota_code, self.region, current_value,
            request.desired_value, request.reason,
        )

        try:
            response = self._sq().request_service_quota_increase(
                ServiceCode=service_code,
                QuotaCode=quota_code,
                DesiredValue=request.desired_value,
            )
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "ResourceAlreadyExistsException":
                pending = self._pending_change(service_code, quota_code) or {}
                asked = pending.get("DesiredValue")
                return QuotaIncreaseResponse(
                    case_id=pending.get("CaseId"),
                    request_id=pending.get("Id"),
                    status="pending",
                    message=(
                        f"An increase for '{quota_name}' in {self.region} is already open"
                        + (f" (requesting {asked:g})" if isinstance(asked, (int, float)) else "")
                        + (f", AWS Support case {pending['CaseId']}" if pending.get("CaseId") else "")
                        + ". AWS allows one open request per quota, so this one was not submitted."
                    ),
                    live=True, source="service-quotas",
                )
            if error_code in ("QuotaExceededException", "IllegalArgumentException"):
                # QuotaExceeded here is AWS's ceiling on the requested value, not the
                # quota itself; IllegalArgument is a malformed or non-increasing value.
                return QuotaIncreaseResponse(
                    case_id=None, request_id=None, status="denied",
                    message=(
                        f"Service Quotas rejected {request.desired_value:g} for "
                        f"'{quota_name}' in {self.region}: "
                        f"{e.response.get('Error', {}).get('Message', error_code)}"
                    ),
                    live=True, source="service-quotas",
                )
            # Permissions, throttling, wrong region, AWS-side faults: the request was
            # NOT judged, so it is an error the operator must fix, not a denial.
            logger.warning(
                "Quota increase for %s/%s in %s failed: %s",
                service_code, quota_code, self.region, e,
            )
            return QuotaIncreaseResponse(
                case_id=None, request_id=None, status="error",
                message=self._sq_error_message(e, service_code, quota_code),
                live=True, source="service-quotas",
            )
        except BotoCoreError as e:
            # No response from AWS at all: unknown whether anything was submitted, so
            # say that rather than implying a decision. live=False - nothing measured.
            logger.warning(
                "Service Quotas unreachable submitting an increase for %s/%s in %s: %s",
                service_code, quota_code, self.region, e,
            )
            return QuotaIncreaseResponse(
                case_id=None, request_id=None, status="error",
                message=(
                    f"Service Quotas in {self.region} did not respond "
                    f"({type(e).__name__}), so it is unconfirmed whether the request was "
                    "created. Check the Service Quotas console before retrying."
                ),
                live=False, source="unavailable-fallback",
            )

        requested = response.get("RequestedQuota", {}) or {}
        aws_status = (requested.get("Status") or "").upper()
        if aws_status in _APPROVED_REQUEST_STATUSES:
            status = "approved"
        elif aws_status in _REJECTED_REQUEST_STATUSES:
            status = "denied"
        elif aws_status in _OPEN_REQUEST_STATUSES or not aws_status:
            status = "submitted"
        else:
            # CASE_CLOSED and anything AWS adds later: report the raw status rather than
            # guessing which of our four buckets it belongs in.
            status = "submitted"

        case_id = requested.get("CaseId")
        from_clause = (
            f" (currently {current_value:g})" if isinstance(current_value, (int, float)) else ""
        )
        case_clause = f", Support case {case_id}" if case_id else ""
        message = (
            f"Requested {request.desired_value:g} for '{quota_name}' in {self.region}"
            f"{from_clause}. AWS status: {aws_status or 'PENDING'}{case_clause}. The limit "
            "does not change until AWS approves it, and the justification entered here is "
            "recorded in the control plane log only - Service Quotas has no field for it."
        )
        return QuotaIncreaseResponse(
            case_id=case_id,
            request_id=requested.get("Id"),
            status=status,
            message=message,
            live=True,
            source="service-quotas",
        )

    def _mock_quotas_response(self) -> QuotasResponse:
        """Return mock data when Service Quotas is unavailable."""
        mock_quotas = [
            ServiceQuota(
                service_code="bedrock",
                service_name="Amazon Bedrock",
                quota_code="L-BEDROCK-001",
                quota_name="Concurrent model invocations",
                value=100,
                unit="Count",
                usage=78,
                usage_pct=78.0,
                adjustable=True,
                global_quota=False,
                status="attention",
            ),
            ServiceQuota(
                service_code="bedrock",
                service_name="Amazon Bedrock",
                quota_code="L-BEDROCK-002",
                quota_name="Provisioned throughput units",
                value=10,
                unit="Count",
                usage=9,
                usage_pct=90.0,
                adjustable=True,
                global_quota=False,
                status="critical",
            ),
            ServiceQuota(
                service_code="sagemaker",
                service_name="Amazon SageMaker",
                quota_code="L-SAGEMAKER-001",
                quota_name="ml.g5.xlarge for endpoint usage",
                value=20,
                unit="Count",
                usage=15,
                usage_pct=75.0,
                adjustable=True,
                global_quota=False,
                status="attention",
            ),
            ServiceQuota(
                service_code="lambda",
                service_name="AWS Lambda",
                quota_code="L-LAMBDA-001",
                quota_name="Concurrent executions",
                value=1000,
                unit="Count",
                usage=450,
                usage_pct=45.0,
                adjustable=True,
                global_quota=False,
                status="ok",
            ),
            ServiceQuota(
                service_code="cloudwatch",
                service_name="Amazon CloudWatch",
                quota_code="L-CW-001",
                quota_name="Custom metrics",
                value=5000,
                unit="Count",
                usage=1200,
                usage_pct=24.0,
                adjustable=True,
                global_quota=False,
                status="ok",
            ),
            ServiceQuota(
                service_code="iam",
                service_name="AWS IAM",
                quota_code="L-IAM-001",
                quota_name="Roles per account",
                value=1000,
                unit="Count",
                usage=234,
                usage_pct=23.4,
                adjustable=True,
                global_quota=True,
                status="ok",
            ),
        ]

        mock_quotas.sort(key=lambda q: q.usage_pct, reverse=True)

        return QuotasResponse(
            quotas=mock_quotas,
            total_monitored=len(mock_quotas),
            at_risk_count=2,
            critical_count=1,
            live=False,
            source="unavailable-fallback",
            note="Service Quotas unavailable — showing illustrative data. Grant servicequotas:* permissions to see real quotas.",
        )
