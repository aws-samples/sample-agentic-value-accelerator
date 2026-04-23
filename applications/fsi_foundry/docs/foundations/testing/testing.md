# Testing Guide

This guide covers testing procedures for AgentCore deployments in FSI Foundry.

## Overview

Testing approaches:
- **Automated test scripts** — Comprehensive test suites per use case
- **Manual API testing** — Direct invocation via AWS CLI
- **Control Plane testing** — Test Deployment drawer in the web UI
- **Local testing** — Test agent logic without AWS deployment

## Automated Testing

### AgentCore Runtime

**Prerequisites:** AWS CLI >= 2.28.9

```bash
./applications/fsi_foundry/scripts/use_cases/{USE_CASE_ID}/test/test_agentcore.sh
```

**Test Coverage:**
- Runtime status verification
- Full assessment (all agents)
- Partial assessments (individual agents)
- Invalid input handling
- Load test (5 concurrent requests)

**Expected Results:** All tests passing (100% success rate)

**Sample Output:**
```
========================================
AgentCore Runtime Test Script
========================================
Region: us-east-1

Step 1: Getting runtime details...
Runtime ARN: arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/...

========================================
Test 1: Full Assessment
========================================
✓ Full assessment PASSED

========================================
Test 2: Partial Assessment
========================================
✓ Partial assessment PASSED

========================================
Test 3: Invalid Input
========================================
✓ Invalid input handling PASSED

========================================
Test 4: Load Test (5 concurrent)
========================================
✓ Load test PASSED

========================================
Test Summary
========================================
Tests Passed: 4
Tests Failed: 0

Success Rate: 100%

All tests passed!
```

**Performance Characteristics:**
- First invocation (cold start): 10-30 seconds
- Subsequent invocations: ~15-55 seconds depending on assessment type
- Load test (5 concurrent): ~85 seconds

---

## Manual API Testing

### Get Runtime ARN

```bash
# From Terraform outputs
cd applications/fsi_foundry/foundations/iac/agentcore/runtime
RUNTIME_ARN=$(terraform output -raw agentcore_runtime_arn)
```

### Invoke Agent

```bash
PAYLOAD=$(echo -n '{"customer_id": "CUST001", "assessment_type": "full"}' | base64)

aws bedrock-agentcore invoke-agent-runtime \
  --agent-runtime-arn ${RUNTIME_ARN} \
  --payload "${PAYLOAD}" \
  --region us-east-1 \
  /tmp/response.json

cat /tmp/response.json | jq '.'
```

---

## Control Plane Testing

The Control Plane UI provides a **Test Deployment** drawer for each deployed use case:

1. Navigate to the deployment detail page
2. Click **Test Deployment**
3. Select a test entity and assessment type
4. Click **Run** — the UI invokes the agent and displays the result

The drawer supports three modes:
- **CLI** — Run against the deployed runtime with selectable entity and type
- **Script** — Execute the full test script with streaming output
- **Custom** — Edit a JSON payload and invoke directly

---

## Local Testing

Test the agent logic locally without deploying to AWS:

### Setup

```bash
export DEPLOYMENT_MODE=local
export AWS_REGION=us-east-1
export BEDROCK_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
export S3_BUCKET_NAME=your-bucket-name
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret

# Install dependencies
cd applications/fsi_foundry/foundations/src
pip install -r requirements/requirements.txt

# Run locally
python main.py
```

The server starts on **port 8000**.

### Test Locally

```bash
# Full assessment
curl -X POST http://localhost:8000/invoke \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "CUST001", "assessment_type": "full"}'
```

---

## Understanding Test Results

### Expected Response Format

```json
{
  "assessment_id": "uuid-here",
  "customer_id": "CUST001",
  "assessment_type": "full",
  "timestamp": "2026-01-30T12:00:00Z",
  "credit_analysis": {
    "risk_score": 75,
    "rating": "MEDIUM_RISK",
    "analysis": "Detailed credit analysis...",
    "recommendations": ["Recommendation 1", "Recommendation 2"]
  },
  "compliance_check": {
    "status": "COMPLIANT",
    "kyc_status": "VERIFIED",
    "analysis": "Detailed compliance analysis..."
  },
  "final_recommendation": {
    "decision": "APPROVE",
    "confidence": "HIGH",
    "reasoning": "Detailed reasoning..."
  }
}
```

---

## Troubleshooting

### Tests Timeout

**Possible causes:**
1. First invocation (cold start) — wait and retry
2. Bedrock throttling — reduce concurrent requests
3. Network issues — check AWS connectivity

### Invalid Input Test Fails

**Solution:**
- Verify S3 bucket has sample data uploaded
- Check IAM permissions for S3 and Bedrock access
- Review CloudWatch logs for errors

### Load Test Fails

**Solution:**
- Wait for container warm-up, then retry
- Check Bedrock rate limits
- Review AgentCore runtime logs in CloudWatch

---

## Performance Benchmarks

| Metric | AgentCore |
|--------|-----------|
| Cold start | +10-30s (first invocation only) |
| Partial assessment | ~15-16s |
| Full assessment | ~55s |
| Load test (5 concurrent) | ~85s |

**Optimization Tips:**
1. Reduce `max_tokens` in agent configurations
2. Use faster Bedrock models (e.g., Claude Haiku)
3. Implement caching for repeated requests
4. Accept cold start as trade-off for serverless auto-scaling

---

## Next Steps

- **[Cleanup Guide](../cleanup/cleanup.md)** — Remove deployed resources
- **[AgentCore Deployment Guide](../deployment/deployment_agentcore.md)** — Deployment instructions
- **[Architecture](../architecture/architecture_agentcore.md)** — AgentCore architecture design
