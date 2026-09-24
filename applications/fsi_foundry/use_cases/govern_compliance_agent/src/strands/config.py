"""Govern Compliance Configuration (Strands Implementation)."""

from config.settings import Settings, get_regional_model_id


class GovernComplianceSettings(Settings):
    data_prefix: str = ""  # Not used for this agent
    _base_model: str = "anthropic.claude-haiku-4-5-20251001-v1:0"
    _planner_model: str = "anthropic.claude-sonnet-4-5-20251022-v2:0"

    @property
    def policy_auditor_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def security_scanner_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def drift_detector_model(self) -> str:
        return get_regional_model_id(self.aws_region, self._base_model)

    @property
    def remediation_planner_model(self) -> str:
        # Use more capable model for remediation planning
        return get_regional_model_id(self.aws_region, self._planner_model)

    # Agent settings
    default_scope: str = "all"  # all, agents, security, drift, privacy
    include_remediation: bool = True
    auto_remediate: bool = False  # Dangerous - requires explicit enable

    # Thresholds
    revalidation_warning_days: int = 30
    revalidation_critical_days: int = 90
    error_rate_warning: float = 0.01
    error_rate_critical: float = 0.05

    # Guardrail requirements
    require_guardrail_for_production: bool = True
    default_guardrail_id: str | None = None

    # Autonomy settings
    max_auto_autonomy_tier: int = 2
    require_approval_for_tier_change: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_govern_compliance_settings() -> GovernComplianceSettings:
    return GovernComplianceSettings()
