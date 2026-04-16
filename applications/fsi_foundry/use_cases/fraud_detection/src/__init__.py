"""
Fraud Detection Use Case.

AI-powered fraud detection with transaction monitoring, pattern analysis, and alert generation.
Supports multiple agent frameworks: LangGraph (default) and Strands.
"""

import os
from base.registry import register_agent, RegisteredAgent

AGENT_FRAMEWORK = os.getenv("AGENT_FRAMEWORK", "langchain_langgraph").lower()

if AGENT_FRAMEWORK == "strands":
    from strands.orchestrator import run_fraud_detection
    from strands.models import MonitoringRequest, MonitoringResponse
    register_agent("fraud_detection", RegisteredAgent(entry_point=run_fraud_detection, request_model=MonitoringRequest, response_model=MonitoringResponse))
else:
    from langchain_langgraph.orchestrator import run_fraud_detection
    from langchain_langgraph.models import MonitoringRequest, MonitoringResponse
    register_agent("fraud_detection", RegisteredAgent(entry_point=run_fraud_detection, request_model=MonitoringRequest, response_model=MonitoringResponse))

__all__ = ["run_fraud_detection", "MonitoringRequest", "MonitoringResponse"]
