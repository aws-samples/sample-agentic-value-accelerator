"""Multi-Agent: Agents as Tools (Strands).

The simplest multi-agent pattern. Pass Agent instances directly in the
orchestrator's tools=[] array. Strands auto-wraps them as callable tools.

Reference: https://github.com/strands-agents/samples/tree/main/python/01-learn/10-agents-as-tools
"""
from strands import Agent
from strands.models import BedrockModel

model = BedrockModel(model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0")

# Specialist agents
researcher = Agent(
    name="researcher",
    model=model,
    system_prompt="You are a research specialist. Find and analyze information.",
)

writer = Agent(
    name="writer",
    model=model,
    system_prompt="You are a writing specialist. Create clear, structured content.",
)

# Orchestrator — agents passed directly as tools
orchestrator = Agent(
    model=model,
    system_prompt="""You are a supervisor. Route requests to specialists:
- researcher: for finding information
- writer: for creating content
Always delegate to the appropriate specialist.""",
    tools=[researcher, writer],
)

if __name__ == "__main__":
    result = orchestrator("Research AI trends and write a summary")
    print(result.message)
