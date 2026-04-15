#!/bin/bash
set +e
USE_CASE_ID="${1:-email_triage}"; FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"; AWS_REGION="${AWS_REGION:-us-east-1}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK"); RESOURCE_ID=$(normalize_use_case_to_id "$USE_CASE_ID" | tr '[:upper:]' '[:lower:]')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Step Functions Test - ${USE_CASE_ID} (${RESOURCE_ID})${NC}"
echo -e "${GREEN}Framework: ${FRAMEWORK} (${FRAMEWORK_SHORT})${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

IAC_DIR="$PROJECT_ROOT/applications/fsi_foundry/foundations/iac/step_functions"
pushd "$IAC_DIR" > /dev/null; terraform workspace select "${RESOURCE_ID}-${FRAMEWORK_SHORT}-${AWS_REGION}" 2>/dev/null
API_ENDPOINT=$(terraform output -raw api_endpoint 2>/dev/null || echo ""); popd > /dev/null
if [[ -z "$API_ENDPOINT" ]]; then echo -e "${RED}No API endpoint. Deploy first.${NC}"; exit 1; fi
PASS=0; FAIL=0

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 "${API_ENDPOINT}/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -1); BODY=$(echo "$RESPONSE" | sed '$d')
if [[ "$HTTP_CODE" == "200" ]] && echo "$BODY" | grep -q "healthy"; then
    echo -e "${GREEN}✓ Health check PASSED${NC}"; ((PASS++))
else echo -e "${RED}✗ Health check FAILED (HTTP $HTTP_CODE)${NC}"; ((FAIL++)); fi
echo ""

# Helper: invoke SF and wait for result
invoke_and_wait() {
    local payload="$1"
    local IR=$(curl -s --max-time 30 -X POST "${API_ENDPOINT}/invoke" -H "Content-Type: application/json" -d "$payload")
    local EXEC_ARN=$(echo "$IR" | python3 -c "import sys,json; print(json.load(sys.stdin).get('executionArn',''))" 2>/dev/null)
    if [[ -z "$EXEC_ARN" ]]; then echo "INVOKE_FAILED"; return; fi
    echo -e "${BLUE}  Execution: ${EXEC_ARN##*:}${NC}" >&2
    for i in $(seq 1 24); do
        local S=$(aws stepfunctions describe-execution --execution-arn "$EXEC_ARN" --region "$AWS_REGION" --query 'status' --output text 2>/dev/null)
        if [[ "$S" == "SUCCEEDED" ]]; then
            aws stepfunctions describe-execution --execution-arn "$EXEC_ARN" --region "$AWS_REGION" --query 'output' --output text 2>/dev/null
            return
        elif [[ "$S" == "FAILED" || "$S" == "TIMED_OUT" ]]; then echo "EXEC_${S}"; return; fi
        echo -n "." >&2; sleep 10
    done
    echo "EXEC_TIMEOUT"
}

# Test 2: Full Triage
echo -e "${YELLOW}Test 2: Full Email Triage (EMAIL001)${NC}"
echo -e "${BLUE}Note: SF execution may take 60-120s...${NC}"
OUTPUT=$(invoke_and_wait '{"entity_id":"EMAIL001","triage_type":"full"}')
echo ""
if [[ "$OUTPUT" == "INVOKE_FAILED" ]] || [[ "$OUTPUT" == EXEC_* ]]; then
    echo -e "${RED}✗ Full triage FAILED ($OUTPUT)${NC}"; ((FAIL++))
else
    ENTITY_ID=$(echo "$OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['body']['entity_id'])" 2>/dev/null)
    TRIAGE_ID=$(echo "$OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['body']['triage_id'])" 2>/dev/null)
    CLASSIFICATION=$(echo "$OUTPUT" | python3 -c "import sys,json; c=json.load(sys.stdin)['body'].get('classification'); print('present' if c else 'null')" 2>/dev/null)
    SUMMARY_LEN=$(echo "$OUTPUT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['body'].get('summary','')))" 2>/dev/null)
    if [[ "$ENTITY_ID" == "EMAIL001" ]] && [[ -n "$TRIAGE_ID" ]] && [[ "$CLASSIFICATION" == "present" ]] && [[ "$SUMMARY_LEN" -gt 50 ]]; then
        echo -e "${GREEN}✓ Full triage PASSED (classification present, summary ${SUMMARY_LEN} chars)${NC}"; ((PASS++))
    else echo -e "${RED}✗ Full triage FAILED (entity=$ENTITY_ID, classification=$CLASSIFICATION, summary_len=$SUMMARY_LEN)${NC}"; ((FAIL++)); fi
fi
echo ""

# Test 3: Classification Only
echo -e "${YELLOW}Test 3: Classification Only (EMAIL001)${NC}"
OUTPUT=$(invoke_and_wait '{"entity_id":"EMAIL001","triage_type":"classification"}')
echo ""
if [[ "$OUTPUT" == "INVOKE_FAILED" ]] || [[ "$OUTPUT" == EXEC_* ]]; then
    echo -e "${RED}✗ Classification only FAILED ($OUTPUT)${NC}"; ((FAIL++))
else
    ENTITY_ID=$(echo "$OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['body']['entity_id'])" 2>/dev/null)
    CLASSIFICATION=$(echo "$OUTPUT" | python3 -c "import sys,json; c=json.load(sys.stdin)['body'].get('classification'); print('present' if c else 'null')" 2>/dev/null)
    if [[ "$ENTITY_ID" == "EMAIL001" ]] && [[ "$CLASSIFICATION" == "present" ]]; then
        echo -e "${GREEN}✓ Classification only PASSED${NC}"; ((PASS++))
    else echo -e "${RED}✗ Classification only FAILED${NC}"; ((FAIL++)); fi
fi
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "Tests Passed: ${GREEN}${PASS}${NC}, Failed: ${RED}${FAIL}${NC}"
TOTAL=$((PASS + FAIL)); [[ $TOTAL -gt 0 ]] && echo -e "Success Rate: $((PASS * 100 / TOTAL))%"
echo -e "${GREEN}========================================${NC}"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
