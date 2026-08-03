"""Logging helper with MCP request ID injection."""

import logging
from enum import Enum

logger = logging.getLogger("datalake-mcp")


class LogLevel(Enum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


def log_with_request_id(ctx, level: LogLevel, message: str) -> None:
    """Log a message with the MCP request ID for traceability."""
    request_id = getattr(ctx, "request_id", "unknown")
    log_message = f"[request_id={request_id}] {message}"

    if level == LogLevel.DEBUG:
        logger.debug(log_message)
    elif level == LogLevel.INFO:
        logger.info(log_message)
    elif level == LogLevel.WARNING:
        logger.warning(log_message)
    elif level == LogLevel.ERROR:
        logger.error(log_message)
