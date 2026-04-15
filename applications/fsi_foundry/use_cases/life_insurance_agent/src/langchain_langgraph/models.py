"""
Life Insurance Agent Models (LangGraph Implementation).

Pydantic models for life insurance advisory requests and responses.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AnalysisType(str, Enum):
    """Type of life insurance analysis to perform."""
    FULL = "full"
    NEEDS_ANALYSIS_ONLY = "needs_analysis_only"
    PRODUCT_MATCHING_ONLY = "product_matching_only"
    UNDERWRITING_ONLY = "underwriting_only"


class LifeStage(str, Enum):
    """Life stage of the applicant."""
    YOUNG_ADULT = "young_adult"
    EARLY_CAREER = "early_career"
    FAMILY_BUILDING = "family_building"
    MID_CAREER = "mid_career"
    PRE_RETIREMENT = "pre_retirement"
    RETIREMENT = "retirement"


class RiskCategory(str, Enum):
    """Underwriting risk category."""
    PREFERRED_PLUS = "preferred_plus"
    PREFERRED = "preferred"
    STANDARD_PLUS = "standard_plus"
    STANDARD = "standard"
    SUBSTANDARD = "substandard"


class ProductType(str, Enum):
    """Type of life insurance product."""
    TERM = "term"
    WHOLE_LIFE = "whole_life"
    UNIVERSAL = "universal"
    VARIABLE = "variable"
    INDEXED_UNIVERSAL = "indexed_universal"


class InsuranceRequest(BaseModel):
    """Request model for life insurance agent assessment."""
    applicant_id: str = Field(..., description="Unique applicant identifier")
    analysis_type: AnalysisType = Field(
        default=AnalysisType.FULL,
        description="Type of analysis to perform"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the analysis"
    )


class NeedsAnalysis(BaseModel):
    """Results of the life insurance needs analysis."""
    life_stage: LifeStage = Field(..., description="Applicant life stage")
    recommended_coverage: float = Field(default=0.0, description="Recommended coverage amount")
    coverage_gap: float = Field(default=0.0, description="Gap between existing and recommended coverage")
    income_replacement_years: int = Field(default=10, description="Years of income replacement needed")
    key_needs: list[str] = Field(default_factory=list, description="Identified insurance needs")
    notes: list[str] = Field(default_factory=list, description="Analysis notes")


class ProductRecommendations(BaseModel):
    """Product matching recommendations."""
    primary_product: ProductType = Field(..., description="Primary recommended product type")
    recommended_products: list[dict] = Field(default_factory=list, description="Ranked product recommendations")
    coverage_amount: float = Field(default=0.0, description="Recommended coverage amount")
    estimated_premium: float = Field(default=0.0, description="Estimated monthly premium")
    comparison_notes: list[str] = Field(default_factory=list, description="Product comparison notes")
    notes: list[str] = Field(default_factory=list, description="Recommendation notes")


class UnderwritingAssessment(BaseModel):
    """Underwriting risk assessment results."""
    risk_category: RiskCategory = Field(default=RiskCategory.STANDARD, description="Risk classification")
    confidence_score: float = Field(default=0.0, description="Assessment confidence score")
    health_factors: list[str] = Field(default_factory=list, description="Identified health risk factors")
    lifestyle_factors: list[str] = Field(default_factory=list, description="Identified lifestyle risk factors")
    recommended_actions: list[str] = Field(default_factory=list, description="Recommended next steps")
    notes: list[str] = Field(default_factory=list, description="Assessment notes")


class InsuranceResponse(BaseModel):
    """Response model for life insurance agent assessment."""
    applicant_id: str = Field(..., description="Applicant identifier")
    assessment_id: str = Field(..., description="Unique assessment identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    needs_analysis: NeedsAnalysis | None = Field(default=None)
    product_recommendations: ProductRecommendations | None = Field(default=None)
    underwriting_assessment: UnderwritingAssessment | None = Field(default=None)
    summary: str = Field(..., description="Executive summary of the life insurance assessment")
    raw_analysis: dict = Field(default_factory=dict)


__all__ = [
    "AnalysisType",
    "LifeStage",
    "RiskCategory",
    "ProductType",
    "InsuranceRequest",
    "NeedsAnalysis",
    "ProductRecommendations",
    "UnderwritingAssessment",
    "InsuranceResponse",
]
