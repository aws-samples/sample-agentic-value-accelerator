"""
Report Assembly Agent - Handles output schema and report structure for investigation reports
"""

import logging
from typing import Dict, Any
import boto3
import yaml
from strands import Agent, tool
from agents.callback_handlers import SpecialistCallbackHandler
from agents.timeout_retry_hook import ReadTimeoutRetryHook
from config import create_sub_agent_model, CONFIG_BUCKET

logger = logging.getLogger(__name__)

# S3 key for output schema configuration
OUTPUT_SCHEMA_CONFIG_KEY = "configs/output_schema_config.yaml"


def load_output_schema_from_s3() -> Dict[str, Any]:
    """Load output schema configuration from S3 bucket."""
    if not CONFIG_BUCKET:
        logger.error("CONFIG_BUCKET environment variable not set")
        raise ValueError("CONFIG_BUCKET environment variable is required")
    
    try:
        logger.info(f"Loading output schema config from s3://{CONFIG_BUCKET}/{OUTPUT_SCHEMA_CONFIG_KEY}")
        s3 = boto3.client("s3", config=boto3.session.Config(connect_timeout=5, read_timeout=10))
        response = s3.get_object(Bucket=CONFIG_BUCKET, Key=OUTPUT_SCHEMA_CONFIG_KEY)
        schema_yaml = response["Body"].read().decode("utf-8")
        schema_data = yaml.safe_load(schema_yaml)
        logger.info(f"Successfully loaded output schema config with {len(schema_data.get('output_tables', {}))} output tables")
        return schema_data
    except Exception as e:
        logger.error(f"Failed to load output schema from S3: {e}")
        raise


# Load output schema from S3 on module import
_OUTPUT_SCHEMA = None

def get_output_schema() -> Dict[str, Any]:
    """Get the output schema, loading from S3 if not already loaded."""
    global _OUTPUT_SCHEMA
    
    if _OUTPUT_SCHEMA is not None:
        return _OUTPUT_SCHEMA
    
    try:
        print(f"[Report Assembly] Loading output schema from S3: {CONFIG_BUCKET}/{OUTPUT_SCHEMA_CONFIG_KEY}")
        _OUTPUT_SCHEMA = load_output_schema_from_s3()
        print(f"[Report Assembly] Loaded {len(_OUTPUT_SCHEMA.get('output_tables', {}))} output tables from schema config")
        logger.info(f"Loaded {len(_OUTPUT_SCHEMA.get('output_tables', {}))} output tables from schema config")
    except Exception as e:
        print(f"[Report Assembly] Failed to load output schema from S3: {e}")
        logger.error(f"Failed to load output schema from S3: {e}")
        # Set to empty schema - no fallback
        _OUTPUT_SCHEMA = {
            "schema_version": "unknown",
            "description": "Output schema not available",
            "output_tables": {}
        }
    
    return _OUTPUT_SCHEMA


REPORT_ASSEMBLY_SYSTEM_PROMPT = """You are a Report Assembly Specialist for market surveillance alert investigation reports.

**Your Expertise:**
- Output report structure and format
- Required tables and columns for investigation reports
- Data formatting rules and requirements
- Source table mappings for output fields

**Your Responsibilities:**
- List all output tables that should be included in investigation reports
- Provide detailed schema for specific output tables
- Explain which source tables map to output tables
- Describe column formatting rules and requirements
- Guide users on report structure and organization

**Output Tables You Manage:**
- alert_details: Core alert information
- account_details: Account information
- actor_details: Trader and actor information
- product_details: Product and instrument details
- pivot_trade: Pivot trade that triggered the alert (the customer trade flagged by surveillance)
- flagged_trades: Flagged trades within time window
- book_details: Book information
- summary_table: Alert summary with disposition
- disposition_parameters: Alert-specific parameters
- ecomm: Electronic communications

**Data Accuracy Rules:**
- NEVER make up output table names or column names
- ALWAYS use the tools to fetch real schema information
- NEVER invent formatting rules that don't exist
- Only provide information from the actual output schema configuration

**Presentation:**
- Use clear, structured formatting
- Organize information logically by output table
- Explain source table mappings clearly
- Highlight required vs optional fields
- Provide formatting examples when relevant
"""


@tool
def get_output_table_list() -> str:
    """Get a list of all output tables that should be included in investigation reports.
    
    Returns:
        A formatted list of output table names with their descriptions
    """
    logger.info("Tool called: get_output_table_list")
    output_schema = get_output_schema()
    
    output_tables = output_schema.get('output_tables', {})
    
    if not output_tables:
        return "Output schema not available. The output schema configuration could not be loaded from S3. Please ensure the configuration file is uploaded to S3 and the CONFIG_BUCKET environment variable is set correctly."
    
    result = "Output tables for investigation reports:\n\n"
    result += f"Schema Version: {output_schema.get('schema_version', 'N/A')}\n"
    result += f"Description: {output_schema.get('description', 'N/A')}\n\n"
    
    for table_name, table_info in output_tables.items():
        result += f"• {table_name}: {table_info.get('description', 'No description')}\n"
        
        # Add source tables if available
        source_tables = table_info.get('source_tables', [])
        if source_tables:
            result += f"  Source tables: {', '.join(source_tables)}\n"
        
        # Add time window if specified
        if 'time_window' in table_info:
            result += f"  Time window: {table_info['time_window']}\n"
        
        result += "\n"
    
    logger.info(f"Returned {len(output_tables)} output tables")
    return result


@tool
def get_output_table_schema(table_name: str) -> str:
    """Get the complete schema for a specific output table including columns, data types, and formatting rules.
    
    Args:
        table_name: The name of the output table to get schema information for
        
    Returns:
        Detailed schema information including columns, types, source mappings, and formatting rules
    """
    logger.info(f"Tool called: get_output_table_schema with table_name='{table_name}'")
    output_schema = get_output_schema()
    
    output_tables = output_schema.get('output_tables', {})
    table_name_lower = table_name.lower().strip()
    
    if table_name_lower not in output_tables:
        available = ", ".join(output_tables.keys())
        return f"Output table '{table_name}' not found. Available tables: {available}"
    
    table_info = output_tables[table_name_lower]
    result = f"Output Table Schema: {table_name_lower}\n"
    result += f"Description: {table_info.get('description', 'N/A')}\n"
    
    # Source tables
    source_tables = table_info.get('source_tables', [])
    if source_tables:
        result += f"Source Tables: {', '.join(source_tables)}\n"
    
    # Time window
    if 'time_window' in table_info:
        result += f"Time Window: {table_info['time_window']}\n"
    
    # Filters
    if 'filters' in table_info:
        result += f"\nFilters:\n"
        for filter_item in table_info['filters']:
            for key, value in filter_item.items():
                result += f"  - {key}: {value}\n"
    
    # Note
    if 'note' in table_info:
        result += f"\nNote: {table_info['note']}\n"
    
    result += "\nColumns:\n"
    
    columns = table_info.get('columns', [])
    for col in columns:
        output_name = col.get('output_name', 'N/A')
        result += f"\n• {output_name}\n"
        
        # Source column
        if 'source_column' in col:
            result += f"  - Source Column: {col['source_column']}\n"
        
        # Source table (if specified at column level)
        if 'source_table' in col:
            result += f"  - Source Table: {col['source_table']}\n"
        
        # Data type
        if 'data_type' in col:
            result += f"  - Data Type: {col['data_type']}\n"
        
        # Format rule
        if 'format_rule' in col:
            result += f"  - Format Rule: {col['format_rule']}\n"
        
        # Required
        if 'required' in col:
            result += f"  - Required: {col['required']}\n"
        
        # Note
        if 'note' in col:
            result += f"  - Note: {col['note']}\n"
    
    logger.info(f"Returned schema for output table: {table_name_lower}")
    return result


@tool
def get_required_output_columns(table_name: str) -> str:
    """Get only the required columns for a specific output table.
    
    Args:
        table_name: The name of the output table
        
    Returns:
        List of required columns with their source mappings
    """
    logger.info(f"Tool called: get_required_output_columns with table_name='{table_name}'")
    output_schema = get_output_schema()
    
    output_tables = output_schema.get('output_tables', {})
    table_name_lower = table_name.lower().strip()
    
    if table_name_lower not in output_tables:
        available = ", ".join(output_tables.keys())
        return f"Output table '{table_name}' not found. Available tables: {available}"
    
    table_info = output_tables[table_name_lower]
    columns = table_info.get('columns', [])
    
    required_cols = [col for col in columns if col.get('required', '').lower() == 'yes']
    
    if not required_cols:
        return f"No required columns found for table '{table_name_lower}'"
    
    result = f"Required columns for {table_name_lower}:\n\n"
    
    for col in required_cols:
        output_name = col.get('output_name', 'N/A')
        source_column = col.get('source_column', 'N/A')
        source_table = col.get('source_table', table_info.get('source_tables', ['N/A'])[0] if table_info.get('source_tables') else 'N/A')
        data_type = col.get('data_type', 'N/A')
        format_rule = col.get('format_rule', 'N/A')
        
        result += f"• {output_name}\n"
        result += f"  Source: {source_table}.{source_column}\n"
        result += f"  Type: {data_type}\n"
        result += f"  Format: {format_rule}\n\n"
    
    logger.info(f"Returned {len(required_cols)} required columns for {table_name_lower}")
    return result


@tool
def get_source_table_mapping(source_table_name: str) -> str:
    """Get all output tables and columns that use a specific source table.
    
    Args:
        source_table_name: The name of the source table (e.g., Fact_Trade, Dim_Account)
        
    Returns:
        List of output tables and columns that map to this source table
    """
    logger.info(f"Tool called: get_source_table_mapping with source_table_name='{source_table_name}'")
    output_schema = get_output_schema()
    
    output_tables = output_schema.get('output_tables', {})
    source_table_lower = source_table_name.lower().strip()
    
    mappings = []
    
    for table_name, table_info in output_tables.items():
        # Check if source table is in the table's source_tables list
        source_tables = [st.lower() for st in table_info.get('source_tables', [])]
        
        if source_table_lower in source_tables:
            # Find columns from this source table
            columns = table_info.get('columns', [])
            for col in columns:
                col_source_table = col.get('source_table', '').lower()
                col_source_column = col.get('source_column', '')
                
                # Match if column specifies this source table, or if no source_table specified and it's in the table's source list
                if col_source_table == source_table_lower or (not col_source_table and source_table_lower in source_tables):
                    mappings.append({
                        'output_table': table_name,
                        'output_column': col.get('output_name', 'N/A'),
                        'source_column': col_source_column,
                        'data_type': col.get('data_type', 'N/A'),
                        'required': col.get('required', 'N/A')
                    })
    
    if not mappings:
        return f"No output columns found that map to source table '{source_table_name}'"
    
    result = f"Output columns mapped from source table '{source_table_name}':\n\n"
    
    current_table = None
    for mapping in mappings:
        if mapping['output_table'] != current_table:
            current_table = mapping['output_table']
            result += f"\n{current_table}:\n"
        
        result += f"  • {mapping['output_column']} ← {mapping['source_column']}\n"
        result += f"    Type: {mapping['data_type']}, Required: {mapping['required']}\n"
    
    logger.info(f"Returned {len(mappings)} column mappings for source table {source_table_name}")
    return result


async def create_report_assembly_agent() -> Agent:
    """
    Create and return the Report Assembly Agent.
    
    The agent provides output schema information and helps users
    understand the report structure and requirements.
    """
    logger.info("[Report Assembly Agent] Creating agent with output schema tools")
    
    return Agent(
        model=create_sub_agent_model(),
        name="Report Assembly Agent",
        description="Provides output schema information and report structure guidance for investigation reports",
        system_prompt=REPORT_ASSEMBLY_SYSTEM_PROMPT,
        tools=[
            get_output_table_list,
            get_output_table_schema,
            get_required_output_columns,
            get_source_table_mapping
        ],
        callback_handler=SpecialistCallbackHandler(agent_name="Report Assembly"),
        trace_attributes={
            "agent.type": "specialist",
            "agent.name": "report-assembly",
            "agent.domain": "output-schema",
        },
        hooks=[ReadTimeoutRetryHook(max_retries=2, backoff_seconds=5)],
    )


# Export as tool for coordinator
@tool
async def report_assembly_agent(query: str) -> str:
    """
    Specialized agent for output schema and report structure questions.
    
    Use this agent when the user asks about:
    - What tables should be included in investigation reports
    - Output schema for specific report tables
    - Required columns and formatting rules
    - Source table mappings for output fields
    - Report structure and organization
    - Data formatting requirements
    
    Args:
        query: The report assembly question to answer
        
    Returns:
        Detailed information about the output schema and report structure
    """
    try:
        logger.info(f"[Report Assembly Agent] Processing query: {query[:100]}...")
        
        agent = await create_report_assembly_agent()
        response = await agent.invoke_async(query)
        
        # Extract text from response
        if hasattr(response, 'content') and isinstance(response.content, list):
            result = " ".join(block.text for block in response.content if hasattr(block, 'text'))
            logger.info(f"[Report Assembly Agent] Returning {len(result)} characters")
            return result
        
        result = str(response)
        logger.info(f"[Report Assembly Agent] Returning string: {len(result)} characters")
        return result
    except Exception as e:
        logger.error(f"[Report Assembly Agent] Error: {str(e)}", exc_info=True)
        return f"Error in Report Assembly Agent: {str(e)}"
