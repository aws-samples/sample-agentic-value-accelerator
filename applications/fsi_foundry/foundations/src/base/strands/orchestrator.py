"""
Strands Base Orchestrator.

Provides a base class for coordinating multiple Strands agents.
Optimized for Strands' agent-loop pattern.
"""

from abc import ABC
from typing import Any, Dict, List, Optional
import asyncio
from concurrent.futures import ThreadPoolExecutor

from strands import Agent
from strands.models import BedrockModel

from base.types import OrchestratorConfig, ExecutionResult
from base.strands.agent import StrandsAgent
from config.settings import settings


class StrandsOrchestrator(ABC):
    """
    Base class for Strands orchestrators.
    
    Coordinates multiple Strands agents with parallel and sequential patterns.
    
    Usage:
        class AnalysisOrchestrator(StrandsOrchestrator):
            name = "analysis_orchestrator"
            
            def __init__(self):
                super().__init__(agents={
                    "analyzer": AnalyzerAgent(),
                    "reviewer": ReviewerAgent(),
                })
    """
    
    name: str = "base_orchestrator"
    system_prompt: str = "You are a workflow orchestrator."
    model_id: Optional[str] = None
    model_kwargs: Dict[str, Any] = {"temperature": 0.2, "max_tokens": 8192}
    
    def __init__(self, **overrides):
        """
        Initialize orchestrator with agents.
        
        Args:
            **overrides: Override class attributes
        """
        self.config = OrchestratorConfig(
            name=overrides.get("name", self.name),
            agents=overrides.get("agents", {}),
            model_id=overrides.get("model_id", self.model_id),
            model_kwargs={**self.model_kwargs, **overrides.get("model_kwargs", {})},
        )
        self._synthesis_agent: Optional[Agent] = None
    
    def _create_synthesis_agent(self) -> Agent:
        """Create agent for synthesizing results."""
        model = BedrockModel(
            model_id=self.config.model_id or settings.bedrock_model_id,
            region_name=settings.aws_region,
            temperature=self.config.model_kwargs.get("temperature", 0.2),
            max_tokens=self.config.model_kwargs.get("max_tokens", 8192),
        )
        return Agent(
            model=model,
            system_prompt=self.system_prompt,
        )
    
    @property
    def synthesis_agent(self) -> Agent:
        """Lazy-load synthesis agent."""
        if self._synthesis_agent is None:
            self._synthesis_agent = self._create_synthesis_agent()
        return self._synthesis_agent
    
    def add_agent(self, key: str, agent: StrandsAgent) -> None:
        """Register an agent."""
        self.config.agents[key] = agent
    
    def get_agents(self) -> Dict[str, StrandsAgent]:
        """Return registered agents."""
        return self.config.agents
    
    def run_agent(self, key: str, input_text: str) -> ExecutionResult:
        """
        Run a single agent by key.
        
        Args:
            key: Agent key
            input_text: Input for the agent
            
        Returns:
            ExecutionResult from the agent
        """
        agent = self.config.agents[key]
        return agent.invoke(input_text)
    
    def run_parallel(
        self,
        agent_keys: List[str],
        input_text: str,
        max_workers: int = 4
    ) -> Dict[str, ExecutionResult]:
        """
        Run multiple agents in parallel using thread pool.
        
        Strands agents are synchronous, so we use ThreadPoolExecutor
        for parallel execution.
        
        Args:
            agent_keys: List of agent keys to run
            input_text: Input for all agents
            max_workers: Maximum parallel workers
            
        Returns:
            Dictionary mapping keys to results
        """
        def run_single(key: str) -> tuple[str, ExecutionResult]:
            result = self.run_agent(key, input_text)
            return key, result
        
        results = {}
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(run_single, key) for key in agent_keys]
            for future in futures:
                key, result = future.result()
                results[key] = result
        
        return results
    
    async def arun_parallel(
        self,
        agent_keys: List[str],
        input_text: str
    ) -> Dict[str, ExecutionResult]:
        """
        Async wrapper for parallel execution.
        
        Args:
            agent_keys: List of agent keys to run
            input_text: Input for all agents
            
        Returns:
            Dictionary mapping keys to results
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self.run_parallel(agent_keys, input_text)
        )
    
    def run_sequential(
        self,
        agent_keys: List[str],
        initial_input: str
    ) -> List[ExecutionResult]:
        """
        Run agents sequentially, passing output to next agent.
        
        Args:
            agent_keys: List of agent keys in execution order
            initial_input: Input for first agent
            
        Returns:
            List of results from each agent
        """
        results = []
        current_input = initial_input
        
        for key in agent_keys:
            result = self.run_agent(key, current_input)
            results.append(result)
            current_input = result.output
        
        return results
    
    def synthesize(
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
        response = self.synthesis_agent(synthesis_prompt)
        return str(response)
    
    def run(self, input_text: str) -> ExecutionResult:
        """
        Default run method - override in subclasses for custom workflow.
        
        Args:
            input_text: Input for the workflow
            
        Returns:
            Final result
        """
        if not self.config.agents:
            return ExecutionResult(
                agent_name=self.config.name,
                output="No agents configured",
            )
        
        # Default: run all agents in parallel and synthesize
        results = self.run_parallel(
            list(self.config.agents.keys()),
            input_text
        )
        
        # Build synthesis prompt
        sections = [f"## {k}\n{r.output}" for k, r in results.items()]
        synthesis_prompt = f"Synthesize these results:\n\n{''.join(sections)}"
        
        output = self.synthesize(results, synthesis_prompt)
        
        return ExecutionResult(
            agent_name=self.config.name,
            output=output,
            raw_output=results,
        )
    
    async def arun(self, input_text: str) -> ExecutionResult:
        """
        Async run method.
        
        Args:
            input_text: Input for the workflow
            
        Returns:
            Final result
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: self.run(input_text))
