"""Govern Posture — real AWS security/compliance posture, read-through GET routes."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_posture import ConfigCompliance, ConfigRuleDetail
from services.govern_posture_service import GovernPostureService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/posture", tags=["govern-posture"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_posture", region_scope.SINGLE_REGION, prefix="/govern/posture")

_svc: Optional[GovernPostureService] = None


def get_service() -> GovernPostureService:
    global _svc
    if _svc is None:
        _svc = GovernPostureService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/config-compliance", response_model=ConfigCompliance)
def get_config_compliance(_=Depends(require_role(Role.VIEWER))):
    """AWS Config rule compliance summary (config:DescribeComplianceByConfigRule)."""
    return get_service().get_config_compliance()


@router.get("/config-rule-detail", response_model=ConfigRuleDetail)
def get_config_rule_detail(_=Depends(require_role(Role.VIEWER))):
    """Which specific Config rules are non-compliant + a sample of failing resources."""
    return get_service().get_rule_detail()
