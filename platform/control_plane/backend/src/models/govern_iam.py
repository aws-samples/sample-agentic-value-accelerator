"""Govern IAM — vendor IAM access models for third-party risk management.

Shows what IAM roles/policies vendors have access to in AWS, enabling
governance teams to understand and audit third-party permissions.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class VendorIAMRole(BaseModel):
    """An IAM role associated with a vendor integration."""

    name: str = Field(..., description="Role name")
    arn: str = Field(..., description="Full IAM role ARN")
    last_used: Optional[str] = Field(None, description="Last time the role was assumed (ISO datetime)")
    trust_policy_summary: str = Field(..., description="Human-readable trust policy summary")
    created_date: Optional[str] = Field(None, description="Role creation date")


class VendorIAMPolicy(BaseModel):
    """An IAM policy attached to vendor roles."""

    name: str = Field(..., description="Policy name")
    policy_type: str = Field(..., description="managed or inline")
    arn: Optional[str] = Field(None, description="Policy ARN (for managed policies)")
    permissions: List[str] = Field(default_factory=list, description="Key permissions/actions granted")
    resource_scope: str = Field("*", description="Resource scope summary")


class VendorIAMAccess(BaseModel):
    """Complete IAM access summary for a vendor integration."""

    vendor_id: str = Field(..., description="Vendor identifier")
    vendor_name: str = Field(..., description="Vendor display name")
    has_aws_access: bool = Field(..., description="Whether vendor has direct AWS access")
    roles: List[VendorIAMRole] = Field(default_factory=list, description="IAM roles for this vendor")
    policies: List[VendorIAMPolicy] = Field(default_factory=list, description="Policies attached to vendor roles")
    risk_level: str = Field("low", description="Overall IAM risk level: low, medium, high, critical")
    last_activity: Optional[str] = Field(None, description="Most recent IAM activity timestamp")
    total_permissions: int = Field(0, description="Total number of distinct permissions")
    sensitive_permissions: List[str] = Field(default_factory=list, description="High-risk permissions found")
    recommendations: List[str] = Field(default_factory=list, description="Security recommendations")
    live: bool = Field(False, description="Whether data is from live AWS APIs")
    source: str = Field("mock", description="Data source: mock, iam, or cloudtrail")
    note: Optional[str] = Field(None, description="Additional context or notes")
