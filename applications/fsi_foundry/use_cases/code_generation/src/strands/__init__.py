"""Code Generation Use Case - Strands Implementation."""
from .orchestrator import CodeGenerationOrchestrator, run_code_generation
from .models import GenerationRequest, GenerationResponse
from base.registry import register_agent, RegisteredAgent
register_agent(name="code_generation", config=RegisteredAgent(entry_point=run_code_generation, request_model=GenerationRequest, response_model=GenerationResponse))
__all__ = ["CodeGenerationOrchestrator", "run_code_generation", "GenerationRequest", "GenerationResponse"]
