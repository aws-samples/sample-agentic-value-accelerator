"""API routes for Compliance Attestation management."""

from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from core import region_scope
from core import region_config
from core.config import settings
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

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_compliance", region_scope.SINGLE_REGION, prefix="/govern/compliance")

# Lazy singleton
_service: Optional[GovernComplianceService] = None


def _get_service() -> GovernComplianceService:
    global _service
    if _service is None:
        # Both of these used to be hardcoded here ("ava-govern-compliance" / "us-east-1"),
        # bypassing settings entirely. That table exists in neither region, so _check_table()
        # failed once, cached False on the CLASS, and every attestation went to a class-level
        # dict instead - writes returned 200 and were lost on the next restart. The name is
        # now a setting and the region resolves through the same table_region() convention as
        # every other control-plane table, so relocating it needs no code change.
        # Two regions, deliberately: the attestation table is control-plane infrastructure in
        # AWS_REGION, while auto-detect probes the GOVERNED fleet (Bedrock guardrails,
        # AgentCore agents, CloudWatch alarms) which lives in GOVERN_AWS_REGION.
        _service = GovernComplianceService(
            table_name=settings.GOVERN_COMPLIANCE_TABLE_NAME,
            region=region_config.table_region("GOVERN_COMPLIANCE"),
            govern_region=settings.GOVERN_AWS_REGION,
        )
    return _service


# Framework registry: the framework ids this API accepts, plus an informational control
# count per framework.
#
# The comment here used to read "should match frontend mockData". It does not match, and it
# is not meant to. Measured 2026-09-14: the 14 distinct entries below total 281 controls,
# while COMPLIANCE_CENTER_FRAMEWORKS in frontend/src/components/govern/mockData.ts
# enumerates 806 control literals across those same 14 framework ids. The divergence is not
# a uniform scale factor that could be reconciled arithmetically - nist-ai-rmf is 15 here
# against 62 there and cri-fs-ai-rmf is 45 against 274, while owasp-llm-top10 is 24 here
# against 22 there, so this side is not even uniformly the smaller one.
#
# The two sides enumerate different things. This dict is (a) the membership gate for
# /summary, /attestations and the attestation PUT and (b) a denominator of last resort for
# callers that only have the API. The frontend list is the actual checklist: it carries each
# control's id, label, section and seeded status, and it is authoritative for anything
# displayed.
#
# The consequence is a live reporting artifact, not just a code smell. The Compliance Center
# renders the seeded 806-control checklist and only overlays measured attestations onto it,
# while GovernanceCommandCenter's compliance bars and the Reports landing read
# total_controls / coverage_pct straight from /posture (281) when posture is live and fall
# back to a rollup of that same seeded checklist when it is not. So the Govern module
# reports two different estate sizes at once, and the number a given card shows moves with
# PROVENANCE rather than with the estate.
#
# Do not close the gap by editing these integers to 806-consistent values: that makes the
# denominator agree while the control ids still do not, which is the more misleading of the
# two states. Closing it properly means serving the checklist itself from one side only.
FRAMEWORK_META = {
    "sr26-2": {"name": "SR 26-2", "total_controls": 16},
    "nist-ai-rmf": {"name": "NIST AI RMF", "total_controls": 15},
    "eu-ai-act": {"name": "EU AI Act", "total_controls": 19},
    "data-sensitivity": {"name": "Data Sensitivity", "total_controls": 14},
    "aws-rai-lens": {"name": "AWS RAI Lens", "total_controls": 35},
    "cri-fs-ai-rmf": {"name": "CRI FS AI RMF", "total_controls": 45},
    "iso-42001": {"name": "ISO 42001", "total_controls": 16},
    "owasp-llm-top10": {"name": "OWASP LLM Top 10", "total_controls": 24},
    "naic-model-bulletin": {"name": "NAIC AI Systems Evaluation Tool", "total_controls": 16},
    "osfi-e-23": {"name": "OSFI E-23", "total_controls": 15},
    "colorado-sb-205": {"name": "Colorado AI Act (SB 26-189)", "total_controls": 6},
    "finos-air": {"name": "FINOS AIR", "total_controls": 34},
    # Frontend-facing framework ids (COMPLIANCE_CENTER_FRAMEWORKS in mockData.ts). The
    # attestations endpoint gates on membership here; total_controls is informational
    # (the frontend is authoritative for displayed control counts). These ids differ
    # from the aliases above / were previously unregistered, so they 404'd.
    "osfi-e23": {"name": "OSFI E-23", "total_controls": 15},
    # Both names below name the wrong instrument until this branch. "NAIC Model Bulletin"
    # was the 2023 NAIC Model Bulletin on the Use of AI by Insurance Companies, but these 16
    # controls are the Exhibit A / B / C structure of the NAIC AI Systems Evaluation Tool
    # (the 12-state regulatory pilot that builds ON the bulletin) - that is what the
    # frontend's naic-ai checklist enumerates. "Colorado SB 205" was wrong twice over:
    # Colorado bills are numbered SB YY-NNN, so the original Colorado AI Act was SB 24-205,
    # and SB 26-189 ("Automated Decision-Making Technology", signed 2026-05-14, Session Law
    # ch. 131) repealed and reenacted those provisions with ADMT obligations from
    # 2027-01-01. Both corrections verified against content.naic.org and leg.colorado.gov,
    # not inferred from the frontend.
    #
    # These names are user-visible: GovernanceCommandCenter renders posture's framework_name
    # as its compliance bar labels when posture is live, so the backend was labelling a card
    # with a superseded statute.
    "naic-ai": {"name": "NAIC AI Systems Evaluation Tool", "total_controls": 16},
    "colorado-ai-act": {"name": "Colorado AI Act (SB 26-189)", "total_controls": 6},
    "mitre-atlas": {"name": "MITRE ATLAS", "total_controls": 14},
    "nist-genai-profile": {"name": "NIST GenAI Profile", "total_controls": 12},
}

# Three frameworks above are registered twice under two spellings of their id. These are
# the spellings the frontend never calls; its authoritative list uses the other side
# ('osfi-e23', 'naic-ai', 'colorado-ai-act').
#
# They stay in FRAMEWORK_META because /summary, /attestations and the attestation PUT all
# gate on membership here, so removing them would 404 those ids again. They are excluded
# from AGGREGATION only, so /posture reports the distinct estate (14 frameworks /
# 281 controls) instead of double-counting to 17 / 318.
#
# The excluded side is deliberately the one the UI does not use: attestations are
# partitioned per framework id (pk = COMPLIANCE#{framework_id}), so aggregating the
# unused spelling would read an empty partition and report a real framework as
# entirely unassessed. Verified against the live endpoint before landing this: all six
# partitions held 0 attestations, so no stored row changes bucket either way.
#
# Both spellings of a pair MUST keep the SAME `name`. useReportsLiveData.ts dedupes posture
# rows by lowercased framework_name precisely because the ids are what diverge, so renaming
# one side of a pair and not the other would resurrect the double-count that exclusion list
# exists to prevent, should an alias ever re-enter /posture. That is why the NAIC and
# Colorado renames above were applied to the alias entries too, even though nothing calls
# them.
FRAMEWORK_ALIAS_IDS = {"osfi-e-23", "naic-model-bulletin", "colorado-sb-205"}


@router.get("/posture", response_model=CompliancePosture)
async def get_compliance_posture(_=Depends(require_role(Role.VIEWER))):
    """Get overall compliance posture across all distinct frameworks."""
    service = _get_service()
    frameworks = [
        {"id": k, "name": v["name"], "total_controls": v["total_controls"]}
        for k, v in FRAMEWORK_META.items()
        if k not in FRAMEWORK_ALIAS_IDS
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
        raise HTTPException(
            status_code=404,
            detail=f"No attestation for control {control_id} in framework {framework_id}",
        )
    return attestation


@router.put("/frameworks/{framework_id}/controls/{control_id}", response_model=ControlAttestation)
async def update_attestation(
    framework_id: str,
    control_id: str,
    update: ControlAttestationUpdate,
    updated_by: Optional[str] = Query(
        default=None, description="Overrides the x-user-email header as the attribution"
    ),
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Create or update a control attestation.

    Attribution resolves `x-user-email` header -> query param -> `"unknown"`. The query
    param used to default to the literal `"user"`, and the frontend never passed it
    (`complianceApi.updateAttestation` takes `updatedBy` but every call site omits it),
    so the default *was* the value: every hand-entered attestation in the compliance
    table was stamped `updated_by="user"`, naming nobody.

    That matters more here than on most writes. This table is the attestation of record -
    the thing a regulator asks for - and an attestation whose attribution is a fabricated
    constant is not signed by anyone, while still looking signed. `"unknown"` is worse
    to read and better to trust: it is falsifiable, so a missing header surfaces as a
    gap instead of as a plausible name.

    The header wins over the query param, and that ordering is deliberate: the header is
    the identity `core/rbac.py` already acted on to authorize this call, while the query
    param is a string the caller typed. Letting the param win would let an authenticated
    operator sign an attestation in somebody else's name. The param is kept, rather than
    removed, only so a header-less server-to-server caller can still attribute its write.
    """
    if framework_id not in FRAMEWORK_META:
        raise HTTPException(status_code=404, detail=f"Framework {framework_id} not found")

    service = _get_service()
    return service.upsert_attestation(
        framework_id=framework_id,
        control_id=control_id,
        update=update,
        updated_by=x_user_email or updated_by or "unknown",
    )


@router.post("/frameworks/{framework_id}/controls/{control_id}/evidence", response_model=Evidence)
async def add_evidence(
    framework_id: str,
    control_id: str,
    evidence: EvidenceCreate,
    uploaded_by: Optional[str] = Query(
        default=None, description="Overrides the x-user-email header as the attribution"
    ),
    x_user_email: Optional[str] = Header(default=None, alias="x-user-email"),
    _=Depends(require_role(Role.OPERATOR)),
):
    """Add evidence to a control attestation.

    Attribution resolves `x-user-email` header -> query param -> `"unknown"`, as in
    `update_attestation` above. Uploader identity is the point of an evidence record:
    the file itself proves nothing about who vouched for it, so a fabricated
    `uploaded_by` hollows out the only part of the row that carries accountability.
    """
    service = _get_service()
    actor = x_user_email or uploaded_by or "unknown"

    # Ensure attestation exists
    att = service.get_attestation(framework_id, control_id)
    if not att:
        # Create a new attestation in not-started state
        service.upsert_attestation(
            framework_id=framework_id,
            control_id=control_id,
            update=ControlAttestationUpdate(),
            updated_by=actor,
        )

    return service.add_evidence(
        framework_id=framework_id,
        control_id=control_id,
        evidence=evidence,
        uploaded_by=actor,
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
