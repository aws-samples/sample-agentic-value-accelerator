# Market Surveillance Agent System

Multi-agent system for Market Surveillance, built with Strands Agents and deployed on AWS Bedrock AgentCore Runtime.

## Project Structure

```
agent-backend/
├── agent.py                     # Main entry point (AgentCore Runtime)
├── config.py                    # Configuration management
├── agents/
│   ├── __init__.py
│   ├── callback_handlers.py    # Event handlers for streaming
│   ├── coordinator.py           # Coordinator agent
│   ├── data_contract.py         # Data contract specialist
│   └── data_enrichment.py       # Data enrichment specialist
├── configs/
│   └── schema_config.yaml       # Database schema configuration
├── test_agent.py                # Local testing script
├── Dockerfile                   # Container image definition
├── pyproject.toml              # Python dependencies (uv)
└── README.md                   # This file
```

## Architecture

### Coordinator Pattern

The system uses a coordinator agent that routes queries to specialized agents:

```
User Query → Coordinator Agent → Analyzes Query
                    ↓
        ┌───────────┴───────────┬──────────────┐
        ↓                       ↓              ↓
Data Contract Agent      Data Enrichment Agent  General Knowledge
(Schema queries)        (Data retrieval)       (Direct handling)
        ↓                       ↓
    S3 Schema Config      Aurora Posgress
```

### Agents

1. **Coordinator Agent** (`agents/coordinator.py`)
   - Main orchestrator
   - Routes queries to specialists
   - Handles general market surveillance questions

2. **Data Contract Agent** (`agents/data_contract.py`)
   - Database schema information
   - Table relationships
   - Column search
   - Loads schema from S3

3. **Data Enrichment Agent** (`agents/data_enrichment.py`)
   - Executes SELECT queries against Oracle database
   - Read-only access for safety
   - Data retrieval and enrichment
   - Query result formatting

## Dependencies

The project uses `uv` as the package manager with dependencies defined in `pyproject.toml`:

```toml
[project]
name = "market-surveillance-agent"
version = "1.0.0"
requires-python = ">=3.13"
dependencies = [
    "strands-agents>=1.0.0",
    "strands-tools>=1.0.0",
    "bedrock-agentcore>=0.1.2",
    "bedrock-agentcore-starter-toolkit>=0.1.6",
    "pyyaml>=6.0.0",
    "boto3>=1.34.0",
    "python-dotenv>=1.0.0",
    "oracledb>=3.4.0",
]
```

### Installing Dependencies

```bash
# Using uv (recommended)
uv sync

# Or using pip (from pyproject.toml)
pip install -e .
```

## Configuration

Environment variables (set by AgentCore Runtime or locally):

```bash
# AWS Configuration
AWS_REGION=us-east-1

# S3 Configuration for agent configs
CONFIG_BUCKET=market-surveillance-agent-configs-dev-<AWS_ACCOUNT_ID>
SCHEMA_CONFIG_KEY=configs/data-shape/schema_config.yaml

# Database Configuration
DB_HOST=your-db-host.rds.amazonaws.com
DB_PORT=<Port_Number>
DB_USERNAME=db_user

# Environment
ENVIRONMENT=dev
```
**Set your database password from Secrets Manager:**
```bash
export DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id market-surveillance-db-dev --query SecretString --output text --region us-east-1 | jq -r '.PASSWORD')
```


## Local Development

### Prerequisites

- Python 3.13+
- uv (Python package manager)
- AWS credentials configured
- Oracle database access (for SQL Query Agent)

### Setup

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
cd agent-backend
uv sync

# Set environment variables
export CONFIG_BUCKET="market-surveillance-agent-configs-dev-<AWS_ACCOUNT_ID>"
export AWS_REGION="us-east-1"
export DB_HOST="your-db-host.rds.amazonaws.com"
export DB_PORT="1521"
export DB_SERVICE_NAME="ORCL"
export DB_USERNAME="db_user"
```
**Set your database password from Secrets Manager:**
```bash
export DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id market-surveillance-db-dev --query SecretString --output text --region us-east-1 | jq -r '.PASSWORD')
```


### Running Locally

#### Option 1: Test Script (Recommended)

```bash
# Update database credentials in test_agent.py first
uv run python test_agent.py
```

This runs a simple test that:
- Creates the coordinator agent
- Tests schema discovery
- Tests data retrieval
- Shows streaming responses

#### Option 2: Direct Python Execution

```bash
# Note: This starts the AgentCore app but requires proper ASGI server
uv run python agent.py
```

## Deployment

### Build Docker Image

```bash
docker build -t market-surveillance-agent .
```

### Deploy to AgentCore

Deployment is handled by Terraform:

```bash
cd ../infrastructure
terraform apply
```

This will:
1. Build and push Docker image to ECR
2. Create/update AgentCore Runtime
3. Configure environment variables
4. Set up IAM permissions

## Agent Capabilities

### Data Contract Agent

**Use Cases:**
- "What tables are in the database?"
- "Show me the schema for Fact_Trade"
- "What columns contain trader information?"
- "How are trades related to alerts?"

**Tools:**
- `get_table_list` - List all tables
- `get_table_schema` - Get detailed schema for a table
- `get_table_relationships` - Show foreign key relationships
- `search_columns` - Search for columns by name or description

### Data Enrichment Agent

**Use Cases:**
- "Show me the last 10 trades"
- "How many trades were executed today?"
- "Get all trades for trader ID 12345"
- "What's the average trade size?"
- "Show me trades with alerts"

**Tools:**
- `execute_select_query` - Execute any SELECT query
- `get_row_count` - Count rows in a table
- `get_sample_data` - Get sample rows from a table

**Safety Features:**
- Read-only access (SELECT queries only)
- Blocks INSERT, UPDATE, DELETE, DROP, etc.
- Query validation before execution
- Row limits to prevent large result sets
- Clear error messages

## Adding New Agents

To add a new specialized agent:

### 1. Create Agent Module

```python
# agents/my_new_agent.py
from strands import Agent, tool
from agents.callback_handlers import SpecialistCallbackHandler
from config import create_bedrock_model

@tool
def my_tool(param: str) -> str:
    """Tool description."""
    # Implementation
    return result

async def create_my_agent() -> Agent:
    """Create and return the agent."""
    return Agent(
        model=create_bedrock_model(),
        name="My Agent",
        system_prompt="...",
        tools=[my_tool],
        callback_handler=SpecialistCallbackHandler(),
    )

@tool
async def my_agent(query: str) -> str:
    """Agent tool for coordinator."""
    agent = await create_my_agent()
    response = await agent.invoke_async(query)
    return str(response)
```

### 2. Add to Coordinator

```python
# agents/coordinator.py
from agents.my_new_agent import my_agent

# In create_coordinator_agent():
agent = Agent(
    ...
    tools=[
        current_time,
        data_contract_agent,
        sql_query_agent,
        my_agent,  # Add here
    ],
    ...
)
```

### 3. Update System Prompt

Add routing instructions to `COORDINATOR_SYSTEM_PROMPT` in `coordinator.py`.

### 4. Update __init__.py

```python
# agents/__init__.py
from agents.my_new_agent import create_my_agent, my_agent

__all__ = [
    # ... existing exports
    "create_my_agent",
    "my_agent",
]
```

## Streaming

The agent supports streaming responses with thinking events:

```python
async for event in coordinator_agent.stream_async(message):
    if event["type"] == "content_delta":
        # Token-by-token output
        print(event["data"], end="")
    elif event["type"] == "thinking":
        # Agent thinking/routing events
        print(f"[Thinking] {event['data']}")
    elif event["type"] == "result":
        # Final result
        print(f"\n[Done] {event['message']}")
```

## Observability

### Logging

Logs are sent to CloudWatch Logs:
- Log Group: `/aws/bedrock-agentcore/runtimes/*`
- Structured logging with agent names and trace IDs

### Tracing

OpenTelemetry traces are automatically collected:
- Agent invocations
- Tool calls
- Specialist routing
- Response times
- Database queries

### Metrics

Key metrics to monitor:
- Invocation count
- Response time
- Error rate
- Agent routing decisions
- Database query performance

## Best Practices

1. **Configuration**: Use environment variables, never hardcode
2. **Error Handling**: Wrap agent calls in try-except
3. **Logging**: Log routing decisions and errors
4. **Testing**: Test each agent independently with `test_agent.py`
5. **Documentation**: Update system prompts and docs
6. **Security**: SQL Query Agent is read-only by design
7. **Performance**: Use row limits and WHERE clauses in queries

## Troubleshooting

### Schema Not Loading

Check:
- `CONFIG_BUCKET` is set correctly
- AWS credentials are valid
- S3 bucket exists and is accessible
- Schema file exists at the specified key

### Database Connection Errors

Check:
- `DB_HOST`, `DB_SERVICE_NAME`, `DB_USERNAME`, `DB_PASSWORD` are set
- Database is accessible from your network
- Security groups allow connections
- Credentials are correct

### Agent Not Routing Correctly

Check:
- System prompt has clear routing instructions
- Tool descriptions are specific
- Query matches routing patterns

### Import Errors

Ensure dependencies are installed:
```bash
uv sync
```

## Example Queries

### Schema Discovery
```
"What tables are available?"
"Show me the schema for Fact_Trade"
"What columns contain alert information?"
```

### Data Retrieval
```
"Show me 10 sample trades"
"How many trades are in the database?"
"Get trades from today"
"Show me all alerts for trader 12345"
```

### Combined Workflow
```
"What's in the Fact_Trade table and show me some examples"
→ Coordinator routes to Data Contract first, then Data Enrichment
```

## Resources

- [Strands Agents Documentation](https://strandsagents.com)
- [AWS Bedrock AgentCore](https://docs.aws.amazon.com/bedrock/)
- [Multi-Agent Patterns](https://strandsagents.com/latest/documentation/docs/user-guide/concepts/multi-agent/)
- [Oracle Python Driver](https://python-oracledb.readthedocs.io/)
