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

    ── IMMUTABILITY CONTRACT — READ THIS BEFORE TOUCHING THE RETURNED VALUE ──────

    On a cache HIT this returns THE OBJECT THE CACHE STILL HOLDS, not a copy. Mutating
    it therefore edits the cached entry in place, and every later hit for the whole TTL
    sees the mutation.

    The failure this causes is not a crash, which is what makes it worth stating here:
    the usual thing a caller wants to do is append a freshness stamp to `note`, e.g.

        result.note = f"{result.note} · Cached {age}s ago"   # WRONG

    That appends a stamp PER HIT, so a note grows without bound across a TTL window and
    the UI shows "Cached 3s ago · Cached 61s ago · Cached 119s ago …" — a slow leak that
    only appears under repeat traffic and never in a single-request test.

    Copy instead. For a pydantic model, `model_copy(update=...)` swaps only the
    top-level scalars you name and leaves the cache entry untouched:

        if result.live and (time.time() - cached_at) >= 2:
            result = result.model_copy(
                update={"note": f"{result.note} · Cached {int(time.time() - cached_at)}s ago"}
            )

    Note that `model_copy` is shallow: nested models and lists are shared with the cached
    object, so mutating `copied.regions.append(...)` still corrupts the entry. Rebuild the
    nested value rather than mutating it.

    Every service that stamps freshness in this repo already follows this — 35 of them —
    which is why the contract belongs here rather than being rediscovered per service.
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
    """Drop one key, or the whole cache when key is None.

    Matches the key EXACTLY. Callers holding a family of parameterized keys
    (``…:{status}:{severity}:{days}``) want invalidate_prefix instead - passing the bare
    stem here matches nothing and fails silently.
    """
    with _lock:
        if key is None:
            _store.clear()
        else:
            _store.pop(key, None)


def invalidate_prefix(prefix: str) -> int:
    """Drop every key starting with `prefix`, returning the number dropped.

    Read-paths cache under keys that embed their query parameters, so one logical resource
    occupies many keys (`ops:incidents:<table>:open:high:30:50:1`, and one more per filter
    combination). A write to that resource has no way to enumerate them, and invalidate()
    pops by exact key, so `invalidate("ops:incidents:<table>")` silently matched none of
    them and left every cached filter combination stale until its TTL expired.
    """
    with _lock:
        stale = [k for k in _store if k.startswith(prefix)]
        for k in stale:
            del _store[k]
        return len(stale)


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
