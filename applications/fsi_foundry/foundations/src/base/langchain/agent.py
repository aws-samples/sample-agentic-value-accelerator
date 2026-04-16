"""
LangChain Base Agent.

Provides a base class for creating standalone LangChain agents with AgentExecutor.
Optimized for chain-based workflows without LangGraph state management.
"""

from abc import ABC
from typing import Any, Dict, List, Optional

from langchain_aws import ChatBedrock
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain.memory import ConversationBufferMemory

from base.types import AgentConfig, ExecutionResult
from config.settings import settings


class LangChainAgent(ABC):
    """
    Base class for standalone LangChain agents.
    
    Similar to LangGraphAgent but optimized for chain-based workflows
    with built-in memory support.
    
    Usage:
        class ChatAgent(LangChainAgent):
            name = "chat_agent"
            system_prompt = "You are a helpful assistant..."
            tools = [search_tool]
            use_memory = True
        
        agent = ChatAgent()
        result = agent.invoke("Hello!")
        result = agent.invoke("What did I just say?")  # Has memory
    """
    
    # Override these in subclasses
    name: str = "base_agent"
    system_prompt: str = "You are a helpful assistant."
    tools: List[Any] = []
    model_id: Optional[str] = None
    model_kwargs: Dict[str, Any] = {"temperature": 0.1, "max_tokens": 600}
    verbose: bool = True
    max_iterations: int = 5
    use_memory: bool = False
    
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
            verbose=overrides.get("verbose", self.verbose),
            max_iterations=overrides.get("max_iterations", self.max_iterations),
        )
        self._use_memory = overrides.get("use_memory", self.use_memory)
        self._executor: Optional[AgentExecutor] = None
        self._memory: Optional[ConversationBufferMemory] = None
    
    def _create_llm(self) -> ChatBedrock:
        """Create the Bedrock LLM instance."""
        return ChatBedrock(
            model_id=self.config.model_id or settings.bedrock_model_id,
            region_name=settings.aws_region,
            model_kwargs=self.config.model_kwargs,
            streaming=False,
        )
    
    def _create_memory(self) -> ConversationBufferMemory:
        """Create conversation memory if enabled."""
        return ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True,
        )
    
    def _create_prompt(self) -> ChatPromptTemplate:
        """Create the prompt template."""
        messages = [("system", self.config.system_prompt)]
        
        if self._use_memory:
            messages.append(MessagesPlaceholder(variable_name="chat_history", optional=True))
        
        messages.extend([
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ])
        
        return ChatPromptTemplate.from_messages(messages)
    
    def _create_executor(self) -> AgentExecutor:
        """Create the agent executor."""
        llm = self._create_llm()
        prompt = self._create_prompt()
        agent = create_tool_calling_agent(llm, self.config.tools, prompt)
        
        executor_kwargs = {
            "agent": agent,
            "tools": self.config.tools,
            "verbose": self.config.verbose,
            "handle_parsing_errors": True,
            "max_iterations": self.config.max_iterations,
        }
        
        if self._use_memory:
            self._memory = self._create_memory()
            executor_kwargs["memory"] = self._memory
        
        return AgentExecutor(**executor_kwargs)
    
    @property
    def executor(self) -> AgentExecutor:
        """Lazy-load the executor."""
        if self._executor is None:
            self._executor = self._create_executor()
        return self._executor
    
    @property
    def memory(self) -> Optional[ConversationBufferMemory]:
        """Access the conversation memory if enabled."""
        return self._memory
    
    def invoke(self, input_text: str, **kwargs) -> ExecutionResult:
        """
        Synchronous execution.
        
        Args:
            input_text: Input prompt for the agent
            **kwargs: Additional arguments
            
        Returns:
            ExecutionResult with agent output
        """
        result = self.executor.invoke({"input": input_text, **kwargs})
        return ExecutionResult(
            agent_name=self.config.name,
            output=result.get("output", ""),
            raw_output=result,
        )
    
    async def ainvoke(self, input_text: str, **kwargs) -> ExecutionResult:
        """
        Asynchronous execution.
        
        Args:
            input_text: Input prompt for the agent
            **kwargs: Additional arguments
            
        Returns:
            ExecutionResult with agent output
        """
        result = await self.executor.ainvoke({"input": input_text, **kwargs})
        return ExecutionResult(
            agent_name=self.config.name,
            output=result.get("output", ""),
            raw_output=result,
        )
    
    def get_config(self) -> AgentConfig:
        """Return the agent configuration."""
        return self.config
    
    def clear_memory(self) -> None:
        """Clear conversation memory if enabled."""
        if self._memory:
            self._memory.clear()
    
    def reset(self) -> None:
        """Reset executor and memory."""
        self._executor = None
        self._memory = None
