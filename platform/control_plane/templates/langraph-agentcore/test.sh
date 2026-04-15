#!/bin/bash
set -e

# LangGraph AgentCore Test Script
# Runs basic tests to verify deployment

PROJECT_NAME="${PROJECT_NAME:-my-langraph-agent}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "========================================"
echo "LangGraph AgentCore Tests"
echo "========================================"
echo "Project: $PROJECT_NAME"
echo "Region: $AWS_REGION"
echo ""

ENDPOINT="http://localhost:8000"
echo "Testing endpoint: $ENDPOINT"
echo ""

# Test 1: Health check
echo "Test 1: Health check"
echo "-------------------"
if curl -f -s "${ENDPOINT}/health" > /dev/null; then
  echo "✅ Health check passed"
else
  echo "❌ Health check failed"
  exit 1
fi

# Test 2: Agent invocation
echo ""
echo "Test 2: Agent invocation"
echo "-------------------"
RESPONSE=$(curl -s -X POST "${ENDPOINT}/api/agent/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Hello, can you help me?",
    "session_id": "test-session"
  }')

if echo "$RESPONSE" | grep -q "response"; then
  echo "✅ Agent invocation test passed"
  echo "Response: $RESPONSE"
else
  echo "❌ Agent invocation test failed"
  echo "Response: $RESPONSE"
  exit 1
fi

# Test 3: AgentCore connectivity
echo ""
echo "Test 3: AgentCore connectivity"
echo "-------------------"
RESPONSE=$(curl -s -X GET "${ENDPOINT}/api/agent/status")

if echo "$RESPONSE" | grep -q "status"; then
  echo "✅ AgentCore connectivity test passed"
  echo "Response: $RESPONSE"
else
  echo "❌ AgentCore connectivity test failed"
  echo "Response: $RESPONSE"
  exit 1
fi

echo ""
echo "========================================"
echo "All tests passed! ✅"
echo "========================================"
echo ""
echo "LangGraph agent is working correctly."
echo "You can now implement your business logic."
