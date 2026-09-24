"""Configuration for the Govern Compliance Agent."""

from config.settings import Settings


class GovernComplianceSettings(Settings):
    """Configuration settings for the Govern Compliance Agent."""

    # Data path for S3 retriever (not used for this agent but required by base)
    data_prefix: str = ""

    # Agent settings
    default_scope: str = "all"  # all, agents, security, drift, privacy
    include_remediation: bool = True
    auto_remediate: bool = False  # Dangerous - requires explicit enable

    # Model settings for sub-agents
    policy_auditor_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    security_scanner_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    drift_detector_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    remediation_planner_model: str = "us.anthropic.claude-sonnet-4-5-20251022-v2:0"

    # Thresholds
    revalidation_warning_days: int = 30  # Warn when revalidation due in N days
    revalidation_critical_days: int = 90  # Critical when overdue by N days
    error_rate_warning: float = 0.01  # 1% error rate triggers warning
    error_rate_critical: float = 0.05  # 5% error rate is critical

    # Guardrail requirements
    require_guardrail_for_production: bool = True
    default_guardrail_id: str | None = None  # Fallback guardrail to assign

    # Autonomy settings
    max_auto_autonomy_tier: int = 2  # Don't auto-promote above L2
    require_approval_for_tier_change: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_govern_compliance_settings() -> GovernComplianceSettings:
    return GovernComplianceSettings()
