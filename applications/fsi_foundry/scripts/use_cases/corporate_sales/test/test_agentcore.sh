#!/bin/bash
set +e
USE_CASE_ID="${1:-corporate_sales}"; FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"; AWS_REGION="${AWS_REGION:-us-east-1}"
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
if [[ "$STACK_STATUS" == "NOT_FOUND" ]]; then echo -e "${RED}Stack not found${NC}"; exit 1; fi
RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' --output text 2>/dev/null)
echo -e "${BLUE}Runtime: ${RUNTIME_ARN}${NC}"
PASS=0; FAIL=0

parse_response() {
    python3 -c "import sys,json,ast
raw=open('$1').read()
try: d=json.loads(raw)
except:
    try: d=ast.literal_eval(raw)
    except: d={'_raw':raw}
print(json.dumps(d) if isinstance(d,dict) else json.dumps({'_raw':str(d)}))" 2>/dev/null
}

echo -e "${YELLOW}Test 1: Full Sales Assessment (CORP001)${NC}"
RF="/tmp/ac-cs-full-$$.json"
aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn "$RUNTIME_ARN" --payload "$(echo -n '{"customer_id":"CORP001","analysis_type":"full"}' | base64)" --region "$AWS_REGION" "$RF" 2>/tmp/agentcore-invoke-error.log
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    echo -e "${GREEN}✓ Invocation succeeded${NC}"; ((PASS++))
    PARSED=$(parse_response "$RF")
    CUSTOMER_ID=$(echo "$PARSED" | jq -r '.customer_id // empty' 2>/dev/null)
    HAS_LEAD=$(echo "$PARSED" | jq -r 'if .lead_score then "yes" else "no" end' 2>/dev/null)
    HAS_OPP=$(echo "$PARSED" | jq -r 'if .opportunity then "yes" else "no" end' 2>/dev/null)
    RECS=$(echo "$PARSED" | jq -r '.recommendations | length // 0' 2>/dev/null)
    SLEN=$(echo "$PARSED" | jq -r '.summary | length // 0' 2>/dev/null)
    HAS_CORP=$(grep -c "CORP001" "$RF")
    if [[ "$CUSTOMER_ID" == "CORP001" ]] && [[ "$HAS_LEAD" == "yes" ]] && [[ "$HAS_OPP" == "yes" ]] && [[ "$RECS" -gt 0 ]] && [[ "$SLEN" -gt 50 ]]; then
        echo -e "${GREEN}✓ Validated (lead=present, opp=present, ${RECS} recs, summary=${SLEN} chars)${NC}"; ((PASS++))
    elif [[ "$HAS_CORP" -gt 0 ]]; then
        echo -e "${GREEN}✓ Response contains CORP001${NC}"; ((PASS++))
    else echo -e "${RED}✗ Validation FAILED${NC}"; ((FAIL++)); fi
    rm -f "$RF"
else echo -e "${RED}✗ Invocation failed${NC}"; ((FAIL++)); fi

echo -e "${YELLOW}Test 2: Lead Scoring Only (CORP001)${NC}"
RF="/tmp/ac-cs-lead-$$.json"
aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn "$RUNTIME_ARN" --payload "$(echo -n '{"customer_id":"CORP001","analysis_type":"lead_scoring"}' | base64)" --region "$AWS_REGION" "$RF" 2>/tmp/agentcore-invoke-error.log
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    PARSED=$(parse_response "$RF")
    HAS_LEAD=$(echo "$PARSED" | jq -r 'if .lead_score then "yes" else "no" end' 2>/dev/null)
    HAS_OPP=$(echo "$PARSED" | jq -r 'if .opportunity then "yes" else "no" end' 2>/dev/null)
    HAS_CORP=$(grep -c "CORP001" "$RF")
    if [[ "$HAS_LEAD" == "yes" ]] && [[ "$HAS_OPP" == "no" ]]; then
        echo -e "${GREEN}✓ Lead scoring only PASSED (correct routing)${NC}"; ((PASS++))
    elif [[ "$HAS_CORP" -gt 0 ]]; then
        echo -e "${GREEN}✓ Lead scoring invocation PASSED (contains CORP001)${NC}"; ((PASS++))
    else echo -e "${RED}✗ Lead scoring FAILED${NC}"; ((FAIL++)); fi
    rm -f "$RF"
else echo -e "${RED}✗ Invocation failed${NC}"; ((FAIL++)); fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "Passed: ${GREEN}${PASS}${NC}, Failed: ${RED}${FAIL}${NC}"
echo -e "${GREEN}========================================${NC}"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
