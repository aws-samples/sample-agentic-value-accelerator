"""Regulatory Report Reviewer Use Case - Strands Implementation."""

from .orchestrator import RegulatoryReportReviewerOrchestrator, run_regulatory_review
from .models import ReviewRequest, ReviewResponse
from base.registry import register_agent, RegisteredAgent

register_agent(name="regulatory_report_reviewer", config=RegisteredAgent(entry_point=run_regulatory_review, request_model=ReviewRequest, response_model=ReviewResponse))

__all__ = ["RegulatoryReportReviewerOrchestrator", "run_regulatory_review", "ReviewRequest", "ReviewResponse"]
