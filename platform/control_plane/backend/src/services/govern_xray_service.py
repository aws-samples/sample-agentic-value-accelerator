"""Govern X-Ray service - distributed tracing for agent observability.

Fetches trace summaries, service graphs, and trace details from AWS X-Ray.
Short TTL cache (2 min) since traces are recent data. Graceful fallback if
X-Ray is not enabled or not permitted.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from core.ttl_cache import get_or_load
from models.govern_xray import (
    ServiceGraphResponse,
    ServiceNode,
    TraceDetail,
    TraceSegment,
    TraceSummary,
    TraceSummaryResponse,
)

logger = logging.getLogger(__name__)

_XRAY_TTL = 120  # 2 min cache
_MAX_TRACES = 100


class GovernXRayService:
    def __init__(self, region: str = "us-east-1"):
        self.region = region

    def get_trace_summaries(
        self, hours: int = 1, filter_expression: str | None = None
    ) -> TraceSummaryResponse:
        """Get recent trace summaries with optional filter."""

        def _fetch() -> TraceSummaryResponse:
            return self._fetch_trace_summaries(hours, filter_expression)

        cache_key = f"xray:summaries:{self.region}:{hours}:{filter_expression or 'all'}"
        result, cached_at = get_or_load(
            cache_key, _XRAY_TTL, _fetch, should_cache=lambda r: r.live
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} - {stamp}" if result.note else stamp}
            )
        return result

    def _fetch_trace_summaries(
        self, hours: int, filter_expression: str | None
    ) -> TraceSummaryResponse:
        try:
            xray = boto3.client("xray", region_name=self.region)
            end_time = datetime.now(timezone.utc)
            start_time = end_time - timedelta(hours=hours)

            params: dict = {
                "StartTime": start_time,
                "EndTime": end_time,
            }
            if filter_expression:
                params["FilterExpression"] = filter_expression

            traces: list[TraceSummary] = []
            paginator = xray.get_paginator("get_trace_summaries")

            for page in paginator.paginate(
                **params, PaginationConfig={"MaxItems": _MAX_TRACES}
            ):
                for ts in page.get("TraceSummaries", []):
                    http = ts.get("Http", {}) or {}
                    traces.append(
                        TraceSummary(
                            trace_id=ts.get("Id", ""),
                            duration=ts.get("Duration"),
                            response_time=ts.get("ResponseTime"),
                            has_fault=ts.get("HasFault", False),
                            has_error=ts.get("HasError", False),
                            has_throttle=ts.get("HasThrottle", False),
                            is_partial=ts.get("IsPartial", False),
                            http_status=http.get("HttpStatus"),
                            http_method=http.get("HttpMethod"),
                            http_url=http.get("HttpURL"),
                            service_ids=[
                                s.get("Name", "") for s in ts.get("ServiceIds", [])
                            ],
                            annotations={
                                k: v[0].get("AnnotationValue", {}).get("StringValue", "")
                                if v else ""
                                for k, v in (ts.get("Annotations") or {}).items()
                            },
                            users=[u.get("UserName", "") for u in ts.get("Users", [])],
                        )
                    )

            return TraceSummaryResponse(
                traces=traces,
                total=len(traces),
                has_faults=sum(1 for t in traces if t.has_fault),
                has_errors=sum(1 for t in traces if t.has_error),
                start_time=start_time.isoformat(),
                end_time=end_time.isoformat(),
                live=True,
            )

        except (ClientError, BotoCoreError) as e:
            logger.info("X-Ray unavailable: %s", e)
            end_time = datetime.now(timezone.utc)
            start_time = end_time - timedelta(hours=hours)
            return TraceSummaryResponse(
                traces=[],
                total=0,
                has_faults=0,
                has_errors=0,
                start_time=start_time.isoformat(),
                end_time=end_time.isoformat(),
                live=False,
                note="X-Ray not enabled or not permitted.",
            )

    def get_service_graph(self, hours: int = 1) -> ServiceGraphResponse:
        """Get the service graph for agent dependencies."""

        def _fetch() -> ServiceGraphResponse:
            return self._fetch_service_graph(hours)

        cache_key = f"xray:graph:{self.region}:{hours}"
        result, cached_at = get_or_load(
            cache_key, _XRAY_TTL, _fetch, should_cache=lambda r: r.live
        )
        if result.live and (time.time() - cached_at) >= 2:
            stamp = f"Cached {int(time.time() - cached_at)}s ago"
            # ttl_cache hands back the object it still holds, so mutating result.note
            # would append a stamp per hit and grow the cached note without bound.
            # model_copy swaps only this top-level scalar, leaving the cache entry intact.
            result = result.model_copy(
                update={"note": f"{result.note} - {stamp}" if result.note else stamp}
            )
        return result

    def _fetch_service_graph(self, hours: int) -> ServiceGraphResponse:
        try:
            xray = boto3.client("xray", region_name=self.region)
            # X-Ray GetServiceGraph rejects windows longer than 6 hours.
            hours = min(hours, 6)
            end_time = datetime.now(timezone.utc)
            start_time = end_time - timedelta(hours=hours)

            services: list[ServiceNode] = []
            paginator = xray.get_paginator("get_service_graph")

            # Collect all services first so edge ReferenceIds (integer indices into
            # the service list) can be resolved to connected service names.
            raw_services: list[dict] = []
            for page in paginator.paginate(StartTime=start_time, EndTime=end_time):
                raw_services.extend(page.get("Services", []))

            id_to_name = {
                s.get("ReferenceId"): s.get("Name", "unknown") for s in raw_services
            }

            for svc in raw_services:
                stats = svc.get("SummaryStatistics", {}) or {}
                # X-Ray Edges[].ReferenceId is an int index; resolve to service names.
                edges = [
                    id_to_name[e["ReferenceId"]]
                    for e in svc.get("Edges", [])
                    if e.get("ReferenceId") in id_to_name
                ]
                total_count = stats.get("TotalCount") or 0
                total_rt = stats.get("TotalResponseTime")  # cumulative seconds
                services.append(
                    ServiceNode(
                        name=svc.get("Name", "unknown"),
                        type=svc.get("Type", "unknown"),
                        edges=edges,
                        response_time_avg_ms=(
                            round(total_rt / total_count * 1000, 1)
                            if total_rt is not None and total_count
                            else None
                        ),
                        error_rate=stats.get("ErrorStatistics", {}).get("TotalCount", 0)
                        / max(total_count, 1)
                        * 100
                        if total_count
                        else None,
                        throughput=stats.get("TotalCount"),
                    )
                )

            return ServiceGraphResponse(
                services=services,
                start_time=start_time.isoformat(),
                end_time=end_time.isoformat(),
                live=True,
            )

        except Exception as e:
            logger.info("X-Ray service graph unavailable: %s", e)
            end_time = datetime.now(timezone.utc)
            start_time = end_time - timedelta(hours=hours)
            return ServiceGraphResponse(
                services=[],
                start_time=start_time.isoformat(),
                end_time=end_time.isoformat(),
                live=False,
                note="X-Ray not enabled or not permitted.",
            )

    def get_trace_details(self, trace_ids: list[str]) -> list[TraceDetail]:
        """Get detailed trace information for specific trace IDs."""
        if not trace_ids:
            return []

        try:
            xray = boto3.client("xray", region_name=self.region)
            response = xray.batch_get_traces(TraceIds=trace_ids[:5])  # Max 5 per call

            details: list[TraceDetail] = []
            for trace in response.get("Traces", []):
                segments: list[TraceSegment] = []
                for seg in trace.get("Segments", []):
                    import json

                    doc = json.loads(seg.get("Document", "{}"))
                    segments.append(self._parse_segment(doc))

                duration_ms = None
                if segments:
                    min_start = min(s.start_time for s in segments)
                    max_end = max(
                        s.end_time or s.start_time for s in segments
                    )
                    duration_ms = (max_end - min_start) * 1000

                details.append(
                    TraceDetail(
                        trace_id=trace.get("Id", ""),
                        duration_ms=duration_ms,
                        segments=segments,
                        live=True,
                    )
                )

            return details

        except (ClientError, BotoCoreError) as e:
            logger.info("X-Ray batch_get_traces failed: %s", e)
            return [
                TraceDetail(
                    trace_id=tid,
                    segments=[],
                    live=False,
                    note="X-Ray not enabled or not permitted.",
                )
                for tid in trace_ids
            ]

    def _parse_segment(self, doc: dict) -> TraceSegment:
        """Parse a segment document into TraceSegment."""
        start = doc.get("start_time", 0)
        end = doc.get("end_time")
        subsegments = [
            self._parse_segment(sub) for sub in doc.get("subsegments", [])
        ]
        return TraceSegment(
            id=doc.get("id", ""),
            name=doc.get("name", "unknown"),
            start_time=start,
            end_time=end,
            duration_ms=(end - start) * 1000 if end else None,
            error=doc.get("error", False),
            fault=doc.get("fault", False),
            annotations=doc.get("annotations", {}),
            metadata=doc.get("metadata", {}),
            subsegments=subsegments,
        )
