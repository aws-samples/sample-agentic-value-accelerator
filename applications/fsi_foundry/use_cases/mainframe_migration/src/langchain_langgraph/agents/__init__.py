"""Mainframe Migration Specialist Agents (LangGraph)."""
try:
    from use_cases.mainframe_migration.agents.mainframe_analyzer import MainframeAnalyzer
    from use_cases.mainframe_migration.agents.business_rule_extractor import BusinessRuleExtractor
    from use_cases.mainframe_migration.agents.cloud_code_generator import CloudCodeGenerator
except ImportError:
    from .mainframe_analyzer import MainframeAnalyzer
    from .business_rule_extractor import BusinessRuleExtractor
    from .cloud_code_generator import CloudCodeGenerator

__all__ = ["MainframeAnalyzer", "BusinessRuleExtractor", "CloudCodeGenerator"]
