"""Email Triage Use Case - Strands Implementation."""
from .orchestrator import EmailTriageOrchestrator, run_email_triage
from .models import TriageRequest, TriageResponse
from base.registry import register_agent, RegisteredAgent
register_agent(name="email_triage", config=RegisteredAgent(entry_point=run_email_triage, request_model=TriageRequest, response_model=TriageResponse))
__all__ = ["EmailTriageOrchestrator", "run_email_triage", "TriageRequest", "TriageResponse"]
