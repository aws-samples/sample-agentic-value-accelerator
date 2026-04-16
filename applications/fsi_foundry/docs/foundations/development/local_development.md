# Local Development Guide

This guide covers setting up and running FSI Foundry locally for development and testing without deploying to AWS.

## Overview

Local development allows you to:
- Test agent logic without AWS deployment
- Debug with breakpoints and print statements
- Iterate quickly on code changes
- Avoid AWS costs during development
- Work offline (with cached Bedrock responses)

The application supports local development mode:
- **Local mode** - Runs on port 8000 with REST API for testing agent logic

---

## Prerequisites

- **Python 3.11 or higher**
- **pip** (Python package manager)
- **AWS credentials** (for Bedrock and S3 access)
- **Git** (for cloning the repository)

### Optional Tools

- **Docker** - For testing containerized deployment locally
- **virtualenv** or **venv** - For isolated Python environments
- **jq** - For pretty-printing JSON responses

---

## Quick Start

```bash
# 1. Clone the repository (if not already done)
git clone <repository-url>
cd financial-risk-assessment-poc

# 2. Set up Python environment
cd src
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements/requirements.txt

# 4. Configure environment variables
cp ../.env.example .env
# Edit .env with your AWS credentials and settings

# 5. Run the application
python main.py
```

The server will start on:
- **Port 8000** for local development (default)

---

## Detailed Setup

### Step 1: Python Environment

Create an isolated Python environment:

```bash
cd src

# Using venv (built-in)
python -m venv venv
source venv/bin/activate

# Or using virtualenv
virtualenv venv
source venv/bin/activate

# On Windows
venv\Scripts\activate
```

### Step 2: Install Dependencies

Install all required packages:

```bash
# Install base dependencies
pip install -r requirements/requirements.txt

# For development (includes testing, linting tools)
pip install -r requirements/requirements_dev.txt

# Verify installation
pip list | grep langchain
pip list | grep boto3
```

### Step 3: Configure Environment Variables

Create a `.env` file in the `src` directory:

```bash
cp ../.env.example .env
```

Edit `.env` with your settings:

```bash
# Deployment mode
DEPLOYMENT_MODE=local

# Agent selection
AGENT_NAME=kyc  # Which agent to run

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key

# Bedrock Configuration
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-20250514-v1:0

# S3 Configuration
S3_BUCKET_NAME=your-bucket-name

# Application Configuration
APP_ENV=development
LOG_LEVEL=INFO
```

**Important Notes:**
- Use inference profile IDs (with `us.` prefix) for Bedrock models
- Ensure your AWS credentials have permissions for Bedrock and S3
- The S3 bucket should contain test customer data

### Step 4: Prepare Test Data

Create sample customer data in S3:

```bash
# Create test data files
mkdir -p /tmp/test-data/customers/CUST001

# Create profile.json
cat > /tmp/test-data/customers/CUST001/profile.json << 'EOF'
{
  "customer_id": "CUST001",
  "company_name": "Acme Corporation",
  "industry": "Technology",
  "country": "United States",
  "registration_date": "2020-01-15"
}
EOF

# Create credit.json
cat > /tmp/test-data/customers/CUST001/credit.json << 'EOF'
{
  "credit_score": 750,
  "annual_revenue": 5000000,
  "debt_to_equity_ratio": 0.3,
  "payment_history": "excellent",
  "outstanding_debt": 500000
}
EOF

# Create compliance.json
cat > /tmp/test-data/customers/CUST001/compliance.json << 'EOF'
{
  "kyc_status": "verified",
  "aml_screening": "clear",
  "sanctions_check": "clear",
  "pep_status": "not_detected",
  "beneficial_owners": ["John Doe", "Jane Smith"]
}
EOF

# Upload to S3
aws s3 sync /tmp/test-data/ s3://your-bucket-name/
```

---

## Running the Application

### Local Development Mode

```bash
cd src
export DEPLOYMENT_MODE=local
export AGENT_NAME=kyc
python main.py
```

Output:
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

---

## Testing Locally

### Health Check

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "agent": "kyc_banking",
  "deployment_mode": "local",
  "timestamp": "2026-01-30T12:00:00Z"
}
```

### Full Assessment

```bash
curl -X POST http://localhost:8000/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUST001",
    "assessment_type": "full"
  }' | jq '.'
```

### Credit-Only Assessment

```bash
curl -X POST http://localhost:8000/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUST001",
    "assessment_type": "credit_only"
  }' | jq '.'
```

### Compliance-Only Assessment

```bash
curl -X POST http://localhost:8000/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUST001",
    "assessment_type": "compliance_only"
  }' | jq '.'
```

---

## Debugging

### Using Python Debugger

Add breakpoints in your code:

```python
# In src/agents/supervisor.py
def run_supervisor(state: dict) -> dict:
    import pdb; pdb.set_trace()  # Breakpoint
    # Your code here
```

Run with debugger:
```bash
python -m pdb main.py
```

### Using VS Code Debugger

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": [
        "main:app",
        "--reload",
        "--host", "0.0.0.0",
        "--port", "8000"
      ],
      "cwd": "${workspaceFolder}/src",
      "env": {
        "DEPLOYMENT_MODE": "local",
        "AGENT_NAME": "kyc_banking",
        "AWS_REGION": "us-east-1"
      },
      "console": "integratedTerminal"
    }
  ]
}
```

### Logging

Increase log verbosity:

```bash
export LOG_LEVEL=DEBUG
python main.py
```

View detailed logs:
```bash
# In your code
import logging
logger = logging.getLogger(__name__)
logger.debug("Detailed debug message")
logger.info("Info message")
logger.warning("Warning message")
logger.error("Error message")
```

---

## Development Workflow

### 1. Make Code Changes

Edit files in `src/`:
- `adapters/` - Deployment adapters (FastAPI, Lambda, AgentCore)
- `core/` - Registry and orchestration patterns
- `agents/` - Agent implementations (kyc, future agents)
- `tools/` - Tool implementations
- `config/` - Configuration

### 2. Test Changes Locally

```bash
# Restart the server (if not using --reload)
python main.py

# Test with curl
curl -X POST http://localhost:8000/invoke \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "CUST001", "assessment_type": "full"}'
```

### 3. Run Unit Tests (if available)

```bash
pytest tests/
```

### 4. Deploy to AWS

Once satisfied with local testing:

```bash
# Deploy to AgentCore
./applications/fsi_foundry/scripts/deploy/deploy_agentcore.sh
```

---

## Docker Local Testing

Test the application in a containerized environment locally:

### Build Docker Image

```bash
docker build --platform linux/amd64 \
  --build-arg DEPLOYMENT_MODE=local \
  -t ava:latest \
  .
```

### Run Docker Container

```bash
docker run -d \
  --name ava \
  -p 8000:8000 \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=your-key \
  -e AWS_SECRET_ACCESS_KEY=your-secret \
  -e BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-20250514-v1:0 \
  -e S3_BUCKET_NAME=your-bucket \
  -e AGENT_NAME=kyc \
  ava:latest
```

### Test Docker Container

```bash
curl http://localhost:8000/health

curl -X POST http://localhost:8000/invoke \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "CUST001", "assessment_type": "full"}'
```

### View Docker Logs

```bash
docker logs -f ava
```

### Stop Docker Container

```bash
docker stop ava
docker rm ava
```

---

## Troubleshooting

### Import Errors

**Symptom:** `ModuleNotFoundError: No module named 'langchain'`

**Solution:**
```bash
# Ensure virtual environment is activated
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements/requirements.txt
```

### AWS Credentials Not Found

**Symptom:** `NoCredentialsError: Unable to locate credentials`

**Solution:**
```bash
# Set environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret

# Or configure AWS CLI
aws configure
```

### Bedrock Access Denied

**Symptom:** `AccessDeniedException: User is not authorized to perform: bedrock:InvokeModel`

**Solution:**
- Ensure your AWS credentials have Bedrock permissions
- Verify the model is enabled in your AWS account
- Check the model ID is correct (use inference profile IDs)

### S3 Access Denied

**Symptom:** `AccessDenied: Access Denied`

**Solution:**
- Verify S3 bucket name is correct
- Ensure AWS credentials have S3 read permissions
- Check bucket policy allows your IAM user/role

### Port Already in Use

**Symptom:** `OSError: [Errno 48] Address already in use`

**Solution:**
```bash
# Find process using the port
lsof -i :8000

# Kill the process
kill -9 <PID>

# Or use a different port
uvicorn main:app --port 8001
```

---

## Best Practices

### 1. Use Virtual Environments

Always use virtual environments to isolate dependencies:
```bash
python -m venv venv
source venv/bin/activate
```

### 2. Keep Dependencies Updated

Regularly update dependencies:
```bash
pip install --upgrade -r requirements/requirements.txt
```

### 3. Use Environment Variables

Never hardcode credentials:
```python
# Bad
bedrock_model_id = "us.anthropic.claude-sonnet-4-20250514-v1:0"

# Good
bedrock_model_id = os.getenv("BEDROCK_MODEL_ID")
```

### 4. Test Locally First

Always test changes locally before deploying to AWS.

### 5. Use Logging

Add logging for debugging:
```python
import logging
logger = logging.getLogger(__name__)
logger.info("Processing assessment for customer: %s", customer_id)
```

### 6. Handle Errors Gracefully

```python
try:
    result = agent.run(input_data)
except Exception as e:
    logger.error("Agent execution failed: %s", str(e))
    raise
```

---

## Next Steps

- **[Testing Guide](../testing/testing.md)** - Test your local setup
- **[Deployment Guides](../deployment/)** - Deploy to AWS
- **[Architecture Documentation](../architecture/)** - Understand the system design

## Related Documentation

- [AgentCore Deployment](../deployment/deployment_agentcore.md)
- [Adding Applications](adding_applications.md)
- [Global Variables](global_variables.md)
