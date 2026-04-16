"""Document Processing Models (Strands Implementation)."""
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class ProcessingType(str, Enum):
    FULL = "full"
    CLASSIFICATION_ONLY = "classification_only"
    EXTRACTION_ONLY = "extraction_only"
    VALIDATION_ONLY = "validation_only"


class DocumentType(str, Enum):
    LOAN_APPLICATION = "loan_application"
    KYC_DOCUMENT = "kyc_document"
    FINANCIAL_STATEMENT = "financial_statement"
    REGULATORY_FILING = "regulatory_filing"
    CONTRACT = "contract"
    UNKNOWN = "unknown"


class ValidationStatus(str, Enum):
    VALID = "valid"
    INVALID = "invalid"
    REVIEW_REQUIRED = "review_required"


class ProcessingRequest(BaseModel):
    document_id: str = Field(..., description="Unique document identifier")
    processing_type: ProcessingType = Field(default=ProcessingType.FULL, description="Type of processing")
    additional_context: str | None = Field(default=None, description="Additional context")


class DocumentClassification(BaseModel):
    document_type: DocumentType = Field(..., description="Classified document type")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="Classification confidence")
    jurisdiction: str = Field(default="", description="Applicable jurisdiction")
    regulatory_relevance: list[str] = Field(default_factory=list, description="Relevant regulations")


class ExtractedData(BaseModel):
    fields: dict = Field(default_factory=dict, description="Extracted key-value fields")
    entities: list[str] = Field(default_factory=list, description="Named entities found")
    amounts: list[str] = Field(default_factory=list, description="Financial amounts found")
    dates: list[str] = Field(default_factory=list, description="Dates found")


class ValidationResult(BaseModel):
    status: ValidationStatus = Field(..., description="Validation status")
    checks_passed: list[str] = Field(default_factory=list, description="Passed checks")
    checks_failed: list[str] = Field(default_factory=list, description="Failed checks")
    notes: list[str] = Field(default_factory=list, description="Validation notes")


class ProcessingResponse(BaseModel):
    document_id: str = Field(..., description="Document identifier")
    processing_id: str = Field(..., description="Unique processing identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Processing timestamp")
    classification: DocumentClassification | None = Field(default=None)
    extracted_data: ExtractedData | None = Field(default=None)
    validation_result: ValidationResult | None = Field(default=None)
    summary: str = Field(..., description="Processing summary")
    raw_analysis: dict = Field(default_factory=dict, description="Raw agent analysis")
