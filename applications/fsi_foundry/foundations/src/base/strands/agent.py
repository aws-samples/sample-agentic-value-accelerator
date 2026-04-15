"""
Strands Base Agent.

Provides a base class for creating Strands agents with minimal configuration.
Optimized for Strands' agent-loop pattern and AgentCore deployment.
"""

from abc import ABC
from typing import Any, Dict, List, Optional

from strands import Agent
from strands.models import BedrockModel

from base.types import AgentConfig, ExecutionResult
from config.settings import settings


class StrandsAgent(ABC):
    """
    Base class for Strands agents.
    
    Leverages Strands' simple agent-loop pattern with Bedrock models.
    Ideal for AgentCore deployment.
    
    Usage:
        class CreditAnalyst(StrandsAgent):
            name = "credit_analyst"
            system_prompt = "You are a credit analyst..."
            tools = [analyze_credit_tool]
        
        analyst = CreditAnalyst()
        result = analyst.invoke("Analyze customer CUST001")
    """
    
    # Override these in subclasses
    name: str = "base_agent"
    system_prompt: str = "You are a helpful assistant."
    tools: List[Any] = []
    model_id: Optional[str] = None
    model_kwargs: Dict[str, Any] = {"temperature": 0.1, "max_tokens": 8192}
    
    def __init__(self, **overrides):
        """
        Initialize agent with optional config overrides.
        
        Args:
            **overrides: Override any class attribute
        """
        self.config = AgentConfig(
            name=overrides.get("name", self.name),
            system_prompt=overrides.get("system_prompt", self.system_prompt),
            tools=overrides.get("tools", self.tools.copy() if self.tools else []),
            model_id=overrides.get("model_id", self.model_id),
            model_kwargs={**self.model_kwargs, **overrides.get("model_kwargs", {})},
        )
        self._agent: Optional[Agent] = None
    
    def _create_model(self) -> BedrockModel:
        """Create the Strands Bedrock model."""
        return BedrockModel(
            model_id=self.config.model_id or settings.effective_bedrock_model_id,
            region_name=settings.aws_region,
            temperature=self.config.model_kwargs.get("temperature", 0.1),
            max_tokens=self.config.model_kwargs.get("max_tokens", 8192),
        )
    
    def _create_agent(self) -> Agent:
        """Create the Strands agent."""
        return Agent(
            model=self._create_model(),
            system_prompt=self.config.system_prompt,
            tools=self.config.tools,
        )
    
    @property
    def agent(self) -> Agent:
        """Lazy-load the agent."""
        if self._agent is None:
            self._agent = self._create_agent()
        return self._agent
    
    def invoke(self, input_text: str) -> ExecutionResult:
        """
        Synchronous execution.
        
        Args:
            input_text: Input prompt for the agent
            
        Returns:
            ExecutionResult with agent output
        """
        result = self.agent(input_text)
        return ExecutionResult(
            agent_name=self.config.name,
            output=str(result),
            raw_output=result,
        )
    
    async def ainvoke(self, input_text: str) -> ExecutionResult:
        """
        Asynchronous execution.
        
        Uses Strands' invoke_async() method for proper async support.
        
        Args:
            input_text: Input prompt for the agent
            
        Returns:
            ExecutionResult with agent output
        """
        # Use Strands' native async method
        result = await self.agent.invoke_async(input_text)
        return ExecutionResult(
            agent_name=self.config.name,
            output=str(result),
            raw_output=result,
        )
    
    def get_config(self) -> AgentConfig:
        """Return the agent configuration."""
        return self.config
    
    def reset(self) -> None:
        """Reset the agent instance."""
        self._agent = None
