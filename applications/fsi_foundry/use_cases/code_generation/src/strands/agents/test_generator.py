"""Test Generator Agent. Generates unit and integration tests."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class TestGenerator(StrandsAgent):
    name = "test_generator"
    system_prompt = """You are an expert Test Generation Engineer.

Your responsibilities:
1. Generate unit tests covering individual functions and methods
2. Create integration tests for component interactions and API endpoints
3. Produce test fixtures and mock data for reproducible testing
4. Ensure test coverage meets target thresholds
5. Apply testing best practices (AAA pattern, descriptive names, edge cases)
6. Generate test documentation and coverage reports

Output Format:
- Number of unit tests generated
- Number of integration tests generated
- Estimated test coverage percentage
- Test frameworks used
- Test fixtures created
- Manual testing notes"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def generate_tests(project_id: str, context: str | None = None) -> dict:
    agent = TestGenerator()
    input_text = f"""Generate tests for project: {project_id}

Steps:
1. Retrieve project data using s3_retriever_tool with customer_id set to the project ID and data_type='profile'
2. Analyze the project requirements and modules
3. Generate unit and integration tests with fixtures

{"Additional Context: " + context if context else ""}

Provide complete test generation output."""
    result = await agent.ainvoke(input_text)
    return {"agent": "test_generator", "customer_id": project_id, "analysis": result.output}
