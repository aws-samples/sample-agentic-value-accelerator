"""
Template metadata models
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from enum import Enum


class PatternType(str, Enum):
    """Architectural pattern types"""
    SINGLE_AGENT = "single_agent"
    ORCHESTRATION = "orchestration"
    RAG = "rag"
    TOOL_CALLING = "tool_calling"
    CONVERSATIONAL = "conversational"
    BATCH_PROCESSING = "batch_processing"


class TemplateType(str, Enum):
    """Template type for layering"""
    FOUNDATION = "foundation"
    USECASE = "usecase"
    REFERENCE = "reference"


class Job(BaseModel):
    """Lifecycle job definition"""
    name: str = Field(..., description="Job name (onboarding or offboarding)")
    incoming_event: str = Field(..., description="Event type that triggers this job")
    outgoing_event: str = Field(..., description="Event type emitted on completion")


class Framework(BaseModel):
    """Framework configuration"""
    id: str = Field(..., description="Framework identifier")
    name: str = Field(..., description="Human-readable name")
    path: str = Field(..., description="Relative path in template")
    description: Optional[str] = Field(None, description="Framework description")

    @validator("id")
    def validate_id(cls, v):
        """Validate framework ID format"""
        if not v.replace("_", "").isalnum() or not v[0].isalpha():
            raise ValueError("Framework ID must be alphanumeric with underscores, starting with letter")
        return v


class DeploymentPattern(BaseModel):
    """Deployment pattern configuration"""
    id: str = Field(..., description="Pattern identifier")
    name: str = Field(..., description="Human-readable name")
    description: str = Field(..., description="Pattern description")
    path: str = Field(..., description="Relative path in template")
    disabled: Optional[bool] = Field(None, description="Whether this pattern is disabled (coming soon)")

    @validator("id")
    def validate_id(cls, v):
        """Validate pattern ID format"""
        if not v.replace("_", "").isalnum() or not v[0].isalpha():
            raise ValueError("Pattern ID must be alphanumeric with underscores, starting with letter")
        return v


class ParameterType(str, Enum):
    """Parameter data types"""
    STRING = "string"
    INTEGER = "integer"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"


class Parameter(BaseModel):
    """Template parameter configuration"""
    name: str = Field(..., description="Parameter name")
    type: ParameterType = Field(..., description="Parameter type")
    description: str = Field(..., description="Parameter description")
    required: bool = Field(False, description="Whether parameter is required")
    default: Optional[Any] = Field(None, description="Default value")
    pattern: Optional[str] = Field(None, description="Regex validation pattern")
    minimum: Optional[int] = Field(None, description="Minimum value (integers)")
    maximum: Optional[int] = Field(None, description="Maximum value (integers)")
    enum: Optional[List[Any]] = Field(None, description="Allowed values")
    input_type: Optional[str] = Field(None, description="HTML input type hint (text, email, password)")
    help_url: Optional[str] = Field(None, description="URL to help documentation for this parameter")

    @validator("name")
    def validate_name(cls, v):
        """Validate parameter name format"""
        if not v.replace("_", "").isalnum() or not v[0].isalpha():
            raise ValueError("Parameter name must be alphanumeric with underscores, starting with letter")
        return v.lower()


class TemplateMetadata(BaseModel):
    """Template metadata from template.json"""
    id: str = Field(..., description="Unique template identifier")
    name: str = Field(..., description="Human-readable template name")
    description: str = Field(..., description="Detailed template description")
    version: str = Field(..., description="Semantic version")
    pattern_type: PatternType = Field(..., description="Architectural pattern type")
    frameworks: List[Framework] = Field(..., description="Supported frameworks")
    deployment_patterns: List[DeploymentPattern] = Field(..., description="Supported deployment patterns")
    parameters: Optional[List[Parameter]] = Field(default_factory=list, description="Template parameters")
    architecture_diagram: Optional[str] = Field(None, description="Architecture diagram URL/path")
    example_use_cases: List[str] = Field(default_factory=list, description="Example use cases")
    author: Optional[str] = Field(None, description="Template author")
    license: Optional[str] = Field(None, description="Template license")
    tags: List[str] = Field(default_factory=list, description="Template tags")
    type: TemplateType = Field(default=TemplateType.USECASE, description="Template type (foundation or usecase)")
    outputs: Dict[str, str] = Field(default_factory=dict, description="Output keys produced after deployment")
    jobs: List[Job] = Field(default_factory=list, description="Lifecycle jobs (onboarding, offboarding)")
    dependencies: List[str] = Field(default_factory=list, description="Foundation template IDs required before this template")

    @validator("id")
    def validate_id(cls, v):
        """Validate template ID format"""
        if not v.replace("-", "").isalnum() or not v[0].isalpha():
            raise ValueError("Template ID must be alphanumeric with hyphens, starting with letter")
        return v.lower()

    @validator("version")
    def validate_version(cls, v):
        """Validate semantic version format"""
        import re
        pattern = r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$"
        if not re.match(pattern, v):
            raise ValueError("Version must be valid semantic version (e.g., 1.0.0)")
        return v

    class Config:
        use_enum_values = True


class Template(BaseModel):
    """Template with metadata and file path"""
    metadata: TemplateMetadata = Field(..., description="Template metadata")
    path: str = Field(..., description="Full path to template directory")

    def supports_framework(self, framework_id: str) -> bool:
        """Check if template supports a framework"""
        return any(f.id == framework_id for f in self.metadata.frameworks)

    def supports_deployment_pattern(self, pattern_id: str) -> bool:
        """Check if template supports a deployment pattern"""
        return any(p.id == pattern_id for p in self.metadata.deployment_patterns)

    def get_framework(self, framework_id: str) -> Optional[Framework]:
        """Get framework configuration by ID"""
        for f in self.metadata.frameworks:
            if f.id == framework_id:
                return f
        return None

    def get_deployment_pattern(self, pattern_id: str) -> Optional[DeploymentPattern]:
        """Get deployment pattern configuration by ID"""
        for p in self.metadata.deployment_patterns:
            if p.id == pattern_id:
                return p
        return None


class ValidationResult(BaseModel):
    """Template validation result"""
    valid: bool = Field(..., description="Whether template is valid")
    errors: List[str] = Field(default_factory=list, description="Validation errors")
    warnings: List[str] = Field(default_factory=list, description="Validation warnings")

    def add_error(self, error: str):
        """Add validation error"""
        self.errors.append(error)
        self.valid = False

    def add_warning(self, warning: str):
        """Add validation warning"""
        self.warnings.append(warning)
