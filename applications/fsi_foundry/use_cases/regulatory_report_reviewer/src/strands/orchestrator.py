"""Regulatory Report Reviewer Orchestrator (Strands Implementation)."""

import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import CompletenessChecker, LanguageReviewer, QualityAssessor
from .agents.completeness_checker import check_completeness
from .agents.language_reviewer import review_language
from .agents.quality_assessor import assess_quality
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    ReviewRequest, ReviewResponse, ReportType, QualityLevel,
    CompletenessResult, LanguageComplianceResult, QualityResult,
)


class RegulatoryReportReviewerOrchestrator(StrandsOrchestrator):
    name = "regulatory_report_reviewer_orchestrator"
    system_prompt = """You are a Senior Regulatory Compliance Reviewer for a financial institution.

Your role is to:
1. Coordinate specialist agents (Completeness Checker, Language Reviewer, Quality Assessor)
2. Synthesize their findings into a comprehensive review of the regulatory filing
3. Provide a clear pass/fail determination with actionable revision guidance

When creating the final summary, consider:
- Overall quality score combining completeness, language, and quality assessments
- Specific missing sections or fields that must be addressed
- Language issues that could trigger regulatory scrutiny or rejection
- Whether the report is ready for submission or needs revision
- Priority-ordered list of revisions if the report does not pass

Be precise and actionable. Your review will be used by compliance officers to decide
whether to submit the filing or return it for revision."""

    def __init__(self):
        super().__init__(agents={
            "completeness_checker": CompletenessChecker(),
            "language_reviewer": LanguageReviewer(),
            "quality_assessor": QualityAssessor(),
        })

    def run_assessment(self, bucket: str, key: str, report_type: str = "other", review_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        completeness_result = language_result = quality_result = None
        input_text = self._build_input_text(bucket, key, report_type, context)

        if review_type == "full":
            results = self.run_parallel(["completeness_checker", "language_reviewer", "quality_assessor"], input_text)
            completeness_result = {"agent": "completeness_checker", "analysis": results["completeness_checker"].output}
            language_result = {"agent": "language_reviewer", "analysis": results["language_reviewer"].output}
            quality_result = {"agent": "quality_assessor", "analysis": results["quality_assessor"].output}
        elif review_type == "completeness":
            r = self.run_agent("completeness_checker", input_text)
            completeness_result = {"agent": "completeness_checker", "analysis": r.output}
        elif review_type == "language_compliance":
            r = self.run_agent("language_reviewer", input_text)
            language_result = {"agent": "language_reviewer", "analysis": r.output}
        else:
            r = self.run_agent("quality_assessor", input_text)
            quality_result = {"agent": "quality_assessor", "analysis": r.output}

        summary = self.synthesize({}, self._build_synthesis_prompt(completeness_result, language_result, quality_result))
        return {"bucket": bucket, "key": key, "completeness_result": completeness_result, "language_result": language_result, "quality_result": quality_result, "final_summary": summary}

    async def arun_assessment(self, bucket: str, key: str, report_type: str = "other", review_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        import asyncio
        completeness_result = language_result = quality_result = None

        if review_type == "full":
            completeness_result, language_result, quality_result = await asyncio.gather(
                check_completeness(bucket, key, report_type, context),
                review_language(bucket, key, report_type, context),
                assess_quality(bucket, key, report_type, context),
            )
        elif review_type == "completeness":
            completeness_result = await check_completeness(bucket, key, report_type, context)
        elif review_type == "language_compliance":
            language_result = await review_language(bucket, key, report_type, context)
        else:
            quality_result = await assess_quality(bucket, key, report_type, context)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, self._build_synthesis_prompt(completeness_result, language_result, quality_result)))
        return {"bucket": bucket, "key": key, "completeness_result": completeness_result, "language_result": language_result, "quality_result": quality_result, "final_summary": summary}

    def _build_input_text(self, bucket: str, key: str, report_type: str, context: str | None = None) -> str:
        base = f"""Review the regulatory report at bucket={bucket}, key={key}.
Report type: {report_type}

Steps:
1. Retrieve the report using s3_retriever_tool
2. Analyze according to your specialization
3. Provide a complete assessment"""
        if context:
            base += f"\n\nAdditional Context: {context}"
        return base

    def _build_synthesis_prompt(self, *args, **kwargs) -> str:
        agent_results = {}
        for a in args:
            if isinstance(a, dict):
                for k, v in a.items():
                    if v is not None:
                        agent_results[k] = v
        for k, v in kwargs.items():
            if v is not None:
                agent_results[k] = v
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={"summary": "Executive summary", "fields": "All structured fields"},
            domain_context=self.system_prompt)


async def run_regulatory_review(request):
    """Run the regulatory report review workflow."""
    orchestrator = RegulatoryReportReviewerOrchestrator()
    final_state = await orchestrator.arun_assessment(
        bucket=request.bucket,
        key=request.key,
        report_type=request.report_type.value if hasattr(request.report_type, 'value') else str(request.report_type),
        review_type=request.review_type.value if hasattr(request.review_type, 'value') else str(request.review_type),
    )

    completeness = None
    language_compliance = None
    quality = None
    summary = "Review completed"

    try:
        structured = extract_json(final_state.get('final_summary', '{}'))
        summary = structured.get("summary", summary)

        if structured.get("completeness_score") is not None:
            completeness = CompletenessResult(
                missing_sections=structured.get("missing_sections", []),
                missing_fields=structured.get("missing_fields", []),
                score=structured.get("completeness_score", 50))

        if structured.get("language_score") is not None:
            language_compliance = LanguageComplianceResult(
                issues=structured.get("language_issues", []),
                suggestions=structured.get("language_suggestions", []),
                score=structured.get("language_score", 50))

        if structured.get("quality_score") is not None:
            level = QualityLevel.NEEDS_REVISION
            qs = structured.get("quality_score", 50)
            if qs >= 80:
                level = QualityLevel.PASS
            elif qs < 50:
                level = QualityLevel.FAIL
            quality = QualityResult(
                level=level, score=qs,
                strengths=structured.get("strengths", []),
                revisions=structured.get("revisions", []))
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return ReviewResponse(
        review_id=str(uuid.uuid4()),
        bucket=request.bucket,
        key=request.key,
        timestamp=datetime.utcnow(),
        report_type=request.report_type,
        completeness=completeness,
        language_compliance=language_compliance,
        quality=quality,
        summary=summary,
        raw_analysis={
            "completeness_checker": final_state.get("completeness_result"),
            "language_reviewer": final_state.get("language_result"),
            "quality_assessor": final_state.get("quality_result"),
        },
    )
