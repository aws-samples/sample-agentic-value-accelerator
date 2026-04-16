"""Code Generation Models (LangGraph Implementation)."""
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class GenerationScope(str, Enum):
    FULL = "full"
    REQUIREMENTS_ONLY = "requirements_only"
    SCAFFOLDING_ONLY = "scaffolding_only"
    TESTING_ONLY = "testing_only"


class GenerationStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    REVIEW_NEEDED = "review_needed"


class CodeQuality(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    PRODUCTION_READY = "production_ready"


class GenerationRequest(BaseModel):
    project_id: str = Field(..., description="Unique project identifier")
    generation_scope: GenerationScope = Field(default=GenerationScope.FULL, description="Scope of code generation")
    additional_context: str | None = Field(default=None, description="Additional context")


class RequirementAnalysisResult(BaseModel):
    functional_requirements: list[str] = Field(default_factory=list)
    non_functional_requirements: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    technical_specifications: list[dict] = Field(default_factory=list)
    data_models: list[str] = Field(default_factory=list)
    api_contracts: list[dict] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class ScaffoldedCodeResult(BaseModel):
    files_generated: int = Field(default=0)
    project_structure: list[str] = Field(default_factory=list)
    design_patterns_applied: list[str] = Field(default_factory=list)
    code_quality: CodeQuality = Field(default=CodeQuality.MEDIUM)
    boilerplate_components: list[str] = Field(default_factory=list)
    configuration_files: list[str] = Field(default_factory=list)


class TestGenerationResult(BaseModel):
    unit_tests_generated: int = Field(default=0)
    integration_tests_generated: int = Field(default=0)
    test_coverage_estimate: float = Field(default=0.0)
    test_frameworks_used: list[str] = Field(default_factory=list)
    test_fixtures_created: list[str] = Field(default_factory=list)
    manual_testing_notes: list[str] = Field(default_factory=list)


class GenerationResponse(BaseModel):
    project_id: str = Field(..., description="Project identifier")
    generation_id: str = Field(..., description="Unique generation identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    requirement_analysis: RequirementAnalysisResult | None = Field(default=None)
    scaffolded_code: ScaffoldedCodeResult | None = Field(default=None)
    test_output: TestGenerationResult | None = Field(default=None)
    summary: str = Field(..., description="Executive summary")
    raw_analysis: dict = Field(default_factory=dict)
