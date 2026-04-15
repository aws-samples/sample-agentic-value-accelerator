"""
Claims Management Specialist Agents.

Agents for claims intake, damage assessment, and settlement recommendation.
"""

try:
    from use_cases.claims_management.agents.claims_intake_agent import ClaimsIntakeAgent
    from use_cases.claims_management.agents.damage_assessor import DamageAssessor
    from use_cases.claims_management.agents.settlement_recommender import SettlementRecommender
except ImportError:
    from .claims_intake_agent import ClaimsIntakeAgent
    from .damage_assessor import DamageAssessor
    from .settlement_recommender import SettlementRecommender

__all__ = ["ClaimsIntakeAgent", "DamageAssessor", "SettlementRecommender"]
