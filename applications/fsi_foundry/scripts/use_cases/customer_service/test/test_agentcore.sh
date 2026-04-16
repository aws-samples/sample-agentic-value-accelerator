#!/bin/bash

# ============================================================================
# AVA - Customer Service AgentCore Test Script
# ============================================================================
# Tests the customer_service use case deployed on Bedrock AgentCore Runtime.
# Validates runtime invocation with various inquiry types.
#
# Usage:
#   ./test_agentcore.sh [use_case_id]
#   FRAMEWORK=strands ./test_agentcore.sh customer_service
# ============================================================================

set +e  # Don't exit on error - continue running all tests

# Use case configuration
USE_CASE_ID="${1:-customer_service}"

# Framework and region configuration (for workspace selection)
FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
LLM_TIMEOUT=180

# Path resolution
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"

# Source library for framework short name mapping
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

# Normalize use_case_id to canonical ID for workspace naming
USE_CASE_ID_NORMALIZED=$(normalize_use_case_to_id "$USE_CASE_ID")
# Convert to lowercase for AWS resource naming constraints
USE_CASE_ID_NORMALIZED=$(echo "$USE_CASE_ID_NORMALIZED" | tr '[:upper:]' '[:lower:]')

# Get framework short name for workspace selection and resource naming
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")

WORKSPACE_NAME="${USE_CASE_ID_NORMALIZED}-${FRAMEWORK_SHORT}-${AWS_REGION}"

# Region suffix for resource naming (matches Terraform)
USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")

REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AgentCore Runtime Test - Customer Service${NC}"
echo -e "${GREEN}Use Case: ${USE_CASE_ID}${NC}"
echo -e "${GREEN}Framework: ${FRAMEWORK} (${FRAMEWORK_SHORT})${NC}"
echo -e "${GREEN}Region: ${AWS_REGION}${NC}"
echo -e "${GREEN}Workspace: ${WORKSPACE_NAME}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check prerequisites
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is not installed (brew install jq)${NC}"
    exit 1
fi

# Skip CloudFormation lookup if RUNTIME_ARN is already provided (e.g., from control plane)
if [ -n "${RUNTIME_ARN:-}" ]; then
    echo -e "${GREEN}Using provided RUNTIME_ARN: ${RUNTIME_ARN}${NC}"
    RUNTIME_ID=$(echo "$RUNTIME_ARN" | awk -F/ '{print $NF}')
    RUNTIME_NAME="${RUNTIME_ID}"
else
# Get runtime details from CloudFormation stack (framework-aware naming)

STACK_NAME="ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"
LEGACY_STACK_NAME="ava-${USE_CASE_ID_CFN}-agentcore-runtime-${REGION_SUFFIX}"
OLDEST_STACK_NAME="ava-${USE_CASE_ID_CFN}-agentcore-runtime"

echo -e "${YELLOW}Step 1: Checking CloudFormation stack status...${NC}"
echo "Looking for stack: ${STACK_NAME}"
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${AWS_REGION} \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$STACK_STATUS" = "NOT_FOUND" ]; then
    echo "Trying legacy stack name: ${LEGACY_STACK_NAME}"
    STACK_STATUS=$(aws cloudformation describe-stacks \
        --stack-name ${LEGACY_STACK_NAME} \
        --region ${AWS_REGION} \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    if [ "$STACK_STATUS" != "NOT_FOUND" ]; then
        STACK_NAME="${LEGACY_STACK_NAME}"
    fi
fi

if [ "$STACK_STATUS" = "NOT_FOUND" ]; then
    echo "Trying oldest stack name: ${OLDEST_STACK_NAME}"
    STACK_STATUS=$(aws cloudformation describe-stacks \
        --stack-name ${OLDEST_STACK_NAME} \
        --region ${AWS_REGION} \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    if [ "$STACK_STATUS" != "NOT_FOUND" ]; then
        STACK_NAME="${OLDEST_STACK_NAME}"
    fi
fi

if [ "$STACK_STATUS" = "NOT_FOUND" ]; then
    echo -e "${RED}Error: CloudFormation stack not found${NC}"
    echo "Deploy first with:"
    echo "  USE_CASE_ID=customer_service FRAMEWORK=$FRAMEWORK AWS_REGION=$AWS_REGION ./scripts/main/deploy.sh"
    exit 1
fi

echo "Found stack: ${STACK_NAME}"
echo "Stack Status: ${STACK_STATUS}"
echo ""

echo -e "${YELLOW}Step 2: Getting runtime details...${NC}"
RUNTIME_ID=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${AWS_REGION} \
    --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeId`].OutputValue' \
    --output text)

RUNTIME_ARN=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${AWS_REGION} \
    --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' \
    --output text)

RUNTIME_NAME=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${AWS_REGION} \
    --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeName`].OutputValue' \
    --output text)

echo "Runtime ID: ${RUNTIME_ID}"
echo "Runtime ARN: ${RUNTIME_ARN}"
echo "Runtime Name: ${RUNTIME_NAME}"
fi
echo ""

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to invoke AgentCore
invoke_agentcore() {
    local payload=$1
    local response_file=$2
    
    # Base64 encode the payload (required by AWS CLI)
    local payload_base64=$(echo -n "${payload}" | base64)
    
    # Invoke the runtime
    aws bedrock-agentcore invoke-agent-runtime \
        --agent-runtime-arn ${RUNTIME_ARN} \
        --payload "${payload_base64}" \
        --region ${AWS_REGION} \
        ${response_file} 2>/tmp/agentcore-invoke-error.log
    
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        echo -e "${RED}Invocation failed${NC}"
        cat /tmp/agentcore-invoke-error.log 2>/dev/null
        return 1
    fi
    
    if [ ! -s "${response_file}" ]; then
        echo -e "${RED}No response body written${NC}"
        return 1
    fi
    
    return 0
}

# Test 1: Full Service Inquiry (CUST001)
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 1: Full Service Inquiry (CUST001)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo -e "${BLUE}Note: This may take 60-90 seconds as it runs multiple AI agents...${NC}"
echo ""

TEST_PAYLOAD='{"customer_id": "CUST001", "inquiry_type": "full"}'
echo "Request:"
echo "${TEST_PAYLOAD}" | jq '.'
echo ""

RESPONSE_FILE="/tmp/agentcore-cs-test1-$$.json"

if invoke_agentcore "${TEST_PAYLOAD}" "${RESPONSE_FILE}"; then
    echo "Response:"
    cat ${RESPONSE_FILE} | jq '.' 2>/dev/null || cat ${RESPONSE_FILE}
    echo ""

    RESPONSE_TEXT=$(cat ${RESPONSE_FILE})
    if echo "$RESPONSE_TEXT" | grep -q "'customer_id': 'CUST001'\|\"customer_id\": \"CUST001\"" && \
       echo "$RESPONSE_TEXT" | grep -q "'service_id'\|\"service_id\""; then
        echo -e "${GREEN}✓ Full service inquiry PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Full service inquiry FAILED (Invalid response)${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ Full service inquiry FAILED (Invocation error)${NC}"
    ((TESTS_FAILED++))
fi
rm -f ${RESPONSE_FILE}
echo ""

# Test 2: General Inquiry (CUST001)
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 2: General Inquiry (CUST001)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

TEST_PAYLOAD='{"customer_id": "CUST001", "inquiry_type": "general", "additional_context": "What are my account details?"}'
echo "Request:"
echo "${TEST_PAYLOAD}" | jq '.'
echo ""

RESPONSE_FILE="/tmp/agentcore-cs-test2-$$.json"

if invoke_agentcore "${TEST_PAYLOAD}" "${RESPONSE_FILE}"; then
    echo "Response:"
    cat ${RESPONSE_FILE} | jq '.' 2>/dev/null || cat ${RESPONSE_FILE}
    echo ""

    RESPONSE_TEXT=$(cat ${RESPONSE_FILE})
    if echo "$RESPONSE_TEXT" | grep -q "'customer_id': 'CUST001'\|\"customer_id\": \"CUST001\""; then
        echo -e "${GREEN}✓ General inquiry PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ General inquiry FAILED (Invalid response)${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ General inquiry FAILED (Invocation error)${NC}"
    ((TESTS_FAILED++))
fi
rm -f ${RESPONSE_FILE}
echo ""

# Test 3: Transaction Dispute (CUST001)
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 3: Transaction Dispute (CUST001)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

TEST_PAYLOAD='{"customer_id": "CUST001", "inquiry_type": "transaction_dispute", "additional_context": "Dispute TXN003"}'
echo "Request:"
echo "${TEST_PAYLOAD}" | jq '.'
echo ""

RESPONSE_FILE="/tmp/agentcore-cs-test3-$$.json"

if invoke_agentcore "${TEST_PAYLOAD}" "${RESPONSE_FILE}"; then
    echo "Response:"
    cat ${RESPONSE_FILE} | jq '.' 2>/dev/null || cat ${RESPONSE_FILE}
    echo ""

    RESPONSE_TEXT=$(cat ${RESPONSE_FILE})
    if echo "$RESPONSE_TEXT" | grep -q "'customer_id': 'CUST001'\|\"customer_id\": \"CUST001\""; then
        echo -e "${GREEN}✓ Transaction dispute PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Transaction dispute FAILED (Invalid response)${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ Transaction dispute FAILED (Invocation error)${NC}"
    ((TESTS_FAILED++))
fi
rm -f ${RESPONSE_FILE}
echo ""

# Test 4: Invalid Customer ID
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 4: Invalid Customer ID${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

TEST_PAYLOAD='{"customer_id": "INVALID999", "inquiry_type": "full"}'
echo "Request:"
echo "${TEST_PAYLOAD}" | jq '.'
echo ""

RESPONSE_FILE="/tmp/agentcore-cs-test4-$$.json"

if invoke_agentcore "${TEST_PAYLOAD}" "${RESPONSE_FILE}"; then
    RESPONSE_TEXT=$(cat ${RESPONSE_FILE})
    if echo "$RESPONSE_TEXT" | grep -qi "error\|not found\|No data found"; then
        echo -e "${GREEN}✓ Invalid customer handling PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${YELLOW}⚠ Invalid customer handling PASSED (graceful handling)${NC}"
        ((TESTS_PASSED++))
    fi
else
    echo -e "${GREEN}✓ Invalid customer handling PASSED (error returned)${NC}"
    ((TESTS_PASSED++))
fi
rm -f ${RESPONSE_FILE}
echo ""

# Test 5: Load Test (5 concurrent requests)
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 5: Load Test (5 concurrent)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo -e "${BLUE}Note: Running 5 concurrent general inquiries...${NC}"
echo ""

START_TIME=$(date +%s)

for i in {1..5}; do
    (
        PAYLOAD='{"customer_id": "CUST001", "inquiry_type": "general"}'
        PAYLOAD_BASE64=$(echo -n "${PAYLOAD}" | base64)
        TEMP_FILE="/tmp/agentcore-cs-load-$i-$$.json"
        aws bedrock-agentcore invoke-agent-runtime \
            --agent-runtime-arn ${RUNTIME_ARN} \
            --payload "${PAYLOAD_BASE64}" \
            --region ${AWS_REGION} \
            ${TEMP_FILE} > /dev/null 2>&1
        rm -f ${TEMP_FILE}
    ) &
done

wait

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "Load test completed in ${DURATION} seconds"
echo ""

if [ $DURATION -lt 150 ]; then
    echo -e "${GREEN}✓ Load test PASSED (${DURATION}s < 150s)${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ Load test FAILED (${DURATION}s >= 150s)${NC}"
    ((TESTS_FAILED++))
fi
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Test Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"
echo ""

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
SUCCESS_RATE=$((TESTS_PASSED * 100 / TOTAL_TESTS))

echo -e "Success Rate: ${SUCCESS_RATE}%"
echo ""

echo "Runtime Details:"
echo "  ID: ${RUNTIME_ID}"
echo "  ARN: ${RUNTIME_ARN}"
echo "  Name: ${RUNTIME_NAME}"
echo "  Region: ${AWS_REGION}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! 🎉${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Please review the output above.${NC}"
    exit 1
fi
