"""Govern Audit Manager — AWS Audit Manager assessments and evidence.

Provides visibility into compliance assessments, control sets, and collected
evidence from AWS Audit Manager. Cached with 15-minute TTL since assessment
data changes infrequently.

API Reference:
  - list_assessments → assessments[]{id, name, status, roles, frameworkId, frameworkName, creationTime}
  - get_assessment → assessment{id, name, description, status, roles, scope, frameworkId, frameworkName, ...}
  - get_assessment_report_url → presignedUrl{link, expiration}
  - list_control_domain_insights_by_assessment → controlDomainInsights[]
  - get_evidence_folders_by_assessment → evidenceFolders[]
"""

import logging
from typing import List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from core.ttl_cache import get_or_load

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/audit-manager", tags=["govern-audit-manager"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_audit_manager", region_scope.SINGLE_REGION, prefix="/govern/audit-manager")

_TTL = 900  # 15 min


# ─── Response Models ───


class AssessmentSummary(BaseModel):
    id: str
    name: str
    status: str = ""
    framework_id: Optional[str] = None
    framework_name: Optional[str] = None
    compliance_type: Optional[str] = None
    created_at: Optional[str] = None
    last_updated: Optional[str] = None
    roles: List[str] = Field(default_factory=list)


class AssessmentDetail(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    status: str = ""
    framework_id: Optional[str] = None
    framework_name: Optional[str] = None
    compliance_type: Optional[str] = None
    scope: Optional[dict] = None
    roles: List[str] = Field(default_factory=list)
    created_at: Optional[str] = None
    last_updated: Optional[str] = None
    assessment_reports_destination: Optional[dict] = None


class ControlSetSummary(BaseModel):
    id: str
    name: str
    status: str = ""
    roles: List[str] = Field(default_factory=list)
    total_evidence_count: int = 0
    controls_metadata_count: int = 0


class EvidenceFolderSummary(BaseModel):
    id: str
    name: str
    date: Optional[str] = None
    assessment_id: str
    control_set_id: str
    control_id: Optional[str] = None
    control_name: Optional[str] = None
    total_evidence: int = 0
    assessment_report_selection_count: int = 0
    author: Optional[str] = None


class EvidenceItem(BaseModel):
    id: str
    data_source: str = ""
    evidence_aws_account_id: Optional[str] = None
    time: Optional[str] = None
    event_source: Optional[str] = None
    event_name: Optional[str] = None
    evidence_by_type: Optional[str] = None
    compliance_check: Optional[str] = None
    iam_id: Optional[str] = None
    attributes: Optional[dict] = None


class AssessmentsResponse(BaseModel):
    assessments: List[AssessmentSummary]
    count: int
    live: bool = False
    source: str = "mock"
    note: Optional[str] = None


class ControlSetsResponse(BaseModel):
    control_sets: List[ControlSetSummary]
    assessment_id: str
    count: int
    live: bool = False
    source: str = "mock"
    note: Optional[str] = None


class EvidenceFoldersResponse(BaseModel):
    evidence_folders: List[EvidenceFolderSummary]
    assessment_id: str
    count: int
    live: bool = False
    source: str = "mock"
    note: Optional[str] = None


class EvidenceResponse(BaseModel):
    evidence: List[EvidenceItem]
    folder_id: str
    count: int
    live: bool = False
    source: str = "mock"
    note: Optional[str] = None


# ─── Service ───


def _iso(v) -> Optional[str]:
    return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v else None)


def _am_client():
    return boto3.client("auditmanager", region_name=settings.AWS_REGION)


def _fetch_assessments() -> AssessmentsResponse:
    """List all AWS Audit Manager assessments."""
    try:
        am = _am_client()
        assessments = []
        next_token = None
        while True:
            params = {"maxResults": 100}
            if next_token:
                params["nextToken"] = next_token
            resp = am.list_assessments(**params)
            for a in resp.get("assessmentMetadata", []):
                assessments.append(AssessmentSummary(
                    id=a.get("id", ""),
                    name=a.get("name", "Unknown"),
                    status=a.get("status", ""),
                    framework_id=a.get("delegations", [{}])[0].get("roleArn") if a.get("delegations") else None,
                    compliance_type=a.get("complianceType"),
                    created_at=_iso(a.get("creationTime")),
                    last_updated=_iso(a.get("lastUpdated")),
                    roles=[d.get("roleArn", "") for d in a.get("delegations", []) if d.get("roleArn")],
                ))
            next_token = resp.get("nextToken")
            if not next_token:
                break
        return AssessmentsResponse(
            assessments=assessments,
            count=len(assessments),
            live=True,
            source="AWS Audit Manager",
        )
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code == "AccessDeniedException":
            return AssessmentsResponse(
                assessments=[],
                count=0,
                live=False,
                source="access-denied",
                note="No Audit Manager permissions. Grant auditmanager:ListAssessments.",
            )
        elif code in ("ValidationException", "ServiceQuotaExceededException"):
            return AssessmentsResponse(
                assessments=[],
                count=0,
                live=False,
                source="service-error",
                note=f"Audit Manager error: {code}",
            )
        logger.warning(f"Audit Manager ListAssessments failed: {e}")
        raise
    except (BotoCoreError, Exception) as e:
        if "not subscribed" in str(e).lower() or "not enabled" in str(e).lower():
            return AssessmentsResponse(
                assessments=[],
                count=0,
                live=False,
                source="not-enabled",
                note="AWS Audit Manager is not enabled in this account.",
            )
        logger.warning(f"Audit Manager error: {e}")
        return AssessmentsResponse(
            assessments=[],
            count=0,
            live=False,
            source="error",
            note=str(e)[:100],
        )


def _fetch_assessment_detail(assessment_id: str) -> Optional[AssessmentDetail]:
    """Get detailed info for a specific assessment."""
    try:
        am = _am_client()
        resp = am.get_assessment(assessmentId=assessment_id)
        a = resp.get("assessment", {})
        meta = a.get("metadata", {})
        return AssessmentDetail(
            id=meta.get("id", assessment_id),
            name=meta.get("name", "Unknown"),
            description=meta.get("description"),
            status=meta.get("status", ""),
            framework_id=a.get("framework", {}).get("id"),
            framework_name=a.get("framework", {}).get("metadata", {}).get("name"),
            compliance_type=meta.get("complianceType"),
            scope=meta.get("scope"),
            roles=[d.get("roleArn", "") for d in meta.get("delegations", []) if d.get("roleArn")],
            created_at=_iso(meta.get("creationTime")),
            last_updated=_iso(meta.get("lastUpdated")),
            assessment_reports_destination=meta.get("assessmentReportsDestination"),
        )
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code == "ResourceNotFoundException":
            return None
        logger.warning(f"Audit Manager GetAssessment failed: {e}")
        raise
    except (BotoCoreError, Exception) as e:
        logger.warning(f"Audit Manager error: {e}")
        return None


def _fetch_control_sets(assessment_id: str) -> ControlSetsResponse:
    """Get control sets for an assessment."""
    try:
        am = _am_client()
        resp = am.get_assessment(assessmentId=assessment_id)
        control_sets = []
        for cs in resp.get("assessment", {}).get("controlSets", []):
            control_sets.append(ControlSetSummary(
                id=cs.get("id", ""),
                name=cs.get("description", cs.get("id", "Unknown")),
                status=cs.get("status", ""),
                roles=[r.get("roleArn", "") for r in cs.get("roles", []) if r.get("roleArn")],
                total_evidence_count=cs.get("evidenceFolderCount", 0),
                controls_metadata_count=len(cs.get("controls", [])),
            ))
        return ControlSetsResponse(
            control_sets=control_sets,
            assessment_id=assessment_id,
            count=len(control_sets),
            live=True,
            source="AWS Audit Manager",
        )
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code == "ResourceNotFoundException":
            return ControlSetsResponse(
                control_sets=[],
                assessment_id=assessment_id,
                count=0,
                live=False,
                source="not-found",
                note="Assessment not found",
            )
        logger.warning(f"Audit Manager GetAssessment (control sets) failed: {e}")
        return ControlSetsResponse(
            control_sets=[],
            assessment_id=assessment_id,
            count=0,
            live=False,
            source="error",
            note=str(e)[:100],
        )
    except (BotoCoreError, Exception) as e:
        logger.warning(f"Audit Manager error: {e}")
        return ControlSetsResponse(
            control_sets=[],
            assessment_id=assessment_id,
            count=0,
            live=False,
            source="error",
            note=str(e)[:100],
        )


def _fetch_evidence_folders(assessment_id: str) -> EvidenceFoldersResponse:
    """Get evidence folders for an assessment."""
    try:
        am = _am_client()
        folders = []
        paginator = am.get_paginator("get_evidence_folders_by_assessment")
        for page in paginator.paginate(assessmentId=assessment_id):
            for f in page.get("evidenceFolders", []):
                folders.append(EvidenceFolderSummary(
                    id=f.get("id", ""),
                    name=f.get("name", ""),
                    date=f.get("date"),
                    assessment_id=f.get("assessmentId", assessment_id),
                    control_set_id=f.get("controlSetId", ""),
                    control_id=f.get("controlId"),
                    control_name=f.get("controlName"),
                    total_evidence=f.get("totalEvidence", 0),
                    assessment_report_selection_count=f.get("assessmentReportSelectionCount", 0),
                    author=f.get("author"),
                ))
        return EvidenceFoldersResponse(
            evidence_folders=folders,
            assessment_id=assessment_id,
            count=len(folders),
            live=True,
            source="AWS Audit Manager",
        )
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code == "ResourceNotFoundException":
            return EvidenceFoldersResponse(
                evidence_folders=[],
                assessment_id=assessment_id,
                count=0,
                live=False,
                source="not-found",
                note="Assessment not found",
            )
        logger.warning(f"Audit Manager GetEvidenceFoldersByAssessment failed: {e}")
        return EvidenceFoldersResponse(
            evidence_folders=[],
            assessment_id=assessment_id,
            count=0,
            live=False,
            source="error",
            note=str(e)[:100],
        )
    except (BotoCoreError, Exception) as e:
        logger.warning(f"Audit Manager error: {e}")
        return EvidenceFoldersResponse(
            evidence_folders=[],
            assessment_id=assessment_id,
            count=0,
            live=False,
            source="error",
            note=str(e)[:100],
        )


def _fetch_evidence(assessment_id: str, control_set_id: str, folder_id: str, limit: int = 100) -> EvidenceResponse:
    """Get evidence items from a folder."""
    try:
        am = _am_client()
        resp = am.get_evidence_by_evidence_folder(
            assessmentId=assessment_id,
            controlSetId=control_set_id,
            evidenceFolderId=folder_id,
            maxResults=min(limit, 100),
        )
        evidence = []
        for e in resp.get("evidence", []):
            evidence.append(EvidenceItem(
                id=e.get("id", ""),
                data_source=e.get("dataSource", ""),
                evidence_aws_account_id=e.get("evidenceAwsAccountId"),
                time=_iso(e.get("time")),
                event_source=e.get("eventSource"),
                event_name=e.get("eventName"),
                evidence_by_type=e.get("evidenceByType"),
                compliance_check=e.get("complianceCheck"),
                iam_id=e.get("iamId"),
                attributes=e.get("attributes"),
            ))
        return EvidenceResponse(
            evidence=evidence,
            folder_id=folder_id,
            count=len(evidence),
            live=True,
            source="AWS Audit Manager",
        )
    except ClientError as e:
        logger.warning(f"Audit Manager GetEvidenceByEvidenceFolder failed: {e}")
        return EvidenceResponse(
            evidence=[],
            folder_id=folder_id,
            count=0,
            live=False,
            source="error",
            note=str(e)[:100],
        )
    except (BotoCoreError, Exception) as e:
        logger.warning(f"Audit Manager error: {e}")
        return EvidenceResponse(
            evidence=[],
            folder_id=folder_id,
            count=0,
            live=False,
            source="error",
            note=str(e)[:100],
        )


# ─── Routes ───


@router.get("/assessments", response_model=AssessmentsResponse)
async def list_assessments(_=Depends(require_role(Role.VIEWER))):
    """List all AWS Audit Manager assessments."""
    result, _ = get_or_load(
        f"audit-manager:assessments:{settings.AWS_REGION}",
        _TTL,
        _fetch_assessments,
        should_cache=lambda r: r.live,
    )
    return result


@router.get("/assessments/{assessment_id}", response_model=AssessmentDetail)
async def get_assessment(assessment_id: str, _=Depends(require_role(Role.VIEWER))):
    """Get details for a specific assessment."""
    result = _fetch_assessment_detail(assessment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/assessments/{assessment_id}/control-sets", response_model=ControlSetsResponse)
async def list_control_sets(assessment_id: str, _=Depends(require_role(Role.VIEWER))):
    """Get control sets for an assessment."""
    result, _ = get_or_load(
        f"audit-manager:control-sets:{settings.AWS_REGION}:{assessment_id}",
        _TTL,
        lambda: _fetch_control_sets(assessment_id),
        should_cache=lambda r: r.live,
    )
    return result


@router.get("/assessments/{assessment_id}/evidence-folders", response_model=EvidenceFoldersResponse)
async def list_evidence_folders(assessment_id: str, _=Depends(require_role(Role.VIEWER))):
    """Get evidence folders for an assessment."""
    result, _ = get_or_load(
        f"audit-manager:evidence-folders:{settings.AWS_REGION}:{assessment_id}",
        _TTL,
        lambda: _fetch_evidence_folders(assessment_id),
        should_cache=lambda r: r.live,
    )
    return result


@router.get(
    "/assessments/{assessment_id}/control-sets/{control_set_id}/evidence-folders/{folder_id}/evidence",
    response_model=EvidenceResponse,
)
async def list_evidence(
    assessment_id: str,
    control_set_id: str,
    folder_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get evidence items from a specific folder."""
    return _fetch_evidence(assessment_id, control_set_id, folder_id, limit)
