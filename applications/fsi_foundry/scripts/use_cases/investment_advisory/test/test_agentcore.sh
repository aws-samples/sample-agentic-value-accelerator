#!/bin/bash
set +e
USE_CASE_ID="${1:-investment_advisory}"
FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"
AWS_REGION="${AWS_REGION:-us-east-1}"
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
resource_id=$(normalize_use_case_to_id "$USE_CASE_ID")
resource_id=$(echo "$resource_id" | tr '[:upper:]' '[:lower:]')
WORKSPACE_NAME="${resource_id}-${FRAMEWORK_SHORT}-${AWS_REGION}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AgentCore Test: ${USE_CASE_ID} (${FRAMEWORK})${NC}"
echo -e "${GREEN}Workspace: ${WORKSPACE_NAME}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')
USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")

STACK_NAME="ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"
RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' --output text 2>/dev/null)
test -z "$RUNTIME_ARN" && { echo -e "${RED}Not deployed${NC}"; exit 1; }
echo -e "${GREEN}✓ Runtime: $RUNTIME_ARN${NC}"
echo ""

PASS=0; FAIL=0

# Test 1: Full Advisory - validate all agents ran and response fields
echo -e "${YELLOW}Test 1: Full Advisory (CLIENT001)${NC}"
echo -e "${BLUE}May take 60-120s...${NC}"
PAYLOAD=$(echo -n '{"client_id":"CLIENT001","advisory_type":"full"}' | base64)
aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn "$RUNTIME_ARN" --payload "$PAYLOAD" --region "$AWS_REGION" /tmp/ac_resp.json 2>/tmp/agentcore-invoke-error.log
if [ $? -eq 0 ] && [ -f /tmp/ac_resp.json ]; then
    # Parse the response (AgentCore returns Python repr, extract key fields)
    RESP=$(cat /tmp/ac_resp.json)
    HAS_CLIENT=$(echo "$RESP" | grep -c "CLIENT001")
    HAS_PORTFOLIO=$(echo "$RESP" | grep -ci "portfolio_analyst")
    HAS_MARKET=$(echo "$RESP" | grep -ci "market_researcher")
    HAS_PROFILER=$(echo "$RESP" | grep -ci "client_profiler")
    HAS_SUMMARY=$(echo "$RESP" | grep -ci "summary")
    if [ "$HAS_CLIENT" -gt 0 ] && [ "$HAS_PORTFOLIO" -gt 0 ] && [ "$HAS_MARKET" -gt 0 ] && [ "$HAS_PROFILER" -gt 0 ] && [ "$HAS_SUMMARY" -gt 0 ]; then
        echo -e "${GREEN}✓ PASSED (all 3 agents ran, summary present)${NC}"; ((PASS++))
    else
        echo -e "${RED}✗ FAILED (client=$HAS_CLIENT, pa=$HAS_PORTFOLIO, mr=$HAS_MARKET, cp=$HAS_PROFILER)${NC}"; ((FAIL++))
    fi
    rm -f /tmp/ac_resp.json
else
    echo -e "${RED}✗ FAILED (invoke error)${NC}"; ((FAIL++))
fi
echo ""

# Test 2: Portfolio Review Only - validate routing
echo -e "${YELLOW}Test 2: Portfolio Review Only (CLIENT001)${NC}"
echo -e "${BLUE}Only portfolio_analyst should run...${NC}"
PAYLOAD=$(echo -n '{"client_id":"CLIENT001","advisory_type":"portfolio_review"}' | base64)
aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn "$RUNTIME_ARN" --payload "$PAYLOAD" --region "$AWS_REGION" /tmp/ac_resp.json 2>/tmp/agentcore-invoke-error.log
if [ $? -eq 0 ] && [ -f /tmp/ac_resp.json ]; then
    RESP=$(cat /tmp/ac_resp.json)
    HAS_PA=$(echo "$RESP" | grep -c "portfolio_analyst\|portfolio_result")
    # For single-agent routing, market_researcher and client_profiler raw results should be None
    HAS_MR_NONE=$(echo "$RESP" | grep -c "'market_researcher_result': None\|'market_result': None\|'market_result': None")
    HAS_CP_NONE=$(echo "$RESP" | grep -c "'client_profiler_result': None\|'client_result': None\|'client_result': None")
    if [ "$HAS_PA" -gt 0 ] && [ "$HAS_MR_NONE" -gt 0 ] && [ "$HAS_CP_NONE" -gt 0 ]; then
        echo -e "${GREEN}✓ PASSED (only portfolio_analyst ran)${NC}"; ((PASS++))
    else
        echo -e "${RED}✗ FAILED (pa=$HAS_PA, mr_none=$HAS_MR_NONE, cp_none=$HAS_CP_NONE)${NC}"; ((FAIL++))
    fi
    rm -f /tmp/ac_resp.json
else
    echo -e "${RED}✗ FAILED (invoke error)${NC}"; ((FAIL++))
fi
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Results: ${PASS} passed, ${FAIL} failed${NC}"
echo -e "${GREEN}========================================${NC}"
[ $FAIL -eq 0 ] && exit 0 || exit 1
