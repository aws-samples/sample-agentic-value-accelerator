# SPDX-License-Identifier: Apache-2.0
"""
Logging Utilities Module.

Provides structured logging configuration using structlog.
Supports both development (console) and production (JSON) output formats.
"""

import logging
import sys
from typing import Optional

import structlog


def configure_logging(
    level: str = "INFO",
    json_format: bool = False,
    log_file: Optional[str] = None
) -> None:
    """
    Configure structured logging for the application.
    
    Sets up structlog with appropriate processors for either development
    (colored console output) or production (JSON format) environments.
    
    Args:
        level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        json_format: If True, output logs in JSON format for production
        log_file: Optional file path to write logs to
        
    Usage:
        # Development mode with colored console output
        configure_logging(level="DEBUG")
        
        # Production mode with JSON output
        configure_logging(level="INFO", json_format=True)
    """
    # Set up standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, level.upper()),
    )
    
    # Common processors for all environments
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]
    
    if json_format:
        # Production: JSON format for log aggregation
        processors = shared_processors + [
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ]
    else:
        # Development: Colored console output
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True),
        ]
    
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper())
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.BoundLogger:
    """
    Get a structured logger instance.
    
    Returns a bound logger that can be used for structured logging
    with automatic context binding.
    
    Args:
        name: Logger name, typically __name__ of the calling module
        
    Returns:
        Configured structlog BoundLogger instance
        
    Usage:
        logger = get_logger(__name__)
        logger.info("request_received", customer_id="CUST001", action="assess")
        logger.error("request_failed", error="Connection timeout")
    """
    return structlog.get_logger(name)
