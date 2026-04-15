"""
Research Credit Memo Orchestrator (Strands Implementation).

Orchestrates specialist agents (Data Gatherer, Credit Analyst, Memo Writer)
for comprehensive credit memo generation.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import DataGatherer, CreditAnalyst, MemoWriter
from .agents.data_gatherer import gather_data
from .agents.credit_analyst import analyze_credit
from .agents.memo_writer import write_memo
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    MemoRequest,
    MemoResponse,
    AnalysisType,
    CreditAnalysisDetail,
    CreditRating,
)


class ResearchCreditMemoOrchestrator(StrandsOrchestrator):
    """
    Research Credit Memo Orchestrator using StrandsOrchestrator base class.

    Coordinates Data Gatherer, Credit Analyst, and Memo Writer agents.
    """

    name = "research_credit_memo_orchestrator"

    system_prompt = """You are a Senior Credit Research Supervisor for a capital markets institution.

Your role is to:
1. Coordinate specialist agents (Data Gatherer, Credit Analyst, Memo Writer)
2. Synthesize their findings into a comprehensive credit memo
3. Ensure credit memos are accurate, well-structured, and actionable

When creating the final summary, consider:
- Data completeness and quality of gathered financial information
- Credit analysis rigor including ratio analysis, peer comparison, and risk assessment
- Memo quality including structure, clarity, and professional formatting
- Credit rating recommendation with supporting evidence
- Key risk factors and mitigants that should be highlighted

Be concise but thorough. Your summary will be used by credit analysts and investment committees for decision-making."""

    def __init__(self):
        super().__init__(
            agents={
                "data_gatherer": DataGatherer(),
                "credit_analyst": CreditAnalyst(),
                "memo_writer": MemoWriter(),
            }
        )

    def run_assessment(
        self,
        entity_id: str,
        analysis_type: str = "full",
        context: str | None = None,
    ) -> Dict[str, Any]:
        """Run the credit memo workflow."""
        data_result = None
        credit_result = None
        memo_result = None

        input_text = self._build_input_text(entity_id, context)

        if analysis_type == "full":
            results = self.run_parallel(
                ["data_gatherer", "credit_analyst", "memo_writer"],
                input_text,
            )
            data_result = {"agent": "data_gatherer", "entity_id": entity_id, "analysis": results["data_gatherer"].output}
            credit_result = {"agent": "credit_analyst", "entity_id": entity_id, "analysis": results["credit_analyst"].output}
            memo_result = {"agent": "memo_writer", "entity_id": entity_id, "analysis": results["memo_writer"].output}
        elif analysis_type == "data_gathering":
            result = self.run_agent("data_gatherer", input_text)
            data_result = {"agent": "data_gatherer", "entity_id": entity_id, "analysis": result.output}
        elif analysis_type == "credit_analysis":
            results = self.run_parallel(["data_gatherer", "credit_analyst"], input_text)
            data_result = {"agent": "data_gatherer", "entity_id": entity_id, "analysis": results["data_gatherer"].output}
            credit_result = {"agent": "credit_analyst", "entity_id": entity_id, "analysis": results["credit_analyst"].output}
        elif analysis_type == "memo_generation":
            results = self.run_parallel(["data_gatherer", "credit_analyst", "memo_writer"], input_text)
            data_result = {"agent": "data_gatherer", "entity_id": entity_id, "analysis": results["data_gatherer"].output}
            credit_result = {"agent": "credit_analyst", "entity_id": entity_id, "analysis": results["credit_analyst"].output}
            memo_result = {"agent": "memo_writer", "entity_id": entity_id, "analysis": results["memo_writer"].output}

        synthesis_prompt = self._build_synthesis_prompt(data_result, credit_result, memo_result)
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "entity_id": entity_id,
            "data_gatherer_result": data_result,
            "credit_analyst_result": credit_result,
            "memo_writer_result": memo_result,
            "final_summary": summary,
        }

    async def arun_assessment(
        self,
        entity_id: str,
        analysis_type: str = "full",
        context: str | None = None,
    ) -> Dict[str, Any]:
        """Async version of run_assessment."""
        import asyncio

        data_result = None
        credit_result = None
        memo_result = None

        if analysis_type == "full":
            data_result, credit_result, memo_result = await asyncio.gather(
                gather_data(entity_id, context),
                analyze_credit(entity_id, context),
                write_memo(entity_id, context),
            )
        elif analysis_type == "data_gathering":
            data_result = await gather_data(entity_id, context)
        elif analysis_type == "credit_analysis":
            data_result, credit_result = await asyncio.gather(
                gather_data(entity_id, context),
                analyze_credit(entity_id, context),
            )
        elif analysis_type == "memo_generation":
            data_result, credit_result, memo_result = await asyncio.gather(
                gather_data(entity_id, context),
                analyze_credit(entity_id, context),
                write_memo(entity_id, context),
            )

        synthesis_prompt = self._build_synthesis_prompt(data_result, credit_result, memo_result)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None,
            lambda: self.synthesize({}, synthesis_prompt),
        )

        return {
            "entity_id": entity_id,
            "data_gatherer_result": data_result,
            "credit_analyst_result": credit_result,
            "memo_writer_result": memo_result,
            "final_summary": summary,
        }

    def _build_input_text(self, entity_id: str, context: str | None = None) -> str:
        base = f"""Perform a comprehensive analysis for entity: {entity_id}

Steps to follow:
1. Retrieve the entity's profile data using the s3_retriever_tool with data_type='profile'
2. Retrieve relevant financial and market data using the s3_retriever_tool
3. Analyze all retrieved data and provide a complete assessment"""

        if context:
            base += f"\n\nAdditional Context: {context}"
        return base

    def _build_synthesis_prompt(self, data_result, credit_result, memo_result) -> str:
        agent_results = {}
        if data_result:
            agent_results["data_gathering"] = data_result
        if credit_result:
            agent_results["credit_analysis"] = credit_result
        if memo_result:
            agent_results["memo_writing"] = memo_result
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={
                "credit_analysis": {
                    "rating": "AAA|AA|A|BBB|BB|B|CCC|CC|C|D",
                    "confidence_score": "float 0-1",
                    "key_ratios": ["list"],
                    "risk_factors": ["list"],
                    "peer_comparison_notes": ["list"],
                },
                "recommendations": ["list of credit recommendations"],
                "summary": "Executive summary of the credit memo",
            },
            domain_context="You are a Senior Credit Research Supervisor for a capital markets institution.",
        )


async def run_research_credit_memo(request: MemoRequest) -> MemoResponse:
    """Run the full research credit memo workflow (Strands implementation)."""
    orchestrator = ResearchCreditMemoOrchestrator()
    final_state = await orchestrator.arun_assessment(
        entity_id=request.entity_id,
        analysis_type=request.analysis_type.value,
        context=request.additional_context,
    )

    credit_analysis, summary = None, "Credit memo generation completed"
    recommendations = []
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        recommendations = structured.get("recommendations", [])
        if structured.get("credit_analysis"):
            ca = structured["credit_analysis"]
            credit_analysis = CreditAnalysisDetail(
                rating=CreditRating(ca.get("rating", "BBB")),
                confidence_score=ca.get("confidence_score", 0.5),
                key_ratios=ca.get("key_ratios", []),
                risk_factors=ca.get("risk_factors", []),
                peer_comparison_notes=ca.get("peer_comparison_notes", []),
            )
    except (ValueError, Exception):
        summary = final_state.get("final_summary") or summary

    return MemoResponse(
        entity_id=request.entity_id,
        memo_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(),
        credit_analysis=credit_analysis,
        recommendations=recommendations,
        summary=summary,
        raw_analysis={
            "data_gatherer": final_state.get("data_gatherer_result"),
            "credit_analyst": final_state.get("credit_analyst_result"),
            "memo_writer": final_state.get("memo_writer_result"),
        },
    )
