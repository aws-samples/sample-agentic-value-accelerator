"""
Budget Controls and Rate Limit Enforcement for LiteLLM Gateway.

Provides configuration and enforcement logic for:
- Budget alert notifications (Slack webhook at 80% threshold)
- Budget hard limits (HTTP 429 rejection at 100% threshold)
- Per-key rate limits (configurable RPM and TPM with defaults)
- Retry-After header inclusion in 429 responses

This module integrates with the Config Generator to produce the correct
general_settings and with the Provisioning Service to ensure rate limits
are applied per virtual key.

Tasks: 11.3
Requirements: 11.1, 11.2, 11.4, 11.5
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Default rate limit values
DEFAULT_RPM_LIMIT = 100
DEFAULT_TPM_LIMIT = 100_000

# Default budget thresholds
DEFAULT_ALERT_THRESHOLD = 0.8
DEFAULT_HARD_LIMIT_THRESHOLD = 1.0

# Retry-After default (seconds) included in HTTP 429 responses
DEFAULT_RETRY_AFTER_SECONDS = 60


def _get_settings():
    """Attempt to load application settings from core.config.

    Returns None if the settings module is not available (e.g., in test
    contexts where the module is loaded via importlib without the full
    package structure).
    """
    try:
        from core.config import settings
        return settings
    except (ModuleNotFoundError, ImportError):
        return None


@dataclass
class BudgetAlertConfig:
    """Configuration for budget alert notifications.

    Attributes:
        alert_threshold: Fraction of max_budget at which to send alert (0.0-1.0).
        slack_webhook_url: Slack incoming webhook URL for notifications.
        alert_types: Types of alerts to send (e.g., budget_alerts, spend_reports).
    """

    alert_threshold: float = DEFAULT_ALERT_THRESHOLD
    slack_webhook_url: str = ""
    alert_types: list = field(
        default_factory=lambda: ["budget_alerts", "spend_reports"]
    )


@dataclass
class BudgetHardLimitConfig:
    """Configuration for budget hard enforcement.

    Attributes:
        hard_limit_threshold: Fraction of max_budget at which to reject requests (0.0-1.0).
        reject_status_code: HTTP status code for budget-exhausted rejections.
        retry_after_seconds: Value for the Retry-After header in rejection responses.
    """

    hard_limit_threshold: float = DEFAULT_HARD_LIMIT_THRESHOLD
    reject_status_code: int = 429
    retry_after_seconds: int = DEFAULT_RETRY_AFTER_SECONDS


@dataclass
class RateLimitConfig:
    """Per-key rate limit configuration.

    Attributes:
        rpm_limit: Requests per minute limit.
        tpm_limit: Tokens per minute limit.
        retry_after_seconds: Value for the Retry-After header when rate limited.
    """

    rpm_limit: int = DEFAULT_RPM_LIMIT
    tpm_limit: int = DEFAULT_TPM_LIMIT
    retry_after_seconds: int = DEFAULT_RETRY_AFTER_SECONDS


class BudgetEnforcementService:
    """Manages budget control configuration for the LiteLLM gateway.

    This service produces the configuration dictionaries consumed by the
    Config Generator to set up:
    - Slack webhook alerts at 80% budget utilization
    - Hard request rejection (HTTP 429) at 100% budget utilization
    - Per-key RPM and TPM rate limits
    - Retry-After headers in 429 responses

    All thresholds and defaults are read from the application settings
    (core.config.settings) which can be overridden via environment variables.
    """

    def __init__(
        self,
        slack_webhook_url: Optional[str] = None,
        alert_threshold: Optional[float] = None,
        hard_limit_threshold: Optional[float] = None,
        default_rpm_limit: Optional[int] = None,
        default_tpm_limit: Optional[int] = None,
        retry_after_seconds: int = DEFAULT_RETRY_AFTER_SECONDS,
    ):
        """Initialize budget enforcement service.

        Args:
            slack_webhook_url: Slack webhook URL. Falls back to settings.LITELLM_SLACK_WEBHOOK_URL.
            alert_threshold: Alert threshold (0.0-1.0). Falls back to settings.LITELLM_BUDGET_ALERT_THRESHOLD.
            hard_limit_threshold: Hard limit threshold. Falls back to settings.LITELLM_BUDGET_HARD_LIMIT_THRESHOLD.
            default_rpm_limit: Default RPM limit. Falls back to settings.LITELLM_DEFAULT_RPM_LIMIT.
            default_tpm_limit: Default TPM limit. Falls back to settings.LITELLM_DEFAULT_TPM_LIMIT.
            retry_after_seconds: Retry-After header value in seconds for 429 responses.
        """
        app_settings = _get_settings()

        self._slack_webhook_url = slack_webhook_url or (
            getattr(app_settings, "LITELLM_SLACK_WEBHOOK_URL", "") if app_settings else ""
        )
        self._alert_threshold = (
            alert_threshold
            if alert_threshold is not None
            else (
                getattr(app_settings, "LITELLM_BUDGET_ALERT_THRESHOLD", DEFAULT_ALERT_THRESHOLD)
                if app_settings
                else DEFAULT_ALERT_THRESHOLD
            )
        )
        self._hard_limit_threshold = (
            hard_limit_threshold
            if hard_limit_threshold is not None
            else (
                getattr(app_settings, "LITELLM_BUDGET_HARD_LIMIT_THRESHOLD", DEFAULT_HARD_LIMIT_THRESHOLD)
                if app_settings
                else DEFAULT_HARD_LIMIT_THRESHOLD
            )
        )
        self._default_rpm_limit = (
            default_rpm_limit
            if default_rpm_limit is not None
            else (
                getattr(app_settings, "LITELLM_DEFAULT_RPM_LIMIT", DEFAULT_RPM_LIMIT)
                if app_settings
                else DEFAULT_RPM_LIMIT
            )
        )
        self._default_tpm_limit = (
            default_tpm_limit
            if default_tpm_limit is not None
            else (
                getattr(app_settings, "LITELLM_DEFAULT_TPM_LIMIT", DEFAULT_TPM_LIMIT)
                if app_settings
                else DEFAULT_TPM_LIMIT
            )
        )
        self._retry_after_seconds = retry_after_seconds

    @property
    def alert_config(self) -> BudgetAlertConfig:
        """Get the budget alert configuration."""
        return BudgetAlertConfig(
            alert_threshold=self._alert_threshold,
            slack_webhook_url=self._slack_webhook_url,
            alert_types=["budget_alerts", "spend_reports"],
        )

    @property
    def hard_limit_config(self) -> BudgetHardLimitConfig:
        """Get the budget hard limit configuration."""
        return BudgetHardLimitConfig(
            hard_limit_threshold=self._hard_limit_threshold,
            reject_status_code=429,
            retry_after_seconds=self._retry_after_seconds,
        )

    @property
    def rate_limit_config(self) -> RateLimitConfig:
        """Get the default rate limit configuration."""
        return RateLimitConfig(
            rpm_limit=self._default_rpm_limit,
            tpm_limit=self._default_tpm_limit,
            retry_after_seconds=self._retry_after_seconds,
        )

    def build_general_settings_budget_config(self) -> Dict[str, Any]:
        """Build the budget-related portion of LiteLLM general_settings.

        Produces a dictionary with keys that LiteLLM recognizes for:
        - Slack alerting: alerting channel, webhook URL
        - Budget alerts: alert threshold at 80%
        - Hard enforcement: reject at 100% budget with HTTP 429

        Returns:
            Dictionary of general_settings entries for budget control.
        """
        config: Dict[str, Any] = {
            "alerting": ["slack"],
            "alert_types": ["budget_alerts", "spend_reports"],
            "alerting_args": {
                "slack_webhook_url": self._slack_webhook_url,
                "budget_alert_ttl": 86400,  # 24 hours between repeat alerts
            },
            "budget_alert_threshold": self._alert_threshold,
        }

        logger.info(
            "Budget alert config: threshold=%.0f%%, slack_webhook=%s",
            self._alert_threshold * 100,
            "configured" if self._slack_webhook_url else "not configured",
        )

        return config

    def build_rate_limit_policy(self) -> Dict[str, Any]:
        """Build the rate limit policy for inclusion in LiteLLM config.

        Produces settings for the general_settings section that control
        how rate-limited responses are handled, including the Retry-After
        header.

        Returns:
            Dictionary of rate limit policy settings.
        """
        return {
            "global_max_parallel_requests": 1000,
            "max_request_size_mb": 10,
            "custom_headers": {
                "x-ratelimit-policy": "per-key",
                "x-default-rpm-limit": str(self._default_rpm_limit),
                "x-default-tpm-limit": str(self._default_tpm_limit),
            },
        }

    def get_key_rate_limits(
        self,
        rpm_limit: Optional[int] = None,
        tpm_limit: Optional[int] = None,
    ) -> Dict[str, int]:
        """Get rate limits for a virtual key, applying defaults if not specified.

        Args:
            rpm_limit: Requests per minute limit. Uses default if None.
            tpm_limit: Tokens per minute limit. Uses default if None.

        Returns:
            Dictionary with 'rpm_limit' and 'tpm_limit' keys.
        """
        return {
            "rpm_limit": rpm_limit if rpm_limit is not None else self._default_rpm_limit,
            "tpm_limit": tpm_limit if tpm_limit is not None else self._default_tpm_limit,
        }

    def build_litellm_budget_enforcement_config(self) -> Dict[str, Any]:
        """Build the complete budget enforcement config for LiteLLM.

        Combines alert settings, hard limit settings, and rate limit
        defaults into a single configuration dictionary that can be
        merged into the general_settings section of config.yaml.

        LiteLLM budget enforcement behavior:
        - At alert_threshold (80%): sends Slack webhook notification
        - At hard_limit_threshold (100%): rejects requests with HTTP 429
        - Per-key rate limits: enforced via rpm_limit/tpm_limit on key creation
        - Retry-After header: included in all HTTP 429 responses

        Returns:
            Complete budget enforcement configuration dictionary.
        """
        config = self.build_general_settings_budget_config()

        # Add enforcement behavior settings
        config["enforce_budget"] = True
        config["budget_enforcement_action"] = "reject"
        config["retry_after_seconds"] = self._retry_after_seconds

        # Rate limit enforcement
        config["rate_limit_enforcement"] = {
            "enabled": True,
            "default_rpm_limit": self._default_rpm_limit,
            "default_tpm_limit": self._default_tpm_limit,
            "include_retry_after_header": True,
            "retry_after_seconds": self._retry_after_seconds,
        }

        logger.info(
            "Budget enforcement config: alert_threshold=%.0f%%, "
            "hard_limit=%.0f%%, enforce=True, "
            "default_rpm=%d, default_tpm=%d, retry_after=%ds",
            self._alert_threshold * 100,
            self._hard_limit_threshold * 100,
            self._default_rpm_limit,
            self._default_tpm_limit,
            self._retry_after_seconds,
        )

        return config
