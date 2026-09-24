"""Govern multi-region — discovery + governed-region management routes.

- GET  /govern/regions/discovery : scan enabled regions for governed-AI resources
- GET  /govern/regions/governed  : the current (persisted) governed-region set
- GET  /govern/regions/scope     : each Govern surface's declared region coverage
- POST /govern/regions/govern    : bring region(s) under governance (persisted)
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from core.region_config import get_governed_regions, set_governed_regions
from models.govern_regions import (
    GovernedRegionsResponse,
    RegionDiscoveryResponse,
    RegionScopeResponse,
    SetGovernedRegionsRequest,
    SurfaceScope,
)
from services.govern_region_discovery_service import GovernRegionDiscoveryService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/regions", tags=["govern-regions"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_regions", region_scope.MULTI_REGION, prefix="/govern/regions")

_svc: Optional[GovernRegionDiscoveryService] = None


def get_service() -> GovernRegionDiscoveryService:
    global _svc
    if _svc is None:
        _svc = GovernRegionDiscoveryService(control_region=settings.AWS_REGION)
    return _svc


@router.get("/discovery", response_model=RegionDiscoveryResponse)
async def discover_regions(_=Depends(require_role(Role.VIEWER))):
    """Scan enabled AWS regions for governed-AI resources (TTL-cached)."""
    return get_service().discover()


@router.get("/governed", response_model=GovernedRegionsResponse)
async def get_governed(_=Depends(require_role(Role.VIEWER))):
    """Return the current governed-region set."""
    return GovernedRegionsResponse(
        regions=get_governed_regions(),
        default_region=settings.GOVERN_AWS_REGION,
        source="config-file",
    )


@router.get("/scope", response_model=RegionScopeResponse)
async def get_region_scope(_=Depends(require_role(Role.VIEWER))):
    """Declared region coverage for every Govern surface.

    Reads the in-process registry that each route module populates at import time
    (core/region_scope.py), so it reflects the code that is actually serving requests
    rather than a hand-maintained list. Surfaces are keyed by route module because
    router prefixes are not unique.
    """
    declared = region_scope.all_scopes()
    surfaces = [
        SurfaceScope(
            surface=name,
            prefix=entry.get("prefix", ""),
            scope=entry["scope"],
            meaning=region_scope.SCOPE_MEANING.get(entry["scope"], ""),
        )
        for name in sorted(declared)
        for entry in (declared[name],)
    ]
    return RegionScopeResponse(
        surfaces=surfaces,
        by_scope={s: region_scope.surfaces_with(s) for s in region_scope.VALID_SCOPES},
        scope_meanings=dict(region_scope.SCOPE_MEANING),
        governed_regions=get_governed_regions(),
        default_region=settings.GOVERN_AWS_REGION,
    )


@router.post("/govern", response_model=GovernedRegionsResponse)
async def govern_regions(req: SetGovernedRegionsRequest, _=Depends(require_role(Role.ADMIN))):
    """Bring region(s) under governance (persisted to the config file).

    Region ids are validated against the account's ENABLED regions before being persisted.
    Previously any string was accepted and written straight to the config file, so a typo
    ('us-east-11') or a region the account has not opted into became a governed region. The
    cost is not a validation error at write time - it is that every merged Govern read then
    fans out to a region that cannot answer. Those reads are wall-clock capped rather than
    hanging, but each one degrades, and the operator sees unreachable surfaces across the
    module with nothing pointing back to the typo that caused it.
    """
    try:
        enabled = set(get_service()._enabled_regions())
    except Exception as e:  # pragma: no cover - discovery is best-effort
        logger.warning("Could not resolve enabled regions for validation: %s", e)
        enabled = set()

    if enabled:
        unknown = sorted({r.strip() for r in req.regions if r.strip()} - enabled)
        if unknown:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": (
                        "These region ids are not enabled on this account, so governing them "
                        "would make every merged Govern read fail against them."
                    ),
                    "unknown_regions": unknown,
                    "enabled_regions": sorted(enabled),
                },
            )

    updated = set_governed_regions(req.regions, mode=req.mode)
    return GovernedRegionsResponse(
        regions=updated,
        default_region=settings.GOVERN_AWS_REGION,
        source="config-file",
    )
