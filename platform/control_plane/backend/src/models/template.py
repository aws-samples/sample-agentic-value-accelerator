"""
Template metadata models
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any


class TemplateMetadata(BaseModel):
    """Template metadata from template.json"""
    id: str = Field(..., description="Unique template identifier")
    name: str = Field(..., description="Human-readable template name")
    description: str = Field(..., description="Detailed template description")
    version: str = Field("1.0.0", description="Semantic version")
    tier: str = Field("module", description="Template tier (module or starter)")
    category: str = Field("", description="Template category (compute, api, auth, etc.)")
    iac_options: List[str] = Field(default_factory=list, description="Supported IaC options (terraform, cdk, cloudformation)")
    includes: Dict[str, bool] = Field(default_factory=dict, description="What the template includes (infra, agent_code, ui, tests)")
    tags: List[str] = Field(default_factory=list, description="Searchable tags")
    aws_services: List[str] = Field(default_factory=list, description="AWS services used")
    frameworks_list: List[str] = Field(default_factory=list, description="Supported frameworks (strands, langgraph)")
    built_with: List[str] = Field(default_factory=list, description="Module IDs this template is built with")
    resources: List[Dict[str, str]] = Field(default_factory=list, description="AWS resources created by this template")
    parameters: List[Dict[str, Any]] = Field(default_factory=list, description="Configurable parameters")
    pattern_description: Optional[str] = Field(None, description="Description of the architectural pattern")
    learn_more: List[Dict[str, str]] = Field(default_factory=list, description="Reference links to documentation")
    # Fields used by the deployment pipeline
    type: Optional[str] = Field(None, description="Template type (foundation, usecase)")
    hidden: bool = Field(False, description="Hide from templates catalog listing")
    dependencies: Optional[List[str]] = Field(None, description="Template IDs required before this one")
    jobs: List[Dict[str, str]] = Field(default_factory=list, description="Lifecycle jobs for deployment pipeline")
    outputs: Optional[Dict[str, str]] = Field(None, description="Output keys produced after deployment")
    frameworks: Optional[List[Dict[str, Any]]] = Field(None, description="Framework configurations")
    deployment_patterns: Optional[List[Dict[str, Any]]] = Field(None, description="Deployment pattern configurations")

    @validator("id")
    def validate_id(cls, v):
        """Validate template ID format"""
        if not v.replace("-", "").isalnum() or not v[0].isalpha():
            raise ValueError("Template ID must be alphanumeric with hyphens, starting with letter")
        return v.lower()

    class Config:
        extra = "ignore"


class Template(BaseModel):
    """Template with metadata and file path"""
    metadata: TemplateMetadata = Field(..., description="Template metadata")
    path: str = Field(..., description="Full path to template directory")

    def get_deployment_pattern(self, pattern_id: str) -> Optional[Dict[str, Any]]:
        """Get deployment pattern config by ID."""
        for p in self.metadata.deployment_patterns or []:
            if p.get("id") == pattern_id:
                return p
        return None


class ValidationResult(BaseModel):
    """Template validation result"""
    valid: bool = Field(..., description="Whether template is valid")
    errors: List[str] = Field(default_factory=list, description="Validation errors")
    warnings: List[str] = Field(default_factory=list, description="Validation warnings")

    def add_error(self, error: str):
        self.errors.append(error)
        self.valid = False

    def add_warning(self, warning: str):
        self.warnings.append(warning)
