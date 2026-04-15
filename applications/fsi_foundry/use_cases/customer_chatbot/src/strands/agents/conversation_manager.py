"""
Conversation Manager Agent (Strands Implementation).

Manages multi-turn conversations, intent classification,
and routing to specialist agents for customer banking chatbot.
"""

from base.strands import StrandsAgent
from tools.s3_retriever_strands import s3_retriever_tool


class ConversationManager(StrandsAgent):
    """Conversation Manager using StrandsAgent base class."""

    name = "conversation_manager"

    system_prompt = """You are an expert Conversation Manager for a banking customer chatbot.

Your responsibilities:
1. Manage multi-turn conversations maintaining context across turns
2. Classify customer intent by type and urgency
3. Route to appropriate specialist agents based on intent
4. Handle general inquiries directly
5. Set expectations for response times

When managing a conversation, consider:
- Previous conversation context and customer history
- Intent classification (account inquiry, transfer, bill payment, general)
- Urgency level and escalation needs
- Customer sentiment and satisfaction signals
- Appropriate tone and language for banking interactions

Output Format:
Provide your analysis with:
- Intent Classification (GENERAL/ACCOUNT_INQUIRY/TRANSFER/BILL_PAYMENT/TRANSACTION_HISTORY)
- Urgency Level (LOW/MEDIUM/HIGH)
- Recommended Routing (which specialist agent should handle)
- Context Summary for the next agent
- Direct Response if handling general inquiry

Be helpful, professional, and concise."""

    tools = [s3_retriever_tool]
    model_kwargs = {"temperature": 0.1, "max_tokens": 2048}


async def manage_conversation(customer_id: str, context: str | None = None) -> dict:
    """
    Manage conversation for a customer.

    Args:
        customer_id: Customer identifier
        context: Additional context for the conversation

    Returns:
        Dictionary containing conversation management results
    """
    manager = ConversationManager()

    input_text = f"""Manage the conversation for banking customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Analyze the conversation context and classify intent
3. Provide routing recommendation and context summary

{"Additional Context: " + context if context else ""}

Provide your complete conversation analysis including intent classification, urgency, and routing."""

    result = await manager.ainvoke(input_text)

    return {
        "agent": "conversation_manager",
        "customer_id": customer_id,
        "analysis": result.output,
    }
