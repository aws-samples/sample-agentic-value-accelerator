"""Pydantic response models for tool outputs."""

from pydantic import BaseModel, Field
from typing import Any, Optional


class ListDatabasesResult(BaseModel):
    """Response for list_databases operation."""
    databases: list[dict[str, str]] = Field(..., description="List of databases with name and description")
    count: int = Field(..., description="Number of databases returned")
    operation: str = Field(default="list_databases")


class ListTablesResult(BaseModel):
    """Response for list_tables operation."""
    database: str = Field(..., description="Database name")
    tables: list[dict[str, str]] = Field(..., description="List of tables with name and type")
    count: int = Field(..., description="Number of tables returned")
    operation: str = Field(default="list_tables")


class DescribeTableResult(BaseModel):
    """Response for describe_table operation."""
    database: str = Field(..., description="Database name")
    table: str = Field(..., description="Table name")
    columns: list[dict[str, str]] = Field(..., description="Column definitions with name and type")
    location: str = Field(default="", description="S3 storage location")
    parameters: dict[str, Any] = Field(default_factory=dict, description="Table parameters")
    operation: str = Field(default="describe_table")


class QueryResult(BaseModel):
    """Response for query operation."""
    columns: list[str] = Field(..., description="Column names")
    rows: list[dict[str, str]] = Field(..., description="Result rows as key-value pairs")
    row_count: int = Field(..., description="Number of rows returned")
    query_execution_id: str = Field(..., description="Athena query execution ID")
    operation: str = Field(default="query")
