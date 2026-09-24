"""Govern SageMaker — live SageMaker control evaluation data.

Read-through (no DynamoDB): the source of truth is AWS itself —
sagemaker:ListModels, sagemaker:ListEndpoints, sagemaker:ListModelPackages,
sagemaker:ListProcessingJobs for Clarify jobs.

Follows the govern slice convention: honest live/source/note flags,
graceful live=False fallback that never raises.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class SageMakerModel(BaseModel):
    """One SageMaker model, from ListModels."""

    # The `model_*` fields here and on the sibling models in this file are the
    # SageMaker API's own names for AI model artifacts (model name/ARN, model package,
    # model card) - meaningful domain vocabulary, not pydantic internals. Pydantic
    # reserves the `model_` prefix, so the namespace guard is disabled deliberately;
    # renaming these fields would break the API contract the frontend reads.
    model_config = {"protected_namespaces": ()}

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

    model_config = {"protected_namespaces": ()}

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


class ModelCard(BaseModel):
    """One SageMaker Model Card for model documentation/governance."""

    model_config = {"protected_namespaces": ()}

    model_card_name: str = Field(..., description="The model card name")
    model_card_arn: str = Field("", description="The model card ARN")
    model_card_status: str = Field("", description="Draft | PendingReview | Approved | Archived")
    model_id: Optional[str] = Field(None, description="Associated model ID")
    creation_time: Optional[str] = Field(None, description="ISO8601 creation time")
    last_modified_time: Optional[str] = Field(None, description="ISO8601 last modified time")
    security_config: Optional[str] = Field(None, description="Security config (KMS key ARN)")


class ModelCardsResponse(BaseModel):
    """The account's SageMaker Model Cards (sagemaker:ListModelCards)."""

    cards: List[ModelCard] = Field(default_factory=list)
    total: int = 0
    approved: int = Field(0, description="Count with status == Approved")
    pending_review: int = Field(0, description="Count with status == PendingReview")
    draft: int = Field(0, description="Count with status == Draft")
    archived: int = Field(0, description="Count with status == Archived")
    live: bool
    source: str
    note: Optional[str] = None


class LineageArtifact(BaseModel):
    """One SageMaker ML Lineage artifact (dataset, model, image, etc.), from ListArtifacts.

    ListArtifacts returns only summary fields — a summary does not include the
    rich Properties map (that requires DescribeArtifact per artifact). We surface
    the SourceUri in `properties` so the graph node has something meaningful to show.
    """

    artifact_arn: str = Field("", description="The artifact ARN")
    artifact_name: str = Field("", description="The artifact name (falls back to ARN when unnamed)")
    artifact_type: str = Field("", description="Artifact type, e.g. DataSet, Model, Image, Endpoint")
    source_uri: Optional[str] = Field(None, description="The artifact's source URI, if any")
    creation_time: Optional[str] = Field(None, description="ISO8601 creation time")
    last_modified_time: Optional[str] = Field(None, description="ISO8601 last modified time")
    properties: Dict[str, str] = Field(default_factory=dict, description="Artifact summary properties")


class LineageContext(BaseModel):
    """One SageMaker ML Lineage context (endpoint, model deployment, experiment), from ListContexts."""

    context_arn: str = Field("", description="The context ARN")
    context_name: str = Field("", description="The context name (falls back to ARN when unnamed)")
    context_type: str = Field("", description="Context type, e.g. Endpoint, ModelDeployment")
    source_uri: Optional[str] = Field(None, description="The context's source URI, if any")
    creation_time: Optional[str] = Field(None, description="ISO8601 creation time")
    last_modified_time: Optional[str] = Field(None, description="ISO8601 last modified time")
    properties: Dict[str, str] = Field(default_factory=dict, description="Context summary properties")


class LineageAssociation(BaseModel):
    """One directed edge between two SageMaker lineage entities, from ListAssociations."""

    source_arn: str = Field("", description="The source entity ARN")
    destination_arn: str = Field("", description="The destination entity ARN")
    association_type: str = Field("", description="ContributedTo | AssociatedWith | DerivedFrom | Produced | SameAs")
    source_type: Optional[str] = Field(None, description="Source entity type")
    destination_type: Optional[str] = Field(None, description="Destination entity type")


class ModelLineageResponse(BaseModel):
    """The account's SageMaker ML Lineage graph.

    Composed from sagemaker:ListArtifacts, sagemaker:ListContexts, and
    sagemaker:ListAssociations. An empty graph (no artifacts, contexts, or
    associations) is a valid, honest live result: it means ML Lineage tracking
    has produced no entities in this account/region yet — not an error.
    """

    artifacts: List[LineageArtifact] = Field(default_factory=list)
    contexts: List[LineageContext] = Field(default_factory=list)
    associations: List[LineageAssociation] = Field(default_factory=list)
    total: int = Field(0, description="artifacts + contexts + associations")
    live: bool
    source: str
    note: Optional[str] = None


class SmDriftViolation(BaseModel):
    """One SageMaker Model Monitor data-quality constraint violation.

    Sourced from a monitor run's constraint_violations.json — each entry maps a
    baseline constraint that the analyzed capture failed (feature_name →
    feature, constraint_check_type → check_type, plus the human description).
    """

    feature: str = Field("", description="The feature that violated a baseline constraint (feature_name)")
    check_type: str = Field("", description="The constraint check that failed (constraint_check_type)")
    description: str = Field("", description="Human-readable violation description")


class SmDriftFeatureStat(BaseModel):
    """Per-feature baseline vs current mean, from Model Monitor statistics.json.

    baseline/current are the numerical_statistics.mean from the baseline and the
    monitor-run statistics respectively; drift_pct is the relative change
    (current-baseline)/baseline*100, or None when the baseline mean is zero.
    Only features present in BOTH baseline and current are reported.
    """

    feature: str = Field(..., description="The feature name")
    baseline: Optional[float] = Field(None, description="Baseline numerical_statistics.mean")
    current: Optional[float] = Field(None, description="Monitor-run numerical_statistics.mean")
    drift_pct: Optional[float] = Field(None, description="(current-baseline)/baseline*100, or None when baseline==0")


class ModelMonitorResponse(BaseModel):
    """SageMaker Model Monitor data-quality drift — baseline vs analyzed capture.

    Model Monitor *scheduling* is in AWS maintenance mode for this account, so
    drift is computed by an on-demand analyzer processing job whose output lands
    in S3. This response reads the baseline constraints/statistics and the run's
    constraint_violations.json + statistics.json.

    live=True only when the violations OR statistics files are readable (real
    drift data present). When the analyzer job exists/running but has produced no
    output yet, live=False with an honest 'drift results pending' note. When
    nothing exists, live=False with source 'unavailable-fallback'. Violations are
    NEVER fabricated.
    """

    monitor_configured: bool = Field(False, description="True when the analyzer processing job exists")
    monitored_endpoint: Optional[str] = Field(None, description="The endpoint the monitor observes")
    baseline_features: int = Field(0, description="Number of features in the baseline constraints.json")
    violations: List[SmDriftViolation] = Field(default_factory=list)
    violations_count: int = Field(0, description="len(violations)")
    feature_stats: List[SmDriftFeatureStat] = Field(default_factory=list)
    last_run_status: Optional[str] = Field(None, description="Analyzer ProcessingJobStatus")
    last_run: Optional[str] = Field(None, description="ISO8601 ProcessingEndTime, when available")
    live: bool
    source: str
    note: Optional[str] = None
