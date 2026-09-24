"""Declared region scope per Govern surface — which routes actually cover which regions.

Some Govern routes fan out over the governed-region set, some read exactly one
region, and a few talk to a single account-wide endpoint. All three render as the
same numbers in the same cards, and a number from one region looks exactly like a
number from five. This registry makes the difference a fact the API can state.

Each route module declares its scope at import time:

    REGION_SCOPE = region_scope.declare("govern_macie", SINGLE_REGION, prefix="/govern/macie")

Import-time, not call-time, on purpose: route modules are all imported when the app
builds its router, so the registry is complete before the first request. A lazily
populated version would report "no single-region surfaces" until someone happened to
load the page that proves otherwise.

The surface key is the route MODULE name, not the router prefix, because prefixes are
not unique - govern_models.py and govern_invocations.py both mount under
/govern/models, as do govern_cost.py and govern_cost_resource.py. Two modules sharing
a prefix can have different scopes, and collapsing them onto one key would let the
wider claim silently overwrite the narrower one.

The scopes:

  MULTI_REGION    - fans out with core.multiregion.run_over_regions and merges. Totals
                    cover the governed set, and the response carries a
                    RegionProvenance block naming the regions it reached.
  SINGLE_REGION   - reads GOVERN_AWS_REGION only. Resources of the same kind in other
                    governed regions are NOT counted. This is the honest default for
                    surfaces that have not been fanned out yet.
  ACCOUNT_PINNED  - talks to one endpoint that answers for the whole account (Cost
                    Explorer, Budgets, Organizations, IAM). Already account-wide;
                    fanning out would re-ask the same endpoint and double-count.
  CONTROL_PLANE   - reads AVA's own state, not governed AWS resources. Where that state
                    is a DynamoDB table it has one home region (see
                    core.region_config.table_region) and is never a union; where it is
                    in-process, region does not apply at all.

Nothing here changes behavior. It is a description, and its only job is to be true -
so a surface stays SINGLE_REGION until its route really does fan out.
"""

from __future__ import annotations

import threading
from typing import Dict, List

MULTI_REGION = "multi-region"
SINGLE_REGION = "single-region"
ACCOUNT_PINNED = "account-pinned"
CONTROL_PLANE = "control-plane"

VALID_SCOPES = (MULTI_REGION, SINGLE_REGION, ACCOUNT_PINNED, CONTROL_PLANE)

#: What each scope means to someone reading a number off the screen.
SCOPE_MEANING: Dict[str, str] = {
    MULTI_REGION: (
        "Aggregated across the governed regions; the response names the regions it "
        "reached and any it could not."
    ),
    SINGLE_REGION: (
        "Reads one region only. Matching resources in other governed regions are not "
        "included in these counts."
    ),
    ACCOUNT_PINNED: (
        "Single account-wide endpoint. Already covers every region, so there is "
        "nothing to fan out."
    ),
    CONTROL_PLANE: (
        "AVA's own state, not a view of governed AWS resources. Where that state is a "
        "DynamoDB table it has one home region; region has no meaning for the rest."
    ),
}

_lock = threading.RLock()
_registry: Dict[str, Dict[str, str]] = {}


def declare(surface: str, scope: str, prefix: str = "") -> str:
    """Record a surface's region scope and return it.

    Returns the scope so the call can be assigned to a module-level `REGION_SCOPE`,
    which keeps the declaration next to the code it describes instead of in a table
    somewhere else that drifts.
    """
    if scope not in VALID_SCOPES:
        raise ValueError(f"Unknown region scope {scope!r} for {surface!r}; expected one of {VALID_SCOPES}")
    with _lock:
        _registry[surface] = {"scope": scope, "prefix": prefix}
    return scope


def scope_of(surface: str) -> str:
    """Declared scope for a surface, or SINGLE_REGION when it has not declared one.

    Undeclared defaults to the narrowest claim rather than the widest: a surface that
    forgot to declare has almost certainly not been fanned out, and guessing
    MULTI_REGION would invent coverage that does not exist.
    """
    with _lock:
        entry = _registry.get(surface)
    return entry["scope"] if entry else SINGLE_REGION


def all_scopes() -> Dict[str, Dict[str, str]]:
    """Snapshot of every declared surface -> {scope, prefix}."""
    with _lock:
        return {s: dict(v) for s, v in _registry.items()}


def surfaces_with(scope: str) -> List[str]:
    """Declared surfaces at one scope, sorted."""
    with _lock:
        return sorted(s for s, v in _registry.items() if v["scope"] == scope)
