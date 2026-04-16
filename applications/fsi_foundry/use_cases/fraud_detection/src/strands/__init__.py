"""Fraud Detection Use Case - Strands Implementation."""

from .orchestrator import FraudDetectionOrchestrator, run_fraud_detection
from .models import MonitoringRequest, MonitoringResponse
from base.registry import register_agent, RegisteredAgent

register_agent(name="fraud_detection", config=RegisteredAgent(entry_point=run_fraud_detection, request_model=MonitoringRequest, response_model=MonitoringResponse))

__all__ = ["FraudDetectionOrchestrator", "run_fraud_detection", "MonitoringRequest", "MonitoringResponse"]
