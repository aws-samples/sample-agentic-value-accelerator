"""Govern Command Center aggregator — single endpoint for all dashboard data.

Reduces 15+ parallel API calls to 1 round-trip by batching all Command Center
data server-side. Each source is fetched in parallel with graceful fallback.
"""

import asyncio
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends

from core import region_scope
from core import region_config
from core.config import settings
from core.rbac import Role, require_role
from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/command-center", tags=["govern-command-center"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_command_center", region_scope.SINGLE_REGION, prefix="/govern/command-center")

# Import services lazily to avoid circular imports
_services: Dict[str, Any] = {}


def _get_service(name: str):
    """Lazy-load services to avoid import-time side effects."""
    if name not in _services:
        if name == "security":
            from services.govern_security_service import GovernSecurityService
            _services[name] = GovernSecurityService(region=settings.GOVERN_AWS_REGION)
        elif name == "models":
            from services.govern_models_service import GovernModelsService
            _services[name] = GovernModelsService(region=settings.GOVERN_AWS_REGION)
        elif name == "posture":
            from services.govern_posture_service import GovernPostureService
            _services[name] = GovernPostureService(region=settings.GOVERN_AWS_REGION)
        elif name == "risk_posture":
            from services.govern_risk_posture_service import GovernRiskPostureService
            _services[name] = GovernRiskPostureService(region=settings.GOVERN_AWS_REGION)
        elif name == "trail":
            from services.govern_trail_service import GovernTrailService
            _services[name] = GovernTrailService(region=settings.GOVERN_AWS_REGION)
        elif name == "evals":
            from services.govern_evals_service import GovernEvalsService
            _services[name] = GovernEvalsService(region=settings.GOVERN_AWS_REGION)
        elif name == "invocation_safety":
            from services.govern_invocation_safety_service import GovernInvocationSafetyService
            _services[name] = GovernInvocationSafetyService(region=settings.GOVERN_AWS_REGION)
        elif name == "cost":
            from services.govern_cost_service import GovernCostService
            # Cost Explorer and Budgets are single-endpoint services, so the
            # governed region is the wrong knob: it reads as a per-region cost view
            # that cannot exist. Pin it explicitly instead of relying on the fact
            # that GOVERN_AWS_REGION currently happens to be us-east-1.
            # spend_table_* is deliberately omitted: this instance never calls
            # get_by_use_case (only the /govern/cost route does). Do not add
            # spend_table_name here without also passing spend_table_region - it falls back
            # to `region`, i.e. the CE pin, which is the ResourceNotFoundException that
            # motivated splitting the field in the first place.
            _services[name] = GovernCostService(
                region=region_config.resolve_service_region("ce", settings.GOVERN_AWS_REGION),
                govern_region=settings.GOVERN_AWS_REGION,
            )
        elif name == "agentcore":
            from services.govern_agentcore_service import GovernAgentCoreService
            _services[name] = GovernAgentCoreService(region=settings.GOVERN_AWS_REGION)
        elif name == "developer_ai":
            from services.govern_developer_ai_service import GovernDeveloperAIService
            _services[name] = GovernDeveloperAIService(region=settings.GOVERN_AWS_REGION)
    return _services.get(name)


async def _fetch_with_fallback(name: str, fetcher, default: Any = None) -> Any:
    """Fetch data with graceful fallback on error."""
    try:
        return await asyncio.to_thread(fetcher)
    except Exception as e:
        logger.warning(f"Command center: {name} fetch failed: {e}")
        return default


def _get_aggregated_data() -> Dict[str, Any]:
    """Fetch all Command Center data in parallel, cache result."""
    import concurrent.futures

    results = {
        "security_posture": None,
        "runtime_metrics": None,
        "config_compliance": None,
        "risk_posture": None,
        "ai_callers": None,
        "eval_jobs": None,
        "invocation_safety": None,
        "cost_by_model": None,
        "budgets": None,
        "anomalies": None,
        "agent_metrics": None,
        "policy_eval": None,
        "live": False,
        "source": "aggregated",
    }

    def fetch_security():
        svc = _get_service("security")
        return svc.get_posture() if svc else None

    def fetch_runtime():
        svc = _get_service("models")
        return svc.get_runtime_metrics(days=7) if svc else None

    def fetch_config():
        svc = _get_service("posture")
        return svc.get_config_compliance() if svc else None

    def fetch_risk():
        # GovernRiskPostureService exposes get_posture(scan=...), not
        # get_security_hub_findings(). The old name raised AttributeError, which
        # _fetch_with_fallback swallowed, so risk_posture was permanently None and
        # never counted toward live_sources below despite Security Hub being live.
        svc = _get_service("risk_posture")
        return svc.get_posture(scan=200) if svc else None

    def fetch_callers():
        svc = _get_service("trail")
        return svc.get_ai_callers(hours=168) if svc else None

    def fetch_evals():
        svc = _get_service("evals")
        return svc.get_jobs(max_jobs=100) if svc else None

    def fetch_invocation_safety():
        svc = _get_service("invocation_safety")
        return svc.get_telemetry(days=7) if svc else None

    def fetch_cost():
        svc = _get_service("cost")
        return svc.get_by_model(months=3) if svc else None

    def fetch_budgets():
        svc = _get_service("cost")
        return svc.get_budgets() if svc else None

    def fetch_anomalies():
        svc = _get_service("cost")
        return svc.get_anomalies(days=60) if svc else None

    def fetch_agent_metrics():
        svc = _get_service("agentcore")
        return svc.get_agent_metrics(days=7) if svc else None

    def fetch_policy_eval():
        svc = _get_service("developer_ai")
        return svc.evaluate_policy("default", days=7) if svc else None

    # Run all fetches in parallel using ThreadPoolExecutor
    fetchers = {
        "security_posture": fetch_security,
        "runtime_metrics": fetch_runtime,
        "config_compliance": fetch_config,
        "risk_posture": fetch_risk,
        "ai_callers": fetch_callers,
        "eval_jobs": fetch_evals,
        "invocation_safety": fetch_invocation_safety,
        "cost_by_model": fetch_cost,
        "budgets": fetch_budgets,
        "anomalies": fetch_anomalies,
        "agent_metrics": fetch_agent_metrics,
        "policy_eval": fetch_policy_eval,
    }

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        futures = {key: executor.submit(fn) for key, fn in fetchers.items()}
        for key, future in futures.items():
            try:
                result = future.result(timeout=30)
                if result is not None:
                    # Convert Pydantic models to dicts
                    if hasattr(result, "model_dump"):
                        results[key] = result.model_dump()
                    elif hasattr(result, "dict"):
                        results[key] = result.dict()
                    else:
                        results[key] = result
            except Exception as e:
                # Log the type, not just str(e): concurrent.futures.TimeoutError has an
                # empty message, so a cold-cache fetch exceeding the 30s budget used to
                # log "<key> failed: " with no cause, which is undiagnosable.
                logger.warning(
                    f"Command center aggregator: {key} failed: "
                    f"{type(e).__name__}: {e or '(no message)'}"
                )

    # Mark as live if any source returned live data
    live_sources = 0
    for key in ["security_posture", "runtime_metrics", "risk_posture", "ai_callers", "invocation_safety"]:
        if results.get(key) and results[key].get("live"):
            live_sources += 1
    results["live"] = live_sources > 0
    results["live_sources"] = live_sources

    return results


@router.get("/data")
async def get_command_center_data(
    _=Depends(require_role(Role.VIEWER)),
):
    """Get all Command Center dashboard data in a single call.

    Aggregates: security posture, runtime metrics, config compliance,
    risk posture, AI callers, eval jobs, invocation safety, cost data,
    budgets, anomalies, agent metrics, and policy evaluations.

    Each source is fetched in parallel with 30s timeout and graceful fallback.
    Result is cached for 60 seconds.
    """
    data, cached_at = get_or_load(
        "command-center-data",
        ttl_seconds=60,
        loader=_get_aggregated_data,
        should_cache=lambda d: d.get("live", False),
    )

    # Add cache metadata
    if cached_at:
        import time
        age = int(time.time() - cached_at)
        if age > 2:
            data["note"] = f"Cached {age}s ago"

    return data
