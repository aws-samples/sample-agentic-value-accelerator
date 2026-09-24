"""Govern AI-DLC — AI-Driven Development Life Cycle observability models.

Provides visibility into AI-DLC pipeline state, runs, and metrics.
Reference: https://github.com/awslabs/aidlc-workflows
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class AidlcPhase(str, Enum):
    """AI-DLC v2 workflow phases (5 phases, 32 stages)."""
    INITIALIZATION = "initialization"
    IDEATION = "ideation"
    INCEPTION = "inception"
    CONSTRUCTION = "construction"
    OPERATION = "operation"


class AidlcStageExecution(str, Enum):
    """Stage execution mode."""
    ALWAYS = "always"
    CONDITIONAL = "conditional"


class AidlcStage(BaseModel):
    """AI-DLC workflow stage definition."""
    id: str
    name: str
    phase: AidlcPhase
    execution: AidlcStageExecution
    description: str


class AidlcProjectStatus(str, Enum):
    """Project status values."""
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    BLOCKED = "blocked"


class AidlcProjectProgress(BaseModel):
    """Progress percentages by phase (AI-DLC v2)."""
    initialization: float = 0.0
    ideation: float = 0.0
    inception: float = 0.0
    construction: float = 0.0
    operation: float = 0.0


class AidlcProject(BaseModel):
    """AI-DLC project state."""
    id: str
    name: str
    repository: str
    current_phase: AidlcPhase
    current_stage: str
    status: AidlcProjectStatus
    last_activity: datetime
    enabled_extensions: List[str] = []
    progress: AidlcProjectProgress
    violations: int = 0
    pending_approvals: int = 0
    team_members: List[str] = []


class AidlcExtensionCategory(str, Enum):
    """Extension rule categories."""
    SECURITY = "security"
    TESTING = "testing"
    RESILIENCY = "resiliency"
    CUSTOM = "custom"


class AidlcExtension(BaseModel):
    """AI-DLC extension (rule set)."""
    id: str
    name: str
    category: AidlcExtensionCategory
    rule_count: int
    description: str
    opt_in: bool = True
    blocking: bool = True


class AidlcRule(BaseModel):
    """Individual rule within an extension."""
    id: str
    extension_id: str
    title: str
    statement: str
    verification_criteria: List[str] = []


class AidlcFindingSeverity(str, Enum):
    """Finding severity levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class AidlcFindingStatus(str, Enum):
    """Finding status values."""
    OPEN = "open"
    RESOLVED = "resolved"
    WAIVED = "waived"


class AidlcFinding(BaseModel):
    """Violation or finding from rule evaluation."""
    id: str
    project_id: str
    rule_id: str
    stage: str
    severity: AidlcFindingSeverity
    status: AidlcFindingStatus
    message: str
    file: Optional[str] = None
    line: Optional[int] = None
    detected_at: datetime
    resolved_at: Optional[datetime] = None


class AidlcCodeQuality(BaseModel):
    """Code quality metrics from evaluator."""
    linting_score: float
    security_score: float
    duplication_pct: float


class AidlcTestResults(BaseModel):
    """Test execution metrics."""
    pass_rate: float
    coverage_pct: float
    total_tests: int


class AidlcNfrCompliance(BaseModel):
    """Non-functional requirements compliance."""
    token_consumption: int
    execution_time_ms: int
    cross_model_consistency: float


class AidlcEvaluatorMetrics(BaseModel):
    """Full evaluator metrics for a run."""
    project_id: str
    timestamp: datetime
    code_quality: AidlcCodeQuality
    test_results: AidlcTestResults
    nfr_compliance: AidlcNfrCompliance
    semantic_score: float
    overall_score: float


class AidlcAuditAction(str, Enum):
    """Audit log action types."""
    STAGE_STARTED = "stage-started"
    STAGE_COMPLETED = "stage-completed"
    APPROVAL_REQUESTED = "approval-requested"
    APPROVAL_GRANTED = "approval-granted"
    APPROVAL_REJECTED = "approval-rejected"
    FINDING_DETECTED = "finding-detected"
    FINDING_RESOLVED = "finding-resolved"


class AidlcAuditEntry(BaseModel):
    """Audit log entry."""
    id: str
    project_id: str
    timestamp: datetime
    stage: str
    action: AidlcAuditAction
    user: Optional[str] = None
    details: str


# Response models

class AidlcProjectsResponse(BaseModel):
    """List of AI-DLC projects."""
    projects: List[AidlcProject]
    total: int
    live: bool = False
    source: str = "mock"


class AidlcFindingsResponse(BaseModel):
    """Findings for a project or across all projects."""
    findings: List[AidlcFinding]
    total: int
    by_severity: dict = {}
    by_status: dict = {}
    live: bool = False
    source: str = "mock"


class AidlcMetricsResponse(BaseModel):
    """Evaluator metrics response."""
    metrics: List[AidlcEvaluatorMetrics]
    live: bool = False
    source: str = "mock"


class AidlcAuditResponse(BaseModel):
    """Audit log response."""
    entries: List[AidlcAuditEntry]
    total: int
    live: bool = False
    source: str = "mock"


# Harness monitoring models

class AidlcHarnessType(str, Enum):
    """Supported AI-DLC harnesses."""
    CLAUDE_CODE = "claude-code"
    KIRO_IDE = "kiro-ide"
    KIRO_CLI = "kiro-cli"
    CODEX_CLI = "codex-cli"
    OPENCODE = "opencode"
    Q_DESKTOP = "q-desktop"
    CURSOR = "cursor"
    COPILOT = "copilot"
    UNKNOWN = "unknown"


class DetectionSource(str, Enum):
    """Source of harness detection."""
    CLOUDTRAIL = "cloudtrail"
    CONFIG_FILE = "config_file"
    GIT_COMMIT = "git_commit"
    IDE_TELEMETRY = "ide_telemetry"  # future


class AidlcHarnessInstance(BaseModel):
    """Detected harness instance."""
    harness_type: AidlcHarnessType
    user: str
    version: Optional[str] = None
    last_seen: datetime
    request_count: int = 0
    models_used: List[str] = []
    config_path: Optional[str] = None  # If detected via config file
    last_commit_sha: Optional[str] = None  # If detected via git commit
    detection_method: str = "cloudtrail"  # Legacy field, use detection_sources
    detection_sources: List[DetectionSource] = []  # All sources that detected this
    detection_confidence: float = 0.5  # 0.0-1.0, higher if multiple sources agree


class AidlcHarnessStats(BaseModel):
    """Aggregate stats for a harness type."""
    harness_type: AidlcHarnessType
    display_name: str
    user_count: int
    total_requests: int
    versions_seen: List[str] = []
    last_activity: Optional[datetime] = None
    detection_sources: List[DetectionSource] = []  # All sources that contributed


class AidlcHarnessResponse(BaseModel):
    """Harness discovery response."""
    harnesses: List[AidlcHarnessStats]
    instances: List[AidlcHarnessInstance]
    total_users: int
    total_requests: int
    live: bool = False
    source: str = "mock"
    sources_used: List[DetectionSource] = []  # Which detection sources were used
    # Caveats about how complete this answer is. A detection pass that hit its page or time
    # cap read only part of the account's history, so the counts below are a floor, not a
    # total - and a floor presented without saying so reads as a total. Third leg of the
    # live/source/note honest-degrade triple the rest of Govern uses.
    note: Optional[str] = None


class AidlcStagesResponse(BaseModel):
    """Available stages response."""
    stages: List[AidlcStage]


class AidlcExtensionsResponse(BaseModel):
    """Available extensions response."""
    extensions: List[AidlcExtension]


class AidlcRulesResponse(BaseModel):
    """Rules for an extension."""
    extension_id: str
    rules: List[AidlcRule]
