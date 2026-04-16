"""Post Call Analytics Orchestrator (Strands Implementation)."""
import json, uuid
from datetime import datetime
from typing import Dict, Any
from base.strands import StrandsOrchestrator
from .agents import TranscriptionProcessor, SentimentAnalyst, ActionExtractor
from .agents.transcription_processor import process_transcription
from .agents.sentiment_analyst import analyze_sentiment
from .agents.action_extractor import extract_actions
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    PostCallRequest, PostCallResponse, AnalysisType,
    TranscriptionResult, SentimentResult, SentimentLevel,
    ActionItem, ActionPriority, ActionStatus,
)


class PostCallAnalyticsOrchestrator(StrandsOrchestrator):
    name = "post_call_analytics_orchestrator"
    system_prompt = """You are a Senior Call Analytics Supervisor for a financial services contact center.

Your role is to:
1. Coordinate specialist agents (Transcription Processor, Sentiment Analyst, Action Extractor)
2. Synthesize their findings into a comprehensive post-call analysis
3. Ensure all action items are captured and prioritized
4. Flag quality issues and compliance concerns

Be concise but thorough. Your summary will be used by supervisors and quality teams."""

    def __init__(self):
        super().__init__(agents={
            "transcription_processor": TranscriptionProcessor(),
            "sentiment_analyst": SentimentAnalyst(),
            "action_extractor": ActionExtractor(),
        })

    def run_assessment(self, call_id: str, analysis_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        tp_result = sa_result = ae_result = None
        input_text = self._build_input_text(call_id, context)
        if analysis_type == "full":
            results = self.run_parallel(["transcription_processor", "sentiment_analyst", "action_extractor"], input_text)
            tp_result = {"agent": "transcription_processor", "customer_id": call_id, "analysis": results["transcription_processor"].output}
            sa_result = {"agent": "sentiment_analyst", "customer_id": call_id, "analysis": results["sentiment_analyst"].output}
            ae_result = {"agent": "action_extractor", "customer_id": call_id, "analysis": results["action_extractor"].output}
        elif analysis_type == "transcription":
            r = self.run_agent("transcription_processor", input_text)
            tp_result = {"agent": "transcription_processor", "customer_id": call_id, "analysis": r.output}
        elif analysis_type == "sentiment":
            r = self.run_agent("sentiment_analyst", input_text)
            sa_result = {"agent": "sentiment_analyst", "customer_id": call_id, "analysis": r.output}
        elif analysis_type == "action_extraction":
            r = self.run_agent("action_extractor", input_text)
            ae_result = {"agent": "action_extractor", "customer_id": call_id, "analysis": r.output}
        summary = self.synthesize({}, self._build_synthesis_prompt(tp_result, sa_result, ae_result))
        return {"customer_id": call_id, "transcription_result": tp_result, "sentiment_result": sa_result, "action_extractor_result": ae_result, "final_summary": summary}

    async def arun_assessment(self, call_id: str, analysis_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        import asyncio
        tp_result = sa_result = ae_result = None
        if analysis_type == "full":
            tp_result, sa_result, ae_result = await asyncio.gather(
                process_transcription(call_id, context), analyze_sentiment(call_id, context), extract_actions(call_id, context))
        elif analysis_type == "transcription":
            tp_result = await process_transcription(call_id, context)
        elif analysis_type == "sentiment":
            sa_result = await analyze_sentiment(call_id, context)
        elif analysis_type == "action_extraction":
            ae_result = await extract_actions(call_id, context)
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, self._build_synthesis_prompt(tp_result, sa_result, ae_result)))
        return {"customer_id": call_id, "transcription_result": tp_result, "sentiment_result": sa_result, "action_extractor_result": ae_result, "final_summary": summary}

    def _build_input_text(self, call_id: str, context: str | None = None) -> str:
        base = f"""Analyze call recording for: {call_id}

Steps:
1. Retrieve call data using s3_retriever_tool with data_type='profile'
2. Analyze the call content thoroughly
3. Provide complete assessment"""
        return base + (f"\n\nAdditional Context: {context}" if context else "")

    def _build_synthesis_prompt(self, tp, sa, ae) -> str:
        agent_results = {}
        if tp: agent_results["transcription"] = tp
        if sa: agent_results["sentiment"] = sa
        if ae: agent_results["action_extraction"] = ae
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={
                "transcription": {"speaker_count": "int", "duration_seconds": "int", "key_topics": ["list"], "transcript_summary": "string"},
                "sentiment": {"overall_sentiment": "very_negative|negative|neutral|positive|very_positive", "customer_sentiment": "very_negative|negative|neutral|positive|very_positive", "agent_sentiment": "very_negative|negative|neutral|positive|very_positive", "satisfaction_score": "float 0.0-1.0", "emotional_shifts": ["list"]},
                "action_items": [{"description": "string", "assignee": "string", "priority": "low|medium|high|critical", "deadline": "string or null"}],
                "summary": "Executive summary with call quality assessment, key findings, and recommended follow-ups",
            },
            domain_context="You are a Senior Call Analytics Supervisor for a financial services contact center.",
        )


async def run_post_call_analytics(request: PostCallRequest) -> PostCallResponse:
    orchestrator = PostCallAnalyticsOrchestrator()
    final_state = await orchestrator.arun_assessment(
        call_id=request.call_id, analysis_type=request.analysis_type.value, context=request.additional_context)

    transcription, sentiment, action_items, summary = None, None, [], "Analysis completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        if request.analysis_type in [AnalysisType.FULL, AnalysisType.TRANSCRIPTION]:
            if structured.get("transcription"):
                transcription = TranscriptionResult(**structured["transcription"])
        if request.analysis_type in [AnalysisType.FULL, AnalysisType.SENTIMENT]:
            if structured.get("sentiment"):
                transcription  # keep transcription
                sentiment = SentimentResult(**structured["sentiment"])
        if request.analysis_type in [AnalysisType.FULL, AnalysisType.ACTION_EXTRACTION]:
            for item in structured.get("action_items", []):
                try:
                    action_items.append(ActionItem(**item))
                except Exception:
                    action_items.append(ActionItem(description=str(item)))
    except (ValueError, Exception):
        summary = final_state.get("final_summary", summary)

    return PostCallResponse(
        call_id=request.call_id, analytics_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        transcription=transcription, sentiment=sentiment, action_items=action_items, summary=summary,
        raw_analysis={"transcription": final_state.get("transcription_result"), "sentiment": final_state.get("sentiment_result"), "actions": final_state.get("action_extractor_result")},
    )
