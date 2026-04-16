"""Investment Advisory - Strands Implementation."""
from .orchestrator import InvestmentAdvisoryOrchestrator, run_investment_advisory
from .models import AdvisoryRequest, AdvisoryResponse
from base.registry import register_agent, RegisteredAgent
register_agent(name="investment_advisory", config=RegisteredAgent(entry_point=run_investment_advisory, request_model=AdvisoryRequest, response_model=AdvisoryResponse))
__all__ = ["InvestmentAdvisoryOrchestrator", "run_investment_advisory", "AdvisoryRequest", "AdvisoryResponse"]
