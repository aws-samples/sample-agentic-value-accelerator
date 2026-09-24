"""Govern Macie — Amazon Macie data-sensitivity, read-through GET route.

Feeds the Data Governance data-sensitivity / classification view with live
PII / PCI / PHI-style classification counts (by finding type, by severity) and
the count of affected S3 buckets, sourced straight from Amazon Macie. Single
region (the primary governed region, settings.GOVERN_AWS_REGION); honest-degrades
to live=false with setup guidance when Macie is disabled or not permitted.
"""

import logging

from fastapi import APIRouter, Depends

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from services.govern_macie_service import (
    GovernMacieService,
    MacieDataSensitivityResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/macie", tags=["govern-macie"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_macie", region_scope.SINGLE_REGION, prefix="/govern/macie")

# One cached service instance per region (preserves its internal TTL cache).
_svcs: dict[str, GovernMacieService] = {}


def _svc() -> GovernMacieService:
    region = settings.GOVERN_AWS_REGION
    if region not in _svcs:
        _svcs[region] = GovernMacieService(region=region)
    return _svcs[region]


@router.get("/data-sensitivity", response_model=MacieDataSensitivityResponse)
def get_data_sensitivity(_=Depends(require_role(Role.VIEWER))):
    """Live Macie data-sensitivity: PII/PCI/PHI-style classification counts by
    finding type and severity, distinct affected-bucket count, and a small masked
    sample of findings. Honest-degrades when Macie is disabled or not permitted."""
    return _svc().get_data_sensitivity()
