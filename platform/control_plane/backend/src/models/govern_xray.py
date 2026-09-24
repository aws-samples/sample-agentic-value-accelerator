"""Govern X-Ray - agent observability trace models.

Provides distributed tracing for agents via AWS X-Ray. Surfaces trace summaries,
service graphs, and trace details for debugging agent invocations.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class TraceSummary(BaseModel):
    """Summary of a single trace."""

    trace_id: str = Field(..., description="X-Ray trace ID")
    duration: Optional[float] = Field(None, description="Trace duration in seconds")
    response_time: Optional[float] = Field(None, description="Response time in seconds")
    has_fault: bool = False
    has_error: bool = False
    has_throttle: bool = False
    is_partial: bool = False
    http_status: Optional[int] = None
    http_method: Optional[str] = None
    http_url: Optional[str] = None
    service_ids: List[str] = Field(default_factory=list)
    annotations: dict = Field(default_factory=dict)
    users: List[str] = Field(default_factory=list)


class ServiceNode(BaseModel):
    """A node in the service graph."""

    name: str
    type: str = Field(..., description="Service type, e.g. 'AWS::Lambda', 'AWS::Bedrock'")
    edges: List[str] = Field(default_factory=list, description="Connected service names")
    response_time_avg_ms: Optional[float] = None
    error_rate: Optional[float] = None
    throughput: Optional[float] = None


class ServiceGraphResponse(BaseModel):
    """Service graph showing agent dependencies."""

    services: List[ServiceNode] = Field(default_factory=list)
    start_time: str
    end_time: str
    live: bool
    source: str = "xray"
    note: Optional[str] = None


class TraceSegment(BaseModel):
    """A segment within a trace."""

    id: str
    name: str
    start_time: float
    end_time: Optional[float] = None
    duration_ms: Optional[float] = None
    error: bool = False
    fault: bool = False
    annotations: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)
    subsegments: List["TraceSegment"] = Field(default_factory=list)


TraceSegment.model_rebuild()


class TraceDetail(BaseModel):
    """Detailed trace with all segments."""

    trace_id: str
    duration_ms: Optional[float] = None
    segments: List[TraceSegment] = Field(default_factory=list)
    live: bool
    source: str = "xray"
    note: Optional[str] = None


class TraceSummaryResponse(BaseModel):
    """Response containing trace summaries."""

    traces: List[TraceSummary] = Field(default_factory=list)
    total: int = 0
    has_faults: int = 0
    has_errors: int = 0
    start_time: str
    end_time: str
    live: bool
    source: str = "xray"
    note: Optional[str] = None
