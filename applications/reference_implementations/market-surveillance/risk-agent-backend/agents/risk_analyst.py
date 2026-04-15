"""
Risk Analyst Agent - Handles database queries for financial risk monitoring and analysis

Single agent that combines schema discovery and SQL query execution,
driven by a YAML schema config loaded from S3.
"""

import logging
import os
import re
import json
import boto3
import psycopg2
from psycopg2 import sql as psql
from typing import Dict, Any, Optional, List
from strands import Agent, tool
from agents.callback_handler import RiskAnalystCallbackHandler, emit_image_event
from bedrock_agentcore.tools.code_interpreter_client import code_session
from config import create_bedrock_model, load_schema_config, CONFIG_BUCKET, SCHEMA_CONFIG_KEY, AWS_REGION, MEMORY_ID
from strands_tools.calculator import calculator
from strands_tools.current_time import current_time
from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig

logger = logging.getLogger(__name__)

# Database connection config
DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME")
DB_USERNAME = os.getenv("DB_USERNAME")
DB_SECRET_ARN = os.getenv("DB_SECRET_ARN")

_db_password_cache = None
_DATABASE_SCHEMA: Optional[Dict[str, Dict]] = None

# Code Interpreter ID from environment (custom VPC interpreter)
CODE_INTERPRETER_ID = os.getenv("CODE_INTERPRETER_ID")


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db_password() -> str:
    """Retrieve database password from Secrets Manager."""
    global _db_password_cache
    if _db_password_cache is not None:
        return _db_password_cache

    if not DB_SECRET_ARN:
        raise ValueError("DB_SECRET_ARN environment variable not set")

    secrets_client = boto3.client('secretsmanager')
    response = secrets_client.get_secret_value(SecretId=DB_SECRET_ARN)
    secret_data = json.loads(response['SecretString'])
    password = secret_data.get('PASSWORD')
    if not password:
        raise ValueError("PASSWORD not found in secret")
    _db_password_cache = password
    return password


def get_db_connection():
    """Create a read-only PostgreSQL database connection."""
    if not all([DB_HOST, DB_NAME, DB_USERNAME, DB_SECRET_ARN]):
        raise ValueError("Database connection parameters not configured. Required: DB_HOST, DB_NAME, DB_USERNAME, DB_SECRET_ARN")
    password = get_db_password()
    connection = psycopg2.connect(
        host=DB_HOST, port=DB_PORT, database=DB_NAME,
        user=DB_USERNAME, password=password, connect_timeout=10,
        options="-c default_transaction_read_only=on"
    )
    logger.info(f"Connected to database: {DB_HOST}:{DB_PORT}/{DB_NAME}")
    return connection


def format_query_results(columns: List[str], rows: List[tuple], max_rows: int = 100) -> str:
    """Format query results as a readable table."""
    if not rows:
        return "Query returned no results."
    limited_rows = rows[:max_rows]
    has_more = len(rows) > max_rows

    col_widths = [len(col) for col in columns]
    for row in limited_rows:
        for i, val in enumerate(row):
            col_widths[i] = max(col_widths[i], len(str(val) if val is not None else "NULL"))

    result = []
    result.append(" | ".join(col.ljust(col_widths[i]) for i, col in enumerate(columns)))
    result.append("-+-".join("-" * w for w in col_widths))
    for row in limited_rows:
        result.append(" | ".join(
            (str(val) if val is not None else "NULL").ljust(col_widths[i])
            for i, val in enumerate(row)
        ))
    result.append("")
    result.append(f"Returned {len(limited_rows)} row(s)")
    if has_more:
        result.append(f"(Limited to first {max_rows} rows, {len(rows)} total)")
    return "\n".join(result)


# ---------------------------------------------------------------------------
# Schema helpers (config-driven)
# ---------------------------------------------------------------------------

def get_database_schema() -> Dict[str, Dict]:
    """Get parsed database schema, loading from S3 on first call."""
    global _DATABASE_SCHEMA
    if _DATABASE_SCHEMA is not None:
        return _DATABASE_SCHEMA

    try:
        print(f"[Risk Analyst] Loading schema from S3: {CONFIG_BUCKET}/{SCHEMA_CONFIG_KEY}")
        raw = load_schema_config()
        if raw:
            _DATABASE_SCHEMA = _parse_schema(raw)
            print(f"[Risk Analyst] Parsed {len(_DATABASE_SCHEMA)} tables")
        else:
            print("[Risk Analyst] Schema config empty, using empty schema")
            _DATABASE_SCHEMA = {}
    except Exception as e:
        print(f"[Risk Analyst] Failed to load schema: {e}")
        _DATABASE_SCHEMA = {}
    return _DATABASE_SCHEMA


def _parse_schema(schema_data: Dict[str, Any]) -> Dict[str, Dict]:
    """Parse YAML schema config into lookup dict."""
    parsed = {}
    for table in schema_data.get("tables", []):
        table_name = table["name"].lower()
        parsed[table_name] = {
            "description": table.get("description", ""),
            "type": table.get("type", ""),
            "columns": {}
        }
        for col in table.get("schema", []):
            col_name = col["column"]
            parsed[table_name]["columns"][col_name] = {
                "type": col.get("data_type", ""),
                "description": col.get("description", ""),
                "primary_key": col.get("primary_key", False),
                "nullable": col.get("nullable", True),
            }
            if "foreign_keys" in col:
                fks = []
                for fk in col["foreign_keys"]:
                    parts = fk["references"].split(".")
                    if len(parts) == 2:
                        fks.append({"table": parts[0].lower(), "column": parts[1]})
                parsed[table_name]["columns"][col_name]["foreign_keys"] = fks
    return parsed


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@tool
def get_table_list() -> str:
    """List all available database tables with descriptions.

    Returns:
        Formatted list of tables and their descriptions.
    """
    schema = get_database_schema()
    if not schema:
        return "No schema information available."
    lines = []
    for name, info in sorted(schema.items()):
        lines.append(f"- {name}: {info['description']}")
    return "Available tables:\n" + "\n".join(lines)


@tool
def get_table_schema(table_name: str) -> str:
    """Get the column definitions for a specific table.

    Args:
        table_name: Name of the table to describe.

    Returns:
        Column names, types, and descriptions for the table.
    """
    schema = get_database_schema()
    table = schema.get(table_name.lower())
    if not table:
        return f"Table '{table_name}' not found. Use get_table_list to see available tables."
    lines = [f"Table: {table_name}", f"Description: {table['description']}", "", "Columns:"]
    for col_name, col_info in table["columns"].items():
        pk = " [PK]" if col_info.get("primary_key") else ""
        lines.append(f"  - {col_name} ({col_info['type']}{pk}): {col_info['description']}")
        if col_info.get("foreign_keys"):
            for fk in col_info["foreign_keys"]:
                lines.append(f"    FK -> {fk['table']}.{fk['column']}")
    return "\n".join(lines)


@tool
def execute_select_query(sql_query: str, max_rows: int = 100) -> str:
    """Execute a read-only SELECT query against the database.

    Only SELECT queries are allowed. Any attempt to modify data will be rejected.
    The database connection enforces read-only mode at the transaction level.

    Args:
        sql_query: The SQL SELECT query to execute.
        max_rows: Maximum rows to return (default 100, max 1000).

    Returns:
        Formatted query results.
    """
    query_upper = sql_query.strip().upper()
    if not query_upper.startswith("SELECT"):
        return "ERROR: Only SELECT queries are allowed."

    max_rows = min(max_rows, 1000)

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql_query)
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()
                logger.info(f"Query returned {len(rows)} rows")
                return f"```sql\n{sql_query}\n```\n\n{format_query_results(columns, rows, max_rows)}"
    except psycopg2.Error as e:
        logger.error(f"Database error: {e}")
        return f"Database Error: {e}"
    except Exception as e:
        logger.error(f"Query error: {e}", exc_info=True)
        return f"Error: {e}"


@tool
def get_row_count(table_name: str) -> str:
    """Get the total row count for a table.

    For filtered counts, use execute_select_query with a SELECT COUNT(*) ... WHERE query instead.

    Args:
        table_name: Table name.

    Returns:
        Row count.
    """
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table_name):
        return "ERROR: Invalid table name."

    query = psql.SQL("SELECT COUNT(*) FROM {}").format(psql.Identifier(table_name))

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                count = cur.fetchone()[0]
                return f"Table '{table_name}' has {count:,} rows total"
    except Exception as e:
        logger.error(f"Row count error: {e}")
        return f"Error: {e}"


# ---------------------------------------------------------------------------
# Code Interpreter
# ---------------------------------------------------------------------------

# Prepended to every code execution to:
#   1. Force non-interactive Agg backend (no display needed)
#   2. Patch plt.show() to capture figures as base64 markers
# The try/except is split so backend-already-set errors don't skip the patch.
_PLOT_SETUP = """\
try:
    import matplotlib as _mpl
    try:
        _mpl.use('Agg')
    except Exception:
        pass
    import matplotlib.pyplot as _plt
    import io as _io, base64 as _b64

    def _capture_figures():
        for _fn in _plt.get_fignums():
            _f = _plt.figure(_fn)
            _buf = _io.BytesIO()
            _f.savefig(_buf, format='png', dpi=200, bbox_inches='tight')
            _buf.seek(0)
            print('__CHART__' + _b64.b64encode(_buf.read()).decode() + '__END_CHART__')
        _plt.close('all')

    _plt.show = lambda *a, **k: _capture_figures()
except ImportError:
    pass

# --- Plotly kaleido install (silent, idempotent) ---
try:
    import subprocess as _sp, sys as _sys
    _sp.check_call(
        [_sys.executable, '-m', 'pip', 'install', '-q', 'kaleido<1'],
        stdout=_sp.DEVNULL, stderr=_sp.DEVNULL
    )
except Exception:
    pass

# --- Plotly figure capture (mirrors matplotlib pattern) ---
try:
    import plotly.io as _pio
    import plotly.graph_objects as _go
    import base64 as _b64_plotly

    _original_pio_show = _pio.show

    def _plotly_capture(fig, *args, **kwargs):
        try:
            _img_bytes = fig.to_image(format='png', scale=3, engine='kaleido')
            print('__CHART__' + _b64_plotly.b64encode(_img_bytes).decode() + '__END_CHART__')
        except Exception as _e:
            print(f'[Plotly capture error: {_e}]')
            _original_pio_show(fig, *args, **kwargs)

    _pio.show = _plotly_capture
    _go.Figure.show = lambda self, *a, **k: _plotly_capture(self, *a, **k)
    _pio.renderers.default = 'png'
except Exception:
    pass
"""

# Appended AFTER the user's code to capture any figures left open
# (e.g. if the agent used savefig + close selectively, or forgot plt.show()).
_PLOT_CLEANUP = """
try:
    import matplotlib.pyplot as _plt_c
    import io as _io_c, base64 as _b64_c
    for _fn_c in _plt_c.get_fignums():
        _f_c = _plt_c.figure(_fn_c)
        _buf_c = _io_c.BytesIO()
        _f_c.savefig(_buf_c, format='png', dpi=200, bbox_inches='tight')
        _buf_c.seek(0)
        print('__CHART__' + _b64_c.b64encode(_buf_c.read()).decode() + '__END_CHART__')
    _plt_c.close('all')
except Exception:
    pass
"""

_CHART_MARKER_PATTERN = re.compile(r"__CHART__(.+?)__END_CHART__", re.DOTALL)

# Patterns to extract chart titles from matplotlib/Plotly code
_CHART_TITLE_PATTERNS = [
    re.compile(r"""plt\.title\(\s*(?:f?['"])(.*?)(?:['"]\s*[,)])"""),          # plt.title('...')
    re.compile(r"""\.update_layout\([^)]*title\s*=\s*(?:f?['"])(.*?)['"]"""),  # fig.update_layout(title='...')
    re.compile(r"""\.update_layout\([^)]*title\s*=\s*dict\(\s*text\s*=\s*(?:f?['"])(.*?)['"]"""),  # title=dict(text='...')
    re.compile(r"""go\.Figure\([^)]*\)\.update_layout\([^)]*title\s*=\s*(?:f?['"])(.*?)['"]"""),
]


def _extract_chart_title(code: str) -> Optional[str]:
    """Try to extract a chart title from matplotlib/Plotly code."""
    for pattern in _CHART_TITLE_PATTERNS:
        match = pattern.search(code)
        if match:
            title = match.group(1).strip()
            if title:
                return title
    return None


def _extract_charts(output: str) -> tuple[str, list[str]]:
    """Extract base64 chart images from code output.

    Returns:
        Tuple of (cleaned_output, list_of_base64_strings).
    """
    charts: list[str] = []
    for match in _CHART_MARKER_PATTERN.finditer(output):
        charts.append(match.group(1).strip())
    cleaned = _CHART_MARKER_PATTERN.sub("", output).strip()
    return cleaned, charts


def create_risk_code_interpreter_tool():
    """Create AgentCore Code Interpreter tool for the Risk Analyst Agent.

    Provides Python code execution for complex calculations, statistical
    analysis, data transformations, and chart generation on risk data.

    Returns:
        Strands tool function for code execution if available, None otherwise.
    """
    try:
        logger.info("[Risk Analyst] Creating Code Interpreter tool")

        # Persistent session — reused across all execute_python calls so that
        # variables defined in one call are available in subsequent calls.
        _session_state = {"client": None, "context_manager": None}

        def _get_client():
            if _session_state["client"] is None:
                _session_state["context_manager"] = code_session(AWS_REGION, identifier=CODE_INTERPRETER_ID)
                _session_state["client"] = _session_state["context_manager"].__enter__()
                logger.info("[Risk Analyst CodeInterpreter] Created persistent code session")
            return _session_state["client"]

        @tool
        def execute_python(code: str, description: str = "") -> str:
            """Execute Python code in a secure AgentCore Code Interpreter sandbox.

            Use this tool for:
            - Complex mathematical calculations (aggregations, percentages, ratios)
            - Statistical analysis on query results
            - Date/time arithmetic and comparisons
            - Data transformations that go beyond simple SQL
            - Creating charts and plots with matplotlib

            When creating charts, just write normal matplotlib code and call
            plt.show() at the end. The chart will be automatically captured
            and displayed to the user.

            Args:
                code: Python code to execute.
                description: Optional description of what the code does.

            Returns:
                String containing the executed code and its output.
            """
            if description:
                code = f"# {description}\n{code}"

            # Prepend plot setup (patches plt.show) and append cleanup
            # (catches any remaining open figures the code didn't plt.show)
            full_code = _PLOT_SETUP + code + "\n" + _PLOT_CLEANUP

            logger.info(f"[Risk Analyst CodeInterpreter] Executing Python code ({len(code)} chars)")

            try:
                code_client = _get_client()
                response = code_client.invoke("executeCode", {
                    "code": full_code,
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
                        logger.error(f"[Risk Analyst CodeInterpreter] Execution error: {error_msg}")
                        return f"Error executing code: {error_msg}"

                    content = final_result.get("content", [])
                    if content and len(content) > 0:
                        # Collect text output from all content items
                        raw_output = ""
                        blob_charts: list[str] = []
                        for item in content:
                            if isinstance(item, dict):
                                # Text output (stdout/print)
                                if "text" in item:
                                    raw_output += item["text"]
                                # Resource with text or blob (file outputs)
                                resource = item.get("resource", {})
                                if isinstance(resource, dict):
                                    if "text" in resource:
                                        raw_output += resource["text"]
                                    if "blob" in resource:
                                        blob_charts.append(resource["blob"])
                                        logger.info("[Risk Analyst CodeInterpreter] Found blob resource in response")

                        if not raw_output:
                            raw_output = "No output"

                        logger.info(f"[Risk Analyst CodeInterpreter] Raw output length: {len(raw_output)}, contains __CHART__: {'__CHART__' in raw_output}, blob resources: {len(blob_charts)}")

                        # Extract chart images from text markers
                        text_output, marker_charts = _extract_charts(raw_output)

                        # Combine: marker-based charts + blob-based charts
                        all_charts = marker_charts + blob_charts

                        chart_title = _extract_chart_title(code)
                        for i, chart_b64 in enumerate(all_charts):
                            alt = description or chart_title or f"Chart {i + 1}"
                            emit_image_event(chart_b64, alt)
                            logger.info(f"[Risk Analyst CodeInterpreter] Emitted chart image ({len(chart_b64)} chars base64)")

                        chart_note = f"\n\n[{len(all_charts)} chart(s) generated and displayed to the user]" if all_charts else ""
                        display_output = text_output if text_output else "Code executed successfully."

                        logger.info(f"[Risk Analyst CodeInterpreter] Execution successful ({len(text_output)} chars text, {len(all_charts)} charts)")
                        return f"```python\n{code}\n```\n\nOutput:\n```\n{display_output}\n```{chart_note}"
                    else:
                        return f"```python\n{code}\n```\n\nCode executed successfully but produced no output."
                else:
                    return "No results from code execution"

            except Exception as e:
                # Reset so next call creates a fresh session
                _session_state["client"] = None
                _session_state["context_manager"] = None
                logger.error(f"[Risk Analyst CodeInterpreter] Failed to execute code: {e}", exc_info=True)
                return f"Failed to execute code: {str(e)}"

        logger.info("[Risk Analyst] Code Interpreter tool created successfully")
        return execute_python

    except Exception as e:
        logger.error(f"[Risk Analyst] Failed to create Code Interpreter tool: {e}", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

RISK_ANALYST_SYSTEM_PROMPT = """You are a Risk Analyst agent for financial risk monitoring and analysis.

CAPABILITIES:
- Discover database schema (tables, columns, relationships) via config
- Execute read-only SQL queries against a PostgreSQL database
- Provide data analysis and insights for risk investigations

TOOLS AVAILABLE:
1. get_table_list - List all available tables
2. get_table_schema - Get column details for a specific table
3. execute_select_query - Run SELECT queries (read-only)
4. get_row_count - Count total rows in a table (use execute_select_query for filtered counts)
5. calculator - Simple, single-step arithmetic (e.g. "what is 5 * 12?")
6. execute_python - Run Python code on a Code Interpreter sandbox for complex math,
   multi-step calculations, statistical analysis, data transformations, AND chart generation
   (supports both matplotlib and Plotly for charts)

WORKFLOW:
1. When asked about data, first check the schema to understand available tables and columns
2. Construct accurate SQL using exact table and column names from the schema
3. Execute queries and present results clearly
4. Explain your findings and suggest follow-up analysis when relevant

RESPONSE FORMAT - CRITICAL:
When the user asks to retrieve, show, or display data (e.g. "show me the first 10 rows",
"retrieve data from table X", "show me table data"):
1. Always include the exact SQL query you executed, formatted in a SQL code block.
2. Always present the query results as a FULL TABLE with all columns and all returned rows.
   Do NOT summarize, abbreviate, paraphrase, or omit any rows or columns from the results.
   Show the complete table output exactly as returned by the tool.
3. After the table, you may add a brief note about row count or suggest follow-up queries,
   but NEVER replace the table with a summary.

Example response structure:
```
Here are the results:

<SQL code block from tool>

<Full table output from tool>

[Optional brief note]
```

CALCULATIONS — WHEN TO USE WHICH TOOL:
- calculator: Use ONLY for simple, single-step arithmetic (e.g. "what is 42 * 17?").
- execute_python: Use for EVERYTHING else — multi-step math, percentages, aggregations,
  averages, statistical analysis, date arithmetic, data transformations, and any calculation
  involving data from query results. Always run these on the Code Interpreter sandbox via
  execute_python. Always include the Python code and output in your response.

DATA-DRIVEN CALCULATIONS — CRITICAL:
- Always query the database first: Never perform calculations on assumed, estimated, or
  hard-coded values. Every number used in a calculation must come from an actual query result
  or be explicitly provided by the user.
- Show your data source: Before computing, reference the query or user-supplied values that
  feed into the calculation so the user can verify the inputs.

PLOTTING AND CHARTS — CRITICAL:
When the user asks to plot, chart, graph, visualize, or diagram data, you MUST generate
a chart image using execute_python with matplotlib or Plotly. This is non-negotiable — never describe
a chart in words when you can generate one.

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
- Verify calculations before charting: Before generating any chart, double-check that the
  data feeding into the plot is correct — re-examine query results and any intermediate
  calculations. Print the final data values in the execute_python output before calling
  plt.show() so the user can confirm accuracy.

PLOTLY-SPECIFIC RULES:
- Always call fig.show() at the end of Plotly code. The chart is captured only when .show() is called.
- Do NOT use fig.write_image() or fig.to_image() directly — fig.show() handles PNG capture automatically.
- Do NOT attempt to install kaleido — it is already available in the sandbox.

Supported chart types — choose the best fit for the data:
- Bar chart (plt.bar / plt.barh): comparing categories or counts
- Line chart (plt.plot): trends over time or sequential data
- Pie chart (plt.pie): proportions of a whole
- Scatter plot (plt.scatter): correlation between two variables
- Histogram (plt.hist): distribution of values
- Stacked bar (plt.bar with bottom): breakdown of categories by sub-groups
- Grouped bar: side-by-side comparison across groups
- Heatmap (plt.imshow / plt.pcolormesh): matrix data, correlations
- Box plot (plt.boxplot): distribution spread and outliers
- Area chart (plt.fill_between / plt.stackplot): cumulative trends
- Treemap (px.treemap / go.Treemap): hierarchical data proportions [Plotly]
- Sunburst (px.sunburst / go.Sunburst): hierarchical data in concentric rings [Plotly]
- Sankey diagram (go.Sankey): flow/relationship visualization [Plotly]
- Waterfall chart (go.Waterfall): sequential positive/negative contributions [Plotly]
- Funnel chart (go.Funnel / px.funnel): stage-based conversion data [Plotly]

How to generate charts:
1. Use the execute_python tool with matplotlib.
2. Write standard matplotlib code. Call plt.show() at the end — the chart is automatically
   captured and displayed to the user.
3. Always include a title, axis labels, and a legend where appropriate.
4. Use clear colors and formatting for readability.
5. If matplotlib is not installed, install it first:
   import subprocess; subprocess.check_call(['pip', 'install', 'matplotlib'])

Example pattern for plotting:
```python
import matplotlib.pyplot as plt

# ... prepare data ...

# Verify data before plotting
print("Chart data:", dict(zip(categories, values)))

# IMPORTANT: Do NOT use plt.subplots(nrows, ncols) or multiple plt.figure() calls.
# One figure, one plot, one plt.show().
plt.figure(figsize=(14, 8))
plt.bar(categories, values, color='steelblue')  # ONE plot call per figure
plt.title('Chart Title')
plt.xlabel('X Label')
plt.ylabel('Y Label')
plt.tight_layout()
plt.show()
```

Example pattern for Plotly plotting:
```python
import plotly.graph_objects as go

# ... prepare data ...
print("Chart data:", dict(zip(categories, values)))

fig = go.Figure(data=[go.Bar(x=categories, y=values, marker_color='steelblue')])
fig.update_layout(title='Chart Title', xaxis_title='X Label', yaxis_title='Y Label', width=800, height=500)
fig.show()  # REQUIRED — captures and displays the chart
```

RULES:
- Only execute SELECT queries. Never modify data.
- Always show the SQL query you executed for auditability.
- Always show the Python code you executed for auditability.
- Use schema tools to verify table/column names before querying.
- Limit results to reasonable sizes (default 100 rows).
- Report errors clearly and suggest corrections.
- NEVER summarize tabular data. Always show the full table as returned by the query tool.
"""


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------

def create_risk_analyst_agent(user_id: str = None, session_id: str = None) -> Agent:
    """Create the Risk Analyst agent with database query tools."""
    logger.info("[Risk Analyst] Creating agent")

    tools = [
        current_time,
        calculator,
        get_table_list,
        get_table_schema,
        execute_select_query,
        get_row_count,
    ]

    # Add Code Interpreter tool if available
    code_interpreter_tool = create_risk_code_interpreter_tool()
    if code_interpreter_tool:
        logger.info("[Risk Analyst] Adding Code Interpreter tool")
        tools.append(code_interpreter_tool)
    else:
        logger.warning("[Risk Analyst] Code Interpreter tool not available")

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
        logger.info(f"[Risk Analyst] AgentCore Memory configured: {MEMORY_ID}")
    else:
        reasons = []
        if not MEMORY_ID:
            reasons.append("MEMORY_ID not set")
        if not session_id:
            reasons.append("session_id not provided")
        if not user_id:
            reasons.append("user_id not provided")
        print(f"AgentCore Memory disabled: {', '.join(reasons)}")
        logger.warning(f"[Risk Analyst] AgentCore Memory disabled - {', '.join(reasons)}")

    return Agent(
        model=create_bedrock_model(),
        name="Risk Analyst Agent",
        description="Financial risk database analyst with schema discovery and SQL query capabilities",
        system_prompt=RISK_ANALYST_SYSTEM_PROMPT,
        tools=tools,
        callback_handler=RiskAnalystCallbackHandler(agent_name="Risk Analyst"),
        session_manager=session_manager,
        trace_attributes={
            "agent.type": "risk-analyst",
            "agent.name": "risk-analyst",
            "user.id": user_id,
            "session.id": session_id,
        },
    )
