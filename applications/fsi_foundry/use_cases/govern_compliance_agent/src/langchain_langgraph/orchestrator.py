"""Govern Compliance Agent Orchestrator.

Coordinates policy auditing, security scanning, drift detection, and remediation.
"""

import json
import uuid
from datetime import datetime
from typing import TypedDict, Annotated, Literal

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field

from base.langgraph import LangGraphOrchestrator
from .agents import (
    PolicyAuditor,
    SecurityScanner,
    DriftDetector,
    RemediationPlanner,
)
from .agents.policy_auditor import audit_policies
from .agents.security_scanner import scan_security
from .agents.drift_detector import detect_drift
from .agents.remediation_planner import plan_remediation
from .models import (
    ComplianceAuditRequest,
    ComplianceAuditResponse,
    Violation,
    ViolationSeverity,
    ViolationCategory,
)


class ComplianceSynthesisSchema(BaseModel):
    """Structured synthesis for compliance audit."""
    audit_status: str = Field(default="completed", description="Status: in_progress, completed, escalated")
    total_violations: int = Field(default=0, description="Total violations found")
    critical_count: int = Field(default=0, description="Critical severity violations")
    high_count: int = Field(default=0, description="High severity violations")
    medium_count: int = Field(default=0, description="Medium severity violations")
    low_count: int = Field(default=0, description="Low severity violations")
    key_findings: list[str] = Field(default_factory=list, description="Key compliance findings")
    recommended_actions: list[str] = Field(default_factory=list, description="Recommended remediation actions")
    actions_taken: list[str] = Field(default_factory=list, description="Actions already executed")
    summary: str = Field(..., description="Executive summary of the compliance audit")


class GovernComplianceState(TypedDict):
    messages: Annotated[list, add_messages]
    audit_id: str
    scope: str
    include_remediation: bool
    auto_remediate: bool

    # Results from sub-agents
    policy_audit_result: dict | None
    security_scan_result: dict | None
    drift_detection_result: dict | None
    remediation_plan_result: dict | None

    # Final output
    final_summary: str | None


class GovernComplianceOrchestrator(LangGraphOrchestrator):
    name = "govern_compliance_orchestrator"
    state_schema = GovernComplianceState

    system_prompt = """You are the Govern Compliance Agent Supervisor.

Your role is to:
1. Coordinate specialist agents (Policy Auditor, Security Scanner, Drift Detector, Remediation Planner)
2. Synthesize their findings into a comprehensive compliance report
3. Ensure all violations are properly classified and remediation is planned
4. Execute approved remediation actions within autonomy bounds

When creating the final summary, consider:
- Severity of violations (CRITICAL requires immediate attention)
- Compliance impact (regulatory, security, operational)
- Remediation priority and feasibility
- Actions already taken vs pending approval

CRITICAL violations should be flagged prominently.
HIGH violations should have remediation plans assigned.
MEDIUM/LOW violations should be tracked for resolution.

Provide actionable recommendations, not just findings."""

    def __init__(self):
        super().__init__(agents={
            "policy_auditor": PolicyAuditor(),
            "security_scanner": SecurityScanner(),
            "drift_detector": DriftDetector(),
            "remediation_planner": RemediationPlanner(),
        })

    def build_graph(self) -> StateGraph:
        workflow = StateGraph(GovernComplianceState)

        # Add nodes for each phase
        workflow.add_node("audit_phase", self._audit_phase_node)
        workflow.add_node("remediation_phase", self._remediation_phase_node)
        workflow.add_node("synthesize", self._synthesize_node)

        # Entry point
        workflow.set_entry_point("audit_phase")

        # Conditional routing: if remediation requested, go to remediation phase
        workflow.add_conditional_edges(
            "audit_phase",
            self._should_remediate,
            {
                "remediate": "remediation_phase",
                "synthesize": "synthesize",
            }
        )
        workflow.add_edge("remediation_phase", "synthesize")
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _should_remediate(self, state: GovernComplianceState) -> Literal["remediate", "synthesize"]:
        """Decide whether to run remediation phase."""
        if state.get("include_remediation", True):
            # Check if there are violations to remediate
            policy_result = state.get("policy_audit_result", {})
            security_result = state.get("security_scan_result", {})
            drift_result = state.get("drift_detection_result", {})

            # Simple heuristic: if any analysis mentions violations/findings, plan remediation
            combined = json.dumps([policy_result, security_result, drift_result])
            has_issues = any(kw in combined.lower() for kw in [
                "violation", "critical", "missing", "overdue", "finding", "error"
            ])
            return "remediate" if has_issues else "synthesize"
        return "synthesize"

    async def _audit_phase_node(self, state: GovernComplianceState):
        """Run all audit agents in parallel."""
        import asyncio

        scope = state.get("scope", "all")

        # Determine which audits to run based on scope
        tasks = []
        if scope in ("all", "agents", "policy"):
            tasks.append(("policy", audit_policies()))
        if scope in ("all", "security"):
            tasks.append(("security", scan_security()))
        if scope in ("all", "drift"):
            tasks.append(("drift", detect_drift()))

        # Run in parallel
        results = await asyncio.gather(*[t[1] for t in tasks], return_exceptions=True)

        # Map results back
        new_state = {**state}
        messages = list(state.get("messages", []))

        for (name, _), result in zip(tasks, results):
            if isinstance(result, Exception):
                result = {"agent": name, "error": str(result)}

            if name == "policy":
                new_state["policy_audit_result"] = result
                messages.append(AIMessage(content=f"Policy Audit: {json.dumps(result, indent=2)[:2000]}"))
            elif name == "security":
                new_state["security_scan_result"] = result
                messages.append(AIMessage(content=f"Security Scan: {json.dumps(result, indent=2)[:2000]}"))
            elif name == "drift":
                new_state["drift_detection_result"] = result
                messages.append(AIMessage(content=f"Drift Detection: {json.dumps(result, indent=2)[:2000]}"))

        new_state["messages"] = messages
        return new_state

    async def _remediation_phase_node(self, state: GovernComplianceState):
        """Run remediation planning based on audit findings."""
        # Extract violations from audit results
        violations = []

        # Parse policy audit for violations
        policy_result = state.get("policy_audit_result", {})
        if policy_result:
            # Simple extraction - in production would be more structured
            analysis = policy_result.get("analysis", "")
            if "missing guardrail" in analysis.lower():
                violations.append({
                    "severity": "CRITICAL",
                    "title": "Agent missing guardrail",
                    "resource_id": "detected-in-policy-audit",
                })

        # Parse security scan for violations
        security_result = state.get("security_scan_result", {})
        if security_result:
            analysis = security_result.get("analysis", "")
            if "critical" in analysis.lower():
                violations.append({
                    "severity": "CRITICAL",
                    "title": "Critical security finding",
                    "resource_id": "detected-in-security-scan",
                })

        # Parse drift detection for violations
        drift_result = state.get("drift_detection_result", {})
        if drift_result:
            analysis = drift_result.get("analysis", "")
            if "overdue" in analysis.lower():
                violations.append({
                    "severity": "HIGH",
                    "title": "Revalidation overdue",
                    "resource_id": "detected-in-drift-detection",
                })

        # Plan remediation
        auto_execute = state.get("auto_remediate", False)
        remediation_result = await plan_remediation(
            violations=violations,
            auto_execute=auto_execute,
        )

        messages = list(state.get("messages", []))
        messages.append(AIMessage(content=f"Remediation Plan: {json.dumps(remediation_result, indent=2)[:2000]}"))

        return {
            **state,
            "remediation_plan_result": remediation_result,
            "messages": messages,
        }

    async def _synthesize_node(self, state: GovernComplianceState):
        """Synthesize all findings into a final report."""
        sections = []

        for key, val in state.items():
            if val is not None and key.endswith("_result"):
                if isinstance(val, dict):
                    sections.append(f"## {key.replace('_', ' ').title()}\n{json.dumps(val, indent=2)[:1500]}")

        prompt = f"""Based on the following compliance audit results, produce a structured synthesis.

{chr(10).join(sections)}

Create an executive summary that:
1. Highlights CRITICAL and HIGH severity issues first
2. Counts violations by severity
3. Lists key findings (max 5)
4. Recommends specific actions
5. Notes any actions already taken

Be concise but comprehensive."""

        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(ComplianceSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog
            structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}

        return {
            **state,
            "final_summary": json.dumps(structured),
            "messages": state["messages"] + [AIMessage(content=f"Final Report: {json.dumps(structured)}")],
        }


async def run_compliance_audit(request: ComplianceAuditRequest) -> ComplianceAuditResponse:
    """Run a full compliance audit.

    Args:
        request: Audit configuration (scope, remediation options, etc.)

    Returns:
        ComplianceAuditResponse with findings and remediation plan
    """
    orchestrator = GovernComplianceOrchestrator()
    audit_id = str(uuid.uuid4())[:8]

    initial_state: GovernComplianceState = {
        "messages": [HumanMessage(content=f"Begin compliance audit (scope: {request.scope})")],
        "audit_id": audit_id,
        "scope": request.scope,
        "include_remediation": request.include_remediation,
        "auto_remediate": request.auto_remediate,
        "policy_audit_result": None,
        "security_scan_result": None,
        "drift_detection_result": None,
        "remediation_plan_result": None,
        "final_summary": None,
    }

    final_state = await orchestrator.arun(initial_state)

    # Parse the structured summary
    summary_data = {}
    try:
        summary_data = json.loads(final_state.get("final_summary", "{}"))
    except Exception:
        summary_data = {"summary": str(final_state.get("final_summary", "Audit completed"))}

    return ComplianceAuditResponse(
        audit_id=audit_id,
        scope=request.scope,
        started_at=datetime.utcnow(),
        completed_at=datetime.utcnow(),
        violations_found=summary_data.get("total_violations", 0),
        critical_count=summary_data.get("critical_count", 0),
        high_count=summary_data.get("high_count", 0),
        medium_count=summary_data.get("medium_count", 0),
        low_count=summary_data.get("low_count", 0),
        summary=summary_data.get("summary", ""),
        recommendations=summary_data.get("recommended_actions", []),
        sources=["policy_auditor", "security_scanner", "drift_detector"],
        live=True,
    )
