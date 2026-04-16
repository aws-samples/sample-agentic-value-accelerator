"""Document Processing Use Case.

Document classification, data extraction, and validation for compliance.
Supports LangGraph (default) and Strands frameworks.
"""
import os
from base.registry import register_agent, RegisteredAgent
AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()
if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_document_processing
    from strands.models import ProcessingRequest, ProcessingResponse
    register_agent("document_processing", RegisteredAgent(entry_point=run_document_processing, request_model=ProcessingRequest, response_model=ProcessingResponse))
else:
    from langchain_langgraph.orchestrator import run_document_processing
    from langchain_langgraph.models import ProcessingRequest, ProcessingResponse
    register_agent("document_processing", RegisteredAgent(entry_point=run_document_processing, request_model=ProcessingRequest, response_model=ProcessingResponse))
__all__ = ["run_document_processing", "ProcessingRequest", "ProcessingResponse"]
