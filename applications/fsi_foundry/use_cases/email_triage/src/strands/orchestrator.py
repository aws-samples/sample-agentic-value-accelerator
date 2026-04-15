"""Email Triage Orchestrator (Strands Implementation)."""
import json, uuid
from datetime import datetime
from typing import Dict, Any
from base.strands import StrandsOrchestrator
from .agents import EmailClassifier, ActionExtractor
from .agents.email_classifier import classify_email
from .agents.action_extractor import extract_actions
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (TriageRequest, TriageResponse, TriageType, ClassificationDetail, EmailCategory, UrgencyLevel)


class EmailTriageOrchestrator(StrandsOrchestrator):
    name = "email_triage_orchestrator"
    system_prompt = """You are a Senior Email Triage Supervisor for a capital markets trading desk.

Your role is to:
1. Coordinate specialist agents (Email Classifier, Action Extractor)
2. Synthesize their findings into a prioritized triage summary
3. Ensure time-sensitive items are flagged and actionable

Be concise but thorough. Your summary will be used by traders and portfolio managers."""

    def __init__(self):
        super().__init__(agents={"email_classifier": EmailClassifier(), "action_extractor": ActionExtractor()})

    def run_assessment(self, entity_id: str, triage_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        ec_result = ae_result = None
        input_text = self._build_input_text(entity_id, context)
        if triage_type == "full":
            results = self.run_parallel(["email_classifier", "action_extractor"], input_text)
            ec_result = {"agent": "email_classifier", "customer_id": entity_id, "analysis": results["email_classifier"].output}
            ae_result = {"agent": "action_extractor", "customer_id": entity_id, "analysis": results["action_extractor"].output}
        elif triage_type == "classification":
            r = self.run_agent("email_classifier", input_text)
            ec_result = {"agent": "email_classifier", "customer_id": entity_id, "analysis": r.output}
        elif triage_type == "action_extraction":
            r = self.run_agent("action_extractor", input_text)
            ae_result = {"agent": "action_extractor", "customer_id": entity_id, "analysis": r.output}
        summary = self.synthesize({}, self._build_synthesis_prompt(ec_result, ae_result))
        return {"customer_id": entity_id, "email_classifier_result": ec_result, "action_extractor_result": ae_result, "final_summary": summary}

    async def arun_assessment(self, entity_id: str, triage_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        import asyncio
        ec_result = ae_result = None
        if triage_type == "full":
            ec_result, ae_result = await asyncio.gather(classify_email(entity_id, context), extract_actions(entity_id, context))
        elif triage_type == "classification":
            ec_result = await classify_email(entity_id, context)
        elif triage_type == "action_extraction":
            ae_result = await extract_actions(entity_id, context)
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, self._build_synthesis_prompt(ec_result, ae_result)))
        return {"customer_id": entity_id, "email_classifier_result": ec_result, "action_extractor_result": ae_result, "final_summary": summary}

    def _build_input_text(self, entity_id: str, context: str | None = None) -> str:
        base = f"""Analyze email for triage: {entity_id}

Steps:
1. Retrieve email data using s3_retriever_tool with data_type='profile'
2. Analyze content and extract relevant information
3. Provide complete assessment"""
        return base + (f"\n\nAdditional Context: {context}" if context else "")

    def _build_synthesis_prompt(self, ec, ae) -> str:
        agent_results = {}
        if ec:
            agent_results["email_classification"] = ec
        if ae:
            agent_results["action_extraction"] = ae
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={
                "category": "client_request|trade_instruction|compliance_alert|market_update|internal_memo|meeting_request",
                "urgency": "low|medium|high|critical",
                "sender_importance": "float 0.0-1.0",
                "topics": ["list of identified topics"],
                "actions_required": ["list of action items"],
                "deadlines": ["list of deadlines"],
                "recommendations": ["list of prioritization recommendations"],
                "summary": "Executive summary with priority, category, urgency, key actions, and suggested response",
            },
            domain_context="You are a Senior Email Triage Supervisor for a capital markets trading desk.",
        )


async def run_email_triage(request: TriageRequest) -> TriageResponse:
    orchestrator = EmailTriageOrchestrator()
    final_state = await orchestrator.arun_assessment(entity_id=request.entity_id, triage_type=request.triage_type.value, context=request.additional_context)

    classification = None
    recommendations = []
    summary = "Triage completed"

    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        if request.triage_type in [TriageType.FULL, TriageType.CLASSIFICATION]:
            classification = ClassificationDetail(
                category=EmailCategory(structured.get("category", "internal_memo")),
                urgency=UrgencyLevel(structured.get("urgency", "medium")),
                sender_importance=float(structured.get("sender_importance", 0.5)),
                topics=structured.get("topics", []),
                actions_required=structured.get("actions_required", []),
                deadlines=structured.get("deadlines", []),
            )
        recommendations = structured.get("recommendations", [])
    except (ValueError, Exception):
        summary = final_state.get("final_summary", summary)

    return TriageResponse(
        entity_id=request.entity_id, triage_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        classification=classification, recommendations=recommendations, summary=summary,
        raw_analysis={"classifier": final_state.get("email_classifier_result"), "extractor": final_state.get("action_extractor_result")},
    )
