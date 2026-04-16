"""Document Processing - LangGraph Implementation."""
from .orchestrator import DocumentProcessingOrchestrator, run_document_processing
from .models import ProcessingRequest, ProcessingResponse
from base.registry import register_agent, RegisteredAgent
register_agent(name="document_processing", config=RegisteredAgent(
    entry_point=run_document_processing, request_model=ProcessingRequest, response_model=ProcessingResponse))
__all__ = ["DocumentProcessingOrchestrator", "run_document_processing", "ProcessingRequest", "ProcessingResponse"]
