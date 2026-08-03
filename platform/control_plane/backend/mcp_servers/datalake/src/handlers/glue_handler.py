"""Glue Data Catalog handler — database and table discovery tools."""

import os
from typing import Annotated, Optional

from mcp.server.fastmcp import Context, FastMCP
from mcp.types import CallToolResult, TextContent
from pydantic import Field

from ..models.responses import ListDatabasesResult, ListTablesResult, DescribeTableResult
from ..utils.aws_helper import AwsHelper
from ..utils.logging_helper import LogLevel, log_with_request_id

# Scoped databases from environment (comma-separated)
ALLOWED_DATABASES = [db.strip() for db in os.environ.get("GLUE_DATABASES", "").split(",") if db.strip()]


class GlueCatalogHandler:
    """Handler for AWS Glue Data Catalog discovery operations.

    Provides tools to list databases, list tables, and describe table schemas.
    Access is scoped to databases specified in the GLUE_DATABASES environment variable.
    """

    def __init__(self, mcp: FastMCP):
        self.mcp = mcp
        self.glue = AwsHelper.create_client("glue")

        self.mcp.tool(name="list_databases")(self.list_databases)
        self.mcp.tool(name="list_tables")(self.list_tables)
        self.mcp.tool(name="describe_table")(self.describe_table)

    async def list_databases(self, ctx: Context) -> CallToolResult:
        """List available Glue databases.

        Returns databases that this MCP server has access to. Results are scoped
        to the databases configured at deployment time.

        ## Example
        ```
        response = await list_databases()
        # Returns: {"databases": [{"name": "fsi_trading", "description": "..."}], "count": 2}
        ```

        Returns:
            List of databases with name and description
        """
        log_with_request_id(ctx, LogLevel.INFO, "list_databases called")

        try:
            resp = self.glue.get_databases()
            databases = resp.get("DatabaseList", [])

            if ALLOWED_DATABASES:
                databases = [db for db in databases if db["Name"] in ALLOWED_DATABASES]

            result = ListDatabasesResult(
                databases=[{"name": db["Name"], "description": db.get("Description", "")} for db in databases],
                count=len(databases),
            )
            return CallToolResult(
                isError=False,
                content=[
                    TextContent(type="text", text=f"Found {result.count} database(s)"),
                    TextContent(type="text", text=result.model_dump_json()),
                ],
            )
        except Exception as e:
            error_message = f"Error listing databases: {str(e)}"
            log_with_request_id(ctx, LogLevel.ERROR, error_message)
            return CallToolResult(isError=True, content=[TextContent(type="text", text=error_message)])

    async def list_tables(
        self,
        ctx: Context,
        database: Annotated[str, Field(description="Glue database name")],
    ) -> CallToolResult:
        """List tables in a Glue database.

        Returns all tables in the specified database with their type information.

        ## Requirements
        - Database must be in the allowed databases list

        ## Example
        ```
        response = await list_tables(database="fsi_trading")
        # Returns: {"database": "fsi_trading", "tables": [{"name": "trades", "type": "EXTERNAL_TABLE"}], "count": 3}
        ```

        Args:
            ctx: MCP context
            database: Name of the Glue database

        Returns:
            List of tables with name and type
        """
        log_with_request_id(ctx, LogLevel.INFO, f"list_tables called for database={database}")

        if ALLOWED_DATABASES and database not in ALLOWED_DATABASES:
            return CallToolResult(
                isError=True,
                content=[TextContent(type="text", text=f"Access denied: database '{database}' is not in the allowed list")],
            )

        try:
            resp = self.glue.get_tables(DatabaseName=database)
            tables = resp.get("TableList", [])

            result = ListTablesResult(
                database=database,
                tables=[{"name": t["Name"], "type": t.get("TableType", "")} for t in tables],
                count=len(tables),
            )
            return CallToolResult(
                isError=False,
                content=[
                    TextContent(type="text", text=f"Found {result.count} table(s) in {database}"),
                    TextContent(type="text", text=result.model_dump_json()),
                ],
            )
        except self.glue.exceptions.EntityNotFoundException:
            return CallToolResult(
                isError=True,
                content=[TextContent(type="text", text=f"Database not found: {database}")],
            )
        except Exception as e:
            error_message = f"Error listing tables in {database}: {str(e)}"
            log_with_request_id(ctx, LogLevel.ERROR, error_message)
            return CallToolResult(isError=True, content=[TextContent(type="text", text=error_message)])

    async def describe_table(
        self,
        ctx: Context,
        database: Annotated[str, Field(description="Glue database name")],
        table: Annotated[str, Field(description="Table name")],
    ) -> CallToolResult:
        """Get detailed schema and metadata for a table.

        Returns column definitions, storage location, and table parameters
        including Iceberg metadata if applicable.

        ## Requirements
        - Database must be in the allowed databases list

        ## Example
        ```
        response = await describe_table(database="fsi_trading", table="trades")
        # Returns: {"database": "fsi_trading", "table": "trades", "columns": [...], "location": "s3://..."}
        ```

        Args:
            ctx: MCP context
            database: Name of the Glue database
            table: Name of the table

        Returns:
            Table schema with columns, location, and parameters
        """
        log_with_request_id(ctx, LogLevel.INFO, f"describe_table called for {database}.{table}")

        if ALLOWED_DATABASES and database not in ALLOWED_DATABASES:
            return CallToolResult(
                isError=True,
                content=[TextContent(type="text", text=f"Access denied: database '{database}' is not in the allowed list")],
            )

        try:
            resp = self.glue.get_table(DatabaseName=database, Name=table)
            t = resp["Table"]
            sd = t.get("StorageDescriptor", {})

            result = DescribeTableResult(
                database=database,
                table=t["Name"],
                columns=[{"name": c["Name"], "type": c["Type"]} for c in sd.get("Columns", [])],
                location=sd.get("Location", ""),
                parameters=t.get("Parameters", {}),
            )
            return CallToolResult(
                isError=False,
                content=[
                    TextContent(type="text", text=f"Schema for {database}.{table} ({len(result.columns)} columns)"),
                    TextContent(type="text", text=result.model_dump_json()),
                ],
            )
        except self.glue.exceptions.EntityNotFoundException:
            return CallToolResult(
                isError=True,
                content=[TextContent(type="text", text=f"Table not found: {database}.{table}")],
            )
        except Exception as e:
            error_message = f"Error describing {database}.{table}: {str(e)}"
            log_with_request_id(ctx, LogLevel.ERROR, error_message)
            return CallToolResult(isError=True, content=[TextContent(type="text", text=error_message)])
