"""Investment Advisory Models."""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class AdvisoryType(str, Enum):
    FULL = "full"
    PORTFOLIO_REVIEW = "portfolio_review"
    MARKET_ANALYSIS = "market_analysis"
    CLIENT_PROFILING = "client_profiling"
    REBALANCING = "rebalancing"


class RiskLevel(str, Enum):
    CONSERVATIVE = "conservative"
    MODERATE = "moderate"
    AGGRESSIVE = "aggressive"
    VERY_AGGRESSIVE = "very_aggressive"


class AssetClass(str, Enum):
    EQUITIES = "equities"
    FIXED_INCOME = "fixed_income"
    ALTERNATIVES = "alternatives"
    CASH = "cash"
    REAL_ESTATE = "real_estate"
    COMMODITIES = "commodities"


class AdvisoryRequest(BaseModel):
    client_id: str = Field(..., description="Unique client identifier")
    advisory_type: AdvisoryType = Field(default=AdvisoryType.FULL, description="Type of advisory request")
    additional_context: str | None = Field(default=None, description="Additional context")


class PortfolioAnalysis(BaseModel):
    risk_level: str | None = Field(default=None, description="Assessed portfolio risk level")
    asset_allocation: dict[str, float] = Field(default_factory=dict, description="Current asset allocation percentages")
    performance_summary: str = Field(default="", description="Portfolio performance summary")
    rebalancing_needed: bool = Field(default=False, description="Whether rebalancing is recommended")
    concentration_risks: list[str] = Field(default_factory=list, description="Identified concentration risks")


class AdvisoryResponse(BaseModel):
    client_id: str = Field(..., description="Client identifier")
    advisory_id: str = Field(..., description="Unique advisory identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Advisory timestamp")
    portfolio_analysis: PortfolioAnalysis | None = Field(default=None, description="Portfolio analysis")
    recommendations: list[str] = Field(default_factory=list, description="Investment recommendations")
    summary: str = Field(..., description="Executive summary")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")
