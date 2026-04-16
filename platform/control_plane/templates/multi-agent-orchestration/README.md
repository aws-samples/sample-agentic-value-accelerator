# ${PROJECT_NAME} - Multi-Agent Orchestration System

A multi-agent system where specialized agents collaborate under an orchestrator to solve complex tasks.

## Overview

This project implements a multi-agent orchestration pattern where:
- **Orchestrator** coordinates multiple specialized agents
- **Agent A** handles specific domain tasks (TODO: customize)
- **Agent B** handles complementary tasks (TODO: customize)
- Agents communicate through a shared state
- Results are aggregated and processed

## Architecture

```
┌─────────────────┐
│  Orchestrator   │
│                 │
│  - Coordinates  │
│  - Routes tasks │
│  - Aggregates   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────┐
│Agent A│ │Agent B│
│       │ │       │
│Domain │ │Domain │
│Expert │ │Expert │
└───────┘ └───────┘
```

## Quick Start

### Prerequisites

- Python 3.11+
- AWS CLI configured
- Terraform installed (for infrastructure)
- Langfuse account (optional, for observability)

### Local Development

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Run locally:
   ```bash
   python -m src.main
   ```

### Deploy to AWS

1. Initialize Terraform:
   ```bash
   cd iac
   terraform init
   ```

2. Deploy infrastructure:
   ```bash
   terraform apply
   ```

3. Deploy application (automatically handled by Terraform)

## Customization Guide

### 1. Define Agent Responsibilities

Edit `src/langraph/agents/agent_a.py` and `src/langraph/agents/agent_b.py`:

```python
# TODO: Define what Agent A does
# Example: Credit analysis, document extraction, data validation

# TODO: Define what Agent B does
# Example: Compliance checking, risk assessment, verification
```

### 2. Implement Agent Logic

In each agent file:

```python
def execute(self, task: Dict) -> Dict:
    """
    TODO: Implement your agent's core logic

    Steps:
    1. Parse the task
    2. Process with your domain logic
    3. Return structured results
    """
    # Your implementation here
    pass
```

### 3. Configure Orchestration Flow

Edit `src/langraph/orchestrator.py`:

```python
# TODO: Define orchestration strategy
# Options:
# - Sequential: Agent A → Agent B
# - Parallel: Agent A || Agent B → Aggregate
# - Conditional: Route based on task type
```

### 4. Add Domain Tools

Create tools in `src/langraph/tools/`:

```python
# TODO: Add your domain-specific tools
# Examples:
# - Database queries
# - API integrations
# - Document parsers
# - Calculators
```

## Environment Variables

```bash
PROJECT_NAME=${PROJECT_NAME}
AWS_REGION=${AWS_REGION}
LANGFUSE_HOST=${LANGFUSE_HOST}
LANGFUSE_PUBLIC_KEY=${LANGFUSE_PUBLIC_KEY}
```

## Testing

```bash
# Run tests
pytest tests/

# Run with coverage
pytest tests/ --cov=src
```

## Monitoring

View traces and metrics in Langfuse:
- Navigate to your Langfuse dashboard
- View traces for each agent execution
- Monitor performance and errors
- Analyze agent collaboration patterns

## Example Use Cases

This pattern is ideal for:

1. **KYC Analysis**: Credit agent + Compliance agent
2. **Document Processing**: Extraction agent + Validation agent
3. **Customer Support**: Routing agent + Specialist agents
4. **Data Pipeline**: Collection agent + Processing agent + Storage agent

## FSI Kit Reference

This template is inspired by the KYC Banking application in AVA, which uses:
- Credit Analyst agent for financial analysis
- Compliance Officer agent for regulatory checks
- Orchestrator for coordinating the analysis workflow

See FSI Kit documentation for the complete implementation.

## Next Steps

1. ✅ Template generated with infrastructure
2. TODO: Implement agent logic in `src/langraph/agents/`
3. TODO: Configure orchestration in `src/langraph/orchestrator.py`
4. TODO: Add your domain tools in `src/langraph/tools/`
5. TODO: Test locally
6. TODO: Deploy to AWS
7. TODO: Monitor with Langfuse

## Support

For questions and issues, see the main AVA documentation.
