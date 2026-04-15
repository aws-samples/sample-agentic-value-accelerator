"""Compliance Investigation Orchestrator. Coordinates evidence gathering, pattern matching, and regulatory mapping."""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.compliance_investigation.agents import EvidenceGatherer, PatternMatcher, RegulatoryMapper
from use_cases.compliance_investigation.agents.evidence_gatherer import gather_evidence
from use_cases.compliance_investigation.agents.pattern_matcher import match_patterns
from use_cases.compliance_investigation.agents.regulatory_mapper import map_regulations
from use_cases.compliance_investigation.models import (
    InvestigationRequest, InvestigationResponse, InvestigationType,
    InvestigationFindings, InvestigationStatus, RegulatoryMapping, ViolationSeverity,
)

from pydantic import BaseModel, Field

class ComplianceInvestigationSynthesisSchema(BaseModel):
    """Structured synthesis for compliance investigation."""
    investigation_status: str = Field(default="in_progress", description="Status: in_progress, completed, escalated, or closed")
    findings_count: int = Field(default=0, description="Number of findings identified")
    key_findings: list[str] = Field(default_factory=list, description="List of key investigation findings")
    regulatory_violations: list[str] = Field(default_factory=list, description="List of regulatory violations identified")
    recommended_actions: list[str] = Field(default_factory=list, description="List of recommended remediation actions")
    summary: str = Field(..., description="Executive summary of the compliance investigation")



class ComplianceInvestigationState(TypedDict):
    messages: Annotated[list, add_messages]
    entity_id: str
    investigation_type: str
    evidence_gatherer_result: dict | None
    pattern_matcher_result: dict | None
    regulatory_mapper_result: dict | None
    final_summary: str | None


class ComplianceInvestigationOrchestrator(LangGraphOrchestrator):
    name = "compliance_investigation_orchestrator"
    state_schema = ComplianceInvestigationState

    system_prompt = """You are a Senior Compliance Investigation Supervisor.

Your role is to:
1. Coordinate specialist agents (Evidence Gatherer, Pattern Matcher, Regulatory Mapper)
2. Synthesize their findings into a comprehensive investigation report
3. Ensure all regulatory requirements are addressed and violations properly classified

When creating the final summary, consider:
- Completeness of evidence collected
- Confidence levels of identified patterns
- Regulatory mapping accuracy and violation severity
- Clear recommendations for remediation and enforcement
- Timeline and priority of required actions

Be concise but thorough. Your summary will be used by compliance officers and regulators."""

    def __init__(self):
        super().__init__(agents={
            "evidence_gatherer": EvidenceGatherer(),
            "pattern_matcher": PatternMatcher(),
            "regulatory_mapper": RegulatoryMapper(),
        })

    def build_graph(self) -> StateGraph:
        workflow = StateGraph(ComplianceInvestigationState)
        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("evidence_gatherer", self._evidence_gatherer_node)
        workflow.add_node("pattern_matcher", self._pattern_matcher_node)
        workflow.add_node("regulatory_mapper", self._regulatory_mapper_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(self._router, {
            "parallel_assessment": "parallel_assessment",
            "evidence_gatherer": "evidence_gatherer",
            "pattern_matcher": "pattern_matcher",
            "regulatory_mapper": "regulatory_mapper",
        })
        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges("evidence_gatherer", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("pattern_matcher", self._router, {"synthesize": "synthesize"})
        workflow.add_conditional_edges("regulatory_mapper", self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)
        return workflow.compile()

    def _router(self, state: ComplianceInvestigationState) -> Literal["parallel_assessment", "evidence_gatherer", "pattern_matcher", "regulatory_mapper", "synthesize"]:
        t = state.get("investigation_type", "full")
        ev = state.get("evidence_gatherer_result") is not None
        pm = state.get("pattern_matcher_result") is not None
        rm = state.get("regulatory_mapper_result") is not None

        if t == "evidence_collection":
            return "synthesize" if ev else "evidence_gatherer"
        if t == "pattern_analysis":
            return "synthesize" if pm else "pattern_matcher"
        if t == "regulatory_mapping":
            return "synthesize" if rm else "regulatory_mapper"
        if not ev and not pm and not rm:
            return "parallel_assessment"
        return "synthesize"

    async def _parallel_assessment_node(self, state):
        eid = state["customer_id"] if "customer_id" in state else state["entity_id"]
        ctx = self._extract_context(state)
        import asyncio
        ev, pm, rm = await asyncio.gather(gather_evidence(eid, ctx), match_patterns(eid, ctx), map_regulations(eid, ctx))
        return {**state, "evidence_gatherer_result": ev, "pattern_matcher_result": pm, "regulatory_mapper_result": rm,
                "messages": state["messages"] + [AIMessage(content=f"Evidence: {json.dumps(ev, indent=2)}"), AIMessage(content=f"Patterns: {json.dumps(pm, indent=2)}"), AIMessage(content=f"Regulatory: {json.dumps(rm, indent=2)}")]}

    async def _evidence_gatherer_node(self, state):
        eid = state["customer_id"] if "customer_id" in state else state["entity_id"]
        r = await gather_evidence(eid, self._extract_context(state))
        return {**state, "evidence_gatherer_result": r, "messages": state["messages"] + [AIMessage(content=f"Evidence: {json.dumps(r, indent=2)}")]}

    async def _pattern_matcher_node(self, state):
        eid = state["customer_id"] if "customer_id" in state else state["entity_id"]
        r = await match_patterns(eid, self._extract_context(state))
        return {**state, "pattern_matcher_result": r, "messages": state["messages"] + [AIMessage(content=f"Patterns: {json.dumps(r, indent=2)}")]}

    async def _regulatory_mapper_node(self, state):
        eid = state["customer_id"] if "customer_id" in state else state["entity_id"]
        r = await map_regulations(eid, self._extract_context(state))
        return {**state, "regulatory_mapper_result": r, "messages": state["messages"] + [AIMessage(content=f"Regulatory: {json.dumps(r, indent=2)}")]}

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "entity_id", "investigation_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")
        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""
        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(ComplianceInvestigationSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog; structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}
        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state) -> str | None:
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"):
                return last.content
        return None



async def run_compliance_investigation(request):
    """Run the assessment workflow."""
    orchestrator = ComplianceInvestigationOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.entity_id}")],
        "entity_id": request.entity_id,
        "investigation_type": request.investigation_type.value if hasattr(request.investigation_type, 'value') else str(request.investigation_type),
    }
    for key in [k for k in ComplianceInvestigationState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)

    findings = None; regulatory_mappings = []
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get('final_summary', '{}'))
        summary = structured.get("summary", summary)

        if structured.get("key_findings"):
            findings = InvestigationFindings(evidence_items=structured.get("key_findings", []),
                patterns_identified=[], risk_indicators=[], confidence_score=0.7, notes=[])
        regulatory_mappings = [RegulatoryMapping(regulation="General", requirement=v,
            violation_type="potential", status=InvestigationStatus(structured.get("investigation_status", "in_progress")),
            notes=[]) for v in structured.get("regulatory_violations", [])]
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return InvestigationResponse(
        entity_id=request.entity_id, investigation_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), findings=findings, regulatory_mappings=regulatory_mappings,
        summary=summary,
        raw_analysis={"evidence": final_state.get("evidence_gatherer_result"), "patterns": final_state.get("pattern_matcher_result"), "regulatory": final_state.get("regulatory_mapper_result")},
    )
