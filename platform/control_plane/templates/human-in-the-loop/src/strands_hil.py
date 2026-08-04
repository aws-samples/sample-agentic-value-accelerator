"""Human-in-the-Loop with Strands.

Two approaches:
1. Tool-based: Call tool_context.interrupt() inside a tool to pause for human input
2. Hook-based: Intercept BeforeToolCallEvent to require approval before tool execution

Reference: https://github.com/strands-agents/samples/tree/main/python/01-learn/13-human-in-the-loop
"""
from strands import Agent, tool
from strands.models import BedrockModel
from strands.types.tools import ToolContext

# --- Approach 1: Tool-based interrupt ---


@tool
def send_email(tool_context: ToolContext, to: str, subject: str, body: str) -> str:
    """Send an email (requires human approval).

    Args:
        to: Recipient email address
        subject: Email subject
        body: Email body
    """
    # Pause and ask for human confirmation
    confirmation = tool_context.interrupt(
        f"About to send email to {to} with subject '{subject}'. Approve? (yes/no)"
    )
    if confirmation.lower() != "yes":
        return "Email cancelled by user."
    # Proceed with sending
    return f"Email sent to {to}"


agent = Agent(
    model=BedrockModel(model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
    system_prompt="You are an assistant that can send emails on behalf of the user.",
    tools=[send_email],
)

if __name__ == "__main__":
    result = agent("Send an email to bob@example.com about the meeting tomorrow")
    print(result.message)
