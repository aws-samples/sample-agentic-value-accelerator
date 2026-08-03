"""Structured Output with LangGraph.

Use model.with_structured_output(PydanticModel) to get typed responses.

Reference: https://python.langchain.com/docs/how_to/structured_output/
"""
from pydantic import BaseModel, Field
from typing import List
from langchain_aws import ChatBedrockConverse


class Analysis(BaseModel):
    summary: str = Field(description="Brief summary")
    key_findings: List[str] = Field(description="Key findings")
    confidence: float = Field(ge=0, le=1, description="Confidence score")
    recommendation: str = Field(description="Recommended action")


model = ChatBedrockConverse(model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0")
structured_model = model.with_structured_output(Analysis)

if __name__ == "__main__":
    result = structured_model.invoke("Analyze the impact of AI on healthcare")
    # result is already an Analysis instance
    print(f"Summary: {result.summary}")
    print(f"Findings: {result.key_findings}")
