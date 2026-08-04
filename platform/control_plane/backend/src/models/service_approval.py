"""Pydantic models for the Service Approval (Service Onboarding) pipeline."""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


PHASE_DEFINITIONS: List[dict] = [
    {"key": "assess",    "label": "Assess",    "phase_dir": "01-assess"},
    {"key": "research",  "label": "Research",  "phase_dir": "02-research"},
    {"key": "validate",  "label": "Validate",  "phase_dir": "03-validate"},
    {"key": "map",       "label": "Map",       "phase_dir": "04-map"},
    {"key": "generate",  "label": "Generate",  "phase_dir": "05-generate"},
    {"key": "test",      "label": "Test",      "phase_dir": "06-test"},
    {"key": "summarize", "label": "Summarize", "phase_dir": "07-summarize"},
    {"key": "evidence",  "label": "Evidence",  "phase_dir": "08-evidence"},
]


class TestingMode(str, Enum):
    SKIP = "skip"
    DRY_RUN = "dry-run"
    FULL_DEPLOY = "full-deploy"


class Framework(str, Enum):
    CCMV4 = "ccmv4"
    NIST_800_53 = "nist"
    CIS = "cis"
    ISO_27001 = "iso"


class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PhaseStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


class PhaseState(BaseModel):
    key: str
    label: str
    status: PhaseStatus = PhaseStatus.PENDING
    file_count: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None


class ServiceApprovalRunCreate(BaseModel):
    service: str = Field(min_length=1, max_length=128)
    framework: Framework = Framework.CCMV4
    testing_mode: TestingMode = TestingMode.SKIP


class ServiceApprovalRun(BaseModel):
    slug: str
    service: str
    framework: Framework
    testing_mode: TestingMode
    status: RunStatus
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    execution_arn: Optional[str] = None
    phases: List[PhaseState] = Field(default_factory=list)
    approval_report_path: Optional[str] = None
    error: Optional[str] = None


class FileEntry(BaseModel):
    path: str
    size: int
    modified_at: datetime


class FileGroup(BaseModel):
    name: str
    files: List[FileEntry]


class FileTree(BaseModel):
    slug: str
    phase: str
    groups: List[FileGroup]


class FileContent(BaseModel):
    path: str
    size: int
    content: str
    encoding: str = "utf-8"
    language: Optional[str] = None


def default_phases() -> List[PhaseState]:
    return [
        PhaseState(key=p["key"], label=p["label"], status=PhaseStatus.PENDING, file_count=0)
        for p in PHASE_DEFINITIONS
    ]
