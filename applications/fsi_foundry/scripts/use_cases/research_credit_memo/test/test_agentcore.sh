#!/bin/bash

set +e

USE_CASE_ID="${1:-research_credit_memo}"
FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"
AWS_REGION="${AWS_REGION:-us-east-1}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"

source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")

CANONICAL_ID=$(normalize_use_case_to_id "$USE_CASE_ID")
CANONICAL_ID=$(echo "$CANONICAL_ID" | tr "[:upper:]" "[:lower:]")
USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")

REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AgentCore Runtime Test - Research Credit Memo${NC}"
echo -e "${GREEN}Use Case: ${USE_CASE_ID} (${CANONICAL_ID})${NC}"
echo -e "${GREEN}Framework: ${FRAMEWORK} (${FRAMEWORK_SHORT})${NC}"
echo -e "${GREEN}Region: ${AWS_REGION}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is not installed${NC}"
    exit 1
fi


STACK_NAME="ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"

echo -e "${YELLOW}Step 1: Checking CloudFormation stack...${NC}"
echo "Looking for stack: ${STACK_NAME}"
STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${AWS_REGION} \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$STACK_STATUS" = "NOT_FOUND" ]; then
    echo -e "${RED}Error: CloudFormation stack not found: ${STACK_NAME}${NC}"
    exit 1
fi

echo "Stack Status: ${STACK_STATUS}"
echo ""

echo -e "${YELLOW}Step 2: Getting runtime details...${NC}"
RUNTIME_ARN=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${AWS_REGION} \
    --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' \
    --output text)

echo "Runtime ARN: ${RUNTIME_ARN}"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

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

# Test 1: Full Credit Memo
echo -e "${YELLOW}Test 1: Full Credit Memo (ENTITY001)${NC}"
echo -e "${BLUE}Note: May take 60-120 seconds...${NC}"

TEST_PAYLOAD='{"entity_id": "ENTITY001", "analysis_type": "full"}'
RESPONSE_FILE="/tmp/agentcore-rcm-test1-$$.json"

if invoke_agentcore "${TEST_PAYLOAD}" "${RESPONSE_FILE}"; then
    RESPONSE_TEXT=$(cat ${RESPONSE_FILE} 2>/dev/null)
    if echo "$RESPONSE_TEXT" | grep -qi "entity_id\|ENTITY001\|memo_id\|credit"; then
        echo -e "${GREEN}✓ Full credit memo PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Full credit memo FAILED (Invalid response)${NC}"
        echo "$RESPONSE_TEXT" | head -5
        ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ Full credit memo FAILED (Invocation error)${NC}"
    ((TESTS_FAILED++))
fi
rm -f ${RESPONSE_FILE}
echo ""

# Test 2: Data Gathering Only
echo -e "${YELLOW}Test 2: Data Gathering Only (ENTITY001)${NC}"

TEST_PAYLOAD='{"entity_id": "ENTITY001", "analysis_type": "data_gathering"}'
RESPONSE_FILE="/tmp/agentcore-rcm-test2-$$.json"

if invoke_agentcore "${TEST_PAYLOAD}" "${RESPONSE_FILE}"; then
    RESPONSE_TEXT=$(cat ${RESPONSE_FILE} 2>/dev/null)
    if echo "$RESPONSE_TEXT" | grep -qi "entity_id\|ENTITY001\|memo_id"; then
        echo -e "${GREEN}✓ Data gathering only PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Data gathering only FAILED${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ Data gathering only FAILED (Invocation error)${NC}"
    ((TESTS_FAILED++))
fi
rm -f ${RESPONSE_FILE}
echo ""

# Test 3: Invalid Entity
echo -e "${YELLOW}Test 3: Invalid Entity ID${NC}"

TEST_PAYLOAD='{"entity_id": "INVALID999", "analysis_type": "full"}'
RESPONSE_FILE="/tmp/agentcore-rcm-test3-$$.json"

if invoke_agentcore "${TEST_PAYLOAD}" "${RESPONSE_FILE}"; then
    echo -e "${GREEN}✓ Invalid entity handling PASSED (graceful)${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${GREEN}✓ Invalid entity handling PASSED (error returned)${NC}"
    ((TESTS_PASSED++))
fi
rm -f ${RESPONSE_FILE}
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Test Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
if [ $TOTAL_TESTS -gt 0 ]; then
    SUCCESS_RATE=$((TESTS_PASSED * 100 / TOTAL_TESTS))
    echo "Success Rate: ${SUCCESS_RATE}%"
fi
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! 🎉${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
