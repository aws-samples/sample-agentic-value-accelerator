"""
Tool-Calling Agent - LangGraph Implementation

An agent that can dynamically invoke external tools and APIs to accomplish tasks.
Demonstrates tool registration, invocation, error handling, and multi-step reasoning.

TODO: Customize this agent for your use case:
1. Add your custom tools in tools.py
2. Configure tool selection strategy
3. Implement error handling and retries
4. Add result validation and processing
"""

from typing import Dict, List, Any, Optional, Annotated
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import BaseTool
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
import operator


class AgentState(Dict):
    """
    State for the tool-calling agent.

    Tracks:
    - messages: Conversation history including tool calls
    - iterations: Number of tool invocations so far
    - max_iterations: Maximum allowed iterations
    """
    messages: Annotated[List[BaseMessage], operator.add]
    iterations: int
    max_iterations: int


class ToolCallingAgent:
    """
    Tool-Calling Agent using LangGraph.

    The agent:
    1. Receives user query
    2. Decides which tool(s) to use
    3. Invokes tools with appropriate parameters
    4. Processes tool results
    5. Generates final response

    Features:
    - Dynamic tool selection based on query
    - Error handling for tool failures
    - Iteration limits to prevent infinite loops
    - Observable with Langfuse integration

    TODO: Customize for your use case:
    - Add domain-specific tools
    - Implement custom tool selection logic
    - Add result validation
    - Configure retry behavior
    """

    def __init__(
        self,
        llm,
        tools: List[BaseTool],
        max_iterations: int = 10,
        verbose: bool = True
    ):
        """
        Initialize tool-calling agent.

        Args:
            llm: Language model with tool calling capability
            tools: List of available tools
            max_iterations: Maximum tool invocations per query
            verbose: Enable verbose logging
        """
        self.llm = llm.bind_tools(tools)
        self.tools = {tool.name: tool for tool in tools}
        self.max_iterations = max_iterations
        self.verbose = verbose

        # Build agent graph
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        """
        Build LangGraph workflow for tool calling.

        Graph structure:
        1. agent_node: LLM decides on tool use
        2. tool_node: Execute selected tools
        3. should_continue: Check if more iterations needed

        Returns:
            Compiled LangGraph workflow
        """
        # Create workflow
        workflow = StateGraph(AgentState)

        # Add nodes
        workflow.add_node("agent", self._agent_node)
        workflow.add_node("tools", self._tool_node)

        # Set entry point
        workflow.set_entry_point("agent")

        # Add conditional edges
        workflow.add_conditional_edges(
            "agent",
            self._should_continue,
            {
                "continue": "tools",
                "end": END
            }
        )

        # Tool results go back to agent
        workflow.add_edge("tools", "agent")

        return workflow.compile()

    def _agent_node(self, state: AgentState) -> AgentState:
        """
        Agent node: LLM decides which tools to use.

        Args:
            state: Current agent state

        Returns:
            Updated state with agent's decision
        """
        messages = state["messages"]

        # Call LLM to decide on tool use
        response = self.llm.invoke(messages)

        if self.verbose:
            print(f"\n🤖 Agent: {response.content if response.content else '[Tool calls requested]'}")
            if hasattr(response, 'tool_calls') and response.tool_calls:
                for tool_call in response.tool_calls:
                    print(f"  🔧 Calling: {tool_call['name']}")

        return {
            "messages": [response],
            "iterations": state.get("iterations", 0)
        }

    def _tool_node(self, state: AgentState) -> AgentState:
        """
        Tool node: Execute requested tools.

        Args:
            state: Current agent state

        Returns:
            Updated state with tool results
        """
        messages = state["messages"]
        last_message = messages[-1]

        # Execute tool calls
        tool_results = []

        if hasattr(last_message, 'tool_calls'):
            for tool_call in last_message.tool_calls:
                tool_name = tool_call['name']
                tool_args = tool_call['args']
                tool_id = tool_call['id']

                try:
                    # Get tool and execute
                    tool = self.tools.get(tool_name)
                    if tool is None:
                        result = f"Error: Tool '{tool_name}' not found"
                    else:
                        result = tool.invoke(tool_args)

                    if self.verbose:
                        print(f"  ✅ {tool_name}: {result}")

                    # Create tool message
                    tool_message = ToolMessage(
                        content=str(result),
                        tool_call_id=tool_id,
                        name=tool_name
                    )
                    tool_results.append(tool_message)

                except Exception as e:
                    error_msg = f"Error executing {tool_name}: {str(e)}"
                    if self.verbose:
                        print(f"  ❌ {error_msg}")

                    tool_message = ToolMessage(
                        content=error_msg,
                        tool_call_id=tool_id,
                        name=tool_name
                    )
                    tool_results.append(tool_message)

        # Increment iteration count
        iterations = state.get("iterations", 0) + 1

        return {
            "messages": tool_results,
            "iterations": iterations
        }

    def _should_continue(self, state: AgentState) -> str:
        """
        Decide if agent should continue or stop.

        Stop if:
        - No tool calls in last message (agent provided final answer)
        - Max iterations reached

        Args:
            state: Current agent state

        Returns:
            "continue" or "end"
        """
        messages = state["messages"]
        last_message = messages[-1]
        iterations = state.get("iterations", 0)
        max_iterations = state.get("max_iterations", self.max_iterations)

        # Check if agent made tool calls
        has_tool_calls = (
            hasattr(last_message, 'tool_calls') and
            len(last_message.tool_calls) > 0
        )

        # Stop if no tool calls or max iterations reached
        if not has_tool_calls:
            return "end"

        if iterations >= max_iterations:
            if self.verbose:
                print(f"\n⚠️ Max iterations ({max_iterations}) reached")
            return "end"

        return "continue"

    def invoke(
        self,
        query: str,
        max_iterations: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Invoke the agent with a query.

        Args:
            query: User query
            max_iterations: Override default max iterations

        Returns:
            Response with answer and metadata
        """
        # Initialize state
        initial_state = {
            "messages": [HumanMessage(content=query)],
            "iterations": 0,
            "max_iterations": max_iterations or self.max_iterations
        }

        if self.verbose:
            print(f"\n📝 Query: {query}")

        # Run graph
        final_state = self.graph.invoke(initial_state)

        # Extract final response
        messages = final_state["messages"]
        final_message = messages[-1]

        response = {
            "query": query,
            "answer": final_message.content if hasattr(final_message, 'content') else str(final_message),
            "iterations": final_state.get("iterations", 0),
            "tool_calls": self._extract_tool_calls(messages),
            "success": True
        }

        if self.verbose:
            print(f"\n✅ Final Answer: {response['answer']}")
            print(f"📊 Total iterations: {response['iterations']}")

        return response

    def _extract_tool_calls(self, messages: List[BaseMessage]) -> List[Dict[str, Any]]:
        """
        Extract tool call history from messages.

        Args:
            messages: Message history

        Returns:
            List of tool calls with results
        """
        tool_calls = []

        for i, msg in enumerate(messages):
            if hasattr(msg, 'tool_calls') and msg.tool_calls:
                for tool_call in msg.tool_calls:
                    # Find corresponding result
                    tool_id = tool_call['id']
                    result = None

                    # Look ahead for tool result
                    for future_msg in messages[i+1:]:
                        if isinstance(future_msg, ToolMessage) and future_msg.tool_call_id == tool_id:
                            result = future_msg.content
                            break

                    tool_calls.append({
                        "name": tool_call['name'],
                        "args": tool_call['args'],
                        "result": result
                    })

        return tool_calls


# Example usage
if __name__ == "__main__":
    from tools import get_example_tools
    from langchain_aws import ChatBedrock

    # TODO: Configure your LLM
    llm = ChatBedrock(
        model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
        region_name="us-east-1"
    )

    # Get example tools
    tools = get_example_tools()

    # Create agent
    agent = ToolCallingAgent(
        llm=llm,
        tools=tools,
        max_iterations=5
    )

    # Example queries
    queries = [
        "What is 15 multiplied by 23?",
        "Search for information about machine learning",
        "What's the weather in San Francisco?"
    ]

    for query in queries:
        response = agent.invoke(query)
        print(f"\nQuery: {query}")
        print(f"Answer: {response['answer']}")
        print(f"Tool calls: {len(response['tool_calls'])}")
        print("-" * 80)
