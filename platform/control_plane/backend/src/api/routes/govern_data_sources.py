"""Govern Data Sources — unified sync status for all AWS data sources.

Single endpoint that returns the connection and sync status for all
data sources used by the Govern module, including last-refresh times.
"""

from fastapi import APIRouter, Depends
import logging
import time
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from core.config import settings
from core.rbac import Role, require_role
from services.guardrail_service import GuardrailService
from services.govern_models_service import GovernModelsService
from services.govern_agentcore_service import GovernAgentCoreService
from services.govern_cost_service import GovernCostService
from services.govern_posture_service import GovernPostureService
from services.govern_security_service import GovernSecurityService
from services.govern_trail_service import GovernTrailService
from services.govern_evals_service import GovernEvalsService
from services.govern_invocation_safety_service import GovernInvocationSafetyService
from services.govern_security_hub_ai_service import GovernSecurityHubAIService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/data-sources", tags=["govern-data-sources"])


def _probe_source(name: str, fn) -> dict:
    """Probe a single data source and return status."""
    start = time.time()
    try:
        result = fn()
        elapsed = int((time.time() - start) * 1000)
        live = getattr(result, 'live', None)
        note = getattr(result, 'note', None)
        source = getattr(result, 'source', None)

        # Extract useful metrics based on the type of response
        metrics = {}
        if hasattr(result, 'total'):
            metrics['total'] = result.total
        if hasattr(result, 'total_models'):
            metrics['total_models'] = result.total_models
        if hasattr(result, 'active_models'):
            metrics['active_models'] = result.active_models
        if hasattr(result, 'total_agents'):
            metrics['total_agents'] = result.total_agents
        if hasattr(result, 'total_findings'):
            metrics['total_findings'] = result.total_findings
        if hasattr(result, 'total_calls'):
            metrics['total_calls'] = result.total_calls
        if hasattr(result, 'total_callers'):
            metrics['total_callers'] = result.total_callers

        return {
            'name': name,
            'status': 'connected' if live else 'partial',
            'live': live if live is not None else True,
            'source': source,
            'note': note,
            'latency_ms': elapsed,
            'metrics': metrics if metrics else None,
            'error': None,
        }
    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        logger.warning(f"Data source probe failed for {name}: {e}")
        return {
            'name': name,
            'status': 'error',
            'live': False,
            'source': None,
            'note': None,
            'latency_ms': elapsed,
            'metrics': None,
            'error': str(e)[:200],
        }


@router.get("/status")
async def get_data_sources_status(_=Depends(require_role(Role.VIEWER))):
    """Get unified status for all AWS data sources.

    Returns connection status, live flag, last-refresh info, and key metrics
    for each data source. Probes run in parallel for speed.

    This is the single source of truth for the Connection Wizard and
    data source health monitoring.
    """
    region = settings.AWS_REGION

    # Define all probes
    probes = {
        'guardrails': lambda: _probe_guardrails(region),
        'bedrock_models': lambda: GovernModelsService(region).get_catalog(),
        'bedrock_agents': lambda: GovernAgentCoreService(region).get_agents(),
        'agentcore_posture': lambda: GovernAgentCoreService(region).get_posture(),
        'cloudwatch_metrics': lambda: GovernModelsService(region).get_runtime_metrics(7),
        'cost_explorer': lambda: GovernCostService(region).get_by_model(months=1),
        'aws_config': lambda: GovernPostureService(region).get_config_compliance(),
        'security_services': lambda: GovernSecurityService(region).get_posture(),
        'cloudtrail': lambda: GovernTrailService(region).get_ai_callers(hours=168),
        'bedrock_evals': lambda: GovernEvalsService(region).get_jobs(max_jobs=10),
        'invocation_logs': lambda: GovernInvocationSafetyService(region).get_telemetry(days=7),
        'security_hub_ai': lambda: GovernSecurityHubAIService(region).get_ai_inventory(),
    }

    # Run all probes in parallel
    results = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(_probe_source, name, fn): name for name, fn in probes.items()}
        for fut in as_completed(futures):
            name = futures[fut]
            try:
                results[name] = fut.result()
            except Exception as e:
                results[name] = {
                    'name': name,
                    'status': 'error',
                    'live': False,
                    'error': str(e)[:200],
                }

    # Compute summary
    connected = sum(1 for r in results.values() if r.get('live'))
    total = len(results)

    return {
        'summary': {
            'connected': connected,
            'total': total,
            'all_connected': connected == total,
            'timestamp': time.time(),
        },
        'sources': results,
    }


def _probe_guardrails(region: str):
    """Special probe for guardrails that includes sync status."""
    svc = GuardrailService(
        table_name=settings.GUARDRAILS_TABLE_NAME,
        region=region,
        auto_sync=False,  # Don't trigger sync during status check
    )

    # Get tracked guardrails
    tracked = svc.list_templates(auto_sync=False)
    tracked_ids = {t.guardrail_id for t in tracked if t.guardrail_id}
    tracked_count = len(tracked)

    # Get AWS guardrails
    try:
        resp = svc.bedrock_client.list_guardrails(maxResults=50)
        aws_guardrails = resp.get("guardrails", [])
        aws_count = len(aws_guardrails)
        aws_ids = {g.get("id") for g in aws_guardrails}
        untracked_count = len(aws_ids - tracked_ids)
    except Exception:
        aws_count = 0
        untracked_count = 0

    # Build a response-like object
    class GuardrailStatus:
        live = tracked_count > 0 or aws_count > 0
        source = 'bedrock-guardrails'
        note = f'{tracked_count} tracked, {aws_count} in AWS'
        total = tracked_count
        aws_total = aws_count
        untracked = untracked_count
        in_sync = untracked_count == 0
        last_sync_seconds_ago = int(time.time() - GuardrailService._last_sync_time) if GuardrailService._last_sync_time > 0 else None
        sync_interval = GuardrailService._SYNC_INTERVAL_SECONDS

    return GuardrailStatus()


@router.post("/refresh")
async def refresh_all_sources(_=Depends(require_role(Role.OPERATOR))):
    """Force refresh all data source caches.

    Clears TTL caches and triggers fresh fetches from AWS.
    Use sparingly — normal operation uses automatic cache refresh.
    """
    from core.ttl_cache import clear_all

    # Clear all TTL caches
    cleared = clear_all()

    # Trigger guardrails sync
    region = settings.AWS_REGION
    svc = GuardrailService(
        table_name=settings.GUARDRAILS_TABLE_NAME,
        region=region,
        auto_sync=False,
    )
    sync_result = svc.discover_aws_guardrails()

    return {
        'success': True,
        'caches_cleared': cleared,
        'guardrails_synced': sync_result.get('synced', 0),
        'timestamp': time.time(),
    }
