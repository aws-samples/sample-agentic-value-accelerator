"""Post Call Analytics Use Case. Dual-framework support via AGENT_FRAMEWORK env var."""
import os
from base.registry import register_agent, RegisteredAgent
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_post_call_analytics
    from strands.models import PostCallRequest, PostCallResponse
else:
    from langchain_langgraph.orchestrator import run_post_call_analytics
    from langchain_langgraph.models import PostCallRequest, PostCallResponse
register_agent("post_call_analytics", RegisteredAgent(entry_point=run_post_call_analytics, request_model=PostCallRequest, response_model=PostCallResponse))
__all__ = ["run_post_call_analytics", "PostCallRequest", "PostCallResponse"]
