"""
AI Assistant Use Case Models .

Pydantic models for AI assistant requests and responses.
"""

from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class TaskType(str, Enum):
    """Type of AI assistant task."""
    FULL = "full"
    DATA_LOOKUP = "data_lookup"
    REPORT_GENERATION = "report_generation"
    DOCUMENT_SUMMARY = "document_summary"
    TASK_AUTOMATION = "task_automation"


class TaskStatus(str, Enum):
    """Status of an assistant task."""
    COMPLETED = "completed"
    IN_PROGRESS = "in_progress"
    FAILED = "failed"


class Priority(str, Enum):
    """Priority level for an assistant task."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class AssistantRequest(BaseModel):
    """Request model for AI assistant interaction."""
    employee_id: str = Field(..., description="Unique employee identifier")
    task_type: TaskType = Field(
        default=TaskType.FULL,
        description="Type of assistant task"
    )
    additional_context: str | None = Field(
        default=None,
        description="Additional context for the task"
    )


class TaskResult(BaseModel):
    """Details of the assistant task result."""
    status: TaskStatus = Field(..., description="Task completion status")
    priority: Priority = Field(default=Priority.MEDIUM, description="Task priority")
    output_data: dict = Field(default_factory=dict, description="Generated output data")
    actions_performed: list[str] = Field(default_factory=list, description="Actions performed")
    follow_up_items: list[str] = Field(default_factory=list, description="Suggested follow-up items")


class AssistantResponse(BaseModel):
    """Response model for AI assistant interaction."""
    employee_id: str = Field(..., description="Employee identifier")
    task_id: str = Field(..., description="Unique task interaction identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Interaction timestamp")
    result: TaskResult | None = Field(default=None, description="Task result details")
    recommendations: list[str] = Field(default_factory=list, description="Productivity recommendations")
    summary: str = Field(..., description="Executive summary of the task output")
    raw_analysis: dict = Field(default_factory=dict, description="Raw analysis from agents")


__all__ = [
    "TaskType",
    "TaskStatus",
    "Priority",
    "AssistantRequest",
    "TaskResult",
    "AssistantResponse",
]
