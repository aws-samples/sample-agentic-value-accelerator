"""The three region tiers, and the governed-region set behind tier 2.

"Multi-region" is three different questions in this codebase, and only two of them
are safe to fan out. Every boto3 client built in the backend belongs to exactly one
of these tiers; picking the wrong one is how a correctly-provisioned table renders
as an empty list.

**Tier 1 - control plane (`control_region`, `table_region`).** AVA's own DynamoDB
tables. Read-WRITE, therefore single-region by construction: a table has one home
region. Do NOT read a union of regions here. A union means an item edited in one
region stays stale in the other, the UI shows duplicate rows with no defined winner,
and there is no tie-break to apply. If these tables ever genuinely need to live in
more than one region, the answer is DynamoDB Global Tables (multi-active, streams,
last-writer-wins) declared in Terraform - not an application-level union.

**Tier 2 - governed resources (`get_governed_regions`).** The customer's AI estate:
Bedrock, AgentCore, SageMaker, and the CloudWatch metrics they emit. Read-ONLY,
therefore genuinely multi-region: fan out with core.multiregion.run_over_regions and
merge. The set is persisted to settings.GOVERN_REGIONS_CONFIG_PATH so runtime "pull a
region into governance" actions survive restarts; when the file is absent, empty, or
unreadable it falls back to [settings.GOVERN_AWS_REGION], preserving single-region
behavior with zero configuration.

**Tier 3 - global and pinned services (`resolve_service_region`).** Services with no
meaningful per-region view. Two sub-cases, and they are not interchangeable:

  - botocore auto-pins the endpoint, so whatever region you pass is ignored.
    Verified: `ce` in us-east-2 resolves to ce.us-east-1.amazonaws.com, `budgets` to
    budgets.amazonaws.com, `organizations` to organizations.us-east-1.amazonaws.com,
    `iam` to iam.amazonaws.com. Passing a governed region here is harmless but
    misleading - it implies a per-region call that cannot happen.
  - botocore does NOT auto-pin, and the wrong region is a real failure. Verified:
    `health` in us-east-2 resolves to health.us-east-2.amazonaws.com and `support`
    to support.us-east-2.amazonaws.com, neither of which serves the API. These need
    an explicit pin, which is why govern_health_service and
    govern_trusted_advisor_service overwrite any region handed to them.

Pass every pinned service through resolve_service_region() so the pin is declared in
one place instead of re-derived per service.

Thread-safe; the governed set is cached with a file-mtime check so writes by this
process (and external edits) are picked up without a restart.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from typing import Dict, List, Optional

from core.config import settings

logger = logging.getLogger(__name__)

_lock = threading.RLock()
_cache: List[str] | None = None
_cache_mtime: float | None = None


# ---------------------------------------------------------------------------
# Tier 1 - control plane (single region per table, never a union)
# ---------------------------------------------------------------------------


def control_region() -> str:
    """Region of AVA's own control-plane infrastructure."""
    return (settings.AWS_REGION or "us-east-1").strip()


def table_region(table_key: str) -> str:
    """Home region of one control-plane DynamoDB table.

    `table_key` is the settings prefix of the table, i.e. the part before
    `_TABLE_NAME`: "GUARDRAILS" for GUARDRAILS_TABLE_NAME.

    Resolution order, most specific first:
      1. `<TABLE_KEY>_TABLE_REGION` env var - relocate one table
      2. `CONTROL_PLANE_TABLE_REGION` setting - relocate every table at once
      3. `AWS_REGION` - the control-plane region

    Resolution is configured, never discovered. Probing candidate regions for a
    matching table name was considered and rejected: if the same table name exists
    in two regions, discovery silently picks one, and a control-plane table picked
    at random is a split-brain write target. A miss here must surface as an honest
    failure naming both the table and the region searched - see
    GuardrailService.store_status() for the shape - not as an empty list.
    """
    key = (table_key or "").strip().upper().replace("-", "_")
    if key:
        override = (os.getenv(f"{key}_TABLE_REGION") or "").strip()
        if override:
            return override
    shared = (settings.CONTROL_PLANE_TABLE_REGION or "").strip()
    return shared or control_region()


# ---------------------------------------------------------------------------
# Tier 3 - global and pinned services
# ---------------------------------------------------------------------------

#: Services that serve exactly one region regardless of the caller's intent.
#: `auto` records whether botocore rewrites the endpoint for us (see module
#: docstring): False means passing the wrong region is a real, silent failure.
SERVICE_PINNED_REGIONS: Dict[str, str] = {
    "ce": "us-east-1",             # Cost Explorer - botocore auto-pins
    "budgets": "us-east-1",        # global endpoint - botocore auto-pins
    "organizations": "us-east-1",  # botocore auto-pins
    "iam": "us-east-1",            # global endpoint - botocore auto-pins
    "health": "us-east-1",         # NOT auto-pinned; wrong region fails
    "support": "us-east-1",        # NOT auto-pinned; wrong region fails
}

#: Subset of the above that botocore does NOT rewrite. These are the ones where an
#: unpinned caller actually breaks, so they are worth logging when corrected.
_HARD_PINNED = frozenset({"health", "support"})


def pinned_region(service: str) -> Optional[str]:
    """Return the single region `service` is served from, or None if regional."""
    return SERVICE_PINNED_REGIONS.get((service or "").strip().lower())


def resolve_service_region(service: str, requested: Optional[str] = None) -> str:
    """Region to build a boto3 client for `service` with.

    For a pinned service the pin wins over `requested` - that is the point. A
    corrected hard-pinned service is logged at debug so the misroute is traceable
    rather than invisible.
    """
    svc = (service or "").strip().lower()
    pin = SERVICE_PINNED_REGIONS.get(svc)
    if pin:
        if requested and requested != pin and svc in _HARD_PINNED:
            logger.debug(
                "%s is served only from %s; ignoring requested region %s",
                svc, pin, requested,
            )
        return pin
    return (requested or control_region()).strip() or control_region()


# ---------------------------------------------------------------------------
# Tier 2 - governed resources (fan out and merge)
# ---------------------------------------------------------------------------


def _config_path() -> str:
    return settings.GOVERN_REGIONS_CONFIG_PATH


def _fallback() -> List[str]:
    """Single-region fallback when nothing is persisted.

    The `or settings.AWS_REGION or "us-east-1"` limbs are belt-and-braces, not the live
    mechanism: `Settings.__init__` already resolves an unset GOVERN_AWS_REGION to AWS_REGION
    (then "us-east-1"), so the first operand is always non-empty. They are kept because this
    is the last line of defence for tier 2 and an empty region here would surface as
    boto3's ValueError("Invalid endpoint") from somewhere far away.

    Documenting this rather than deleting it because the chain used to be dead for the
    opposite reason: GOVERN_AWS_REGION's Field default was the literal "us-east-1", so it
    was never empty and AWS_REGION was never consulted. The limb read as live and wasn't.
    """
    region = (settings.GOVERN_AWS_REGION or settings.AWS_REGION or "us-east-1").strip()
    return [region] if region else ["us-east-1"]


def _dedupe(regions: List[str]) -> List[str]:
    """Normalize + de-duplicate while preserving order."""
    seen: set[str] = set()
    out: List[str] = []
    for r in regions:
        r = (r or "").strip()
        if r and r not in seen:
            seen.add(r)
            out.append(r)
    return out


def get_governed_regions() -> List[str]:
    """Return the governed-region set, reading the config file (mtime-cached)."""
    global _cache, _cache_mtime
    path = _config_path()
    with _lock:
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            # No file yet — use (and cache) the fallback.
            if _cache is None or _cache_mtime is not None:
                _cache = _fallback()
                _cache_mtime = None
            return list(_cache)

        if _cache is not None and _cache_mtime == mtime:
            return list(_cache)

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            regions = _dedupe(list(data.get("regions", [])))
            _cache = regions or _fallback()
            _cache_mtime = mtime
        except (OSError, ValueError, TypeError) as e:
            logger.warning("Governed-region config unreadable (%s); using fallback: %s", path, e)
            _cache = _fallback()
            _cache_mtime = None
        return list(_cache)


# ---------------------------------------------------------------------------
# Startup reporting
# ---------------------------------------------------------------------------


def resolution_report() -> List[Dict[str, str]]:
    """One row per region tier: the resolved value and where it came from.

    Lives here rather than in main.py because this module is the one that resolves the
    tiers; a reporter that re-derived them would be a second implementation of the rule,
    free to drift from the first and to report a region the code does not actually use.
    Every `region` field below is produced by calling the same function the services call.

    `source` distinguishes STATED from INHERITED on purpose. Inherited is legitimate - a
    single-region deployment is the common case - but it is also what a deployer who never
    knew tier 2 existed gets, and those two situations are indistinguishable from the
    resolved value alone.
    """
    cp_infra = control_region()
    # Where the control-plane TABLES are, which is not always where the infra is:
    # CONTROL_PLANE_TABLE_REGION relocates every table at once and wins over AWS_REGION. The
    # empty table key skips the per-table override branch, so this is the same resolution
    # every table without its own override gets. Reporting control_region() here instead was
    # wrong in the way this whole module warns about - it printed AWS_REGION while the
    # `source` field named CONTROL_PLANE_TABLE_REGION, so the two halves of one row disagreed.
    cp_tables = table_region("")
    governed = get_governed_regions()
    guardrails = table_region("GUARDRAILS")

    if settings.GOVERN_AWS_REGION_DECLARED:
        tier2_source = "GOVERN_AWS_REGION (stated explicitly)"
    else:
        tier2_source = (
            f"INHERITED from AWS_REGION - correct only if the AI estate is really in {cp_infra}"
        )

    shared_table_region = (settings.CONTROL_PLANE_TABLE_REGION or "").strip()
    if shared_table_region:
        tier1_source = (
            f"CONTROL_PLANE_TABLE_REGION (stated explicitly); the ECS/ALB/VPC infra itself "
            f"is in {cp_infra}"
        )
    else:
        tier1_source = "AWS_REGION"

    persisted = ""
    try:
        if os.path.exists(_config_path()):
            persisted = f" · governed set persisted at {_config_path()}"
    except OSError:
        pass

    return [
        {
            "tier": "1 control plane",
            "region": cp_tables,
            "holds": "AVA's own DynamoDB tables, read-write, single-region by construction",
            "source": tier1_source,
        },
        {
            "tier": "2 governed fleet",
            "region": ", ".join(governed),
            "holds": "the customer's Bedrock/AgentCore estate and its CloudWatch metrics",
            "source": tier2_source + persisted,
        },
        {
            "tier": "3 guardrails table",
            "region": guardrails,
            "holds": f"the {settings.GUARDRAILS_TABLE_NAME} table",
            "source": (
                "GUARDRAILS_TABLE_REGION (stated explicitly)"
                if (os.getenv("GUARDRAILS_TABLE_REGION") or "").strip()
                else "INHERITED from the control-plane region"
            ),
        },
    ]


def log_resolution() -> None:
    """Print the resolved region tiers at startup. Best-effort; never raises.

    This exists because a wrong tier-2 region is the one misconfiguration in this codebase
    that produces no error to read. Bedrock, CloudWatch, CloudTrail and Service Quotas are
    all per-region and none of them fails on the wrong region - they answer 200 with that
    region's inventory. The first symptom is a dashboard showing an AI estate of zero, which
    reads as "we have no agents" rather than "you are looking in the wrong region". So the
    resolution is stated once, at the only moment it is cheap to compare against reality.

    Terraform prompts for this at plan time and scripts/deploy.sh prints it before
    `compose up`; this is the third place, and the only one that reports what the running
    process actually resolved rather than what the deployment intended.

    Every line is prefixed REGION-TIER, so `docker compose logs backend | grep REGION-TIER`
    returns the complete block.
    """
    try:
        rows = resolution_report()
        # Every line of the block carries the marker, header and continuation lines included,
        # so `grep REGION-TIER` returns the whole report rather than a header telling you to
        # grep plus half the rows. This block is three tiers deep inside a startup log that
        # also seeds catalogs and starts two daemon threads; being findable is the point.
        logger.info("REGION-TIER report - resolved region per tier:")
        for r in rows:
            logger.info("REGION-TIER   %-18s %-28s %s", r["tier"], r["region"], r["source"])
            logger.info("REGION-TIER   %-18s %-28s holds: %s", "", "", r["holds"])

        # The one case worth a warning rather than an info: nobody ever stated where the
        # governed fleet is, and nothing is persisted either. Not an error - it is right for
        # a single-region deployment - but it is also exactly the omission that renders as an
        # empty AI estate, and the deployer who hit it by accident cannot tell from the
        # resolved value that they made a choice.
        if not settings.GOVERN_AWS_REGION_DECLARED and not os.path.exists(_config_path()):
            logger.warning(
                "GOVERN_AWS_REGION was never set, so the governed fleet is being read from "
                "the control-plane region (%s). If the Bedrock/AgentCore estate is somewhere "
                "else, AVA will report an empty estate rather than an error - AWS answers "
                "the wrong region with that region's inventory, not with a failure. Set "
                "GOVERN_AWS_REGION to state this explicitly.",
                control_region(),
            )
    except Exception as e:  # pragma: no cover - reporting must never break startup
        logger.warning("Could not report region resolution (non-fatal): %s", e)


def set_governed_regions(regions: List[str], mode: str = "add") -> List[str]:
    """Persist the governed-region set. mode='add' unions with current; 'replace' overwrites.

    Writes atomically (temp file + rename) so a concurrent reader never sees a partial file.
    Returns the resulting set.
    """
    global _cache, _cache_mtime
    path = _config_path()
    with _lock:
        incoming = _dedupe(regions)
        if mode == "replace":
            result = incoming or _fallback()
        else:  # add / union
            result = _dedupe(get_governed_regions() + incoming)

        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        tmp = f"{path}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"regions": result}, f, indent=2)
        os.replace(tmp, path)

        _cache = result
        try:
            _cache_mtime = os.path.getmtime(path)
        except OSError:
            _cache_mtime = None
        logger.info("Governed-region set updated (%s): %s", mode, result)
        return list(result)
