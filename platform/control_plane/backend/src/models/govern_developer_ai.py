"""Govern Developer AI — models for Claude Code / shadow AI detection.

Tracks developer AI tool usage (Claude Code, Cursor, etc.) via OpenTelemetry
metrics shipped to CloudWatch. Surfaces token consumption, spend, session counts,
and detects anomalies (spend spikes, runaway loops) and shadow AI (unapproved
tools, unknown users).

Also tracks AGENTIC coding — where AI agents autonomously write code, create
commits, and open PRs. Governance concerns: commits without review, changes to
sensitive files, agents exceeding scope.

The OpenTelemetry → CloudWatch integration uses:
- Namespace: claude_code (or custom via OTel config)
- Assisted metrics: token.usage, cost.usage, session.count
- Agentic metrics: agent.task.count, agent.task.duration, agent.commits,
  agent.files_modified, agent.lines_added, agent.lines_removed, agent.pr_created
- Dimensions: user.id, user.email, team.id, department, cost_center, tool,
  agent.mode, agent.autonomy_level, repo.name, repo.org, approval.status
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


# ──────────────────────────────────────────────────────────────────────────────
# Enums for Agentic Coding
# ──────────────────────────────────────────────────────────────────────────────

class AgentMode(str, Enum):
    """Mode of AI coding interaction."""
    AGENTIC = "agentic"       # Autonomous task execution
    ASSISTED = "assisted"     # Developer-driven with AI suggestions
    CHAT = "chat"             # Conversational Q&A only


class AutonomyLevel(str, Enum):
    """How autonomous the agent operation was."""
    FULL = "full"             # No human in the loop
    SUPERVISED = "supervised" # Human monitors but doesn't approve each step
    PAIR = "pair"             # Human and AI collaborate interactively


class ApprovalStatus(str, Enum):
    """Approval status for agentic actions."""
    NONE = "none"             # No approval requested
    PENDING = "pending"       # Awaiting approval
    APPROVED = "approved"     # Human approved
    DENIED = "denied"         # Human denied


# ──────────────────────────────────────────────────────────────────────────────
# Developer AI (Assisted) Models
# ──────────────────────────────────────────────────────────────────────────────


class DeveloperUsageByUser(BaseModel):
    """Aggregated usage for a single developer."""

    user_id: str = Field(..., description="User identifier from @resource.user.id")
    email: Optional[str] = Field(default=None, description="User email from @resource.user.email")
    team_id: Optional[str] = Field(default=None, description="Team from @resource.team.id")
    department: Optional[str] = Field(default=None, description="Org unit from @resource.department")
    cost_center: Optional[str] = Field(default=None, description="FinOps rollup from @resource.cost_center")
    input_tokens: int = Field(default=0, description="Total input tokens consumed")
    output_tokens: int = Field(default=0, description="Total output tokens consumed")
    total_tokens: int = Field(default=0, description="Sum of input + output tokens")
    total_cost_usd: float = Field(default=0.0, description="Total spend in USD")
    session_count: int = Field(default=0, description="Number of sessions")
    last_active: Optional[str] = Field(default=None, description="ISO timestamp of last activity")


class DeveloperUsageByTeam(BaseModel):
    """Aggregated usage for a team."""

    team_id: str = Field(..., description="Team identifier")
    department: Optional[str] = None
    cost_center: Optional[str] = None
    user_count: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    session_count: int = 0


class DeveloperUsageTrend(BaseModel):
    """Daily usage point for trend charts."""

    date: str = Field(..., description="Day, YYYY-MM-DD")
    input_tokens: int = 0
    output_tokens: int = 0
    total_cost_usd: float = 0.0
    session_count: int = 0
    user_count: int = 0


class DeveloperUsageResponse(BaseModel):
    """Developer AI usage summary — token/cost/session metrics from CloudWatch."""

    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    total_sessions: int = 0
    active_users: int = 0
    by_user: List[DeveloperUsageByUser] = Field(default_factory=list)
    by_team: List[DeveloperUsageByTeam] = Field(default_factory=list)
    trend: List[DeveloperUsageTrend] = Field(default_factory=list)
    period_start: str = ""
    period_end: str = ""
    # Shadow AI detection (from CloudTrail when OTel not available)
    shadow_ai: Optional["ShadowAiDetection"] = Field(
        default=None,
        description="Shadow AI detection from CloudTrail — unapproved users, tools, models"
    )
    live: bool = Field(..., description="True when sourced from CloudWatch/CloudTrail; False on fallback")
    source: str = Field(..., description="'cloudwatch' | 'cloudtrail' | 'unavailable-fallback'")
    note: Optional[str] = Field(default=None, description="Why fallback was used, or cache age")


class DeveloperUser(BaseModel):
    """A developer with AI tool usage."""

    user_id: str
    email: Optional[str] = None
    team_id: Optional[str] = None
    department: Optional[str] = None
    cost_center: Optional[str] = None
    tool: str = Field(default="claude-code", description="Tool identifier: claude-code, cursor, etc.")
    approved: bool = Field(default=True, description="Whether this user/tool combo is approved")
    first_seen: Optional[str] = None
    last_active: Optional[str] = None
    total_cost_usd: float = 0.0
    session_count: int = 0


class DeveloperUsersResponse(BaseModel):
    """List of developers with AI tool usage."""

    users: List[DeveloperUser] = Field(default_factory=list)
    total_count: int = 0
    approved_count: int = 0
    unapproved_count: int = 0
    live: bool
    source: str
    note: Optional[str] = None


class UsageAnomaly(BaseModel):
    """A detected anomaly in developer AI usage."""

    anomaly_type: str = Field(
        ...,
        description="spend-spike | runaway-loop | burst | unusual-hours"
    )
    severity: str = Field(..., description="low | medium | high | critical")
    user_id: Optional[str] = None
    team_id: Optional[str] = None
    description: str = Field(..., description="Human-readable anomaly description")
    detected_at: str = Field(..., description="ISO timestamp when anomaly was detected")
    metric_value: float = Field(..., description="The anomalous metric value")
    baseline_value: float = Field(..., description="Expected/baseline value")
    deviation_factor: float = Field(..., description="metric_value / baseline_value")
    window_start: Optional[str] = None
    window_end: Optional[str] = None


class AnomaliesResponse(BaseModel):
    """Detected anomalies in developer AI usage."""

    anomalies: List[UsageAnomaly] = Field(default_factory=list)
    count: int = 0
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0
    live: bool
    source: str
    note: Optional[str] = None


class ShadowAIFinding(BaseModel):
    """A shadow AI detection finding — unapproved tool or unknown user."""

    finding_type: str = Field(
        ...,
        description="unknown-user | unapproved-tool | external-api | policy-violation"
    )
    severity: str = Field(..., description="low | medium | high | critical")
    user_id: Optional[str] = None
    email: Optional[str] = None
    tool: Optional[str] = Field(default=None, description="Tool/API detected")
    description: str
    evidence: str = Field(..., description="CloudWatch metric/log that triggered this finding")
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None
    occurrence_count: int = 1
    recommended_action: str = Field(
        default="Review and either approve or block this usage",
        description="Suggested remediation"
    )


class ShadowAIResponse(BaseModel):
    """Shadow AI detection results — unapproved tools, unknown users, policy violations."""

    findings: List[ShadowAIFinding] = Field(default_factory=list)
    total_count: int = 0
    by_type: dict = Field(
        default_factory=dict,
        description="Count by finding_type: unknown-user, unapproved-tool, etc."
    )
    by_severity: dict = Field(
        default_factory=dict,
        description="Count by severity: critical, high, medium, low"
    )
    # Policy configuration for detection
    approved_tools: List[str] = Field(
        default_factory=lambda: ["claude-code"],
        description="Tools approved for use in this org"
    )
    approved_user_domains: List[str] = Field(
        default_factory=list,
        description="Email domains approved for AI tool access"
    )
    live: bool
    source: str
    note: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# Shadow AI Detection (CloudTrail-based) — matches frontend ShadowAiDetection
# ──────────────────────────────────────────────────────────────────────────────

class ShadowAiUnapprovedUser(BaseModel):
    """An unapproved user calling AI services (from CloudTrail)."""
    email: str = Field(..., description="User identity from CloudTrail")
    first_seen: str = Field(..., description="ISO timestamp of first activity")
    tokens: int = Field(default=0, description="Estimated token usage")
    source: str = Field(default="cloudtrail", description="Detection source")
    recommended_action: str = Field(
        default="Review user and either add to approved list or revoke access"
    )


class ShadowAiUnknownTool(BaseModel):
    """An unknown/unapproved tool or API calling AI services."""
    tool_name: str = Field(..., description="Tool or caller identity")
    first_seen: str = Field(..., description="ISO timestamp of first activity")
    users: int = Field(default=1, description="Number of distinct users")
    requests: int = Field(default=0, description="Number of API calls")
    evidence: str = Field(..., description="CloudTrail event details")
    recommended_action: str = Field(
        default="Investigate tool and either approve or block"
    )


class ShadowAiUnapprovedModel(BaseModel):
    """An unapproved model being invoked."""
    model_id: str = Field(..., description="Model identifier from CloudTrail")
    users: int = Field(default=1, description="Number of distinct users")
    requests: int = Field(default=0, description="Number of invocations")
    cost: float = Field(default=0.0, description="Estimated cost")
    evidence: str = Field(..., description="CloudTrail event details")
    recommended_action: str = Field(
        default="Review model usage and add to approved list or restrict access"
    )


class ShadowAiDetection(BaseModel):
    """Shadow AI detection results — matches frontend ShadowAiDetection interface."""
    unapproved_users: List[ShadowAiUnapprovedUser] = Field(default_factory=list)
    unknown_tools: List[ShadowAiUnknownTool] = Field(default_factory=list)
    unapproved_models: List[ShadowAiUnapprovedModel] = Field(default_factory=list)
    total_shadow_events: int = Field(default=0)
    shadow_cost_estimate: float = Field(default=0.0)


# ──────────────────────────────────────────────────────────────────────────────
# Agentic Coding Models
# ──────────────────────────────────────────────────────────────────────────────

class AgenticUserActivity(BaseModel):
    """Agentic coding activity per user.

    Aggregates autonomous coding tasks: commits, PRs, file changes by a single user.
    """

    user: str = Field(..., description="User ID or email")
    email: Optional[str] = None
    team_id: Optional[str] = None
    tasks: int = Field(default=0, description="Autonomous tasks started")
    commits: int = Field(default=0, description="Commits made by agent")
    prs_created: int = Field(default=0, description="PRs created by agent")
    files_modified: int = Field(default=0, description="Unique files touched")
    lines_added: int = 0
    lines_removed: int = 0
    avg_task_duration_minutes: float = 0.0
    autonomy_breakdown: dict = Field(
        default_factory=lambda: {"full": 0, "supervised": 0, "pair": 0},
        description="Count of tasks by autonomy level"
    )
    unapproved_actions: int = Field(
        default=0,
        description="Actions taken without required approval"
    )


class AgenticRepoActivity(BaseModel):
    """Agentic coding activity per repository.

    Tracks autonomous coding impact on a single repo.
    """

    repo_org: str = Field(..., description="Repository organization/owner")
    repo_name: str = Field(..., description="Repository name")
    tasks: int = 0
    commits: int = 0
    prs_created: int = 0
    prs_merged: int = 0
    files_modified: int = 0
    lines_added: int = 0
    lines_removed: int = 0
    unique_users: int = 0
    unapproved_commits: int = Field(0, description="Commits without human review")
    sensitive_file_changes: int = Field(0, description="Changes to security/config/secrets files")
    is_production: bool = Field(False, description="Whether this is a production repository")


class UnapprovedAgenticAction(BaseModel):
    """An agentic action that bypassed approval governance.

    These are governance risks: commits without review, PRs merged without approval,
    changes to sensitive files, agents exceeding their authorized scope.
    """

    user: str
    repo_org: str
    repo_name: str
    action: str = Field(..., description="commit | pr_create | pr_merge | deploy | file_modify")
    timestamp: str = Field(..., description="ISO timestamp of the action")
    approval_required: bool = Field(default=True, description="Whether approval was required")
    approval_status: ApprovalStatus = ApprovalStatus.NONE
    autonomy_level: AutonomyLevel = AutonomyLevel.FULL
    sensitive_files: List[str] = Field(
        default_factory=list,
        description="Sensitive files touched (security, config, secrets)"
    )
    risk_level: str = Field("medium", description="low | medium | high | critical")
    branch: Optional[str] = None
    commit_sha: Optional[str] = None
    pr_number: Optional[int] = None
    details: Optional[str] = Field(default=None, description="Additional context")


class AgenticCodingGovernanceRisk(BaseModel):
    """Summary of governance risks from agentic coding.

    Aggregates risk indicators: unapproved actions, sensitive file changes,
    high-autonomy on production repos, scope violations.
    """

    unapproved_commits: int = Field(0, description="Commits without human review")
    unapproved_prs_merged: int = Field(0, description="PRs merged without approval")
    sensitive_file_changes: int = Field(0, description="Changes to security/config/secrets")
    high_autonomy_on_prod_repos: int = Field(0, description="Full-autonomy tasks on prod repos")
    scope_exceeded_count: int = Field(0, description="Agents exceeding authorized scope")
    risk_score: float = Field(
        0.0,
        description="Aggregate risk score 0-100; >75 = critical"
    )
    risk_level: str = Field("low", description="low | medium | high | critical")
    top_risks: List[str] = Field(
        default_factory=list,
        description="Top 3 governance concerns"
    )


class AgenticCodingActivity(BaseModel):
    """Summary of agentic (autonomous) coding activity.

    CloudWatch metrics consumed (namespace: claude_code):
    - agent.task.count (dimensions: user, repo, autonomy_level)
    - agent.task.duration (dimensions: user, repo)
    - agent.commits (dimensions: user, repo, approval_status)
    - agent.files_modified (dimensions: user, repo, file_type)
    - agent.lines_added / agent.lines_removed
    - agent.pr_created (dimensions: user, repo, approval_status)

    Governance concerns for agentic coding:
    - Commits without human review
    - PRs merged without approval
    - Changes to sensitive files (security, config, secrets)
    - High autonomy on production repos
    - Agents exceeding their authorized scope
    """

    period: str = Field(..., description="Time period: 24h | 7d | 30d")
    total_tasks: int = Field(default=0, description="Total autonomous tasks started")
    total_commits: int = Field(default=0, description="Total commits made by agents")
    total_prs: int = Field(default=0, description="Total PRs created by agents")
    total_prs_merged: int = Field(default=0, description="Total PRs merged by agents")
    files_modified: int = Field(default=0, description="Total unique files modified")
    lines_added: int = 0
    lines_removed: int = 0
    unique_users: int = 0
    unique_repos: int = 0
    avg_task_duration_minutes: float = 0.0
    total_task_hours: float = Field(0.0, description="Total agent coding time in hours")

    # Breakdowns
    by_user: List[AgenticUserActivity] = Field(default_factory=list)
    by_repo: List[AgenticRepoActivity] = Field(default_factory=list)

    # Autonomy distribution
    autonomy_breakdown: dict = Field(
        default_factory=lambda: {"full": 0, "supervised": 0, "pair": 0},
        description="Task count by autonomy level"
    )

    # Mode distribution (for mixed agentic/assisted sessions)
    mode_breakdown: dict = Field(
        default_factory=lambda: {"agentic": 0, "assisted": 0, "chat": 0},
        description="Activity count by mode"
    )

    # Governance
    governance_risk: AgenticCodingGovernanceRisk = Field(
        default_factory=AgenticCodingGovernanceRisk
    )
    unapproved_activity: List[UnapprovedAgenticAction] = Field(
        default_factory=list,
        description="Recent actions that bypassed approval governance"
    )

    live: bool = Field(default=False, description="True when sourced from CloudWatch")
    source: str = Field(default="cloudwatch-otel", description="Data source identifier")
    note: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# Combined Developer AI Response (includes both assisted and agentic)
# ──────────────────────────────────────────────────────────────────────────────

class DeveloperAIPostureResponse(BaseModel):
    """Full Developer AI posture including assisted and agentic coding.

    Provides a unified view of all AI coding activity: developer-assisted (chat,
    completions) and agentic (autonomous tasks). Surfaces governance compliance
    and risk indicators.
    """

    assisted: DeveloperUsageResponse
    agentic: AgenticCodingActivity

    # Cross-cutting metrics
    total_ai_coding_hours: float = Field(
        0.0,
        description="Combined assisted + agentic hours"
    )
    agentic_ratio: float = Field(
        0.0,
        description="Portion of AI coding that's agentic (0-1)"
    )
    governance_compliant: bool = Field(
        True,
        description="No critical governance violations"
    )
    critical_risks: int = Field(0, description="Count of critical governance risks")

    period: str = Field(..., description="Time period: 24h | 7d | 30d")
    live: bool = Field(default=False, description="True when all sources are live")
    source: str = Field(default="cloudwatch-otel", description="Data source")
    note: Optional[str] = None
