"""Athena query handler — SQL execution against the data lake."""

import os
import time
from typing import Annotated, Optional

from mcp.server.fastmcp import Context, FastMCP
from mcp.types import CallToolResult, TextContent
from pydantic import Field

from ..models.responses import QueryResult
from ..utils.aws_helper import AwsHelper
from ..utils.logging_helper import LogLevel, log_with_request_id

ATHENA_WORKGROUP = os.environ.get("ATHENA_WORKGROUP", "primary")
MAX_POLL_SECONDS = 60
POLL_INTERVAL = 1.5


class AthenaQueryHandler:
    """Handler for Amazon Athena SQL query operations.

    Provides a tool to execute SQL queries against Glue-cataloged tables via Athena.
    Queries run within the configured workgroup which controls result location and cost limits.
    """

    def __init__(self, mcp: FastMCP):
        self.mcp = mcp
        self.athena = AwsHelper.create_client("athena")

        self.mcp.tool(name="query")(self.query)

    async def query(
        self,
        ctx: Context,
        sql: Annotated[str, Field(description="SQL query to execute (SELECT statements only)")],
        max_rows: Annotated[Optional[int], Field(description="Maximum rows to return (1-1000, default 100)")] = 100,
    ) -> CallToolResult:
        """Execute a SQL query against the data lake via Amazon Athena.

        Runs the provided SQL query using the configured Athena workgroup.
        Only SELECT queries are allowed — write operations (INSERT, UPDATE, DELETE, DROP)
        are blocked.

        ## Requirements
        - Query must be a SELECT statement (no writes)
        - Tables must be in databases this server has access to
        - Results are limited by max_rows parameter

        ## Example
        ```
        response = await query(
            sql="SELECT symbol, SUM(quantity) as total_qty FROM fsi_trading.trades GROUP BY symbol LIMIT 10",
            max_rows=10,
        )
        # Returns: {"columns": ["symbol", "total_qty"], "rows": [...], "row_count": 10}
        ```

        Args:
            ctx: MCP context
            sql: SQL query string (SELECT only)
            max_rows: Maximum number of rows to return (default 100, max 1000)

        Returns:
            Query results with columns, rows, and execution metadata
        """
        log_with_request_id(ctx, LogLevel.INFO, f"query called: {sql[:100]}...")

        # Validate: block write operations
        sql_upper = sql.strip().upper()
        if any(sql_upper.startswith(kw) for kw in ("INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE")):
            return CallToolResult(
                isError=True,
                content=[TextContent(type="text", text="Write operations are not allowed. Only SELECT queries are permitted.")],
            )

        # Clamp max_rows
        max_rows = min(max(max_rows or 100, 1), 1000)

        try:
            # Start query execution
            start_resp = self.athena.start_query_execution(
                QueryString=sql,
                WorkGroup=ATHENA_WORKGROUP,
            )
            query_id = start_resp["QueryExecutionId"]
            log_with_request_id(ctx, LogLevel.INFO, f"Query started: {query_id}")

            # Poll for completion
            elapsed = 0.0
            while elapsed < MAX_POLL_SECONDS:
                status_resp = self.athena.get_query_execution(QueryExecutionId=query_id)
                state = status_resp["QueryExecution"]["Status"]["State"]

                if state == "SUCCEEDED":
                    break
                elif state in ("FAILED", "CANCELLED"):
                    reason = status_resp["QueryExecution"]["Status"].get("StateChangeReason", "Unknown error")
                    log_with_request_id(ctx, LogLevel.ERROR, f"Query {state}: {reason}")
                    return CallToolResult(
                        isError=True,
                        content=[TextContent(type="text", text=f"Query {state}: {reason}")],
                    )

                time.sleep(POLL_INTERVAL)
                elapsed += POLL_INTERVAL

            if elapsed >= MAX_POLL_SECONDS:
                return CallToolResult(
                    isError=True,
                    content=[TextContent(type="text", text=f"Query timed out after {MAX_POLL_SECONDS}s. Query ID: {query_id}")],
                )

            # Fetch results
            results_resp = self.athena.get_query_results(
                QueryExecutionId=query_id,
                MaxResults=max_rows + 1,  # +1 for header row
            )
            rows = results_resp["ResultSet"]["Rows"]

            if not rows:
                result = QueryResult(columns=[], rows=[], row_count=0, query_execution_id=query_id)
            else:
                columns = [col.get("VarCharValue", "") for col in rows[0]["Data"]]
                data = [
                    {columns[i]: cell.get("VarCharValue", "") for i, cell in enumerate(row["Data"])}
                    for row in rows[1:max_rows + 1]
                ]
                result = QueryResult(columns=columns, rows=data, row_count=len(data), query_execution_id=query_id)

            return CallToolResult(
                isError=False,
                content=[
                    TextContent(type="text", text=f"Query returned {result.row_count} row(s)"),
                    TextContent(type="text", text=result.model_dump_json()),
                ],
            )

        except Exception as e:
            error_message = f"Error executing query: {str(e)}"
            log_with_request_id(ctx, LogLevel.ERROR, error_message)
            return CallToolResult(isError=True, content=[TextContent(type="text", text=error_message)])
