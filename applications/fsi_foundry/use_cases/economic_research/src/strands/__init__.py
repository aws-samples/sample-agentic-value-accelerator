"""Economic Research - Strands."""
from .orchestrator import EconomicResearchOrchestrator, run_economic_research
from .models import ResearchRequest, ResearchResponse
from base.registry import register_agent, RegisteredAgent
register_agent(name="economic_research", config=RegisteredAgent(entry_point=run_economic_research, request_model=ResearchRequest, response_model=ResearchResponse))
__all__ = ["EconomicResearchOrchestrator", "run_economic_research", "ResearchRequest", "ResearchResponse"]
