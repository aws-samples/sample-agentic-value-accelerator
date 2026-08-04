"""Tiny in-process TTL cache for read-through AWS views.

The Govern read-through slices (govern_models, govern_posture, govern_cost) call
AWS APIs on every request. That data barely moves minute-to-minute — a 7-day
metric window, a model catalog, a config-rule summary, monthly spend — so a short
TTL cache collapses repeat page loads from several slow AWS round-trips to an
instant hit, without adding infrastructure.

Process-local (per worker) and thread-safe. Values are cached by an explicit key;
on a miss or expiry the loader runs and its result is stored with a monotonic
expiry. `cached_at` epoch seconds is returned so callers can surface an honest
"as of" timestamp. A loader that raises is NOT cached (so a transient AWS failure
doesn't poison the cache) — the exception propagates to the caller's own fallback.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Callable, Optional, Tuple

_lock = threading.Lock()
# key -> (expiry_monotonic, cached_at_epoch, value)
_store: dict[str, Tuple[float, float, Any]] = {}


def get_or_load(
    key: str,
    ttl_seconds: float,
    loader: Callable[[], Any],
    should_cache: Optional[Callable[[Any], bool]] = None,
) -> Tuple[Any, float]:
    """Return (value, cached_at_epoch) for `key`, loading + caching on miss/expiry.

    A fresh load stamps cached_at with the current wall-clock epoch. A cache hit
    returns the value stamped at its original load time, so callers can show how
    stale the data is. Loader exceptions propagate and are not cached.

    `should_cache`: optional predicate on the loaded value — return False to skip
    storing it (e.g. a live=False fallback), so a transient AWS failure doesn't
    poison the cache for the whole TTL. The value is still returned to the caller.
    On a skipped store, cached_at is the load time (freshly fetched).
    """
    now = time.monotonic()
    with _lock:
        hit = _store.get(key)
        if hit is not None and hit[0] > now:
            return hit[2], hit[1]

    # Load outside the lock so a slow AWS call doesn't block other keys.
    value = loader()
    cached_at = time.time()
    if should_cache is None or should_cache(value):
        with _lock:
            _store[key] = (time.monotonic() + ttl_seconds, cached_at, value)
    return value, cached_at


def invalidate(key: Optional[str] = None) -> None:
    """Drop one key, or the whole cache when key is None."""
    with _lock:
        if key is None:
            _store.clear()
        else:
            _store.pop(key, None)


def clear_all() -> int:
    """Clear all cached entries and return the count cleared."""
    with _lock:
        count = len(_store)
        _store.clear()
        return count


def stats() -> dict:
    """Return cache statistics."""
    with _lock:
        now = time.monotonic()
        expired = sum(1 for v in _store.values() if v[0] <= now)
        return {
            "total_entries": len(_store),
            "expired_entries": expired,
            "active_entries": len(_store) - expired,
        }
