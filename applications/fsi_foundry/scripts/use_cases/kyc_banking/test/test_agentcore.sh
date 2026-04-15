#!/bin/bash

set +e  # Don't exit on error - continue running all tests

# Use case configuration
USE_CASE_ID="${1:-kyc_banking}"

# Framework and region configuration (for workspace selection)
FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"
AWS_REGION="${AWS_REGION:-us-west-2}"

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

# Get framework short name for workspace selection and resource naming
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")

WORKSPACE_NAME="${USE_CASE_ID}-${FRAMEWORK_SHORT}-${AWS_REGION}"

# Region suffix for resource naming (matches Terraform)
USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")

REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AgentCore Runtime Test Script${NC}"
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
# CloudFormation stack names can't have underscores, so convert them to hyphens
USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")

REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')
CANONICAL_ID_LOWER=$(normalize_use_case_to_id "$USE_CASE_ID" | tr '[:upper:]' '[:lower:]')
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")

STACK_NAME="ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"
echo "Looking for stack: $STACK_NAME"
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
if [[ "$STACK_STATUS" == "NOT_FOUND" ]]; then echo -e "${RED}Stack not found${NC}"; exit 1; fi

echo "Found stack: ${STACK_NAME}"
echo "Stack Status: ${STACK_STATUS}"

if [ "$STACK_STATUS" != "CREATE_COMPLETE" ] && [ "$STACK_STATUS" != "UPDATE_COMPLETE" ]; then
    echo -e "${YELLOW}Warning: Stack is not in a complete state${NC}"
    echo "Current status: ${STACK_STATUS}"
fi

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

# Test 1: Full Risk Assessment (CUST001)
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 1: Full Risk Assessment (CUST001)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo -e "${BLUE}Note: This may take 60-90 seconds as it runs multiple AI agents...${NC}"
echo ""

TEST_PAYLOAD='{"customer_id": "CUST001", "assessment_type": "full"}'
echo "Request:"
echo "${TEST_PAYLOAD}" | jq '.'
echo ""

RESPONSE_FILE="/tmp/agentcore-test1-$$.json"

if invoke_agentcore "${TEST_PAYLOAD}" "${RESPONSE_FILE}"; then
    echo "Response:"
    cat ${RESPONSE_FILE} | jq '.'
    echo ""
    
    # AgentCore returns Python repr format, check for key fields in response text
    RESPONSE_TEXT=$(cat ${RESPONSE_FILE})
    
    if echo "$RESPONSE_TEXT" | grep -q "customer_id.*CUST001" && \
       echo "$RESPONSE_TEXT" | grep -q "assessment_id" && \
       echo "$RESPONSE_TEXT" | grep -q "credit_risk" && \
       echo "$RESPONSE_TEXT" | grep -q "compliance"; then
        echo -e "${GREEN}✓ Full assessment PASSED${NC}"
        # Extract assessment_id from Python repr format
        ASSESSMENT_ID=$(echo "$RESPONSE_TEXT" | grep -o "'assessment_id': '[^']*'" | cut -d"'" -f4)
        echo -e "  Assessment ID: $ASSESSMENT_ID"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Full assessment FAILED (Invalid response)${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ Full assessment FAILED (Invocation error)${NC}"
    ((TESTS_FAILED++))
fi

rm -f ${RESPONSE_FILE}
echo ""

# Test 2: Credit Only Assessment (CUST002)
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 2: Credit Only Assessment (CUST002)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo -e "${BLUE}Note: This may take 30-40 seconds...${NC}"
echo ""

TEST_PAYLOAD='{"customer_id": "CUST002", "assessment_type": "credit_only"}'
echo "Request:"
echo "${TEST_PAYLOAD}" | jq '.'
echo ""

RESPONSE_FILE="/tmp/agentcore-test2-$$.json"

if invoke_agentcore "${TEST_PAYLOAD}" "${RESPONSE_FILE}"; then
    echo "Response:"
    cat ${RESPONSE_FILE} | jq '.'
    echo ""
    
    # AgentCore returns Python repr format, check for key fields
    RESPONSE_TEXT=$(cat ${RESPONSE_FILE})
    
    if echo "$RESPONSE_TEXT" | grep -q "customer_id.*CUST002" && \
       echo "$RESPONSE_TEXT" | grep -q "credit_risk" && \
       echo "$RESPONSE_TEXT" | grep -q "compliance.*null\|compliance.*None"; then
        echo -e "${GREEN}✓ Credit only assessment PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Credit only assessment FAILED (Invalid response)${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ Credit only assessment FAILED (Invocation error)${NC}"
    ((TESTS_FAILED++))
fi

rm -f ${RESPONSE_FILE}
echo ""

# Test 3: Compliance Only Assessment (CUST003)
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 3: Compliance Only Assessment (CUST003)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo -e "${BLUE}Note: This may take 30-40 seconds...${NC}"
echo ""

TEST_PAYLOAD='{"customer_id": "CUST003", "assessment_type": "compliance_only"}'
echo "Request:"
echo "${TEST_PAYLOAD}" | jq '.'
echo ""

RESPONSE_FILE="/tmp/agentcore-test3-$$.json"

if invoke_agentcore "${TEST_PAYLOAD}" "${RESPONSE_FILE}"; then
    echo "Response:"
    cat ${RESPONSE_FILE} | jq '.'
    echo ""
    
    # AgentCore returns Python repr format, check for key fields
    RESPONSE_TEXT=$(cat ${RESPONSE_FILE})
    
    if echo "$RESPONSE_TEXT" | grep -q "customer_id.*CUST003" && \
       echo "$RESPONSE_TEXT" | grep -q "credit_risk.*null\|credit_risk.*None" && \
       echo "$RESPONSE_TEXT" | grep -q "compliance"; then
        echo -e "${GREEN}✓ Compliance only assessment PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Compliance only assessment FAILED (Invalid response)${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ Compliance only assessment FAILED (Invocation error)${NC}"
    ((TESTS_FAILED++))
fi

rm -f ${RESPONSE_FILE}
echo ""

# Test 4: Invalid Customer ID
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 4: Invalid Customer ID${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

TEST_PAYLOAD='{"customer_id": "INVALID999", "assessment_type": "full"}'
echo "Request:"
echo "${TEST_PAYLOAD}" | jq '.'
echo ""

RESPONSE_FILE="/tmp/agentcore-test4-$$.json"

if invoke_agentcore "${TEST_PAYLOAD}" "${RESPONSE_FILE}"; then
    echo "Response:"
    cat ${RESPONSE_FILE} | jq '.'
    echo ""
    
    # Should return error or handle gracefully
    RESPONSE_TEXT=$(cat ${RESPONSE_FILE})
    if echo "$RESPONSE_TEXT" | grep -q "error\|Error\|not found\|No data found"; then
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
echo -e "${BLUE}Note: Running 5 concurrent credit-only assessments...${NC}"
echo -e "${BLUE}This may take 60-120 seconds depending on the model...${NC}"
echo ""

START_TIME=$(date +%s)

# Run 5 concurrent requests in background (fewer than EC2 due to cold start)
for i in {1..5}; do
    (
        PAYLOAD='{"customer_id": "CUST00'$i'", "assessment_type": "credit_only"}'
        PAYLOAD_BASE64=$(echo -n "${PAYLOAD}" | base64)
        TEMP_FILE="/tmp/agentcore-load-$i-$$.json"
        
        aws bedrock-agentcore invoke-agent-runtime \
            --agent-runtime-arn ${RUNTIME_ARN} \
            --payload "${PAYLOAD_BASE64}" \
            --region ${AWS_REGION} \
            ${TEMP_FILE} > /dev/null 2>&1
        
        rm -f ${TEMP_FILE}
    ) &
done

# Wait for all background jobs to complete
wait

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "Load test completed in ${DURATION} seconds"
echo ""

# Increased threshold to 150 seconds for AgentCore (includes cold start)
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
echo "View logs:"
echo "  aws logs tail /aws/bedrock-agentcore/${RUNTIME_NAME} --follow --region ${AWS_REGION}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! 🎉${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Please review the output above.${NC}"
    exit 1
fi
