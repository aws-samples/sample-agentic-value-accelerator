"""Organization Design CRUD API routes."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core.rbac import require_role, Role

from core.config import settings
from models.organization_design import (
    OrganizationDesign,
    OrganizationDesignCreate,
    OrganizationDesignStatus,
    OrganizationDesignUpdate,
    DIMENSION_LABELS,
    DIMENSIONS,
    INDUSTRIES,
    INDUSTRY_WEIGHTS,
    INDUSTRY_GATES,
    STRUCTURE_TYPES,
    STRUCTURE_SPANS,
    STRUCTURE_MATRIX,
    SCENARIO_PATHWAYS,
    PHASES,
    PHASE_GOVERNANCE,
    PHASE_RATIO,
    PHASE_GAIN,
    BUSINESS_MODELS,
    COMPETITIVE_POSITIONING,
    VALUE_DRIVERS,
    MARKET_DYNAMICS,
    REVENUE_MODELS,
    COORDINATION_MECHANISMS,
    OPERATING_ARCHETYPES,
    SOURCE_STRATEGIES,
    FUNCTION_CATALOG,
    COST_BENCHMARKS,
    WORKFORCE_MIX_DEFAULT,
    SCENARIO_MULTIPLIERS,
    SCENARIO_GATES,
)
from services.organization_design_service import OrganizationDesignService, NameTakenError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/organization-designs", tags=["organization-design"])

_svc: Optional[OrganizationDesignService] = None


def get_service() -> OrganizationDesignService:
    global _svc
    if _svc is None:
        _svc = OrganizationDesignService(
            table_name=settings.ORGANIZATION_DESIGN_TABLE_NAME,
            region=settings.AWS_REGION,
        )
    return _svc


# --- Reference / framework metadata ---

@router.get("/framework")
async def get_framework(_=Depends(require_role(Role.VIEWER))):
    """Reference data lifted verbatim from the AWS Agentic Enterprise Org Design workbook."""
    return {
        "dimensions": [{"key": k, "label": DIMENSION_LABELS[k]} for k in DIMENSIONS],
        "industries": INDUSTRIES,
        "industry_weights": INDUSTRY_WEIGHTS,
        "industry_gates": INDUSTRY_GATES,
        "structure_types": STRUCTURE_TYPES,
        "structure_spans": STRUCTURE_SPANS,
        "structure_matrix": STRUCTURE_MATRIX,
        "scenario_pathways": SCENARIO_PATHWAYS,
        "phases": PHASES,
        "phase_governance": PHASE_GOVERNANCE,
        "phase_ratio": PHASE_RATIO,
        "phase_gain": PHASE_GAIN,
        "business_models": BUSINESS_MODELS,
        "competitive_positioning": COMPETITIVE_POSITIONING,
        "value_drivers": VALUE_DRIVERS,
        "market_dynamics": MARKET_DYNAMICS,
        "revenue_models": REVENUE_MODELS,
        "coordination_mechanisms": COORDINATION_MECHANISMS,
        "operating_archetypes": OPERATING_ARCHETYPES,
        "source_strategies": SOURCE_STRATEGIES,
        "function_catalog": FUNCTION_CATALOG,
        "cost_benchmarks": COST_BENCHMARKS,
        "workforce_mix_default": WORKFORCE_MIX_DEFAULT,
        "scenario_multipliers": SCENARIO_MULTIPLIERS,
        "scenario_gates": SCENARIO_GATES,
    }


# --- CRUD ---

@router.post("", response_model=OrganizationDesign, status_code=201)
async def create_organization_design(req: OrganizationDesignCreate, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    try:
        return svc.create(req, created_by="user")
    except NameTakenError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("", response_model=List[OrganizationDesign])
async def list_organization_designs(status: Optional[str] = Query(default=None), _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    status_filter = OrganizationDesignStatus(status) if status else None
    return svc.list(status=status_filter)


@router.get("/{organization_design_id}", response_model=OrganizationDesign)
async def get_organization_design(organization_design_id: str, _=Depends(require_role(Role.VIEWER))):
    svc = get_service()
    m = svc.get(organization_design_id)
    if not m:
        raise HTTPException(status_code=404, detail="Organization design not found")
    return m


@router.put("/{organization_design_id}", response_model=OrganizationDesign)
async def update_organization_design(organization_design_id: str, req: OrganizationDesignUpdate, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    try:
        m = svc.update(organization_design_id, req)
    except NameTakenError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not m:
        raise HTTPException(status_code=404, detail="Organization design not found")
    return m


@router.delete("/{organization_design_id}", response_model=OrganizationDesign)
async def delete_organization_design(organization_design_id: str, _=Depends(require_role(Role.OPERATOR))):
    svc = get_service()
    m = svc.delete(organization_design_id)
    if not m:
        raise HTTPException(status_code=404, detail="Organization design not found")
    return m
