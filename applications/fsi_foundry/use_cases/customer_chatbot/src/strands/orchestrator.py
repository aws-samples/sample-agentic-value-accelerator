"""
Customer Chatbot Orchestrator (Strands Implementation).

Orchestrates specialist agents (Conversation Manager, Account Agent, Transaction Agent)
for comprehensive customer banking chatbot interactions.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any

from base.strands import StrandsOrchestrator
from .agents import ConversationManager, AccountAgent, TransactionAgent
from .agents.conversation_manager import manage_conversation
from .agents.account_agent import handle_account_query
from .agents.transaction_agent import process_transaction
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (
    ChatRequest,
    ChatResponse,
    IntentType,
    ActionDetail,
    ActionType,
    ConversationStatus,
)


class CustomerChatbotOrchestrator(StrandsOrchestrator):
    """
    Customer Chatbot Orchestrator using StrandsOrchestrator base class.

    Coordinates Conversation Manager, Account Agent, and Transaction Agent
    for comprehensive customer banking interactions.
    """

    name = "customer_chatbot_orchestrator"

    system_prompt = """You are a Senior Conversational Banking Supervisor for a financial institution.

Your role is to:
1. Coordinate specialist agents (Conversation Manager, Account Agent, Transaction Agent)
2. Synthesize their findings into a comprehensive and natural customer response
3. Ensure customer inquiries are handled efficiently with appropriate actions taken

When creating the final summary, consider:
- The customer's original intent and whether it was fully addressed
- Any actions taken (transfers, payments, balance checks) and their status
- Follow-up recommendations or next steps for the customer
- Escalation needs if the request cannot be fully resolved
- Natural, conversational tone appropriate for a banking chatbot

Be concise but helpful. Your response will be delivered directly to the customer."""

    def __init__(self):
        super().__init__(
            agents={
                "conversation_manager": ConversationManager(),
                "account_agent": AccountAgent(),
                "transaction_agent": TransactionAgent(),
            }
        )

    def run_assessment(
        self,
        customer_id: str,
        intent_type: str = "full",
        context: str | None = None,
    ) -> Dict[str, Any]:
        """
        Run the customer chatbot workflow.

        Args:
            customer_id: Customer identifier
            intent_type: Type of intent (full, general, account_inquiry, transfer, bill_payment, transaction_history)
            context: Additional context for the conversation

        Returns:
            Dictionary with chatbot results
        """
        conversation_result = None
        account_result = None
        transaction_result = None

        input_text = self._build_input_text(customer_id, context)

        if intent_type == "full":
            results = self.run_parallel(
                ["conversation_manager", "account_agent", "transaction_agent"],
                input_text,
            )
            conversation_result = {
                "agent": "conversation_manager",
                "customer_id": customer_id,
                "analysis": results["conversation_manager"].output,
            }
            account_result = {
                "agent": "account_agent",
                "customer_id": customer_id,
                "analysis": results["account_agent"].output,
            }
            transaction_result = {
                "agent": "transaction_agent",
                "customer_id": customer_id,
                "analysis": results["transaction_agent"].output,
            }
        elif intent_type == "general":
            result = self.run_agent("conversation_manager", input_text)
            conversation_result = {
                "agent": "conversation_manager",
                "customer_id": customer_id,
                "analysis": result.output,
            }
        elif intent_type == "account_inquiry":
            result = self.run_agent("account_agent", input_text)
            account_result = {
                "agent": "account_agent",
                "customer_id": customer_id,
                "analysis": result.output,
            }
        else:
            # transfer, bill_payment, transaction_history
            result = self.run_agent("transaction_agent", input_text)
            transaction_result = {
                "agent": "transaction_agent",
                "customer_id": customer_id,
                "analysis": result.output,
            }

        synthesis_prompt = self._build_synthesis_prompt(
            conversation_result, account_result, transaction_result
        )
        summary = self.synthesize({}, synthesis_prompt)

        return {
            "customer_id": customer_id,
            "conversation_result": conversation_result,
            "account_result": account_result,
            "transaction_result": transaction_result,
            "final_summary": summary,
        }

    async def arun_assessment(
        self,
        customer_id: str,
        intent_type: str = "full",
        context: str | None = None,
    ) -> Dict[str, Any]:
        """
        Async version of run_assessment.

        Args:
            customer_id: Customer identifier
            intent_type: Type of intent
            context: Additional context for the conversation

        Returns:
            Dictionary with chatbot results
        """
        import asyncio

        conversation_result = None
        account_result = None
        transaction_result = None

        if intent_type == "full":
            conv_r, acct_r, txn_r = await asyncio.gather(
                manage_conversation(customer_id, context),
                handle_account_query(customer_id, context),
                process_transaction(customer_id, context),
            )
            conversation_result = conv_r
            account_result = acct_r
            transaction_result = txn_r
        elif intent_type == "general":
            conversation_result = await manage_conversation(customer_id, context)
        elif intent_type == "account_inquiry":
            account_result = await handle_account_query(customer_id, context)
        else:
            transaction_result = await process_transaction(customer_id, context)

        synthesis_prompt = self._build_synthesis_prompt(
            conversation_result, account_result, transaction_result
        )

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None, lambda: self.synthesize({}, synthesis_prompt)
        )

        return {
            "customer_id": customer_id,
            "conversation_result": conversation_result,
            "account_result": account_result,
            "transaction_result": transaction_result,
            "final_summary": summary,
        }

    def _build_input_text(self, customer_id: str, context: str | None = None) -> str:
        """Build input text for agents."""
        base = f"""Assist banking customer: {customer_id}

Steps to follow:
1. Retrieve the customer's profile data using the s3_retriever_tool with data_type='profile'
2. Analyze the customer's request and provide appropriate assistance
3. Provide a complete response with actions taken"""

        if context:
            base += f"\n\nAdditional Context: {context}"

        return base

    def _build_synthesis_prompt(
        self,
        conversation_result: Dict[str, Any] | None,
        account_result: Dict[str, Any] | None,
        transaction_result: Dict[str, Any] | None,
    ) -> str:
        """Build synthesis prompt from agent results."""
        sections = []
        if conversation_result:
            sections.append(f"## Conversation Analysis\n{json.dumps(conversation_result, indent=2)}")
        if account_result:
            sections.append(f"## Account Analysis\n{json.dumps(account_result, indent=2)}")
        if transaction_result:
            sections.append(f"## Transaction Analysis\n{json.dumps(transaction_result, indent=2)}")

        return f"""Based on the following specialist analysis, provide a customer-facing response:

{chr(10).join(sections)}

Provide a concise response that includes:
1. Direct answer to the customer's inquiry
2. Actions taken and their status
3. Follow-up recommendations
4. Any escalation needs"""



async def run_customer_chatbot(request):
    """Run the assessment workflow."""
    orchestrator = CustomerChatbotOrchestrator()
    final_state = await orchestrator.arun_assessment(
        customer_id=request.customer_id,
        intent_type=request.intent_type.value if hasattr(request.intent_type, 'value') else str(request.intent_type),
        context=getattr(request, 'additional_context', None))

    recommendations = []
    response_message = "How can I help you today?"
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)
        response_message = structured.get("response_message", summary)
        recommendations = structured.get("recommendations", [])
    except Exception:
        summary = str(final_state.get("final_summary", summary))
        response_message = summary

    return ChatResponse(
        customer_id=request.customer_id, conversation_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), response_message=response_message, actions_taken=None, recommendations=recommendations,
        summary=summary,
        raw_analysis={"conversation_result": final_state.get("conversation_result"), "account_result": final_state.get("account_result"), "transaction_result": final_state.get("transaction_result")},
    )
