"""Call Summarization Orchestrator (Strands)."""
import json, uuid
from datetime import datetime
from typing import Dict, Any
from base.strands import StrandsOrchestrator
from .agents import KeyPointExtractor, SummaryGenerator
from .agents.key_point_extractor import extract_key_points
from .agents.summary_generator import generate_summary
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    SummarizationRequest, SummarizationResponse, SummarizationType,
    KeyPointsResult, KeyPoint, SummaryResult,
)

class CallSummarizationOrchestrator(StrandsOrchestrator):
    name = "call_summarization_orchestrator"
    system_prompt = """You are a Senior Call Center Supervisor reviewing banking customer service calls.
Your role is to coordinate specialist agents and synthesize their findings into a comprehensive call summary.
Consider: completeness of key points, accuracy of the summary, action items, and customer sentiment."""

    def __init__(self):
        super().__init__(agents={
            "key_point_extractor": KeyPointExtractor(),
            "summary_generator": SummaryGenerator(),
        })

    def run_assessment(self, call_id: str, summarization_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        kp_result, sum_result = None, None
        input_text = self._build_input_text(call_id, context)
        if summarization_type == "full":
            results = self.run_parallel(["key_point_extractor", "summary_generator"], input_text)
            kp_result = {"agent": "key_point_extractor", "call_id": call_id, "analysis": results["key_point_extractor"].output}
            sum_result = {"agent": "summary_generator", "call_id": call_id, "analysis": results["summary_generator"].output}
        elif summarization_type == "key_points_only":
            r = self.run_agent("key_point_extractor", input_text)
            kp_result = {"agent": "key_point_extractor", "call_id": call_id, "analysis": r.output}
        elif summarization_type == "summary_only":
            r = self.run_agent("summary_generator", input_text)
            sum_result = {"agent": "summary_generator", "call_id": call_id, "analysis": r.output}
        synthesis_prompt = self._build_synthesis_prompt(kp_result, sum_result)
        summary = self.synthesize({}, synthesis_prompt)
        return {"call_id": call_id, "key_point_extractor_result": kp_result, "summary_generator_result": sum_result, "final_summary": summary}

    async def arun_assessment(self, call_id: str, summarization_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        import asyncio
        kp_result, sum_result = None, None
        if summarization_type == "full":
            kp_result, sum_result = await asyncio.gather(extract_key_points(call_id, context), generate_summary(call_id, context))
        elif summarization_type == "key_points_only":
            kp_result = await extract_key_points(call_id, context)
        elif summarization_type == "summary_only":
            sum_result = await generate_summary(call_id, context)
        synthesis_prompt = self._build_synthesis_prompt(kp_result, sum_result)
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, synthesis_prompt))
        return {"call_id": call_id, "key_point_extractor_result": kp_result, "summary_generator_result": sum_result, "final_summary": summary}

    def _build_input_text(self, call_id: str, context: str | None = None) -> str:
        base = f"Analyze banking customer service call: {call_id}\n\nSteps:\n1. Retrieve the call profile using s3_retriever_tool with data_type='profile'\n2. Analyze the transcript thoroughly\n3. Provide a complete assessment"
        if context: base += f"\n\nAdditional Context: {context}"
        return base

    def _build_synthesis_prompt(self, kp_result, sum_result) -> str:
        agent_results = {}
        if kp_result: agent_results["key_points"] = kp_result
        if sum_result: agent_results["summary"] = sum_result
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={
                "key_points": [{"topic": "string", "detail": "string", "confidence": "float 0.0-1.0"}],
                "call_outcome": "resolved|escalated|follow_up|unresolved",
                "topics_discussed": ["list of topic labels"],
                "executive_summary": "concise summary of the call",
                "action_items": ["list of follow-up tasks"],
                "customer_sentiment": "positive|neutral|negative",
                "overall_summary": "comprehensive summary combining key points and summary",
            },
            domain_context="You are a Senior Call Center Supervisor synthesizing call analysis results.")


async def run_call_summarization(request: SummarizationRequest) -> SummarizationResponse:
    orchestrator = CallSummarizationOrchestrator()
    final_state = await orchestrator.arun_assessment(
        call_id=request.call_id, summarization_type=request.summarization_type.value, context=request.additional_context)
    key_points, summary_result, overall = None, None, "Summarization completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        overall = structured.get("overall_summary", overall)
        if request.summarization_type in [SummarizationType.FULL, SummarizationType.KEY_POINTS_ONLY]:
            kps = structured.get("key_points", [])
            if isinstance(kps, list) and kps:
                key_points = KeyPointsResult(
                    key_points=[KeyPoint(**kp) if isinstance(kp, dict) else KeyPoint(topic=str(kp), detail="", confidence=0.5) for kp in kps],
                    call_outcome=structured.get("call_outcome", "resolved"),
                    topics_discussed=structured.get("topics_discussed", []))
        if request.summarization_type in [SummarizationType.FULL, SummarizationType.SUMMARY_ONLY]:
            if structured.get("executive_summary"):
                summary_result = SummaryResult(
                    executive_summary=structured["executive_summary"],
                    action_items=structured.get("action_items", []),
                    customer_sentiment=structured.get("customer_sentiment", "neutral"))
    except Exception:
        overall = str(final_state.get("final_summary", overall))
    return SummarizationResponse(
        call_id=request.call_id, summarization_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        key_points=key_points, summary=summary_result, overall_summary=overall,
        raw_analysis={"key_points": final_state.get("key_point_extractor_result"), "summary": final_state.get("summary_generator_result")})
