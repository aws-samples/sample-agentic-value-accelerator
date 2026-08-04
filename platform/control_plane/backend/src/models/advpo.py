"""Advanced Prompt Optimization (AdvPO) data models

Thin Pydantic wrappers over the Bedrock CreateAdvancedPromptOptimizationJob /
GetAdvancedPromptOptimizationJob APIs.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum


class AdvPOJobStatus(str, Enum):
    """Mirrors the Bedrock jobStatus values, plus Submitted for the local
    transition before the first GetJob poll resolves."""
    SUBMITTED = "Submitted"
    IN_PROGRESS = "InProgress"
    COMPLETED = "Completed"
    PARTIALLY_COMPLETED = "PartiallyCompleted"
    FAILED = "Failed"
    STOPPING = "Stopping"
    STOPPED = "Stopped"
    DELETING = "Deleting"


class InferenceConfig(BaseModel):
    """Per-model inference parameters (all optional)."""
    max_tokens: Optional[int] = Field(default=None, description="Maximum tokens to generate")
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    stop_sequences: Optional[List[str]] = None


class ModelConfiguration(BaseModel):
    """A single target model for the optimization job."""
    model_id: str = Field(..., description="Bedrock model ID or inference profile ARN")
    inference_config: Optional[InferenceConfig] = None
    additional_model_request_fields: Optional[Dict[str, Any]] = None


class AdvPOJobCreate(BaseModel):
    """Request body for creating an AdvPO job."""
    job_name: str = Field(..., min_length=1, max_length=100, description="Job name")
    input_s3_uri: str = Field(..., description="S3 URI of the JSONL evaluation dataset")
    model_configurations: List[ModelConfiguration] = Field(..., min_length=1, max_length=5)
    output_s3_uri: Optional[str] = Field(
        default=None,
        description="S3 URI prefix for results. Falls back to the platform-managed bucket.",
    )
    job_description: Optional[str] = Field(default=None, max_length=500)
    encryption_key_arn: Optional[str] = Field(default=None, description="KMS key ARN for output encryption")
    tags: Optional[Dict[str, str]] = None


class AdvPODatasetUpload(BaseModel):
    """Request body for uploading an evaluation dataset (JSONL) to S3."""
    name: str = Field(..., min_length=1, description="Base file name, e.g. 'kyc-officer' or 'dataset.jsonl'")
    content: str = Field(..., description="Raw JSONL content (one JSON object per line)")


class AdvPODatasetUploadResult(BaseModel):
    """Result of uploading a dataset to the platform-managed bucket."""
    s3_uri: str
    bucket: str
    key: str
    size: int


class AdvPODatasetItem(BaseModel):
    """An existing dataset object under the datasets/ prefix."""
    key: str
    name: str = Field(..., description="File name without the datasets/ prefix")
    s3_uri: str
    size: int
    last_modified: Optional[str] = None


class AdvPODatasetList(BaseModel):
    """Datasets available in the platform-managed bucket."""
    bucket: str
    datasets: List[AdvPODatasetItem] = Field(default_factory=list)


class AdvPOResults(BaseModel):
    """Raw results JSONL read back from S3 for a job."""
    job_arn: str
    s3_uri: str
    content: str


class ModelScope(str, Enum):
    """Where a model/inference-profile routes requests.
    - GLOBAL: global.* cross-region inference profile (any commercial region)
    - REGIONAL: geography-scoped CRIS profile (us.* / eu.* / apac.*)
    - IN_REGION: on-demand foundation model invoked directly in the local region
    """
    GLOBAL = "global"
    REGIONAL = "regional"
    IN_REGION = "in_region"


class AdvPOModel(BaseModel):
    """A selectable target model for an optimization job."""
    id: str = Field(..., description="Model ID or inference profile ID")
    name: str = Field(..., description="Human-friendly model name")
    scope: ModelScope
    provider: Optional[str] = None
    cris_geo: Optional[str] = Field(default=None, description="CRIS geography: global | us | eu | apac")


class AdvPOModelList(BaseModel):
    """Models available for the backend's configured AWS region."""
    region: str
    cris_geo: str = Field(..., description="The regional CRIS geography for this region (us|eu|apac)")
    models: List[AdvPOModel] = Field(default_factory=list)


class AdvPOJobSummary(BaseModel):
    """Result of creating a job."""
    job_arn: str
    job_name: str
    status: AdvPOJobStatus = AdvPOJobStatus.SUBMITTED


class AdvPOJobListItem(BaseModel):
    """A single job summary from ListAdvancedPromptOptimizationJobs."""
    job_arn: str
    job_name: str
    status: AdvPOJobStatus
    creation_time: Optional[str] = None
    last_modified_time: Optional[str] = None


class AdvPOJobList(BaseModel):
    """Paginated list of optimization jobs."""
    jobs: List[AdvPOJobListItem] = Field(default_factory=list)
    next_token: Optional[str] = None


class AdvPOJob(BaseModel):
    """Full job detail returned by GetAdvancedPromptOptimizationJob."""
    job_arn: str
    job_name: str
    status: AdvPOJobStatus
    input_s3_uri: Optional[str] = None
    output_s3_uri: Optional[str] = None
    model_configurations: List[ModelConfiguration] = Field(default_factory=list)
    encryption_key_arn: Optional[str] = None
    failure_message: Optional[str] = None
    creation_time: Optional[str] = None
    last_modified_time: Optional[str] = None
    # Convenience: where the results JSONL is expected to land
    results_uri: Optional[str] = None
