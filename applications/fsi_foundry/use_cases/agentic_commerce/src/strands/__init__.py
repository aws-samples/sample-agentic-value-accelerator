"""Agentic Commerce - Strands Implementation."""
from .orchestrator import CommerceOrchestrator, run_agentic_commerce
from .models import CommerceRequest, CommerceResponse
from base.registry import register_agent, RegisteredAgent
register_agent("agentic_commerce", RegisteredAgent(entry_point=run_agentic_commerce, request_model=CommerceRequest, response_model=CommerceResponse))
__all__ = ["CommerceOrchestrator", "run_agentic_commerce", "CommerceRequest", "CommerceResponse"]
