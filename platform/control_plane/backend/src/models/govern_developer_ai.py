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
    """An unapproved user calling AI services (from CloudTrail).

    Token counts are MEASURED from the Bedrock model-invocation log group, never
    estimated — CloudTrail management events carry no token data at all. When the
    invocation logs cannot attribute tokens to this identity the counts are None
    ("not measured"), which the UI must render as unknown rather than as zero.
    """
    email: str = Field(..., description="User identity from CloudTrail")
    first_seen: str = Field(..., description="ISO timestamp of first activity")
    tokens: Optional[int] = Field(
        default=None,
        description="Measured input+output tokens from Bedrock invocation logs; "
                    "None when not measurable for this identity (never estimated)",
    )
    input_tokens: Optional[int] = Field(
        default=None, description="Measured input tokens; None when not measured"
    )
    output_tokens: Optional[int] = Field(
        default=None,
        description="Measured output tokens; None when the model emits none "
                    "(e.g. embeddings) or nothing was measured",
    )
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
    """An unapproved model being invoked.

    Cost is computed from MEASURED token counts times this model's published
    per-token rate. It is None when either the tokens were not measured or the
    model has no rate entry — a model is never priced at a fallback rate that
    would silently misreport its spend.
    """

    # `model_id` is an AI model identifier (read from CloudTrail) - meaningful domain
    # vocabulary, not a pydantic internal. Pydantic reserves the `model_` prefix, so
    # the namespace guard is disabled deliberately; renaming the field would break
    # the API contract the frontend reads.
    model_config = {"protected_namespaces": ()}

    model_id: str = Field(..., description="Model identifier from CloudTrail")
    users: int = Field(default=1, description="Number of distinct users")
    requests: int = Field(default=0, description="Number of invocations")
    cost: Optional[float] = Field(
        default=None,
        description="USD from measured tokens x per-model rate; None when tokens "
                    "were not measured or the model has no published rate",
    )
    input_tokens: Optional[int] = Field(
        default=None, description="Measured input tokens; None when not measured"
    )
    output_tokens: Optional[int] = Field(
        default=None, description="Measured output tokens; None when not measured"
    )
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
    shadow_cost_estimate: float = Field(
        default=0.0,
        description="Sum of the priceable per-model costs only; models with no "
                    "measured tokens or no rate are excluded and named in `note`",
    )
    # Honest-degrade triple for the token/cost dimension specifically: the
    # CloudTrail event discovery can succeed while the token measurement fails,
    # and the UI needs to know which happened before it renders a Live badge.
    live: bool = Field(
        default=False,
        description="True only when token counts were actually measured",
    )
    source: str = Field(
        default="cloudtrail",
        description="cloudtrail (events only) or cloudtrail+bedrock-invocation-logs",
    )
    note: Optional[str] = Field(
        default=None, description="Why tokens/cost are partial or unavailable"
    )


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

    These are governance risks: commits without review, PRs opened without approval,
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
    unapproved_prs_created: int = Field(0, description="PRs opened by agents without approval")
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
    - PRs opened without approval
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


# ──────────────────────────────────────────────────────────────────────────────
# Local Agent Discovery Models
# ──────────────────────────────────────────────────────────────────────────────

class LocalAgentConfig(BaseModel):
    """A discovered local agent configuration file in a repository."""

    repo_name: str = Field(..., description="Repository name")
    repo_arn: Optional[str] = Field(default=None, description="Full CodeCommit ARN")
    file_path: str = Field(..., description="Path to the agent config file")
    tool: str = Field(..., description="Tool name: Claude Code, Copilot, Cursor, Kiro, Q Desktop, etc.")
    owner: Optional[str] = Field(default=None, description="Last committer or repo owner")
    team: Optional[str] = Field(default=None, description="Team tag from repo")
    last_modified: Optional[str] = Field(default=None, description="ISO timestamp of last modification")
    risk_level: str = Field(default="medium", description="low | medium | high | critical")
    description: Optional[str] = Field(default=None, description="Extracted agent description or purpose")
    file_size_bytes: int = Field(default=0, description="Size of the config file")
    content_preview: Optional[str] = Field(default=None, description="First 500 chars of content")


class LocalAgentToolSummary(BaseModel):
    """Summary of discovered agents by tool type."""

    tool: str = Field(..., description="Tool name")
    file_pattern: str = Field(..., description="File pattern used for detection")
    count: int = Field(default=0, description="Number of repos with this config")
    icon: str = Field(default="?", description="Short icon code for UI")


class LocalAgentDiscoveryResponse(BaseModel):
    """Response from scanning repositories for local agent configurations."""

    agents: List[LocalAgentConfig] = Field(default_factory=list)
    total_found: int = Field(default=0)
    by_tool: List[LocalAgentToolSummary] = Field(default_factory=list)
    repos_scanned: int = Field(default=0)
    repos_with_agents: int = Field(default=0)
    critical_count: int = Field(default=0)
    high_count: int = Field(default=0)
    medium_count: int = Field(default=0)
    low_count: int = Field(default=0)
    live: bool = Field(default=False)
    source: str = Field(default="codecommit")
    note: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# Policy Engine Models
# ──────────────────────────────────────────────────────────────────────────────

class PolicyStatus(str, Enum):
    """Status of a policy rule."""
    APPROVED = "approved"
    BLOCKED = "blocked"
    REVIEW = "review"  # Requires manual review


class PolicyRule(BaseModel):
    """A single policy rule for tools or models."""

    id: str = Field(..., description="Unique rule ID")
    name: str = Field(..., description="Human-readable rule name")
    rule_type: str = Field(..., description="tool | model | user | routing")
    pattern: str = Field(..., description="Pattern to match (e.g., 'claude-cli*', 'gpt-4*')")
    status: PolicyStatus = Field(..., description="What happens when matched")
    reason: Optional[str] = Field(default=None, description="Why this rule exists")
    created_by: Optional[str] = Field(default=None)
    created_at: Optional[str] = Field(default=None)
    updated_at: Optional[str] = Field(default=None)


class AgentPolicy(BaseModel):
    """Complete policy configuration for agentic coding governance."""

    id: str = Field(default="default", description="Policy ID")
    name: str = Field(default="Default Policy", description="Policy name")
    description: Optional[str] = Field(default=None)

    # Tool rules
    approved_tools: List[str] = Field(
        default_factory=lambda: ["claude-cli", "claude-code", "kiro", "amazonq", "aws-toolkit"],
        description="Tool patterns that are approved"
    )
    blocked_tools: List[str] = Field(
        default_factory=list,
        description="Tool patterns that are blocked"
    )
    review_tools: List[str] = Field(
        default_factory=lambda: ["cursor", "copilot"],
        description="Tools requiring manual review"
    )

    # Model rules
    approved_models: List[str] = Field(
        default_factory=lambda: ["anthropic.claude-*", "amazon.nova-*", "amazon.titan-*"],
        description="Model ID patterns that are approved"
    )
    blocked_models: List[str] = Field(
        default_factory=lambda: ["gpt-4*"],
        description="Model ID patterns that are blocked"
    )

    # User rules
    approved_users: List[str] = Field(
        default_factory=list,
        description="User patterns that are pre-approved"
    )
    blocked_users: List[str] = Field(
        default_factory=list,
        description="User patterns that are blocked"
    )

    # Thresholds
    max_requests_per_hour: int = Field(default=100, description="Rate limit per user")
    max_daily_cost_usd: float = Field(default=50.0, description="Cost limit per user per day")
    require_guardrails: bool = Field(default=False, description="Require Bedrock guardrails")

    # Metadata
    is_active: bool = Field(default=True)
    created_at: Optional[str] = Field(default=None)
    updated_at: Optional[str] = Field(default=None)


class PolicyViolation(BaseModel):
    """A detected policy violation."""

    id: str = Field(..., description="Violation ID")
    violation_type: str = Field(..., description="tool | model | user | rate | cost")
    severity: str = Field(default="medium", description="low | medium | high | critical")

    # What triggered the violation
    user: str = Field(..., description="User who triggered the violation")
    tool: Optional[str] = Field(default=None, description="Tool involved")
    model: Optional[str] = Field(default=None, description="Model involved")

    # Violation details
    rule_matched: str = Field(..., description="The rule pattern that was matched")
    policy_status: PolicyStatus = Field(..., description="What the policy says")

    # Context
    request_count: int = Field(default=1, description="Number of violating requests")
    first_seen: str = Field(..., description="When first detected")
    last_seen: str = Field(..., description="Most recent occurrence")

    # Action taken
    action_taken: Optional[str] = Field(default=None, description="auto-blocked | flagged | none")
    reviewed_by: Optional[str] = Field(default=None)
    reviewed_at: Optional[str] = Field(default=None)
    resolution: Optional[str] = Field(default=None)


class PolicyEvaluationResult(BaseModel):
    """Result of evaluating activity against policy."""

    policy_id: str
    policy_name: str

    # Counts
    total_evaluated: int = Field(default=0)
    approved_count: int = Field(default=0)
    blocked_count: int = Field(default=0)
    review_count: int = Field(default=0)

    # Violations found
    violations: List[PolicyViolation] = Field(default_factory=list)

    # Summary by type
    violations_by_type: dict = Field(default_factory=dict)
    violations_by_severity: dict = Field(default_factory=dict)

    live: bool = Field(default=False)
    source: str = Field(default="policy-engine")
    note: Optional[str] = Field(default=None)


class PolicyListResponse(BaseModel):
    """List of available policies."""

    policies: List[AgentPolicy] = Field(default_factory=list)
    active_policy_id: Optional[str] = Field(default=None)
    live: bool = Field(default=True)
    source: str = Field(default="local")


class PolicyUpdateRequest(BaseModel):
    """Request to update a policy."""

    name: Optional[str] = None
    description: Optional[str] = None
    approved_tools: Optional[List[str]] = None
    blocked_tools: Optional[List[str]] = None
    review_tools: Optional[List[str]] = None
    approved_models: Optional[List[str]] = None
    blocked_models: Optional[List[str]] = None
    approved_users: Optional[List[str]] = None
    blocked_users: Optional[List[str]] = None
    max_requests_per_hour: Optional[int] = None
    max_daily_cost_usd: Optional[float] = None
    require_guardrails: Optional[bool] = None
    is_active: Optional[bool] = None


# ──────────────────────────────────────────────────────────────────────────────
# Cost Attribution Models
# ──────────────────────────────────────────────────────────────────────────────

class CostByTool(BaseModel):
    """Cost breakdown by tool."""

    tool: str = Field(..., description="Tool name from userAgent")
    requests: int = Field(default=0)
    input_tokens: int = Field(default=0)
    output_tokens: int = Field(default=0)
    estimated_cost_usd: float = Field(default=0.0)
    users: int = Field(default=0, description="Unique users")


class CostByUser(BaseModel):
    """Cost breakdown by user."""

    user: str = Field(..., description="User identity")
    requests: int = Field(default=0)
    input_tokens: int = Field(default=0)
    output_tokens: int = Field(default=0)
    estimated_cost_usd: float = Field(default=0.0)
    tools: List[str] = Field(default_factory=list, description="Tools used")
    models: List[str] = Field(default_factory=list, description="Models used")


class CostByModel(BaseModel):
    """Cost breakdown by model.

    This is the authoritative per-model cut: token counts are measured from the
    Bedrock model-invocation logs and priced with this model's own rate. Cost is
    None when the model has no published rate — the by_tool / by_user / trend
    cuts and the response total then exclude it, and `note` names it.

    All three measured fields are Optional because unmeasured must stay
    distinguishable from a measured zero. A model appears in this cut if either
    source saw it, so there are two distinct unmeasured cases: CloudTrail named
    the model but the invocation logs never joined to it (no token record at
    all), and the logs joined but the model emits no output-token field. Both
    previously coerced to 0, which reads as "this model ran and cost nothing" —
    indistinguishable from a model that genuinely used zero output tokens.
    """

    model: str = Field(..., description="Model ID")
    requests: int = Field(
        default=0,
        description="CloudTrail events for this model. 0 is a measured zero: the "
                    "invocation logs saw it but CloudTrail's bounded paging did not "
                    "return matching events. The two sources count independently.",
    )
    input_tokens: Optional[int] = Field(
        default=None,
        description="Measured input tokens; None when unmeasured (never 0 as a stand-in)",
    )
    output_tokens: Optional[int] = Field(
        default=None,
        description="Measured output tokens; None when unmeasured or when the model "
                    "emits no output-token field",
    )
    estimated_cost_usd: Optional[float] = Field(
        default=None,
        description="USD from measured tokens x this model's rate; None when the "
                    "model has no published rate (never a fallback rate)",
    )
    users: int = Field(default=0)


class CostTrend(BaseModel):
    """Daily cost trend point."""

    date: str = Field(..., description="YYYY-MM-DD")
    requests: int = Field(default=0)
    estimated_cost_usd: float = Field(default=0.0)


class CostAttributionResponse(BaseModel):
    """Cost attribution breakdown for agentic coding."""

    period_days: int = Field(default=7)
    total_requests: int = Field(default=0)
    total_estimated_cost_usd: float = Field(default=0.0)

    by_tool: List[CostByTool] = Field(default_factory=list)
    by_user: List[CostByUser] = Field(default_factory=list)
    by_model: List[CostByModel] = Field(default_factory=list)
    trend: List[CostTrend] = Field(default_factory=list)

    live: bool = Field(default=False)
    source: str = Field(default="cloudtrail")
    note: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# AI Tool Provenance — where a call went, and how the tool got installed
#
# Defence in depth for agentic coding. Two independent classifications per observed
# (principal, tool) pair, each with an explicit unknown, plus the coverage denominators
# that say how much of the estate could have produced a finding at all.
#
# The classification logic lives in `core.ai_tool_provenance` and is unit-tested there;
# these are the wire shapes. See that module for why `unknown` may never default to a
# confident value.
# ──────────────────────────────────────────────────────────────────────────────

class CoverageRatioModel(BaseModel):
    """A measured fraction of the estate, denominator retained.

    `pct` is null when `total` is 0. Not 0.0 — "nothing exists to cover" and "nothing is
    covered" are different findings, and showing the first as 0% invents a failing control.
    """

    covered: int = Field(..., description="How many units are covered by this signal")
    total: int = Field(..., description="How many units exist. 0 means the denominator is unknown/empty")
    label: str = Field(..., description="Human-readable name of what is being measured")
    unit: str = Field(default="hosts", description="What is being counted: hosts, VPCs, calls")
    pct: Optional[float] = Field(default=None, description="Percentage covered, or null when total is 0")
    complete: bool = Field(default=False, description="True only when a real denominator is fully covered")
    note: Optional[str] = None


class ProvenanceCoverageModel(BaseModel):
    """How much of the estate the provenance answer actually covers."""

    endpoint: CoverageRatioModel = Field(..., description="Hosts under endpoint management / hosts known")
    dns: CoverageRatioModel = Field(..., description="VPCs with resolver query logging / VPCs total")
    call_path: CoverageRatioModel = Field(..., description="Calls with a determined path / calls observed")
    package_inventory: CoverageRatioModel = Field(..., description="Managed hosts with package inventory / managed hosts")
    unattributed_callers: int = Field(
        default=0,
        description=(
            "Observed callers that resolved to no host. Read alongside `endpoint`: that ratio "
            "counts EC2 instances, and developer machines are not EC2, so a complete EC2 ratio "
            "is not coverage of the hosts that made these calls."
        ),
    )
    blind_spots: List[str] = Field(
        default_factory=list,
        description="Plain statements of what this signal set cannot answer. Rendered verbatim.",
    )


class AiToolProvenanceRecord(BaseModel):
    """One observed (principal, tool) pair with its provenance classifications."""

    principal: str = Field(..., description="CloudTrail username / role that made the calls")
    tool: str = Field(..., description="Identified tool, or the raw user agent when unidentified")
    version: Optional[str] = None
    icon: str = Field(default="?", description="Short icon code for UI")
    tool_class: str = Field(..., description="coding_tool | sdk_caller | unidentified")
    call_path: str = Field(..., description="bedrock | public_api | unknown")
    install_provenance: str = Field(
        ..., description="managed | managed_runtime | self_installed | unknown_host"
    )
    provider: Optional[str] = Field(default=None, description="AWS Bedrock, Anthropic, OpenAI, …")
    exec_env: Optional[str] = Field(
        default=None, description="AWS-managed runtime the caller ran in (Lambda, Fargate, …)"
    )
    host_id: Optional[str] = Field(default=None, description="EC2 instance id when the call could be attributed")
    source_ip: Optional[str] = None
    user_agent: Optional[str] = None
    requests: int = 0
    models: List[str] = Field(default_factory=list)
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None
    governed: bool = Field(default=False, description="True only when the call path is proven to stay in AWS")
    needs_attention: bool = Field(
        default=False,
        description="A coding tool that left AWS or whose install cannot be vouched for. Excludes SDK callers.",
    )
    tool_evidence: str = Field(default="", description="Why this tool identity was assigned")
    call_path_evidence: str = Field(default="", description="Why this call path was assigned")
    install_evidence: str = Field(default="", description="Why this install provenance was assigned")
    host_evidence: str = Field(default="", description="How the host was (or was not) attributed")


class AiToolProvenanceResponse(BaseModel):
    """AI tool provenance with coverage denominators.

    Read the counts and the coverage together. `by_call_path` reporting zero `public_api`
    with `coverage.dns.covered == 0` does not mean nobody used a vendor API — it means the
    platform cannot see vendor API traffic at all.
    """

    records: List[AiToolProvenanceRecord] = Field(default_factory=list)
    total_records: int = 0
    by_call_path: dict = Field(default_factory=dict, description="Counts keyed by bedrock/public_api/unknown")
    by_install_provenance: dict = Field(
        default_factory=dict,
        description="Counts keyed by managed/managed_runtime/self_installed/unknown_host",
    )
    by_tool_class: dict = Field(default_factory=dict, description="Counts keyed by coding_tool/sdk_caller/unidentified")
    coding_tool_count: int = Field(default=0, description="Records that are identified AI coding tools")
    needs_attention_count: int = Field(default=0, description="Coding tools that left AWS or have unvouched installs")
    calls_observed: int = Field(default=0, description="Total API calls behind these records")
    window_days: int = Field(default=7, description="Lookback used, in days")
    coverage: Optional[ProvenanceCoverageModel] = None
    live: bool = Field(default=False)
    source: str = Field(default="cloudtrail+ssm")
    note: Optional[str] = None
