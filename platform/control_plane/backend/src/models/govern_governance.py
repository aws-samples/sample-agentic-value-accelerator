"""Govern Governance Posture — KMS encryption-at-rest evidence + preventive SCPs.

Two live AWS sources, surfaced as governance evidence:
  - kms:ListKeys / ListAliases / DescribeKey / GetKeyRotationStatus
      → encryption-at-rest key inventory (customer- vs AWS-managed, rotation)
  - organizations:ListPolicies (SERVICE_CONTROL_POLICY) / ListTargetsForPolicy
      → preventive controls (Service Control Policies) and their attachment

Snake-case Pydantic mirrors of the frontend client contract (AwsKmsKey /
AwsKmsInventoryResponse / AwsScpPolicy / AwsScpResponse). Honest live/source/note
envelope; graceful live=False fallback. Organizations frequently returns
AccessDenied when the backend account is not the management / delegated-admin
account — that is reported as an honest non-live fallback, not an error.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class AwsKmsKey(BaseModel):
    """One KMS key from ListKeys + DescribeKey enrichment (alias mapped in)."""

    key_id: str
    alias: Optional[str] = Field(None, description="Primary alias (alias/... prefix stripped) if any")
    arn: Optional[str] = Field(None, description="Key ARN, shortened for display before exposure")
    manager: str = Field("", description="AWS | CUSTOMER (KeyManager)")
    enabled: bool = False
    rotation_enabled: Optional[bool] = Field(None, description="Automatic rotation — customer-managed symmetric keys only")
    key_spec: Optional[str] = Field(None, description="SYMMETRIC_DEFAULT | RSA_2048 | ECC_NIST_P256 | ...")
    description: Optional[str] = None
    creation_date: Optional[str] = None


class AwsKmsInventoryResponse(BaseModel):
    """The account's KMS key inventory as encryption-at-rest evidence."""

    keys: List[AwsKmsKey] = Field(default_factory=list)
    total: int = 0
    customer_managed: int = 0
    aws_managed: int = 0
    with_rotation: int = Field(0, description="Customer-managed keys with automatic rotation enabled")
    aliases_total: int = 0
    live: bool
    source: str
    note: Optional[str] = None


class AwsScpPolicy(BaseModel):
    """One Service Control Policy from organizations:ListPolicies."""

    id: str
    name: str
    arn: Optional[str] = None
    description: Optional[str] = None
    aws_managed: bool = False
    attached_target_count: Optional[int] = Field(None, description="Targets this SCP is attached to, when discoverable")


class AwsScpResponse(BaseModel):
    """Preventive controls — the org's Service Control Policies."""

    policies: List[AwsScpPolicy] = Field(default_factory=list)
    total: int = 0
    aws_managed_count: int = 0
    custom_count: int = 0
    live: bool
    source: str
    note: Optional[str] = None


class AwsTaggedResource(BaseModel):
    """One tagged AWS resource from resourcegroupstaggingapi:GetResources.

    ARN and tag values are account-id masked before exposure; the frontend
    shortens the ARN further to its resource tail for display.
    """

    arn: Optional[str] = Field(None, description="Resource ARN, account id masked before exposure")
    service: str = Field("", description="Service namespace from the ARN (e.g. ec2, lambda, bedrock-agentcore)")
    resource_type: Optional[str] = Field(None, description="Best-effort resource type from the ARN tail (e.g. role, function)")
    region: Optional[str] = Field(None, description="Region segment from the ARN, if present")
    ai_related: bool = False
    tags: Dict[str, str] = Field(default_factory=dict, description="Tag key/value map, account ids masked")


class AwsResourceInventoryResponse(BaseModel):
    """AI-estate resource inventory — tagged resources from Resource Groups Tagging."""

    resources: List[AwsTaggedResource] = Field(default_factory=list)
    total: int = 0
    by_service: Dict[str, int] = Field(default_factory=dict, description="Service namespace -> resource count")
    ai_related: int = Field(0, description="Count of resources flagged AI-related")
    tag_keys: List[str] = Field(default_factory=list, description="Sorted distinct tag keys observed")
    live: bool = False
    source: str = ""
    note: Optional[str] = None
