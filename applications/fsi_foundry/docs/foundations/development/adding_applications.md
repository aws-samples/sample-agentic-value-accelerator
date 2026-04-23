# Adding New Applications

This guide explains how to add new FSI applications to the FSI Foundry platform.

## Overview

FSI Foundry uses a **registry-based approach** for managing use cases. The registry (`applications/fsi_foundry/data/registry/offerings.json`) is the **single source of truth** for all deployment configurations. Adding a new use case requires **only a registry update** - no custom deployment scripts are needed for standard use cases.

### Key Principles

- **Registry-Only Addition**: New use cases are added by updating the registry - generic scripts work automatically
- **No Custom Scripts Required**: Standard use cases deploy without any custom deployment code
- **Override Pattern for Customization**: Use override scripts only when custom deployment logic is needed
- **Consistent Variable Naming**: All scripts use canonical variables (USE_CASE_ID, FRAMEWORK, DEPLOYMENT_PATTERN)

## Quick Start

The simplest way to add a new use case:

1. Create application code in `applications/fsi_foundry/use_cases/{use_case_id}/src/{framework}/`
2. Add entry to `applications/fsi_foundry/data/registry/offerings.json`
3. Add sample data to `applications/fsi_foundry/data/samples/{use_case_id}/` (optional)
4. Deploy using generic scripts - no custom scripts needed!

```bash
# Deploy your new use case
export USE_CASE_ID="your_app"
export FRAMEWORK="langchain_langgraph"
export DEPLOYMENT_PATTERN="agentcore"
export AWS_REGION="us-west-2"
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh
```

**That's it!** The generic deployment scripts automatically:
- Read your use case configuration from the registry
- Validate framework and pattern support
- Create isolated Terraform workspace (`your_app-us-west-2`)
- Build and deploy to AgentCore Runtime
- Deploy infrastructure and application

## Required Directory Structure

Create your application under `applications/`:

```
applications/{use_case_id}/
├── src/                           # Application source code (REQUIRED)
│   └── {framework}/               # Framework-specific implementation
│       ├── agents/                # Specialist agents
│       │   ├── __init__.py
│       │   └── your_agent.py
│       ├── __init__.py
│       ├── orchestrator.py        # Workflow orchestration
│       ├── models.py              # Data models
│       └── config.py              # Application configuration
│
├── scripts/                       # OPTIONAL: Override scripts
│   └── deploy_agentcore.sh        # Override for AgentCore deployment
│
└── README.md                      # Application documentation

applications/fsi_foundry/data/samples/{use_case_id}/        # OPTIONAL: Sample data
└── {entity_id}/
    └── data.json
```

### Directory Structure Summary

| Path | Required | Description |
|------|----------|-------------|
| `applications/fsi_foundry/use_cases/{use_case_id}/src/{framework}/` | **Yes** | Application source code |
| `applications/fsi_foundry/use_cases/{use_case_id}/scripts/` | No | Override scripts for custom deployment logic |
| `applications/fsi_foundry/data/samples/{use_case_id}/` | No | Sample data for testing |

**Important:** Deployment, test, and cleanup scripts are **optional**. The generic scripts in `applications/fsi_foundry/scripts/deploy/`, `applications/fsi_foundry/scripts/cleanup/`, and `applications/fsi_foundry/scripts/main/` work with any registered use case automatically.

## Step 1: Define Data Models

Create `src/langchain_langgraph/models.py`:

```python
from pydantic import BaseModel
from enum import Enum
from typing import Optional, List

class AssessmentType(str, Enum):
    FULL = "full"
    QUICK = "quick"

class YourRequest(BaseModel):
    """Request model for your application."""
    entity_id: str
    assessment_type: AssessmentType = AssessmentType.FULL

class YourResponse(BaseModel):
    """Response model for your application."""
    entity_id: str
    assessment_type: str
    risk_score: int
    risk_level: str
    recommendation: str
    findings: List[str]
    summary: str
```

## Step 2: Implement Agents

Create agents in `src/langchain_langgraph/agents/`:

```python
# your_agent.py
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage, SystemMessage

class YourAgent:
    """Agent for specific analysis."""
    
    def __init__(self, model_id: str):
        # Use ChatBedrockConverse for native tool calling support
        self.llm = ChatBedrockConverse(
            model_id=model_id,
            temperature=0.1,
            max_tokens=4096,
        )
        self.system_prompt = """You are an expert analyst..."""
    
    async def analyze(self, data: dict) -> dict:
        messages = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(content=f"Analyze: {data}")
        ]
        response = await self.llm.ainvoke(messages)
        # Handle potential list content blocks from ChatBedrockConverse
        content = response.content
        if isinstance(content, list):
            content = "\n".join(
                block.get("text", str(block)) if isinstance(block, dict) else str(block)
                for block in content
            )
        return self._parse_response(content)
    
    def _parse_response(self, content: str) -> dict:
        # Parse LLM response
        return {"findings": [], "risk_score": 0}
```

## Step 3: Create Orchestrator

Create `src/langchain_langgraph/orchestrator.py`:

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, List
from .agents.your_agent import YourAgent
from .models import YourRequest, YourResponse

class WorkflowState(TypedDict):
    entity_id: str
    assessment_type: str
    agent_results: dict
    final_result: dict

async def run_your_app(request: YourRequest) -> YourResponse:
    """Main entry point for your application."""
    
    # Initialize agents
    agent = YourAgent(model_id="us.anthropic.claude-haiku-4-5-20251001-v1:0")
    
    # Build workflow
    workflow = StateGraph(WorkflowState)
    
    async def analyze_step(state: WorkflowState) -> WorkflowState:
        result = await agent.analyze({"entity_id": state["entity_id"]})
        state["agent_results"] = result
        return state
    
    async def synthesize_step(state: WorkflowState) -> WorkflowState:
        state["final_result"] = {
            "risk_score": state["agent_results"]["risk_score"],
            "findings": state["agent_results"]["findings"]
        }
        return state
    
    workflow.add_node("analyze", analyze_step)
    workflow.add_node("synthesize", synthesize_step)
    workflow.add_edge("analyze", "synthesize")
    workflow.add_edge("synthesize", END)
    workflow.set_entry_point("analyze")
    
    # Execute
    app = workflow.compile()
    result = await app.ainvoke({
        "entity_id": request.entity_id,
        "assessment_type": request.assessment_type.value
    })
    
    return YourResponse(
        entity_id=request.entity_id,
        assessment_type=request.assessment_type.value,
        risk_score=result["final_result"]["risk_score"],
        risk_level="LOW" if result["final_result"]["risk_score"] < 50 else "HIGH",
        recommendation="APPROVE",
        findings=result["final_result"]["findings"],
        summary="Analysis complete."
    )
```

## Step 4: Register in offerings.json (Required)

The registry is the **single source of truth** for all use case configurations. Adding your use case to the registry is all that's needed for the generic deployment scripts to work.

Add your application to `applications/fsi_foundry/data/registry/offerings.json`:

```json
{
  "use_cases": [
    {
      "id": "your_app",
      "name": "Your Application Name",
      "description": "Description of your application",
      "application_path": "applications/fsi_foundry/use_cases/your_app",
      "data_path": "applications/fsi_foundry/data/samples/your_app",
      "supported_frameworks": ["langchain_langgraph"],
      "supported_patterns": ["agentcore"],
      "test_entities": ["ENTITY001", "ENTITY002"]
    }
  ],
  "frameworks": [
    {
      "id": "langchain_langgraph",
      "name": "LangChain + LangGraph",
      "short_name": "langgraph",
      "description": "Build agents with LangChain and orchestrate with LangGraph"
    }
  ],
  "deployment_patterns": [
    {
      "id": "agentcore",
      "name": "AgentCore Runtime",
      "description": "Serverless deployment on Bedrock AgentCore Runtime",
      "iac_path": "applications/fsi_foundry/foundations/iac/agentcore",
      "architecture": "arm64",
      "uses_docker": false
    }
  ]
}
```

### Registry Fields for Use Cases

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (lowercase, underscores allowed) |
| `name` | Yes | Display name for the use case |
| `description` | Yes | Brief description of the use case |
| `application_path` | Yes | Path to application code directory |
| `data_path` | Yes | Path to sample data directory |
| `supported_frameworks` | Yes | List of supported framework IDs |
| `supported_patterns` | Yes | List of supported deployment pattern IDs |
| `test_entities` | No | Sample entity IDs for testing |

### How the Registry Works

When you run a deployment:

1. **Validation**: Scripts validate your use case exists in the registry
2. **Framework Check**: Scripts verify the selected framework is in `supported_frameworks`
3. **Pattern Check**: Scripts verify the selected pattern is in `supported_patterns`
4. **Path Resolution**: Scripts use `application_path` to locate your code
5. **Automatic Configuration**: Docker images, Terraform workspaces, and resources are named automatically

**No code changes to deployment scripts are needed** - the registry drives everything.

## Step 5: Add Sample Data

Create sample data files in `applications/fsi_foundry/data/samples/your_app/`:

```
applications/fsi_foundry/data/samples/your_app/
└── ENTITY001/
    ├── profile.json
    └── data.json
```

Example `profile.json`:

```json
{
  "entity_id": "ENTITY001",
  "name": "Sample Entity",
  "type": "business",
  "created_date": "2024-01-15",
  "attributes": {
    "industry": "technology",
    "size": "medium"
  }
}
```

## Step 6: Deploy

Use the interactive CLI or command-line deployment:

```bash
# Interactive deployment
./applications/fsi_foundry/scripts/main/deploy.sh
# Select: your_app → langchain_langgraph → AgentCore → us-west-2

# Or command-line deployment
export USE_CASE_ID="your_app"
export FRAMEWORK="langchain_langgraph"
export DEPLOYMENT_PATTERN="agentcore"
export AWS_REGION="us-west-2"
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh
```

## Override Scripts (Optional)

The **override script pattern** allows use cases to customize deployment logic when the generic scripts don't meet specific requirements. This is an **optional** feature - most use cases should work with generic scripts alone.

### How Override Detection Works

When you run a deployment, the generic scripts check for override scripts in this order:

1. Check for override at: `applications/{USE_CASE_ID}/scripts/deploy_{DEPLOYMENT_PATTERN}.sh`
2. If override exists and is executable → **execute override script**
3. If no override exists → **execute generic script**

### Override Script Locations

```
applications/{use_case_id}/
└── scripts/
    └── deploy_agentcore.sh  # Override for AgentCore deployment
```

The naming convention is: `deploy_{DEPLOYMENT_PATTERN}.sh`

| Pattern | Override Script Name |
|---------|---------------------|
| agentcore | `deploy_agentcore.sh` |

### When to Use Override Scripts

Use override scripts **only** when you need:

- **Custom pre-deployment steps** (e.g., data migration, external API calls)
- **Non-standard infrastructure requirements** (e.g., additional AWS resources)
- **Custom post-deployment configuration** (e.g., seeding databases)
- **Integration with external systems** (e.g., notification services)
- **Modified deployment flow** (e.g., blue-green deployments)

**Do NOT use override scripts for:**
- Standard deployments (use generic scripts)
- Minor configuration changes (use environment variables)
- Framework-specific logic (implement in application code)

### Override Script Template

```bash
#!/bin/bash
# applications/your_app/scripts/deploy_agentcore.sh
# Override script for custom AgentCore deployment

set -e

# All canonical variables are exported by the calling script:
# - USE_CASE_ID        (e.g., "your_app")
# - FRAMEWORK          (e.g., "langchain_langgraph")
# - DEPLOYMENT_PATTERN (e.g., "agentcore")
# - AWS_REGION         (e.g., "us-west-2")
# - AWS_PROFILE        (e.g., "default")
# - PROJECT_ROOT       (absolute path to repository root)

echo "Running custom deployment for $USE_CASE_ID"

# Source library modules for reusable functions
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/common.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/variables.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/terraform.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

# ============================================
# Custom Pre-Deployment Steps
# ============================================
echo "Executing custom pre-deployment steps..."
# Your custom logic here (e.g., data migration, API calls)

# ============================================
# Standard Deployment (using library functions)
# ============================================

# Get framework short name for workspace naming
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")

# Select or create Terraform workspace with framework isolation
select_or_create_workspace "$USE_CASE_ID" "$FRAMEWORK_SHORT" "$AWS_REGION" "agentcore"

# Apply Terraform
apply_terraform "$USE_CASE_ID" "$FRAMEWORK_SHORT" "$AWS_REGION"

# ============================================
# Custom Post-Deployment Steps
# ============================================
echo "Executing custom post-deployment steps..."
# Your custom logic here (e.g., health checks, notifications)

echo "Custom deployment complete for $USE_CASE_ID"
```

### Override Script Requirements

1. **Shebang**: Must start with `#!/bin/bash`
2. **Executable**: Must have execute permission (`chmod +x`)
3. **Exit on Error**: Should include `set -e` for safety
4. **Use Library Functions**: Leverage `applications/fsi_foundry/scripts/lib/` modules for consistency
5. **Handle All Variables**: All canonical variables are pre-exported

### Testing Override Scripts

```bash
# Verify override is detected
export USE_CASE_ID="your_app"
export DEPLOYMENT_PATTERN="agentcore"

# Check if override exists
if [[ -f "applications/fsi_foundry/use_cases/$USE_CASE_ID/scripts/deploy_$DEPLOYMENT_PATTERN.sh" ]]; then
    echo "Override script found - will be used"
else
    echo "No override - generic script will be used"
fi
```

## Testing

Test your deployment using the generic test scripts:

```bash
# Interactive testing
./applications/fsi_foundry/scripts/main/test.sh

# Or with environment variables
export USE_CASE_ID="your_app"
export FRAMEWORK="langchain_langgraph"
export DEPLOYMENT_PATTERN="agentcore"
export AWS_REGION="us-west-2"
./scripts/test/test_agentcore.sh
```

## Cleanup

Clean up resources using the generic cleanup scripts:

```bash
# Interactive cleanup
./applications/fsi_foundry/scripts/main/cleanup.sh

# Or with environment variables
export USE_CASE_ID="your_app"
export FRAMEWORK="langchain_langgraph"
export DEPLOYMENT_PATTERN="agentcore"
export AWS_REGION="us-west-2"
./scripts/cleanup/cleanup_agentcore.sh
```

**Note:** Cleanup only destroys resources for the specified use case. Other use cases deployed to the same region are unaffected due to Terraform workspace isolation.

## Best Practices

1. **Use Registry-Only Approach** - Add use cases via registry, avoid custom scripts unless necessary
2. **Follow Naming Conventions** - Use lowercase IDs with underscores (e.g., `fraud_detection`)
3. **Use Canonical Variables** - Always use USE_CASE_ID, FRAMEWORK, DEPLOYMENT_PATTERN (see [Global Variables](global_variables.md))
4. **Document Thoroughly** - Include README with API examples and usage
5. **Add Test Data** - Provide varied test cases in `applications/fsi_foundry/data/samples/`
6. **Handle Errors Gracefully** - Return meaningful error messages from agents
7. **Leverage Library Functions** - Use `applications/fsi_foundry/scripts/lib/` modules in override scripts
8. **Test Before Deploying** - Validate registry entries and application code locally

## Example Applications

Reference the KYC application for a complete example:

- `applications/fsi_foundry/use_cases/kyc_banking/` - Full implementation
- `applications/fsi_foundry/use_cases/kyc_banking/README.md` - Documentation
- `applications/fsi_foundry/data/registry/offerings.json` - Registry entry
- `applications/fsi_foundry/data/samples/kyc/` - Sample customer data

## Troubleshooting

### Use Case Not Found

Ensure your use case is registered in `applications/fsi_foundry/data/registry/offerings.json`:

```bash
# Check if use case exists in registry
jq '.use_cases[] | select(.id == "your_app")' applications/fsi_foundry/data/registry/offerings.json

# Validate registry schema
./scripts/validate/check_variable_naming.sh
```

### Framework Not Supported

Check that the framework is listed in `supported_frameworks` for your use case:

```bash
# Check supported frameworks
jq '.use_cases[] | select(.id == "your_app") | .supported_frameworks' applications/fsi_foundry/data/registry/offerings.json
```

### Pattern Not Supported

Check that the deployment pattern is listed in `supported_patterns`:

```bash
# Check supported patterns
jq '.use_cases[] | select(.id == "your_app") | .supported_patterns' applications/fsi_foundry/data/registry/offerings.json
```

### Deployment Fails

1. Verify all paths in registry are correct
2. Check environment variables are set correctly
3. Ensure AWS credentials are configured
4. Review CloudWatch logs for errors
5. Check Terraform workspace state

```bash
# Verify environment variables
echo "USE_CASE_ID=$USE_CASE_ID"
echo "FRAMEWORK=$FRAMEWORK"
echo "DEPLOYMENT_PATTERN=$DEPLOYMENT_PATTERN"
echo "AWS_REGION=$AWS_REGION"

# Check Terraform workspace
cd applications/fsi_foundry/foundations/iac/ec2
terraform workspace list
```

### Override Script Not Detected

Ensure the override script:
- Is at the correct path: `applications/{USE_CASE_ID}/scripts/deploy_{DEPLOYMENT_PATTERN}.sh`
- Is executable: `chmod +x applications/your_app/scripts/deploy_agentcore.sh`
- Has correct shebang: `#!/bin/bash`
- Uses correct pattern name (e.g., `deploy_agentcore.sh`)

### Application Code Not Found

Verify the application path structure:

```bash
# Check application code exists
ls -la applications/your_app/src/langchain_langgraph/

# Verify orchestrator exists
ls -la applications/your_app/src/langchain_langgraph/orchestrator.py
```

## Related Documentation

- [Deployment Patterns](../deployment/deployment_patterns.md)
- [Global Variables](global_variables.md)
- [Registry Schema](../../../data/README.md)
