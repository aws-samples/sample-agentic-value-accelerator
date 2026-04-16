"""
${PROJECT_NAME} - Strands Agent
Simple greeting agent demonstrating Strands SDK on AgentCore
"""

from strands_agent_sdk import Agent, Action, Context
from langchain_aws import ChatBedrock
from config import settings
from observability import setup_tracing

# Setup observability
setup_tracing()


class GreetingAction(Action):
    """Action to greet the user"""

    def __init__(self):
        super().__init__(
            name="greet_user",
            description="Greet the user warmly"
        )

    def execute(self, context: Context, user_input: str) -> str:
        """
        Execute the greeting action

        Args:
            context: Strands agent context
            user_input: User's message

        Returns:
            Greeting response
        """
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

        return response.content


def create_agent() -> Agent:
    """
    Create the Strands agent

    Returns:
        Configured Agent instance
    """
    # Create agent
    agent = Agent(
        name="${PROJECT_NAME}",
        description="Friendly greeting agent"
    )

    # Add actions
    agent.add_action(GreetingAction())

    return agent


# Create the agent
agent = create_agent()


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

    # Create agent context
    agent_context = Context()

    # Execute the agent
    result = agent.execute(
        action_name="greet_user",
        context=agent_context,
        user_input=user_input
    )

    return {
        "statusCode": 200,
        "body": result
    }


if __name__ == "__main__":
    # Test locally
    test_event = {"user_input": "Hello, how are you?"}
    response = handler(test_event, None)
    print(f"Agent response: {response['body']}")
