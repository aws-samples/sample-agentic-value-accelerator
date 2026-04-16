"""
Data Analytics Orchestrator (Strands Implementation).

Orchestrates specialist agents (Data Explorer, Statistical Analyst, Insight Generator)
for comprehensive data analytics assessment in capital markets.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import DataExplorer, StatisticalAnalyst, InsightGenerator
from .agents.data_explorer import explore_data
from .agents.statistical_analyst import analyze_statistics
from .agents.insight_generator import generate_insights
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    AnalyticsRequest,
    AnalyticsResponse,
    AssessmentType,
    AnalyticsDetail,
    DataQuality,
    InsightConfidence,
)


class DataAnalyticsOrchestrator(StrandsOrchestrator):
    """
    Data Analytics Orchestrator using StrandsOrchestrator base class.

    Coordinates Data Explorer, Statistical Analyst, and Insight Generator agents
    for comprehensive data analytics assessment.
    """

    name = "data_analytics_orchestrator"

    system_prompt = """You are a Senior Data Analytics Supervisor for a capital markets institution.

Your role is to:
1. Coordinate specialist agents (Data Explorer, Statistical Analyst, Insight Generator)
2. Synthesize their findings into a comprehensive analytics assessment
3. Ensure analytical rigor, data quality awareness, and actionable insight delivery

When creating the final summary, consider:
- Data quality and completeness assessment from the exploration phase
- Statistical significance and robustness of findings
- Confidence levels assigned to each insight and recommendation
- Practical implications for capital markets decision-making
- Suggested visualizations and further analytical directions

Be concise but thorough. Your summary will be used by capital markets analysts."""

    def __init__(self):
        super().__init__(
            agents={
                "data_explorer": DataExplorer(),
                "statistical_analyst": StatisticalAnalyst(),
                "insight_generator": InsightGenerator(),
            }
        )

    def run_assessment(
        self,
        entity_id: str,
        assessment_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """Run the data analytics assessment workflow."""
        import asyncio

        explorer_result = None
        stats_result = None
        insight_result = None

        if assessment_type == "full":
            explorer_result = asyncio.get_event_loop().run_until_complete(explore_data(entity_id, context))
            stats_result = asyncio.get_event_loop().run_until_complete(analyze_statistics(entity_id, context))
            insight_result = asyncio.get_event_loop().run_until_complete(generate_insights(entity_id, context))
        elif assessment_type == "data_exploration":
            explorer_result = asyncio.get_event_loop().run_until_complete(explore_data(entity_id, context))
        elif assessment_type == "statistical_analysis":
            explorer_result = asyncio.get_event_loop().run_until_complete(explore_data(entity_id, context))
            stats_result = asyncio.get_event_loop().run_until_complete(analyze_statistics(entity_id, context))
        elif assessment_type == "insight_generation":
            stats_result = asyncio.get_event_loop().run_until_complete(analyze_statistics(entity_id, context))
            insight_result = asyncio.get_event_loop().run_until_complete(generate_insights(entity_id, context))

        synthesis_prompt = self._build_synthesis_prompt(explorer_result, stats_result, insight_result)
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "entity_id": entity_id,
            "data_explorer_result": explorer_result,
            "statistical_analyst_result": stats_result,
            "insight_generator_result": insight_result,
            "final_summary": summary,
        }

    async def arun_assessment(
        self,
        entity_id: str,
        assessment_type: str = "full",
        context: str | None = None
    ) -> Dict[str, Any]:
        """Async version of run_assessment."""
        import asyncio

        explorer_result = None
        stats_result = None
        insight_result = None

        if assessment_type == "full":
            explorer_result, stats_result, insight_result = await asyncio.gather(
                explore_data(entity_id, context),
                analyze_statistics(entity_id, context),
                generate_insights(entity_id, context),
            )
        elif assessment_type == "data_exploration":
            explorer_result = await explore_data(entity_id, context)
        elif assessment_type == "statistical_analysis":
            explorer_result, stats_result = await asyncio.gather(
                explore_data(entity_id, context),
                analyze_statistics(entity_id, context),
            )
        elif assessment_type == "insight_generation":
            stats_result, insight_result = await asyncio.gather(
                analyze_statistics(entity_id, context),
                generate_insights(entity_id, context),
            )

        synthesis_prompt = self._build_synthesis_prompt(explorer_result, stats_result, insight_result)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt)
        )

        return {
            "entity_id": entity_id,
            "data_explorer_result": explorer_result,
            "statistical_analyst_result": stats_result,
            "insight_generator_result": insight_result,
            "final_summary": summary,
        }

    def _build_input_text(self, entity_id: str, context: str | None = None) -> str:
        """Build input text for agents."""
        base = f"""Perform a comprehensive analysis for entity: {entity_id}

Steps to follow:
1. Retrieve the entity's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant data using the s3_retriever_tool
3. Analyze all retrieved data and provide a complete assessment"""

        if context:
            base += f"\n\nAdditional Context: {context}"

        return base

    def _build_synthesis_prompt(self, explorer_result, stats_result, insight_result) -> str:
        """Build synthesis prompt from agent results."""
        sections = []
        if explorer_result:
            sections.append(f"## Data Exploration\n{json.dumps(explorer_result, indent=2)}")
        if stats_result:
            sections.append(f"## Statistical Analysis\n{json.dumps(stats_result, indent=2)}")
        if insight_result:
            sections.append(f"## Insight Generation\n{json.dumps(insight_result, indent=2)}")

        return f"""Based on the following specialist assessment{"s" if len(sections) > 1 else ""}, provide a final data analytics assessment:

{chr(10).join(sections)}

Provide a concise executive summary that includes:
1. Data Quality Classification (high/medium/low/insufficient)
2. Key Patterns and Statistical Findings
3. Insight Confidence Level
4. Visualization Recommendations
5. Actionable Recommendations for analysts"""



async def run_data_analytics(request: AnalyticsRequest) -> AnalyticsResponse:
    """Run the full data analytics assessment workflow (Strands implementation)."""
    orchestrator = DataAnalyticsOrchestrator()
    final_state = await orchestrator.arun_assessment(
        entity_id=request.entity_id,
        assessment_type=request.assessment_type.value,
        context=request.additional_context)

    analytics_detail = None
    recommendations = []
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        if structured.get("data_quality"):
            analytics_detail = AnalyticsDetail(
                data_quality=DataQuality(structured.get("data_quality", "medium")),
                insight_confidence=InsightConfidence(structured.get("insight_confidence", "medium")),
                patterns_identified=structured.get("patterns_identified", []),
                statistical_findings=structured.get("statistical_findings", []),
                visualization_suggestions=structured.get("visualization_suggestions", []),
                data_coverage_pct=structured.get("data_coverage_pct", 0.0))
        recommendations = structured.get("recommendations", [])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return AnalyticsResponse(
        entity_id=request.entity_id, analytics_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(), analytics_detail=analytics_detail,
        recommendations=recommendations, summary=summary,
        raw_analysis={
            "data_explorer": final_state.get("data_explorer_result"),
            "statistical_analyst": final_state.get("statistical_analyst_result"),
            "insight_generator": final_state.get("insight_generator_result")},
    )
