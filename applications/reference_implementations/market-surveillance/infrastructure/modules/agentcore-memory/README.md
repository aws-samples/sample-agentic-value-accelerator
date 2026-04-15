# AgentCore Memory Module

This module configures AWS Bedrock AgentCore Memory with both short-term and long-term memory capabilities for the Market Surveillance Agent.

## Memory Architecture

### Short-Term Memory (STM)
- **Type**: Raw conversation events
- **Retention**: Configurable (7-365 days, default: 7 days)
- **Purpose**: Recent conversation history and context
- **Expiry**: Events automatically expire after the configured duration

### Long-Term Memory (LTM)
- **Type**: Extracted knowledge and facts
- **Retention**: Indefinite (does not expire)
- **Purpose**: Persistent knowledge about trades, alerts, investigations, and user preferences
- **Strategies**: Configurable via separate strategy resources

## Available Memory Strategies

### 1. Semantic Memory (Enabled by default)
- **Type**: `SEMANTIC`
- **Purpose**: Extracts and stores facts about trades, alerts, and investigations
- **Namespace**: `default`
- **Use Case**: Remembers key information like:
  - Trade details and patterns
  - Alert characteristics
  - Investigation findings
  - Regulatory context

### 2. User Preferences (Optional)
- **Type**: `USER_PREFERENCE`
- **Purpose**: Tracks user preferences and interaction patterns
- **Namespace**: `preferences`
- **Use Case**: Remembers:
  - Alert filtering preferences
  - Display settings
  - Investigation workflow preferences

### 3. Summarization (Optional)
- **Type**: `SUMMARIZATION`
- **Purpose**: Creates summaries of long conversations and investigations
- **Namespace**: `{sessionId}` (per-session summaries)
- **Use Case**: Generates:
  - Investigation summaries
  - Conversation recaps
  - Key findings summaries

## Configuration

### Basic Usage

```terraform
module "memory" {
  source = "./modules/agentcore-memory"

  environment           = "dev"
  memory_name           = "market-surveillance-memory"
  description           = "Memory for Market Surveillance Agent"
  event_expiry_duration = 7  # days (minimum: 7, maximum: 365)
  
  # Enable semantic memory for market surveillance facts
  enable_semantic_memory = true
}
```

### Full Configuration

```terraform
module "memory" {
  source = "./modules/agentcore-memory"

  environment           = "dev"
  memory_name           = "market-surveillance-memory"
  description           = "Memory for Market Surveillance Agent"
  event_expiry_duration = 30  # 30 days retention for events
  
  # Enable all memory strategies
  enable_semantic_memory  = true  # Facts about trades and alerts
  enable_user_preferences = true  # User preferences
  enable_summarization    = true  # Conversation summaries
}
```

## Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `environment` | string | - | Environment name (dev, staging, prod) |
| `memory_name` | string | `"market-surveillance-memory"` | Name of the memory resource |
| `description` | string | `"Memory for Market Surveillance Agent conversations"` | Description |
| `event_expiry_duration` | number | `7` | Days before events expire (7-365) |
| `enable_semantic_memory` | bool | `true` | Enable semantic memory strategy |
| `enable_user_preferences` | bool | `false` | Enable user preferences strategy |
| `enable_summarization` | bool | `false` | Enable summarization strategy |

## Outputs

| Output | Description |
|--------|-------------|
| `memory_id` | ID of the AgentCore Memory resource |
| `memory_arn` | ARN of the AgentCore Memory resource |
| `memory_name` | Name of the AgentCore Memory resource |
| `semantic_strategy_id` | ID of semantic strategy (if enabled) |
| `user_preferences_strategy_id` | ID of user preferences strategy (if enabled) |
| `summarization_strategy_id` | ID of summarization strategy (if enabled) |

## Important Notes

### Memory Strategy Limits
- Maximum 6 strategies per memory resource
- Only one strategy of each built-in type (`SEMANTIC`, `SUMMARIZATION`, `USER_PREFERENCE`) per memory
- Multiple `CUSTOM` strategies allowed (subject to 6 total limit)

### Naming Constraints
- Memory names must match regex: `^[a-zA-Z][a-zA-Z0-9_]{0,47}$`
- Must start with a letter
- Can only contain letters, numbers, and underscores
- Maximum 48 characters

### Event Expiry
- Minimum: 7 days
- Maximum: 365 days
- Events are automatically deleted after expiry
- Long-term memory (extracted facts) never expires

## Using Memory in Agent Code

```python
from strands_agents import Agent
from strands_agents.models import BedrockModel

# Configure agent with memory
agent = Agent(
    name="market_surveillance_agent",
    model=BedrockModel(model_id="anthropic.claude-3-5-sonnet-20241022-v2:0"),
    memory_id="market_surveillance_memory_dev",  # From module output
    instructions="You are a market surveillance agent..."
)

# Memory is automatically used for:
# - Storing conversation history (STM)
# - Extracting facts about trades and alerts (LTM - Semantic)
# - Tracking user preferences (LTM - User Preferences, if enabled)
# - Creating summaries (LTM - Summarization, if enabled)
```

## Deployment

1. **Plan changes**:
   ```bash
   cd infrastructure
   terraform plan -target=module.memory
   ```

2. **Apply changes**:
   ```bash
   terraform apply -target=module.memory
   ```

3. **Verify deployment**:
   ```bash
   # Get memory ID
   terraform output memory_id
   
   # Check memory status using AgentCore CLI
   agentcore memory get <memory_id>
   ```

## References

- [AgentCore Memory Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agentcore-memory.html)
- [Terraform AWS Provider - bedrockagentcore_memory](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/bedrockagentcore_memory)
- [Terraform AWS Provider - bedrockagentcore_memory_strategy](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/bedrockagentcore_memory_strategy)
