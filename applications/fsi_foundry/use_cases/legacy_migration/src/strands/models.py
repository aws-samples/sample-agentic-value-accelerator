"""Legacy Migration Models."""
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime

class MigrationScope(str, Enum):
    FULL = "full"
    CODE_ANALYSIS = "code_analysis"
    PLANNING = "planning"
    CONVERSION = "conversion"

class MigrationStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"

class ComplexityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class MigrationRequest(BaseModel):
    project_id: str = Field(..., description="Unique project identifier")
    migration_scope: MigrationScope = Field(default=MigrationScope.FULL, description="Scope of migration analysis")
    additional_context: str | None = Field(default=None, description="Additional context")

class CodeAnalysisResult(BaseModel):
    languages_detected: list[str] = Field(default_factory=list)
    total_files: int = Field(default=0)
    total_lines: int = Field(default=0)
    complexity_level: ComplexityLevel = Field(default=ComplexityLevel.MEDIUM)
    dependencies: list[str] = Field(default_factory=list)
    patterns_identified: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)

class MigrationPlanResult(BaseModel):
    phases: list[dict] = Field(default_factory=list)
    estimated_effort_days: int = Field(default=0)
    risk_assessment: list[str] = Field(default_factory=list)
    dependency_order: list[str] = Field(default_factory=list)
    rollback_strategy: str = Field(default="")

class ConversionResult(BaseModel):
    files_converted: int = Field(default=0)
    conversion_confidence: float = Field(default=0.0)
    patterns_converted: list[str] = Field(default_factory=list)
    manual_review_needed: list[str] = Field(default_factory=list)
    target_framework: str = Field(default="")

class MigrationResponse(BaseModel):
    project_id: str = Field(..., description="Project identifier")
    migration_id: str = Field(..., description="Unique migration analysis identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    code_analysis: CodeAnalysisResult | None = Field(default=None)
    migration_plan: MigrationPlanResult | None = Field(default=None)
    conversion_output: ConversionResult | None = Field(default=None)
    summary: str = Field(..., description="Executive summary")
    raw_analysis: dict = Field(default_factory=dict)
