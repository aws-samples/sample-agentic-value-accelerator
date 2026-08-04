"""Govern SageMaker — live SageMaker control evaluation data.

Read-through (no DynamoDB): the source of truth is AWS itself —
sagemaker:ListModels, sagemaker:ListEndpoints, sagemaker:ListModelPackages,
sagemaker:ListProcessingJobs for Clarify jobs.

Follows the govern slice convention: honest live/source/note flags,
graceful live=False fallback that never raises.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class SageMakerModel(BaseModel):
    """One SageMaker model, from ListModels."""

    model_name: str = Field(..., description="The model name")
    model_arn: str = Field("", description="The model ARN")
    creation_time: Optional[str] = Field(None, description="ISO8601 creation time")
    enable_network_isolation: bool = Field(False, description="Whether network isolation is enabled")


class SageMakerModelsResponse(BaseModel):
    """The account's SageMaker models (sagemaker:ListModels)."""

    models: List[SageMakerModel] = Field(default_factory=list)
    total: int = 0
    live: bool
    source: str
    note: Optional[str] = None


class SageMakerEndpoint(BaseModel):
    """One SageMaker inference endpoint, from ListEndpoints."""

    endpoint_name: str = Field(..., description="The endpoint name")
    endpoint_arn: str = Field("", description="The endpoint ARN")
    endpoint_status: str = Field("", description="InService | Creating | Updating | Failed | etc.")
    creation_time: Optional[str] = Field(None, description="ISO8601 creation time")
    last_modified_time: Optional[str] = Field(None, description="ISO8601 last modified time")


class SageMakerEndpointsResponse(BaseModel):
    """The account's SageMaker inference endpoints (sagemaker:ListEndpoints)."""

    endpoints: List[SageMakerEndpoint] = Field(default_factory=list)
    total: int = 0
    in_service: int = Field(0, description="Count with status == InService")
    creating: int = Field(0, description="Count with status == Creating")
    updating: int = Field(0, description="Count with status == Updating")
    failed: int = Field(0, description="Count with status == Failed")
    live: bool
    source: str
    note: Optional[str] = None


class ModelPackageSummary(BaseModel):
    """One registered model package from the SageMaker Model Registry."""

    model_package_name: str = Field(..., description="The model package name")
    model_package_arn: str = Field("", description="The model package ARN")
    model_package_group_name: Optional[str] = Field(None, description="The model package group name")
    model_package_version: Optional[int] = Field(None, description="Version number within the group")
    model_approval_status: str = Field("", description="PendingManualApproval | Approved | Rejected")
    model_package_status: str = Field("", description="Pending | InProgress | Completed | Failed | Deleting")
    creation_time: Optional[str] = Field(None, description="ISO8601 creation time")


class ModelRegistryResponse(BaseModel):
    """The account's registered model packages (sagemaker:ListModelPackages)."""

    packages: List[ModelPackageSummary] = Field(default_factory=list)
    total: int = 0
    approved: int = Field(0, description="Count with approval_status == Approved")
    pending_approval: int = Field(0, description="Count with approval_status == PendingManualApproval")
    rejected: int = Field(0, description="Count with approval_status == Rejected")
    live: bool
    source: str
    note: Optional[str] = None


class ClarifyJob(BaseModel):
    """One SageMaker Clarify processing job for bias/explainability analysis."""

    job_name: str = Field(..., description="The processing job name")
    job_arn: str = Field("", description="The processing job ARN")
    job_status: str = Field("", description="InProgress | Completed | Failed | Stopping | Stopped")
    creation_time: Optional[str] = Field(None, description="ISO8601 creation time")
    processing_end_time: Optional[str] = Field(None, description="ISO8601 end time")
    exit_message: Optional[str] = Field(None, description="Exit message if failed/stopped")
    failure_reason: Optional[str] = Field(None, description="Failure reason if failed")


class ClarifyJobsResponse(BaseModel):
    """The account's SageMaker Clarify bias/explainability jobs."""

    jobs: List[ClarifyJob] = Field(default_factory=list)
    total: int = 0
    completed: int = Field(0, description="Count with status == Completed")
    in_progress: int = Field(0, description="Count with status == InProgress")
    failed: int = Field(0, description="Count with status == Failed")
    live: bool
    source: str
    note: Optional[str] = None
