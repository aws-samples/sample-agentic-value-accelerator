"""Govern IAM — vendor IAM access analysis routes.

Provides IAM access summaries for third-party AI vendors, showing what real AWS
permissions each vendor integration has. Backed by GovernIamService, which reads
live IAM (roles / trust policies / attached + inline policies) and IAM Access
Analyzer (external + unused access findings). Degrades gracefully to a clearly
labeled illustrative sample (live=False, source="mock") when AWS is unreachable.

Follows the govern slice route pattern — lazy service singleton reading settings,
honest live/fallback responses.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_iam import VendorIAMAccess
from services.govern_iam_service import GovernIamService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/iam", tags=["govern-iam"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_iam", region_scope.SINGLE_REGION, prefix="/govern/iam")

_svc: Optional[GovernIamService] = None


def get_service() -> GovernIamService:
    global _svc
    if _svc is None:
        _svc = GovernIamService(region=settings.GOVERN_AWS_REGION)
    return _svc


@router.get("/vendor-access/{vendor_id}", response_model=VendorIAMAccess)
async def get_vendor_iam_access(
    vendor_id: str,
    _=Depends(require_role(Role.VIEWER)),
):
    """Get the real IAM access summary for a specific vendor.

    Resolves the vendor's IAM footprint from live IAM + IAM Access Analyzer:
    roles, trust policies, attached/inline policies, granted permissions, external
    and unused-access findings, and a derived risk level. For vendors with no
    matching IAM roles (e.g. external SaaS tools invoked purely by API key), returns
    a live response with has_aws_access=False and an honest note.
    """
    logger.info("Fetching IAM access for vendor: %s", vendor_id)
    return get_service().get_vendor_access(vendor_id)
