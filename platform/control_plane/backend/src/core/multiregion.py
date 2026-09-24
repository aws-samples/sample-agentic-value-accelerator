"""Multi-region fan-out for Govern services.

Runs a per-region operation across the governed-region set (core.region_config) in
parallel and returns per-region results so route-level mergers can aggregate them.
Partial failures degrade to None for that region (never raise), so one unreachable
region cannot blank the whole response.

When the governed set has a single region (the default), this is effectively a
pass-through: run_over_regions returns [(region, result)] and the endpoint's merge
returns that single result unchanged — so behavior is identical to the previous
single-region code until more regions are pulled into governance.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, wait
from typing import Any, Callable, List, Optional, Tuple

from core.region_config import get_governed_regions
from models.govern_region_provenance import RegionProvenance

logger = logging.getLogger(__name__)

_MAX_WORKERS = 8

# Wall-clock cap for one fan-out, in seconds. A region that has not answered by then
# is reported unreachable.
#
# Why this exists: an AWS region that is not enabled on the account does not fail
# fast. botocore cannot resolve a usable endpoint and works through its retry budget,
# which took minutes per call. Governing one such region did not just slow one
# response — every Govern endpoint fanned out to it, exhausted the event loop's
# thread pool, and the whole backend stopped answering. It had to be recovered by
# rewriting the region config file and restarting the container.
#
# 25s is chosen to sit under a typical 30s client/proxy read timeout, so a slow
# region degrades into an honest "unreachable" badge rather than a failed request.
_FANOUT_TIMEOUT_S = 25.0


def run_over_regions(
    fn: Callable[[str], Any],
    regions: Optional[List[str]] = None,
    max_workers: int = _MAX_WORKERS,
    timeout: Optional[float] = _FANOUT_TIMEOUT_S,
) -> List[Tuple[str, Any]]:
    """Call fn(region) for each governed region concurrently.

    Returns a list of (region, result) preserving region order; a region whose call
    raises, or does not finish within `timeout`, yields (region, None) — which
    provenance() then reports as unreachable.

    The timeout is a budget for the whole fan-out, not per region: the regions run
    concurrently, so the slowest one is what the caller waits for either way.

    Two deliberate limits:
      - It applies only when there is more than one region. The single-region path
        stays a direct in-line call, identical to the pre-fan-out code, so adding
        this cannot change the timing of the ordinary single-region request.
      - A timed-out worker thread is abandoned, not killed — Python cannot cancel a
        thread blocked in a socket call. The thread lives until botocore's own retry
        budget runs out. This bounds the REQUEST, and it bounds thread growth only to
        the extent that callers are TTL-cached (they are). Fixing it properly means
        bounding the AWS clients themselves with a botocore connect/read timeout.
    """
    regions = regions if regions is not None else get_governed_regions()
    if not regions:
        return []

    def _safe(region: str) -> Tuple[str, Any]:
        try:
            return (region, fn(region))
        except Exception as e:  # noqa: BLE001 — one region must never fail the aggregate
            logger.warning("Multi-region op failed in %s: %s", region, e)
            return (region, None)

    if len(regions) == 1:
        return [_safe(regions[0])]

    workers = min(max_workers, len(regions))
    # Not a `with` block: ThreadPoolExecutor.__exit__ joins every worker, which would
    # re-introduce the exact hang the timeout exists to prevent.
    pool = ThreadPoolExecutor(max_workers=workers)
    try:
        futures = {pool.submit(_safe, region): region for region in regions}
        done, pending = wait(futures.keys(), timeout=timeout)
        if pending:
            logger.warning(
                "Multi-region fan-out timed out after %ss; reporting %s unreachable",
                timeout,
                ", ".join(sorted(futures[f] for f in pending)),
            )
        # _safe never raises, so .result() on a done future is always a (region, value).
        results = {futures[f]: f.result()[1] for f in done}
        # Preserve the caller's region order; a pending region reads as unreachable.
        return [(r, results.get(r)) for r in regions]
    finally:
        pool.shutdown(wait=False)


def as_dict(resp: Any) -> dict:
    """Normalize a Pydantic model / dict / None to a plain dict.

    A non-None response this cannot normalize is a caller bug, not a dark region, so
    it is logged rather than absorbed. Returning {} silently is how a fan-out whose
    per-region result is a tuple got every region classified as degraded: `.get("live")`
    on an empty dict is falsy, so a region holding 36 live agents reported "no live
    data". Callers whose per-region result is not a model or dict must pass `live_of`.
    """
    if resp is None:
        return {}
    if hasattr(resp, "model_dump"):
        return resp.model_dump()
    if isinstance(resp, dict):
        return resp
    logger.warning(
        "Multi-region result of type %s cannot be read for liveness; pass live_of= "
        "to provenance()/live_region_count() instead of relying on as_dict",
        type(resp).__name__,
    )
    return {}


def combine_notes(results: List[Tuple[str, Any]]) -> Optional[str]:
    """Build a per-region status note (region: note / unavailable)."""
    parts: List[str] = []
    for region, resp in results:
        if resp is None:
            parts.append(f"{region}: unavailable")
            continue
        note = as_dict(resp).get("note")
        if note:
            parts.append(f"{region}: {note}")
    return "; ".join(parts) or None


def is_live(resp: Any) -> bool:
    """Whether one region's response carries measured data (live=True)."""
    return bool(as_dict(resp).get("live"))


def answered_region_count(results: List[Tuple[str, Any]]) -> int:
    """How many regions returned any response at all, live or fallback."""
    return sum(1 for _, resp in results if resp is not None)


def live_region_count(
    results: List[Tuple[str, Any]],
    live_of: Optional[Callable[[Any], bool]] = None,
) -> int:
    """How many regions returned LIVE data.

    Not the same as answered_region_count: a region where the service is disabled
    returns a well-formed live=False fallback, so it answered without contributing
    anything. Merged `source` strings read "(N region(s))" and are the label a viewer
    trusts, so N has to be the number of regions that actually measured something.

    `live_of` reads liveness out of one region's result; the default reads a `live`
    field off a model or dict. Pass it when the per-region result is some other shape.
    """
    read = live_of or is_live
    return sum(1 for _, resp in results if resp is not None and read(resp))


def provenance(
    results: List[Tuple[str, Any]],
    live_of: Optional[Callable[[Any], bool]] = None,
) -> RegionProvenance:
    """Which regions were queried, which answered, and which answered with nothing.

    run_over_regions already degrades an unreachable region to None so one region
    cannot blank the aggregate. That is the right behavior and it is also lossy: the
    caller gets a smaller total with nothing to distinguish it from a genuinely
    smaller fleet. Attach this so the gap is stated rather than absorbed.

    `degraded` covers the quieter of the two gaps - a region that answered with a
    live=False fallback (service not enabled there, or the read not granted). It is a
    subset of `reachable`, because from the aggregate's point of view a dark region
    and an unreachable one are both missing data, but from the operator's point of
    view they need different fixes.

    `live_of` maps one region's result to its liveness. The default reads a `live`
    field, which covers every caller whose fan-out returns a response model. A fan-out
    returning anything else MUST pass this: without it every region lands in
    `degraded`, and a fully live aggregate would carry a note saying no region
    reported data - the exact inversion of what this block exists to convey.
    """
    read = live_of or is_live
    return RegionProvenance(
        queried=[r for r, _ in results],
        reachable=[r for r, resp in results if resp is not None],
        unreachable=[r for r, resp in results if resp is None],
        degraded=[r for r, resp in results if resp is not None and not read(resp)],
    )


def merge_note(results: List[Tuple[str, Any]], base: Optional[str] = None) -> Optional[str]:
    """Combine per-region notes with the reachability summary, dropping empties."""
    parts = [p for p in (base, provenance(results).summary(), combine_notes(results)) if p]
    return " · ".join(parts) or None
