"""Migration Planner Agent (Strands)."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool

class MigrationPlanner(StrandsAgent):
    name = "migration_planner"
    system_prompt = """You are an expert Migration Planning Specialist for financial services systems. Create comprehensive migration plans with phased approach, determine dependency ordering for safe migration sequencing, perform risk assessment for each migration phase, estimate effort and resource requirements, design rollback strategies for each phase, and recommend target architectures and technology stacks."""
    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}

async def plan_migration(project_id: str, context: str | None = None) -> dict:
    agent = MigrationPlanner()
    input_text = f"""Create migration plan for project: {project_id}\n\nSteps:\n1. Retrieve the project profile using s3_retriever_tool with customer_id set to the project ID and data_type='profile'\n2. Analyze dependencies and create phased migration plan\n3. Provide risk assessment and rollback strategy\n\n{"Additional Context: " + context if context else ""}"""
    result = await agent.ainvoke(input_text)
    return {"agent": "migration_planner", "project_id": project_id, "analysis": result.output}
