"""Market Surveillance - Strands Implementation."""
from .orchestrator import SurveillanceOrchestrator, run_market_surveillance
from .models import SurveillanceRequest, SurveillanceResponse
from base.registry import register_agent, RegisteredAgent
register_agent("market_surveillance", RegisteredAgent(entry_point=run_market_surveillance, request_model=SurveillanceRequest, response_model=SurveillanceResponse))
__all__ = ["SurveillanceOrchestrator", "run_market_surveillance", "SurveillanceRequest", "SurveillanceResponse"]
