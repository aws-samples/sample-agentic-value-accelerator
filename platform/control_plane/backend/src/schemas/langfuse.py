"""
Pydantic schemas for Langfuse server endpoints
"""

from pydantic import BaseModel, Field, HttpUrl, validator
from typing import Optional
from enum import Enum


class ServerStatus(str, Enum):
    """Server status enum"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"


class LangfuseServerCreate(BaseModel):
    """Schema for creating a new Langfuse server"""

    name: str = Field(
        ...,
        min_length=3,
        max_length=100,
        description="Server name (unique)"
    )
    endpoint: HttpUrl = Field(
        ...,
        description="Langfuse server endpoint (HTTPS required)"
    )
    region: str = Field(
        ...,
        description="AWS region"
    )
    public_key: str = Field(
        ...,
        min_length=10,
        description="Langfuse public key"
    )
    secret_name: Optional[str] = Field(
        None,
        description="AWS Secrets Manager secret name containing the Langfuse secret key"
    )
    secret_key_field: Optional[str] = Field(
        "langfuse_secret_key",
        description="JSON key within the Secrets Manager secret that holds the Langfuse secret key"
    )
    status: ServerStatus = Field(
        default=ServerStatus.ACTIVE,
        description="Server status"
    )

    @validator("endpoint")
    def validate_https(cls, v):
        """Ensure endpoint uses HTTPS"""
        if not str(v).startswith("https://"):
            raise ValueError("Endpoint must use HTTPS")
        return v

    class Config:
        schema_extra = {
            "example": {
                "name": "production-langfuse",
                "endpoint": "https://langfuse.example.com",
                "region": "us-east-1",
                "public_key": "pk_lf_1234567890abcdef",
                "secret_name": "langfuse-secrets",
                "secret_key_field": "langfuse_secret_key",
                "status": "active"
            }
        }


class LangfuseServerResponse(BaseModel):
    """Schema for Langfuse server response"""

    id: str = Field(..., description="Server UUID")
    name: str = Field(..., description="Server name")
    endpoint: str = Field(..., description="Langfuse endpoint")
    region: str = Field(..., description="AWS region")
    public_key: str = Field(..., description="Langfuse public key")
    secret_name: Optional[str] = Field(None, description="AWS Secrets Manager secret name")
    secret_key_field: Optional[str] = Field(None, description="JSON key within the secret")
    status: str = Field(..., description="Server status")
    created_at: str = Field(..., description="Creation timestamp (ISO 8601)")
    updated_at: str = Field(..., description="Last update timestamp (ISO 8601)")

    class Config:
        schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "production-langfuse",
                "endpoint": "https://langfuse.example.com",
                "region": "us-east-1",
                "public_key": "pk_lf_1234567890abcdef",
                "secret_name": "langfuse-secrets",
                "secret_key_field": "langfuse_secret_key",
                "status": "active",
                "created_at": "2024-03-12T10:00:00Z",
                "updated_at": "2024-03-12T10:00:00Z"
            }
        }


class LangfuseServerUpdate(BaseModel):
    """Schema for updating a Langfuse server"""

    name: Optional[str] = Field(None, min_length=3, max_length=100)
    endpoint: Optional[HttpUrl] = None
    region: Optional[str] = None
    public_key: Optional[str] = Field(None, min_length=10)
    secret_name: Optional[str] = None
    secret_key_field: Optional[str] = None
    status: Optional[ServerStatus] = None

    @validator("endpoint")
    def validate_https(cls, v):
        """Ensure endpoint uses HTTPS"""
        if v and not str(v).startswith("https://"):
            raise ValueError("Endpoint must use HTTPS")
        return v

    class Config:
        schema_extra = {
            "example": {
                "status": "maintenance"
            }
        }
