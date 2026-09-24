"""Background cache pre-warmer for the Govern dashboards.

The Govern landing / fleet / command-center pages fan out to ~two dozen live AWS
calls (Bedrock, CloudWatch, Cost Explorer, CloudTrail, Security Hub, AgentCore, the
multi-region discovery scan). Cold, those take ~40s to populate and the UI shows a
misleading "Degraded Mode (0/11)" until they land. Each Govern service TTL-caches its
result, so this warmer periodically exercises the endpoints (in a daemon thread) to
keep those caches hot — the first user load, and idle-then-return loads, are fast.

Implementation: internal HTTP GETs against the app's own port (so the real route logic
— including multi-region aggregation — runs and populates the shared TTL caches).
Best-effort: every failure is swallowed; the warmer never affects request handling.
Controlled by GOVERN_PREWARM_INTERVAL (seconds; 0 = warm once at startup only; <0 = off).
"""

from __future__ import annotations

import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from core import safe_fetch
from core.safe_fetch import SafeFetchError

logger = logging.getLogger(__name__)

# Endpoints to keep warm. /command-center/data alone covers security, models runtime,
# posture, risk, trail, evals, invocation-safety, cost, and agentcore metrics; the rest
# cover the fleet inventory, guardrails, KBs, and the (slow) region discovery scan.
#
# The second group was added after measuring a cold dashboard: each of these is a card a
# user lands on, each took 5-28s cold, and none of them were reachable from the first
# group. /command-center/data covers the *aggregate* posture, not these per-page reads,
# so "the command center is warm" did not imply the pages were.
#
# Deliberately NOT here: govern/posture-score/score. It returns live=False, and the shared
# cache is only populated when a response is live (`should_cache=lambda r: r.live` in
# core/ttl_cache), so it recomputes on every request no matter how often we call it.
# Prewarming it would spend ~50s per sweep to warm nothing. Fixing that means making the
# underlying reads live, not loosening the cache rule - caching a non-live response is how
# a fabricated number ends up served under a Live badge.
_ENDPOINTS = [
    "govern/command-center/data",
    "govern/agentcore/agents",
    "govern/agentcore/workload-identities",
    "govern/agentcore/gateways",
    "govern/agentcore/posture",
    "govern/guardrails/telemetry?days=30",
    "govern/knowledge-bases",
    "govern/security/posture",
    "govern/models/runtime-metrics?days=7",
    "govern/regions/discovery",
    "govern/data-sources/status",
    # Per-page reads, measured cold on a real fleet (see above).
    "govern/operations/fleet/status",
    "govern/operations/incidents",
    "govern/operations/alerts/active",
    "govern/fleet/summary",
    "govern/compliance/posture",
    "govern/cost/summary",
    "govern/models/catalog",
    "govern/marketplace/catalog",
    "govern/developer-ai/posture",
    "govern/risk-posture/security-hub",
]

_STARTUP_DELAY_S = 8   # let uvicorn finish binding before self-calling
_PER_CALL_TIMEOUT_S = 120  # region discovery can be ~60-90s cold

# Warm several endpoints at once. This was a sequential for-loop, which made the sweep's
# duration the sum of its slowest members: with a 120s per-call ceiling and 21 endpoints,
# one slow member could push a single sweep past the 300s service TTLs it exists to stay
# ahead of, so caches expired while the warmer was still working through the list. The
# cycle is warm-duration + interval, and only the interval was ever tuned.
#
# Bounded low on purpose. These are self-calls, so each one occupies a thread in the
# app's own handler pool, and every endpoint here fans out to live AWS APIs where too much
# concurrency earns throttling and turns a warm cache into a degraded one.
_WARM_CONCURRENCY = 4


def _warm_one(base: str, ep: str) -> None:
    """Warm a single endpoint.

    Never raises. It runs inside a worker thread now, where an escaping exception would be
    swallowed into a Future nobody inspects - so the same best-effort contract the
    sequential loop had is enforced here rather than relied upon.
    """
    url = f"{base}/api/v1/{ep}"
    try:
        # X-Prewarm only marks these in access logs. It authorizes nothing: grep the
        # backend and the only two hits are in this file, so no route, dependency or
        # middleware reads it, and the request carries no credential.
        #
        # fetch_internal, not fetch: `base` is this app's own address (loopback by
        # default), which the public-address check exists to refuse. It also refuses
        # to follow a redirect, which still matters with no credential on the request:
        # this is an unattended sweep of GETs with a 120s timeout each, and the
        # dev-auth bypass in core/config.py means that in a development deployment they
        # run with admin authority - so a 302 would aim an admin-authority automated
        # GET wherever it named. The body is read only to make the route finish and
        # fill its cache, then discarded, so a capped or truncated read costs nothing.
        resp = safe_fetch.fetch_internal(
            url, headers={"X-Prewarm": "1"}, timeout=_PER_CALL_TIMEOUT_S
        )
        if not (200 <= resp.status < 300):
            # urlopen raised on these; fetch_internal returns them, so log to keep a
            # failing endpoint as visible as it was before.
            logger.info("cache prewarm skipped %s: HTTP %s", ep, resp.status)
    except SafeFetchError as e:
        # %r on detail and on the exception: both can carry a string from outside this
        # process (a status line, a resolver message), and a CR/LF in one forges a
        # second log line.
        logger.info("cache prewarm skipped %s: %s (%r)", ep, e.reason, e.detail)
    except Exception as e:  # noqa: BLE001 — best-effort; never affect the app
        logger.info("cache prewarm skipped %s: %r", ep, e)


def _warm_once(base: str) -> None:
    """Warm every endpoint, a few at a time."""
    with ThreadPoolExecutor(
        max_workers=_WARM_CONCURRENCY, thread_name_prefix="govern-prewarm"
    ) as pool:
        # list() so the sweep does not return until every endpoint has been attempted;
        # the caller times the sweep and then sleeps, and a sweep that returned early
        # would make that measurement - and the interval built on it - meaningless.
        list(pool.map(lambda ep: _warm_one(base, ep), _ENDPOINTS))


def start_prewarmer() -> None:
    """Start the background pre-warmer (no-op if disabled via GOVERN_PREWARM_INTERVAL<0)."""
    try:
        interval = int(os.environ.get("GOVERN_PREWARM_INTERVAL", "150"))
    except ValueError:
        interval = 150
    if interval < 0:
        logger.info("Govern cache pre-warmer disabled (GOVERN_PREWARM_INTERVAL<0)")
        return

    base = os.environ.get("GOVERN_PREWARM_BASE", "http://127.0.0.1:8000")

    def _loop() -> None:
        time.sleep(_STARTUP_DELAY_S)
        while True:
            start = time.monotonic()
            _warm_once(base)
            logger.info("Govern caches pre-warmed in %.1fs", time.monotonic() - start)
            if interval == 0:
                break  # warm once at startup only
            # Re-warm before the service TTLs expire. There is no single TTL to aim at:
            # across the services _ENDPOINTS reads they span 30s to 900s -
            # govern_operations_service._TTL_INCIDENTS/_TTL_ALERTS are 30 and _TTL_FLEET is
            # 60, while govern_cost_service._COST_TTL and govern_models_service._CATALOG_TTL
            # are 900. So this interval does NOT keep everything hot, and is not meant to:
            # the sub-60s entries are cheap, deliberately near-real-time reads. What the
            # interval targets is the expensive 120-300s band (agentcore, region discovery,
            # the data-source probes, guardrail telemetry) where a cold read costs 5-60s.
            #
            # DO NOT shorten this interval to make the dashboard feel faster. It does the
            # opposite, and the reason is not obvious. A sweep in progress makes concurrent
            # user requests slow even when their caches are hot: measured on a real fleet,
            # govern/fleet/summary served in 17-31ms in the gaps between sweeps and took
            # 4-40s during one, while its own cache was ~100s old and well inside its 120s
            # TTL. The blocking AWS calls in these handlers, self-called, are competing with
            # the request being served. So latency tracks the fraction of wall-clock spent
            # sweeping, not cache freshness. Warm sweeps run 50-90s here, which at
            # interval=60 leaves the server sweeping ~60% of the time; at 180 that drops to
            # ~30% while the cycle (sweep + sleep, ~230-270s) still lands under the 300s
            # TTLs. Faster sweeps help, a shorter sleep does not. The durable fix is to stop
            # the handlers blocking, not to tune this number.
            time.sleep(interval)

    threading.Thread(target=_loop, daemon=True, name="govern-cache-prewarm").start()
    logger.info("Govern cache pre-warmer started (interval=%ss)", interval)
