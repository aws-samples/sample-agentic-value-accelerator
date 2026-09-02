"""
Underwriting Submission Triage Use Case - Strands Implementation.

Commercial insurance submission triage using the Strands agent framework.
The use case is automatically registered with the AVA registry on import.
"""

from .orchestrator import UnderwritingOrchestrator, run_underwriting_triage
from .models import SubmissionRequest, SubmissionResponse

# Register this use case with the platform registry
from base.registry import register_agent, RegisteredAgent

register_agent(
    name="underwriting_submission",
    config=RegisteredAgent(
        entry_point=run_underwriting_triage,
        request_model=SubmissionRequest,
        response_model=SubmissionResponse,
    )
)

__all__ = [
    "UnderwritingOrchestrator",
    "run_underwriting_triage",
    "SubmissionRequest",
    "SubmissionResponse",
]
