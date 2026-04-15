"""Conversion Agent."""
from base.langgraph import LangGraphAgent
from tools.s3_retriever import s3_retriever_tool

class ConversionAgent(LangGraphAgent):
    name = "conversion_agent"
    system_prompt = """You are an expert Code Conversion Specialist for financial services systems. Convert legacy code patterns to modern equivalents, apply language-specific refactoring rules and best practices, generate modernized code with proper structure and documentation, identify areas requiring manual review or intervention, ensure converted code maintains functional equivalence, and produce conversion confidence scores for each transformation."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 4096}

async def convert_code(project_id: str, context: str | None = None) -> dict:
    agent = ConversionAgent()
    input_text = f"""Convert legacy code for project: {project_id}\n\nSteps:\n1. Retrieve the project profile using s3_retriever_tool with customer_id set to the project ID and data_type='profile'\n2. Analyze legacy patterns and convert to modern equivalents\n3. Provide conversion confidence scores\n\n{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "conversion_agent", "project_id": project_id, "analysis": result.output}
