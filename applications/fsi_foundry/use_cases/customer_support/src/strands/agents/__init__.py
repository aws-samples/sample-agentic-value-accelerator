"""
Customer Support Specialist Agents (Strands Implementation).

Agents for ticket classification, resolution, and escalation using Strands framework.
"""

from .ticket_classifier import TicketClassifier
from .resolution_agent import ResolutionAgent
from .escalation_agent import EscalationAgent

__all__ = ["TicketClassifier", "ResolutionAgent", "EscalationAgent"]
