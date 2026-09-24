"""Govern Data Sources — measured reachability for every source the UI names.

Each source is verified by one real AWS call defined in
`services.govern_data_source_probes`. See that module for why the probes call
AWS directly instead of reusing each Govern service's `live` flag (short version:
`live` means "has data", not "is reachable", and the services swallow
AccessDenied into an empty result).

Response contract
-----------------
`sources` is keyed by the source id the frontend catalog uses, so
DataSourceIndicator needs no id-translation table, and there is no path by which
an id present in the UI but absent from the registry can be shown as connected —
the UI treats a missing id as `not_probed`.

Each source carries a single `status` from the seven-value contract. There is
deliberately NO boolean `live` field. The previous version of this route returned
`'live': live if live is not None else True`, which coerced "unknown" to "yes"
and is exactly why a source could report itself connected without a completed
AWS call. A boolean also cannot separate "reachable and empty" from "reachable
but switched off", and those must count differently.
"""

from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter, Depends

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from services import govern_data_source_probes as probes
from services.guardrail_service import GuardrailService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/data-sources", tags=["govern-data-sources"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_data_sources", region_scope.CONTROL_PLANE, prefix="/govern/data-sources")


def _guardrail_sync_state() -> dict:
    """Guardrail sync freshness, read from class state with no AWS call.

    Preserved from the previous implementation because the sync interval is a
    genuinely useful signal, but read off the class attributes rather than by
    constructing a GuardrailService: the old version built one with
    `auto_sync=False` specifically to avoid a write during a status check, and
    not constructing it at all is strictly safer.
    """
    last = getattr(GuardrailService, "_last_sync_time", 0) or 0
    return {
        "last_sync_seconds_ago": int(time.time() - last) if last > 0 else None,
        "sync_interval_seconds": getattr(GuardrailService, "_SYNC_INTERVAL_SECONDS", None),
    }


@router.get("/status")
async def get_data_sources_status(_=Depends(require_role(Role.VIEWER))):
    """Probe every registered data source and report measured reachability.

    Probes run concurrently in a thread pool, and the pool is awaited off the
    event loop so a slow AWS endpoint cannot block other requests. Results are
    cached per source (5 min for the 46 free probes, 6 h for the four billed
    Cost Explorer probes); `summary.billed_usd` reports what this call actually
    spent, which is $0 whenever the Cost Explorer results came from cache.
    """
    results = await asyncio.to_thread(probes.run_all_probes)
    summary = probes.summarize(results)
    return {
        "summary": summary,
        "sources": results,
        "guardrail_sync": _guardrail_sync_state(),
    }


@router.post("/refresh")
async def refresh_all_sources(_=Depends(require_role(Role.OPERATOR))):
    """Force a refresh of all data source caches and re-probe on the next read.

    Note this clears the probe cache too, so the following /status call re-runs
    the four billed Cost Explorer probes ($0.04). That is the point of an
    explicit operator-triggered refresh, but it is why /status alone will not do
    it.
    """
    from core.ttl_cache import clear_all

    cleared = clear_all()
    probe_entries = probes.clear_probe_cache()

    # Guardrail discovery is a real write-side sync, so it stays on the explicit
    # refresh path and out of the read-only status probe.
    sync_result = {}
    try:
        svc = GuardrailService(
            # Regions resolve per tier inside the service; see core.region_config.
            table_name=settings.GUARDRAILS_TABLE_NAME,
            auto_sync=False,
        )
        sync_result = svc.discover_aws_guardrails() or {}
    except Exception as exc:  # noqa: BLE001
        # Report the failure instead of returning success with a silent 0.
        logger.warning("Guardrail sync during refresh failed: %s", exc)
        return {
            "success": False,
            "caches_cleared": cleared,
            "probe_cache_cleared": probe_entries,
            "guardrails_synced": None,
            "error": probes.sanitize_error(str(exc)),
            "timestamp": time.time(),
        }

    return {
        "success": True,
        "caches_cleared": cleared,
        "probe_cache_cleared": probe_entries,
        "guardrails_synced": sync_result.get("synced", 0),
        "timestamp": time.time(),
    }
