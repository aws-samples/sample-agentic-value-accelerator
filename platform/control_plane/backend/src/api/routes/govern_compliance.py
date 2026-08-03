"""API routes for Compliance Attestation management."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core.rbac import Role, require_role
from models.govern_compliance import (
    CompliancePosture,
    ControlAttestation,
    ControlAttestationUpdate,
    Evidence,
    EvidenceCreate,
    FrameworkSummary,
    AutoDetectionResult,
)
from services.govern_compliance_service import GovernComplianceService

router = APIRouter(prefix="/govern/compliance", tags=["govern-compliance"])

# Lazy singleton
_service: Optional[GovernComplianceService] = None


def _get_service() -> GovernComplianceService:
    global _service
    if _service is None:
        _service = GovernComplianceService(
            table_name="ava-govern-compliance",
            region="us-east-1",
        )
    return _service


# Framework metadata (control counts) - should match frontend mockData
FRAMEWORK_META = {
    "sr26-2": {"name": "SR 26-2", "total_controls": 16},
    "nist-ai-rmf": {"name": "NIST AI RMF", "total_controls": 15},
    "eu-ai-act": {"name": "EU AI Act", "total_controls": 19},
    "data-sensitivity": {"name": "Data Sensitivity", "total_controls": 14},
    "aws-rai-lens": {"name": "AWS RAI Lens", "total_controls": 35},
    "cri-fs-ai-rmf": {"name": "CRI FS AI RMF", "total_controls": 45},
    "iso-42001": {"name": "ISO 42001", "total_controls": 16},
    "owasp-llm-top10": {"name": "OWASP LLM Top 10", "total_controls": 24},
    "naic-model-bulletin": {"name": "NAIC Model Bulletin", "total_controls": 16},
    "osfi-e-23": {"name": "OSFI E-23", "total_controls": 15},
    "colorado-sb-205": {"name": "Colorado SB 205", "total_controls": 6},
    "finos-air": {"name": "FINOS AIR", "total_controls": 34},
}


@router.get("/posture", response_model=CompliancePosture)
async def get_compliance_posture(_=Depends(require_role(Role.VIEWER))):
    """Get overall compliance posture across all frameworks."""
    service = _get_service()
    frameworks = [
        {"id": k, "name": v["name"], "total_controls": v["total_controls"]}
        for k, v in FRAMEWORK_META.items()
    ]
    return service.get_compliance_posture(frameworks)


@router.get("/frameworks/{framework_id}/summary", response_model=FrameworkSummary)
async def get_framework_summary(framework_id: str, _=Depends(require_role(Role.VIEWER))):
    """Get summary stats for a specific framework."""
    if framework_id not in FRAMEWORK_META:
        raise HTTPException(status_code=404, detail=f"Framework {framework_id} not found")

    service = _get_service()
    meta = FRAMEWORK_META[framework_id]
    return service.get_framework_summary(
        framework_id=framework_id,
        framework_name=meta["name"],
        total_controls=meta["total_controls"],
    )


@router.get("/frameworks/{framework_id}/attestations", response_model=List[ControlAttestation])
async def list_attestations(framework_id: str, _=Depends(require_role(Role.VIEWER))):
    """List all attestations for a framework."""
    if framework_id not in FRAMEWORK_META:
        raise HTTPException(status_code=404, detail=f"Framework {framework_id} not found")

    service = _get_service()
    return service.list_attestations(framework_id)


@router.get("/frameworks/{framework_id}/controls/{control_id}", response_model=ControlAttestation)
async def get_attestation(framework_id: str, control_id: str, _=Depends(require_role(Role.VIEWER))):
    """Get a single control attestation."""
    service = _get_service()
    attestation = service.get_attestation(framework_id, control_id)
    if not attestation:
        raise HTTPException(status_code=404, detail=f"Attestation not found")
    return attestation


@router.put("/frameworks/{framework_id}/controls/{control_id}", response_model=ControlAttestation)
async def update_attestation(
    framework_id: str,
    control_id: str,
    update: ControlAttestationUpdate,
    updated_by: str = Query(default="user", description="User making the update"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Create or update a control attestation."""
    if framework_id not in FRAMEWORK_META:
        raise HTTPException(status_code=404, detail=f"Framework {framework_id} not found")

    service = _get_service()
    return service.upsert_attestation(
        framework_id=framework_id,
        control_id=control_id,
        update=update,
        updated_by=updated_by,
    )


@router.post("/frameworks/{framework_id}/controls/{control_id}/evidence", response_model=Evidence)
async def add_evidence(
    framework_id: str,
    control_id: str,
    evidence: EvidenceCreate,
    uploaded_by: str = Query(default="user", description="User uploading evidence"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Add evidence to a control attestation."""
    service = _get_service()

    # Ensure attestation exists
    att = service.get_attestation(framework_id, control_id)
    if not att:
        # Create a new attestation in not-started state
        service.upsert_attestation(
            framework_id=framework_id,
            control_id=control_id,
            update=ControlAttestationUpdate(),
            updated_by=uploaded_by,
        )

    return service.add_evidence(
        framework_id=framework_id,
        control_id=control_id,
        evidence=evidence,
        uploaded_by=uploaded_by,
    )


@router.get("/frameworks/{framework_id}/controls/{control_id}/evidence", response_model=List[Evidence])
async def list_evidence(framework_id: str, control_id: str, _=Depends(require_role(Role.VIEWER))):
    """List all evidence for a control."""
    service = _get_service()
    return service.list_evidence(framework_id, control_id)


@router.post("/auto-detect", response_model=List[AutoDetectionResult])
async def run_auto_detection(_=Depends(require_role(Role.OPERATOR))):
    """Run auto-detection to update attestations from AWS services."""
    service = _get_service()
    return await service.run_auto_detection()


@router.post("/bulk-update")
async def bulk_update_attestations(
    attestations: List[dict],
    updated_by: str = Query(default="bulk-import", description="Source of bulk update"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Bulk update attestations (for imports or migrations)."""
    service = _get_service()
    count = service.bulk_upsert(attestations, updated_by=updated_by)
    return {"updated": count}
