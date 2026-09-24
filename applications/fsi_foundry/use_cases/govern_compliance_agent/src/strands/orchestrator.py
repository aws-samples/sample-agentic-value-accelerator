"""Govern Compliance Orchestrator (Strands Implementation)."""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import PolicyAuditor, SecurityScanner, DriftDetector, RemediationPlanner
from .agents.policy_auditor import audit_policies
from .agents.security_scanner import scan_security
from .agents.drift_detector import detect_drift
from .agents.remediation_planner import plan_remediation
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    ComplianceAuditRequest, ComplianceAuditResponse, AuditScope,
    Violation, RemediationAction, Severity, ViolationType,
)


class GovernComplianceOrchestrator(StrandsOrchestrator):
    name = "govern_compliance_orchestrator"
    system_prompt = """You are a Senior Compliance Officer for AI Governance.

Your role is to:
1. Coordinate specialist agents (Policy Auditor, Security Scanner, Drift Detector, Remediation Planner)
2. Synthesize their findings into a comprehensive compliance assessment
3. Ensure violations are detected, prioritized, and remediated appropriately

When creating the final summary, consider:
- Overall compliance score based on all agent findings
- Critical violations requiring immediate attention
- Security findings with potential impact
- Drift indicators suggesting model degradation
- Remediation actions with their approval status

Be precise and evidence-based. Your assessment will be used by security teams and compliance officers."""

    def __init__(self):
        super().__init__(agents={
            "policy_auditor": PolicyAuditor(),
            "security_scanner": SecurityScanner(),
            "drift_detector": DriftDetector(),
            "remediation_planner": RemediationPlanner(),
        })

    def run_audit(
        self,
        scope: str = "all",
        include_remediation: bool = True,
        auto_remediate: bool = False,
        dry_run: bool = True,
        context: str | None = None
    ) -> Dict[str, Any]:
        """Run synchronous compliance audit."""
        policy_result = security_result = drift_result = remediation_result = None
        input_text = self._build_input_text(scope, context)

        if scope in ("all", "agents"):
            results = self.run_parallel(["policy_auditor", "security_scanner", "drift_detector"], input_text)
            policy_result = {"agent": "policy_auditor", "scope": scope, "analysis": results["policy_auditor"].output}
            security_result = {"agent": "security_scanner", "scope": scope, "analysis": results["security_scanner"].output}
            drift_result = {"agent": "drift_detector", "scope": scope, "analysis": results["drift_detector"].output}
        elif scope == "security":
            r = self.run_agent("security_scanner", input_text)
            security_result = {"agent": "security_scanner", "scope": scope, "analysis": r.output}
        elif scope == "drift":
            r = self.run_agent("drift_detector", input_text)
            drift_result = {"agent": "drift_detector", "scope": scope, "analysis": r.output}
        else:
            r = self.run_agent("policy_auditor", input_text)
            policy_result = {"agent": "policy_auditor", "scope": scope, "analysis": r.output}

        # Run remediation planner if requested
        if include_remediation:
            violations = self._extract_violations(policy_result, security_result, drift_result)
            if violations:
                remediation_input = f"""Plan remediation for findings:
{json.dumps(violations[:20], indent=2)}

Settings: auto_remediate={auto_remediate}, dry_run={dry_run}"""
                r = self.run_agent("remediation_planner", remediation_input)
                remediation_result = {"agent": "remediation_planner", "analysis": r.output}

        summary = self.synthesize({}, self._build_synthesis_prompt(
            policy_result, security_result, drift_result, remediation_result
        ))

        return {
            "scope": scope,
            "policy_result": policy_result,
            "security_result": security_result,
            "drift_result": drift_result,
            "remediation_result": remediation_result,
            "final_summary": summary,
        }

    async def arun_audit(
        self,
        scope: str = "all",
        include_remediation: bool = True,
        auto_remediate: bool = False,
        dry_run: bool = True,
        context: str | None = None
    ) -> Dict[str, Any]:
        """Run async compliance audit."""
        import asyncio
        policy_result = security_result = drift_result = remediation_result = None

        if scope in ("all", "agents"):
            policy_result, security_result, drift_result = await asyncio.gather(
                audit_policies(scope, context),
                scan_security(scope, context),
                detect_drift(scope, context),
            )
        elif scope == "security":
            security_result = await scan_security(scope, context)
        elif scope == "drift":
            drift_result = await detect_drift(scope, context)
        else:
            policy_result = await audit_policies(scope, context)

        # Run remediation planner if requested
        if include_remediation:
            violations = self._extract_violations(policy_result, security_result, drift_result)
            if violations:
                remediation_result = await plan_remediation(
                    violations=violations,
                    auto_remediate=auto_remediate,
                    dry_run=dry_run,
                    context=context,
                )

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, self._build_synthesis_prompt(
                policy_result, security_result, drift_result, remediation_result
            ))
        )

        return {
            "scope": scope,
            "policy_result": policy_result,
            "security_result": security_result,
            "drift_result": drift_result,
            "remediation_result": remediation_result,
            "final_summary": summary,
        }

    def _build_input_text(self, scope: str, context: str | None = None) -> str:
        base = f"""Perform compliance audit with scope: {scope}

Steps:
1. Use the appropriate tools to gather data
2. Analyze findings and identify violations
3. Prioritize by severity
4. Provide recommendations"""
        if context:
            base += f"\n\nAdditional Context: {context}"
        return base

    def _extract_violations(self, *results) -> list:
        """Extract violation descriptions from agent results for remediation."""
        violations = []
        for r in results:
            if r and isinstance(r, dict):
                analysis = r.get("analysis", "")
                if "violation" in analysis.lower() or "finding" in analysis.lower():
                    violations.append(analysis[:500])  # Truncate to prevent overflow
        return violations

    def _build_synthesis_prompt(self, *args, **kwargs) -> str:
        """Build structured synthesis prompt that returns JSON."""
        agent_results = {}
        for a in args:
            if isinstance(a, dict):
                for k, v in a.items():
                    if v is not None:
                        agent_results[k] = v
        for k, v in kwargs.items():
            if v is not None:
                agent_results[k] = v

        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={
                "summary": "Executive summary of compliance status",
                "compliance_score": "0-100 score",
                "violations": "List of violations with severity",
                "remediations": "List of remediation actions",
            },
            domain_context=self.system_prompt
        )


async def run_compliance_audit(request: ComplianceAuditRequest) -> ComplianceAuditResponse:
    """Run the compliance audit workflow."""
    orchestrator = GovernComplianceOrchestrator()

    scope_value = request.scope.value if hasattr(request.scope, 'value') else str(request.scope)

    final_state = await orchestrator.arun_audit(
        scope=scope_value,
        include_remediation=request.include_remediation,
        auto_remediate=request.auto_remediate,
        dry_run=request.dry_run,
    )

    # Parse structured response
    violations = []
    remediations = []
    summary = "Compliance audit completed"
    agents_scanned = 0
    models_scanned = 0
    findings_by_severity = {"low": 0, "medium": 0, "high": 0, "critical": 0}

    try:
        structured = extract_json(final_state.get('final_summary', '{}'))
        summary = structured.get("summary", summary)

        # Extract violations
        for v in structured.get("violations", []):
            if isinstance(v, dict):
                violations.append(Violation(
                    violation_id=f"V-{uuid.uuid4().hex[:8]}",
                    violation_type=ViolationType.POLICY_VIOLATION,
                    severity=Severity(v.get("severity", "medium").lower()),
                    resource_type=v.get("resource_type", "agent"),
                    resource_id=v.get("resource_id", "unknown"),
                    description=v.get("description", str(v)),
                ))
                sev = v.get("severity", "medium").lower()
                if sev in findings_by_severity:
                    findings_by_severity[sev] += 1

        # Extract remediations
        for r in structured.get("remediations", []):
            if isinstance(r, dict):
                remediations.append(RemediationAction(
                    action_id=f"A-{uuid.uuid4().hex[:8]}",
                    action_type=r.get("action_type", "unknown"),
                    target_resource=r.get("target_resource", "unknown"),
                    description=r.get("description", str(r)),
                    requires_approval=r.get("requires_approval", True),
                ))

        agents_scanned = structured.get("agents_scanned", 0)
        models_scanned = structured.get("models_scanned", 0)

    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return ComplianceAuditResponse(
        audit_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(),
        scope=request.scope,
        violations=violations,
        remediations=remediations,
        summary=summary,
        agents_scanned=agents_scanned,
        models_scanned=models_scanned,
        findings_by_severity=findings_by_severity,
        raw_analysis={
            "policy_auditor": final_state.get("policy_result"),
            "security_scanner": final_state.get("security_result"),
            "drift_detector": final_state.get("drift_result"),
            "remediation_planner": final_state.get("remediation_result"),
        },
    )
