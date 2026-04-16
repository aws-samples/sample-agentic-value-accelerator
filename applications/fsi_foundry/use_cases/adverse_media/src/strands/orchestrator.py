"""
Adverse Media Orchestrator (Strands Implementation).

Orchestrates specialist agents for adverse media screening.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import MediaScreener, SentimentAnalyst, RiskSignalExtractor
from .agents.media_screener import screen_media
from .agents.sentiment_analyst import analyze_sentiment
from .agents.risk_signal_extractor import extract_risk_signals
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    ScreeningRequest,
    ScreeningResponse,
    ScreeningType,
    MediaFindings,
    SentimentLevel,
    RiskSignal,
    RiskSeverity,
)


class AdverseMediaOrchestrator(StrandsOrchestrator):
    name = "adverse_media_orchestrator"

    system_prompt = """You are a Senior Adverse Media Analyst for a financial institution.

Your role is to:
1. Coordinate specialist agents (Media Screener, Sentiment Analyst, Risk Signal Extractor)
2. Synthesize their findings into a comprehensive adverse media screening report
3. Ensure screenings are thorough, evidence-based, and actionable

When creating the final summary, consider:
- Breadth and depth of media sources screened
- Severity and consistency of sentiment across findings
- Confidence levels and reliability of extracted risk signals
- Entity linkage strength and corroborating evidence
- Recommended actions and monitoring adjustments
- Escalation needs for critical or high-severity signals

Be precise and thorough. Your summary will be used by compliance officers and risk managers."""

    def __init__(self):
        super().__init__(
            agents={
                "media_screener": MediaScreener(),
                "sentiment_analyst": SentimentAnalyst(),
                "risk_signal_extractor": RiskSignalExtractor(),
            }
        )

    def run_assessment(self, entity_id: str, screening_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        media_result = None
        sentiment_result = None
        risk_signal_result = None
        input_text = self._build_input_text(entity_id, context)

        if screening_type == "full":
            results = self.run_parallel(
                ["media_screener", "sentiment_analyst", "risk_signal_extractor"], input_text
            )
            media_result = {"agent": "media_screener", "entity_id": entity_id, "analysis": results["media_screener"].output}
            sentiment_result = {"agent": "sentiment_analyst", "entity_id": entity_id, "analysis": results["sentiment_analyst"].output}
            risk_signal_result = {"agent": "risk_signal_extractor", "entity_id": entity_id, "analysis": results["risk_signal_extractor"].output}
        elif screening_type == "media_screening":
            result = self.run_agent("media_screener", input_text)
            media_result = {"agent": "media_screener", "entity_id": entity_id, "analysis": result.output}
        elif screening_type == "sentiment_analysis":
            result = self.run_agent("sentiment_analyst", input_text)
            sentiment_result = {"agent": "sentiment_analyst", "entity_id": entity_id, "analysis": result.output}
        elif screening_type == "risk_extraction":
            result = self.run_agent("risk_signal_extractor", input_text)
            risk_signal_result = {"agent": "risk_signal_extractor", "entity_id": entity_id, "analysis": result.output}

        synthesis_prompt = self._build_synthesis_prompt(media_result, sentiment_result, risk_signal_result)
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "entity_id": entity_id,
            "media_screening": media_result,
            "sentiment_analysis": sentiment_result,
            "risk_signal_extraction": risk_signal_result,
            "final_summary": summary,
        }

    async def arun_assessment(self, entity_id: str, screening_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        import asyncio

        media_result = None
        sentiment_result = None
        risk_signal_result = None

        if screening_type == "full":
            media_result, sentiment_result, risk_signal_result = await asyncio.gather(
                screen_media(entity_id, context),
                analyze_sentiment(entity_id, context),
                extract_risk_signals(entity_id, context),
            )
        elif screening_type == "media_screening":
            media_result = await screen_media(entity_id, context)
        elif screening_type == "sentiment_analysis":
            sentiment_result = await analyze_sentiment(entity_id, context)
        elif screening_type == "risk_extraction":
            risk_signal_result = await extract_risk_signals(entity_id, context)

        synthesis_prompt = self._build_synthesis_prompt(media_result, sentiment_result, risk_signal_result)
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, synthesis_prompt))

        return {
            "entity_id": entity_id,
            "media_screening": media_result,
            "sentiment_analysis": sentiment_result,
            "risk_signal_extraction": risk_signal_result,
            "final_summary": summary,
        }

    def _build_input_text(self, entity_id: str, context: str | None = None) -> str:
        base = f"""Perform a comprehensive analysis for entity: {entity_id}

Steps:
1. Retrieve the entity's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant media data using the s3_retriever_tool
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



async def run_adverse_media(request):
    """Run the assessment workflow."""
    orchestrator = AdverseMediaOrchestrator()
    final_state = await orchestrator.arun_assessment(
        entity_id=request.entity_id,
        screening_type=request.screening_type.value if hasattr(request.screening_type, 'value') else str(request.screening_type),
        context=getattr(request, 'additional_context', None))

    media_findings = None; risk_signals = []
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get('final_summary', '{}'))
        summary = structured.get("summary", summary)

        if structured.get("sentiment"):
            media_findings = MediaFindings(articles_screened=structured.get("articles_screened", 0),
                adverse_mentions=structured.get("adverse_mentions", 0),
                sentiment=SentimentLevel(structured.get("sentiment", "neutral")),
                categories=structured.get("categories", []),
                key_findings=structured.get("key_findings", []), sources=[])
        risk_signals = [RiskSignal(signal_type="general", severity=RiskSeverity.MEDIUM, confidence=0.7,
            description=s, source_references=[], entity_linkage=None) for s in structured.get("risk_signals", [])]
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return ScreeningResponse(
        entity_id=request.entity_id, screening_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), media_findings=media_findings, risk_signals=risk_signals,
        summary=summary,
        raw_analysis={"media_screening": final_state.get("media_screening"), "sentiment_analysis": final_state.get("sentiment_analysis"), "risk_signal_extraction": final_state.get("risk_signal_extraction")},
    )
