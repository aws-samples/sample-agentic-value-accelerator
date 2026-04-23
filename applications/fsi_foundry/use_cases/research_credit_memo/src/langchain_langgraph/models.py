"""
Research Credit Memo Use Case Models (LangGraph Implementation).

Pydantic models for credit memo generation requests and responses.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AnalysisType(str, Enum):
    """Type of credit memo analysis request."""
    FULL = "full"
    DATA_GATHERING = "data_gathering"
    CREDIT_ANALYSIS = "credit_analysis"
    MEMO_GENERATION = "memo_generation"


class CreditRating(str, Enum):
    """Credit rating classification."""
    AAA = "AAA"
    AA = "AA"
    A = "A"
    BBB = "BBB"
    BB = "BB"
    B = "B"
    CCC = "CCC"
    CC = "CC"
    C = "C"
    D = "D"


class MemoFormat(str, Enum):
    """Format level for the generated memo."""
    BRIEF = "brief"
    STANDARD = "standard"
    DETAILED = "detailed"


class MemoRequest(BaseModel):
    """Request model for credit memo generation."""
    entity_id: str = Field(..., description="Unique entity/company identifier")
    analysis_type: AnalysisType = Field(
        default=AnalysisType.FULL,
        description="Type of credit memo analysis"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the analysis"
    )


class CreditAnalysisDetail(BaseModel):
    """Details of the credit analysis."""
    rating: str = Field(default="AAA", description="Recommended credit rating")
    memo_format: str | None = Field(default=None, description="Memo format level")
    confidence_score: float = Field(default=0.5, description="Analysis confidence score 0-1")
    key_ratios: list[str] = Field(default_factory=list, description="Key financial ratios computed")
    risk_factors: list[str] = Field(default_factory=list, description="Identified risk factors")
    peer_comparison_notes: list[str] = Field(default_factory=list, description="Peer comparison observations")


class MemoResponse(BaseModel):
    """Response model for credit memo generation."""
    entity_id: str = Field(..., description="Entity/company identifier")
    memo_id: str = Field(..., description="Unique memo interaction identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Generation timestamp")
    credit_analysis: CreditAnalysisDetail | None = Field(default=None, description="Credit analysis details")
    recommendations: list[str] = Field(default_factory=list, description="Credit recommendations")
    summary: str = Field(..., description="Executive summary of the credit memo")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")


__all__ = [
    "AnalysisType",
    "CreditRating",
    "MemoFormat",
    "MemoRequest",
    "CreditAnalysisDetail",
    "MemoResponse",
]
