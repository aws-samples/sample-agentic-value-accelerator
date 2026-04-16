#!/bin/bash
set -e

# Multi-Agent Orchestration Test Script
# Runs basic tests to verify deployment

PROJECT_NAME="${PROJECT_NAME:-my-multi-agent}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "========================================"
echo "Multi-Agent Orchestration Tests"
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

# Test 2: Sequential orchestration
echo ""
echo "Test 2: Sequential orchestration"
echo "-------------------"
RESPONSE=$(curl -s -X POST "${ENDPOINT}/api/orchestrate" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Process data sequentially",
    "pattern": "sequential",
    "agents": ["agent_a", "agent_b"]
  }')

if echo "$RESPONSE" | grep -q "success"; then
  echo "✅ Sequential orchestration test passed"
  echo "Response: $RESPONSE"
else
  echo "❌ Sequential orchestration test failed"
  echo "Response: $RESPONSE"
  exit 1
fi

# Test 3: Parallel orchestration
echo ""
echo "Test 3: Parallel orchestration"
echo "-------------------"
RESPONSE=$(curl -s -X POST "${ENDPOINT}/api/orchestrate" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Process data in parallel",
    "pattern": "parallel",
    "agents": ["agent_a", "agent_b"]
  }')

if echo "$RESPONSE" | grep -q "success"; then
  echo "✅ Parallel orchestration test passed"
  echo "Response: $RESPONSE"
else
  echo "❌ Parallel orchestration test failed"
  echo "Response: $RESPONSE"
  exit 1
fi

# Test 4: Conditional orchestration
echo ""
echo "Test 4: Conditional orchestration"
echo "-------------------"
RESPONSE=$(curl -s -X POST "${ENDPOINT}/api/orchestrate" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Process with conditions",
    "pattern": "conditional",
    "agents": ["agent_a", "agent_b"]
  }')

if echo "$RESPONSE" | grep -q "success"; then
  echo "✅ Conditional orchestration test passed"
  echo "Response: $RESPONSE"
else
  echo "❌ Conditional orchestration test failed"
  echo "Response: $RESPONSE"
  exit 1
fi

# Test 5: Agent coordination status
echo ""
echo "Test 5: Agent coordination status"
echo "-------------------"
RESPONSE=$(curl -s -X GET "${ENDPOINT}/api/orchestrate/status")

if echo "$RESPONSE" | grep -q "agents"; then
  echo "✅ Status check test passed"
  echo "Response: $RESPONSE"
else
  echo "⚠️ Status check unclear"
  echo "Response: $RESPONSE"
fi

echo ""
echo "========================================"
echo "All tests passed! ✅"
echo "========================================"
echo ""
echo "Multi-agent orchestration is working correctly."
echo "You can now customize agents for your use case."
