"""API routes for Compliance Evidence Chain — mapping AVA controls to compliance frameworks.

Provides endpoints to:
- List supported compliance frameworks
- Get coverage metrics for each framework
- View control mappings and evidence requirements
- Collect and view evidence for specific controls
- Generate compliance reports
- Export auditor-ready evidence packages
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_compliance_evidence import (
    ComplianceFramework,
    ComplianceReport,
    ControlMappingsResponse,
    EvidenceExport,
    EvidenceResponse,
    FrameworkCoverageResponse,
    FrameworkListResponse,
)
from services.govern_compliance_evidence_service import GovernComplianceEvidenceService

router = APIRouter(
    prefix="/govern/compliance-evidence",
    tags=["govern-compliance-evidence"],
)

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_compliance_evidence", region_scope.SINGLE_REGION, prefix="/govern/compliance-evidence")

# Lazy singleton
_service: Optional[GovernComplianceEvidenceService] = None


def _get_service() -> GovernComplianceEvidenceService:
    global _service
    if _service is None:
        # settings.GOVERN_AWS_REGION (tier 2), not a literal. See core/region_config.py.
        #
        # Honest scope of this change: the value is inert today. Verified by reading
        # services/govern_compliance_evidence_service.py end to end - __init__ stores
        # self.region and nothing else ever reads it, the class builds no boto3 client, and
        # every collector reads an in-process AVA module (core/harness_killswitch.py,
        # core/path_jail.py, core/rbac.py) or returns an illustrative stub. So this is not
        # a live-data fix; it removes a literal that would become one. The single
        # AWS-shaped collector, _collect_cloudtrail_evidence(), is the stub that will need
        # a real client, and CloudTrail evidence for AI activity is the customer's estate,
        # which is tier 2 by definition.
        _service = GovernComplianceEvidenceService(region=settings.GOVERN_AWS_REGION)
    return _service


# ─────────────────────────────────────────────────────────────────────────────
# Framework Listing
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/frameworks", response_model=FrameworkListResponse)
async def list_frameworks(_=Depends(require_role(Role.VIEWER))):
    """List all supported compliance frameworks.

    Returns information about each framework including:
    - Framework ID and display name
    - Number of controls defined
    - Framework description
    """
    service = _get_service()
    return service.list_frameworks()


# ─────────────────────────────────────────────────────────────────────────────
# Framework Coverage
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/frameworks/{framework}/coverage", response_model=FrameworkCoverageResponse)
async def get_framework_coverage(
    framework: str,
    _=Depends(require_role(Role.VIEWER)),
):
    """Get coverage metrics for a specific framework.

    Returns:
    - Total number of controls
    - Number of controls with collected evidence
    - Number of controls pending evidence
    - Number of gaps (controls without AVA mapping)
    - Coverage percentage
    """
    try:
        fw = ComplianceFramework(framework)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail=f"Framework '{framework}' not found. Valid frameworks: {[f.value for f in ComplianceFramework]}",
        )

    service = _get_service()
    return service.get_framework_coverage(fw)


# ─────────────────────────────────────────────────────────────────────────────
# Control Mappings
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/frameworks/{framework}/controls", response_model=ControlMappingsResponse)
async def get_control_mappings(
    framework: str,
    _=Depends(require_role(Role.VIEWER)),
):
    """Get all control mappings for a framework.

    Returns detailed mapping information:
    - Control ID and name
    - Description of the requirement
    - AVA controls that satisfy the requirement
    - Types of evidence that prove compliance
    - Priority level
    """
    try:
        fw = ComplianceFramework(framework)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail=f"Framework '{framework}' not found. Valid frameworks: {[f.value for f in ComplianceFramework]}",
        )

    service = _get_service()
    return service.get_control_mappings(fw)


# ─────────────────────────────────────────────────────────────────────────────
# Evidence Collection
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/frameworks/{framework}/evidence/{control_id}",
    response_model=EvidenceResponse,
)
async def get_control_evidence(
    framework: str,
    control_id: str,
    _=Depends(require_role(Role.VIEWER)),
):
    """Get or collect evidence for a specific control.

    If evidence has not been collected, this endpoint will trigger
    evidence collection from the relevant AVA controls.

    Returns:
    - List of evidence items
    - Evidence status (collected/pending/gap)
    - Evidence metadata (source, validity, etc.)
    """
    try:
        fw = ComplianceFramework(framework)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail=f"Framework '{framework}' not found. Valid frameworks: {[f.value for f in ComplianceFramework]}",
        )

    service = _get_service()
    return service.collect_evidence(fw, control_id)


@router.post(
    "/frameworks/{framework}/evidence/{control_id}/refresh",
    response_model=EvidenceResponse,
)
async def refresh_control_evidence(
    framework: str,
    control_id: str,
    _=Depends(require_role(Role.OPERATOR)),
):
    """Force refresh evidence collection for a specific control.

    This will re-collect evidence from all mapped AVA controls,
    even if valid evidence already exists.
    """
    try:
        fw = ComplianceFramework(framework)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail=f"Framework '{framework}' not found. Valid frameworks: {[f.value for f in ComplianceFramework]}",
        )

    service = _get_service()
    # Clear existing evidence and re-collect
    control_key = f"{fw.value}#{control_id}"
    if control_key in service._evidence_store:
        del service._evidence_store[control_key]

    return service.collect_evidence(fw, control_id)


# ─────────────────────────────────────────────────────────────────────────────
# Report Generation
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/frameworks/{framework}/report", response_model=ComplianceReport)
async def generate_report(
    framework: str,
    _=Depends(require_role(Role.OPERATOR)),
):
    """Generate a full compliance report for a framework.

    This will:
    1. Collect evidence for all controls (if not already collected)
    2. Calculate coverage metrics
    3. Identify gaps
    4. Return a comprehensive report

    Requires OPERATOR role due to evidence collection overhead.
    """
    try:
        fw = ComplianceFramework(framework)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail=f"Framework '{framework}' not found. Valid frameworks: {[f.value for f in ComplianceFramework]}",
        )

    service = _get_service()
    return service.generate_report(fw)


# ─────────────────────────────────────────────────────────────────────────────
# Export
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/frameworks/{framework}/export", response_model=EvidenceExport)
async def export_evidence(
    framework: str,
    format: str = Query(default="json", description="Export format (json/csv)"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Export an auditor-ready evidence package for a framework.

    Returns a comprehensive package including:
    - Full compliance report
    - All collected evidence items
    - Evidence summary by type
    - Attestation statement
    - Reporting period metadata

    Requires OPERATOR role.
    """
    try:
        fw = ComplianceFramework(framework)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail=f"Framework '{framework}' not found. Valid frameworks: {[f.value for f in ComplianceFramework]}",
        )

    if format not in ("json", "csv"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format '{format}'. Valid formats: json, csv",
        )

    service = _get_service()
    return service.export_evidence(fw, export_format=format)


# ─────────────────────────────────────────────────────────────────────────────
# Bulk Operations
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/frameworks/{framework}/collect-all")
async def collect_all_evidence(
    framework: str,
    _=Depends(require_role(Role.OPERATOR)),
):
    """Collect evidence for all controls in a framework.

    This is a bulk operation that triggers evidence collection
    for every control mapping in the specified framework.

    Requires OPERATOR role due to resource intensity.
    """
    try:
        fw = ComplianceFramework(framework)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail=f"Framework '{framework}' not found. Valid frameworks: {[f.value for f in ComplianceFramework]}",
        )

    service = _get_service()
    mappings = service.get_control_mappings(fw)

    collected = 0
    errors = []

    for mapping in mappings.mappings:
        try:
            service.collect_evidence(fw, mapping.control_id)
            collected += 1
        except Exception as e:
            errors.append({"control_id": mapping.control_id, "error": str(e)})

    return {
        "framework": fw.value,
        "controls_processed": collected,
        "errors": errors,
        "success": len(errors) == 0,
    }
