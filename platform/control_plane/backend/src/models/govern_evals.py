"""Govern Evals — real Bedrock model-evaluation jobs, read-through.

Source of truth: bedrock:ListEvaluationJobs. Surfaces the account's actual
evaluation runs (model + RAG evals) for the AI Safety / Red-Team surface —
distinct from the published external safety benchmarks (HarmBench/WMDP), which
measure different things and stay illustrative.

Honest live/source/note flags, graceful live=False fallback.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class EvaluationJob(BaseModel):
    """One Bedrock evaluation job, from ListEvaluationJobs."""

    # job_arn now contains only the job ID (masked - account ID redacted).
    job_arn: str = Field(..., description="Masked job identifier (only job ID, not full ARN)")
    name: str
    status: str = Field(..., description="Title-case: Completed | InProgress | Stopped | Failed | …")
    application_type: str = Field("", description="ModelEvaluation | RagEvaluation")
    task_types: List[str] = Field(default_factory=list, description="e.g. ['QuestionAndAnswer','Summarization']")
    models: List[str] = Field(default_factory=list, description="Evaluated model identifiers (short form)")
    created_at: Optional[str] = Field(default=None, description="creationTime ISO8601, if present")


class EvaluationJobsResponse(BaseModel):
    """The account's real Bedrock evaluation jobs + a status roll-up."""

    jobs: List[EvaluationJob] = Field(default_factory=list)
    total: int = 0
    completed: int = 0
    in_progress: int = 0
    failed: int = 0
    model_evals: int = Field(0, description="Count with applicationType ModelEvaluation")
    rag_evals: int = Field(0, description="Count with applicationType RagEvaluation")
    live: bool
    source: str
    note: Optional[str] = None


class MetricScore(BaseModel):
    """Mean score for one evaluation metric, aggregated across scored records."""

    metric: str = Field(..., description="Metric name, e.g. 'Builtin.Accuracy' (Builtin. prefix stripped for display upstream)")
    mean_score: float = Field(..., description="Mean of the metric's per-record result (scale is metric-dependent, typically 0-1)")
    count: int = Field(..., description="Number of scored records contributing")


class EvalScoresResponse(BaseModel):
    """Real per-metric scores parsed from a job's S3 result JSONL.

    Two Bedrock layouts are handled: ModelEvaluation (automatedEvaluationResult.scores[])
    and RagEvaluation (conversationTurns[].results[]). Files can be large, so parsing
    is line-streamed and capped.
    """

    job_arn: str
    job_name: str = ""
    application_type: str = ""
    metrics: List[MetricScore] = Field(default_factory=list)
    records_scored: int = Field(0, description="Records read (may be capped below the full dataset)")
    capped: bool = Field(False, description="True if parsing stopped at the record cap")
    live: bool
    source: str
    note: Optional[str] = None
