"""
${PROJECT_NAME} - LangGraph Agent
Simple greeting agent demonstrating LangGraph on AgentCore
"""

from typing import TypedDict
from langgraph.graph import StateGraph, END
from langchain_aws import ChatBedrock
from config import settings
from observability import setup_tracing

# Setup observability
setup_tracing()


class AgentState(TypedDict):
    """Agent state definition"""
    user_input: str
    response: str


def process_input(state: AgentState) -> AgentState:
    """
    Process user input and generate response

    Args:
        state: Current agent state

    Returns:
        Updated agent state with response
    """
    user_input = state["user_input"]

    # Initialize Bedrock model
    model = ChatBedrock(
        model_id=settings.BEDROCK_MODEL_ID,
        region_name=settings.AWS_REGION,
    )

    # Generate response
    messages = [
        {"role": "system", "content": "You are a friendly assistant. Greet the user warmly."},
        {"role": "user", "content": user_input}
    ]

    response = model.invoke(messages)

    return {
        "user_input": user_input,
        "response": response.content
    }


def create_graph() -> StateGraph:
    """
    Create the LangGraph workflow

    Returns:
        Compiled StateGraph
    """
    # Create graph
    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("process", process_input)

    # Set entry point
    workflow.set_entry_point("process")

    # Add edges
    workflow.add_edge("process", END)

    # Compile
    return workflow.compile()


# Create the agent graph
graph = create_graph()


def handler(event: dict, context) -> dict:
    """
    Lambda/AgentCore handler function

    Args:
        event: Input event with 'user_input' field
        context: Lambda context (unused)

    Returns:
        Response with agent output
    """
    user_input = event.get("user_input", "Hello")

    # Run the graph
    result = graph.invoke({
        "user_input": user_input,
        "response": ""
    })

    return {
        "statusCode": 200,
        "body": result["response"]
    }


if __name__ == "__main__":
    # Test locally
    test_event = {"user_input": "Hello, how are you?"}
    response = handler(test_event, None)
    print(f"Agent response: {response['body']}")
