"""Regulatory Report Reviewer Models (Strands Implementation).

Pydantic models for regulatory report review requests and responses.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class ReportType(str, Enum):
    SAR = "sar"
    CTR = "ctr"
    SEC_10K = "sec_10k"
    SEC_10Q = "sec_10q"
    CALL_REPORT = "call_report"
    OTHER = "other"


class ReviewType(str, Enum):
    FULL = "full"
    COMPLETENESS = "completeness"
    LANGUAGE_COMPLIANCE = "language_compliance"
    QUALITY = "quality"


class QualityLevel(str, Enum):
    PASS = "pass"
    NEEDS_REVISION = "needs_revision"
    FAIL = "fail"


class ReviewRequest(BaseModel):
    bucket: str = Field(..., description="S3 bucket containing the report")
    key: str = Field(..., description="S3 object key for the report file")
    report_type: ReportType = Field(default=ReportType.OTHER, description="Type of regulatory report")
    review_type: ReviewType = Field(default=ReviewType.FULL, description="Type of review to perform")


class CompletenessResult(BaseModel):
    missing_sections: list[str] = Field(default_factory=list, description="Required sections not found")
    missing_fields: list[str] = Field(default_factory=list, description="Required fields not populated")
    score: int = Field(..., ge=0, le=100, description="Completeness score 0-100")


class LanguageComplianceResult(BaseModel):
    issues: list[str] = Field(default_factory=list, description="Language compliance issues found")
    suggestions: list[str] = Field(default_factory=list, description="Suggested rewrites for compliance")
    score: int = Field(..., ge=0, le=100, description="Language compliance score 0-100")


class QualityResult(BaseModel):
    level: QualityLevel = Field(..., description="Overall quality determination")
    score: int = Field(..., ge=0, le=100, description="Quality score 0-100")
    strengths: list[str] = Field(default_factory=list, description="Report strengths")
    revisions: list[str] = Field(default_factory=list, description="Specific revision suggestions")


class ReviewResponse(BaseModel):
    review_id: str = Field(..., description="Unique review session identifier")
    bucket: str = Field(..., description="Source S3 bucket")
    key: str = Field(..., description="Source S3 key")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Review timestamp")
    report_type: ReportType = Field(..., description="Detected or specified report type")
    completeness: CompletenessResult | None = Field(default=None, description="Completeness check results")
    language_compliance: LanguageComplianceResult | None = Field(default=None, description="Language compliance results")
    quality: QualityResult | None = Field(default=None, description="Overall quality assessment")
    summary: str = Field(..., description="Executive summary of the review")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")


__all__ = [
    "ReportType", "ReviewType", "QualityLevel",
    "ReviewRequest", "CompletenessResult", "LanguageComplianceResult",
    "QualityResult", "ReviewResponse",
]
