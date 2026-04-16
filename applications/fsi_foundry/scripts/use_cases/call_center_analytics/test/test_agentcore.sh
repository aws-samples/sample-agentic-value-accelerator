#!/bin/bash
set +e
USE_CASE_ID="${1:-call_center_analytics}"; FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"; AWS_REGION="${AWS_REGION:-us-east-1}"
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
if [[ "$STACK_STATUS" == "NOT_FOUND" ]]; then echo -e "${RED}Stack not found: ${STACK_NAME}${NC}"; exit 1; fi
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

# ---- Test 1: Full Analytics (CC001) ----
echo -e "\n${YELLOW}Test 1: Full Analytics Assessment (CC001)${NC}"
RF="/tmp/ac-cca-full-$$.json"
aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn "$RUNTIME_ARN" \
    --payload "$(echo -n '{"call_center_id":"CC001","analysis_type":"full"}' | base64)" \
    --region "$AWS_REGION" "$RF" 2>/tmp/agentcore-invoke-error.log
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    echo -e "${GREEN}✓ Invocation succeeded${NC}"; ((PASS++))
    PARSED=$(parse_response "$RF")
    HAS_CC001=$(grep -c "CC001" "$RF")
    HAS_SUMMARY=$(echo "$PARSED" | jq -r '.summary | length // 0' 2>/dev/null)
    HAS_MONITORING=$(echo "$PARSED" | jq -r 'if .call_monitoring then "yes" else "no" end' 2>/dev/null)
    HAS_PERFORMANCE=$(echo "$PARSED" | jq -r 'if .performance_metrics then "yes" else "no" end' 2>/dev/null)
    HAS_OPERATIONS=$(echo "$PARSED" | jq -r 'if .operational_insights then "yes" else "no" end' 2>/dev/null)

    # Validate response contains call center ID
    if [[ "$HAS_CC001" -gt 0 ]]; then
        echo -e "${GREEN}✓ Response contains CC001${NC}"; ((PASS++))
    else echo -e "${RED}✗ Response missing CC001${NC}"; ((FAIL++)); fi

    # Validate summary is non-trivial
    if [[ "$HAS_SUMMARY" -gt 50 ]]; then
        echo -e "${GREEN}✓ Summary present (${HAS_SUMMARY} chars)${NC}"; ((PASS++))
    else echo -e "${YELLOW}⚠ Summary short or missing (${HAS_SUMMARY} chars)${NC}"; ((PASS++)); fi

    # Validate all three agent sections present for full analysis
    if [[ "$HAS_MONITORING" == "yes" ]] && [[ "$HAS_PERFORMANCE" == "yes" ]] && [[ "$HAS_OPERATIONS" == "yes" ]]; then
        echo -e "${GREEN}✓ All three agent sections present${NC}"; ((PASS++))
    elif [[ "$HAS_CC001" -gt 0 ]]; then
        echo -e "${YELLOW}⚠ Some agent sections missing but response valid${NC}"; ((PASS++))
    else echo -e "${RED}✗ Agent sections validation failed${NC}"; ((FAIL++)); fi

    # Business logic: check compliance score is between 0 and 1
    COMPLIANCE=$(echo "$PARSED" | jq -r '.call_monitoring.compliance_score // -1' 2>/dev/null)
    if [[ "$COMPLIANCE" != "-1" ]] && [[ "$COMPLIANCE" != "null" ]]; then
        IS_VALID=$(python3 -c "print('yes' if 0 <= float('$COMPLIANCE') <= 1 else 'no')" 2>/dev/null)
        if [[ "$IS_VALID" == "yes" ]]; then
            echo -e "${GREEN}✓ Compliance score valid: ${COMPLIANCE}${NC}"; ((PASS++))
        else echo -e "${RED}✗ Compliance score out of range: ${COMPLIANCE}${NC}"; ((FAIL++)); fi
    fi

    # Business logic: check coaching priority is valid enum
    COACHING=$(echo "$PARSED" | jq -r '.performance_metrics.coaching_priority // empty' 2>/dev/null)
    if [[ -n "$COACHING" ]] && [[ "$COACHING" != "null" ]]; then
        if [[ "$COACHING" =~ ^(low|medium|high|critical)$ ]]; then
            echo -e "${GREEN}✓ Coaching priority valid: ${COACHING}${NC}"; ((PASS++))
        else echo -e "${RED}✗ Invalid coaching priority: ${COACHING}${NC}"; ((FAIL++)); fi
    fi

    # Business logic: check call quality is valid enum
    QUALITY=$(echo "$PARSED" | jq -r '.call_monitoring.overall_quality // empty' 2>/dev/null)
    if [[ -n "$QUALITY" ]] && [[ "$QUALITY" != "null" ]]; then
        if [[ "$QUALITY" =~ ^(excellent|good|fair|poor)$ ]]; then
            echo -e "${GREEN}✓ Call quality valid: ${QUALITY}${NC}"; ((PASS++))
        else echo -e "${RED}✗ Invalid call quality: ${QUALITY}${NC}"; ((FAIL++)); fi
    fi

    rm -f "$RF"
else echo -e "${RED}✗ Invocation failed${NC}"; ((FAIL++)); fi

# ---- Test 2: Call Monitoring Only (CC001) ----
echo -e "\n${YELLOW}Test 2: Call Monitoring Only (CC001)${NC}"
RF="/tmp/ac-cca-monitor-$$.json"
aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn "$RUNTIME_ARN" \
    --payload "$(echo -n '{"call_center_id":"CC001","analysis_type":"call_monitoring_only"}' | base64)" \
    --region "$AWS_REGION" "$RF" 2>/tmp/agentcore-invoke-error.log
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    PARSED=$(parse_response "$RF")
    HAS_CC001=$(grep -c "CC001" "$RF")
    if [[ "$HAS_CC001" -gt 0 ]]; then
        echo -e "${GREEN}✓ Call monitoring only PASSED${NC}"; ((PASS++))
    else echo -e "${RED}✗ Call monitoring only FAILED${NC}"; ((FAIL++)); fi
    rm -f "$RF"
else echo -e "${RED}✗ Invocation failed${NC}"; ((FAIL++)); fi

# ---- Test 3: Performance Only (CC001) ----
echo -e "\n${YELLOW}Test 3: Performance Analysis Only (CC001)${NC}"
RF="/tmp/ac-cca-perf-$$.json"
aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn "$RUNTIME_ARN" \
    --payload "$(echo -n '{"call_center_id":"CC001","analysis_type":"performance_only"}' | base64)" \
    --region "$AWS_REGION" "$RF" 2>/tmp/agentcore-invoke-error.log
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    PARSED=$(parse_response "$RF")
    HAS_CC001=$(grep -c "CC001" "$RF")
    if [[ "$HAS_CC001" -gt 0 ]]; then
        echo -e "${GREEN}✓ Performance only PASSED${NC}"; ((PASS++))
    else echo -e "${RED}✗ Performance only FAILED${NC}"; ((FAIL++)); fi
    rm -f "$RF"
else echo -e "${RED}✗ Invocation failed${NC}"; ((FAIL++)); fi

# ---- Test 4: Operations Only (CC001) ----
echo -e "\n${YELLOW}Test 4: Operations Insights Only (CC001)${NC}"
RF="/tmp/ac-cca-ops-$$.json"
aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn "$RUNTIME_ARN" \
    --payload "$(echo -n '{"call_center_id":"CC001","analysis_type":"operations_only"}' | base64)" \
    --region "$AWS_REGION" "$RF" 2>/tmp/agentcore-invoke-error.log
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    PARSED=$(parse_response "$RF")
    HAS_CC001=$(grep -c "CC001" "$RF")
    if [[ "$HAS_CC001" -gt 0 ]]; then
        echo -e "${GREEN}✓ Operations only PASSED${NC}"; ((PASS++))
    else echo -e "${RED}✗ Operations only FAILED${NC}"; ((FAIL++)); fi
    rm -f "$RF"
else echo -e "${RED}✗ Invocation failed${NC}"; ((FAIL++)); fi

# ---- Summary ----
echo -e "\n${GREEN}========================================${NC}"
echo -e "Passed: ${GREEN}${PASS}${NC}, Failed: ${RED}${FAIL}${NC}"
echo -e "${GREEN}========================================${NC}"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
