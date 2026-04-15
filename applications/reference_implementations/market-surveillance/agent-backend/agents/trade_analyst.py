"""
Trade Analyst Agent - Handles Trade rule evaluation
"""

import logging
import os
import yaml
from typing import Dict, Any, List, Optional
from strands import Agent, tool
from strands_tools.calculator import calculator
from strands_tools.current_time import current_time
from bedrock_agentcore.tools.code_interpreter_client import code_session
from agents.callback_handlers import SpecialistCallbackHandler
from agents.timeout_retry_hook import ReadTimeoutRetryHook
from agents.data_enrichment import data_enrichment_agent
from agents.data_contract import data_contract_agent
from agents.ecomm_specialist import ecomm_specialist_agent
from config import (
    create_bedrock_model,
    create_analyst_model,
    load_rule_definition_config,
    load_analyst_metrics_config,
    AWS_REGION,
)

logger = logging.getLogger(__name__)

# Global cache for configs
_RULES_CONFIG: Optional[Dict[str, Any]] = None
_ANALYST_METRICS_CONFIG: Optional[Dict[str, Any]] = None

# Code Interpreter ID from environment (custom VPC interpreter)
CODE_INTERPRETER_ID = os.getenv("CODE_INTERPRETER_ID")


def get_rules_config() -> Dict[str, Any]:
    """Get rule definitions, loading from S3 if not already loaded."""
    global _RULES_CONFIG
    
    if _RULES_CONFIG is not None:
        return _RULES_CONFIG
    
    try:
        print("[Trade Analyst] Loading rule definitions from S3...")
        _RULES_CONFIG = load_rule_definition_config()
        
        if _RULES_CONFIG:
            # Count rules across all product-type groups in the decision_tree
            total_rules = sum(
                len(group.get("rules", []))
                for group in _RULES_CONFIG.get("decision_tree", [])
            )
            print(f"[Trade Analyst] Successfully loaded {total_rules} rule definitions")
            logger.info(f"Rule definitions loaded: {total_rules} rules")
            return _RULES_CONFIG
        else:
            print("⚠️  WARNING: Rules config loaded but is empty")
            logger.warning("Rules config loaded but is empty")
            return {}
    except Exception as e:
        print(f"⚠️  WARNING: Failed to load rules from S3: {e}")
        logger.error(f"Failed to load rules from S3: {e}", exc_info=True)
        return {}


def get_analyst_metrics_config() -> Dict[str, Any]:
    """Get analyst metrics, loading from S3 if not already loaded."""
    global _ANALYST_METRICS_CONFIG

    if _ANALYST_METRICS_CONFIG is not None:
        return _ANALYST_METRICS_CONFIG

    try:
        print("[Trade Analyst] Loading analyst metrics from S3...")
        _ANALYST_METRICS_CONFIG = load_analyst_metrics_config()

        if _ANALYST_METRICS_CONFIG:
            metrics_count = sum(
                len(group.get("metrics", []))
                for group in _ANALYST_METRICS_CONFIG.get("metrics", [])
            )
            print(f"[Trade Analyst] Successfully loaded {metrics_count} metric definitions")
            logger.info(f"Analyst metrics loaded: {metrics_count} metrics")
            return _ANALYST_METRICS_CONFIG
        else:
            print("⚠️  WARNING: Analyst metrics config loaded but is empty")
            logger.warning("Analyst metrics config loaded but is empty")
            return {}
    except Exception as e:
        print(f"⚠️  WARNING: Failed to load analyst metrics from S3: {e}")
        logger.error(f"Failed to load analyst metrics from S3: {e}", exc_info=True)
        return {}


def create_analyst_code_interpreter_tool():
    """
    Create AgentCore Code Interpreter tool for the Trade Analyst Agent.

    Provides Python code execution for metric calculations, date operations,
    and rule evaluation verification.

    Returns:
        Strands tool function for code execution if available, None otherwise
    """
    try:
        logger.info("[Trade Analyst] Creating Code Interpreter tool")

        # Persistent session — reused across all execute_python calls so that
        # variables defined in one call are available in subsequent calls.
        _session_state = {"client": None, "context_manager": None}

        def _get_client():
            if _session_state["client"] is None:
                _session_state["context_manager"] = code_session(AWS_REGION, identifier=CODE_INTERPRETER_ID)
                _session_state["client"] = _session_state["context_manager"].__enter__()
                logger.info("[Trade Analyst CodeInterpreter] Created persistent code session")
            return _session_state["client"]

        @tool
        def execute_python(code: str, description: str = "") -> str:
            """
            Execute Python code in a secure AgentCore Code Interpreter sandbox.

            Use this tool to:
            - Perform metric calculations defined in the Analyst Metrics Config
            - Verify rule evaluation arithmetic and logic
            - Calculate Market Value, Remaining Tenor, Liquidity Thresholds
            - Handle date/time calculations for tenor and maturity analysis
            - Validate aggregation results across multiple trades

            **CRITICAL FOR AUDITABILITY AND REGULATORY COMPLIANCE:**
            When reporting results, you MUST include:
            1. The exact Python code executed (in a ```python code block)
            2. The output/results from the execution
            3. Your interpretation of the results

            This ensures full transparency for compliance teams and regulators.

            Args:
                code: Python code to execute
                description: Optional description of what the code does

            Returns:
                String containing execution output or error message
            """
            if description:
                code = f"# {description}\n{code}"

            logger.info(f"[Trade Analyst CodeInterpreter] Executing Python code ({len(code)} chars)")

            try:
                code_client = _get_client()
                response = code_client.invoke("executeCode", {
                    "code": code,
                    "language": "python",
                    "clearContext": False
                })

                results = []
                for event in response["stream"]:
                    if "result" in event:
                        results.append(event["result"])

                if results:
                    final_result = results[-1]

                    if final_result.get("isError", False):
                        error_content = final_result.get("content", [])
                        error_msg = error_content[0].get("text", "Unknown error") if error_content else "Unknown error"
                        logger.error(f"[Trade Analyst CodeInterpreter] Execution error: {error_msg}")
                        return f"Error executing code: {error_msg}"

                    content = final_result.get("content", [])
                    if content and len(content) > 0:
                        output = content[0].get("text", "No output")
                        logger.info(f"[Trade Analyst CodeInterpreter] Execution successful ({len(output)} chars output)")
                        return output
                    else:
                        return "Code executed successfully but no output"
                else:
                    return "No results from code execution"

            except Exception as e:
                # Reset so next call creates a fresh session
                _session_state["client"] = None
                _session_state["context_manager"] = None
                logger.error(f"[Trade Analyst CodeInterpreter] Failed to execute code: {e}", exc_info=True)
                return f"Failed to execute code: {str(e)}"

        logger.info("[Trade Analyst] Code Interpreter tool created successfully")
        return execute_python

    except Exception as e:
        logger.error(f"[Trade Analyst] Failed to create Code Interpreter tool: {e}", exc_info=True)
        return None


TRADE_ANALYST_SYSTEM_PROMPT = """You are a Trade Analyst Specialist for market surveillance.

Your role: evaluate flagged trades against decision tree rules and return structured results.

TOOLS:
- get_decision_tree: Fetch all rules (call once at start).
- get_metrics_config: Fetch metric formulas (call once at start).
- get_rule_details: Look up a single rule by ID.
- data_contract_agent: Query database schema (table names, columns, types, relationships).
- data_enrichment_agent: Retrieve investigation data via SQL queries.
- ecomm_specialist_agent: Analyze trader communications for intent evidence.
- validate_trade_data: Check dataset completeness against required fields.
- calculator / execute_python: Perform calculations.

INVESTIGATION WORKFLOW:

When given an alert ID:
1. Call get_decision_tree and get_metrics_config.
2. Call data_contract_agent to get schema for key tables.
3. Call data_enrichment_agent to retrieve ALL investigation data for the alert: alert
   details, pivot trade, flagged trades, product details, account details, and actor details.
   Request all data in a single query — do NOT make separate calls per data section.
4. Call ecomm_specialist_agent to analyze communications around the Pivot Trade time window.
5. Evaluate all rules for each flagged trade. Apply aggregation rules to any UNCLEARED trades.
6. Return the complete results.

If config tools return an error, return EVALUATION_FAILED immediately.

RULE EVALUATION:

For each flagged trade, evaluate ALL rules from the decision tree:
- Applicable + passes → Status: Pass
- Applicable + fails → Status: Fail
- Not applicable (product type mismatch, etc.) → Status: N/A
- Missing data → Status: INCOMPLETE
If ANY rule passes, trade is CLEARED_INDIVIDUAL.
If no rules pass, trade is UNCLEARED.
After individual evaluation, apply aggregate rules (e.g., R1 — 70% Threshold) to UNCLEARED
trades collectively. Cleared trades become CLEARED_AGGREGATED.

OUTPUT FORMAT — MANDATORY, NON-NEGOTIABLE:

You MUST produce the following for EVERY flagged trade, with NO exceptions:

### Flagged Trade [Trade_ID] — [CLEARED_INDIVIDUAL / UNCLEARED]

| Rule ID | Rule Name | Status | Applicable | Evidence / Reason |
|---------|-----------|--------|------------|-------------------|
| R1      | ...       | Pass/Fail/N/A | Yes/No | Concrete data-backed reason |
| R2      | ...       | ...    | ...        | ...               |
| ...     | ...       | ...    | ...        | ...               |

Requirements:
- EVERY rule from the decision tree MUST have its own row, in rule ID order.
- EVERY row MUST have a concrete Evidence / Reason citing actual data values — never leave it blank.
- Produce a SEPARATE complete table for EACH flagged trade — do NOT combine trades into one table.
- After each table, include the supporting calculations and eComm evidence for passed/failed rules.
- Use exact rule_name values from get_decision_tree — never rephrase or abbreviate.

CRITICAL: Never skip, summarize, or omit rule tables due to output length. If there are
7 flagged trades and 29 rules, you must produce 7 tables with 29 rows each. This is a regulatory
requirement — an incomplete evaluation is worse than a long response. Do not say "similar
to above" or "same as Trade X" — each trade gets its own fully populated table.

METRICS CALCULATIONS:

When rules require calculations, use formulas from get_metrics_config. Include a METRICS
CALCULATIONS section showing: metric_id, formula, inputs, step-by-step calculation, result.

AUDIT TRAIL:

Include an AUDIT TRAIL section at the end documenting each significant action:
- Data queries (agent used, purpose, tables accessed)
- Metric calculations (formula, inputs, result)
- Rule decisions (rule_id, result, rationale)
Format as a YAML list.

PRINCIPLES:
- Never fabricate results or evidence. Cite actual data values.
- Reference config version in output for audit compliance.
- Flag ambiguous cases for manual review.
"""




@tool
def validate_trade_data(investigation_data: Dict[str, Any]) -> str:
    """Validate that the complete investigation dataset contains all required fields for rule evaluation.

    Dynamically reads the data_validation section from the loaded Rule Definition Config
    to determine which data categories and fields are required.

    Args:
        investigation_data: Complete investigation dataset. Keys should match the
            data_validation section keys from the rule definition config
            (e.g., alert_details, pivot_trade, flagged_trades, account_details,
            actor_details, product_details, ecomm_evidence).

    Returns:
        Formatted investigation data for the agent to validate against its loaded config
    """
    logger.info(f"Tool called: validate_trade_data with investigation dataset")

    # Load data_validation section from config
    rules_config = get_rules_config()
    data_validation = rules_config.get("data_validation", {})

    if not data_validation:
        logger.warning("No data_validation section found in rules config, falling back to keys in investigation_data")
        data_validation = {key: {} for key in investigation_data.keys()}

    output = "INVESTIGATION DATA VALIDATION REQUEST\n\n"
    all_section_keys = []

    for section_key, section_config in data_validation.items():
        section_desc = section_config.get("description", section_key)
        required_fields = section_config.get("required_fields", [])
        optional_fields = section_config.get("optional_fields", [])
        section_note = section_config.get("note", "")
        display_name = section_key.upper().replace("_", " ")

        data = investigation_data.get(section_key)
        all_section_keys.append(section_key)

        # Handle list-type sections (e.g., flagged_trades, ecomm_evidence with multiple records)
        if isinstance(data, list):
            output += f"=== {display_name} ({len(data)}) ===\n"
            if not data:
                output += f"  No {section_desc.lower()} provided.\n"
                if section_note:
                    output += f"  Note: {section_note}\n"
            else:
                for i, record in enumerate(data):
                    record_id = record.get("trade_id", record.get("Trade_ID", record.get("conversation_id", f"#{i+1}")))
                    output += f"--- {display_name} {i+1}: {record_id} ---\n"
                    output += f"  Fields present: {len(record)}\n"
                    for field, value in record.items():
                        is_empty = value is None or value == ""
                        output += f"  {field}: {value}{' [EMPTY]' if is_empty else ''}\n"
                    # Check for missing required fields
                    missing = [f for f in required_fields if f not in record]
                    if missing:
                        output += f"  [MISSING REQUIRED FIELDS]: {', '.join(missing)}\n"
                    output += "\n"
        elif isinstance(data, dict):
            output += f"=== {display_name} ===\n"
            output += f"  Fields present: {len(data)}\n"
            for field, value in data.items():
                is_empty = value is None or value == ""
                output += f"  {field}: {value}{' [EMPTY]' if is_empty else ''}\n"
            # Check for missing required fields
            missing = [f for f in required_fields if f not in data]
            if missing:
                output += f"  [MISSING REQUIRED FIELDS]: {', '.join(missing)}\n"
            output += "\n"
        elif data is None:
            output += f"=== {display_name} ===\n"
            output += f"  No data provided for this section.\n"
            if section_note:
                output += f"  Note: {section_note}\n"
            if required_fields:
                output += f"  [MISSING REQUIRED FIELDS]: {', '.join(required_fields)}\n"
            output += "\n"
        else:
            output += f"=== {display_name} ===\n"
            output += f"  {data}\n\n"

    output += f"Validate against ALL required field categories defined in the data_validation section of your loaded configuration.\n"
    output += f"Check: {', '.join(all_section_keys)}.\n"

    flagged_trade_count = len(investigation_data.get("flagged_trades", []))
    logger.info(f"Prepared investigation dataset for validation ({flagged_trade_count} flagged trades, {len(all_section_keys)} sections)")
    return output








@tool
def get_decision_tree() -> str:
    """Retrieve the complete decision tree with all rules, version, and rule sequence.

    Call this tool at the start of any rule evaluation to load the full set of rules.
    The decision tree is the source of truth for rule IDs, names, types, applicability,
    and pass criteria.

    Returns:
        YAML-formatted decision tree including version, rule_sequence, and all rules
        grouped by product type. Returns error message if config is not loaded.
    """
    logger.info("Tool called: get_decision_tree")

    rules_config = get_rules_config()
    if not rules_config:
        logger.error("Rule Definition Config not loaded")
        return "ERROR: Rule Definition Config not loaded. Cannot proceed with evaluation."

    decision_tree = rules_config.get("decision_tree", [])
    total_rules = sum(len(g.get("rules", [])) for g in decision_tree)
    rules_version = rules_config.get("version", "unknown")

    rules_for_output = {
        "version": rules_version,
        "rule_sequence": rules_config.get("rule_sequence", ""),
        "decision_tree": decision_tree,
    }

    output = f"RULE DEFINITION CONFIG (v{rules_version}, {total_rules} rules):\n\n"
    output += yaml.dump(rules_for_output, default_flow_style=False, sort_keys=False)

    logger.info(f"Returned decision tree: {total_rules} rules, version {rules_version}")
    return output


@tool
def get_metrics_config() -> str:
    """Retrieve the complete metrics configuration for financial calculations.

    Call this tool when you need metric formulas for Market Value, Remaining Tenor,
    Liquidity Threshold, or other calculations required by rule evaluation.

    Returns:
        YAML-formatted metrics definitions including version and all metric groups
        by instrument type. Returns error message if config is not loaded.
    """
    logger.info("Tool called: get_metrics_config")

    metrics_config = get_analyst_metrics_config()
    if not metrics_config:
        logger.error("Analyst Metrics Config not loaded")
        return "ERROR: Analyst Metrics Config not loaded. Metric calculations will not be available."

    metrics_version = metrics_config.get("version", "unknown")

    metrics_for_output = {
        "version": metrics_version,
        "metrics": metrics_config.get("metrics", []),
    }

    metrics_count = sum(len(g.get("metrics", [])) for g in metrics_config.get("metrics", []))
    output = f"ANALYST METRICS CONFIG (v{metrics_version}, {metrics_count} metrics):\n\n"
    output += yaml.dump(metrics_for_output, default_flow_style=False, sort_keys=False)

    logger.info(f"Returned metrics config: {metrics_count} metrics, version {metrics_version}")
    return output


@tool
def get_rule_details(rule_id: str) -> str:
    """Get detailed information about a specific decision tree rule.

    Args:
        rule_id: The rule identifier (e.g., 'R1', 'R2', 'R13')

    Returns:
        Rule description, logic, and data requirements
    """
    logger.info(f"Tool called: get_rule_details with rule_id='{rule_id}'")

    rules_config = get_rules_config()
    decision_tree = rules_config.get("decision_tree", [])

    # Search across all product-type groups for the rule
    all_rule_ids = []
    for group in decision_tree:
        product_types = group.get("relevant_product_types", "Unknown")
        for rule in group.get("rules", []):
            rid = rule.get("rule_id", "")
            all_rule_ids.append(rid)
            if rid == rule_id:
                result = f"Rule: {rid}\n"
                result += f"Name: {rule.get('rule_name', 'N/A')}\n"
                result += f"Type: {rule.get('rule_type', 'N/A')}\n"
                result += f"Applicable Product Types: {product_types}\n"
                result += f"Pass Criteria Trade Type: {rule.get('pass_criteria_trade_type', 'N/A')}\n"
                result += f"Pass Criteria:\n{rule.get('pass_criteria', 'N/A')}\n"
                logger.info(f"Returned details for {rule_id}")
                return result

    return f"Rule '{rule_id}' not found in decision tree. Available rules: {', '.join(all_rule_ids)}"




async def create_trade_analyst_agent() -> Agent:
    """
    Create and return the Trade Analyst Agent.

    The agent evaluates flagged trades against decision tree rules
    and provides disposition recommendations.
    """
    logger.info("[Trade Analyst Agent] Creating agent with rule evaluation tools")

    # Verify configs are loadable (pre-warm the cache) but do NOT inject into system prompt.
    # The agent retrieves rules and metrics on demand via get_decision_tree and get_metrics_config tools.
    rules_config = get_rules_config()
    metrics_config = get_analyst_metrics_config()

    enhanced_prompt = TRADE_ANALYST_SYSTEM_PROMPT

    if rules_config:
        total_rules = sum(
            len(group.get("rules", []))
            for group in rules_config.get("decision_tree", [])
        )
        rules_version = rules_config.get("version", "unknown")
        logger.info(f"[Trade Analyst Agent] Rules config available: {total_rules} rules (v{rules_version})")
    else:
        logger.warning("[Trade Analyst Agent] No rule definitions loaded — get_decision_tree will return error")

    if metrics_config:
        metrics_version = metrics_config.get("version", "unknown")
        logger.info(f"[Trade Analyst Agent] Metrics config available: v{metrics_version}")
    else:
        logger.warning("[Trade Analyst Agent] No metrics config loaded — get_metrics_config will return error")

    # Build tools list
    tools = [
        current_time,
        calculator,
        get_decision_tree,       # Fetch full decision tree on demand
        get_metrics_config,      # Fetch metrics definitions on demand
        validate_trade_data,
        get_rule_details,
        data_contract_agent,     # Database schema lookups
        data_enrichment_agent,   # Data retrieval via SQL queries
        ecomm_specialist_agent,  # Electronic communications analysis
    ]

    # Add Code Interpreter tool if available
    code_interpreter_tool = create_analyst_code_interpreter_tool()
    if code_interpreter_tool:
        logger.info("[Trade Analyst Agent] Adding Code Interpreter tool")
        tools.append(code_interpreter_tool)
    else:
        logger.warning("[Trade Analyst Agent] Code Interpreter tool not available")

    # Use Sonnet instead of Opus — rule evaluation is structured, procedural work
    # (match data against rules, compute metrics, produce tables). Sonnet is 3-5x
    # faster and sufficient for this task. Opus was the #1 bottleneck (811s → ~200s).
    return Agent(
        model=create_analyst_model(),
        name="Trade Analyst Agent",
        description="Evaluates flagged trades against decision tree rules",
        system_prompt=enhanced_prompt,
        tools=tools,
        callback_handler=SpecialistCallbackHandler(agent_name="Trade Analyst"),
        trace_attributes={
            "agent.type": "specialist",
            "agent.name": "trade-analyst",
            "agent.domain": "trade-investigation",
            "rules.count": total_rules if rules_config else 0,
            "metrics.loaded": bool(metrics_config),
        },
        hooks=[ReadTimeoutRetryHook(max_retries=2, backoff_seconds=5)],
    )




# Export as tool for coordinator
@tool
async def trade_analyst_agent(query: str) -> str:
    """
    Specialized agent for trade rule evaluation and disposition.
    
    Use this agent when you need to:
    - Validate enriched trade data completeness
    - Evaluate trades against decision tree rules (individual or aggregation)
    - Determine cleared vs. uncleared trade status
    - Generate investigation rationale with evidence
    - Get details about specific decision tree rules
    
    Args:
        query: The investigation question or evaluation request
        
    Returns:
        Trade evaluation results, disposition recommendations, or rule information
    """
    try:
        logger.info(f"[Trade Analyst Agent] Processing query: {query[:100]}...")
        
        agent = await create_trade_analyst_agent()
        response = await agent.invoke_async(query)
        
        # Extract text from response — do NOT truncate.
        # Trade Analyst output contains complete rule tables and audit trails that are
        # regulatory requirements.  Truncation caused incomplete investigations.
        if hasattr(response, 'content') and isinstance(response.content, list):
            result = " ".join(block.text for block in response.content if hasattr(block, 'text'))
        else:
            result = str(response)

        logger.info(f"[Trade Analyst Agent] Returning {len(result)} characters")
        return result
    except Exception as e:
        logger.error(f"[Trade Analyst Agent] Error: {str(e)}", exc_info=True)
        return f"Error in Trade Analyst Agent: {str(e)}"
