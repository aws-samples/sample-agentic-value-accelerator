"""Mainframe Migration Use Case Models (LangGraph Implementation)."""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class MigrationScope(str, Enum):
    FULL = "full"
    MAINFRAME_ANALYSIS = "mainframe_analysis"
    RULE_EXTRACTION = "rule_extraction"
    CODE_GENERATION = "code_generation"


class ComplexityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class MainframeMigrationRequest(BaseModel):
    project_id: str = Field(..., description="Unique project identifier")
    migration_scope: MigrationScope = Field(default=MigrationScope.FULL, description="Scope of migration analysis")
    additional_context: str | None = Field(default=None, description="Additional context for the migration")


class MainframeAnalysisResult(BaseModel):
    programs_analyzed: int = Field(default=0)
    jcl_jobs_analyzed: int = Field(default=0)
    copybooks_found: int = Field(default=0)
    total_lines: int = Field(default=0)
    complexity_level: ComplexityLevel = Field(default=ComplexityLevel.MEDIUM)
    dependencies: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class BusinessRuleResult(BaseModel):
    rules_extracted: int = Field(default=0)
    validation_rules: list[str] = Field(default_factory=list)
    computational_formulas: list[str] = Field(default_factory=list)
    extraction_confidence: float = Field(default=0.0)
    manual_review_items: list[str] = Field(default_factory=list)


class CloudCodeResult(BaseModel):
    files_generated: int = Field(default=0)
    target_language: str = Field(default="")
    generation_quality_score: float = Field(default=0.0)
    functional_equivalence_score: float = Field(default=0.0)
    services_mapped: list[str] = Field(default_factory=list)


class MainframeMigrationResponse(BaseModel):
    project_id: str = Field(..., description="Project identifier")
    migration_id: str = Field(..., description="Unique migration analysis identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    mainframe_analysis: MainframeAnalysisResult | None = Field(default=None)
    business_rules: BusinessRuleResult | None = Field(default=None)
    cloud_code: CloudCodeResult | None = Field(default=None)
    summary: str = Field(..., description="Executive summary")
    raw_analysis: dict = Field(default_factory=dict)
