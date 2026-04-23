"""
Compliance Investigation Use Case Models (Strands Implementation).

Pydantic models for compliance investigation requests and responses.
Duplicated to avoid circular imports when langchain dependencies aren't installed.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class InvestigationType(str, Enum):
    FULL = "full"
    EVIDENCE_COLLECTION = "evidence_collection"
    PATTERN_ANALYSIS = "pattern_analysis"
    REGULATORY_MAPPING = "regulatory_mapping"


class ViolationSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class InvestigationStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    FINDINGS_REPORTED = "findings_reported"
    CLOSED = "closed"


class InvestigationRequest(BaseModel):
    entity_id: str = Field(..., description="Unique entity identifier under investigation")
    investigation_type: InvestigationType = Field(default=InvestigationType.FULL, description="Type of investigation to perform")
    additional_context: str | None = Field(default=None, description="Additional context for the investigation")


class RegulatoryMapping(BaseModel):
    regulation: str = Field(..., description="Regulatory framework (e.g., AML, BSA, GDPR)")
    requirement: str = Field(..., description="Specific regulatory requirement")
    violation_type: str = Field(..., description="Classification of the violation")
    severity: str | None = Field(default=None, description="Violation severity")
    evidence_references: list[str] = Field(default_factory=list, description="References to supporting evidence")


class InvestigationFindings(BaseModel):
    status: str | None = Field(default=None, description="Investigation status")
    violations_found: int = Field(default=0, description="Number of violations identified")
    evidence_items: list[str] = Field(default_factory=list, description="Collected evidence items")
    patterns_identified: list[str] = Field(default_factory=list, description="Identified violation patterns")
    risk_indicators: list[str] = Field(default_factory=list, description="Risk indicators detected")
    recommendations: list[str] = Field(default_factory=list, description="Recommended actions")


class InvestigationResponse(BaseModel):
    entity_id: str = Field(..., description="Entity identifier")
    investigation_id: str = Field(..., description="Unique investigation identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Investigation timestamp")
    findings: InvestigationFindings | None = Field(default=None, description="Investigation findings")
    regulatory_mappings: list[RegulatoryMapping] = Field(default_factory=list, description="Regulatory requirement mappings")
    summary: str = Field(..., description="Executive summary of the investigation")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")


__all__ = ["InvestigationType", "ViolationSeverity", "InvestigationStatus", "InvestigationRequest", "RegulatoryMapping", "InvestigationFindings", "InvestigationResponse"]
