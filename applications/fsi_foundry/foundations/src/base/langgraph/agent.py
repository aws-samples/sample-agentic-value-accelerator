"""
LangGraph Base Agent.

Provides a base class for creating LangGraph-compatible agents with minimal configuration.
Subclasses define system_prompt, tools, and model settings; base class handles execution.
"""

from abc import ABC
from typing import Any, Dict, List, Optional

from langchain_aws import ChatBedrockConverse
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.agents import create_tool_calling_agent, AgentExecutor

from base.types import AgentConfig, ExecutionResult
from config.settings import settings


class LangGraphAgent(ABC):
    """
    Base class for LangGraph-compatible agents.
    
    Subclasses define configuration via class attributes; base class handles
    LLM initialization, prompt construction, and execution.
    
    Usage:
        class CreditAnalyst(LangGraphAgent):
            name = "credit_analyst"
            system_prompt = "You are a credit analyst..."
            tools = [s3_retriever_tool]
            model_kwargs = {"temperature": 0.1}
        
        analyst = CreditAnalyst()
        result = await analyst.ainvoke("Analyze customer CUST001")
    """
    
    # Override these in subclasses
    name: str = "base_agent"
    system_prompt: str = "You are a helpful assistant."
    tools: List[Any] = []
    model_id: Optional[str] = None
    model_kwargs: Dict[str, Any] = {"temperature": 0.1, "max_tokens": 4096}
    verbose: bool = True
    max_iterations: int = 5
    
    def __init__(self, **overrides):
        """
        Initialize agent with optional config overrides.
        
        Args:
            **overrides: Override any class attribute (name, system_prompt, tools, etc.)
        """
        self.config = AgentConfig(
            name=overrides.get("name", self.name),
            system_prompt=overrides.get("system_prompt", self.system_prompt),
            tools=overrides.get("tools", self.tools.copy() if self.tools else []),
            model_id=overrides.get("model_id", self.model_id),
            model_kwargs={**self.model_kwargs, **overrides.get("model_kwargs", {})},
            verbose=overrides.get("verbose", self.verbose),
            max_iterations=overrides.get("max_iterations", self.max_iterations),
        )
        self._executor: Optional[AgentExecutor] = None
    
    def _create_llm(self) -> ChatBedrockConverse:
        """Create the Bedrock LLM instance using the Converse API for native tool calling."""
        return ChatBedrockConverse(
            model_id=self.config.model_id or settings.bedrock_model_id or settings.effective_bedrock_model_id,
            region_name=settings.aws_region,
            temperature=self.config.model_kwargs.get("temperature", 0.1),
            max_tokens=self.config.model_kwargs.get("max_tokens", 4096),
        )
    
    def _create_prompt(self) -> ChatPromptTemplate:
        """Create the prompt template with system prompt and placeholders."""
        return ChatPromptTemplate.from_messages([
            ("system", self.config.system_prompt),
            MessagesPlaceholder(variable_name="chat_history", optional=True),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ])
    
    def _create_executor(self) -> AgentExecutor:
        """Create the agent executor with LLM, tools, and prompt."""
        llm = self._create_llm()
        prompt = self._create_prompt()
        agent = create_tool_calling_agent(llm, self.config.tools, prompt)
        
        return AgentExecutor(
            agent=agent,
            tools=self.config.tools,
            verbose=self.config.verbose,
            handle_parsing_errors=True,
            max_iterations=self.config.max_iterations,
        )
    
    @property
    def executor(self) -> AgentExecutor:
        """Lazy-load the executor on first access."""
        if self._executor is None:
            self._executor = self._create_executor()
        return self._executor
    
    def invoke(self, input_text: str, **kwargs) -> ExecutionResult:
        """
        Synchronous execution.
        
        Args:
            input_text: Input prompt for the agent
            **kwargs: Additional arguments passed to executor
            
        Returns:
            ExecutionResult with agent output
        """
        result = self.executor.invoke({"input": input_text, **kwargs})
        output = result.get("output", "")
        # ChatBedrockConverse may return list of content blocks instead of string
        if isinstance(output, list):
            output = "\n".join(
                block.get("text", str(block)) if isinstance(block, dict) else str(block)
                for block in output
            )
        return ExecutionResult(
            agent_name=self.config.name,
            output=output,
            raw_output=result,
        )
    
    async def ainvoke(self, input_text: str, **kwargs) -> ExecutionResult:
        """
        Asynchronous execution.
        
        Args:
            input_text: Input prompt for the agent
            **kwargs: Additional arguments passed to executor
            
        Returns:
            ExecutionResult with agent output
        """
        result = await self.executor.ainvoke({"input": input_text, **kwargs})
        output = result.get("output", "")
        # ChatBedrockConverse may return list of content blocks instead of string
        if isinstance(output, list):
            output = "\n".join(
                block.get("text", str(block)) if isinstance(block, dict) else str(block)
                for block in output
            )
        return ExecutionResult(
            agent_name=self.config.name,
            output=output,
            raw_output=result,
        )
    
    def get_config(self) -> AgentConfig:
        """Return the agent configuration."""
        return self.config
    
    def reset(self) -> None:
        """Reset the executor (useful for testing or reconfiguration)."""
        self._executor = None
