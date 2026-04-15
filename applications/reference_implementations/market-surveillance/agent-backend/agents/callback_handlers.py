"""
Callback handlers for agent events and streaming.
"""

import logging
from typing import Optional, Any, Dict
from queue import Queue
from contextvars import ContextVar
import json

logger = logging.getLogger(__name__)

# Context-local event queue for streaming thinking events.
# Using ContextVar ensures each concurrent async invocation of agent_stream
# gets its own isolated queue, preventing race conditions when multiple
# investigations run simultaneously in the same AgentCore Runtime process.
_event_queue_var: ContextVar[Optional[Queue]] = ContextVar('_event_queue', default=None)


def set_event_queue(queue: Optional[Queue]):
    """Set the event queue for the current async context."""
    _event_queue_var.set(queue)


def get_event_queue() -> Optional[Queue]:
    """Get the event queue for the current async context."""
    return _event_queue_var.get()


def emit_thinking_event(
    agent_name: str,
    event_type: str,
    message: str,
    metadata: Optional[Dict[str, Any]] = None
):
    """
    Emit a structured thinking event to the queue.
    
    Args:
        agent_name: Name of the agent emitting the event
        event_type: Type of event (routing, tool_call, thinking, decision, validation, etc.)
        message: Human-readable message
        metadata: Additional structured data
    """
    queue = get_event_queue()
    if queue:
        event = {
            "type": event_type,
            "agent": agent_name,
            "message": message,
            "metadata": metadata or {}
        }
        queue.put(event)


class CoordinatorCallbackHandler:
    """
    Callback handler for the coordinator agent.
    Shows which specialist agents are being used and decision-making process.
    """
    
    def __init__(self, agent_name: str = "Coordinator"):
        self.agent_name = agent_name
        self.last_tool = None
    
    def __call__(self, **kwargs: Any) -> None:
        """Handle callback events from the agent."""
        current_tool_use = kwargs.get("current_tool_use", {})
        
        if current_tool_use and current_tool_use.get("name"):
            tool_name = current_tool_use.get("name")
            tool_input = current_tool_use.get("input", {})
            
            # Avoid duplicate events for the same tool call
            if tool_name == self.last_tool:
                return
            self.last_tool = tool_name
            
            # Check if this is a specialist agent tool
            if "_agent" in tool_name:
                agent_name = tool_name.replace("_agent", "").replace("_", " ").title()
                
                # Extract query from tool input if available
                query = ""
                if isinstance(tool_input, dict):
                    query = tool_input.get("query", tool_input.get("message", ""))
                
                # Emit decision event explaining why routing to this agent
                emit_thinking_event(
                    agent_name=self.agent_name,
                    event_type="decision",
                    message=f"Analyzing query and determining appropriate specialist agent",
                    metadata={
                        "decision": f"Route to {agent_name}",
                        "reason": self._get_routing_reason(tool_name, query),
                        "query": query if query else None
                    }
                )
                
                # Emit routing event
                emit_thinking_event(
                    agent_name=self.agent_name,
                    event_type="agent_routing",
                    message=f"Routing to {agent_name}",
                    metadata={
                        "target_agent": agent_name,
                        "tool_name": tool_name,
                        "query": query if query else None
                    }
                )
            else:
                # Regular tool call - provide context about what it's for
                tool_purpose = self._get_tool_purpose(tool_name)
                
                emit_thinking_event(
                    agent_name=self.agent_name,
                    event_type="tool_call",
                    message=f"Using tool: {tool_name}",
                    metadata={
                        "tool_name": tool_name,
                        "purpose": tool_purpose,
                        "tool_input": tool_input
                    }
                )
            
            logger.info(f"[{self.agent_name}] Tool: {tool_name}")
    
    def _get_routing_reason(self, tool_name: str, query: str) -> str:
        """Determine why we're routing to a specific agent based on the query."""
        query_lower = query.lower() if query else ""
        
        if "data_contract" in tool_name:
            if "schema" in query_lower or "table" in query_lower or "column" in query_lower:
                return "Query requires database schema information"
            return "Need to understand database structure"
        
        elif "data_enrichment" in tool_name:
            if "get" in query_lower or "retrieve" in query_lower or "show" in query_lower:
                return "Query requires data retrieval from database"
            return "Need to execute SQL query for data enrichment"
        
        elif "trade_analyst" in tool_name:
            if "rule" in query_lower:
                return "Query about surveillance rules or evaluation"
            if "evaluate" in query_lower or "investigate" in query_lower:
                return "Need to evaluate trades against decision tree"
            return "Trade analysis required"

        elif "ecomm" in tool_name:
            if "message" in query_lower or "conversation" in query_lower or "chat" in query_lower:
                return "Query requires electronic communications analysis"
            return "Need to analyze trader messages"

        return "Specialist expertise required for this query"
    
    def _get_tool_purpose(self, tool_name: str) -> str:
        """Get a human-readable purpose for a tool."""
        purposes = {
            "current_time": "Get current date and time for temporal analysis",
            "calculator": "Perform mathematical calculations",
        }
        return purposes.get(tool_name, "Execute specialized function")


class SpecialistCallbackHandler:
    """
    Callback handler for specialist agents.
    Shows tool usage and decision-making within specialist agents.
    """
    
    def __init__(self, agent_name: str):
        self.agent_name = agent_name
        self.last_tool = None
        self.tool_call_count = 0
    
    def __call__(self, **kwargs: Any) -> None:
        """Handle callback events from the agent."""
        # Debug: Log all kwargs keys to understand callback structure
        logger.debug(f"[{self.agent_name}] Callback kwargs keys: {list(kwargs.keys())}")
        
        # Check for message events that might contain tool calls (Bedrock format)
        if "message" in kwargs:
            message = kwargs["message"]
            logger.debug(f"[{self.agent_name}] Message event - role: {message.get('role')}")
            
            # Handle tool_calls array (Bedrock format with function.name and function.arguments)
            if message.get("role") == "assistant" and "tool_calls" in message:
                tool_calls = message.get("tool_calls", [])
                for tool_call in tool_calls:
                    if tool_call.get("type") == "function":
                        function_info = tool_call.get("function", {})
                        tool_name = function_info.get("name")
                        tool_arguments = function_info.get("arguments", {})
                        tool_id = tool_call.get("id")
                        
                        logger.info(f"[{self.agent_name}] Tool call detected: {tool_name} (id: {tool_id})")
                        logger.debug(f"[{self.agent_name}] Tool arguments: {tool_arguments}")
                        
                        # Avoid duplicate events
                        tool_key = f"{tool_name}_{self.tool_call_count}"
                        if tool_name == self.last_tool:
                            return
                        self.last_tool = tool_name
                        self.tool_call_count += 1
                        
                        # Extract relevant information from tool arguments
                        input_summary = self._extract_input_summary(tool_name, tool_arguments)
                        tool_purpose = self._get_tool_purpose(tool_name)
                        
                        # Extract SQL or Python code for explicit display
                        sql_query = None
                        python_code = None
                        if isinstance(tool_arguments, dict):
                            sql_query = tool_arguments.get("sql_query")
                            python_code = tool_arguments.get("code")
                            logger.debug(f"[{self.agent_name}] Extracted - sql_query: {bool(sql_query)}, python_code: {bool(python_code)}")
                        
                        # Emit thinking event explaining what we're about to do
                        emit_thinking_event(
                            agent_name=self.agent_name,
                            event_type="thinking",
                            message=f"Preparing to {tool_purpose.lower()}",
                            metadata={
                                "step": self.tool_call_count,
                                "action": tool_purpose,
                                "tool_name": tool_name
                            }
                        )
                        
                        # Build metadata with explicit SQL/code fields
                        tool_metadata = {
                            # Augmented data (human-readable)
                            "purpose": tool_purpose,
                            "input_summary": input_summary,
                            # Raw data (from Strands/Bedrock)
                            "tool_id": tool_id,
                            "tool_name": tool_name,
                            "tool_arguments": tool_arguments,  # Full raw arguments
                            "function_name": tool_name,  # Explicit function name
                            "function_arguments": tool_arguments,  # Explicit function arguments
                        }
                        
                        # Add explicit SQL or Python code fields for visibility
                        if sql_query:
                            tool_metadata["sql_query"] = sql_query
                            logger.info(f"[{self.agent_name}] Added SQL query to metadata ({len(sql_query)} chars)")
                        if python_code:
                            tool_metadata["python_code"] = python_code
                            logger.info(f"[{self.agent_name}] Added Python code to metadata ({len(python_code)} chars)")
                        
                        # Emit tool call event with details
                        emit_thinking_event(
                            agent_name=self.agent_name,
                            event_type="tool_call",
                            message=f"Executing {tool_name}" + (f" - {input_summary}" if input_summary else ""),
                            metadata=tool_metadata
                        )
                        
                        logger.info(f"[{self.agent_name}] Tool: {tool_name}")
                        return
            
            # Handle content array with tool_use blocks (Anthropic format)
            if message.get("role") == "assistant" and isinstance(message.get("content"), list):
                for content_block in message["content"]:
                    if isinstance(content_block, dict) and content_block.get("type") == "tool_use":
                        tool_name = content_block.get("name")
                        tool_input = content_block.get("input", {})
                        tool_id = content_block.get("id")
                        
                        logger.info(f"[{self.agent_name}] Tool use in message: {tool_name} (id: {tool_id})")
                        logger.debug(f"[{self.agent_name}] Tool input: {tool_input}")
                        
                        # Avoid duplicate events
                        tool_key = f"{tool_name}_{self.tool_call_count}"
                        if tool_name == self.last_tool:
                            return
                        self.last_tool = tool_name
                        self.tool_call_count += 1
                        
                        # Extract relevant information from tool input
                        input_summary = self._extract_input_summary(tool_name, tool_input)
                        tool_purpose = self._get_tool_purpose(tool_name)
                        
                        # Extract SQL or Python code for explicit display
                        sql_query = None
                        python_code = None
                        if isinstance(tool_input, dict):
                            sql_query = tool_input.get("sql_query")
                            python_code = tool_input.get("code")
                            logger.debug(f"[{self.agent_name}] Extracted - sql_query: {bool(sql_query)}, python_code: {bool(python_code)}")
                        
                        # Emit thinking event explaining what we're about to do
                        emit_thinking_event(
                            agent_name=self.agent_name,
                            event_type="thinking",
                            message=f"Preparing to {tool_purpose.lower()}",
                            metadata={
                                "step": self.tool_call_count,
                                "action": tool_purpose,
                                "tool_name": tool_name
                            }
                        )
                        
                        # Build metadata with explicit SQL/code fields
                        tool_metadata = {
                            # Augmented data (human-readable)
                            "purpose": tool_purpose,
                            "input_summary": input_summary,
                            # Raw data (from Strands)
                            "tool_id": tool_id,
                            "tool_name": tool_name,
                            "tool_input": tool_input,  # Full raw input
                            "function_name": tool_name,  # Explicit function name
                            "function_arguments": tool_input,  # Explicit function arguments
                        }
                        
                        # Add explicit SQL or Python code fields for visibility
                        if sql_query:
                            tool_metadata["sql_query"] = sql_query
                            logger.info(f"[{self.agent_name}] Added SQL query to metadata ({len(sql_query)} chars)")
                        if python_code:
                            tool_metadata["python_code"] = python_code
                            logger.info(f"[{self.agent_name}] Added Python code to metadata ({len(python_code)} chars)")
                        
                        # Emit tool call event with details
                        emit_thinking_event(
                            agent_name=self.agent_name,
                            event_type="tool_call",
                            message=f"Executing {tool_name}" + (f" - {input_summary}" if input_summary else ""),
                            metadata=tool_metadata
                        )
                        
                        logger.info(f"[{self.agent_name}] Tool: {tool_name}")
                        return
        
        # Fallback to current_tool_use (legacy approach - may not have input)
        current_tool_use = kwargs.get("current_tool_use", {})
        
        if current_tool_use and current_tool_use.get("name"):
            tool_name = current_tool_use.get("name")
            tool_input = current_tool_use.get("input", {})
            
            # Debug: Log the raw tool_input to understand its structure
            logger.debug(f"[{self.agent_name}] current_tool_use - tool_input type: {type(tool_input)}, value: {tool_input}")
            logger.debug(f"[{self.agent_name}] current_tool_use keys: {list(current_tool_use.keys())}")
            
            # Avoid duplicate events for the same tool call
            if tool_name == self.last_tool:
                return
            self.last_tool = tool_name
            self.tool_call_count += 1
            
            # Parse tool_input if it's a JSON string
            if isinstance(tool_input, str) and tool_input:
                try:
                    tool_input = json.loads(tool_input)
                    logger.debug(f"[{self.agent_name}] Parsed tool_input from JSON string")
                except json.JSONDecodeError:
                    logger.warning(f"[{self.agent_name}] Failed to parse tool_input as JSON: {tool_input}")
            
            # Extract relevant information from tool input
            input_summary = self._extract_input_summary(tool_name, tool_input)
            tool_purpose = self._get_tool_purpose(tool_name)
            
            # Extract SQL or Python code for explicit display
            sql_query = None
            python_code = None
            if isinstance(tool_input, dict):
                sql_query = tool_input.get("sql_query")
                python_code = tool_input.get("code")
                logger.debug(f"[{self.agent_name}] Extracted - sql_query: {bool(sql_query)}, python_code: {bool(python_code)}")
            
            # Emit thinking event explaining what we're about to do
            emit_thinking_event(
                agent_name=self.agent_name,
                event_type="thinking",
                message=f"Preparing to {tool_purpose.lower()}",
                metadata={
                    "step": self.tool_call_count,
                    "action": tool_purpose,
                    "tool_name": tool_name
                }
            )
            
            # Build metadata with explicit SQL/code fields
            tool_metadata = {
                # Augmented data (human-readable)
                "purpose": tool_purpose,
                "input_summary": input_summary,
                # Raw data (from Strands)
                "tool_name": tool_name,
                "tool_input": tool_input,  # Full raw input
                "function_name": tool_name,  # Explicit function name
                "function_arguments": tool_input,  # Explicit function arguments
            }
            
            # Add explicit SQL or Python code fields for visibility
            if sql_query:
                tool_metadata["sql_query"] = sql_query
                logger.info(f"[{self.agent_name}] Added SQL query to metadata ({len(sql_query)} chars)")
            if python_code:
                tool_metadata["python_code"] = python_code
                logger.info(f"[{self.agent_name}] Added Python code to metadata ({len(python_code)} chars)")
            
            # Emit tool call event with details
            emit_thinking_event(
                agent_name=self.agent_name,
                event_type="tool_call",
                message=f"Executing {tool_name}" + (f" - {input_summary}" if input_summary else ""),
                metadata=tool_metadata
            )
            
            logger.info(f"[{self.agent_name}] Tool: {tool_name}")
    
    def _extract_input_summary(self, tool_name: str, tool_input: Dict[str, Any]) -> str:
        """Extract a human-readable summary from tool input."""
        if not isinstance(tool_input, dict):
            return ""
        
        # Schema tools
        if "table_name" in tool_input:
            return f"Table: {tool_input['table_name']}"
        
        if "search_term" in tool_input:
            return f"Searching for: {tool_input['search_term']}"
        
        # Query tools - show full SQL
        if "sql_query" in tool_input:
            return f"SQL: {tool_input['sql_query']}"
        
        if "query" in tool_input:
            query_text = tool_input['query']
            return f"Query: {query_text}"
        
        # Python code execution - show full code
        if "code" in tool_input:
            return f"Python Code: {tool_input['code']}"
        
        # Rule evaluation tools
        if "enriched_trades" in tool_input:
            trades = tool_input['enriched_trades']
            if isinstance(trades, list):
                return f"Evaluating {len(trades)} trade(s)"
        
        if "rule_id" in tool_input:
            return f"Rule: {tool_input['rule_id']}"
        
        # Generic fallback
        if "message" in tool_input:
            return f"Message: {tool_input['message']}"
        
        return ""
    
    def _get_tool_purpose(self, tool_name: str) -> str:
        """Get a human-readable purpose for a tool."""
        purposes = {
            # Data Contract tools
            "get_table_list": "List all available database tables",
            "get_table_schema": "Retrieve detailed table schema",
            "get_table_relationships": "Analyze table relationships and foreign keys",
            "search_columns": "Search for columns across tables",
            
            # Data Enrichment tools
            "execute_select_query": "Execute SQL SELECT query",
            "get_row_count": "Count rows in table",
            
            # Trade Analyst tools
            "validate_trade_data": "Validate trade data completeness",
            "evaluate_individual_rules": "Evaluate trades against 29 decision tree rules",
            "evaluate_aggregation_rules": "Apply aggregation rules to uncleared trades",
            "get_rule_details": "Retrieve specific rule definition",

            # eComm Specialist tools
            "get_conversations_by_isin": "Search for trader conversations by ISIN instrument ID",
            "locate_execution_time": "Identify trade execution time from conversation",
        }
        return purposes.get(tool_name, f"Execute {tool_name}")
