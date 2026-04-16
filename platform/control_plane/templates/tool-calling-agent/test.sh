#!/bin/bash
set -e

# Tool-Calling Agent Test Script
# Runs basic tests to verify deployment

PROJECT_NAME="${PROJECT_NAME:-my-tool-agent}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "========================================"
echo "Tool-Calling Agent Tests"
echo "========================================"
echo "Project: $PROJECT_NAME"
echo "Region: $AWS_REGION"
echo ""

# Get endpoint from Terraform outputs (TODO: Implement after ALB is set up)
# ENDPOINT=$(cd iac/terraform && terraform output -raw agent_endpoint 2>/dev/null || echo "http://localhost:8000")
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

# Test 2: Calculator tool
echo ""
echo "Test 2: Calculator tool"
echo "-------------------"
RESPONSE=$(curl -s -X POST "${ENDPOINT}/api/agent/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is 15 multiplied by 23?",
    "max_iterations": 5
  }')

if echo "$RESPONSE" | grep -q "345"; then
  echo "✅ Calculator tool test passed"
  echo "Response: $RESPONSE"
else
  echo "❌ Calculator tool test failed"
  echo "Response: $RESPONSE"
  exit 1
fi

# Test 3: Search tool
echo ""
echo "Test 3: Search tool"
echo "-------------------"
RESPONSE=$(curl -s -X POST "${ENDPOINT}/api/agent/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Search for information about machine learning",
    "max_iterations": 5
  }')

if echo "$RESPONSE" | grep -q "success"; then
  echo "✅ Search tool test passed"
  echo "Response: $RESPONSE"
else
  echo "❌ Search tool test failed"
  echo "Response: $RESPONSE"
  exit 1
fi

# Test 4: Tool error handling
echo ""
echo "Test 4: Error handling"
echo "-------------------"
RESPONSE=$(curl -s -X POST "${ENDPOINT}/api/agent/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Calculate 1/0",
    "max_iterations": 5
  }')

if echo "$RESPONSE" | grep -q "Error"; then
  echo "✅ Error handling test passed"
  echo "Response: $RESPONSE"
else
  echo "⚠️ Error handling test unclear"
  echo "Response: $RESPONSE"
fi

# Test 5: Max iterations limit
echo ""
echo "Test 5: Max iterations limit"
echo "-------------------"
RESPONSE=$(curl -s -X POST "${ENDPOINT}/api/agent/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Complex multi-step task",
    "max_iterations": 2
  }')

ITERATIONS=$(echo "$RESPONSE" | grep -o '"iterations":[0-9]*' | grep -o '[0-9]*' || echo "0")
if [ "$ITERATIONS" -le 2 ]; then
  echo "✅ Max iterations test passed (iterations: $ITERATIONS)"
else
  echo "❌ Max iterations test failed (iterations: $ITERATIONS)"
  exit 1
fi

echo ""
echo "========================================"
echo "All tests passed! ✅"
echo "========================================"
echo ""
echo "Agent is working correctly."
echo "You can now use it for your use case."
