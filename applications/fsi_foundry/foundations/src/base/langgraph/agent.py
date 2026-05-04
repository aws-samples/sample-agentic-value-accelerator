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
from utils.telemetry import setup_tracing, get_langfuse_callback_handler


class LangGraphAgent(ABC):
    """
    Base class for LangGraph-compatible agents.

    Subclasses define configuration via class attributes; base class handles
    LLM initialization, prompt construction, and execution.

    When tracing is enabled (via settings.enable_tracing), a Langfuse callback
    handler is automatically injected into invoke/ainvoke calls.

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
    max_iterations: int = 2  # Reduced from 5 to prevent iteration bloat in parallel execution

    def __init__(self, **overrides):
        """
        Initialize agent with optional config overrides.

        Args:
            **overrides: Override any class attribute (name, system_prompt, tools, etc.)
                enable_tracing: Override settings.enable_tracing for this agent
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
        self._enable_tracing = overrides.get("enable_tracing", settings.enable_tracing)

        # Initialize tracing (no-op if already initialized or disabled)
        if self._enable_tracing:
            setup_tracing()
        self._langfuse_handler = get_langfuse_callback_handler() if self._enable_tracing else None
    
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
    
    def _inject_callbacks(self, kwargs: dict) -> dict:
        """Inject Langfuse callback handler into executor kwargs if tracing is enabled."""
        if self._langfuse_handler:
            config = kwargs.pop("config", {})
            callbacks = config.get("callbacks", [])
            callbacks.append(self._langfuse_handler)
            config["callbacks"] = callbacks
            kwargs["config"] = config
        return kwargs

    def invoke(self, input_text: str, **kwargs) -> ExecutionResult:
        """
        Synchronous execution.

        Args:
            input_text: Input prompt for the agent
            **kwargs: Additional arguments passed to executor

        Returns:
            ExecutionResult with agent output
        """
        kwargs = self._inject_callbacks(kwargs)
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
        kwargs = self._inject_callbacks(kwargs)
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
