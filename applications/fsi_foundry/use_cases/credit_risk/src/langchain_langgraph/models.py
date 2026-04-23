"""
Credit Risk Use Case Models.

Pydantic models for credit risk assessment requests and responses.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AssessmentType(str, Enum):
    FULL = "full"
    FINANCIAL_ANALYSIS = "financial_analysis"
    RISK_SCORING = "risk_scoring"
    PORTFOLIO_ANALYSIS = "portfolio_analysis"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class CreditRating(str, Enum):
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


class AssessmentRequest(BaseModel):
    customer_id: str = Field(..., description="Unique borrower/customer identifier")
    assessment_type: AssessmentType = Field(default=AssessmentType.FULL, description="Type of assessment to perform")
    additional_context: str | None = Field(default=None, description="Additional context for the assessment")


class CreditRiskScore(BaseModel):
    score: int = Field(..., ge=0, le=100, description="Risk score from 0-100")
    level: str | None = Field(default=None, description="Risk level classification")
    rating: str = Field(default="AAA", description="Credit rating")
    probability_of_default: float = Field(..., ge=0.0, le=1.0, description="Probability of default")
    loss_given_default: float = Field(..., ge=0.0, le=1.0, description="Loss given default")
    factors: list[str] = Field(default_factory=list, description="Contributing risk factors")
    recommendations: list[str] = Field(default_factory=list, description="Risk mitigation recommendations")


class PortfolioImpact(BaseModel):
    concentration_change: float = Field(..., description="Change in portfolio concentration")
    diversification_score: float = Field(..., ge=0.0, le=1.0, description="Portfolio diversification score")
    sector_exposure: str = Field(..., description="Sector exposure classification")
    risk_adjusted_return: float = Field(..., description="Expected risk-adjusted return")
    notes: list[str] = Field(default_factory=list, description="Portfolio impact notes")


class AssessmentResponse(BaseModel):
    customer_id: str = Field(..., description="Borrower/customer identifier")
    assessment_id: str = Field(..., description="Unique assessment identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Assessment timestamp")
    credit_risk_score: CreditRiskScore | None = Field(default=None, description="Credit risk score details")
    portfolio_impact: PortfolioImpact | None = Field(default=None, description="Portfolio impact assessment")
    summary: str = Field(..., description="Executive summary of the credit risk assessment")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")
