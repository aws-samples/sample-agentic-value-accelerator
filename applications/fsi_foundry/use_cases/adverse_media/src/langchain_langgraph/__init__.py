"""
Adverse Media Use Case.

Adverse media screening using LangChain/LangGraph implementation.
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

__all__ = ["AdverseMediaOrchestrator", "ScreeningRequest", "ScreeningResponse", "run_adverse_media"]
