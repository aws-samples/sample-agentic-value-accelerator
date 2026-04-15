"""
Adverse Media Use Case - Strands Implementation.

Adverse media screening using the Strands agent framework.
"""

from .orchestrator import AdverseMediaOrchestrator, run_adverse_media
from .models import ScreeningRequest, ScreeningResponse

from base.registry import register_agent, RegisteredAgent

register_agent(
    name="adverse_media",
    config=RegisteredAgent(
        entry_point=run_adverse_media,
        request_model=ScreeningRequest,
        response_model=ScreeningResponse,
    )
)

__all__ = [
    "AdverseMediaOrchestrator",
    "run_adverse_media",
    "ScreeningRequest",
    "ScreeningResponse",
]
