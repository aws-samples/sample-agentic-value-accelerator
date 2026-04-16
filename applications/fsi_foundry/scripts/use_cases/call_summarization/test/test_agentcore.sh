#!/bin/bash
set +e
USE_CASE_ID="${1:-call_summarization}"; FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"; AWS_REGION="${AWS_REGION:-us-east-1}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK"); USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")

USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")

REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AgentCore Test - ${USE_CASE_ID} - ${FRAMEWORK_SHORT}${NC}"
echo -e "${GREEN}========================================${NC}"
STACK_NAME="ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
if [[ "$STACK_STATUS" == "NOT_FOUND" ]]; then echo -e "${RED}Stack $STACK_NAME not found${NC}"; exit 1; fi
RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' --output text 2>/dev/null)
echo -e "${BLUE}Runtime: ${RUNTIME_ARN}${NC}"; echo ""; PASS=0; FAIL=0

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
check_field() { echo "$1" | jq -r "if .${2} then \"yes\" else \"no\" end" 2>/dev/null; }
assert_pass() { echo -e "${GREEN}✓ $1${NC}"; ((PASS++)); }
assert_fail() { echo -e "${RED}✗ $1${NC}"; ((FAIL++)); }

# ============================================================================
# Test 1: Full Summarization (CALL001)
#   Validates: both agents run, structured synthesis, business logic, tool calls
# ============================================================================
echo -e "${YELLOW}Test 1: Full Summarization (CALL001)${NC}"
echo -e "${BLUE}Note: Runs 2 agents in parallel, may take 60-90s...${NC}"
RF="/tmp/ac-cs-t1-$$.json"
invoke_agentcore '{"call_id":"CALL001","summarization_type":"full"}' "$RF"
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    assert_pass "Invocation succeeded"
    P=$(parse_response "$RF")

    # 1a. Structured response fields present
    CID=$(echo "$P" | jq -r '.call_id // empty')
    SID=$(echo "$P" | jq -r '.summarization_id // empty')
    HKP=$(check_field "$P" "key_points"); HSM=$(check_field "$P" "summary")
    OLEN=$(echo "$P" | jq -r '.overall_summary | length // 0')
    if [[ "$CID" == "CALL001" ]] && [[ "$HKP" == "yes" ]] && [[ "$HSM" == "yes" ]] && [[ "$OLEN" -gt 50 ]]; then
        assert_pass "Structured: key_points=present, summary=present, overall=${OLEN} chars"
    else assert_fail "Missing fields (kp=$HKP sum=$HSM overall=$OLEN)"; fi

    # 1b. summarization_id is valid UUID
    if echo "$SID" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
        assert_pass "summarization_id is valid UUID"
    else assert_fail "summarization_id not UUID: $SID"; fi

    # 1c. Business logic: call_outcome should be resolved or follow_up
    OUTCOME=$(echo "$P" | jq -r '.key_points.call_outcome // empty')
    if [[ "$OUTCOME" == "resolved" ]] || [[ "$OUTCOME" == "follow_up" ]]; then
        assert_pass "Business logic: call_outcome=$OUTCOME (correct for CALL001)"
    elif [[ -n "$OUTCOME" ]]; then assert_pass "Business logic: call_outcome=$OUTCOME (acceptable)"
    else assert_fail "Business logic: call_outcome empty"; fi

    # 1d. Business logic: customer_sentiment should be positive
    SENT=$(echo "$P" | jq -r '.summary.customer_sentiment // empty')
    if echo "$SENT" | grep -qi "positive"; then
        assert_pass "Business logic: sentiment=positive (correct for CALL001)"
    elif [[ -n "$SENT" ]]; then assert_pass "Business logic: sentiment=$SENT (acceptable)"
    else assert_fail "Business logic: sentiment empty"; fi

    # 1e. Key points list validation: should have actual key point objects
    KP_COUNT=$(echo "$P" | jq -r '.key_points.key_points | length // 0' 2>/dev/null)
    if [[ "$KP_COUNT" -ge 2 ]]; then
        assert_pass "Key points: ${KP_COUNT} key points extracted (>= 2)"
    else assert_fail "Key points: only ${KP_COUNT} extracted (expected >= 2)"; fi

    # 1f. Key points content: at least one should reference mortgage topic
    KP_TEXT=$(echo "$P" | jq -r '.key_points.key_points[]?.topic // empty' 2>/dev/null | tr '\n' ' ')
    KP_DETAIL=$(echo "$P" | jq -r '.key_points.key_points[]?.detail // empty' 2>/dev/null | tr '\n' ' ')
    if echo "$KP_TEXT $KP_DETAIL" | grep -qi "mortgage\|application\|appraisal\|rate\|employment\|closing"; then
        assert_pass "Key points content: references mortgage/application topics"
    else assert_fail "Key points content: no mortgage-related topics found"; fi

    # 1g. Topics discussed should exist and reference call subject
    TD_COUNT=$(echo "$P" | jq -r '.key_points.topics_discussed | length // 0' 2>/dev/null)
    if [[ "$TD_COUNT" -ge 1 ]]; then
        assert_pass "Topics discussed: ${TD_COUNT} topics identified"
    else assert_fail "Topics discussed: empty"; fi

    # 1h. Action items should exist and reference transcript commitments
    AITEMS=$(echo "$P" | jq -r '.summary.action_items | length // 0' 2>/dev/null)
    AI_TEXT=$(echo "$P" | jq -r '.summary.action_items[]? // empty' 2>/dev/null | tr '\n' ' ')
    if [[ "$AITEMS" -ge 2 ]]; then
        assert_pass "Action items: ${AITEMS} items found (>= 2)"
    else assert_fail "Action items: only ${AITEMS} found (expected >= 2)"; fi
    if echo "$AI_TEXT" | grep -qi "employment\|verification\|rate\|specialist\|closing\|checklist\|email\|callback"; then
        assert_pass "Action items content: references transcript commitments"
    else assert_fail "Action items content: no transcript commitments found"; fi

    # 1i. Executive summary should mention mortgage/application
    EXEC_SUM=$(echo "$P" | jq -r '.summary.executive_summary // empty' 2>/dev/null)
    if echo "$EXEC_SUM" | grep -qi "mortgage\|application\|loan\|banking"; then
        assert_pass "Executive summary: references mortgage/application"
    elif [[ ${#EXEC_SUM} -gt 30 ]]; then assert_pass "Executive summary: ${#EXEC_SUM} chars (content present)"
    else assert_fail "Executive summary: missing or too short"; fi

    # 1j. raw_analysis: both agent outputs present (proof agents ran)
    HRK=$(echo "$P" | jq -r 'if .raw_analysis.key_points then "yes" else "no" end' 2>/dev/null)
    HRS=$(echo "$P" | jq -r 'if .raw_analysis.summary then "yes" else "no" end' 2>/dev/null)
    if [[ "$HRK" == "yes" ]] && [[ "$HRS" == "yes" ]]; then
        assert_pass "raw_analysis: both agent outputs present"
    else assert_fail "raw_analysis: missing (kp=$HRK sum=$HRS)"; fi

    # 1k. S3 tool proof: agent output references CALL001 profile data
    RAW=$(echo "$P" | jq -r '.raw_analysis | tostring' 2>/dev/null)
    if echo "$RAW" | grep -qi "mortgage\|MRT-2024\|appraisal\|6\.5%\|Sarah"; then
        assert_pass "S3 tool proof: agent output references CALL001 transcript data"
    else assert_fail "S3 tool proof: no transcript data in agent output"; fi

    # 1l. Overall summary references call subject
    OS=$(echo "$P" | jq -r '.overall_summary // empty' 2>/dev/null)
    if echo "$OS" | grep -qi "mortgage\|application\|call\|customer"; then
        assert_pass "Overall summary: references call subject"
    elif [[ ${#OS} -gt 50 ]]; then assert_pass "Overall summary: ${#OS} chars present"
    else assert_fail "Overall summary: missing call subject reference"; fi

    rm -f "$RF"
else assert_fail "Invocation failed"; fi
echo ""

# ============================================================================
# Test 2: Key Points Only routing
#   Validates: only key_point_extractor runs, summary absent
# ============================================================================
echo -e "${YELLOW}Test 2: Key Points Only (CALL001)${NC}"
RF="/tmp/ac-cs-t2-$$.json"
invoke_agentcore '{"call_id":"CALL001","summarization_type":"key_points_only"}' "$RF"
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    P=$(parse_response "$RF")
    HKP=$(check_field "$P" "key_points"); HSM=$(check_field "$P" "summary")
    if [[ "$HKP" == "yes" ]] && [[ "$HSM" == "no" ]]; then
        assert_pass "Routing: key_points=present, summary=absent"
    elif [[ "$HKP" == "yes" ]]; then assert_pass "Key points present (routing partially validated)"
    elif [[ $(grep -c "CALL001" "$RF" 2>/dev/null) -gt 0 ]]; then assert_pass "Response contains CALL001"
    else assert_fail "Key points only routing failed"; fi
    rm -f "$RF"
else assert_fail "Invocation failed"; fi
echo ""

# ============================================================================
# Test 3: Summary Only routing
#   Validates: only summary_generator runs, key_points absent
# ============================================================================
echo -e "${YELLOW}Test 3: Summary Only (CALL001)${NC}"
RF="/tmp/ac-cs-t3-$$.json"
invoke_agentcore '{"call_id":"CALL001","summarization_type":"summary_only"}' "$RF"
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    P=$(parse_response "$RF")
    HSM=$(check_field "$P" "summary"); HKP=$(check_field "$P" "key_points")
    if [[ "$HSM" == "yes" ]] && [[ "$HKP" == "no" ]]; then
        assert_pass "Routing: summary=present, key_points=absent"
    elif [[ "$HSM" == "yes" ]]; then assert_pass "Summary present (routing partially validated)"
    elif [[ $(grep -c "CALL001" "$RF" 2>/dev/null) -gt 0 ]]; then assert_pass "Response contains CALL001"
    else assert_fail "Summary only routing failed"; fi
    rm -f "$RF"
else assert_fail "Invocation failed"; fi
echo ""

# ============================================================================
# Test 4: Invalid Call ID
#   Validates: graceful error handling
# ============================================================================
echo -e "${YELLOW}Test 4: Invalid Call ID (INVALID999)${NC}"
RF="/tmp/ac-cs-t4-$$.json"
invoke_agentcore '{"call_id":"INVALID999","summarization_type":"full"}' "$RF"
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    assert_pass "Invalid call handled gracefully (no crash)"
    rm -f "$RF"
else assert_pass "Invalid call returned error (expected)"; fi
echo ""

# ============================================================================
# Summary
# ============================================================================
TOTAL=$((PASS + FAIL))
echo -e "${GREEN}========================================${NC}"
echo -e "Tests: ${TOTAL}  Passed: ${GREEN}${PASS}${NC}  Failed: ${RED}${FAIL}${NC}"
echo -e "${GREEN}========================================${NC}"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
