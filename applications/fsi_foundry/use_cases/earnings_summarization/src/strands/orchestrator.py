"""Earnings Summarization Orchestrator (Strands Implementation)."""
import json, uuid
from datetime import datetime
from typing import Dict, Any
from base.strands import StrandsOrchestrator
from utils.synthesis import build_structured_synthesis_prompt
from utils.json_extract import extract_json
from .agents import TranscriptProcessor, MetricExtractor, SentimentAnalyst
from .agents.transcript_processor import process_transcript
from .agents.metric_extractor import extract_metrics
from .agents.sentiment_analyst import analyze_sentiment
from .models import (SummarizationRequest, SummarizationResponse, SummarizationType,
    EarningsOverview, SentimentRating)


class EarningsSummarizationOrchestrator(StrandsOrchestrator):
    name = "earnings_summarization_orchestrator"
    system_prompt = """You are a Senior Earnings Call Analyst for capital markets.

Your role is to:
1. Coordinate specialist agents (Transcript Processor, Metric Extractor, Sentiment Analyst)
2. Synthesize findings into a comprehensive earnings call summary
3. Provide actionable investment insights

Consider: financial performance vs expectations, management tone, guidance changes, and risk factors.
Be concise but thorough. Your summary will be used by portfolio managers and analysts."""

    def __init__(self):
        super().__init__(agents={"transcript_processor": TranscriptProcessor(), "metric_extractor": MetricExtractor(), "sentiment_analyst": SentimentAnalyst()})

    def run_assessment(self, entity_id: str, summarization_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        input_text = self._build_input_text(entity_id, context)
        transcript = metrics = sentiment = None

        if summarization_type == "full":
            results = self.run_parallel({"transcript_processor": input_text, "metric_extractor": input_text, "sentiment_analyst": input_text})
            transcript = {"agent": "transcript_processor", "entity_id": entity_id, "transcript": results["transcript_processor"].output}
            metrics = {"agent": "metric_extractor", "entity_id": entity_id, "metrics": results["metric_extractor"].output}
            sentiment = {"agent": "sentiment_analyst", "entity_id": entity_id, "sentiment": results["sentiment_analyst"].output}
        elif summarization_type == "transcript_only":
            result = self.run_agent("transcript_processor", input_text)
            transcript = {"agent": "transcript_processor", "entity_id": entity_id, "transcript": result.output}
        elif summarization_type == "metrics_only":
            result = self.run_agent("metric_extractor", input_text)
            metrics = {"agent": "metric_extractor", "entity_id": entity_id, "metrics": result.output}
        elif summarization_type == "sentiment_only":
            result = self.run_agent("sentiment_analyst", input_text)
            sentiment = {"agent": "sentiment_analyst", "entity_id": entity_id, "sentiment": result.output}

        synthesis_prompt = self._build_synthesis_prompt(transcript, metrics, sentiment)
        summary = self.synthesize({}, synthesis_prompt)

        return {"entity_id": entity_id, "transcript": transcript, "metrics": metrics, "sentiment": sentiment, "final_summary": summary}

    async def arun_assessment(self, entity_id: str, summarization_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        import asyncio
        transcript = metrics = sentiment = None

        if summarization_type == "full":
            transcript, metrics, sentiment = await asyncio.gather(
                process_transcript(entity_id, context), extract_metrics(entity_id, context), analyze_sentiment(entity_id, context))
        elif summarization_type == "transcript_only":
            transcript = await process_transcript(entity_id, context)
        elif summarization_type == "metrics_only":
            metrics = await extract_metrics(entity_id, context)
        elif summarization_type == "sentiment_only":
            sentiment = await analyze_sentiment(entity_id, context)

        synthesis_prompt = self._build_synthesis_prompt(transcript, metrics, sentiment)
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, synthesis_prompt))

        return {"entity_id": entity_id, "transcript": transcript, "metrics": metrics, "sentiment": sentiment, "final_summary": summary}

    def _build_input_text(self, entity_id: str, context: str | None = None) -> str:
        base = f"""Perform a comprehensive analysis for earnings call: {entity_id}

Steps to follow:
1. Retrieve the entity profile data using the s3_retriever_tool with data_type='profile'
2. Analyze all retrieved data and provide a complete assessment"""
        if context:
            base += f"\n\nAdditional Context: {context}"
        return base

    def _build_synthesis_prompt(self, transcript, metrics, sentiment) -> str:
        agent_results = {}
        if transcript: agent_results["transcript_analysis"] = transcript
        if metrics: agent_results["financial_metrics"] = metrics
        if sentiment: agent_results["sentiment_analysis"] = sentiment
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={
                "sentiment_rating": "very_positive|positive|neutral|negative|very_negative",
                "key_metrics": ["list of 'Metric: Value' strings"],
                "guidance_changes": ["list of guidance updates"],
                "notable_quotes": ["list of notable management quotes"],
                "risks_identified": ["list of risk factors"],
                "investment_implications": ["list of actionable insights"],
                "summary": "Executive summary with key takeaways and recommendation"},
            domain_context="You are a Senior Earnings Call Analyst for capital markets.")


def parse_earnings_overview(structured: dict) -> EarningsOverview:
    sentiment_map = {"very_positive": SentimentRating.VERY_POSITIVE, "positive": SentimentRating.POSITIVE,
        "neutral": SentimentRating.NEUTRAL, "negative": SentimentRating.NEGATIVE, "very_negative": SentimentRating.VERY_NEGATIVE}
    sentiment = sentiment_map.get(structured.get("sentiment_rating", "neutral"), SentimentRating.NEUTRAL)
    return EarningsOverview(
        sentiment=sentiment,
        key_metrics={m.split(":")[0].strip(): m.split(":", 1)[1].strip() for m in structured.get("key_metrics", []) if ":" in m} if structured.get("key_metrics") else {},
        guidance_changes=structured.get("guidance_changes", []),
        notable_quotes=structured.get("notable_quotes", []),
        risks_identified=structured.get("risks_identified", []))


async def run_earnings_summarization(request: SummarizationRequest) -> SummarizationResponse:
    orchestrator = EarningsSummarizationOrchestrator()
    state = await orchestrator.arun_assessment(request.entity_id, request.summarization_type.value, request.additional_context)

    overview = None
    summary = "Summarization completed"
    recommendations = ["Review full analysis for investment decisions"]
    try:
        structured = extract_json(state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        overview = parse_earnings_overview(structured)
        if structured.get("investment_implications"):
            recommendations = structured["investment_implications"]
    except (ValueError, Exception):
        summary = state.get("final_summary", summary)

    return SummarizationResponse(entity_id=request.entity_id, summarization_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        earnings_overview=overview, recommendations=recommendations, summary=summary,
        raw_analysis={"transcript": state.get("transcript"), "metrics": state.get("metrics"), "sentiment": state.get("sentiment")})
