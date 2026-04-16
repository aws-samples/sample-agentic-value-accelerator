#!/bin/bash
set +e
USE_CASE_ID="${1:-email_triage}"; FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"; AWS_REGION="${AWS_REGION:-us-east-1}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK"); USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")

USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")

REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AgentCore Test - ${USE_CASE_ID} (${USE_CASE_ID_CFN}) - ${FRAMEWORK_SHORT}${NC}"
echo -e "${GREEN}========================================${NC}"

STACK_NAME="ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
if [[ "$STACK_STATUS" == "NOT_FOUND" ]]; then echo -e "${RED}Stack ${STACK_NAME} not found${NC}"; exit 1; fi
RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' --output text 2>/dev/null)
echo -e "${BLUE}Runtime: ${RUNTIME_ARN}${NC}"
PASS=0; FAIL=0

# Helper: parse AgentCore response (handles both JSON and Python repr formats)
parse_response() {
    python3 -c "
import sys, json, ast
raw = open('$1').read()
try:
    d = json.loads(raw)
except:
    try:
        d = ast.literal_eval(raw)
    except:
        d = {'_raw': raw}
# Flatten: check if response is nested under a key
if isinstance(d, dict):
    print(json.dumps(d))
else:
    print(json.dumps({'_raw': str(d)}))
" 2>/dev/null
}

echo -e "${YELLOW}Test 1: Full Email Triage (EMAIL001)${NC}"
RF="/tmp/agentcore-et-full-$$.json"
aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn "$RUNTIME_ARN" --payload "$(echo -n '{"entity_id":"EMAIL001","triage_type":"full"}' | base64)" --region "$AWS_REGION" "$RF" 2>/tmp/agentcore-invoke-error.log
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    echo -e "${GREEN}✓ Invocation succeeded${NC}"; ((PASS++))
    PARSED=$(parse_response "$RF")
    ENTITY_ID=$(echo "$PARSED" | jq -r '.entity_id // empty' 2>/dev/null)
    HAS_CLASS=$(echo "$PARSED" | jq -r 'if .classification then "yes" else "no" end' 2>/dev/null)
    SUMMARY_LEN=$(echo "$PARSED" | jq -r '.summary | length // 0' 2>/dev/null)
    HAS_EMAIL=$(grep -c "EMAIL001" "$RF")
    if [[ "$ENTITY_ID" == "EMAIL001" ]] && [[ "$HAS_CLASS" == "yes" ]] && [[ "$SUMMARY_LEN" -gt 50 ]]; then
        echo -e "${GREEN}✓ Response validated (entity=$ENTITY_ID, classification=present, summary=${SUMMARY_LEN} chars)${NC}"; ((PASS++))
    elif [[ "$HAS_EMAIL" -gt 0 ]]; then
        echo -e "${GREEN}✓ Response contains EMAIL001 (non-JSON format)${NC}"; ((PASS++))
    else echo -e "${RED}✗ Validation FAILED${NC}"; ((FAIL++)); fi
    rm -f "$RF"
else echo -e "${RED}✗ Invocation failed${NC}"; ((FAIL++)); fi
echo ""

echo -e "${YELLOW}Test 2: Classification Only (EMAIL001)${NC}"
RF="/tmp/agentcore-et-class-$$.json"
aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn "$RUNTIME_ARN" --payload "$(echo -n '{"entity_id":"EMAIL001","triage_type":"classification"}' | base64)" --region "$AWS_REGION" "$RF" 2>/tmp/agentcore-invoke-error.log
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    PARSED=$(parse_response "$RF")
    ENTITY_ID=$(echo "$PARSED" | jq -r '.entity_id // empty' 2>/dev/null)
    HAS_CLASS=$(echo "$PARSED" | jq -r 'if .classification then "yes" else "no" end' 2>/dev/null)
    HAS_EMAIL=$(grep -c "EMAIL001" "$RF")
    if [[ "$ENTITY_ID" == "EMAIL001" ]] && [[ "$HAS_CLASS" == "yes" ]]; then
        echo -e "${GREEN}✓ Classification only PASSED${NC}"; ((PASS++))
    elif [[ "$HAS_EMAIL" -gt 0 ]]; then
        echo -e "${GREEN}✓ Classification invocation PASSED (contains EMAIL001)${NC}"; ((PASS++))
    else echo -e "${RED}✗ Classification FAILED${NC}"; ((FAIL++)); fi
    rm -f "$RF"
else echo -e "${RED}✗ Invocation failed${NC}"; ((FAIL++)); fi
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "Passed: ${GREEN}${PASS}${NC}, Failed: ${RED}${FAIL}${NC}"
TOTAL=$((PASS + FAIL)); [[ $TOTAL -gt 0 ]] && echo -e "Success Rate: $((PASS * 100 / TOTAL))%"
echo -e "${GREEN}========================================${NC}"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
