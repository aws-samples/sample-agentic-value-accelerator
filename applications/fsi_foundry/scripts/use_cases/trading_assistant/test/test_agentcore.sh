#!/bin/bash
set +e
USE_CASE_ID="${1:-trading_assistant}"; FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"; AWS_REGION="${AWS_REGION:-us-east-1}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AgentCore Test - Trading Assistant (${USE_CASE_ID_CFN})${NC}"
echo -e "${GREEN}Framework: ${FRAMEWORK} (${FRAMEWORK_SHORT})${NC}"
echo -e "${GREEN}========================================${NC}"
RUNTIME_DIR="$PROJECT_ROOT/applications/fsi_foundry/foundations/iac/agentcore/runtime"
USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")

REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')
STACK_NAME="ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"
RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' --output text 2>/dev/null || echo "")
[[ -z "$RUNTIME_ARN" ]] && echo -e "${RED}No Runtime ARN. Deploy first.${NC}" && exit 1
PASS=0; FAIL=0; TEMP_FILE=$(mktemp)
invoke_ac() {
    local payload=$1
    local response_file=$2
    local payload_base64=$(echo -n "${payload}" | base64)
    aws bedrock-agentcore invoke-agent-runtime \
        --agent-runtime-arn "$RUNTIME_ARN" \
        --payload "$payload_base64" \
        --region "$AWS_REGION" \
        "${response_file}" 2>/tmp/agentcore-invoke-error.log
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

# Test 1: Full analysis — validate all 3 agents ran and sample data referenced
echo -e "${YELLOW}Test 1: Full Analysis — validate agent outputs (TRADE001)${NC}"
invoke_ac '{"entity_id": "TRADE001", "analysis_type": "full"}'
RESPONSE=$(cat "$TEMP_FILE" 2>/dev/null)
# AgentCore returns Python repr, so check for key content
CHECKS=0
echo "$RESPONSE" | grep -q "TRADE001" && ((CHECKS++))
echo "$RESPONSE" | grep -qi "aapl\|nvda\|spy" && ((CHECKS++))
echo "$RESPONSE" | grep -qi "market_analyst\|market_analysis" && ((CHECKS++))
echo "$RESPONSE" | grep -qi "trade_idea\|execution_plan" && ((CHECKS++))
if [[ $CHECKS -ge 3 ]]; then
    echo -e "${GREEN}✓ Full analysis passed — entity_id + sample data + agents verified (${CHECKS}/4 checks)${NC}"; ((PASS++))
else echo -e "${RED}✗ Full analysis failed (${CHECKS}/4 checks)${NC}"; echo "$RESPONSE" | head -3; ((FAIL++)); fi

# Test 2: Market analysis only — verify routing
echo -e "${YELLOW}Test 2: Market Analysis Only — verify routing (TRADE001)${NC}"
invoke_ac '{"entity_id": "TRADE001", "analysis_type": "market_analysis"}'
RESPONSE=$(cat "$TEMP_FILE" 2>/dev/null)
if echo "$RESPONSE" | grep -q "TRADE001" && echo "$RESPONSE" | grep -qi "market"; then
    echo -e "${GREEN}✓ Market analysis routing passed${NC}"; ((PASS++))
else echo -e "${RED}✗ Market analysis failed${NC}"; ((FAIL++)); fi

rm -f "$TEMP_FILE"
echo -e "${GREEN}Results: ${PASS} passed, ${FAIL} failed${NC}"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
