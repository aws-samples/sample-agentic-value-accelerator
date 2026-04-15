"""
Data Enrichment Agent - Executes SQL queries against PostgreSQL database to enrich data
"""

import logging
import os
import json
import re
import boto3
from typing import Dict, Any, List
import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor
from strands import Agent, tool
from agents.callback_handlers import SpecialistCallbackHandler
from agents.timeout_retry_hook import ReadTimeoutRetryHook
from config import create_sub_agent_model

logger = logging.getLogger(__name__)

# Database connection configuration from environment
DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME")
DB_USERNAME = os.getenv("DB_USERNAME")
DB_SECRET_ARN = os.getenv("DB_SECRET_ARN")

# Cache for database password
_db_password_cache = None


def get_db_password() -> str:
    """Retrieve database password from Secrets Manager."""
    global _db_password_cache
    
    if _db_password_cache is not None:
        return _db_password_cache
    
    if not DB_SECRET_ARN:
        raise ValueError("DB_SECRET_ARN environment variable not set")
    
    try:
        # Get secret from Secrets Manager
        secrets_client = boto3.client('secretsmanager')
        response = secrets_client.get_secret_value(SecretId=DB_SECRET_ARN)
        
        # Parse secret JSON - RDS secrets use uppercase keys
        secret_data = json.loads(response['SecretString'])
        password = secret_data.get('PASSWORD')
        
        if not password:
            raise ValueError("PASSWORD not found in secret")
        
        # Cache the password
        _db_password_cache = password
        logger.info("Successfully retrieved database password from Secrets Manager")
        
        return password
    except Exception as e:
        logger.error(f"Failed to retrieve database password from Secrets Manager: {e}")
        raise


def get_db_connection():
    """Create and return a PostgreSQL database connection."""
    if not all([DB_HOST, DB_NAME, DB_USERNAME, DB_SECRET_ARN]):
        raise ValueError("Database connection parameters not configured. Required: DB_HOST, DB_NAME, DB_USERNAME, DB_SECRET_ARN")
    
    try:
        # Get password from Secrets Manager
        password = get_db_password()
        
        # Connect to PostgreSQL database
        connection = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USERNAME,
            password=password,
            connect_timeout=10
        )
        
        logger.info(f"Connected to PostgreSQL database: {DB_HOST}:{DB_PORT}/{DB_NAME}")
        return connection
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise


def format_query_results(columns: List[str], rows: List[tuple], max_rows: int = 50) -> str:
    """Format query results as a readable table."""
    if not rows:
        return "Query returned no results."
    
    # Limit rows
    limited_rows = rows[:max_rows]
    has_more = len(rows) > max_rows
    
    # Calculate column widths
    col_widths = [len(col) for col in columns]
    for row in limited_rows:
        for i, val in enumerate(row):
            val_str = str(val) if val is not None else "NULL"
            col_widths[i] = max(col_widths[i], len(val_str))
    
    # Build table
    result = []
    
    # Header
    header = " | ".join(col.ljust(col_widths[i]) for i, col in enumerate(columns))
    separator = "-+-".join("-" * width for width in col_widths)
    result.append(header)
    result.append(separator)
    
    # Rows
    for row in limited_rows:
        row_str = " | ".join(
            str(val).ljust(col_widths[i]) if val is not None else "NULL".ljust(col_widths[i])
            for i, val in enumerate(row)
        )
        result.append(row_str)
    
    # Footer
    result.append("")
    result.append(f"Returned {len(limited_rows)} row(s)")
    if has_more:
        result.append(f"(Limited to first {max_rows} rows, {len(rows)} total)")
    
    return "\n".join(result)


DATA_ENRICHMENT_SYSTEM_PROMPT = """You are a Data Enrichment Specialist for the Market Surveillance database.

EXPERTISE AND RESPONSIBILITIES:

Your core competencies:
- Writing and executing SQL queries against PostgreSQL database
- Data retrieval and enrichment with accurate table and column references
- Query optimization and performance tuning
- Complex joins and aggregations
- Data filtering and transformation

DATABASE SCHEMA KNOWLEDGE:

The Coordinator will provide you with schema information when needed. Use this schema information to construct accurate SQL queries. The schema includes:
- Table names and their purposes
- Column names, data types, and descriptions
- Primary key and foreign key relationships
- Table relationships and join conditions

When schema information is provided in your query context, use it to construct accurate SQL. Never guess table or column names.

CRITICAL SAFETY RULES:

1. READ-ONLY ACCESS: You can ONLY execute SELECT queries
2. NO MODIFICATIONS: NEVER execute INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, or any DDL/DML
3. QUERY VALIDATION: Always validate queries before execution
4. ROW LIMITS: Limit results to reasonable sizes (default 100 rows, max 1000)
5. ERROR HANDLING: Report errors clearly and suggest fixes

SQL QUERY CONSTRUCTION GUIDELINES:

1. Table and Column References:
   - Use exact table names from provided schema (case-sensitive for PostgreSQL)
   - Use exact column names from provided schema
   - Reference foreign keys for joins
   - If schema not provided, ask Coordinator for schema information

2. Query Best Practices:
   - Use explicit column names instead of SELECT *
   - Add WHERE clauses to filter data appropriately
   - Use LIMIT for limiting results (PostgreSQL syntax)
   - Include ORDER BY for consistent results
   - Use table aliases for readability
   - Avoid expensive operations on large tables without filters

3. Complex Queries and JOINs:
   - Use foreign key relationships for accurate joins
   - Apply appropriate join types:
     * INNER JOIN: Return only matching rows from both tables
     * LEFT JOIN: Return all rows from left table, matching rows from right
     * RIGHT JOIN: Return all rows from right table, matching rows from left
     * FULL OUTER JOIN: Return all rows from both tables
     * CROSS JOIN: Cartesian product of both tables
   - Join multiple tables (3+ tables) using chained JOINs
   - Use table aliases for readability (e.g., t for trades, tr for traders)
   - Use subqueries or CTEs (WITH clause) for complex logic
   - Aggregate data with GROUP BY when needed
   - Apply HAVING clauses for aggregate filtering
   - Use window functions for advanced analytics (ROW_NUMBER, RANK, PARTITION BY)
   
   Example multi-table JOIN for trade enrichment:
   ```sql
   SELECT 
       t.trade_id,
       t.trade_date,
       t.quantity,
       tr.trader_name,
       p.product_name,
       a.account_name,
       c.counterparty_name
   FROM fact_trade t
   INNER JOIN dim_trader tr ON t.trader_id = tr.trader_id
   INNER JOIN dim_product p ON t.product_id = p.product_id
   LEFT JOIN dim_account a ON t.account_id = a.account_id
   LEFT JOIN dim_counterparty c ON t.counterparty_id = c.counterparty_id
   WHERE t.alert_id = 'ALERT123'
   ORDER BY t.trade_date
   LIMIT 100;
   ```

4. Investigation Queries:
   - Join fact_trade with dimension tables for enrichment
   - Include all required fields for rule evaluation
   - Filter by alert_id for alert-specific investigations
   - Retrieve trade, trader, product, account, and counterparty details

RESPONSE FORMAT:

**CRITICAL FOR COMPLIANCE AND AUDITABILITY:**
- ALWAYS show the exact SQL query being executed in a code block
- This is a regulatory requirement for market surveillance investigations
- Compliance teams and regulators must be able to verify:
  * What data was accessed
  * How data was filtered and joined
  * The exact logic used in the investigation
- Display results in a clear table format
- Provide row counts and relevant statistics
- Explain query logic if complex
- Suggest optimizations if applicable

**DATA ACCESS TRACING:**
- **CRITICAL REQUIREMENT**: After executing any SQL query, you MUST provide a DATA ACCESS TRACE
- Describe in clear language which database and tables you accessed
- For queries with JOINs, explicitly state which tables are being joined and how
- Explicitly state the purpose of each join in the context of the investigation

**NEVER omit the SQL query or DATA ACCESS TRACE from your response. This is essential for audit trails and regulatory compliance.**

ACCURACY REQUIREMENTS:

- Never make up table or column names
- Use schema information provided by Coordinator
- If schema is unclear, request clarification
- Report schema mismatches clearly
- Suggest correct table/column names if user provides incorrect ones
"""


@tool
def execute_select_query(sql_query: str, max_rows: int = 50) -> str:
    """Execute a SELECT query against the PostgreSQL database and return results.
    
    This tool supports the full range of PostgreSQL SELECT query capabilities including:
    - Simple SELECT queries: SELECT * FROM table WHERE condition
    - Complex JOINs: INNER JOIN, LEFT JOIN, RIGHT JOIN, FULL OUTER JOIN, CROSS JOIN
    - Multiple table joins: Join 3+ tables using foreign key relationships
    - Subqueries and CTEs (Common Table Expressions): WITH cte AS (...)
    - Aggregations: GROUP BY, HAVING, COUNT, SUM, AVG, MIN, MAX
    - Window functions: ROW_NUMBER(), RANK(), PARTITION BY
    - Filtering: WHERE, HAVING, IN, EXISTS, BETWEEN
    - Sorting: ORDER BY with ASC/DESC
    - Limiting: LIMIT and OFFSET for pagination
    
    Example JOIN queries:
    - INNER JOIN: SELECT t.*, d.* FROM fact_trade t INNER JOIN dim_trader d ON t.trader_id = d.trader_id
    - LEFT JOIN: SELECT t.*, p.* FROM fact_trade t LEFT JOIN dim_product p ON t.product_id = p.product_id
    - Multiple JOINs: SELECT t.*, tr.*, p.*, a.* FROM fact_trade t 
                      INNER JOIN dim_trader tr ON t.trader_id = tr.trader_id
                      INNER JOIN dim_product p ON t.product_id = p.product_id
                      LEFT JOIN dim_account a ON t.account_id = a.account_id
    
    IMPORTANT: Only SELECT queries are allowed. Any attempt to modify data will be rejected.
    
    Args:
        sql_query: The SQL SELECT query to execute (supports JOINs, subqueries, aggregations, etc.)
        max_rows: Maximum number of rows to return (default 100, max 1000)
        
    Returns:
        Formatted query results with columns and rows
    """
    logger.info(f"Tool called: execute_select_query")
    logger.info(f"Query: {sql_query[:200]}...")
    
    # Validate query is SELECT only
    query_upper = sql_query.strip().upper()
    if not query_upper.startswith("SELECT"):
        return "ERROR: Only SELECT queries are allowed. This agent has read-only access."
    
    # Check for dangerous keywords
    dangerous_keywords = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE"]
    for keyword in dangerous_keywords:
        if keyword in query_upper:
            return f"ERROR: Query contains forbidden keyword '{keyword}'. Only SELECT queries are allowed."
    
    # Limit max_rows
    max_rows = min(max_rows, 1000)
    
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        
        # Execute query
        cursor.execute(sql_query)  # nosemgrep: python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query
        
        # Fetch results
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        
        # Close connection
        cursor.close()
        connection.close()
        
        logger.info(f"Query executed successfully, returned {len(rows)} rows")
        
        # Format results
        result = f"Query executed successfully:\n\n```sql\n{sql_query}\n```\n\n"
        result += format_query_results(columns, rows, max_rows)
        
        return result
        
    except psycopg2.Error as e:
        error_msg = str(e)
        logger.error(f"Database error: {error_msg}")
        return f"Database Error: {error_msg}\n\nPlease check:\n- Table and column names are correct\n- Query syntax is valid\n- You have permission to access the tables"
    except Exception as e:
        logger.error(f"Error executing query: {e}", exc_info=True)
        return f"Error: {str(e)}"


@tool
def get_row_count(table_name: str, where_clause: str = None) -> str:
    """Get the count of rows in a table, optionally with a WHERE clause.
    
    Args:
        table_name: Name of the table to count rows from
        where_clause: Optional WHERE clause (without the WHERE keyword)
        
    Returns:
        Row count for the table
    """
    logger.info(f"Tool called: get_row_count for table: {table_name}")

    # Validate table name: only allow alphanumeric characters and underscores
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table_name):
        return "ERROR: Invalid table name. Only alphanumeric characters and underscores are allowed."

    # Build query using psycopg2.sql for safe identifier quoting
    query = sql.SQL("SELECT COUNT(*) as row_count FROM {}").format(
        sql.Identifier(table_name)
    )
    if where_clause:
        query = sql.SQL("SELECT COUNT(*) as row_count FROM {} WHERE {}").format(
            sql.Identifier(table_name),
            sql.SQL(where_clause)
        )

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute(query)  # nosemgrep: python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query
        result = cursor.fetchone()
        count = result[0]
        
        cursor.close()
        connection.close()
        
        logger.info(f"Row count: {count}")
        
        if where_clause:
            return f"Table '{table_name}' has {count:,} rows matching: {where_clause}"
        else:
            return f"Table '{table_name}' has {count:,} total rows"
            
    except Exception as e:
        logger.error(f"Error getting row count: {e}")
        return f"Error: {str(e)}"


async def create_data_enrichment_agent() -> Agent:
    """
    Create and return the Data Enrichment Agent.
    
    The agent executes SQL queries against the PostgreSQL database with read-only access
    to enrich data and provide insights. Schema information should be provided by
    the Coordinator when needed.
    """
    logger.info("[Data Enrichment Agent] Creating agent with database tools")
    
    return Agent(
        model=create_sub_agent_model(),
        name="Data Enrichment Agent",
        description="Executes SQL queries against PostgreSQL database for data enrichment and analysis",
        system_prompt=DATA_ENRICHMENT_SYSTEM_PROMPT,
        tools=[execute_select_query, get_row_count],
        callback_handler=SpecialistCallbackHandler(agent_name="Data Enrichment"),
        trace_attributes={
            "agent.type": "specialist",
            "agent.name": "data-enrichment",
            "agent.domain": "database-query",
        },
        hooks=[ReadTimeoutRetryHook(max_retries=2, backoff_seconds=5)],
    )


# Export as tool for coordinator
@tool
async def data_enrichment_agent(query: str) -> str:
    """
    Specialized agent for executing SQL queries against the PostgreSQL database to enrich data.
    
    Use this agent when the user asks to:
    - Retrieve specific data from tables
    - Count rows or aggregate data
    - Filter, search, or analyze data
    - Join multiple tables
    - Get statistics or summaries
    
    This agent has READ-ONLY access and can only execute SELECT queries.
    
    Args:
        query: The data retrieval request or SQL query question
        
    Returns:
        Query results formatted as a table with enriched data
    """
    try:
        logger.info(f"[Data Enrichment Agent] Processing query: {query[:100]}...")
        
        agent = await create_data_enrichment_agent()
        response = await agent.invoke_async(query)
        
        # Extract text from response
        if hasattr(response, 'content') and isinstance(response.content, list):
            result = " ".join(block.text for block in response.content if hasattr(block, 'text'))
            logger.info(f"[Data Enrichment Agent] Returning {len(result)} characters")
            return result
        
        result = str(response)
        logger.info(f"[Data Enrichment Agent] Returning string: {len(result)} characters")
        return result
    except Exception as e:
        logger.error(f"[Data Enrichment Agent] Error: {str(e)}", exc_info=True)
        return f"Error in Data Enrichment Agent: {str(e)}"
