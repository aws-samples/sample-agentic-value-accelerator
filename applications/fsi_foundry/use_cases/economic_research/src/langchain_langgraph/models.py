"""Economic Research Models."""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class ResearchType(str, Enum):
    FULL = "full"
    DATA_AGGREGATION = "data_aggregation"
    TREND_ANALYSIS = "trend_analysis"
    REPORT_GENERATION = "report_generation"
    INDICATOR_FOCUS = "indicator_focus"


class EconomicIndicator(str, Enum):
    GDP = "gdp"
    INFLATION = "inflation"
    EMPLOYMENT = "employment"
    INTEREST_RATES = "interest_rates"
    TRADE_BALANCE = "trade_balance"


class TrendDirection(str, Enum):
    ACCELERATING = "accelerating"
    STABLE = "stable"
    DECELERATING = "decelerating"
    REVERSING = "reversing"
    UNCERTAIN = "uncertain"


class ResearchRequest(BaseModel):
    entity_id: str = Field(..., description="Unique economic research identifier")
    research_type: ResearchType = Field(default=ResearchType.FULL, description="Type of research request")
    additional_context: str | None = Field(default=None, description="Additional context")


class EconomicOverview(BaseModel):
    primary_indicator: EconomicIndicator = Field(..., description="Primary indicator analyzed")
    trend_direction: TrendDirection = Field(..., description="Overall trend direction")
    data_sources_used: list[str] = Field(default_factory=list, description="Data sources aggregated")
    key_findings: dict[str, str] = Field(default_factory=dict, description="Key findings")
    correlations_identified: list[str] = Field(default_factory=list, description="Correlations identified")
    forecast_horizon: str = Field(default="", description="Forecast time horizon")


class ResearchResponse(BaseModel):
    entity_id: str = Field(..., description="Research identifier")
    research_id: str = Field(..., description="Unique research interaction ID")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Timestamp")
    economic_overview: EconomicOverview | None = Field(default=None, description="Economic overview")
    recommendations: list[str] = Field(default_factory=list, description="Recommendations")
    summary: str = Field(..., description="Executive summary")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")
