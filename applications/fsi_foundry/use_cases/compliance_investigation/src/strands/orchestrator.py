"""Compliance Investigation Orchestrator (Strands Implementation)."""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import EvidenceGatherer, PatternMatcher, RegulatoryMapper
from .agents.evidence_gatherer import gather_evidence
from .agents.pattern_matcher import match_patterns
from .agents.regulatory_mapper import map_regulations
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    InvestigationRequest, InvestigationResponse, InvestigationType,
    InvestigationFindings, InvestigationStatus, RegulatoryMapping, ViolationSeverity,
)


class ComplianceInvestigationOrchestrator(StrandsOrchestrator):
    name = "compliance_investigation_orchestrator"

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

    def run_assessment(self, entity_id: str, investigation_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        ev_result = pm_result = rm_result = None
        input_text = self._build_input_text(entity_id, context)

        if investigation_type == "full":
            results = self.run_parallel(["evidence_gatherer", "pattern_matcher", "regulatory_mapper"], input_text)
            ev_result = {"agent": "evidence_gatherer", "customer_id": entity_id, "analysis": results["evidence_gatherer"].output}
            pm_result = {"agent": "pattern_matcher", "customer_id": entity_id, "analysis": results["pattern_matcher"].output}
            rm_result = {"agent": "regulatory_mapper", "customer_id": entity_id, "analysis": results["regulatory_mapper"].output}
        elif investigation_type == "evidence_collection":
            r = self.run_agent("evidence_gatherer", input_text)
            ev_result = {"agent": "evidence_gatherer", "customer_id": entity_id, "analysis": r.output}
        elif investigation_type == "pattern_analysis":
            r = self.run_agent("pattern_matcher", input_text)
            pm_result = {"agent": "pattern_matcher", "customer_id": entity_id, "analysis": r.output}
        elif investigation_type == "regulatory_mapping":
            r = self.run_agent("regulatory_mapper", input_text)
            rm_result = {"agent": "regulatory_mapper", "customer_id": entity_id, "analysis": r.output}

        summary = self.synthesize({}, self._build_synthesis_prompt(ev_result, pm_result, rm_result))
        return {"customer_id": entity_id, "evidence_gatherer_result": ev_result, "pattern_matcher_result": pm_result, "regulatory_mapper_result": rm_result, "final_summary": summary}

    async def arun_assessment(self, entity_id: str, investigation_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        import asyncio
        ev_result = pm_result = rm_result = None

        if investigation_type == "full":
            ev_result, pm_result, rm_result = await asyncio.gather(gather_evidence(entity_id, context), match_patterns(entity_id, context), map_regulations(entity_id, context))
        elif investigation_type == "evidence_collection":
            ev_result = await gather_evidence(entity_id, context)
        elif investigation_type == "pattern_analysis":
            pm_result = await match_patterns(entity_id, context)
        elif investigation_type == "regulatory_mapping":
            rm_result = await map_regulations(entity_id, context)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, self._build_synthesis_prompt(ev_result, pm_result, rm_result)))
        return {"customer_id": entity_id, "evidence_gatherer_result": ev_result, "pattern_matcher_result": pm_result, "regulatory_mapper_result": rm_result, "final_summary": summary}

    def _build_input_text(self, entity_id: str, context: str | None = None) -> str:
        base = f"""Perform a comprehensive analysis for compliance investigation entity: {entity_id}

Steps:
1. Retrieve the entity's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant investigation data using the s3_retriever_tool
3. Analyze all retrieved data and provide a complete assessment"""
        if context:
            base += f"\n\nAdditional Context: {context}"
        return base

    def _build_synthesis_prompt(self, *args, **kwargs) -> str:
        """Build structured synthesis prompt that returns JSON."""
        agent_results = {}
        for a in args:
            if isinstance(a, dict):
                for k, v in a.items():
                    if v is not None: agent_results[k] = v
        for k, v in kwargs.items():
            if v is not None: agent_results[k] = v
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={"summary": "Executive summary", "fields": "All structured fields"},
            domain_context=self.system_prompt)



async def run_compliance_investigation(request):
    """Run the assessment workflow."""
    orchestrator = ComplianceInvestigationOrchestrator()
    final_state = await orchestrator.arun_assessment(
        entity_id=request.entity_id,
        investigation_type=request.investigation_type.value if hasattr(request.investigation_type, 'value') else str(request.investigation_type),
        context=getattr(request, 'additional_context', None))

    findings = None; regulatory_mappings = []
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get('final_summary', '{}'))
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
