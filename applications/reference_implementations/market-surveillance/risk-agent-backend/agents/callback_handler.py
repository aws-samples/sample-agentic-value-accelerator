"""
Callback handler for Risk Analyst agent streaming events.
"""

import logging
from typing import Optional, Any, Dict
from queue import Queue
from contextvars import ContextVar

logger = logging.getLogger(__name__)

_event_queue_var: ContextVar[Optional[Queue]] = ContextVar('_event_queue', default=None)


def set_event_queue(queue: Optional[Queue]):
    """Set the event queue for the current async context."""
    _event_queue_var.set(queue)


def get_event_queue() -> Optional[Queue]:
    """Get the event queue for the current async context."""
    return _event_queue_var.get()


def emit_thinking_event(
    agent_name: str,
    event_type: str,
    message: str,
    metadata: Optional[Dict[str, Any]] = None
):
    """Emit a structured thinking event to the queue."""
    queue = get_event_queue()
    if queue:
        queue.put({
            "type": event_type,
            "agent": agent_name,
            "message": message,
            "metadata": metadata or {}
        })


def emit_image_event(base64_data: str, alt: str = "Chart"):
    """Emit a base64-encoded image event to the queue."""
    queue = get_event_queue()
    if queue:
        queue.put({
            "type": "image",
            "base64": base64_data,
            "alt": alt,
        })


class RiskAnalystCallbackHandler:
    """
    Callback handler for the Risk Analyst agent.
    Captures tool calls and SQL queries for audit trail streaming.
    """

    def __init__(self, agent_name: str = "Risk Analyst"):
        self.agent_name = agent_name
        self.last_tool = None

    def __call__(self, **kwargs: Any) -> None:
        current_tool_use = kwargs.get("current_tool_use", {})

        if current_tool_use and current_tool_use.get("name"):
            tool_name = current_tool_use.get("name")
            tool_input = current_tool_use.get("input", {})

            if tool_name == self.last_tool:
                return
            self.last_tool = tool_name

            metadata = {"tool_name": tool_name}

            # Capture SQL queries for audit trail
            if isinstance(tool_input, dict):
                if "sql_query" in tool_input:
                    metadata["sql_query"] = tool_input["sql_query"]
                if "table_name" in tool_input:
                    metadata["input_summary"] = f"Table: {tool_input['table_name']}"

            emit_thinking_event(
                agent_name=self.agent_name,
                event_type="tool_call",
                message=f"Using tool: {tool_name}",
                metadata=metadata
            )
