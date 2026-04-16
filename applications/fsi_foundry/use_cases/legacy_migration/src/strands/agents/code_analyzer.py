"""Code Analyzer Agent (Strands)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class CodeAnalyzer(StrandsAgent):
    name = "code_analyzer"
    system_prompt = """You are an expert Legacy Code Analyzer for financial services systems. Analyze legacy codebase structure and architecture, identify programming languages, frameworks, and libraries, map dependencies between modules and external systems, assess complexity metrics (cyclomatic complexity, coupling, cohesion), catalog technology patterns and anti-patterns, and identify technical debt and modernization opportunities."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def analyze_code(project_id: str, context: str | None = None) -> dict:
    agent = CodeAnalyzer()
    input_text = f"""Analyze legacy codebase for project: {project_id}\n\nSteps:\n1. Retrieve the project profile using s3_retriever_tool with customer_id set to the project ID and data_type='profile'\n2. Analyze codebase structure, dependencies, and complexity\n3. Provide structured analysis\n\n{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "code_analyzer", "project_id": project_id, "analysis": result.output}
