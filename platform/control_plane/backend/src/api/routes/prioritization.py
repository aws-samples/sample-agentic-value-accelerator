"""Use Case Prioritization CRUD API routes."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from core.rbac import require_role, Role

from core.config import settings
from core.database import get_db
from models.prioritization import (
    DIMENSION_WEIGHTS_DEFAULT,
    DimensionWeights,
    SUB_WEIGHTS,
    UseCase,
    UseCaseCreate,
    UseCaseStatus,
    UseCaseUpdate,
)
from services.prioritization_service import PrioritizationService
from services.score_preseed import score_preseed
from services.transformation_value_model_service import CatalogService, NotFound

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/prioritization", tags=["prioritization"])

_svc: Optional[PrioritizationService] = None
_catalog = CatalogService()


def get_service() -> PrioritizationService:
    global _svc
    if _svc is None:
        _svc = PrioritizationService(
            table_name=settings.PRIORITIZATION_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _svc


def _resolve_catalog_context(db: Session, use_case_id: str) -> dict:
    """Resolve a catalog use case's related evidence for Score_Preseed.

    Returns the context dict expected by ``score_preseed``: related solutions,
    value levers, KPIs, data assets (with edge readiness), technology components,
    and the business domain reached via the use case's primary solution.
    """
    uc = _catalog.get(db, "use-cases", use_case_id, with_relationships=True)
    rels = uc.get("relationships", {})

    def _load(slug: str, items):
        return [_catalog.get(db, slug, it["id"]) for it in items]

    solutions = _load("solutions", rels.get("solutions", []))
    data_assets = []
    for it in rels.get("data_assets", []):
        da = _catalog.get(db, "data-assets", it["id"])
        # Carry the edge's current_readiness onto the asset for scoring.
        from models import catalog_orm as orm
        edge = db.query(orm.UseCaseDataRequirement).filter(
            orm.UseCaseDataRequirement.use_case_id == use_case_id,
            orm.UseCaseDataRequirement.data_asset_id == it["id"],
        ).first()
        if edge is not None and edge.current_readiness is not None:
            da = {**da, "current_readiness": edge.current_readiness}
        data_assets.append(da)
    tech = _load("technology-components", rels.get("technology_components", []))

    # Value levers + KPIs + domain reached through the primary solution.
    value_levers, kpis, business_domain = [], [], None
    if solutions:
        sol = _catalog.get(db, "solutions", solutions[0]["id"], with_relationships=True)
        srels = sol.get("relationships", {})
        value_levers = _load("value-levers", srels.get("value_levers", []))
        domains = srels.get("domains", [])
        if domains:
            business_domain = _catalog.get(db, "business-domains", domains[0]["id"])
        for lev in value_levers:
            lrel = _catalog.get(db, "value-levers", lev["id"], with_relationships=True)
            kpis.extend(_load("kpis", lrel.get("relationships", {}).get("kpis", [])))

    return {
        "solutions": solutions,
        "value_levers": value_levers,
        "kpis": kpis,
        "data_assets": data_assets,
        "technology_components": tech,
        "business_domain": business_domain,
    }


def _map_complexity(value: Optional[str]):
    from models.prioritization import Complexity
    mapping = {"low": Complexity.LOW, "medium": Complexity.MEDIUM,
              "moderate": Complexity.MEDIUM, "high": Complexity.HIGH,
              "very high": Complexity.HIGH}
    return mapping.get(str(value).strip().lower(), Complexity.MEDIUM) if value else Complexity.MEDIUM


# --- Reference / framework metadata ---

@router.get("/framework")
async def get_framework(_=Depends(require_role(Role.VIEWER))):
    """Return dimension weights, sub-criteria weights, and Go/No-Go thresholds.

    Used by the frontend to render scoring forms without hard-coding the schema.
    """
    return {
        "dimension_weights": DIMENSION_WEIGHTS_DEFAULT,
        "sub_weights": SUB_WEIGHTS,
        "thresholds": {
            "GO": {"composite": ">=3.5", "risk": "<=15", "readiness": ">=3.0"},
            "CONDITIONAL_GO": {"composite": "2.5-3.49", "risk": "16-20", "readiness": "2.0-2.99"},
            "NO_GO": {"composite": "<2.5", "risk": ">20", "readiness": "<2.0"},
        },
    }


# --- Catalog unification (Req 7) ---

@router.get("/preseed-from-catalog/{use_case_id}", response_model=UseCaseCreate)
async def preseed_from_catalog(
    use_case_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_role(Role.VIEWER)),
):
    """Return a UseCaseCreate pre-seeded from a catalog use case's evidence.

    Read-only: resolves the catalog use case + related context, runs the
    deterministic Score_Preseed mapper, and returns a create-shaped payload
    (scores populated, ``catalog_use_case_id`` set). The frontend POSTs this to
    the existing create endpoint, so standalone scoring behavior is untouched.
    """
    try:
        uc = _catalog.get(db, "use-cases", use_case_id)
    except NotFound:
        raise HTTPException(status_code=404, detail=f"Catalog use case '{use_case_id}' not found")

    context = _resolve_catalog_context(db, use_case_id)
    scores = score_preseed(uc, context)

    domain = context.get("business_domain") or {}
    return UseCaseCreate(
        name=uc.get("name") or "Untitled use case",
        description=uc.get("description") or "",
        business_domain=(domain.get("name") or "")[:80],
        complexity=_map_complexity(uc.get("complexity")),
        scores=scores,
        weights=DimensionWeights(),
        catalog_use_case_id=use_case_id,
    )


# --- CRUD ---

@router.post("", response_model=UseCase, status_code=201)
async def create_use_case(
    req: UseCaseCreate,
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR)),
):
    # created_by from the x-user-email header, or "unknown" - require_role returns only
    # a Role, never a principal. The literal "user" read like a real principal, so a
    # record with no captured author looked fully attributed.
    svc = get_service()
    return svc.create(req, created_by=x_user_email or "unknown")


@router.get("", response_model=List[UseCase])
async def list_use_cases(status: Optional[str] = Query(default=None), _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    status_filter = UseCaseStatus(status) if status else None
    return svc.list(status=status_filter)


@router.get("/{use_case_id}", response_model=UseCase)
async def get_use_case(use_case_id: str, _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    uc = svc.get(use_case_id)
    if not uc:
        raise HTTPException(status_code=404, detail="Use case not found")
    return uc


@router.put("/{use_case_id}", response_model=UseCase)
async def update_use_case(use_case_id: str, req: UseCaseUpdate, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    uc = svc.update(use_case_id, req)
    if not uc:
        raise HTTPException(status_code=404, detail="Use case not found")
    return uc


@router.delete("/{use_case_id}", response_model=UseCase)
async def delete_use_case(use_case_id: str, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    uc = svc.delete(use_case_id)
    if not uc:
        raise HTTPException(status_code=404, detail="Use case not found")
    return uc
