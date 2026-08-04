"""Multi-Agent: Swarm Pattern (Strands).

Agents can hand off to each other dynamically. The Swarm manages
conversation flow between agents with automatic handoff tools.

Reference: https://github.com/strands-agents/samples/tree/main/python/01-learn/11-swarm
"""
from strands import Agent
from strands.models import BedrockModel
from strands.multiagent import Swarm

model = BedrockModel(model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0")

triage = Agent(
    name="triage",
    model=model,
    system_prompt="""You are a triage agent. Classify the user's request and hand off to:
- sales_agent: for pricing, purchasing, product questions
- support_agent: for technical issues, bugs, troubleshooting""",
)

sales = Agent(
    name="sales_agent",
    model=model,
    system_prompt="You are a sales agent. Help with pricing and product questions.",
)

support = Agent(
    name="support_agent",
    model=model,
    system_prompt="You are a support agent. Help with technical issues.",
)

# Swarm auto-adds handoff tools to each agent
swarm = Swarm(agents=[triage, sales, support], max_handoffs=5)

if __name__ == "__main__":
    result = swarm.execute(agent=triage, prompt="I need help with a billing issue")
    print(result.message)
