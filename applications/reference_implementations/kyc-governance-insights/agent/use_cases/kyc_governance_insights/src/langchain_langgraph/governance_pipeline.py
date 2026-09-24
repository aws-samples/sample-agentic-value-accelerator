"""
Shared governance pipeline for KYC Controlled Quality Output.

Framework-agnostic logic that:
  - fetches raw customer data from S3 (deterministic, independent of agent tools)
  - runs the four governance services (sanctions/PEP, deterministic check,
    policy cascade, LLM-judge)
  - assembles the governance portion of the AssessmentResponse

The orchestrator calls `run_governance` (to compute the governance result dict)
and `assemble_response` (to build the final typed AssessmentResponse), keeping the
governance behavior out of the graph itself.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime

import structlog

from use_cases.kyc_governance_insights import governance
from use_cases.kyc_governance_insights.models import (
    AssessmentRequest,
    AssessmentResponse,
    AssessmentType,
    RiskScore,
    RiskLevel,
    ComplianceStatus,
    ComplianceStatusEnum,
    Decision,
    PolicyLayer,
    PolicyAction,
    SanctionsResult,
    DeterministicCheck,
    DeterministicChecks,
    PolicyEvaluation,
    JudgeScores,
)

logger = structlog.get_logger(__name__)


async def _fetch_governance_inputs(customer_id: str):
    """Fetch profile + credit history directly from S3 for deterministic checks."""
    try:
        from tools.s3_retriever import S3Retriever
        retriever = S3Retriever()
        profile = await retriever.aget_customer_profile(customer_id)
        credit = await retriever.aget_credit_history(customer_id)
        return (profile if isinstance(profile, dict) else {}), (credit if isinstance(credit, dict) else {})
    except Exception as e:
        logger.warning("governance_input_fetch_failed", error=str(e))
        return {}, {}


def _extract_raw_financials(profile: dict, credit: dict) -> dict:
    fin = credit.get("financial_statements") or credit.get("financials") or {}
    payments = credit.get("payment_history") or {}
    return {
        "total_assets": fin.get("total_assets"),
        "total_liabilities": fin.get("total_liabilities"),
        "current_assets": fin.get("current_assets"),
        "current_liabilities": fin.get("current_liabilities"),
        "revenue": fin.get("revenue"),
        "net_income": fin.get("net_income"),
        "payments_on_time": payments.get("payments_on_time") or payments.get("on_time"),
        "payments_total": payments.get("payments_total") or payments.get("total"),
    }


def _extract_agent_claims(credit: dict) -> dict:
    claims = credit.get("agent_claims") or {}
    return {
        "de_ratio": claims.get("de_ratio"),
        "current_ratio": claims.get("current_ratio"),
        "net_margin": claims.get("net_margin"),
        "payment_pct": claims.get("payment_pct"),
    }


async def run_governance(customer_id: str, structured: dict) -> dict:
    """Run the deterministic governance pipeline over synthesized findings."""
    profile, credit_history = await _fetch_governance_inputs(customer_id)

    agent_risk = int(structured.get("credit_risk_score", 50) or 50)
    company_name = profile.get("name") or profile.get("company_name") or customer_id

    sanctions = governance.sanctions_check(company_name)
    pep = governance.pep_check(company_name)
    sanctions_hit = bool(sanctions.get("matched"))
    pep_flag = bool(pep.get("matched"))

    raw_financials = _extract_raw_financials(profile, credit_history)
    agent_claims = _extract_agent_claims(credit_history)
    det = governance.deterministic_check(raw_financials, agent_claims)

    risk_score = agent_risk
    if sanctions_hit:
        risk_score = max(risk_score, 81)
    if det.get("overall") == "FAIL":
        risk_score = max(risk_score, 65)
    risk_score = min(risk_score, 100)

    risk_flags = profile.get("risk_flags") or []
    fatf_high_risk = any(
        flag in {"conflict_zone_operations", "fatf_high_risk_jurisdiction"} for flag in risk_flags
    ) or bool((profile.get("high_risk_jurisdictions") or []))

    cascade = governance.policy_cascade({
        "customerId": customer_id,
        "riskScore": risk_score,
        "sanctionsHit": sanctions_hit,
        "pepFlag": pep_flag,
        "fatfHighRisk": fatf_high_risk,
        "jurisdiction": profile.get("jurisdiction") or (profile.get("incorporation") or {}).get("country", ""),
    })

    judge = governance.llm_judge(structured.get("summary", ""))

    # External-enforcement integrity: if any governance service was unreachable
    # (degraded, GOVERNANCE_MODE=external), never let the assessment silently
    # ALLOW — fail closed to human review. Surfaced in raw_analysis.governance
    # .degraded for the UI degraded badge.
    degraded = any(
        isinstance(x, dict) and x.get("degraded")
        for x in (sanctions, pep, det, cascade, judge)
    )
    if degraded and cascade.get("decision") == "ALLOW":
        reason = "One or more governance services were unreachable — failing closed to human review"
        cascade = {
            "decision": "ESCALATE",
            "deciding_layer": "REQ",
            "deciding_rule": "GOV-DEGRADED",
            "reason": reason,
            "degraded": True,
            "evaluations": (cascade.get("evaluations") or []) + [
                {"layer": "REQ", "rule": "GOV-DEGRADED", "result": "ESCALATE", "reason": reason}
            ],
        }

    return {
        "sanctions": sanctions,
        "pep": pep,
        "deterministic": det,
        "risk_score": risk_score,
        "cascade": cascade,
        "judge": judge,
        "company_name": company_name,
        "degraded": degraded,
    }


def _map_decision(cascade: dict) -> Decision:
    return {
        "BLOCK": Decision.BLOCK,
        "ESCALATE": Decision.ESCALATE,
        "ALLOW": Decision.APPROVE,
    }.get(cascade.get("decision", "ESCALATE"), Decision.ESCALATE)


def _risk_level(score: int) -> str:
    if score >= 80:
        return "critical"
    if score >= 60:
        return "high"
    if score >= 35:
        return "medium"
    return "low"


def assemble_response(
    request: AssessmentRequest,
    structured: dict,
    credit_analysis: dict | None,
    compliance_check: dict | None,
    gov: dict,
) -> AssessmentResponse:
    """Build the final typed AssessmentResponse from agent findings + governance."""
    summary = structured.get("summary", "Assessment completed")

    # Agent findings — accepts both the flat schema and the nested-object schema.
    credit_risk = None
    compliance = None
    if request.assessment_type in [AssessmentType.FULL, AssessmentType.CREDIT_ONLY]:
        if structured.get("credit_risk_score") is not None:
            credit_risk = RiskScore(
                score=structured["credit_risk_score"],
                level=RiskLevel(structured.get("credit_risk_level", "medium")),
                factors=structured.get("credit_risk_factors", []),
                recommendations=structured.get("credit_risk_recommendations", []))
        elif isinstance(structured.get("credit_risk"), dict):
            try:
                credit_risk = RiskScore(**structured["credit_risk"])
            except Exception:
                credit_risk = None
    if request.assessment_type in [AssessmentType.FULL, AssessmentType.COMPLIANCE_ONLY]:
        if structured.get("compliance_status"):
            compliance = ComplianceStatus(
                status=ComplianceStatusEnum(structured.get("compliance_status", "review_required")),
                checks_passed=structured.get("compliance_checks_passed", []),
                checks_failed=structured.get("compliance_checks_failed", []),
                regulatory_notes=structured.get("compliance_regulatory_notes", []))
        elif isinstance(structured.get("compliance"), dict):
            try:
                compliance = ComplianceStatus(**structured["compliance"])
            except Exception:
                compliance = None

    # Governance layer
    sanctions_model = det_model = judge_model = None
    policy_cascade_models: list[PolicyEvaluation] = []
    decision = Decision.ESCALATE
    risk_score = 50
    blocked = False
    block_reason = incident_id = policy_layer = None

    if gov:
        s = gov.get("sanctions", {})
        pep = gov.get("pep", {})
        sanctions_model = SanctionsResult(
            matched=bool(s.get("matched")),
            score=float(s.get("score", 0.0) or 0.0),
            matched_name=s.get("matched_name"),
            list_name=s.get("list"),
            entry_id=s.get("entry_id"),
            threshold=float(s.get("threshold", 0.70) or 0.70),
            pep_level=pep.get("level"),
        )

        det = gov.get("deterministic", {})
        det_model = DeterministicChecks(
            overall=det.get("overall", "PASS"),
            checks=[DeterministicCheck(
                metric=c.get("metric", ""),
                computed=float(c.get("computed", 0.0) or 0.0),
                agent_stated=(float(c["agent_stated"]) if c.get("agent_stated") is not None else None),
                result=c.get("result", "PASS"),
            ) for c in det.get("checks", [])],
        )

        cascade = gov.get("cascade", {})
        for e in cascade.get("evaluations", []):
            try:
                policy_cascade_models.append(PolicyEvaluation(
                    layer=PolicyLayer(e.get("layer", "REQ")),
                    rule=e.get("rule", ""),
                    result=PolicyAction(e.get("result", "ALLOW")),
                    reason=e.get("reason"),
                ))
            except ValueError:
                continue

        j = gov.get("judge", {})
        judge_model = JudgeScores(
            correctness=float(j.get("correctness", 0.0) or 0.0),
            faithfulness=float(j.get("faithfulness", 0.0) or 0.0),
            completeness=float(j.get("completeness", 0.0) or 0.0),
            helpfulness=float(j.get("helpfulness", 0.0) or 0.0),
            tone=float(j.get("tone", 0.0) or 0.0),
            model=j.get("model"),
        )

        risk_score = int(gov.get("risk_score", 50) or 50)
        decision = _map_decision(cascade)
        if decision == Decision.BLOCK:
            blocked = True
            block_reason = cascade.get("reason")
            incident_id = f"INC-{uuid.uuid4().hex[:8].upper()}"
            try:
                policy_layer = PolicyLayer(cascade.get("deciding_layer", "ORG"))
            except ValueError:
                policy_layer = PolicyLayer.ORG
        elif decision == Decision.ESCALATE:
            incident_id = f"ESC-{uuid.uuid4().hex[:8].upper()}"
            try:
                policy_layer = PolicyLayer(cascade.get("deciding_layer", "APP"))
            except ValueError:
                policy_layer = PolicyLayer.APP

    return AssessmentResponse(
        customer_id=request.customer_id,
        assessment_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(),
        credit_risk=credit_risk,
        compliance=compliance,
        decision=decision,
        risk_score=risk_score,
        risk_level=_risk_level(risk_score),
        sanctions=sanctions_model,
        deterministic_checks=det_model,
        policy_cascade=policy_cascade_models,
        judge_scores=judge_model,
        blocked=blocked,
        block_reason=block_reason,
        incident_id=incident_id,
        policy_layer=policy_layer,
        summary=summary,
        raw_analysis={
            "credit_analysis": credit_analysis,
            "compliance_check": compliance_check,
            "governance": gov,
        },
    )
