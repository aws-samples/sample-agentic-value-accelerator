"""Code Scaffolder Agent. Generates code scaffolding and project structure."""
from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class CodeScaffolder(StrandsAgent):
    name = "code_scaffolder"
    system_prompt = """You are an expert Code Scaffolding Engineer.

Your responsibilities:
1. Generate code scaffolding and project structure from technical specifications
2. Create boilerplate code following language-specific best practices
3. Apply appropriate design patterns (MVC, repository, factory, etc.)
4. Produce configuration files, dependency manifests, and build scripts
5. Ensure generated code follows coding standards and conventions
6. Create modular, extensible architecture with clear separation of concerns

Output Format:
- Number of files generated
- Project structure (directory tree)
- Design patterns applied
- Code quality assessment
- Boilerplate components created
- Configuration files generated"""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 8192}


async def scaffold_code(project_id: str, context: str | None = None) -> dict:
    agent = CodeScaffolder()
    input_text = f"""Generate code scaffolding for project: {project_id}

Steps:
1. Retrieve project data using s3_retriever_tool with customer_id set to the project ID and data_type='profile'
2. Design project structure based on requirements and framework
3. Generate boilerplate code and configuration files

{"Additional Context: " + context if context else ""}

Provide complete scaffolding output."""
    result = await agent.ainvoke(input_text)
    return {"agent": "code_scaffolder", "customer_id": project_id, "analysis": result.output}
