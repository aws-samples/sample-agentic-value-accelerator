"""
LangChain Base Orchestrator.

Provides a base class for chain-based orchestration without LangGraph StateGraph.
Simpler than LangGraphOrchestrator, suitable for linear or simple branching workflows.
"""

from abc import ABC
from typing import Any, Dict, List, Optional, Callable
import asyncio

from langchain_aws import ChatBedrock
from langchain_core.messages import HumanMessage, SystemMessage

from base.types import OrchestratorConfig, ExecutionResult
from base.langchain.agent import LangChainAgent
from config.settings import settings


class LangChainOrchestrator(ABC):
    """
    Base class for chain-based orchestrators.
    
    Provides simpler orchestration patterns without LangGraph state management.
    Good for linear pipelines and simple multi-agent coordination.
    
    Usage:
        class SimpleOrchestrator(LangChainOrchestrator):
            name = "simple_orchestrator"
            
            def __init__(self):
                super().__init__(agents={
                    "analyzer": AnalyzerAgent(),
                    "summarizer": SummarizerAgent(),
                })
            
            async def run_workflow(self, input_text: str) -> str:
                analysis = await self.run_agent("analyzer", input_text)
                summary = await self.run_agent("summarizer", analysis.output)
                return summary.output
    """
    
    name: str = "base_orchestrator"
    system_prompt: str = "You are a workflow orchestrator."
    model_id: Optional[str] = None
    model_kwargs: Dict[str, Any] = {"temperature": 0.2, "max_tokens": 600}
    
    def __init__(self, **overrides):
        """
        Initialize orchestrator with agents.
        
        Args:
            **overrides: Override class attributes (name, agents, etc.)
        """
        self.config = OrchestratorConfig(
            name=overrides.get("name", self.name),
            agents=overrides.get("agents", {}),
            model_id=overrides.get("model_id", self.model_id),
            model_kwargs={**self.model_kwargs, **overrides.get("model_kwargs", {})},
        )
    
    def _create_llm(self) -> ChatBedrock:
        """Create LLM for synthesis."""
        return ChatBedrock(
            model_id=self.config.model_id or settings.bedrock_model_id,
            region_name=settings.aws_region,
            model_kwargs=self.config.model_kwargs,
            streaming=False,
        )
    
    def add_agent(self, key: str, agent: LangChainAgent) -> None:
        """Register an agent."""
        self.config.agents[key] = agent
    
    def get_agents(self) -> Dict[str, LangChainAgent]:
        """Return registered agents."""
        return self.config.agents
    
    async def run_agent(self, key: str, input_text: str, **kwargs) -> ExecutionResult:
        """
        Run a single agent by key.
        
        Args:
            key: Agent key
            input_text: Input for the agent
            **kwargs: Additional arguments
            
        Returns:
            ExecutionResult from the agent
        """
        agent = self.config.agents[key]
        return await agent.ainvoke(input_text, **kwargs)
    
    async def run_parallel(self, agent_keys: List[str], input_text: str) -> Dict[str, ExecutionResult]:
        """
        Run multiple agents in parallel with same input.
        
        Args:
            agent_keys: List of agent keys to run
            input_text: Input for all agents
            
        Returns:
            Dictionary mapping keys to results
        """
        agents = [self.config.agents[k] for k in agent_keys]
        tasks = [agent.ainvoke(input_text) for agent in agents]
        results = await asyncio.gather(*tasks)
        return {key: result for key, result in zip(agent_keys, results)}
    
    async def run_sequential(
        self,
        agent_keys: List[str],
        initial_input: str,
        transform: Optional[Callable[[ExecutionResult], str]] = None
    ) -> List[ExecutionResult]:
        """
        Run agents sequentially, passing output to next agent.
        
        Args:
            agent_keys: List of agent keys in execution order
            initial_input: Input for first agent
            transform: Optional function to transform result to next input
            
        Returns:
            List of results from each agent
        """
        results = []
        current_input = initial_input
        
        for key in agent_keys:
            result = await self.run_agent(key, current_input)
            results.append(result)
            
            if transform:
                current_input = transform(result)
            else:
                current_input = result.output
        
        return results
    
    async def synthesize(
        self,
        results: Dict[str, ExecutionResult],
        synthesis_prompt: str
    ) -> str:
        """
        Synthesize multiple agent results.
        
        Args:
            results: Dictionary of agent results
            synthesis_prompt: Prompt for synthesis
            
        Returns:
            Synthesized output
        """
        llm = self._create_llm()
        
        messages = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(content=synthesis_prompt),
        ]
        
        response = await llm.ainvoke(messages)
        return response.content
    
    async def run(self, input_text: str) -> ExecutionResult:
        """
        Default run method - override in subclasses for custom workflow.
        
        Args:
            input_text: Input for the workflow
            
        Returns:
            Final result
        """
        # Default: run all agents in parallel and synthesize
        if not self.config.agents:
            return ExecutionResult(
                agent_name=self.config.name,
                output="No agents configured",
            )
        
        results = await self.run_parallel(
            list(self.config.agents.keys()),
            input_text
        )
        
        # Build synthesis prompt
        sections = [f"## {k}\n{r.output}" for k, r in results.items()]
        synthesis_prompt = f"Synthesize these results:\n\n{''.join(sections)}"
        
        output = await self.synthesize(results, synthesis_prompt)
        
        return ExecutionResult(
            agent_name=self.config.name,
            output=output,
            raw_output=results,
        )
