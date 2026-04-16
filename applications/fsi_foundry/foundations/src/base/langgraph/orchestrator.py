"""
LangGraph Base Orchestrator.

Provides a base class for creating LangGraph orchestrators that coordinate multiple agents.
Subclasses define agents and build_graph(); base class handles execution and common patterns.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Type, TypeVar, Callable
import asyncio

from langgraph.graph import StateGraph, END
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from base.types import OrchestratorConfig, ExecutionResult
from base.langgraph.agent import LangGraphAgent
from config.settings import settings

StateT = TypeVar('StateT', bound=dict)


class LangGraphOrchestrator(ABC):
    """
    Base class for LangGraph orchestrators.
    
    Subclasses define:
    - state_schema: TypedDict for state management
    - agents: Dictionary of agent instances
    - build_graph(): Method to construct the workflow graph
    
    Usage:
        class KYCOrchestrator(LangGraphOrchestrator):
            state_schema = KYCState
            
            def __init__(self):
                super().__init__(
                    name="kyc_orchestrator",
                    agents={
                        "credit": CreditAnalyst(),
                        "compliance": ComplianceOfficer(),
                    }
                )
            
            def build_graph(self) -> StateGraph:
                workflow = StateGraph(self.state_schema)
                # Define workflow nodes and edges
                return workflow.compile()
    """
    
    # Override these in subclasses
    name: str = "base_orchestrator"
    system_prompt: str = "You are a workflow orchestrator that synthesizes results from multiple agents."
    state_schema: Type[StateT] = dict
    model_id: Optional[str] = None
    model_kwargs: Dict[str, Any] = {"temperature": 0.2, "max_tokens": 4096}
    
    def __init__(self, **overrides):
        """
        Initialize orchestrator with agents and config.
        
        Args:
            **overrides: Override class attributes (name, agents, model_id, etc.)
        """
        self.config = OrchestratorConfig(
            name=overrides.get("name", self.name),
            agents=overrides.get("agents", {}),
            model_id=overrides.get("model_id", self.model_id),
            model_kwargs={**self.model_kwargs, **overrides.get("model_kwargs", {})},
        )
        self._graph = None
    
    def _create_llm(self) -> ChatBedrockConverse:
        """Create LLM for synthesis and routing decisions using the Converse API."""
        return ChatBedrockConverse(
            model_id=self.config.model_id or settings.bedrock_model_id or settings.effective_bedrock_model_id,
            region_name=settings.aws_region,
            temperature=self.config.model_kwargs.get("temperature", 0.2),
            max_tokens=self.config.model_kwargs.get("max_tokens", 4096),
        )
    
    def add_agent(self, key: str, agent: LangGraphAgent) -> None:
        """
        Register an agent with the orchestrator.
        
        Args:
            key: Unique key to identify the agent
            agent: LangGraphAgent instance
        """
        self.config.agents[key] = agent
        self._graph = None  # Reset compiled graph
    
    def get_agents(self) -> Dict[str, LangGraphAgent]:
        """Return dictionary of registered agents."""
        return self.config.agents
    
    @abstractmethod
    def build_graph(self) -> StateGraph:
        """
        Build the LangGraph workflow. Must be implemented by subclasses.
        
        Returns:
            Compiled StateGraph ready for execution
        """
        pass
    
    @property
    def graph(self) -> StateGraph:
        """Lazy-load the compiled graph on first access."""
        if self._graph is None:
            self._graph = self.build_graph()
        return self._graph
    
    def create_agent_node(
        self,
        agent: LangGraphAgent,
        input_key: str = "input",
        output_key: Optional[str] = None
    ) -> Callable:
        """
        Create a LangGraph node function from an agent.
        
        Args:
            agent: LangGraphAgent instance
            input_key: State key to extract input from
            output_key: State key to store result (defaults to {agent.name}_result)
            
        Returns:
            Async function suitable for use as a graph node
        """
        result_key = output_key or f"{agent.config.name}_result"
        
        async def node(state: StateT) -> StateT:
            input_text = self._extract_input(state, input_key)
            result = await agent.ainvoke(input_text)
            return {**state, result_key: result}
        
        return node
    
    def _extract_input(self, state: StateT, key: str = "input") -> str:
        """
        Extract input text from state.
        
        Args:
            state: Current state dictionary
            key: Key to extract input from
            
        Returns:
            Input string for agent
        """
        # Try direct key first
        if key in state and state[key]:
            return str(state[key])
        
        # Try messages
        if "messages" in state and state["messages"]:
            last_msg = state["messages"][-1]
            if hasattr(last_msg, "content"):
                return last_msg.content
            return str(last_msg)
        
        return ""
    
    async def run_parallel(
        self,
        agent_keys: List[str],
        state: StateT,
        input_key: str = "input"
    ) -> Dict[str, ExecutionResult]:
        """
        Run multiple agents in parallel.
        
        Args:
            agent_keys: List of agent keys to run
            state: Current state
            input_key: State key to extract input from
            
        Returns:
            Dictionary mapping agent keys to their results
        """
        agents = [self.config.agents[k] for k in agent_keys]
        input_text = self._extract_input(state, input_key)
        
        tasks = [agent.ainvoke(input_text) for agent in agents]
        results = await asyncio.gather(*tasks)
        
        return {key: result for key, result in zip(agent_keys, results)}
    
    async def synthesize(
        self,
        results: Dict[str, Any],
        synthesis_prompt: str,
        system_prompt: Optional[str] = None
    ) -> str:
        """
        Synthesize results from multiple agents using LLM.
        
        Args:
            results: Dictionary of agent results to synthesize
            synthesis_prompt: Prompt describing how to synthesize
            system_prompt: Optional override for system prompt
            
        Returns:
            Synthesized output string
        """
        llm = self._create_llm()
        
        messages = [
            SystemMessage(content=system_prompt or self.system_prompt),
            HumanMessage(content=synthesis_prompt),
        ]
        
        response = await llm.ainvoke(messages)
        content = response.content
        # ChatBedrockConverse may return list of content blocks instead of string
        if isinstance(content, list):
            content = "\n".join(
                block.get("text", str(block)) if isinstance(block, dict) else str(block)
                for block in content
            )
        return content
    
    def run(self, initial_state: StateT) -> StateT:
        """
        Synchronous execution of the workflow.
        
        Args:
            initial_state: Initial state to start workflow
            
        Returns:
            Final state after workflow completion
        """
        return self.graph.invoke(initial_state)
    
    async def arun(self, initial_state: StateT) -> StateT:
        """
        Asynchronous execution of the workflow.
        
        Args:
            initial_state: Initial state to start workflow
            
        Returns:
            Final state after workflow completion
        """
        return await self.graph.ainvoke(initial_state)
    
    def reset(self) -> None:
        """Reset the compiled graph (useful after adding agents)."""
        self._graph = None
