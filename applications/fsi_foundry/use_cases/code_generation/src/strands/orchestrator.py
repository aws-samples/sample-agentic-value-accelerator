"""Code Generation Orchestrator (Strands Implementation)."""
import json, uuid
from datetime import datetime
from typing import Dict, Any
from base.strands import StrandsOrchestrator
from .agents import RequirementAnalyst, CodeScaffolder, TestGenerator
from .agents.requirement_analyst import analyze_requirements
from .agents.code_scaffolder import scaffold_code
from .agents.test_generator import generate_tests
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    GenerationScope, GenerationRequest, GenerationResponse,
    RequirementAnalysisResult, ScaffoldedCodeResult, TestGenerationResult, CodeQuality,
)


class CodeGenerationOrchestrator(StrandsOrchestrator):
    name = "code_generation_orchestrator"
    system_prompt = """You are a Senior Software Engineering Lead specializing in AI-powered code generation.

Your role is to:
1. Coordinate specialist agents (Requirement Analyst, Code Scaffolder, Test Generator)
2. Synthesize their findings into a comprehensive code generation report
3. Ensure generated code meets quality standards and requirements

When creating the final summary, consider:
- Completeness and accuracy of requirement analysis
- Quality and structure of scaffolded code
- Test coverage and testing strategy adequacy
- Alignment between requirements, code, and tests
- Recommendations for manual review and refinement

Be concise but thorough. Your summary will be used by development teams and technical leads."""

    def __init__(self):
        super().__init__(agents={
            "requirement_analyst": RequirementAnalyst(),
            "code_scaffolder": CodeScaffolder(),
            "test_generator": TestGenerator(),
        })

    def run_assessment(self, project_id: str, generation_scope: str = "full", context: str | None = None) -> Dict[str, Any]:
        ra = cs = tg = None
        input_text = self._build_input_text(project_id, context)
        if generation_scope == "full":
            results = self.run_parallel(["requirement_analyst", "code_scaffolder", "test_generator"], input_text)
            ra = {"agent": "requirement_analyst", "customer_id": project_id, "analysis": results["requirement_analyst"].output}
            cs = {"agent": "code_scaffolder", "customer_id": project_id, "analysis": results["code_scaffolder"].output}
            tg = {"agent": "test_generator", "customer_id": project_id, "analysis": results["test_generator"].output}
        elif generation_scope == "requirements_only":
            r = self.run_agent("requirement_analyst", input_text)
            ra = {"agent": "requirement_analyst", "customer_id": project_id, "analysis": r.output}
        elif generation_scope == "scaffolding_only":
            r = self.run_agent("code_scaffolder", input_text)
            cs = {"agent": "code_scaffolder", "customer_id": project_id, "analysis": r.output}
        elif generation_scope == "testing_only":
            r = self.run_agent("test_generator", input_text)
            tg = {"agent": "test_generator", "customer_id": project_id, "analysis": r.output}
        summary = self.synthesize({}, self._build_synthesis_prompt(ra, cs, tg))
        return {"customer_id": project_id, "requirement_analyst_result": ra, "code_scaffolder_result": cs, "test_generator_result": tg, "final_summary": summary}

    async def arun_assessment(self, project_id: str, generation_scope: str = "full", context: str | None = None) -> Dict[str, Any]:
        import asyncio
        ra = cs = tg = None
        if generation_scope == "full":
            ra, cs, tg = await asyncio.gather(analyze_requirements(project_id, context), scaffold_code(project_id, context), generate_tests(project_id, context))
        elif generation_scope == "requirements_only":
            ra = await analyze_requirements(project_id, context)
        elif generation_scope == "scaffolding_only":
            cs = await scaffold_code(project_id, context)
        elif generation_scope == "testing_only":
            tg = await generate_tests(project_id, context)
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, self._build_synthesis_prompt(ra, cs, tg)))
        return {"customer_id": project_id, "requirement_analyst_result": ra, "code_scaffolder_result": cs, "test_generator_result": tg, "final_summary": summary}

    def _build_input_text(self, project_id: str, context: str | None = None) -> str:
        base = f"""Analyze project: {project_id}

Steps:
1. Retrieve project data using s3_retriever_tool with data_type='profile'
2. Analyze the project thoroughly
3. Provide complete assessment"""
        return base + (f"\n\nAdditional Context: {context}" if context else "")

    def _build_synthesis_prompt(self, ra, cs, tg) -> str:
        agent_results = {}
        if ra: agent_results["requirement_analysis"] = ra
        if cs: agent_results["scaffolded_code"] = cs
        if tg: agent_results["test_generation"] = tg
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={
                "requirement_analysis": {"functional_requirements": ["list"], "non_functional_requirements": ["list"], "dependencies": ["list"], "data_models": ["list"], "risks": ["list"]},
                "scaffolded_code": {"files_generated": "int", "project_structure": ["list"], "design_patterns_applied": ["list"], "code_quality": "low|medium|high|production_ready", "boilerplate_components": ["list"]},
                "test_generation": {"unit_tests_generated": "int", "integration_tests_generated": "int", "test_coverage_estimate": "float 0-100", "test_frameworks_used": ["list"], "test_fixtures_created": ["list"]},
                "summary": "Executive summary with quality assessment and recommendations",
            },
            domain_context="You are a Senior Software Engineering Lead.",
        )


async def run_code_generation(request: GenerationRequest) -> GenerationResponse:
    orchestrator = CodeGenerationOrchestrator()
    final_state = await orchestrator.arun_assessment(
        project_id=request.project_id, generation_scope=request.generation_scope.value, context=request.additional_context)

    requirement_analysis = scaffolded_code = test_output = None
    summary = "Generation completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        if request.generation_scope in [GenerationScope.FULL, GenerationScope.REQUIREMENTS_ONLY]:
            if structured.get("requirement_analysis"):
                requirement_analysis = RequirementAnalysisResult(**structured["requirement_analysis"])
        if request.generation_scope in [GenerationScope.FULL, GenerationScope.SCAFFOLDING_ONLY]:
            if structured.get("scaffolded_code"):
                scaffolded_code = ScaffoldedCodeResult(**structured["scaffolded_code"])
        if request.generation_scope in [GenerationScope.FULL, GenerationScope.TESTING_ONLY]:
            if structured.get("test_generation"):
                test_output = TestGenerationResult(**structured["test_generation"])
    except (ValueError, Exception):
        summary = final_state.get("final_summary", summary)

    return GenerationResponse(
        project_id=request.project_id, generation_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        requirement_analysis=requirement_analysis, scaffolded_code=scaffolded_code, test_output=test_output,
        summary=summary, raw_analysis={"requirement_analysis": final_state.get("requirement_analyst_result"),
        "scaffolded_code": final_state.get("code_scaffolder_result"), "test_generation": final_state.get("test_generator_result")},
    )
