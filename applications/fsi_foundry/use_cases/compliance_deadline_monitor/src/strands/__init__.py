"""Compliance Deadline Monitor Use Case - Strands Implementation."""

from .orchestrator import ComplianceDeadlineMonitorOrchestrator, run_compliance_deadline_monitor
from .models import MonitorRequest, MonitorResponse
from base.registry import register_agent, RegisteredAgent

register_agent(name="compliance_deadline_monitor", config=RegisteredAgent(entry_point=run_compliance_deadline_monitor, request_model=MonitorRequest, response_model=MonitorResponse))

__all__ = ["ComplianceDeadlineMonitorOrchestrator", "run_compliance_deadline_monitor", "MonitorRequest", "MonitorResponse"]
