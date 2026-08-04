"""Govern Developer AI service — queries CloudWatch for Claude Code / AI tool telemetry.

Reads OpenTelemetry metrics shipped to CloudWatch via the AWS Distro for
OpenTelemetry (ADOT) collector. Claude Code (and similar tools) emit:

Developer-assisted metrics:
- claude_code.token.usage (dimensions: type=input|output, user.id, team.id, ...)
- claude_code.cost.usage (dimensions: user.id, team.id, ...)
- claude_code.session.count (dimensions: user.id, tool, ...)

Agentic coding metrics (autonomous AI coding):
- claude_code.agent.task.count (dimensions: user, repo.name, repo.org, autonomy_level)
- claude_code.agent.task.duration (dimensions: user, repo.name, repo.org)
- claude_code.agent.commits (dimensions: user, repo.name, repo.org, approval.status)
- claude_code.agent.files_modified (dimensions: user, repo.name, repo.org, file_type)
- claude_code.agent.lines_added / lines_removed
- claude_code.agent.pr_created (dimensions: user, repo.name, repo.org, approval.status)

This service queries those metrics, aggregates by user/team/repo, detects anomalies,
identifies shadow AI (unapproved tools, unknown users), and surfaces governance risks
from agentic coding (unapproved commits, sensitive file changes, scope violations).

Follows the Govern slice pattern: lazy boto3, TTL cache, graceful fallback, live flag.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Set

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from models.govern_developer_ai import (
    AgenticCodingActivity,
    AgenticCodingGovernanceRisk,
    AgenticRepoActivity,
    AgenticUserActivity,
    AnomaliesResponse,
    ApprovalStatus,
    AutonomyLevel,
    DeveloperAIPostureResponse,
    DeveloperUsageByTeam,
    DeveloperUsageByUser,
    DeveloperUsageResponse,
    DeveloperUsageTrend,
    DeveloperUser,
    DeveloperUsersResponse,
    ShadowAIFinding,
    ShadowAIResponse,
    ShadowAiDetection,
    ShadowAiUnapprovedUser,
    ShadowAiUnknownTool,
    ShadowAiUnapprovedModel,
    UnapprovedAgenticAction,
    UsageAnomaly,
)

logger = logging.getLogger(__name__)

# CloudWatch metrics are delayed ~5 min; 10-min TTL keeps the surface snappy.
_DEVELOPER_AI_TTL = 600

# Default metric namespace for Claude Code OTel export
DEFAULT_NAMESPACE = "claude_code"


def _cache_note(result, cached_at: float):
    """Stamp 'cached as of' age onto a live response."""
    if not getattr(result, "live", False):
        return result
    age = time.time() - cached_at
    if age < 2:
        return result
    stamp = f"Cached {int(age)}s ago"
    result.note = f"{result.note} - {stamp}" if result.note else stamp
    return result


class GovernDeveloperAIService:
    """Service for querying developer AI usage from CloudWatch metrics."""

    def __init__(
        self,
        region: str = "us-east-1",
        namespace: str = DEFAULT_NAMESPACE,
        approved_tools: Optional[List[str]] = None,
        approved_user_domains: Optional[List[str]] = None,
        spend_spike_threshold: float = 2.0,
        runaway_token_rate: int = 100000,
    ):
        self.region = region
        self.namespace = namespace
        self._client = None  # lazy — don't touch AWS until first query
        self._logs_client = None
        # Shadow AI detection config
        self.approved_tools = approved_tools or ["claude-code"]
        self.approved_user_domains = approved_user_domains or []
        # Anomaly thresholds
        self.spend_spike_threshold = spend_spike_threshold  # current hour > N x 24h avg
        self.runaway_token_rate = runaway_token_rate  # tokens/hour threshold

    def _cw(self):
        """Lazy CloudWatch client."""
        if self._client is None:
            self._client = boto3.client("cloudwatch", region_name=self.region)
        return self._client

    def _logs(self):
        """Lazy CloudWatch Logs client for Insights queries."""
        if self._logs_client is None:
            self._logs_client = boto3.client("logs", region_name=self.region)
        return self._logs_client

    # -------------------------------------------------------------------------
    # Usage
    # -------------------------------------------------------------------------

    def get_usage(self, days: int = 7) -> DeveloperUsageResponse:
        """Cached wrapper around live usage fetch."""
        key = f"developer-ai:usage:{self.region}:{self.namespace}:{days}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._fetch_usage(days),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _fetch_usage(self, days: int = 7) -> DeveloperUsageResponse:
        """Query CloudWatch for developer AI token/cost/session metrics."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)
        period_start = start.strftime("%Y-%m-%d")
        period_end = end.strftime("%Y-%m-%d")

        try:
            cw = self._cw()

            # Query token usage by user
            user_metrics = self._query_metric_by_dimension(
                cw, f"{self.namespace}/token.usage", "user.id", start, end
            )

            # Query cost usage by user
            cost_metrics = self._query_metric_by_dimension(
                cw, f"{self.namespace}/cost.usage", "user.id", start, end
            )

            # Query session count by user
            session_metrics = self._query_metric_by_dimension(
                cw, f"{self.namespace}/session.count", "user.id", start, end
            )

            # Build by-user aggregation
            all_users: Set[str] = set(user_metrics.keys()) | set(cost_metrics.keys()) | set(session_metrics.keys())
            by_user: List[DeveloperUsageByUser] = []

            for user_id in all_users:
                tokens = user_metrics.get(user_id, {})
                cost = cost_metrics.get(user_id, 0.0)
                sessions = session_metrics.get(user_id, 0)

                input_tokens = int(tokens.get("input", 0))
                output_tokens = int(tokens.get("output", 0))

                by_user.append(DeveloperUsageByUser(
                    user_id=user_id,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=input_tokens + output_tokens,
                    total_cost_usd=round(cost, 2),
                    session_count=sessions,
                ))

            # Sort by cost descending
            by_user.sort(key=lambda u: u.total_cost_usd, reverse=True)

            # Aggregate by team
            team_agg: dict = {}
            for u in by_user:
                tid = u.team_id or "unassigned"
                if tid not in team_agg:
                    team_agg[tid] = {
                        "users": set(), "tokens": 0, "cost": 0.0, "sessions": 0,
                        "dept": u.department, "cc": u.cost_center,
                    }
                team_agg[tid]["users"].add(u.user_id)
                team_agg[tid]["tokens"] += u.total_tokens
                team_agg[tid]["cost"] += u.total_cost_usd
                team_agg[tid]["sessions"] += u.session_count

            by_team = [
                DeveloperUsageByTeam(
                    team_id=tid,
                    department=v["dept"],
                    cost_center=v["cc"],
                    user_count=len(v["users"]),
                    total_tokens=v["tokens"],
                    total_cost_usd=round(v["cost"], 2),
                    session_count=v["sessions"],
                )
                for tid, v in team_agg.items()
            ]
            by_team.sort(key=lambda t: t.total_cost_usd, reverse=True)

            # Build daily trend
            trend = self._build_daily_trend(cw, start, end)

            # Totals
            total_input = sum(u.input_tokens for u in by_user)
            total_output = sum(u.output_tokens for u in by_user)
            total_cost = round(sum(u.total_cost_usd for u in by_user), 2)
            total_sessions = sum(u.session_count for u in by_user)

            # Get CloudTrail-based shadow AI detection
            shadow_ai = self._get_shadow_ai_from_cloudtrail(days)

            return DeveloperUsageResponse(
                total_input_tokens=total_input,
                total_output_tokens=total_output,
                total_tokens=total_input + total_output,
                total_cost_usd=total_cost,
                total_sessions=total_sessions,
                active_users=len(by_user),
                by_user=by_user,
                by_team=by_team,
                trend=trend,
                period_start=period_start,
                period_end=period_end,
                shadow_ai=shadow_ai,
                live=len(by_user) > 0 or (shadow_ai and shadow_ai.total_shadow_events > 0),
                source="cloudwatch+cloudtrail" if shadow_ai else "cloudwatch",
                note=None if by_user else "No OTel metrics — shadow AI detection via CloudTrail.",
            )

        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("CloudWatch developer AI metrics unavailable: %s", e)
            # Fall back to CloudTrail-only shadow AI detection
            shadow_ai = self._get_shadow_ai_from_cloudtrail(days)
            return DeveloperUsageResponse(
                period_start=period_start,
                period_end=period_end,
                shadow_ai=shadow_ai,
                live=shadow_ai is not None and shadow_ai.total_shadow_events > 0,
                source="cloudtrail" if shadow_ai else "unavailable-fallback",
                note="OTel metrics unavailable — shadow AI detection via CloudTrail only.",
            )

    def _query_metric_by_dimension(
        self, cw, metric_name: str, dimension_name: str, start: datetime, end: datetime
    ) -> dict:
        """Query a metric grouped by a dimension, returning {dimension_value: sum}.

        Uses batched get_metric_data instead of N+1 get_metric_statistics calls.
        """
        try:
            # Use list_metrics to discover available metrics with dimensions
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName=metric_name.split("/")[-1],  # Strip namespace prefix if present
            )

            metrics_list = resp.get("Metrics", [])
            if not metrics_list:
                return {}

            # Build batched MetricDataQueries
            queries = []
            query_metadata = []  # Track dimension info for each query

            for i, metric in enumerate(metrics_list):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                dim_value = dims.get(dimension_name)
                if not dim_value:
                    continue

                query_id = f"m{i}"
                queries.append({
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": metric["MetricName"],
                            "Dimensions": metric["Dimensions"],
                        },
                        "Period": 86400 * 7,  # Aggregate over the full period
                        "Stat": "Sum",
                    },
                })
                query_metadata.append({
                    "id": query_id,
                    "dim_value": dim_value,
                    "token_type": dims.get("type"),
                })

            if not queries:
                return {}

            # Single batched API call (get_metric_data supports up to 500 queries)
            # Process in batches of 500 if needed
            results = {}
            for batch_start in range(0, len(queries), 500):
                batch_queries = queries[batch_start:batch_start + 500]
                batch_metadata = query_metadata[batch_start:batch_start + 500]

                data_resp = cw.get_metric_data(
                    MetricDataQueries=batch_queries,
                    StartTime=start,
                    EndTime=end,
                )

                # Process results - get_metric_data returns MetricDataResults
                id_to_metadata = {m["id"]: m for m in batch_metadata}
                for result in data_resp.get("MetricDataResults", []):
                    query_id = result.get("Id")
                    if query_id not in id_to_metadata:
                        continue

                    metadata = id_to_metadata[query_id]
                    dim_value = metadata["dim_value"]
                    token_type = metadata["token_type"]

                    # Sum all values in the result
                    total = sum(result.get("Values", []))

                    if dim_value in results:
                        if isinstance(results[dim_value], dict):
                            # Token metrics have input/output breakdown
                            t_type = token_type or "total"
                            results[dim_value][t_type] = results[dim_value].get(t_type, 0) + total
                        else:
                            results[dim_value] += total
                    else:
                        if token_type:
                            results[dim_value] = {token_type: total}
                        else:
                            results[dim_value] = total

            return results

        except (ClientError, BotoCoreError) as e:
            logger.debug("Metric query failed for %s: %s", metric_name, e)
            return {}

    def _build_daily_trend(self, cw, start: datetime, end: datetime) -> List[DeveloperUsageTrend]:
        """Build daily trend data points."""
        trend = []
        try:
            # Query daily aggregates
            resp = cw.get_metric_statistics(
                Namespace=self.namespace,
                MetricName="token.usage",
                StartTime=start,
                EndTime=end,
                Period=86400,  # 1 day
                Statistics=["Sum"],
            )

            for dp in sorted(resp.get("Datapoints", []), key=lambda x: x["Timestamp"]):
                trend.append(DeveloperUsageTrend(
                    date=dp["Timestamp"].strftime("%Y-%m-%d"),
                    total_cost_usd=0,  # Would need separate cost metric query
                    session_count=0,
                ))

        except (ClientError, BotoCoreError) as e:
            logger.debug("Daily trend query failed: %s", e)

        return trend

    # -------------------------------------------------------------------------
    # Users
    # -------------------------------------------------------------------------

    def get_users(self, days: int = 30) -> DeveloperUsersResponse:
        """Cached wrapper around live users fetch."""
        key = f"developer-ai:users:{self.region}:{self.namespace}:{days}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._fetch_users(days),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _fetch_users(self, days: int = 30) -> DeveloperUsersResponse:
        """List all users with developer AI tool usage."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)

        try:
            cw = self._cw()

            # Discover users from metrics
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName="session.count",
            )

            users: List[DeveloperUser] = []
            seen_users: Set[str] = set()

            for metric in resp.get("Metrics", []):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                user_id = dims.get("user.id")
                if not user_id or user_id in seen_users:
                    continue
                seen_users.add(user_id)

                tool = dims.get("tool", "claude-code")
                approved = tool in self.approved_tools

                # Check domain approval if configured
                email = dims.get("user.email")
                if email and self.approved_user_domains:
                    domain = email.split("@")[-1] if "@" in email else None
                    if domain and domain not in self.approved_user_domains:
                        approved = False

                users.append(DeveloperUser(
                    user_id=user_id,
                    email=email,
                    team_id=dims.get("team.id"),
                    department=dims.get("department"),
                    cost_center=dims.get("cost_center"),
                    tool=tool,
                    approved=approved,
                ))

            approved_count = sum(1 for u in users if u.approved)

            return DeveloperUsersResponse(
                users=users,
                total_count=len(users),
                approved_count=approved_count,
                unapproved_count=len(users) - approved_count,
                live=len(users) > 0,
                source="cloudwatch",
                note=None if users else "No developer AI users found — verify OTel export is configured.",
            )

        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("CloudWatch user discovery unavailable: %s", e)
            return DeveloperUsersResponse(
                users=[],
                total_count=0,
                live=False,
                source="unavailable-fallback",
                note="CloudWatch metrics unreachable — check IAM permissions.",
            )

    # -------------------------------------------------------------------------
    # Anomalies
    # -------------------------------------------------------------------------

    def get_anomalies(self, hours: int = 24) -> AnomaliesResponse:
        """Cached wrapper around live anomaly detection."""
        key = f"developer-ai:anomalies:{self.region}:{self.namespace}:{hours}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._detect_anomalies(hours),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _detect_anomalies(self, hours: int = 24) -> AnomaliesResponse:
        """Detect spend spikes and runaway loops in developer AI usage."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(hours=hours)
        baseline_start = end - timedelta(hours=hours * 7)  # 7x window for baseline

        anomalies: List[UsageAnomaly] = []

        try:
            cw = self._cw()

            # Detect spend spikes: current period vs baseline
            anomalies.extend(self._detect_spend_spikes(cw, start, end, baseline_start))

            # Detect runaway loops: sustained high token rate
            anomalies.extend(self._detect_runaway_loops(cw, start, end))

            # Sort by severity
            severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
            anomalies.sort(key=lambda a: severity_order.get(a.severity, 4))

            counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
            for a in anomalies:
                counts[a.severity] = counts.get(a.severity, 0) + 1

            return AnomaliesResponse(
                anomalies=anomalies,
                count=len(anomalies),
                critical_count=counts["critical"],
                high_count=counts["high"],
                medium_count=counts["medium"],
                low_count=counts["low"],
                live=True,
                source="cloudwatch",
            )

        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Anomaly detection failed: %s", e)
            return AnomaliesResponse(
                anomalies=[],
                count=0,
                live=False,
                source="unavailable-fallback",
                note="CloudWatch metrics unreachable for anomaly detection.",
            )

    def _detect_spend_spikes(
        self, cw, start: datetime, end: datetime, baseline_start: datetime
    ) -> List[UsageAnomaly]:
        """Detect users with spend > threshold x baseline average."""
        anomalies = []

        try:
            # Get current period spend by user
            current = self._query_metric_by_dimension(
                cw, "cost.usage", "user.id", start, end
            )

            # Get baseline spend by user
            baseline = self._query_metric_by_dimension(
                cw, "cost.usage", "user.id", baseline_start, start
            )

            hours_current = (end - start).total_seconds() / 3600
            hours_baseline = (start - baseline_start).total_seconds() / 3600

            for user_id, current_cost in current.items():
                if isinstance(current_cost, dict):
                    current_cost = sum(current_cost.values())

                baseline_cost = baseline.get(user_id, 0)
                if isinstance(baseline_cost, dict):
                    baseline_cost = sum(baseline_cost.values())

                # Normalize to hourly rate
                current_rate = current_cost / hours_current if hours_current > 0 else 0
                baseline_rate = baseline_cost / hours_baseline if hours_baseline > 0 else 0

                if baseline_rate > 0:
                    deviation = current_rate / baseline_rate
                    if deviation >= self.spend_spike_threshold:
                        severity = "critical" if deviation >= 5 else "high" if deviation >= 3 else "medium"
                        anomalies.append(UsageAnomaly(
                            anomaly_type="spend-spike",
                            severity=severity,
                            user_id=user_id,
                            description=f"Spend rate {deviation:.1f}x above baseline",
                            detected_at=end.isoformat(),
                            metric_value=round(current_rate, 2),
                            baseline_value=round(baseline_rate, 2),
                            deviation_factor=round(deviation, 2),
                            window_start=start.isoformat(),
                            window_end=end.isoformat(),
                        ))

        except (ClientError, BotoCoreError) as e:
            logger.debug("Spend spike detection failed: %s", e)

        return anomalies

    def _detect_runaway_loops(self, cw, start: datetime, end: datetime) -> List[UsageAnomaly]:
        """Detect sustained high token consumption indicating runaway agent loops."""
        anomalies = []

        try:
            # Get hourly token rates
            resp = cw.get_metric_statistics(
                Namespace=self.namespace,
                MetricName="token.usage",
                StartTime=start,
                EndTime=end,
                Period=3600,  # 1 hour
                Statistics=["Sum"],
            )

            for dp in resp.get("Datapoints", []):
                tokens = dp.get("Sum", 0)
                if tokens >= self.runaway_token_rate:
                    severity = "critical" if tokens >= self.runaway_token_rate * 5 else "high"
                    anomalies.append(UsageAnomaly(
                        anomaly_type="runaway-loop",
                        severity=severity,
                        description=f"High token rate ({int(tokens):,}/hour) suggests runaway agent loop",
                        detected_at=dp["Timestamp"].isoformat(),
                        metric_value=tokens,
                        baseline_value=self.runaway_token_rate,
                        deviation_factor=round(tokens / self.runaway_token_rate, 2),
                        window_start=dp["Timestamp"].isoformat(),
                        window_end=(dp["Timestamp"] + timedelta(hours=1)).isoformat(),
                    ))

        except (ClientError, BotoCoreError) as e:
            logger.debug("Runaway loop detection failed: %s", e)

        return anomalies

    # -------------------------------------------------------------------------
    # Shadow AI (CloudTrail-based)
    # -------------------------------------------------------------------------

    def _get_shadow_ai_from_cloudtrail(self, days: int = 7) -> Optional[ShadowAiDetection]:
        """Get shadow AI detection from CloudTrail Bedrock/SageMaker events.

        This provides live shadow AI detection even when OTel metrics aren't available.
        Queries CloudTrail for InvokeModel events and identifies:
        - Unapproved users (identities not in a governed list)
        - Unknown tools/callers (userAgent identifies the calling tool: claude-cli, cursor, etc.)
        - Unapproved models (models not in an approved list)
        """
        import json

        try:
            ct = boto3.client("cloudtrail", region_name=self.region)
            start = datetime.now(timezone.utc) - timedelta(days=days)

            # Query Bedrock invocation events
            unapproved_users: List[ShadowAiUnapprovedUser] = []
            unknown_tools: List[ShadowAiUnknownTool] = []
            unapproved_models: List[ShadowAiUnapprovedModel] = []
            total_events = 0
            cost_estimate = 0.0

            # Track seen identities to avoid duplicates
            seen_users: dict[str, dict] = {}
            seen_tools: dict[str, dict] = {}  # Keyed by userAgent
            seen_models: dict[str, dict] = {}

            # Look up Bedrock events
            for event_source in ["bedrock.amazonaws.com", "bedrock-runtime.amazonaws.com"]:
                try:
                    resp = ct.lookup_events(
                        LookupAttributes=[{"AttributeKey": "EventSource", "AttributeValue": event_source}],
                        StartTime=start,
                        MaxResults=200,
                    )

                    for event in resp.get("Events", []):
                        event_name = event.get("EventName", "")
                        username = event.get("Username", "unknown")
                        event_time = event.get("EventTime")

                        # Only count actual model invocations as shadow AI
                        if event_name not in ["InvokeModel", "InvokeModelWithResponseStream", "Converse", "ConverseStream"]:
                            continue

                        total_events += 1

                        # Parse the CloudTrailEvent JSON for more details
                        try:
                            ct_event = json.loads(event.get("CloudTrailEvent", "{}"))
                            request_params = ct_event.get("requestParameters") or {}
                            model_id = request_params.get("modelId", "unknown")
                            user_agent = ct_event.get("userAgent", "unknown")
                            user_identity = ct_event.get("userIdentity") or {}
                            # Note: sourceIPAddress is intentionally NOT collected for privacy/security
                        except Exception:
                            model_id = "unknown"
                            user_agent = "unknown"

                        event_time_str = event_time.isoformat() if event_time else datetime.now(timezone.utc).isoformat()

                        # Parse user agent to get tool name and version
                        # Examples: "claude-cli/2.1.214 (external, cli)", "Boto3/1.28.0", "aws-sdk-js/3.0"
                        tool_name = user_agent.split("/")[0] if "/" in user_agent else user_agent
                        tool_version = user_agent.split("/")[1].split(" ")[0] if "/" in user_agent else ""

                        # Track users with their tools
                        user_key = f"{username}"
                        if user_key not in seen_users:
                            seen_users[user_key] = {
                                "first_seen": event_time_str,
                                "last_seen": event_time_str,
                                "tokens": 0,
                                "events": 0,
                                "tools": set(),
                                "models": set(),
                            }
                        seen_users[user_key]["events"] += 1
                        seen_users[user_key]["tokens"] += 1000  # Estimate
                        seen_users[user_key]["tools"].add(tool_name)
                        seen_users[user_key]["models"].add(model_id)
                        if event_time_str > seen_users[user_key]["last_seen"]:
                            seen_users[user_key]["last_seen"] = event_time_str

                        # Track tools by userAgent (the actual calling application)
                        if tool_name and tool_name not in seen_tools:
                            seen_tools[tool_name] = {
                                "full_agent": user_agent,
                                "version": tool_version,
                                "first_seen": event_time_str,
                                "last_seen": event_time_str,
                                "users": set(),
                                "requests": 0,
                                "models": set(),
                                "evidence": f"userAgent: {user_agent}",
                            }
                        if tool_name:
                            seen_tools[tool_name]["users"].add(username)
                            seen_tools[tool_name]["requests"] += 1
                            seen_tools[tool_name]["models"].add(model_id)
                            if event_time_str > seen_tools[tool_name]["last_seen"]:
                                seen_tools[tool_name]["last_seen"] = event_time_str

                        # Track models
                        if model_id and model_id != "unknown":
                            if model_id not in seen_models:
                                seen_models[model_id] = {
                                    "users": set(),
                                    "tools": set(),
                                    "requests": 0,
                                    "cost": 0.0,
                                    "evidence": f"CloudTrail {event_name} invocation",
                                }
                            seen_models[model_id]["users"].add(username)
                            seen_models[model_id]["tools"].add(tool_name)
                            seen_models[model_id]["requests"] += 1
                            seen_models[model_id]["cost"] += 0.01  # Rough estimate per call

                except (ClientError, BotoCoreError) as e:
                    logger.debug("CloudTrail lookup for %s failed: %s", event_source, e)
                    continue

            # Convert to response objects
            # Users with their tool usage
            for user, data in seen_users.items():
                # Skip known platform accounts
                if user in ["ai-trust-platform-api", "SageMaker", "ConfigResourceCompositionSession"]:
                    continue
                tools_list = ", ".join(sorted(data["tools"]))
                unapproved_users.append(ShadowAiUnapprovedUser(
                    email=user,
                    first_seen=data["first_seen"],
                    tokens=data["tokens"],
                    source=f"cloudtrail ({tools_list})",
                    recommended_action=f"Review user — using: {tools_list}",
                ))

            # Tools (from userAgent) — show ALL tools, mark approved vs unknown
            # Known/approved tools list
            approved_tool_patterns = ["claude-cli", "claude-code", "aws-cli", "boto3", "aws-sdk"]

            for tool_name, data in sorted(seen_tools.items(), key=lambda x: -x[1]["requests"]):
                is_approved = any(pattern in tool_name.lower() for pattern in approved_tool_patterns)
                users_list = ", ".join(sorted(data["users"]))
                models_list = ", ".join(sorted(data["models"]))[:100]  # Truncate long model lists

                unknown_tools.append(ShadowAiUnknownTool(
                    tool_name=f"{tool_name} ({data['version']})" if data.get("version") else tool_name,
                    first_seen=data["first_seen"],
                    users=len(data["users"]),
                    requests=data["requests"],
                    evidence=f"Users: {users_list} | Models: {models_list}",
                    recommended_action="Approved tool" if is_approved else "Unknown tool — review and approve or block",
                ))

            # Models with tool breakdown
            for model_id, data in sorted(seen_models.items(), key=lambda x: -x[1]["requests"]):
                tools_list = ", ".join(sorted(data["tools"]))
                users_list = ", ".join(sorted(data["users"]))
                # Shorten model ID for display (remove ARN prefix)
                display_model = model_id.split("/")[-1] if "/" in model_id else model_id

                unapproved_models.append(ShadowAiUnapprovedModel(
                    model_id=display_model,
                    users=len(data["users"]),
                    requests=data["requests"],
                    cost=round(data["cost"], 2),
                    evidence=f"Tools: {tools_list} | Users: {users_list}",
                    recommended_action="Review model usage and add to governance policy",
                ))

            cost_estimate = sum(m.cost for m in unapproved_models)

            return ShadowAiDetection(
                unapproved_users=unapproved_users[:20],  # Top 20
                unknown_tools=unknown_tools[:20],  # All tools
                unapproved_models=unapproved_models[:20],
                total_shadow_events=total_events,
                shadow_cost_estimate=round(cost_estimate, 2),
            )

        except (ClientError, BotoCoreError) as e:
            logger.warning("CloudTrail shadow AI detection failed: %s", e)
            return None

    def get_shadow_ai(self, days: int = 30) -> ShadowAIResponse:
        """Cached wrapper around shadow AI detection."""
        key = f"developer-ai:shadow-ai:{self.region}:{self.namespace}:{days}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._detect_shadow_ai(days),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _detect_shadow_ai(self, days: int = 30) -> ShadowAIResponse:
        """Identify unapproved AI tool usage and unknown users."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)

        findings: List[ShadowAIFinding] = []

        try:
            cw = self._cw()

            # Check for unapproved tools
            findings.extend(self._find_unapproved_tools(cw, start, end))

            # Check for unknown/unapproved users
            findings.extend(self._find_unknown_users(cw, start, end))

            # Sort by severity
            severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
            findings.sort(key=lambda f: severity_order.get(f.severity, 4))

            by_type: dict = {}
            by_severity: dict = {}
            for f in findings:
                by_type[f.finding_type] = by_type.get(f.finding_type, 0) + 1
                by_severity[f.severity] = by_severity.get(f.severity, 0) + 1

            return ShadowAIResponse(
                findings=findings,
                total_count=len(findings),
                by_type=by_type,
                by_severity=by_severity,
                approved_tools=self.approved_tools,
                approved_user_domains=self.approved_user_domains,
                live=True,
                source="cloudwatch",
            )

        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("Shadow AI detection failed: %s", e)
            return ShadowAIResponse(
                findings=[],
                total_count=0,
                by_type={},
                by_severity={},
                approved_tools=self.approved_tools,
                approved_user_domains=self.approved_user_domains,
                live=False,
                source="unavailable-fallback",
                note="CloudWatch metrics unreachable for shadow AI detection.",
            )

    def _find_unapproved_tools(self, cw, start: datetime, end: datetime) -> List[ShadowAIFinding]:
        """Find usage of AI tools not in the approved list."""
        findings = []

        try:
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName="session.count",
            )

            seen_combos: Set[tuple] = set()

            for metric in resp.get("Metrics", []):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                tool = dims.get("tool", "unknown")
                user_id = dims.get("user.id")

                if tool not in self.approved_tools:
                    combo = (user_id, tool)
                    if combo in seen_combos:
                        continue
                    seen_combos.add(combo)

                    findings.append(ShadowAIFinding(
                        finding_type="unapproved-tool",
                        severity="high",
                        user_id=user_id,
                        email=dims.get("user.email"),
                        tool=tool,
                        description=f"Usage of unapproved AI tool: {tool}",
                        evidence=f"CloudWatch metric {self.namespace}/session.count with tool={tool}",
                        recommended_action=f"Review {tool} usage and either add to approved list or block access.",
                    ))

        except (ClientError, BotoCoreError) as e:
            logger.debug("Unapproved tool detection failed: %s", e)

        return findings

    def _find_unknown_users(self, cw, start: datetime, end: datetime) -> List[ShadowAIFinding]:
        """Find AI tool usage from users outside approved domains."""
        findings = []

        if not self.approved_user_domains:
            return findings  # No domain restriction configured

        try:
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName="session.count",
            )

            seen_users: Set[str] = set()

            for metric in resp.get("Metrics", []):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                user_id = dims.get("user.id")
                email = dims.get("user.email")

                if not email or user_id in seen_users:
                    continue
                seen_users.add(user_id)

                domain = email.split("@")[-1] if "@" in email else None
                if domain and domain not in self.approved_user_domains:
                    findings.append(ShadowAIFinding(
                        finding_type="unknown-user",
                        severity="medium",
                        user_id=user_id,
                        email=email,
                        tool=dims.get("tool"),
                        description=f"AI tool usage from unapproved domain: {domain}",
                        evidence=f"CloudWatch metric {self.namespace}/session.count with user.email={email}",
                        recommended_action=f"Verify {email} should have AI tool access and add domain to approved list if appropriate.",
                    ))

        except (ClientError, BotoCoreError) as e:
            logger.debug("Unknown user detection failed: %s", e)

        return findings

    # -------------------------------------------------------------------------
    # Agentic Coding
    # -------------------------------------------------------------------------

    # Sensitive file patterns for governance risk detection
    SENSITIVE_FILE_PATTERNS = [
        ".env", "secrets", "credentials", "config.json", "config.yaml", "config.yml",
        "settings.json", "settings.yaml", ".aws/", ".ssh/", "Dockerfile", "docker-compose",
        "terraform", ".tf", "cloudformation", "security", "auth", "password", "token",
        "certificate", ".pem", ".key", "deploy", "ci/", ".github/workflows",
    ]

    # Production repo indicators
    PROD_REPO_PATTERNS = ["prod", "production", "main", "release", "deploy", "infra"]

    def get_agentic_coding(self, period: str = "7d") -> AgenticCodingActivity:
        """Cached wrapper around live agentic coding fetch.

        Args:
            period: Time period - "24h", "7d", or "30d"
        """
        days = {"24h": 1, "7d": 7, "30d": 30}.get(period, 7)
        key = f"developer-ai:agentic:{self.region}:{self.namespace}:{days}"
        result, cached_at = get_or_load(
            key, _DEVELOPER_AI_TTL, lambda: self._fetch_agentic_coding(period, days),
            should_cache=lambda r: r.live,
        )
        return _cache_note(result, cached_at)

    def _fetch_agentic_coding(self, period: str, days: int) -> AgenticCodingActivity:
        """Query CloudWatch for agentic coding metrics.

        Agentic metrics (namespace: claude_code):
        - agent.task.count
        - agent.task.duration
        - agent.commits
        - agent.files_modified
        - agent.lines_added / agent.lines_removed
        - agent.pr_created
        """
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)

        try:
            cw = self._cw()

            # Query agentic metrics by user
            task_metrics = self._query_agentic_metric(cw, "agent.task.count", "user.id", start, end)
            duration_metrics = self._query_agentic_metric(cw, "agent.task.duration", "user.id", start, end, stat="Average")
            commit_metrics = self._query_agentic_metric(cw, "agent.commits", "user.id", start, end)
            pr_metrics = self._query_agentic_metric(cw, "agent.pr_created", "user.id", start, end)
            files_metrics = self._query_agentic_metric(cw, "agent.files_modified", "user.id", start, end)
            lines_added_metrics = self._query_agentic_metric(cw, "agent.lines_added", "user.id", start, end)
            lines_removed_metrics = self._query_agentic_metric(cw, "agent.lines_removed", "user.id", start, end)

            # Query metrics by repo
            repo_tasks = self._query_agentic_metric_by_repo(cw, "agent.task.count", start, end)
            repo_commits = self._query_agentic_metric_by_repo(cw, "agent.commits", start, end)
            repo_prs = self._query_agentic_metric_by_repo(cw, "agent.pr_created", start, end)

            # Query autonomy breakdown
            autonomy_metrics = self._query_agentic_by_dimension(cw, "agent.task.count", "autonomy_level", start, end)

            # Query unapproved activity
            unapproved_commits = self._query_unapproved_activity(cw, "agent.commits", start, end)
            unapproved_prs = self._query_unapproved_activity(cw, "agent.pr_created", start, end)

            # Build by-user aggregation
            all_users: Set[str] = (
                set(task_metrics.keys()) | set(commit_metrics.keys()) |
                set(pr_metrics.keys()) | set(files_metrics.keys())
            )
            by_user: List[AgenticUserActivity] = []

            for user in all_users:
                tasks = int(task_metrics.get(user, 0))
                avg_duration = duration_metrics.get(user, 0)
                commits = int(commit_metrics.get(user, 0))
                prs = int(pr_metrics.get(user, 0))
                files = int(files_metrics.get(user, 0))
                lines_add = int(lines_added_metrics.get(user, 0))
                lines_rm = int(lines_removed_metrics.get(user, 0))

                # Get user's autonomy breakdown
                user_autonomy = self._query_user_autonomy(cw, user, start, end)

                # Count unapproved actions for this user
                user_unapproved = sum(
                    1 for a in unapproved_commits + unapproved_prs
                    if a.user == user
                )

                by_user.append(AgenticUserActivity(
                    user=user,
                    tasks=tasks,
                    commits=commits,
                    prs_created=prs,
                    files_modified=files,
                    lines_added=lines_add,
                    lines_removed=lines_rm,
                    avg_task_duration_minutes=round(avg_duration / 60, 1) if avg_duration else 0,
                    autonomy_breakdown=user_autonomy,
                    unapproved_actions=user_unapproved,
                ))

            by_user.sort(key=lambda u: u.commits, reverse=True)

            # Build by-repo aggregation
            all_repos: Set[tuple] = set(repo_tasks.keys()) | set(repo_commits.keys()) | set(repo_prs.keys())
            by_repo: List[AgenticRepoActivity] = []

            for repo_key in all_repos:
                org, name = repo_key if isinstance(repo_key, tuple) else ("unknown", repo_key)
                tasks = int(repo_tasks.get(repo_key, 0))
                commits = int(repo_commits.get(repo_key, 0))
                prs = int(repo_prs.get(repo_key, 0))

                # Check for unapproved activity on this repo
                repo_unapproved = sum(
                    1 for a in unapproved_commits
                    if a.repo_org == org and a.repo_name == name
                )

                # Count sensitive file changes
                sensitive_changes = self._count_sensitive_file_changes(cw, org, name, start, end)

                # Check if this is a production repo
                is_prod = any(p in name.lower() for p in self.PROD_REPO_PATTERNS)

                by_repo.append(AgenticRepoActivity(
                    repo_org=org,
                    repo_name=name,
                    tasks=tasks,
                    commits=commits,
                    prs_created=prs,
                    unapproved_commits=repo_unapproved,
                    sensitive_file_changes=sensitive_changes,
                    is_production=is_prod,
                ))

            by_repo.sort(key=lambda r: r.commits, reverse=True)

            # Calculate governance risk
            governance_risk = self._calculate_governance_risk(
                by_repo, unapproved_commits, unapproved_prs, autonomy_metrics
            )

            # Totals
            total_tasks = sum(u.tasks for u in by_user)
            total_commits = sum(u.commits for u in by_user)
            total_prs = sum(u.prs_created for u in by_user)
            total_files = sum(u.files_modified for u in by_user)
            total_lines_added = sum(u.lines_added for u in by_user)
            total_lines_removed = sum(u.lines_removed for u in by_user)
            total_duration = sum(
                (duration_metrics.get(u.user, 0) * task_metrics.get(u.user, 1))
                for u in by_user
            )
            total_hours = total_duration / 3600 if total_duration else 0

            # Combine all unapproved activity
            all_unapproved = unapproved_commits + unapproved_prs
            all_unapproved.sort(key=lambda a: a.timestamp, reverse=True)

            # If no OTel data, fall back to CloudTrail
            if not by_user and not by_repo:
                return self._get_agentic_coding_from_cloudtrail(period, days)

            return AgenticCodingActivity(
                period=period,
                total_tasks=total_tasks,
                total_commits=total_commits,
                total_prs=total_prs,
                files_modified=total_files,
                lines_added=total_lines_added,
                lines_removed=total_lines_removed,
                unique_users=len(by_user),
                unique_repos=len(by_repo),
                avg_task_duration_minutes=round(total_duration / total_tasks / 60, 1) if total_tasks else 0,
                total_task_hours=round(total_hours, 1),
                by_user=by_user[:20],
                by_repo=by_repo[:20],
                autonomy_breakdown={
                    "full": autonomy_metrics.get("full", 0),
                    "supervised": autonomy_metrics.get("supervised", 0),
                    "pair": autonomy_metrics.get("pair", 0),
                },
                governance_risk=governance_risk,
                unapproved_activity=all_unapproved[:50],
                live=True,
                source="cloudwatch-otel",
            )

        except (ClientError, BotoCoreError, KeyError, ValueError) as e:
            logger.warning("CloudWatch agentic coding metrics unavailable: %s", e)
            # Fall back to CloudTrail-based agentic coding detection
            return self._get_agentic_coding_from_cloudtrail(period, days)

    def _get_agentic_coding_from_cloudtrail(self, period: str, days: int) -> AgenticCodingActivity:
        """Get agentic coding activity from CloudTrail Bedrock invocations.

        When OTel metrics aren't available, we can still detect Claude Code usage
        by looking at CloudTrail events with userAgent containing 'claude-cli'.
        """
        import json

        try:
            ct = boto3.client("cloudtrail", region_name=self.region)
            start = datetime.now(timezone.utc) - timedelta(days=days)

            # Track Claude Code activity by user
            user_activity: dict[str, dict] = {}
            total_requests = 0

            for event_source in ["bedrock.amazonaws.com", "bedrock-runtime.amazonaws.com"]:
                try:
                    resp = ct.lookup_events(
                        LookupAttributes=[{"AttributeKey": "EventSource", "AttributeValue": event_source}],
                        StartTime=start,
                        MaxResults=200,
                    )

                    for event in resp.get("Events", []):
                        event_name = event.get("EventName", "")
                        username = event.get("Username", "unknown")
                        event_time = event.get("EventTime")

                        # Only count model invocations
                        if event_name not in ["InvokeModel", "InvokeModelWithResponseStream", "Converse", "ConverseStream"]:
                            continue

                        # Parse CloudTrailEvent for userAgent
                        try:
                            ct_event = json.loads(event.get("CloudTrailEvent", "{}"))
                            user_agent = ct_event.get("userAgent", "unknown")
                            model_id = (ct_event.get("requestParameters") or {}).get("modelId", "unknown")
                        except Exception:
                            user_agent = "unknown"
                            model_id = "unknown"

                        # Check if this is Claude Code (claude-cli in userAgent)
                        is_claude_code = "claude-cli" in user_agent.lower() or "claude-code" in user_agent.lower()

                        if not is_claude_code:
                            continue  # Only track Claude Code for agentic coding

                        total_requests += 1
                        event_time_str = event_time.isoformat() if event_time else datetime.now(timezone.utc).isoformat()

                        # Parse version from userAgent
                        tool_version = ""
                        if "/" in user_agent:
                            tool_version = user_agent.split("/")[1].split(" ")[0]

                        if username not in user_activity:
                            user_activity[username] = {
                                "requests": 0,
                                "models": set(),
                                "first_seen": event_time_str,
                                "last_seen": event_time_str,
                                "tool_version": tool_version,
                            }

                        user_activity[username]["requests"] += 1
                        user_activity[username]["models"].add(model_id.split("/")[-1] if "/" in model_id else model_id)
                        if event_time_str > user_activity[username]["last_seen"]:
                            user_activity[username]["last_seen"] = event_time_str
                            user_activity[username]["tool_version"] = tool_version

                except (ClientError, BotoCoreError) as e:
                    logger.debug("CloudTrail lookup for %s failed: %s", event_source, e)
                    continue

            # Build by-user list
            by_user: List[AgenticUserActivity] = []
            for user, data in sorted(user_activity.items(), key=lambda x: -x[1]["requests"]):
                models_str = ", ".join(sorted(data["models"]))
                by_user.append(AgenticUserActivity(
                    user=user,
                    email=user,
                    tasks=data["requests"],  # Each request = a task
                    commits=0,  # Can't determine from CloudTrail
                    prs_created=0,
                    files_modified=0,
                    lines_added=0,
                    lines_removed=0,
                    avg_task_duration_minutes=0,
                    autonomy_breakdown={"full": 0, "supervised": data["requests"], "pair": 0},
                    unapproved_actions=0,
                ))

            has_data = len(by_user) > 0

            return AgenticCodingActivity(
                period=period,
                total_tasks=total_requests,
                total_commits=0,
                total_prs=0,
                files_modified=0,
                lines_added=0,
                lines_removed=0,
                unique_users=len(by_user),
                unique_repos=0,
                avg_task_duration_minutes=0,
                total_task_hours=0,
                by_user=by_user[:20],
                by_repo=[],
                autonomy_breakdown={
                    "full": 0,
                    "supervised": total_requests,
                    "pair": 0,
                },
                mode_breakdown={
                    "agentic": total_requests,
                    "assisted": 0,
                    "chat": 0,
                },
                governance_risk=AgenticCodingGovernanceRisk(
                    unapproved_commits=0,
                    unapproved_prs_merged=0,
                    sensitive_file_changes=0,
                    high_autonomy_on_prod_repos=0,
                    scope_exceeded_count=0,
                    risk_score=0.0,
                    risk_level="low",
                    top_risks=[],
                ),
                unapproved_activity=[],
                live=has_data,
                source="cloudtrail",
                note=f"Claude Code activity from CloudTrail ({total_requests} Bedrock requests)" if has_data else "No Claude Code activity found in CloudTrail.",
            )

        except Exception as e:
            logger.warning("CloudTrail agentic coding detection failed: %s", e)
            return AgenticCodingActivity(
                period=period,
                live=False,
                source="unavailable-fallback",
                note="CloudTrail unavailable for agentic coding detection.",
            )

    def _query_agentic_metric(
        self, cw, metric_name: str, dimension_name: str, start: datetime, end: datetime,
        stat: str = "Sum"
    ) -> dict:
        """Query an agentic metric grouped by a dimension.

        Uses batched get_metric_data instead of N+1 get_metric_statistics calls.
        """
        try:
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName=metric_name,
            )

            metrics_list = resp.get("Metrics", [])
            if not metrics_list:
                return {}

            # Build batched MetricDataQueries
            queries = []
            query_metadata = []

            for i, metric in enumerate(metrics_list):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                dim_value = dims.get(dimension_name)
                if not dim_value:
                    continue

                query_id = f"m{i}"
                queries.append({
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": metric["MetricName"],
                            "Dimensions": metric["Dimensions"],
                        },
                        "Period": 86400 * 30,  # Aggregate over the full period
                        "Stat": stat,
                    },
                })
                query_metadata.append({"id": query_id, "dim_value": dim_value})

            if not queries:
                return {}

            # Single batched API call (process in batches of 500 if needed)
            results = {}
            for batch_start in range(0, len(queries), 500):
                batch_queries = queries[batch_start:batch_start + 500]
                batch_metadata = query_metadata[batch_start:batch_start + 500]

                data_resp = cw.get_metric_data(
                    MetricDataQueries=batch_queries,
                    StartTime=start,
                    EndTime=end,
                )

                # Process results
                id_to_metadata = {m["id"]: m for m in batch_metadata}
                for result in data_resp.get("MetricDataResults", []):
                    query_id = result.get("Id")
                    if query_id not in id_to_metadata:
                        continue

                    dim_value = id_to_metadata[query_id]["dim_value"]
                    total = sum(result.get("Values", []))
                    results[dim_value] = results.get(dim_value, 0) + total

            return results

        except (ClientError, BotoCoreError) as e:
            logger.debug("Agentic metric query failed for %s: %s", metric_name, e)
            return {}

    def _query_agentic_metric_by_repo(
        self, cw, metric_name: str, start: datetime, end: datetime
    ) -> dict:
        """Query an agentic metric grouped by repo (org, name).

        Uses batched get_metric_data instead of N+1 get_metric_statistics calls.
        """
        try:
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName=metric_name,
            )

            metrics_list = resp.get("Metrics", [])
            if not metrics_list:
                return {}

            # Build batched MetricDataQueries
            queries = []
            query_metadata = []

            for i, metric in enumerate(metrics_list):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                org = dims.get("repo.org", "unknown")
                name = dims.get("repo.name")
                if not name:
                    continue

                repo_key = (org, name)
                query_id = f"m{i}"
                queries.append({
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": metric["MetricName"],
                            "Dimensions": metric["Dimensions"],
                        },
                        "Period": 86400 * 30,
                        "Stat": "Sum",
                    },
                })
                query_metadata.append({"id": query_id, "repo_key": repo_key})

            if not queries:
                return {}

            # Single batched API call (process in batches of 500 if needed)
            results = {}
            for batch_start in range(0, len(queries), 500):
                batch_queries = queries[batch_start:batch_start + 500]
                batch_metadata = query_metadata[batch_start:batch_start + 500]

                data_resp = cw.get_metric_data(
                    MetricDataQueries=batch_queries,
                    StartTime=start,
                    EndTime=end,
                )

                # Process results
                id_to_metadata = {m["id"]: m for m in batch_metadata}
                for result in data_resp.get("MetricDataResults", []):
                    query_id = result.get("Id")
                    if query_id not in id_to_metadata:
                        continue

                    repo_key = id_to_metadata[query_id]["repo_key"]
                    total = sum(result.get("Values", []))
                    results[repo_key] = results.get(repo_key, 0) + total

            return results

        except (ClientError, BotoCoreError) as e:
            logger.debug("Repo metric query failed for %s: %s", metric_name, e)
            return {}

    def _query_agentic_by_dimension(
        self, cw, metric_name: str, dimension_name: str, start: datetime, end: datetime
    ) -> dict:
        """Query an agentic metric breakdown by a specific dimension (e.g., autonomy_level).

        Uses batched get_metric_data instead of N+1 get_metric_statistics calls.
        """
        try:
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName=metric_name,
            )

            metrics_list = resp.get("Metrics", [])
            if not metrics_list:
                return {}

            # Build batched MetricDataQueries
            queries = []
            query_metadata = []

            for i, metric in enumerate(metrics_list):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                dim_value = dims.get(dimension_name)
                if not dim_value:
                    continue

                query_id = f"m{i}"
                queries.append({
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": metric["MetricName"],
                            "Dimensions": metric["Dimensions"],
                        },
                        "Period": 86400 * 30,
                        "Stat": "Sum",
                    },
                })
                query_metadata.append({"id": query_id, "dim_value": dim_value})

            if not queries:
                return {}

            # Single batched API call (process in batches of 500 if needed)
            results = {}
            for batch_start in range(0, len(queries), 500):
                batch_queries = queries[batch_start:batch_start + 500]
                batch_metadata = query_metadata[batch_start:batch_start + 500]

                data_resp = cw.get_metric_data(
                    MetricDataQueries=batch_queries,
                    StartTime=start,
                    EndTime=end,
                )

                # Process results
                id_to_metadata = {m["id"]: m for m in batch_metadata}
                for result in data_resp.get("MetricDataResults", []):
                    query_id = result.get("Id")
                    if query_id not in id_to_metadata:
                        continue

                    dim_value = id_to_metadata[query_id]["dim_value"]
                    total = sum(result.get("Values", []))
                    results[dim_value] = results.get(dim_value, 0) + int(total)

            return results

        except (ClientError, BotoCoreError) as e:
            logger.debug("Dimension query failed for %s/%s: %s", metric_name, dimension_name, e)
            return {}

    def _query_user_autonomy(self, cw, user: str, start: datetime, end: datetime) -> dict:
        """Query autonomy level breakdown for a specific user.

        Uses batched get_metric_data instead of 3 separate get_metric_statistics calls.
        """
        try:
            autonomy_levels = ["full", "supervised", "pair"]

            # Build batched MetricDataQueries for all autonomy levels
            queries = [
                {
                    "Id": f"m{i}",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": "agent.task.count",
                            "Dimensions": [
                                {"Name": "user.id", "Value": user},
                                {"Name": "autonomy_level", "Value": level},
                            ],
                        },
                        "Period": 86400 * 30,
                        "Stat": "Sum",
                    },
                }
                for i, level in enumerate(autonomy_levels)
            ]

            # Single batched API call
            data_resp = cw.get_metric_data(
                MetricDataQueries=queries,
                StartTime=start,
                EndTime=end,
            )

            # Process results
            autonomy = {"full": 0, "supervised": 0, "pair": 0}
            for result in data_resp.get("MetricDataResults", []):
                query_id = result.get("Id")
                if query_id and query_id.startswith("m"):
                    idx = int(query_id[1:])
                    if 0 <= idx < len(autonomy_levels):
                        level = autonomy_levels[idx]
                        autonomy[level] = int(sum(result.get("Values", [])))

            return autonomy

        except (ClientError, BotoCoreError) as e:
            logger.debug("User autonomy query failed for %s: %s", user, e)
            return {"full": 0, "supervised": 0, "pair": 0}

    def _query_unapproved_activity(
        self, cw, metric_name: str, start: datetime, end: datetime
    ) -> List[UnapprovedAgenticAction]:
        """Query for activity without approval (approval.status = none).

        Uses batched get_metric_data instead of N+1 get_metric_statistics calls.
        """
        actions = []

        try:
            resp = cw.list_metrics(
                Namespace=self.namespace,
                MetricName=metric_name,
            )

            metrics_list = resp.get("Metrics", [])
            if not metrics_list:
                return actions

            # Build batched queries and metadata for unapproved metrics only
            queries = []
            query_metadata = []

            for i, metric in enumerate(metrics_list):
                dims = {d["Name"]: d["Value"] for d in metric.get("Dimensions", [])}
                approval_status = dims.get("approval.status", "").lower()

                # Only include unapproved activity
                if approval_status not in ["none", "denied"]:
                    continue

                user = dims.get("user.id", "unknown")
                repo_org = dims.get("repo.org", "unknown")
                repo_name = dims.get("repo.name", "unknown")
                autonomy = dims.get("autonomy_level", "full")
                file_type = dims.get("file_type", "")

                # Check for sensitive files
                sensitive_files = []
                if file_type:
                    for pattern in self.SENSITIVE_FILE_PATTERNS:
                        if pattern.lower() in file_type.lower():
                            sensitive_files.append(file_type)
                            break

                # Determine action type from metric name
                action = "commit" if "commit" in metric_name else "pr_create"

                # Determine risk level
                is_prod = any(p in repo_name.lower() for p in self.PROD_REPO_PATTERNS)
                has_sensitive = len(sensitive_files) > 0
                is_full_auto = autonomy == "full"

                if is_prod and has_sensitive and is_full_auto:
                    risk_level = "critical"
                elif is_prod or (has_sensitive and is_full_auto):
                    risk_level = "high"
                elif has_sensitive or is_full_auto:
                    risk_level = "medium"
                else:
                    risk_level = "low"

                query_id = f"m{i}"
                queries.append({
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": metric["MetricName"],
                            "Dimensions": metric["Dimensions"],
                        },
                        "Period": 3600,  # Hourly for more granular timestamps
                        "Stat": "Sum",
                    },
                    "ReturnData": True,
                })
                query_metadata.append({
                    "id": query_id,
                    "user": user,
                    "repo_org": repo_org,
                    "repo_name": repo_name,
                    "action": action,
                    "approval_status": approval_status,
                    "autonomy": autonomy,
                    "sensitive_files": sensitive_files,
                    "risk_level": risk_level,
                })

            if not queries:
                return actions

            # Single batched API call (process in batches of 500 if needed)
            for batch_start in range(0, len(queries), 500):
                batch_queries = queries[batch_start:batch_start + 500]
                batch_metadata = query_metadata[batch_start:batch_start + 500]

                data_resp = cw.get_metric_data(
                    MetricDataQueries=batch_queries,
                    StartTime=start,
                    EndTime=end,
                )

                # Process results
                id_to_metadata = {m["id"]: m for m in batch_metadata}
                for result in data_resp.get("MetricDataResults", []):
                    query_id = result.get("Id")
                    if query_id not in id_to_metadata:
                        continue

                    metadata = id_to_metadata[query_id]
                    timestamps = result.get("Timestamps", [])
                    values = result.get("Values", [])

                    # Create an action for each non-zero datapoint
                    for ts, val in zip(timestamps, values):
                        if val > 0:
                            actions.append(UnapprovedAgenticAction(
                                user=metadata["user"],
                                repo_org=metadata["repo_org"],
                                repo_name=metadata["repo_name"],
                                action=metadata["action"],
                                timestamp=ts.isoformat(),
                                approval_required=True,
                                approval_status=ApprovalStatus.NONE if metadata["approval_status"] == "none" else ApprovalStatus.DENIED,
                                autonomy_level=AutonomyLevel(metadata["autonomy"]) if metadata["autonomy"] in ["full", "supervised", "pair"] else AutonomyLevel.FULL,
                                sensitive_files=metadata["sensitive_files"],
                                risk_level=metadata["risk_level"],
                                details=f"{metric_name} without approval on {metadata['repo_org']}/{metadata['repo_name']}",
                            ))

        except (ClientError, BotoCoreError) as e:
            logger.debug("Unapproved activity query failed for %s: %s", metric_name, e)

        return actions

    def _count_sensitive_file_changes(
        self, cw, repo_org: str, repo_name: str, start: datetime, end: datetime
    ) -> int:
        """Count changes to sensitive files in a repo.

        Uses batched get_metric_data instead of N+1 get_metric_statistics calls.
        """
        try:
            # Build batched MetricDataQueries for all sensitive file patterns
            queries = [
                {
                    "Id": f"m{i}",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": self.namespace,
                            "MetricName": "agent.files_modified",
                            "Dimensions": [
                                {"Name": "repo.org", "Value": repo_org},
                                {"Name": "repo.name", "Value": repo_name},
                                {"Name": "file_type", "Value": pattern},
                            ],
                        },
                        "Period": 86400 * 30,
                        "Stat": "Sum",
                    },
                }
                for i, pattern in enumerate(self.SENSITIVE_FILE_PATTERNS)
            ]

            # Single batched API call
            data_resp = cw.get_metric_data(
                MetricDataQueries=queries,
                StartTime=start,
                EndTime=end,
            )

            # Sum all results
            count = 0
            for result in data_resp.get("MetricDataResults", []):
                count += int(sum(result.get("Values", [])))

            return count

        except (ClientError, BotoCoreError) as e:
            logger.debug("Sensitive file count failed for %s/%s: %s", repo_org, repo_name, e)
            return 0

    def _calculate_governance_risk(
        self,
        by_repo: List[AgenticRepoActivity],
        unapproved_commits: List[UnapprovedAgenticAction],
        unapproved_prs: List[UnapprovedAgenticAction],
        autonomy_metrics: dict,
    ) -> AgenticCodingGovernanceRisk:
        """Calculate aggregate governance risk from agentic coding activity."""

        unapproved_commit_count = len(unapproved_commits)
        unapproved_pr_count = len([a for a in unapproved_prs if a.action == "pr_merge"])
        sensitive_changes = sum(r.sensitive_file_changes for r in by_repo)

        # Count high-autonomy tasks on production repos
        prod_repos = [r for r in by_repo if r.is_production]
        high_auto_prod = sum(r.tasks for r in prod_repos)  # Simplified — would need cross-ref

        # Scope exceeded (placeholder — would need policy comparison)
        scope_exceeded = 0

        # Calculate risk score (0-100)
        # Weights: unapproved commits (30), unapproved PRs (25), sensitive (25), prod auto (15), scope (5)
        risk_score = min(100, (
            min(30, unapproved_commit_count * 3) +
            min(25, unapproved_pr_count * 5) +
            min(25, sensitive_changes * 2.5) +
            min(15, high_auto_prod * 1.5) +
            min(5, scope_exceeded * 2.5)
        ))

        # Determine risk level
        if risk_score >= 75:
            risk_level = "critical"
        elif risk_score >= 50:
            risk_level = "high"
        elif risk_score >= 25:
            risk_level = "medium"
        else:
            risk_level = "low"

        # Top risks
        top_risks = []
        if unapproved_commit_count > 0:
            top_risks.append(f"{unapproved_commit_count} commits without human review")
        if unapproved_pr_count > 0:
            top_risks.append(f"{unapproved_pr_count} PRs merged without approval")
        if sensitive_changes > 0:
            top_risks.append(f"{sensitive_changes} changes to sensitive files")
        if high_auto_prod > 0:
            top_risks.append(f"{high_auto_prod} high-autonomy tasks on production repos")

        return AgenticCodingGovernanceRisk(
            unapproved_commits=unapproved_commit_count,
            unapproved_prs_merged=unapproved_pr_count,
            sensitive_file_changes=sensitive_changes,
            high_autonomy_on_prod_repos=high_auto_prod,
            scope_exceeded_count=scope_exceeded,
            risk_score=round(risk_score, 1),
            risk_level=risk_level,
            top_risks=top_risks[:3],
        )

    # -------------------------------------------------------------------------
    # Combined Posture
    # -------------------------------------------------------------------------

    def get_posture(self, period: str = "7d") -> DeveloperAIPostureResponse:
        """Get combined developer AI posture including assisted and agentic coding.

        Args:
            period: Time period - "24h", "7d", or "30d"
        """
        days = {"24h": 1, "7d": 7, "30d": 30}.get(period, 7)

        # Get both assisted and agentic metrics
        assisted = self.get_usage(days=days)
        agentic = self.get_agentic_coding(period=period)

        # Calculate cross-cutting metrics
        assisted_hours = assisted.total_sessions * 0.5  # Estimate 30 min per session
        agentic_hours = agentic.total_task_hours
        total_hours = assisted_hours + agentic_hours

        agentic_ratio = agentic_hours / total_hours if total_hours > 0 else 0

        # Check governance compliance (no critical risks)
        governance_compliant = agentic.governance_risk.risk_level != "critical"
        critical_risks = sum(
            1 for a in agentic.unapproved_activity if a.risk_level == "critical"
        )

        # Determine if any source is live
        live = assisted.live or agentic.live

        return DeveloperAIPostureResponse(
            assisted=assisted,
            agentic=agentic,
            total_ai_coding_hours=round(total_hours, 1),
            agentic_ratio=round(agentic_ratio, 3),
            governance_compliant=governance_compliant,
            critical_risks=critical_risks,
            period=period,
            live=live,
            source="cloudwatch-otel",
            note=None if live else "No developer AI metrics available — verify OTel export configuration.",
        )
