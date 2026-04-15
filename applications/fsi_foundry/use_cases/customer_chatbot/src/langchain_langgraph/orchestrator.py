"""
Customer Chatbot Orchestrator.

Orchestrates specialist agents (Conversation Manager, Account Agent, Transaction Agent)
for comprehensive customer banking chatbot interactions.
"""

import json
import uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from base.langgraph import LangGraphOrchestrator
from use_cases.customer_chatbot.agents import ConversationManager, AccountAgent, TransactionAgent
from use_cases.customer_chatbot.agents.conversation_manager import manage_conversation
from use_cases.customer_chatbot.agents.account_agent import handle_account_query
from use_cases.customer_chatbot.agents.transaction_agent import process_transaction
from use_cases.customer_chatbot.models import (
    ChatRequest,
    ChatResponse,
    IntentType,
    ActionDetail,
    ActionType,
    ConversationStatus,
)

from pydantic import BaseModel, Field

class CustomerChatbotSynthesisSchema(BaseModel):
    """Structured synthesis output schema for customer_chatbot."""
    response_message: str = Field(default="", description="Primary response message to the customer")
    actions_taken: list[str] = Field(default_factory=list, description="Actions performed during conversation")
    recommendations: list[str] = Field(default_factory=list, description="Follow-up recommendations")
    summary: str = Field(..., description="Executive summary of the interaction")



class CustomerChatbotState(TypedDict):
    """State managed by the customer chatbot orchestrator graph."""
    messages: Annotated[list, add_messages]
    customer_id: str
    intent_type: str
    conversation_manager_result: dict | None
    account_agent_result: dict | None
    transaction_agent_result: dict | None
    final_summary: str | None


class CustomerChatbotOrchestrator(LangGraphOrchestrator):
    """
    Customer Chatbot Orchestrator using LangGraphOrchestrator base class.

    Coordinates Conversation Manager, Account Agent, and Transaction Agent
    for comprehensive customer banking interactions.
    """

    name = "customer_chatbot_orchestrator"
    state_schema = CustomerChatbotState

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

    def build_graph(self) -> StateGraph:
        """Build the customer chatbot workflow graph."""
        workflow = StateGraph(CustomerChatbotState)

        workflow.add_node("parallel_assessment", self._parallel_assessment_node)
        workflow.add_node("conversation_manager", self._conversation_manager_node)
        workflow.add_node("account_agent", self._account_agent_node)
        workflow.add_node("transaction_agent", self._transaction_agent_node)
        workflow.add_node("synthesize", self._synthesize_node)

        workflow.set_conditional_entry_point(
            self._router,
            {
                "parallel_assessment": "parallel_assessment",
                "conversation_manager": "conversation_manager",
                "account_agent": "account_agent",
                "transaction_agent": "transaction_agent",
            },
        )

        workflow.add_edge("parallel_assessment", "synthesize")
        workflow.add_conditional_edges(
            "conversation_manager",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "account_agent",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_conditional_edges(
            "transaction_agent",
            self._router,
            {"synthesize": "synthesize"},
        )
        workflow.add_edge("synthesize", END)

        return workflow.compile()

    def _router(
        self, state: CustomerChatbotState
    ) -> Literal["parallel_assessment", "conversation_manager", "account_agent", "transaction_agent", "synthesize"]:
        """Route to the next node based on current state."""
        intent_type = state.get("intent_type", "full")
        conv_done = state.get("conversation_manager_result") is not None
        acct_done = state.get("account_agent_result") is not None
        txn_done = state.get("transaction_agent_result") is not None

        if intent_type == "general":
            return "synthesize" if conv_done else "conversation_manager"

        if intent_type == "account_inquiry":
            return "synthesize" if acct_done else "account_agent"

        if intent_type in ("transfer", "bill_payment", "transaction_history"):
            return "synthesize" if txn_done else "transaction_agent"

        # Full assessment
        if not conv_done and not acct_done and not txn_done:
            return "parallel_assessment"

        return "synthesize"

    async def _parallel_assessment_node(self, state: CustomerChatbotState) -> CustomerChatbotState:
        """Execute all assessments in parallel."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)

        conv_r, acct_r, txn_r = await self._run_assessments_parallel(customer_id, context)

        return {
            **state,
            "conversation_manager_result": conv_r,
            "account_agent_result": acct_r,
            "transaction_agent_result": txn_r,
            "messages": state["messages"] + [
                AIMessage(content=f"Conversation Analysis Complete: {json.dumps(conv_r, indent=2)}"),
                AIMessage(content=f"Account Analysis Complete: {json.dumps(acct_r, indent=2)}"),
                AIMessage(content=f"Transaction Analysis Complete: {json.dumps(txn_r, indent=2)}"),
            ],
        }

    async def _run_assessments_parallel(self, customer_id: str, context: str | None):
        """Run all assessments in parallel."""
        import asyncio
        return await asyncio.gather(
            manage_conversation(customer_id, context),
            handle_account_query(customer_id, context),
            process_transaction(customer_id, context),
        )

    async def _conversation_manager_node(self, state: CustomerChatbotState) -> CustomerChatbotState:
        """Execute conversation management."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await manage_conversation(customer_id, context)

        return {
            **state,
            "conversation_manager_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Conversation Analysis Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _account_agent_node(self, state: CustomerChatbotState) -> CustomerChatbotState:
        """Execute account query handling."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await handle_account_query(customer_id, context)

        return {
            **state,
            "account_agent_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Account Analysis Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _transaction_agent_node(self, state: CustomerChatbotState) -> CustomerChatbotState:
        """Execute transaction processing."""
        customer_id = state["customer_id"]
        context = self._extract_context(state)
        result = await process_transaction(customer_id, context)

        return {
            **state,
            "transaction_agent_result": result,
            "messages": state["messages"] + [
                AIMessage(content=f"Transaction Analysis Complete: {json.dumps(result, indent=2)}")
            ],
        }

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "customer_id", "intent_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")
        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""
        try:
            llm = self._create_llm(); llm.max_tokens = 2048
            structured_llm = llm.with_structured_output(CustomerChatbotSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog; structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}
        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state: CustomerChatbotState) -> str | None:
        """Extract additional context from state messages."""
        if state.get("messages"):
            last_message = state["messages"][-1]
            if hasattr(last_message, "content"):
                return last_message.content
        return None



async def run_customer_chatbot(request):
    """Run the assessment workflow."""
    orchestrator = CustomerChatbotOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.customer_id}")],
        "customer_id": request.customer_id,
        "intent_type": request.intent_type.value if hasattr(request.intent_type, 'value') else str(request.intent_type),
    }
    for key in [k for k in CustomerChatbotState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)

    recommendations = []
    response_message = "How can I help you today?"
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get("final_summary", "{}"))
        summary = structured.get("summary", summary)

        recommendations = structured.get("recommendations", [])
        response_message = structured.get("response_message", summary)
    except Exception:
        summary = str(final_state.get("final_summary", summary))
        response_message = summary

    return ChatResponse(
        customer_id=request.customer_id, conversation_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), response_message=response_message, actions_taken=None, recommendations=recommendations,
        summary=summary,
        raw_analysis={"conversation_result": final_state.get("conversation_manager_result"), "account_result": final_state.get("account_agent_result"), "transaction_result": final_state.get("transaction_agent_result")},
    )
