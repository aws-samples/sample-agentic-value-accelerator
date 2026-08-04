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

from core.config import settings
from core.rbac import Role, require_role
from models.govern_developer_ai import (
    AgenticCodingActivity,
    AnomaliesResponse,
    DeveloperAIPostureResponse,
    DeveloperUsageResponse,
    DeveloperUsersResponse,
    ShadowAIResponse,
)
from services.govern_developer_ai_service import GovernDeveloperAIService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/govern/developer-ai", tags=["govern-developer-ai"])

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
            region=settings.AWS_REGION,
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
    hours: int = Query(default=24, ge=1, le=168, description="Trailing hours to scan for anomalies"),
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
    - PRs merged without approval
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
