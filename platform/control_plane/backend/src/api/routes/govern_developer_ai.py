"""Govern Developer AI — developer-assisted and agentic AI coding telemetry.

Read-through GET routes (no CRUD): CloudWatch is the source of truth for
OpenTelemetry metrics from Claude Code and similar AI tools. Follows the
govern slice route pattern — lazy service singleton reading settings.

Endpoints:
- GET /govern/developer-ai/usage - Query CloudWatch for developer AI metrics
- GET /govern/developer-ai/users - List users with AI tool usage
- GET /govern/developer-ai/anomalies - Detect spend spikes, runaway loops
- GET /govern/developer-ai/shadow-ai - Identify potential unauthorized AI usage
- GET /govern/developer-ai/agentic-coding - Agentic coding activity and governance
- GET /govern/developer-ai/posture - Combined assisted + agentic posture
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from core import region_scope
from core.config import settings
from core.rbac import Role, require_role
from models.govern_developer_ai import (
    AiToolProvenanceResponse,
    AgentPolicy,
    AgenticCodingActivity,
    AnomaliesResponse,
    CostAttributionResponse,
    DeveloperAIPostureResponse,
    DeveloperUsageResponse,
    DeveloperUsersResponse,
    LocalAgentDiscoveryResponse,
    PolicyEvaluationResult,
    PolicyListResponse,
    PolicyUpdateRequest,
    ShadowAIResponse,
)
from services.govern_developer_ai_service import GovernDeveloperAIService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/developer-ai", tags=["govern-developer-ai"])

# Region scope, declared for GET /govern/regions/scope. See core/region_scope.py.
REGION_SCOPE = region_scope.declare("govern_developer_ai", region_scope.SINGLE_REGION, prefix="/govern/developer-ai")

_svc: Optional[GovernDeveloperAIService] = None


def get_service() -> GovernDeveloperAIService:
    """Lazy-init the service singleton with config from settings."""
    global _svc
    if _svc is None:
        # Parse approved tools from env (comma-separated)
        approved_tools_raw = getattr(settings, "DEVELOPER_AI_APPROVED_TOOLS", "claude-code")
        approved_tools = [t.strip() for t in approved_tools_raw.split(",") if t.strip()]

        # Parse approved user domains from env (comma-separated)
        approved_domains_raw = getattr(settings, "DEVELOPER_AI_APPROVED_DOMAINS", "")
        approved_domains = [d.strip() for d in approved_domains_raw.split(",") if d.strip()]

        # Anomaly detection thresholds
        spend_threshold = float(getattr(settings, "DEVELOPER_AI_SPEND_SPIKE_THRESHOLD", "2.0"))
        runaway_threshold = int(getattr(settings, "DEVELOPER_AI_RUNAWAY_TOKEN_RATE", "100000"))

        _svc = GovernDeveloperAIService(
            region=settings.GOVERN_AWS_REGION,
            namespace=getattr(settings, "DEVELOPER_AI_NAMESPACE", "claude_code"),
            approved_tools=approved_tools,
            approved_user_domains=approved_domains,
            spend_spike_threshold=spend_threshold,
            runaway_token_rate=runaway_threshold,
        )
    return _svc


@router.get("/usage", response_model=DeveloperUsageResponse)
async def get_developer_ai_usage(
    days: int = Query(default=7, ge=1, le=90, description="Trailing days to include"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Developer AI usage summary — token consumption, spend, sessions by user/team.

    Reads OpenTelemetry metrics from CloudWatch:
    - claude_code.token.usage (input/output tokens)
    - claude_code.cost.usage (spend in USD)
    - claude_code.session.count (session counts)

    Returns a `live=False` fallback (never 500s) when CloudWatch is unreachable
    or no metrics exist, so the Govern surface can badge the source honestly.
    """
    return get_service().get_usage(days=days)


@router.get("/users", response_model=DeveloperUsersResponse)
async def get_developer_ai_users(
    days: int = Query(default=30, ge=1, le=90, description="Trailing days to scan for users"),
    _=Depends(require_role(Role.VIEWER)),
):
    """List developers with AI tool usage.

    Discovers users from CloudWatch metrics, marking each as approved or
    unapproved based on configured tool and domain policies. Useful for
    auditing who has access to and is using AI coding tools.
    """
    return get_service().get_users(days=days)


@router.get("/anomalies", response_model=AnomaliesResponse)
async def get_developer_ai_anomalies(
    hours: int = Query(
        default=24, ge=1, le=720,
        description="Trailing hours to scan for anomalies (max 720 = 30 days, matching the UI window selector)",
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """Detect anomalies in developer AI usage.

    Anomaly types:
    - spend-spike: Current spend rate > 2x (configurable) 7-day baseline
    - runaway-loop: Sustained high token rate suggesting an agent stuck in a loop

    Severity is based on deviation magnitude:
    - critical: >= 5x baseline
    - high: >= 3x baseline
    - medium: >= 2x baseline (or runaway rate)
    - low: notable but not actionable
    """
    return get_service().get_anomalies(hours=hours)


@router.get("/shadow-ai", response_model=ShadowAIResponse)
async def get_shadow_ai(
    days: int = Query(default=30, ge=1, le=90, description="Trailing days to scan for shadow AI"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Identify potential unauthorized AI tool usage.

    Shadow AI findings:
    - unapproved-tool: Usage of AI tools not in the approved list
    - unknown-user: Usage from users outside approved email domains

    Configure approved tools via DEVELOPER_AI_APPROVED_TOOLS env var (comma-separated).
    Configure approved domains via DEVELOPER_AI_APPROVED_DOMAINS env var (comma-separated).

    Returns findings sorted by severity with recommended remediation actions.
    """
    return get_service().get_shadow_ai(days=days)


@router.get("/agentic-coding", response_model=AgenticCodingActivity)
async def get_agentic_coding(
    period: str = Query(
        default="7d",
        regex="^(24h|7d|30d)$",
        description="Time period: 24h, 7d, or 30d"
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """Agentic coding activity summary — autonomous AI coding telemetry.

    Reads OpenTelemetry metrics from CloudWatch for agentic (autonomous) coding:
    - claude_code.agent.task.count - autonomous tasks started
    - claude_code.agent.task.duration - time spent on autonomous tasks
    - claude_code.agent.commits - commits made by agents
    - claude_code.agent.files_modified - files touched autonomously
    - claude_code.agent.lines_added / lines_removed
    - claude_code.agent.pr_created - PRs created by agents

    Dimensions tracked:
    - agent.mode: "agentic" vs "assisted" vs "chat"
    - agent.autonomy_level: "full", "supervised", "pair"
    - repo.name, repo.org: which repositories
    - approval.status: was human approval obtained

    Governance concerns surfaced:
    - Commits without human review
    - PRs opened without approval
    - Changes to sensitive files (security, config, secrets)
    - High autonomy on production repos
    - Agents exceeding authorized scope

    Returns `live=False` when CloudWatch is unreachable or no agentic metrics exist.
    """
    return get_service().get_agentic_coding(period=period)


@router.get("/posture", response_model=DeveloperAIPostureResponse)
async def get_developer_ai_posture(
    period: str = Query(
        default="7d",
        regex="^(24h|7d|30d)$",
        description="Time period: 24h, 7d, or 30d"
    ),
    _=Depends(require_role(Role.VIEWER)),
):
    """Combined developer AI posture — assisted and agentic coding together.

    Provides a unified view of all AI coding activity:
    - assisted: Developer-assisted AI (chat, completions, suggestions)
    - agentic: Autonomous AI coding (tasks, commits, PRs)

    Cross-cutting metrics:
    - total_ai_coding_hours: Combined assisted + agentic time
    - agentic_ratio: What portion of AI coding is autonomous (0-1)
    - governance_compliant: Whether there are any critical governance violations
    - critical_risks: Count of critical-severity governance risks

    Use this endpoint for executive dashboards and overall governance posture.
    Use the individual /usage, /agentic-coding, /shadow-ai endpoints for detailed views.
    """
    return get_service().get_posture(period=period)


@router.get("/local-agents", response_model=LocalAgentDiscoveryResponse)
async def discover_local_agents(
    limit: int = Query(default=100, ge=1, le=500, description="Max agents to return"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Discover ungoverned local AI agent configurations in CodeCommit repositories.

    Scans repositories for known agent config file patterns:
    - CLAUDE.md (Claude Code)
    - .github/copilot-instructions.md (GitHub Copilot)
    - .cursor/rules/ (Cursor)
    - .kiro/steering/ (Kiro)
    - .aws/amazonq/ (Q Desktop)
    - AGENTS.md (OpenAI Codex)

    These are "shadow agents" — local AI assistants configured by developers that
    may not be inventoried or under governance control. Discovery helps bring
    them into the governance framework.

    Risk levels are assessed based on content keywords:
    - critical: PII, PCI, credentials, secrets
    - high: database, production, payment, customer data
    - medium: internal, admin, config
    - low: no sensitive keywords detected

    Returns `live=False` when CodeCommit is unreachable or no repos found.
    """
    return get_service().discover_local_agents(limit=limit)


@router.get("/provenance", response_model=AiToolProvenanceResponse)
async def get_ai_tool_provenance(
    days: int = Query(default=7, ge=1, le=90, description="CloudTrail lookback in days"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Where AI tool calls went, and how those tools got installed - defence in depth.

    Two independent classifications per observed caller/tool pair, each with an explicit
    unknown, from evidence only:

    - `call_path`: `bedrock` (proven by a CloudTrail Bedrock event) | `public_api` (proven
      by a DNS/proxy match on a vendor domain) | `unknown`. **`public_api` requires Route 53
      Resolver query logging.** Without it, a tool calling `api.anthropic.com` produces no
      record at all - so a zero `public_api` count is not evidence that nobody used one.
    - `install_provenance`: `managed` (host under endpoint management, tool in its package
      inventory) | `self_installed` (inventory was read and the tool is absent from it) |
      `unknown_host` (the call came from a host with no endpoint coverage). The last is
      deliberately not `self_installed`: "we cannot see this host" and "hand-installed on a
      host we can see" are different facts.

    `tool_class` separates identified coding tools from generic SDK callers, because a
    deployed workload invoking Bedrock through boto3 is a governed application, not shadow
    developer tooling, and counting it as one is a false positive.

    **Read the counts with `coverage`.** Every count ships with the fraction of the estate
    that could have produced it - managed hosts, VPCs with DNS logging, calls classified,
    hosts with package inventory - plus `blind_spots` in plain language. A count without
    its denominator cannot distinguish a clean estate from no telemetry.

    Nothing here covers a developer laptop off the corporate network; that needs an endpoint
    agent or MDM, and `blind_spots` says so rather than implying coverage.

    Returns `live=False` only when neither CloudTrail nor SSM could be read at all.
    """
    return get_service().get_ai_tool_provenance(days=days)


# -------------------------------------------------------------------------
# Policy Engine
# -------------------------------------------------------------------------

@router.get("/policies", response_model=PolicyListResponse)
async def list_policies(
    _=Depends(require_role(Role.VIEWER)),
):
    """List all configured governance policies.

    Returns the list of available policies and indicates which one is active.
    """
    return get_service().get_policies()


@router.get("/policies/{policy_id}", response_model=AgentPolicy)
async def get_policy(
    policy_id: str,
    _=Depends(require_role(Role.VIEWER)),
):
    """Get a specific policy by ID.

    Returns the full policy configuration including:
    - Approved/blocked/review tool patterns
    - Approved/blocked model patterns
    - User restrictions
    - Rate limits and thresholds
    """
    return get_service().get_policy(policy_id)


@router.get("/policies/{policy_id}/evaluate", response_model=PolicyEvaluationResult)
async def evaluate_policy(
    policy_id: str,
    days: int = Query(default=7, ge=1, le=30, description="Days of history to evaluate"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Evaluate recent activity against a governance policy.

    Scans CloudTrail events and evaluates each against the policy rules:
    - Tool rules: approved, blocked, or requires review
    - Model rules: approved or blocked patterns
    - User rules: approved or blocked users

    Returns:
    - Count of approved/blocked/review events
    - List of violations with details
    - Aggregations by type and severity

    Violations are created for any activity that doesn't match an approved pattern.
    Blocked patterns always take precedence over approved patterns.
    """
    return get_service().evaluate_policy(policy_id, days)


@router.patch("/policies/{policy_id}", response_model=AgentPolicy)
async def update_policy(
    policy_id: str,
    update: PolicyUpdateRequest,
    _=Depends(require_role(Role.ADMIN)),
):
    """Update a governance policy.

    Partial update - only provided fields are modified.
    Requires ADMIN role.

    Updatable fields:
    - name, description
    - approved_tools, blocked_tools, review_tools
    - approved_models, blocked_models
    - approved_users, blocked_users
    - max_requests_per_hour, max_daily_cost_usd
    - require_guardrails, is_active
    """
    return get_service().update_policy(policy_id, update)


@router.post("/policies", response_model=AgentPolicy)
async def create_policy(
    policy: AgentPolicy,
    _=Depends(require_role(Role.ADMIN)),
):
    """Create a new governance policy.

    Requires ADMIN role. Policy ID must be unique.
    """
    return get_service().create_policy(policy)


@router.delete("/policies/{policy_id}")
async def delete_policy(
    policy_id: str,
    _=Depends(require_role(Role.ADMIN)),
):
    """Delete a governance policy.

    Cannot delete the default policy. Requires ADMIN role.
    """
    get_service().delete_policy(policy_id)
    return {"status": "deleted", "policy_id": policy_id}


@router.post("/policies/{policy_id}/activate", response_model=PolicyListResponse)
async def activate_policy(
    policy_id: str,
    _=Depends(require_role(Role.ADMIN)),
):
    """Set a policy as the active policy.

    Only the active policy is used for real-time enforcement.
    """
    return get_service().set_active_policy(policy_id)


# -------------------------------------------------------------------------
# Cost Attribution
# -------------------------------------------------------------------------

@router.get("/cost-attribution", response_model=CostAttributionResponse)
async def get_cost_attribution(
    days: int = Query(default=7, ge=1, le=30, description="Days of history"),
    _=Depends(require_role(Role.VIEWER)),
):
    """Get cost attribution breakdown for agentic coding tools.

    Analyzes CloudTrail events to estimate costs by:
    - Tool (claude-cli, boto3, etc.)
    - User (IAM identity)
    - Model (Claude, Nova, Titan, etc.)
    - Daily trend

    Costs are estimated based on token counts and model pricing.
    Actual costs may vary - use AWS Cost Explorer for authoritative data.
    """
    return get_service().get_cost_attribution(days)
