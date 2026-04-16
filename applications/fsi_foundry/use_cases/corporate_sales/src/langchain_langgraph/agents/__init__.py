"""
Corporate Sales Specialist Agents.

Agents for lead scoring, opportunity analysis, and pitch preparation.
"""

from use_cases.corporate_sales.agents.lead_scorer import LeadScorer
from use_cases.corporate_sales.agents.opportunity_analyst import OpportunityAnalyst
from use_cases.corporate_sales.agents.pitch_preparer import PitchPreparer

__all__ = ["LeadScorer", "OpportunityAnalyst", "PitchPreparer"]
