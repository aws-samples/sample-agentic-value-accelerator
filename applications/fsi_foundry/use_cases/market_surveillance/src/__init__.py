"""Market Surveillance Use Case."""
import os
from base.registry import register_agent, RegisteredAgent
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_market_surveillance
    from strands.models import SurveillanceRequest, SurveillanceResponse
else:
    from langchain_langgraph.orchestrator import run_market_surveillance
    from langchain_langgraph.models import SurveillanceRequest, SurveillanceResponse
register_agent("market_surveillance", RegisteredAgent(entry_point=run_market_surveillance, request_model=SurveillanceRequest, response_model=SurveillanceResponse))
__all__ = ["run_market_surveillance", "SurveillanceRequest", "SurveillanceResponse"]
