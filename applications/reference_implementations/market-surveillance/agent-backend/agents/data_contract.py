"""
Data Contract Agent - Handles database schema discovery and data structure questions
"""

import logging
from typing import Dict, Any
import boto3
import yaml
from strands import Agent, tool
from agents.callback_handlers import SpecialistCallbackHandler
from agents.timeout_retry_hook import ReadTimeoutRetryHook
from config import create_sub_agent_model, CONFIG_BUCKET, SCHEMA_CONFIG_KEY

logger = logging.getLogger(__name__)


def load_schema_from_s3() -> Dict[str, Any]:
    """Load schema configuration from S3 bucket."""
    if not CONFIG_BUCKET:
        logger.error("CONFIG_BUCKET environment variable not set")
        raise ValueError("CONFIG_BUCKET environment variable is required")
    
    try:
        logger.info(f"Loading schema config from s3://{CONFIG_BUCKET}/{SCHEMA_CONFIG_KEY}")
        s3 = boto3.client("s3", config=boto3.session.Config(connect_timeout=5, read_timeout=10))
        response = s3.get_object(Bucket=CONFIG_BUCKET, Key=SCHEMA_CONFIG_KEY)
        schema_yaml = response["Body"].read().decode("utf-8")
        schema_data = yaml.safe_load(schema_yaml)
        logger.info(f"Successfully loaded schema config with {len(schema_data.get('tables', []))} tables")
        return schema_data
    except Exception as e:
        logger.error(f"Failed to load schema from S3: {e}")
        raise


def parse_schema_config(schema_data: Dict[str, Any]) -> Dict[str, Dict]:
    """Parse the YAML schema config into the format expected by the agent tools."""
    parsed_schema = {}
    
    for table in schema_data.get("tables", []):
        table_name = table["name"].lower()
        parsed_schema[table_name] = {
            "description": table.get("description", ""),
            "type": table.get("type", ""),
            "purpose": table.get("purpose", ""),
            "columns": {}
        }
        
        for column in table.get("schema", []):
            col_name = column["column"]
            parsed_schema[table_name]["columns"][col_name] = {
                "type": column.get("data_type", ""),
                "description": column.get("description", ""),
                "primary_key": column.get("primary_key", False),
                "nullable": column.get("nullable", True)
            }
            
            # Add foreign key information if present
            if "foreign_keys" in column:
                parsed_schema[table_name]["columns"][col_name]["foreign_keys"] = []
                for fk in column["foreign_keys"]:
                    ref_parts = fk["references"].split(".")
                    if len(ref_parts) == 2:
                        parsed_schema[table_name]["columns"][col_name]["foreign_keys"].append({
                            "table": ref_parts[0].lower(),
                            "column": ref_parts[1],
                            "cardinality": fk.get("cardinality", ""),
                            "purpose": fk.get("purpose", "")
                        })
    
    return parsed_schema


# Load schema from S3 on module import
_DATABASE_SCHEMA = None

def get_database_schema() -> Dict[str, Dict]:
    """Get the database schema, loading from S3 if not already loaded."""
    global _DATABASE_SCHEMA
    
    if _DATABASE_SCHEMA is not None:
        return _DATABASE_SCHEMA
    
    try:
        print(f"[Data Contract] Loading schema from S3: {CONFIG_BUCKET}/{SCHEMA_CONFIG_KEY}")
        SCHEMA_CONFIG_RAW = load_schema_from_s3()
        _DATABASE_SCHEMA = parse_schema_config(SCHEMA_CONFIG_RAW)
        print(f"[Data Contract] Parsed {len(_DATABASE_SCHEMA)} tables from schema config")
        logger.info(f"Parsed {len(_DATABASE_SCHEMA)} tables from schema config")
    except Exception as e:
        print(f"[Data Contract] Failed to load schema from S3, using fallback: {e}")
        logger.warning(f"Failed to load schema from S3, using fallback: {e}")
        # Fallback to minimal schema for testing
        _DATABASE_SCHEMA = {
            "fact_trade": {
                "description": "Trade data - fallback schema",
                "type": "Fact",
                "purpose": "Database",
                "columns": {
                    "Trade_ID": {
                        "type": "Alphanumeric",
                        "primary_key": True,
                        "description": "Unique ID - Trade"
                    }
                }
            }
        }
    
    return _DATABASE_SCHEMA


DATA_CONTRACT_SYSTEM_PROMPT = """You are a Data Contract Specialist for the Market Surveillance database.

**Your Expertise:**
- Database schema and structure
- Table relationships and foreign keys
- Column definitions and data types
- Data organization and architecture

**Your Responsibilities:**
- List available tables and their purposes
- Provide detailed schema information for specific tables
- Explain relationships between tables
- Help users find specific columns or data fields
- Guide users on how data is organized

**Data Accuracy Rules:**
- NEVER make up table names or column names
- ALWAYS use the tools to fetch real schema information
- NEVER invent relationships that don't exist
- Only provide information from the actual database schema

**Presentation:**
- Use clear, structured formatting
- Organize information logically
- Provide context for technical details
- Be helpful and educational
"""


@tool
def get_table_list() -> str:
    """Get a list of all available tables in the database.
    
    Returns:
        A formatted list of table names with their descriptions
    """
    logger.info("Tool called: get_table_list")
    DATABASE_SCHEMA = get_database_schema()
    
    result = "Available tables in the database:\n\n"
    for table_name, table_info in DATABASE_SCHEMA.items():
        result += f"• {table_name}: {table_info['description']}\n"
    
    logger.info(f"Returned {len(DATABASE_SCHEMA)} tables")
    return result


@tool
def get_table_schema(table_name: str) -> str:
    """Get the complete schema for a specific table including columns, data types, and relationships.
    
    Args:
        table_name: The name of the table to get schema information for
        
    Returns:
        Detailed schema information including columns, types, keys, and relationships
    """
    logger.info(f"Tool called: get_table_schema with table_name='{table_name}'")
    DATABASE_SCHEMA = get_database_schema()
    
    table_name_lower = table_name.lower().strip()
    
    if table_name_lower not in DATABASE_SCHEMA:
        available = ", ".join(DATABASE_SCHEMA.keys())
        return f"Table '{table_name}' not found. Available tables: {available}"
    
    table_info = DATABASE_SCHEMA[table_name_lower]
    result = f"Schema for table: {table_name_lower}\n"
    result += f"Purpose: {table_info['description']}\n"
    result += f"Type: {table_info.get('type', 'N/A')}\n\n"
    result += "Columns:\n"
    
    for col_name, col_info in table_info['columns'].items():
        result += f"\n• {col_name}\n"
        result += f"  - Type: {col_info['type']}\n"
        result += f"  - Description: {col_info['description']}\n"
        
        if col_info.get('primary_key'):
            result += f"  - Primary Key: Yes\n"
        
        if col_info.get('nullable') is False:
            result += f"  - Nullable: No\n"
        
        if 'foreign_keys' in col_info:
            for fk in col_info['foreign_keys']:
                result += f"  - Foreign Key: References {fk['table']}.{fk['column']}\n"
                if fk.get('cardinality'):
                    result += f"    Cardinality: {fk['cardinality']}\n"
                if fk.get('purpose'):
                    result += f"    Purpose: {fk['purpose']}\n"
    
    logger.info(f"Returned schema for table: {table_name_lower}")
    return result


@tool
def get_table_relationships() -> str:
    """Get information about foreign key relationships between tables.
    
    Returns:
        A formatted description of all table relationships and their cardinality
    """
    logger.info("Tool called: get_table_relationships")
    DATABASE_SCHEMA = get_database_schema()
    
    result = "Database Table Relationships:\n\n"
    
    relationships = []
    for table_name, table_info in DATABASE_SCHEMA.items():
        for col_name, col_info in table_info['columns'].items():
            if 'foreign_keys' in col_info:
                for fk in col_info['foreign_keys']:
                    relationships.append({
                        'from_table': table_name,
                        'from_column': col_name,
                        'to_table': fk['table'],
                        'to_column': fk['column'],
                        'cardinality': fk.get('cardinality', 'N/A'),
                        'purpose': fk.get('purpose', '')
                    })
    
    if not relationships:
        return "No foreign key relationships defined in the schema."
    
    for rel in relationships:
        result += f"• {rel['from_table']}.{rel['from_column']} → {rel['to_table']}.{rel['to_column']}\n"
        if rel['cardinality'] != 'N/A':
            result += f"  Cardinality: {rel['cardinality']}\n"
        if rel['purpose']:
            result += f"  Purpose: {rel['purpose']}\n"
        result += "\n"
    
    logger.info(f"Returned {len(relationships)} relationships")
    return result


@tool
def search_columns(search_term: str) -> str:
    """Search for columns across all tables that match a search term.
    
    Args:
        search_term: The term to search for in column names or descriptions
        
    Returns:
        List of matching columns with their table and description
    """
    logger.info(f"Tool called: search_columns with search_term='{search_term}'")
    DATABASE_SCHEMA = get_database_schema()
    
    search_lower = search_term.lower().strip()
    matches = []
    
    for table_name, table_info in DATABASE_SCHEMA.items():
        for col_name, col_info in table_info['columns'].items():
            if (search_lower in col_name.lower() or 
                search_lower in col_info['description'].lower()):
                matches.append({
                    'table': table_name,
                    'column': col_name,
                    'type': col_info['type'],
                    'description': col_info['description']
                })
    
    if not matches:
        return f"No columns found matching '{search_term}'"
    
    result = f"Found {len(matches)} column(s) matching '{search_term}':\n\n"
    for match in matches:
        result += f"• {match['table']}.{match['column']}\n"
        result += f"  Type: {match['type']}\n"
        result += f"  Description: {match['description']}\n\n"
    
    logger.info(f"Found {len(matches)} matching columns")
    return result


async def create_data_contract_agent() -> Agent:
    """
    Create and return the Data Contract Agent.
    
    The agent provides database schema information and helps users
    understand the data structure.
    """
    logger.info("[Data Contract Agent] Creating agent with schema tools")
    
    return Agent(
        model=create_sub_agent_model(),
        name="Data Contract Agent",
        description="Provides database schema information and data structure guidance",
        system_prompt=DATA_CONTRACT_SYSTEM_PROMPT,
        tools=[get_table_list, get_table_schema, get_table_relationships, search_columns],
        callback_handler=SpecialistCallbackHandler(agent_name="Data Contract"),
        trace_attributes={
            "agent.type": "specialist",
            "agent.name": "data-contract",
            "agent.domain": "database-schema",
        },
        hooks=[ReadTimeoutRetryHook(max_retries=2, backoff_seconds=5)],
    )


# Export as tool for coordinator
@tool
async def data_contract_agent(query: str) -> str:
    """
    Specialized agent for database schema and data structure questions.
    
    Use this agent when the user asks about:
    - What tables exist in the database
    - Schema information for specific tables
    - Column names, types, or descriptions
    - Relationships between tables
    - Foreign keys and primary keys
    - Searching for specific columns or data fields
    
    Args:
        query: The data contract question to answer
        
    Returns:
        Detailed information about the database schema
    """
    try:
        logger.info(f"[Data Contract Agent] Processing query: {query[:100]}...")
        
        agent = await create_data_contract_agent()
        response = await agent.invoke_async(query)
        
        # Extract text from response
        if hasattr(response, 'content') and isinstance(response.content, list):
            result = " ".join(block.text for block in response.content if hasattr(block, 'text'))
            logger.info(f"[Data Contract Agent] Returning {len(result)} characters")
            return result
        
        result = str(response)
        logger.info(f"[Data Contract Agent] Returning string: {len(result)} characters")
        return result
    except Exception as e:
        logger.error(f"[Data Contract Agent] Error: {str(e)}", exc_info=True)
        return f"Error in Data Contract Agent: {str(e)}"
