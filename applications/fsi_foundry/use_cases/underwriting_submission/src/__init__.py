"""
Underwriting Submission Triage Use Case.

Commercial insurance submission triage: risk appetite screening, exposure
analysis, and technical pricing indication, synthesised into a quote / refer /
decline decision.

The framework is selected via the AGENT_FRAMEWORK environment variable:
- strands: Uses the Strands agent framework implementation

Note: unlike the older use cases, this one ships a Strands implementation only.
There is no langchain_langgraph mirror in v1. The router still reads
AGENT_FRAMEWORK for consistency, but any value resolves to the Strands build.

The use case is automatically registered with the AVA registry on import.
"""

import os
from base.registry import register_agent, RegisteredAgent

# Get framework selection from environment
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "strands").lower()

# Only the Strands implementation exists in v1. The branch is kept so the file
# matches the platform convention and so a langchain_langgraph mirror can be
# added later without changing the router's shape.
if AGENT_FRAMEWORK == "langchain_langgraph":
    raise NotImplementedError(
        "underwriting_submission ships a Strands implementation only in v1; "
        "set AGENT_FRAMEWORK=strands (the default)."
    )

from strands.orchestrator import run_underwriting_triage
from strands.models import SubmissionRequest, SubmissionResponse

register_agent("underwriting_submission", RegisteredAgent(
    entry_point=run_underwriting_triage,
    request_model=SubmissionRequest,
    response_model=SubmissionResponse,
))

__all__ = [
    "run_underwriting_triage",
    "SubmissionRequest",
    "SubmissionResponse",
]
