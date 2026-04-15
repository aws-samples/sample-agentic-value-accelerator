"""Deployment data models"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime
import uuid


class DeploymentStatus(str, Enum):
    PENDING = "pending"
    VALIDATING = "validating"
    PACKAGING = "packaging"
    DEPLOYING = "deploying"
    VERIFYING = "verifying"
    DEPLOYED = "deployed"
    DESTROYING = "destroying"
    DESTROYED = "destroyed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"
    # Legacy statuses kept for backward compatibility with S3-only flow
    PACKAGED = "packaged"
    DELIVERED = "delivered"


VALID_TRANSITIONS = {
    DeploymentStatus.PENDING:     {DeploymentStatus.VALIDATING, DeploymentStatus.FAILED,
                                   DeploymentStatus.PACKAGED},  # PACKAGED for legacy S3 flow
    DeploymentStatus.VALIDATING:  {DeploymentStatus.PACKAGING, DeploymentStatus.FAILED},
    DeploymentStatus.PACKAGING:   {DeploymentStatus.DEPLOYING, DeploymentStatus.FAILED},
    DeploymentStatus.DEPLOYING:   {DeploymentStatus.VERIFYING, DeploymentStatus.FAILED},
    DeploymentStatus.VERIFYING:   {DeploymentStatus.DEPLOYED, DeploymentStatus.FAILED},
    DeploymentStatus.DEPLOYED:    {DeploymentStatus.DESTROYING},
    DeploymentStatus.DESTROYING:  {DeploymentStatus.DESTROYED, DeploymentStatus.FAILED},
    DeploymentStatus.DESTROYED:   set(),
    DeploymentStatus.FAILED:      {DeploymentStatus.DESTROYING, DeploymentStatus.PENDING},
    DeploymentStatus.ROLLED_BACK: set(),
    # Legacy transitions for S3-only flow
    DeploymentStatus.PACKAGED:    {DeploymentStatus.DELIVERED, DeploymentStatus.FAILED},
    DeploymentStatus.DELIVERED:   set(),
}


class StatusHistoryEntry(BaseModel):
    status: str
    timestamp: str
    message: Optional[str] = None


class DeploymentCreate(BaseModel):
    deployment_name: str = Field(..., min_length=1, max_length=100)
    template_id: str
    iac_type: str
    framework_id: Optional[str] = None
    aws_region: str = "us-east-1"
    parameters: Dict[str, Any] = Field(default_factory=dict)
    target_account_id: Optional[str] = None
    target_role_arn: Optional[str] = None


class Deployment(BaseModel):
    deployment_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    deployment_name: Optional[str] = "unknown"
    template_id: Optional[str] = "unknown"
    iac_type: Optional[str] = "terraform"
    framework_id: Optional[str] = None
    aws_account: Optional[str] = "unknown"
    aws_region: Optional[str] = "us-east-1"
    s3_bucket: Optional[str] = "unknown"
    s3_key: Optional[str] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)
    status: DeploymentStatus = DeploymentStatus.PENDING
    status_history: List[StatusHistoryEntry] = Field(default_factory=list)
    error_message: Optional[str] = None
    failed_stage: Optional[str] = None
    execution_arn: Optional[str] = None
    build_id: Optional[str] = None
    outputs: Dict[str, str] = Field(default_factory=dict)
    target_account_id: Optional[str] = None
    target_role_arn: Optional[str] = None
    created_by: str = "system"
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

    def transition_to(self, new_status: DeploymentStatus, message: Optional[str] = None):
        current = DeploymentStatus(self.status)
        if new_status not in VALID_TRANSITIONS.get(current, set()):
            raise ValueError(f"Invalid transition: {current} -> {new_status}")
        self.status = new_status
        self.updated_at = datetime.utcnow().isoformat()
        self.status_history.append(StatusHistoryEntry(
            status=new_status.value, timestamp=self.updated_at, message=message
        ))


class DeploymentResponse(BaseModel):
    deployment_id: str
    deployment_name: str
    template_id: str
    iac_type: str
    framework_id: Optional[str] = None
    aws_account: str
    aws_region: str
    s3_bucket: str
    s3_key: Optional[str] = None
    status: str
    status_history: List[StatusHistoryEntry] = []
    error_message: Optional[str] = None
    failed_stage: Optional[str] = None
    execution_arn: Optional[str] = None
    build_id: Optional[str] = None
    outputs: Dict[str, str] = Field(default_factory=dict)
    target_account_id: Optional[str] = None
    target_role_arn: Optional[str] = None
    created_by: str
    created_at: str
    updated_at: str
