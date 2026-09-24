"""Models for Bedrock Flows and Prompts governance."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class FlowSummary(BaseModel):
    """Summary of a Bedrock Flow."""
    id: str
    name: str
    arn: str
    status: str
    description: Optional[str] = None
    version: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class FlowDetail(BaseModel):
    """Detailed Bedrock Flow."""
    id: str
    name: str
    arn: str
    status: str
    description: Optional[str] = None
    version: Optional[str] = None
    execution_role_arn: Optional[str] = None
    definition: Optional[dict] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PromptSummary(BaseModel):
    """Summary of a Bedrock Prompt."""
    id: str
    name: str
    arn: str
    version: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PromptDetail(BaseModel):
    """Detailed Bedrock Prompt."""
    id: str
    name: str
    arn: str
    version: Optional[str] = None
    description: Optional[str] = None
    default_variant: Optional[str] = None
    variants: Optional[List[dict]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class FlowsResponse(BaseModel):
    """Response containing list of flows."""
    flows: List[FlowSummary]
    live: bool = False
    note: Optional[str] = None


class FlowDetailResponse(BaseModel):
    """Response containing flow details."""
    flow: Optional[FlowDetail] = None
    live: bool = False
    note: Optional[str] = None


class PromptsResponse(BaseModel):
    """Response containing list of prompts."""
    prompts: List[PromptSummary]
    live: bool = False
    note: Optional[str] = None


class PromptDetailResponse(BaseModel):
    """Response containing prompt details."""
    prompt: Optional[PromptDetail] = None
    live: bool = False
    note: Optional[str] = None


class BedrockAssetsOverviewResponse(BaseModel):
    """Combined overview of all Bedrock assets."""
    flows_count: int = 0
    prompts_count: int = 0
    flows: List[FlowSummary] = []
    prompts: List[PromptSummary] = []
    live: bool = False
    note: Optional[str] = None
