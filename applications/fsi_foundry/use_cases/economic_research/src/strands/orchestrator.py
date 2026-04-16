"""Economic Research Orchestrator (Strands)."""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import DataAggregator, TrendAnalyst, ResearchWriter
from .agents.data_aggregator import aggregate_data
from .agents.trend_analyst import analyze_trends
from .agents.research_writer import write_research
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    ResearchRequest,
    ResearchResponse,
    ResearchType,
    EconomicOverview,
    EconomicIndicator,
    TrendDirection,
)


class EconomicResearchOrchestrator(StrandsOrchestrator):
    name = "economic_research_orchestrator"

    system_prompt = """You are a Senior Economic Research Director for a capital markets institution.

Your role is to:
1. Coordinate specialist agents (Data Aggregator, Trend Analyst, Research Writer)
2. Synthesize their findings into comprehensive economic research
3. Produce actionable insights for capital markets analysts

When creating the final summary, consider:
- Key economic indicators and their trajectories
- Correlations between indicators
- Clear forecasts with confidence levels
- Investment implications and recommendations

Be concise but thorough. Your summary will be used by analysts and portfolio managers."""

    def __init__(self):
        super().__init__(
            agents={
                "data_aggregator": DataAggregator(),
                "trend_analyst": TrendAnalyst(),
                "research_writer": ResearchWriter(),
            }
        )

    def run_assessment(self, entity_id, research_type="full", context=None):
        data = trend = report = None
        input_text = self._build_input_text(entity_id, context)

        if research_type == "full":
            results = self.run_parallel(
                ["data_aggregator", "trend_analyst", "research_writer"], input_text
            )
            data = {"agent": "data_aggregator", "entity_id": entity_id, "aggregation": results["data_aggregator"].output}
            trend = {"agent": "trend_analyst", "entity_id": entity_id, "trends": results["trend_analyst"].output}
            report = {"agent": "research_writer", "entity_id": entity_id, "report": results["research_writer"].output}
        elif research_type == "data_aggregation":
            r = self.run_agent("data_aggregator", input_text)
            data = {"agent": "data_aggregator", "entity_id": entity_id, "aggregation": r.output}
        elif research_type == "trend_analysis":
            r = self.run_agent("trend_analyst", input_text)
            trend = {"agent": "trend_analyst", "entity_id": entity_id, "trends": r.output}
        elif research_type == "report_generation":
            r = self.run_agent("research_writer", input_text)
            report = {"agent": "research_writer", "entity_id": entity_id, "report": r.output}
        elif research_type == "indicator_focus":
            results = self.run_parallel(["data_aggregator", "trend_analyst"], input_text)
            data = {"agent": "data_aggregator", "entity_id": entity_id, "aggregation": results["data_aggregator"].output}
            trend = {"agent": "trend_analyst", "entity_id": entity_id, "trends": results["trend_analyst"].output}

        summary = self.synthesize({}, self._build_synthesis_prompt(data, trend, report))
        return {
            "entity_id": entity_id,
            "data_aggregation": data,
            "trend_analysis": trend,
            "report": report,
            "final_summary": summary,
        }

    async def arun_assessment(self, entity_id, research_type="full", context=None):
        import asyncio

        data = trend = report = None

        if research_type == "full":
            data, trend, report = await asyncio.gather(
                aggregate_data(entity_id, context),
                analyze_trends(entity_id, context),
                write_research(entity_id, context),
            )
        elif research_type == "data_aggregation":
            data = await aggregate_data(entity_id, context)
        elif research_type == "trend_analysis":
            trend = await analyze_trends(entity_id, context)
        elif research_type == "report_generation":
            report = await write_research(entity_id, context)
        elif research_type == "indicator_focus":
            data, trend = await asyncio.gather(
                aggregate_data(entity_id, context),
                analyze_trends(entity_id, context),
            )

        synthesis_prompt = self._build_synthesis_prompt(data, trend, report)
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None, lambda: self.synthesize({}, synthesis_prompt)
        )

        return {
            "entity_id": entity_id,
            "data_aggregation": data,
            "trend_analysis": trend,
            "report": report,
            "final_summary": summary,
        }

    def _build_input_text(self, entity_id, context=None):
        base = f"""Perform economic research for entity: {entity_id}

Steps to follow:
1. Retrieve the entity profile using s3_retriever_tool with customer_id set to the entity ID and data_type='profile'
2. Analyze all retrieved data
3. Provide a complete assessment"""
        if context:
            base += f"\n\nAdditional Context: {context}"
        return base

    def _build_synthesis_prompt(self, data, trend, report):
        agent_results = {}
        if data:
            agent_results["data_aggregation"] = data
        if trend:
            agent_results["trend_analysis"] = trend
        if report:
            agent_results["research_report"] = report

        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={
                "economic_overview": {
                    "primary_indicator": "gdp|inflation|employment|interest_rates|trade_balance",
                    "trend_direction": "accelerating|stable|decelerating|reversing|uncertain",
                    "key_findings": ["list of key findings"],
                    "forecast_horizon": "string",
                },
                "recommendations": ["list of actionable recommendations"],
                "summary": "Executive summary with key indicators, trends, forecasts, and investment implications",
            },
            domain_context="You are a Senior Economic Research Director for a capital markets institution.",
        )


async def run_economic_research(request: ResearchRequest) -> ResearchResponse:
    """Run the full economic research workflow (Strands implementation)."""
    orchestrator = EconomicResearchOrchestrator()
    final_state = await orchestrator.arun_assessment(
        entity_id=request.entity_id,
        research_type=request.research_type.value,
        context=request.additional_context,
    )

    overview = None
    recommendations = ["Monitor key indicators", "Review forecast assumptions"]
    summary = "Research completed"

    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        recommendations = structured.get("recommendations", recommendations)
        eo = structured.get("economic_overview") or {}
        # Also support flat keys (no nesting)
        pi = eo.get("primary_indicator") or structured.get("primary_indicator", "gdp")
        td = eo.get("trend_direction") or structured.get("trend_direction", "stable")
        fh = eo.get("forecast_horizon") or structured.get("forecast_horizon", "12 months")
        if pi or td:
            overview = EconomicOverview(
                primary_indicator=EconomicIndicator(pi),
                trend_direction=TrendDirection(td),
                data_sources_used=eo.get("data_sources_used", ["Economic data profile"]),
                key_findings=eo.get("key_findings", structured.get("key_findings", {})),
                correlations_identified=eo.get("correlations_identified", []),
                forecast_horizon=fh,
            )
    except (ValueError, Exception):
        summary = final_state.get("final_summary", summary)

    return ResearchResponse(
        entity_id=request.entity_id,
        research_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(),
        economic_overview=overview,
        recommendations=recommendations,
        summary=summary,
        raw_analysis={
            "data_aggregation": final_state.get("data_aggregation"),
            "trend_analysis": final_state.get("trend_analysis"),
            "report": final_state.get("report"),
        },
    )
