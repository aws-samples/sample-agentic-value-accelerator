"""Structured Output with Strands.

Strands has BUILT-IN structured output support. Pass a Pydantic model
to the agent call and access the parsed result directly.

Reference: https://strandsagents.com/latest/user-guide/concepts/agents/structured-output/
"""
from pydantic import BaseModel, Field
from typing import List
from strands import Agent
from strands.models import BedrockModel


# Define your output schema
class Analysis(BaseModel):
    summary: str = Field(description="Brief summary")
    key_findings: List[str] = Field(description="Key findings")
    confidence: float = Field(ge=0, le=1, description="Confidence score")
    recommendation: str = Field(description="Recommended action")


agent = Agent(
    model=BedrockModel(model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
    system_prompt="You are an analyst. Analyze the given topic thoroughly.",
)

if __name__ == "__main__":
    # Pass structured_output_model to get typed response
    result = agent("Analyze the impact of AI on healthcare", structured_output_model=Analysis)

    # Access fields directly — no JSON parsing needed
    analysis = result.structured_output
    print(f"Summary: {analysis.summary}")
    print(f"Findings: {analysis.key_findings}")
    print(f"Confidence: {analysis.confidence}")
    print(f"Recommendation: {analysis.recommendation}")
