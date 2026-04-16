"""Call Summarization Specialist Agents."""
try:
    from use_cases.call_summarization.agents.key_point_extractor import KeyPointExtractor
    from use_cases.call_summarization.agents.summary_generator import SummaryGenerator
except ImportError:
    from .key_point_extractor import KeyPointExtractor
    from .summary_generator import SummaryGenerator
__all__ = ["KeyPointExtractor", "SummaryGenerator"]
