"""
Pydantic schemas for Project endpoints
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, Dict
from datetime import datetime
import re


class ProjectCreate(BaseModel):
    """Schema for creating a new project"""

    project_name: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Project name (alphanumeric and hyphens only)"
    )
    framework: str = Field(
        ...,
        description="Agent framework (langraph or strands)"
    )
    iac_type: str = Field(
        default="terraform",
        description="Infrastructure as Code type (terraform, cdk, or cloudformation)"
    )
    langfuse_server_id: Optional[str] = Field(
        None,
        description="Langfuse server UUID"
    )
    aws_region: str = Field(
        default="us-east-1",
        description="AWS region for deployment"
    )
    tags: Optional[Dict[str, str]] = Field(
        default=None,
        description="Project tags (key-value pairs)"
    )

    @validator("project_name")
    def validate_project_name(cls, v):
        """Validate project name format"""
        if not re.match(r"^[a-z0-9-]+$", v):
            raise ValueError(
                "Project name must contain only lowercase letters, numbers, and hyphens"
            )
        if v.startswith("-") or v.endswith("-"):
            raise ValueError(
                "Project name cannot start or end with a hyphen"
            )
        return v

    @validator("framework")
    def validate_framework(cls, v):
        """Validate framework value"""
        if v not in ["langraph", "strands"]:
            raise ValueError("Framework must be either 'langraph' or 'strands'")
        return v

    @validator("iac_type")
    def validate_iac_type(cls, v):
        """Validate IaC type value"""
        if v not in ["terraform", "cdk", "cloudformation"]:
            raise ValueError("IaC type must be 'terraform', 'cdk', or 'cloudformation'")
        return v

    @validator("aws_region")
    def validate_aws_region(cls, v):
        """Validate AWS region format"""
        if not re.match(r"^[a-z]{2}-[a-z]+-\d{1}$", v):
            raise ValueError("Invalid AWS region format")
        return v

    class Config:
        schema_extra = {
            "example": {
                "project_name": "my-kyc-agent",
                "framework": "langraph",
                "iac_type": "terraform",
                "langfuse_server_id": "550e8400-e29b-41d4-a716-446655440000",
                "aws_region": "us-east-1",
                "tags": {
                    "environment": "dev",
                    "team": "ai-platform"
                }
            }
        }


class ProjectResponse(BaseModel):
    """Schema for project response"""

    id: str = Field(..., description="Project UUID")
    project_name: str = Field(..., description="Project name")
    framework: str = Field(..., description="Agent framework")
    template_name: str = Field(..., description="Template name used")
    iac_type: str = Field(..., description="Infrastructure as Code type")
    aws_region: str = Field(..., description="AWS region")
    tags: Optional[Dict[str, str]] = Field(None, description="Project tags")
    langfuse_server_id: Optional[str] = Field(None, description="Langfuse server UUID")
    s3_url: str = Field(..., description="S3 presigned URL for download")
    expires_at: str = Field(..., description="Expiration time for S3 URL (ISO 8601)")
    created_by: str = Field(..., description="User ID who created the project")
    created_at: str = Field(..., description="Creation timestamp (ISO 8601)")

    class Config:
        schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "project_name": "my-kyc-agent",
                "framework": "langraph",
                "template_name": "langraph-agentcore",
                "iac_type": "terraform",
                "aws_region": "us-east-1",
                "tags": {
                    "environment": "dev",
                    "team": "ai-platform"
                },
                "langfuse_server_id": "550e8400-e29b-41d4-a716-446655440000",
                "s3_url": "https://bucket.s3.amazonaws.com/...",
                "expires_at": "2024-03-19T10:00:00Z",
                "created_by": "user-123",
                "created_at": "2024-03-12T10:00:00Z"
            }
        }
