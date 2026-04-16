"""Legacy Migration Orchestrator (Strands)."""
import json, uuid
from datetime import datetime
from base.strands import StrandsOrchestrator
from .agents import CodeAnalyzer, MigrationPlanner, ConversionAgent
from .agents.code_analyzer import analyze_code
from .agents.migration_planner import plan_migration
from .agents.conversion_agent import convert_code
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (MigrationRequest, MigrationResponse, MigrationScope, CodeAnalysisResult, MigrationPlanResult, ConversionResult, ComplexityLevel)


class LegacyMigrationOrchestrator(StrandsOrchestrator):
    name = "legacy_migration_orchestrator"
    system_prompt = """You are a Senior Legacy Migration Architect for financial services institutions.

Your role is to:
1. Coordinate specialist agents (Code Analyzer, Migration Planner, Conversion Agent)
2. Synthesize their findings into a comprehensive migration assessment
3. Ensure legacy systems are migrated safely and efficiently

When creating the final summary, consider:
- Code analysis completeness and accuracy of dependency mapping
- Migration plan feasibility, risk levels, and phasing strategy
- Conversion confidence scores and areas requiring manual review
- Overall migration readiness and recommended next steps
- Compliance and regulatory considerations for financial systems

Be concise but thorough. Your summary will be used by engineering teams and stakeholders."""

    def __init__(self):
        super().__init__(agents={
            "code_analyzer": CodeAnalyzer(),
            "migration_planner": MigrationPlanner(),
            "conversion_agent": ConversionAgent(),
        })

    def run_assessment(self, project_id, migration_scope="full", context=None):
        ca = mp = cv = None
        input_text = self._build_input_text(project_id, context)
        if migration_scope == "full":
            results = self.run_parallel(["code_analyzer", "migration_planner", "conversion_agent"], input_text)
            ca = {"agent": "code_analyzer", "project_id": project_id, "analysis": results["code_analyzer"].output}
            mp = {"agent": "migration_planner", "project_id": project_id, "analysis": results["migration_planner"].output}
            cv = {"agent": "conversion_agent", "project_id": project_id, "analysis": results["conversion_agent"].output}
        elif migration_scope == "code_analysis":
            r = self.run_agent("code_analyzer", input_text)
            ca = {"agent": "code_analyzer", "project_id": project_id, "analysis": r.output}
        elif migration_scope == "planning":
            results = self.run_parallel(["code_analyzer", "migration_planner"], input_text)
            ca = {"agent": "code_analyzer", "project_id": project_id, "analysis": results["code_analyzer"].output}
            mp = {"agent": "migration_planner", "project_id": project_id, "analysis": results["migration_planner"].output}
        elif migration_scope == "conversion":
            results = self.run_parallel(["code_analyzer", "conversion_agent"], input_text)
            ca = {"agent": "code_analyzer", "project_id": project_id, "analysis": results["code_analyzer"].output}
            cv = {"agent": "conversion_agent", "project_id": project_id, "analysis": results["conversion_agent"].output}
        summary = self.synthesize({}, self._build_synthesis_prompt(ca, mp, cv))
        return {"project_id": project_id, "code_analysis": ca, "migration_plan": mp, "conversion_output": cv, "final_summary": summary}

    async def arun_assessment(self, project_id, migration_scope="full", context=None):
        import asyncio
        ca = mp = cv = None
        if migration_scope == "full":
            ca, mp, cv = await asyncio.gather(analyze_code(project_id, context), plan_migration(project_id, context), convert_code(project_id, context))
        elif migration_scope == "code_analysis":
            ca = await analyze_code(project_id, context)
        elif migration_scope == "planning":
            ca, mp = await asyncio.gather(analyze_code(project_id, context), plan_migration(project_id, context))
        elif migration_scope == "conversion":
            ca, cv = await asyncio.gather(analyze_code(project_id, context), convert_code(project_id, context))
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, self._build_synthesis_prompt(ca, mp, cv)))
        return {"project_id": project_id, "code_analysis": ca, "migration_plan": mp, "conversion_output": cv, "final_summary": summary}

    def _build_input_text(self, project_id, context=None):
        base = f"""Perform legacy migration analysis for project: {project_id}\n\nSteps:\n1. Retrieve the project profile using s3_retriever_tool with customer_id set to the project ID and data_type='profile'\n2. Analyze all retrieved data\n3. Provide a complete assessment"""
        return base + (f"\n\nAdditional Context: {context}" if context else "")

    def _build_synthesis_prompt(self, ca, mp, cv):
        agent_results = {}
        if ca: agent_results["code_analysis"] = ca
        if mp: agent_results["migration_plan"] = mp
        if cv: agent_results["conversion"] = cv
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={
                "complexity_level": "low|medium|high|critical",
                "languages_detected": ["list of languages"],
                "estimated_effort_days": "integer",
                "conversion_confidence": "float 0.0-1.0",
                "risks": ["list of key risks"],
                "recommendations": ["list of actionable recommendations"],
                "summary": "Executive summary with migration readiness, key findings, risks, and next steps",
            },
            domain_context="You are a Senior Legacy Migration Architect for financial services institutions.",
        )


async def run_legacy_migration(request: MigrationRequest) -> MigrationResponse:
    orchestrator = LegacyMigrationOrchestrator()
    final_state = await orchestrator.arun_assessment(
        project_id=request.project_id, migration_scope=request.migration_scope.value, context=request.additional_context)
    code_analysis, migration_plan, conversion_output, summary = None, None, None, "Migration analysis completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        cl = structured.get("complexity_level", "medium")
        if request.migration_scope in [MigrationScope.FULL, MigrationScope.CODE_ANALYSIS, MigrationScope.PLANNING, MigrationScope.CONVERSION]:
            code_analysis = CodeAnalysisResult(
                languages_detected=structured.get("languages_detected", []),
                complexity_level=ComplexityLevel(cl) if cl in [e.value for e in ComplexityLevel] else ComplexityLevel.MEDIUM,
                dependencies=structured.get("dependencies", []),
                risks=structured.get("risks", []))
        if request.migration_scope in [MigrationScope.FULL, MigrationScope.PLANNING]:
            migration_plan = MigrationPlanResult(
                estimated_effort_days=int(structured.get("estimated_effort_days", 0)),
                risk_assessment=structured.get("risks", []),
                rollback_strategy=structured.get("rollback_strategy", ""))
        if request.migration_scope in [MigrationScope.FULL, MigrationScope.CONVERSION]:
            conversion_output = ConversionResult(
                conversion_confidence=float(structured.get("conversion_confidence", 0.0)),
                patterns_converted=structured.get("patterns_converted", []),
                target_framework=structured.get("target_framework", ""))
    except (ValueError, Exception):
        summary = final_state.get("final_summary", summary)
    return MigrationResponse(
        project_id=request.project_id, migration_id=str(uuid.uuid4()), timestamp=datetime.utcnow(),
        code_analysis=code_analysis, migration_plan=migration_plan, conversion_output=conversion_output, summary=summary,
        raw_analysis={"code_analysis": final_state.get("code_analysis"), "migration_plan": final_state.get("migration_plan"), "conversion": final_state.get("conversion_output")})
