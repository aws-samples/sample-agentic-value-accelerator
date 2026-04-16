"""Code Generation Use Case. Dual-framework support via AGENT_FRAMEWORK env var."""
import os
from base.registry import register_agent, RegisteredAgent
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_code_generation
    from strands.models import GenerationRequest, GenerationResponse
else:
    from langchain_langgraph.orchestrator import run_code_generation
    from langchain_langgraph.models import GenerationRequest, GenerationResponse
register_agent("code_generation", RegisteredAgent(entry_point=run_code_generation, request_model=GenerationRequest, response_model=GenerationResponse))
__all__ = ["run_code_generation", "GenerationRequest", "GenerationResponse"]
