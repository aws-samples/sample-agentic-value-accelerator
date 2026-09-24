"""Harness Kill-Switch — Emergency governance control for AI harnesses.

Provides a multi-source kill-switch mechanism to immediately disable AI harness
operations across the platform. The kill-switch checks multiple sources in order
of precedence:

1. Environment variable: AVA_HARNESS_DISABLED=1
2. Sentinel file: .ava-harness-disabled in working directory
3. DynamoDB flag: harness_killswitch table (optional, graceful if unavailable)

This enables emergency shutdown via:
- Ops: Set env var in container orchestration
- Local dev: Create sentinel file
- Runtime: Toggle via API (admin only)

Usage:
    from core.harness_killswitch import is_harness_disabled, require_harness_enabled

    # Direct check
    if is_harness_disabled():
        return {"disabled": True, "reason": "Emergency kill-switch active"}

    # Decorator for routes
    @require_harness_enabled
    async def discover_harnesses():
        ...
"""

import functools
import logging
import os
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional, TypeVar

import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException

from core.config import settings

logger = logging.getLogger(__name__)

# DynamoDB table name for kill-switch state
KILLSWITCH_TABLE_NAME = os.getenv("GOVERN_KILLSWITCH_TABLE_NAME", "fsi-control-plane-harness-killswitch")

# Sentinel file name
SENTINEL_FILE = ".ava-harness-disabled"


class KillswitchSource(str, Enum):
    """Source that triggered the kill-switch."""
    ENV_VAR = "env_var"
    SENTINEL_FILE = "sentinel_file"
    DYNAMODB = "dynamodb"
    NONE = "none"


class KillswitchStatus:
    """Kill-switch status with details on which source triggered it."""

    def __init__(
        self,
        disabled: bool,
        source: KillswitchSource = KillswitchSource.NONE,
        reason: Optional[str] = None,
        disabled_at: Optional[datetime] = None,
        disabled_by: Optional[str] = None,
    ):
        self.disabled = disabled
        self.source = source
        self.reason = reason
        self.disabled_at = disabled_at
        self.disabled_by = disabled_by

    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "disabled": self.disabled,
            "source": self.source.value,
            "reason": self.reason,
            "disabled_at": self.disabled_at.isoformat() if self.disabled_at else None,
            "disabled_by": self.disabled_by,
        }


def _check_env_var() -> Optional[KillswitchStatus]:
    """Check if kill-switch is enabled via environment variable."""
    val = os.getenv("AVA_HARNESS_DISABLED", "").strip()
    if val in ("1", "true", "yes", "on"):
        return KillswitchStatus(
            disabled=True,
            source=KillswitchSource.ENV_VAR,
            reason="AVA_HARNESS_DISABLED environment variable is set",
        )
    return None


def _check_sentinel_file() -> Optional[KillswitchStatus]:
    """Check if kill-switch is enabled via sentinel file."""
    sentinel_path = Path.cwd() / SENTINEL_FILE
    if sentinel_path.exists():
        try:
            # Read reason from file if present
            content = sentinel_path.read_text().strip()
            mtime = datetime.fromtimestamp(sentinel_path.stat().st_mtime, tz=timezone.utc)
            return KillswitchStatus(
                disabled=True,
                source=KillswitchSource.SENTINEL_FILE,
                reason=content if content else "Sentinel file present",
                disabled_at=mtime,
            )
        except Exception as e:
            logger.debug(f"Error reading sentinel file: {e}")
            return KillswitchStatus(
                disabled=True,
                source=KillswitchSource.SENTINEL_FILE,
                reason="Sentinel file present (unreadable)",
            )
    return None


def _check_dynamodb() -> Optional[KillswitchStatus]:
    """Check if kill-switch is enabled via DynamoDB flag.

    Gracefully returns None if the table doesn't exist or is inaccessible.
    """
    try:
        ddb = boto3.resource("dynamodb", region_name=settings.AWS_REGION)
        table = ddb.Table(KILLSWITCH_TABLE_NAME)

        response = table.get_item(Key={"pk": "killswitch", "sk": "harness"})
        item = response.get("Item")

        if item and item.get("disabled"):
            disabled_at = None
            if item.get("disabled_at"):
                try:
                    disabled_at = datetime.fromisoformat(item["disabled_at"].replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass

            return KillswitchStatus(
                disabled=True,
                source=KillswitchSource.DYNAMODB,
                reason=item.get("reason", "Kill-switch enabled via admin API"),
                disabled_at=disabled_at,
                disabled_by=item.get("disabled_by"),
            )
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code == "ResourceNotFoundException":
            logger.debug(f"Kill-switch table {KILLSWITCH_TABLE_NAME} does not exist")
        else:
            logger.warning(f"DynamoDB kill-switch check failed: {e}")
    except Exception as e:
        logger.warning(f"DynamoDB kill-switch check failed: {e}")

    return None


def probe_killswitch_table() -> tuple[bool, str]:
    """Report whether the DynamoDB kill-switch source is actually provisioned.

    Returns (reachable, detail).

    This exists because `get_killswitch_status()` structurally cannot answer the
    question. `_check_dynamodb()` returns None for BOTH "the table is absent or
    denied" and "the table is present and the flag is off", and the status object it
    feeds only carries `source == DYNAMODB` when the kill-switch is currently
    TRIGGERED via DynamoDB. So the only way to learn that the runtime toggle exists
    is to look for it.

    The posture score's kill-switch dimension used to infer availability as
    `status.source == DYNAMODB or not status.disabled`. In normal operation
    `status.disabled` is False, so that expression is unconditionally True and the
    dimension awarded itself 40 of 100 points for a check it had not performed -
    with the finding text "DynamoDB kill-switch source is available". Measured on
    the reference account, `fsi-control-plane-harness-killswitch` does not exist in
    either us-east-1 or us-east-2, so that claim was simply false. It also
    double-counted `not status.disabled`, which is scored again as the
    `current_state` check.

    A missing table is reported as not reachable rather than raising: the runtime
    toggle being unprovisioned is a real, scoreable governance finding, not an
    error. An access or throttling failure is also reported as not reachable, but
    with a detail that names the distinction, because "we are not allowed to look"
    must not be presented as "it is not there".
    """
    try:
        ddb = boto3.resource("dynamodb", region_name=settings.AWS_REGION)
        ddb.Table(KILLSWITCH_TABLE_NAME).get_item(Key={"pk": "killswitch", "sk": "harness"})
        return True, (
            f"DynamoDB kill-switch table '{KILLSWITCH_TABLE_NAME}' is readable in "
            f"{settings.AWS_REGION}, so the kill-switch can be toggled at runtime via the "
            "admin API"
        )
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code == "ResourceNotFoundException":
            return False, (
                f"DynamoDB kill-switch table '{KILLSWITCH_TABLE_NAME}' does not exist in "
                f"{settings.AWS_REGION} — the runtime (admin API) kill-switch is not "
                "provisioned. The env var and sentinel file mechanisms still work."
            )
        return False, (
            f"DynamoDB kill-switch table '{KILLSWITCH_TABLE_NAME}' could not be read in "
            f"{settings.AWS_REGION}: {error_code or 'ClientError'}. This is not the same as "
            "the table being absent — it may exist but be denied or throttled."
        )
    except Exception as e:  # noqa: BLE001 - reachability probe must never break the caller
        return False, (
            f"DynamoDB kill-switch table '{KILLSWITCH_TABLE_NAME}' could not be read in "
            f"{settings.AWS_REGION}: {type(e).__name__}. Reachability is unknown, so the "
            "runtime kill-switch is not counted as available."
        )


def get_killswitch_status() -> KillswitchStatus:
    """Get detailed kill-switch status from all sources.

    Checks sources in order of precedence:
    1. Environment variable (highest priority - ops override)
    2. Sentinel file (local override)
    3. DynamoDB flag (runtime toggle)

    Returns:
        KillswitchStatus with disabled=True if any source triggers the kill-switch.
    """
    # Check env var first (highest priority)
    status = _check_env_var()
    if status:
        return status

    # Check sentinel file
    status = _check_sentinel_file()
    if status:
        return status

    # Check DynamoDB
    status = _check_dynamodb()
    if status:
        return status

    # No kill-switch active
    return KillswitchStatus(disabled=False)


def is_harness_disabled() -> bool:
    """Quick check if harness operations are disabled.

    Returns:
        True if any kill-switch source has disabled harness operations.
    """
    return get_killswitch_status().disabled


def set_killswitch_dynamodb(
    disabled: bool,
    reason: Optional[str] = None,
    disabled_by: Optional[str] = None,
) -> KillswitchStatus:
    """Set the DynamoDB kill-switch state.

    This is the only source that can be toggled via API. Env var and sentinel
    file require infrastructure/ops access.

    Args:
        disabled: True to enable kill-switch (disable harnesses), False to disable it.
        reason: Optional reason for the change.
        disabled_by: Optional identifier for who made the change.

    Returns:
        Current KillswitchStatus after the change.

    Raises:
        RuntimeError: If DynamoDB operation fails.
    """
    try:
        ddb = boto3.resource("dynamodb", region_name=settings.AWS_REGION)
        table = ddb.Table(KILLSWITCH_TABLE_NAME)

        now = datetime.now(timezone.utc)

        if disabled:
            item = {
                "pk": "killswitch",
                "sk": "harness",
                "disabled": True,
                "reason": reason or "Kill-switch enabled via admin API",
                "disabled_at": now.isoformat(),
                "disabled_by": disabled_by or "unknown",
            }
            table.put_item(Item=item)
            logger.warning(f"Harness kill-switch ENABLED by {disabled_by}: {reason}")
        else:
            # Don't delete - update to preserve audit trail
            item = {
                "pk": "killswitch",
                "sk": "harness",
                "disabled": False,
                "reason": reason or "Kill-switch disabled via admin API",
                "disabled_at": now.isoformat(),
                "disabled_by": disabled_by or "unknown",
            }
            table.put_item(Item=item)
            logger.warning(f"Harness kill-switch DISABLED by {disabled_by}: {reason}")

        return get_killswitch_status()

    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code == "ResourceNotFoundException":
            raise RuntimeError(
                f"Kill-switch table {KILLSWITCH_TABLE_NAME} does not exist. "
                "Create the table or set kill-switch via env var or sentinel file."
            )
        raise RuntimeError(f"DynamoDB operation failed: {e}")
    except Exception as e:
        raise RuntimeError(f"Failed to set kill-switch: {e}")


# Type variable for decorated functions
F = TypeVar("F", bound=Callable[..., Any])


def require_harness_enabled(func: F) -> F:
    """Decorator that raises 503 if harness kill-switch is active.

    Use this on route handlers that perform harness operations.

    Example:
        @router.get("/harnesses")
        @require_harness_enabled
        async def discover_harnesses():
            ...

    Raises:
        HTTPException: 503 Service Unavailable if kill-switch is active.
    """
    @functools.wraps(func)
    async def async_wrapper(*args, **kwargs):
        status = get_killswitch_status()
        if status.disabled:
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "Harness operations temporarily disabled",
                    "reason": status.reason,
                    "source": status.source.value,
                    "disabled_at": status.disabled_at.isoformat() if status.disabled_at else None,
                },
            )
        return await func(*args, **kwargs)

    @functools.wraps(func)
    def sync_wrapper(*args, **kwargs):
        status = get_killswitch_status()
        if status.disabled:
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "Harness operations temporarily disabled",
                    "reason": status.reason,
                    "source": status.source.value,
                    "disabled_at": status.disabled_at.isoformat() if status.disabled_at else None,
                },
            )
        return func(*args, **kwargs)

    # Return appropriate wrapper based on whether function is async
    import asyncio
    if asyncio.iscoroutinefunction(func):
        return async_wrapper  # type: ignore
    return sync_wrapper  # type: ignore
