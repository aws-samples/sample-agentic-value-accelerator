"""
Coordinator Agent - Orchestrates specialized agents for Market Surveillance
"""

import os
import logging
from typing import Dict, Any, Optional
from strands import Agent, tool
from strands_tools.calculator import calculator
from strands_tools.current_time import current_time
from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
from bedrock_agentcore.tools.code_interpreter_client import code_session
from agents.callback_handlers import CoordinatorCallbackHandler, emit_image_event
from agents.chart_utils import (
    _PLOT_SETUP,
    _PLOT_CLEANUP,
    _extract_charts,
    _extract_chart_title,
    upload_chart_to_s3,
)
from agents.timeout_retry_hook import ReadTimeoutRetryHook
from agents.data_contract import data_contract_agent
from agents.data_enrichment import data_enrichment_agent
from agents.trade_analyst import trade_analyst_agent
from agents.report_assembly import report_assembly_agent
from agents.ecomm_specialist import ecomm_specialist_agent
from agents.gateway_tools import init_gateway_client, get_gateway_client
from config import create_bedrock_model, AWS_REGION, MEMORY_ID, load_orchestrator_config, GATEWAY_URL

logger = logging.getLogger(__name__)

# Global cache for orchestrator config
_ORCHESTRATOR_CONFIG: Optional[Dict[str, Any]] = None

# Code Interpreter ID from environment (custom VPC interpreter)
CODE_INTERPRETER_ID = os.getenv("CODE_INTERPRETER_ID")


def create_gateway_mcp_client():
    """
    Create MCP client for AgentCore Gateway tools.
    
    Uses the gateway_tools module for proper client initialization.
    
    Returns:
        MCPClient instance if gateway URL is configured, None otherwise
    """
    if not GATEWAY_URL:
        logger.warning("[Coordinator] GATEWAY_URL not configured - gateway tools disabled")
        return None
    
    try:
        logger.info(f"[Coordinator] Initializing gateway client: {GATEWAY_URL}")
        
        # Initialize gateway client with URL and region
        init_gateway_client(gateway_url=GATEWAY_URL, aws_region=AWS_REGION)
        
        # Get MCP client (synchronous call)
        mcp_client = get_gateway_client(prefix="gateway")
        
        logger.info("[Coordinator] Gateway MCP client created successfully")
        return mcp_client
    except Exception as e:
        logger.error(f"[Coordinator] Failed to create gateway MCP client: {e}", exc_info=True)
        return None


def create_code_interpreter_tool():
    """
    Create AgentCore Code Interpreter tool for Python code execution.
    
    Uses bedrock_agentcore.tools.code_interpreter_client directly.
    
    Returns:
        Strands tool function for code execution if available, None otherwise
    """
    try:
        logger.info(f"[Coordinator] Creating Code Interpreter tool for region: {AWS_REGION}")

        # Persistent session — reused across all execute_python calls so that
        # variables defined in one call are available in subsequent calls.
        _session_state = {"client": None, "context_manager": None}

        def _get_client():
            if _session_state["client"] is None:
                _session_state["context_manager"] = code_session(AWS_REGION, identifier=CODE_INTERPRETER_ID)
                _session_state["client"] = _session_state["context_manager"].__enter__()
                logger.info("[CodeInterpreter] Created persistent code session")
            return _session_state["client"]

        @tool
        def execute_python(code: str, description: str = "") -> str:
            """
            Execute Python code in a secure AgentCore Code Interpreter sandbox.
            
            Use this tool to:
            - Perform mathematical calculations and statistical analysis
            - Validate data and verify rule logic
            - Analyze trade patterns and detect anomalies
            - Calculate financial metrics (returns, ratios, aggregations)
            - Handle date/time calculations
            
            VALIDATION PRINCIPLES:
            - When making claims about calculations, write code to verify them
            - Test mathematical calculations and algorithms before reporting
            - Create test scripts to validate understanding
            - Always show your work with actual code execution
            
            **CRITICAL FOR AUDITABILITY AND REGULATORY COMPLIANCE:**
            When reporting results to the user, you MUST include:
            1. The exact Python code you executed (in a ```python code block)
            2. The output/results from the execution
            3. Your interpretation of the results
            
            This is NOT optional - it is a regulatory requirement for market surveillance.
            Compliance teams and regulators must be able to verify:
            - What calculations were performed
            - The exact logic and algorithms used
            - How conclusions were derived from data
            - Reproducibility of all analysis
            
            Never summarize or paraphrase code - show the ACTUAL code that was executed.
            This ensures full transparency and allows auditors to verify your methodology.
            
            Args:
                code: Python code to execute
                description: Optional description of what the code does (for documentation)
                
            Returns:
                String containing execution output or error message
            """
            # Add description as comment if provided
            if description:
                code = f"# {description}\n{code}"

            # Wrap the code with plot setup/cleanup so matplotlib and Plotly
            # figures are captured as base64 PNG markers in stdout. The chart
            # markers are parsed out of the output and streamed to the UI via
            # emit_image_event — the returned audit string contains only the
            # exact code and text output the user authored.
            full_code = _PLOT_SETUP + code + "\n" + _PLOT_CLEANUP

            logger.info(f"[CodeInterpreter] Executing Python code ({len(code)} chars)")
            if description:
                logger.info(f"[CodeInterpreter] Description: {description}")

            try:
                code_client = _get_client()
                response = code_client.invoke("executeCode", {
                    "code": full_code,
                    "language": "python",
                    "clearContext": False
                })

                # Process all events in the stream
                results = []
                for event in response["stream"]:
                    if "result" in event:
                        results.append(event["result"])

                # Return the last result or combine all results
                if results:
                    final_result = results[-1]  # Get the last result

                    # Check for errors
                    if final_result.get("isError", False):
                        error_content = final_result.get("content", [])
                        error_parts: list[str] = []
                        for item in error_content:
                            if isinstance(item, dict):
                                if "text" in item:
                                    error_parts.append(item["text"])
                                resource = item.get("resource", {})
                                if isinstance(resource, dict) and "text" in resource:
                                    error_parts.append(resource["text"])
                        error_msg = "\n".join(p for p in error_parts if p) or "Unknown error"
                        logger.error(f"[CodeInterpreter] Execution error: {error_msg}")
                        return f"Error executing code: {error_msg}"

                    # Return successful output
                    content = final_result.get("content", [])
                    if content and len(content) > 0:
                        # Collect text output from all items (stdout/print + file resources)
                        # and any blob resources the interpreter returns as charts.
                        raw_output = ""
                        blob_charts: list[str] = []
                        for item in content:
                            if isinstance(item, dict):
                                if "text" in item:
                                    raw_output += item["text"]
                                resource = item.get("resource", {})
                                if isinstance(resource, dict):
                                    if "text" in resource:
                                        raw_output += resource["text"]
                                    if "blob" in resource:
                                        blob_charts.append(resource["blob"])
                                        logger.info("[CodeInterpreter] Found blob resource in response")

                        if not raw_output:
                            raw_output = "No output"

                        # Strip chart markers and collect base64 payloads from stdout.
                        text_output, marker_charts = _extract_charts(raw_output)
                        all_charts = marker_charts + blob_charts

                        chart_title = _extract_chart_title(code)
                        for i, chart_b64 in enumerate(all_charts):
                            alt = description or chart_title or f"Chart {i + 1}"
                            s3_key = upload_chart_to_s3(chart_b64)
                            emit_image_event(chart_b64, alt, s3_key=s3_key)
                            logger.info(
                                f"[CodeInterpreter] Emitted chart image "
                                f"({len(chart_b64)} chars base64, s3_key={s3_key})"
                            )

                        chart_note = (
                            f"\n\n[{len(all_charts)} chart(s) generated and displayed to the user]"
                            if all_charts else ""
                        )
                        display_output = text_output if text_output else "Code executed successfully."

                        logger.info(
                            f"[CodeInterpreter] Execution successful "
                            f"({len(text_output)} chars text, {len(all_charts)} charts)"
                        )
                        return f"```python\n{code}\n```\n\nOutput:\n```\n{display_output}\n```{chart_note}"
                    else:
                        logger.info("[CodeInterpreter] Code executed successfully but no output")
                        return f"```python\n{code}\n```\n\nCode executed successfully but produced no output."
                else:
                    logger.warning("[CodeInterpreter] No results from code execution")
                    return "No results from code execution"

            except Exception as e:
                # Reset so next call creates a fresh session
                _session_state["client"] = None
                _session_state["context_manager"] = None
                logger.error(f"[CodeInterpreter] Failed to execute code: {e}", exc_info=True)
                return f"Failed to execute code: {str(e)}"
        
        logger.info("[Coordinator] Code Interpreter tool created successfully")
        return execute_python
        
    except Exception as e:
        logger.error(f"[Coordinator] Failed to create Code Interpreter tool: {e}", exc_info=True)
        return None


def get_orchestrator_config() -> Dict[str, Any]:
    """Get orchestrator configuration, loading from S3 if not already loaded."""
    global _ORCHESTRATOR_CONFIG
    
    if _ORCHESTRATOR_CONFIG is not None:
        return _ORCHESTRATOR_CONFIG
    
    try:
        print("[Coordinator] Loading orchestrator config from S3...")
        _ORCHESTRATOR_CONFIG = load_orchestrator_config()
        
        if _ORCHESTRATOR_CONFIG:
            print("[Coordinator] Successfully loaded orchestrator configuration")
            logger.info("Orchestrator configuration loaded successfully")
            return _ORCHESTRATOR_CONFIG
        else:
            print("⚠️  WARNING: Orchestrator config loaded but is empty")
            logger.warning("Orchestrator config loaded but is empty")
            return {}
    except Exception as e:
        print(f"⚠️  WARNING: Failed to load orchestrator config from S3: {e}")
        logger.error(f"Failed to load orchestrator config from S3: {e}", exc_info=True)
        return {}


COORDINATOR_SYSTEM_PROMPT = """ 
You are the Market Surveillance Coordinator Agent for the Market Surveillance system.

ALERT CONTEXT:
When a user message includes "[Alert Context: Alert ID = {id}]" at the beginning, this indicates the user is 
investigating a specific alert. You should:
1. Use the alert ID in all data queries and tool calls related to this investigation
2. Reference the alert ID when saving investigation summaries
3. Provide context-aware responses based on the alert being investigated

CRITICAL OPERATING PRINCIPLE:
You are a tool-based orchestration agent. You MUST use your specialized agent tools to answer questions with factual, data-driven responses. Do NOT rely on general knowledge or assumptions. When users ask questions, route them to the appropriate specialized agent tool.

AVAILABLE SPECIALIZED AGENTS:

1. Data Contract Agent
   Purpose: Database schema and structure information
   Use for: Available tables, table schemas (columns, types, constraints), relationships between tables, 
   primary/foreign keys, column searches and data field locations

2. Data Enrichment Agent
   Purpose: Data retrieval, querying, and enrichment
   Use for: Retrieving specific records or datasets, counting/filtering/aggregating data, joining tables 
   and analyzing patterns, sample data and examples, trade and alert data enrichment
   
   **MANDATORY PRE-QUERY STEP:**
   Before requesting ANY data query from the Data Enrichment Agent, you MUST first consult the 
   Data Contract Agent to retrieve the schema for the relevant tables. This includes:
   - Exact table names and column names
   - Column data types and constraints
   - Primary/foreign key relationships and JOIN conditions
   - Reference table values for filtering
   
   Do NOT ask the Data Enrichment Agent to execute SQL without first confirming the schema through the Data Contract Agent. 
   
   **DATA ACCESS TRACING:**
   The Data Enrichment Agent provides a DATA ACCESS TRACE after every query documenting which database 
   and tables are accessed, and what JOIN operations are performed.
   
   **CRITICAL REQUIREMENT:**
   When the Data Enrichment Agent returns a response containing a DATA ACCESS TRACE, you MUST include 
   this trace in your response to the user. This is a regulatory requirement for market surveillance
   investigations. Never omit or summarize the trace.

3. Trade Analyst Agent
   Purpose: Alert investigation, rule evaluation, and trade disposition
   Use for: Full alert investigations, decision tree rule evaluation, trade disposition

   **SELF-SUFFICIENT INVESTIGATION AGENT:**
   The Trade Analyst Agent has its own access to Data Contract, Data Enrichment, and eComm
   Specialist agents as tools. When you route an investigation to it, provide the alert ID
   and any context already gathered — the Trade Analyst will fetch whatever additional data
   it needs directly.

   You do NOT need to pre-gather all investigation data before invoking this agent. Simply
   route the investigation with the alert ID and let the Trade Analyst handle the data
   retrieval, rule evaluation, and disposition determination.

   **METRICS CALCULATIONS:**
   When the Trade Analyst Agent evaluates rules, it produces a METRICS CALCULATIONS section
   showing the actual arithmetic performed (metric_id, formula, inputs, step-by-step
   calculation, result with units).

   You MUST preserve and include these metrics calculations in:
   - Your response to the user (for transparency)
   - The investigation summary (summaryText)
   - The audit trail (asyncAuditTrail) as entries of type "computation"

   Never omit, summarize, or paraphrase the metrics calculations. They are a regulatory
   requirement for auditability and reproducibility of the investigation.

   Defer to the Trade Analyst for all rule-related questions and evaluations.

4. Report Assembly Agent
   Purpose: Output schema and report structure for investigation reports
   Use for: Output tables required in investigation reports, output column schemas and formatting rules,
   source table mappings for output fields, required vs optional columns, data formatting requirements,
   report structure and organization

5. eComm Specialist Agent
   Purpose: Electronic communications analysis (trader instant messages)
   Use for: Ad-hoc eComm queries outside of a full investigation (e.g., user asks about
   specific conversations or traders). During investigations, the Trade Analyst Agent
   invokes the eComm Specialist directly.

6. Gateway Tools (MCP via AgentCore Gateway)
   Purpose: Investigation summary persistence and retrieval
   Available tools:
   - gateway_get-latest-summary___get_latest_summary: Retrieve the most recent investigation summary for an alert
   - gateway_save-summary___save_summary: Save investigation summary with findings and recommendations
   
   When to use:
   - At the start of interactive sessions: Call gateway_get-latest-summary___get_latest_summary to understand prior investigations
   - After completing alert investigation: Call gateway_save-summary___save_summary to persist findings
   - When user asks about previous investigations: Retrieve summary to provide context

7. Code Interpreter (AgentCore Code Interpreter)
   Purpose: Execute Python code for calculations, data analysis, validation, AND chart generation
   Available capabilities: Mathematical calculations and statistical analysis, data validation and verification,
   pattern detection and anomaly analysis, financial calculations (returns, ratios, aggregations),
   date/time calculations and business day logic, matplotlib / Plotly chart rendering with inline PNG display

   When to use:
   - Complex calculations and statistical analysis requiring precision (e.g., trade volume aggregations, price calculations)
   - User asks to plot, chart, graph, visualize, or diagram trade data, flagged-trade patterns, alerts, or eComm activity
   - User asks for complex calculations or statistical analysis
   - Need to validate trade data against mathematical thresholds
   - Performing aggregations or transformations on trade data
   - Verifying rule logic with concrete examples
   - Any scenario requiring precise numerical computation

   VALIDATION PRINCIPLES:
   1. When making claims about code, algorithms, or calculations - write code to verify them
   2. Use execute_python to test mathematical calculations, algorithms, and logic
   3. Create test scripts to validate your understanding before giving answers
   4. Always show your work with actual code execution
   5. If uncertain, explicitly state limitations and validate what you can

   The execute_python tool returns execution results with stdout/stderr and an isError flag. Check isError to determine success.
   Be thorough, accurate, and always validate your answers when possible.

PLOTTING AND CHARTS — CRITICAL:
When the user asks to plot, chart, graph, visualize, or diagram data, you MUST generate
a chart image using execute_python with matplotlib or Plotly. This is non-negotiable — never describe
a chart in words when you can generate one. The chart will be captured automatically and
displayed inline to the investigator.

DATA-DRIVEN CHARTING — MANDATORY:
- Always query the database (via Data Enrichment Agent) first. Never plot assumed, estimated,
  or hard-coded values. Every data point must come from an actual query result or be
  explicitly provided by the user.
- Verify calculations before charting: Before generating any chart, double-check that the
  data feeding into the plot is correct — re-examine query results and any intermediate
  calculations. Print the final data values in the execute_python output before calling
  plt.show() / fig.show() so the user can confirm accuracy.

LIBRARY SELECTION:
- Use Plotly (plotly.graph_objects or plotly.express) by default for ALL chart types.
- Use matplotlib only when:
  - The user explicitly asks for matplotlib.
  - Plotly fails (e.g., kaleido rendering error) — fall back to matplotlib and inform the user.
- Both libraries produce static PNG images. The output is identical to the user.

PLOT CONSTRAINTS — MANDATORY (violations will produce unreadable output):
- EXACTLY ONE plot per figure — NEVER use subplots:
  Do NOT use plt.subplots() with multiple axes, fig.add_subplot(), gridspec, or any
  mechanism that places more than one chart in a single image. Each figure must contain
  exactly ONE plotting call (one bar chart OR one line chart OR one pie chart, etc.).
  If you need to show related data series, overlay them on the SAME axes (e.g., multiple
  bars in a grouped bar chart, or multiple lines on one line chart) — but never split
  them into separate subplot panels.
- EXACTLY ONE figure per execute_python call:
  Call plt.figure() or go.Figure() exactly once. Do NOT create multiple figures in a
  single code block. If the user requests multiple charts, make SEPARATE execute_python
  calls — one per chart.
- ONE chart per response by default: Generate only one chart image per response unless
  the user explicitly asks for multiple charts (e.g. "show me a bar chart AND a line chart").
- Clarify ambiguous chart types: If the user's request doesn't make the chart type obvious
  (e.g. "visualize this data" without specifying bar, line, pie, etc.), ask the user which
  chart type they prefer before generating.

PLOTLY-SPECIFIC RULES:
- Always call fig.show() at the end of Plotly code. The chart is captured only when .show() is called.
- Do NOT use fig.write_image() or fig.to_image() directly — fig.show() handles PNG capture automatically.
- Do NOT attempt to install kaleido — it is already available in the sandbox.

Supported chart types — choose the best fit for the data:
- Bar chart: comparing categories or counts (e.g., trade counts by trader, notional by product)
- Line chart: trends over time or sequential data (e.g., price over time, daily alert volume)
- Pie chart: proportions of a whole
- Scatter plot: correlation between two variables (e.g., price vs. volume)
- Histogram: distribution of values (e.g., notional distribution of flagged trades)
- Stacked bar / Grouped bar: breakdown of categories by sub-groups
- Heatmap: matrix data, correlations
- Box plot: distribution spread and outliers
- Area chart: cumulative trends
- Treemap / Sunburst (Plotly): hierarchical data proportions
- Sankey diagram / Waterfall / Funnel (Plotly): flow, sequential contributions, conversion stages

Example pattern for Plotly plotting (preferred):
```python
import plotly.graph_objects as go

# ... prepare data from query results ...
print("Chart data:", dict(zip(categories, values)))  # verify inputs before plotting

fig = go.Figure(data=[go.Bar(x=categories, y=values, marker_color='steelblue')])
fig.update_layout(title='Chart Title', xaxis_title='X Label', yaxis_title='Y Label', width=800, height=500)
fig.show()  # REQUIRED — captures and displays the chart
```

Example pattern for matplotlib (fallback):
```python
import matplotlib.pyplot as plt

# ... prepare data from query results ...
print("Chart data:", dict(zip(categories, values)))

# One figure, one plot, one plt.show().
plt.figure(figsize=(14, 8))
plt.bar(categories, values, color='steelblue')
plt.title('Chart Title')
plt.xlabel('X Label')
plt.ylabel('Y Label')
plt.tight_layout()
plt.show()
```

AGENT ROUTING DECISION MATRIX:

| Query Type | Route To | Examples |
|------------|----------|----------|
| Schema/structure questions | Data Contract Agent | "What tables exist?", "Show schema for [table]", "Which columns contain [data]?" |
| Data retrieval/analysis | Data Enrichment Agent | "Show trades for alert [id]", "Count trades on [date]", "Get trades for trader [id]" |
| Rule evaluation/trade analysis | Trade Analyst Agent | "What rules are used?", "Explain [rule_id]", "Evaluate trades against rules" |
| Report structure/output | Report Assembly Agent | "What tables in report?", "Show output schema", "Required columns for [table]?" |
| eComm/communications analysis | eComm Specialist Agent | "Find conversations for ISIN [id]", "What were traders discussing?", "Show messages for conversation [id]" |
| Investigation persistence | Gateway Tools | "Retrieve previous investigation", "Save investigation summary" |
| Calculations/validation/charts | Code Interpreter | "Calculate ratio", "Validate threshold", "Aggregate trade volumes", "Plot/chart/graph/visualize ..." |

ALERT INVESTIGATION WORKFLOW:

IMPORTANT: At the start of any interactive investigation session, ALWAYS call gateway_get_latest_summary
to retrieve any previous investigation context. This ensures you have complete information about what
has already been investigated and can provide context-aware responses.

INVESTIGATION STEPS (execute in this order):
1. Retrieve previous investigation context (Gateway Tools)
2. Route the investigation to the Trade Analyst Agent with the alert ID and any prior context.
   The Trade Analyst handles data retrieval, eComm analysis, and rule evaluation autonomously.
3. Receive the complete evaluation results from the Trade Analyst Agent.
4. Build the investigation summary report from the results.
5. Save the investigation summary (Gateway Tools).

TRADE TERMINOLOGY (CRITICAL — USE CONSISTENTLY):

Throughout the investigation and in all reports, summaries, and audit trails, you MUST distinguish 
between two categories of trades:

1. **Pivot Trade**: The customer trade that triggered the alert. This is the single trade from 
   Fact_Alert (joined with Fact_Trade) that the surveillance system flagged. In the output schema 
   this corresponds to the "pivot_trade" table. Always refer to this trade as the "Pivot Trade" 
   — never as "customer trade", "alerted trade", or "primary trade".

2. **Flagged Trades**: The suspected flagged trades executed before the Pivot Trade.
   These are the trades from the flagged_trade table that are evaluated against the decision tree rules.
   In the output schema this corresponds to the "flagged_trades" table. Always refer to these
   as "Flagged Trades" — never as "related trades" or "relevant trades".

When generating investigation summaries, markdown tables, and audit trail entries, use these exact 
labels to clearly distinguish which trade(s) you are referencing. For example:
- "The Pivot Trade was a BUY of 15,000,000 at 98.75 on 03/15/2025."
- "3 Flagged Trades were identified for evaluation against the decision tree rules."
- Table headers should read "Pivot Trade Details" and "Flagged Trade Details" respectively.

AGENT RECOMMENDATION FRAMING (CRITICAL):

RULE EXECUTION RESULTS vs. OVERALL DISPOSITION:

Individual rule evaluations produce definitive, factual results. When reporting rule outcomes, use firm 
language that references the rule output directly:
- "Rule03 result: Pass — the trade was client-initiated based on eComm evidence."
- "Rule07 result: Fail — notional amount exceeds the liquidity threshold."
- "The trade is CLEARED at the individual level based on Rule01 through Rule09 evaluation."
These are outputs of defined rule logic, not opinions. Report them as such.

The OVERALL DISPOSITION

- Always label the overall disposition as "Agent Recommendation" (e.g., "Agent Recommendation: Cleared" 
  or "Agent Recommendation: Uncleared — Escalate for Review").
- NEVER use phrases such as "final decision", "final outcome", "outcome decision", or "definitive 
  determination" when describing the overall disposition.
- Use language like: "Based on the rule evaluation results and supporting analysis, the agent 
  recommends…", "Agent Recommendation:", "Recommended disposition:".
- The human analyst retains full authority to accept, modify, or override the agent's recommendation.

INVESTIGATION SUMMARY PERSISTENCE:

After completing an alert investigation, you MUST:
1. Call the get_report_template tool to retrieve the exact report format and audit trail requirements.
2. Save the investigation summary using gateway_save-summary___save_summary following that template exactly.

RESPONSE REQUIREMENTS:

1. Tool-First Approach
   - Always use specialized agent tools for factual information
   - Do not answer from general knowledge when a tool can provide the answer
   - Route questions using the Agent Routing Decision Matrix above

2. Code and Query Transparency (REGULATORY REQUIREMENT)
   - **ALWAYS include complete SQL queries and Python code in responses using code blocks**
   - **ALWAYS include DATA ACCESS TRACE sections verbatim from Data Enrichment Agent**
   - **ALWAYS include METRICS CALCULATIONS sections verbatim from Trade Analyst Agent**
   - **Never summarize, paraphrase, or omit code/traces/calculations - show exactly what was executed**
   
   This ensures auditability, reproducibility, and regulatory compliance. Compliance teams can verify 
   what data was queried and how, regulators can audit the investigation methodology, and results are 
   fully reproducible.

3. Rule Naming Integrity
   - When the Trade Analyst Agent returns rule evaluation results, preserve the exact rule_id and
     rule_name as provided. Do NOT rename, rephrase, abbreviate, or paraphrase rule names.
   - In the investigation summary (summaryText), tables, narrative, and audit trail, always use
     the canonical rule_name from the Rule Definition Config exactly as the Trade Analyst reported it.
   - Example: if the Trade Analyst says "R2 — Different LOBs", write exactly "R2 - Different LOBs" — never
     "Different Lines of Business", "LOB Mismatch", or any variation.

4. Professional Communication
   - Clear, concise, and factual responses
   - No emojis or casual language
   - Use proper technical terminology
   - Structure responses with headings and lists when appropriate

5. Data Accuracy
   - Never fabricate database schema information
   - Never invent table names, column names, or data values
   - Never make assumptions about rule logic or criteria
   - Always defer to specialized agents for their domain expertise
   - If uncertain, explicitly state limitations and suggest appropriate tool

6. Error Handling
   - If a tool fails, report the failure clearly
   - Follow retry logic as appropriate
   - Escalate to appropriate workflow state (e.g., FAILED)
   - Provide actionable next steps for resolution

"""


INVESTIGATION_REPORT_TEMPLATE = """
=== INVESTIGATION SUMMARY REPORT FORMAT ===

## 1. Executive Summary

- Summary of analysis and agent recommendation (1-2 paragraphs).

## 2. Investigation Scope

Present the investigation data in clear table format. Each subsection below MUST be wrapped
in a collapsible HTML details/summary block. The summary text is the subsection heading
(e.g., "2.1 Alert Details"). Inside each block, render the actual data as a markdown table.

Subsections:
- 2.1 Alert Details — alert information in a markdown table.
- 2.2 Pivot Trade — pivot trade details in a markdown table.
- 2.3 Flagged Trades — ALL flagged trades in a markdown table (one row per trade), with count and total notional value.
- 2.4 Product Details — product/security details in a markdown table.
- 2.5 Account Details — account details in a markdown table.
- 2.6 Actor Details — trader/actor details in a markdown table.
- 2.7 eComm Evidence — eComm evidence in a markdown table if available. If none found, state: "No eComm evidence found within the time window."

## 3. Decision Tree Rule Evaluation Detail

For each flagged trade, create a collapsible HTML details/summary block. Use the trade ID and
disposition (CLEARED_INDIVIDUAL or UNCLEARED) as the summary text.

The Trade Analyst Agent returns a complete rules table and supporting analysis for each flagged trade.
Include this output directly inside the collapsible block — do not restructure or omit any part of it.

If any flagged trades remain UNCLEARED after individual evaluation and aggregation rules were applied,
include a separate subsection titled "Aggregation Rule Results" showing which aggregation rules
were applied, the trades evaluated collectively, and whether the aggregation cleared them
(CLEARED_AGGREGATED) or they remain UNCLEARED.

## 4. Data Sources
- Tables Accessed: list all database tables queried during the investigation.
- Metadata: config file versions, agent versions, any relevant execution metadata.

## 5. Agent Observations

Wrap this section in a collapsible HTML details/summary block with "Agent Observations" as the summary text.

Surface anything noteworthy that falls outside the structured rule evaluation — patterns,
anomalies, or contextual details that the decision tree rules do not explicitly cover but
that a human analyst might find relevant. Examples: unusual timing patterns, price/quantity
anomalies, trader behavior patterns, data quality issues, eComm observations outside
Rule03/Rule04, timestamp discrepancies, or relevant account/product/market context.

If there are no additional observations, state: "No additional observations beyond the rule evaluation results."

=== END OF REPORT FORMAT ===

IMPORTANT NOTES ON REPORT FORMAT:
- The analysis sequence (how you conduct the investigation) is different from the presentation
  sequence (how you write the report). Conduct the investigation in the workflow order, but
  write the report in the section order above.
- Section 3 is the core of the report. It must be thorough and evidence-based.
- Section 5 (Agent Observations) is your space to add value beyond the rules. Use it.

The summary payload to gateway_save-summary___save_summary should include:

1. summaryText: The full report following the section structure above, formatted in markdown.

2. findings: Array of concise finding statements. Include rule evaluation results:
   Format: "Rule [ID]: [Rule Name] - [Result] - [Brief rationale]"

3. asyncAuditTrail: Comprehensive audit trail documenting every step of the investigation.
   The audit trail must provide complete transparency so a compliance officer or regulator
   can reproduce the investigation by following the same steps.

   Each entry has four fields: timestamp (ISO 8601), type, content (human-readable), and metadata.

   Required metadata by type:

   | Type | Required Metadata Fields |
   |------|------------------------|
   | data_access | tool_name, table_name, database_name, sql_query (COMPLETE, never truncated), query_purpose, row_count, execution_time_ms, data_access_trace |
   | computation (code) | tool_name, code_snippet (COMPLETE, all lines), purpose, input_summary, output_summary, variables_used |
   | computation (metrics) | source_agent, metric_id, metric_name, instrument_type, formula, inputs, calculation, result, units |
   | agent_routing | agent, purpose, input_summary, expected_output |
   | tool_call | tool_id, tool_name, function_name, function_arguments, tool_output_summary, purpose |
   | decision | recommendation, rationale, alternatives_considered, workflow_state |
   | thinking | reasoning, context, next_steps |

   The Trade Analyst Agent includes an AUDIT TRAIL section in its response documenting all
   data queries, metric calculations, and rule evaluation decisions it performed. Incorporate
   these entries into the asyncAuditTrail — do not discard or summarize them.

   Additionally, add your own entries for coordinator-level actions: agent routing decisions,
   gateway tool calls, and the overall disposition decision.

   Pass the complete combined trail to gateway_save-summary___save_summary.
"""


@tool
def get_report_template() -> str:
    """Retrieve the investigation report template and audit trail requirements.

    Call this tool ONCE when you are ready to assemble the final investigation summary
    before saving it via gateway_save-summary___save_summary. Do NOT call this at the
    start of an investigation — only when you need the report format.

    Returns:
        The complete report template including section structure, formatting rules,
        and asyncAuditTrail metadata requirements.
    """
    return INVESTIGATION_REPORT_TEMPLATE


def create_coordinator_agent(user_id: str = None, session_id: str = None) -> Agent:
    """
    Create and return the Coordinator Agent with all specialized agents as tools.
    
    The coordinator agent orchestrates the specialized agents to provide
    comprehensive assistance across the Market Surveillance system.
    
    Args:
        user_id: User identifier for trace attributes and memory actor_id
        session_id: Session identifier for conversation threading and memory
        
    Returns:
        Configured Agent instance
    """
    logger.info(f"[Coordinator] Creating coordinator agent for user: {user_id}, session: {session_id}")
    
    # Load orchestrator configuration
    orchestrator_config = get_orchestrator_config()
    workflow_config = orchestrator_config.get("orchestrator_config", {}).get("workflow", {})
    
    # Use base system prompt (no YAML dump for now)
    enhanced_prompt = COORDINATOR_SYSTEM_PROMPT
    
    if workflow_config:
        logger.info(f"[Coordinator] Workflow configuration loaded")
    else:
        logger.warning("[Coordinator] No workflow configuration loaded")
    
    # Initialize Bedrock model with optimal configuration
    bedrock_model = create_bedrock_model()
    logger.info("[Coordinator] Bedrock model created")
    
    # Configure AgentCore Memory session manager
    session_manager = None
    if MEMORY_ID and session_id and user_id:
        agentcore_memory_config = AgentCoreMemoryConfig(
            memory_id=MEMORY_ID,
            session_id=session_id,
            actor_id=user_id
        )
        session_manager = AgentCoreMemorySessionManager(
            agentcore_memory_config=agentcore_memory_config,
            region_name=AWS_REGION
        )
        print(f"AgentCore Memory enabled: {MEMORY_ID}")
        print(f"  Session: {session_id}")
        print(f"  Actor: {user_id}")
        logger.info(f"[Coordinator] AgentCore Memory configured: {MEMORY_ID}")
    else:
        reasons = []
        if not MEMORY_ID:
            reasons.append("MEMORY_ID not set")
        if not session_id:
            reasons.append("session_id not provided")
        if not user_id:
            reasons.append("user_id not provided")
        
        print(f"AgentCore Memory disabled: {', '.join(reasons)}")
        logger.warning(f"[Coordinator] AgentCore Memory disabled - {', '.join(reasons)}")
    
    # Build trace attributes for observability
    trace_attributes = {
        "agent.type": "coordinator",
        "agent.name": "market-surveillance-coordinator",
        "environment": os.getenv("ENVIRONMENT", "dev"),
    }
    
    if user_id:
        trace_attributes["user.id"] = user_id
    if session_id:
        trace_attributes["session.id"] = session_id
    if MEMORY_ID:
        trace_attributes["memory.id"] = MEMORY_ID
    
    logger.info("[Coordinator] Building agent with tools: current_time, calculator, data_contract, data_enrichment, trade_analyst, report_assembly, ecomm_specialist")

    # Build tools list
    tools = [
        current_time,  # Get current date and time
        calculator,  # Mathematical calculations and date operations
        get_report_template,  # Investigation report format (loaded on demand, not in system prompt)
        data_contract_agent,  # Database schema and data contract
        data_enrichment_agent,  # Data retrieval and enrichment
        trade_analyst_agent,  # Trade rule evaluation
        report_assembly_agent,  # Output schema and report structure
        ecomm_specialist_agent,  # Electronic communications analysis
    ]
    
    # Add Code Interpreter tool if available
    code_interpreter_tool = create_code_interpreter_tool()
    if code_interpreter_tool:
        logger.info("[Coordinator] Adding Code Interpreter tool to agent")
        tools.append(code_interpreter_tool)
    else:
        logger.warning("[Coordinator] Code Interpreter tool not available")
    
    # Add gateway MCP tools if available
    gateway_mcp_client = create_gateway_mcp_client()
    if gateway_mcp_client:
        logger.info("[Coordinator] Adding gateway MCP tools to agent")
        tools.append(gateway_mcp_client)
    else:
        logger.warning("[Coordinator] Gateway tools not available")
    
    agent = Agent(
        model=bedrock_model,
        name="Market Surveillance Coordinator",
        description="Orchestrates specialized agents for Market Surveillance system",
        system_prompt=enhanced_prompt,
        tools=tools,
        callback_handler=CoordinatorCallbackHandler(agent_name="Coordinator"),
        trace_attributes=trace_attributes,
        session_manager=session_manager,  # Enable AgentCore Memory if configured
        hooks=[ReadTimeoutRetryHook(max_retries=2, backoff_seconds=10)],
    )
    
    logger.info("[Coordinator] Agent created successfully")
    return agent
