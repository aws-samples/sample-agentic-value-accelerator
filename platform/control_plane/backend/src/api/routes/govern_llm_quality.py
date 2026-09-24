"""Govern LLM Quality — CloudWatch metrics for LLM output quality monitoring.

Routes for publishing and reading custom LLM quality metrics (groundedness, relevance,
coherence, harmful/refusal rates, latency, token efficiency, citation accuracy).
Includes dashboard and alarm management for governance visibility.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_llm_quality import (
    CreateAlarmsResponse,
    CreateDashboardResponse,
    LlmMonitoringStatus,
    LlmQualityDimension,
    LlmQualityMetric,
    LlmQualitySnapshot,
    LlmQualityTrend,
    PublishMetricsResponse,
)
from services.govern_llm_quality_service import GovernLlmQualityService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/llm-quality", tags=["govern-llm-quality"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_llm_quality", region_scope.SINGLE_REGION, prefix="/govern/llm-quality")

_svc: Optional[GovernLlmQualityService] = None


def get_service() -> GovernLlmQualityService:
    global _svc
    if _svc is None:
        _svc = GovernLlmQualityService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/status", response_model=LlmMonitoringStatus)
async def get_monitoring_status(_=Depends(require_role(Role.VIEWER))):
    """Get current LLM monitoring status (what infrastructure is active).

    Checks:
    - Whether any Bedrock guardrails have contextual grounding policy enabled
    - Whether custom metrics exist in AVA/LLMQuality namespace
    - List of active alarms and which are currently firing
    - Whether the AVA-LLM-Quality dashboard is deployed
    """
    return get_service().get_monitoring_status()


@router.get("/metrics", response_model=LlmQualitySnapshot)
async def get_current_metrics(
    period_minutes: int = Query(default=5, ge=1, le=60, description="Aggregation period"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get latest LLM quality metrics.

    Returns current values for all quality dimensions (groundedness, relevance,
    coherence, harmful rate, refusal rate, latency P99, tokens per response,
    citation accuracy). When no real data exists, returns mock values with
    live=False so the UI can render.
    """
    return get_service().get_current_metrics(period_minutes=period_minutes)


@router.get("/metrics/{dimension}/trend", response_model=LlmQualityTrend)
async def get_metric_trend(
    dimension: LlmQualityDimension,
    hours: int = Query(default=24, ge=1, le=168, description="Trend window in hours"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get time series for a specific quality dimension.

    Returns datapoints over the specified window (default 24h, max 7 days).
    Period is 5 minutes for windows up to 6 hours, 1 hour for longer windows.
    Falls back to mock trend data when no real metrics exist.
    """
    return get_service().get_metric_trend(dimension=dimension, hours=hours)


@router.post("/metrics", response_model=PublishMetricsResponse)
async def publish_metrics(
    metrics: List[LlmQualityMetric],
    _=Depends(require_role(Role.OPERATOR)),
):
    """Publish LLM quality metrics to CloudWatch.

    For Lambda post-processor or evaluation harness integration. Metrics are
    published to the AVA/LLMQuality namespace with optional dimensions for
    model_id and use_case. Max 1000 metrics per call (CloudWatch limit).
    """
    return await get_service().publish_batch(metrics)


@router.post("/dashboard", response_model=CreateDashboardResponse)
async def create_dashboard(_=Depends(require_role(Role.ADMIN))):
    """Deploy the LLM quality CloudWatch dashboard.

    Creates or updates the AVA-LLM-Quality dashboard with widgets for:
    - Quality scores (groundedness, relevance, coherence, citation accuracy)
    - Safety metrics (harmful rate, refusal rate)
    - Performance metrics (latency P99, tokens per response)

    Requires cloudwatch:PutDashboard permission.
    """
    return await get_service().create_dashboard()


@router.post("/alarms", response_model=CreateAlarmsResponse)
async def create_alarms(_=Depends(require_role(Role.ADMIN))):
    """Create anomaly detection alarms for key LLM quality metrics.

    Creates alarms for:
    - llm-groundedness-anomaly: Detects drops in groundedness score
    - llm-harmful-rate-spike: Detects spikes in harmful content rate
    - llm-latency-anomaly: Detects latency degradation
    - llm-refusal-rate-spike: Detects unusual refusal rates

    Alarms use CloudWatch Anomaly Detection (2 standard deviations).
    Skips alarms that already exist. Requires cloudwatch:PutMetricAlarm permission.
    """
    return await get_service().create_anomaly_alarms()
