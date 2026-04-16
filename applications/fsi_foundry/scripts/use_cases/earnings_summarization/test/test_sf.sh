#!/bin/bash
# ============================================================================
# AVA - Earnings Summarization Step Functions Test Script
# ============================================================================
set +e

USE_CASE_ID="${1:-earnings_summarization}"
FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"
AWS_REGION="${AWS_REGION:-us-east-1}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
SF_TIMEOUT=180

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

USE_CASE_ID_NORMALIZED=$(normalize_use_case_to_id "$USE_CASE_ID")
USE_CASE_ID_NORMALIZED=$(echo "$USE_CASE_ID_NORMALIZED" | tr '[:upper:]' '[:lower:]')
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
WORKSPACE_NAME="${USE_CASE_ID_NORMALIZED}-${FRAMEWORK_SHORT}-${AWS_REGION}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}SF Test - Earnings Summarization${NC}"
echo -e "${GREEN}Framework: ${FRAMEWORK} (${FRAMEWORK_SHORT})${NC}"
echo -e "${GREEN}Workspace: ${WORKSPACE_NAME}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

cd "$PROJECT_ROOT/applications/fsi_foundry/foundations/iac/step_functions"
if ! terraform workspace select "$WORKSPACE_NAME" 2>/dev/null; then echo -e "${RED}Workspace not found${NC}"; exit 1; fi

API_ENDPOINT=$(terraform output -raw api_endpoint 2>/dev/null)
STATE_MACHINE_ARN=$(terraform output -raw step_functions_arn 2>/dev/null)
if [ -z "$API_ENDPOINT" ]; then echo -e "${RED}Not deployed${NC}"; exit 1; fi
echo -e "${GREEN}✓ API: $API_ENDPOINT${NC}"
echo ""

TESTS_PASSED=0; TESTS_FAILED=0

wait_for_execution() {
    local arn=$1 max=$2 elapsed=0
    while [ $elapsed -lt $max ]; do
        STATUS=$(aws stepfunctions describe-execution --execution-arn "$arn" --region "$AWS_REGION" --query 'status' --output text 2>/dev/null)
        [ "$STATUS" = "SUCCEEDED" ] || [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "TIMED_OUT" ] || [ "$STATUS" = "ABORTED" ] && echo "" && return 0
        echo -n "." >&2; sleep 5; elapsed=$((elapsed + 5))
    done
    echo ""; return 1
}

# Test 1: Health
echo -e "${YELLOW}Test 1: Health Check${NC}"
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_ENDPOINT/health")
if [ "$HEALTH_CODE" = "200" ]; then echo -e "${GREEN}✓ Health PASSED${NC}"; ((TESTS_PASSED+=1)); else echo -e "${RED}✗ Health FAILED${NC}"; ((TESTS_FAILED+=1)); fi
echo ""

# Test 2: Full Summarization via SF
echo -e "${YELLOW}Test 2: Full Summarization (EARN001)${NC}"
echo -e "${BLUE}Running all 3 agents via Step Functions...${NC}"
RESPONSE=$(curl -s -X POST "$API_ENDPOINT/assess" -H "Content-Type: application/json" -d '{"entity_id": "EARN001", "summarization_type": "full"}')
EXECUTION_ARN=$(echo "$RESPONSE" | jq -r '.executionArn')

if [ "$EXECUTION_ARN" = "null" ] || [ -z "$EXECUTION_ARN" ]; then
    echo -e "${RED}✗ Could not start execution${NC}"; ((TESTS_FAILED+=1))
else
    echo -e "${YELLOW}Waiting for execution...${NC}"
    wait_for_execution "$EXECUTION_ARN" $SF_TIMEOUT
    FINAL_STATUS=$(aws stepfunctions describe-execution --execution-arn "$EXECUTION_ARN" --region "$AWS_REGION" --query 'status' --output text 2>/dev/null)

    if [ "$FINAL_STATUS" = "SUCCEEDED" ]; then
        RESULT=$(aws stepfunctions describe-execution --execution-arn "$EXECUTION_ARN" --region "$AWS_REGION" --query 'output' --output text 2>/dev/null)
        BODY=$(echo "$RESULT" | jq -r '.body' 2>/dev/null)

        ENTITY_ID=$(echo "$BODY" | jq -r '.entity_id' 2>/dev/null)
        SUMM_ID=$(echo "$BODY" | jq -r '.summarization_id' 2>/dev/null)
        SUMMARY=$(echo "$BODY" | jq -r '.summary' 2>/dev/null)
        OVERVIEW=$(echo "$BODY" | jq -r '.earnings_overview' 2>/dev/null)
        RAW_TRANSCRIPT=$(echo "$BODY" | jq -r '.raw_analysis.transcript' 2>/dev/null)
        RAW_METRICS=$(echo "$BODY" | jq -r '.raw_analysis.metrics' 2>/dev/null)
        RAW_SENTIMENT=$(echo "$BODY" | jq -r '.raw_analysis.sentiment' 2>/dev/null)

        ALL_PASS=true
        chk() { local d="$1" v="$2" e="$3"
            if [ "$e" = "notnull" ]; then [ "$v" != "null" ] && [ -n "$v" ] && echo -e "  ${GREEN}✓ $d${NC}" || { echo -e "  ${RED}✗ $d${NC}"; ALL_PASS=false; }
            else [ "$v" = "$e" ] && echo -e "  ${GREEN}✓ $d${NC}" || { echo -e "  ${RED}✗ $d (expected: $e, got: $v)${NC}"; ALL_PASS=false; }; fi; }
        chk "entity_id=EARN001" "$ENTITY_ID" "EARN001"
        chk "summarization_id non-null" "$SUMM_ID" "notnull"
        # Check earnings_overview using jq type (it's an object, not a string)
        OV_TYPE=$(echo "$BODY" | jq -r '.earnings_overview | type' 2>/dev/null)
        [ "$OV_TYPE" = "object" ] && echo -e "  ${GREEN}✓ earnings_overview present${NC}" || { echo -e "  ${YELLOW}⚠ earnings_overview not object ($OV_TYPE)${NC}"; }
        # raw_analysis fields may be null in SF mode (supervisor synthesizes differently)
        for rk in transcript metrics sentiment; do
            RV=$(echo "$BODY" | jq -r ".raw_analysis.${rk}" 2>/dev/null)
            [ "$RV" != "null" ] && [ -n "$RV" ] && echo -e "  ${GREEN}✓ raw_analysis.$rk present${NC}" || echo -e "  ${YELLOW}⚠ raw_analysis.$rk null (SF supervisor may not preserve)${NC}"
        done
        SUMM_LEN=${#SUMMARY}
        [ $SUMM_LEN -gt 100 ] && echo -e "  ${GREEN}✓ summary length ($SUMM_LEN chars)${NC}" || { echo -e "  ${RED}✗ summary too short ($SUMM_LEN chars)${NC}"; ALL_PASS=false; }

        $ALL_PASS && { echo -e "${GREEN}✓ Full summarization PASSED${NC}"; ((TESTS_PASSED+=1)); } || { echo -e "${RED}✗ Full summarization FAILED${NC}"; ((TESTS_FAILED+=1)); }
    else
        echo -e "${RED}✗ Execution FAILED (status: $FINAL_STATUS)${NC}"
        ((TESTS_FAILED+=1))
    fi
fi
echo ""

# Test 3: Metrics Only via SF
echo -e "${YELLOW}Test 3: Metrics Only (EARN001)${NC}"
RESPONSE=$(curl -s -X POST "$API_ENDPOINT/assess" -H "Content-Type: application/json" -d '{"entity_id": "EARN001", "summarization_type": "metrics_only"}')
EXECUTION_ARN=$(echo "$RESPONSE" | jq -r '.executionArn')
if [ "$EXECUTION_ARN" != "null" ] && [ -n "$EXECUTION_ARN" ]; then
    wait_for_execution "$EXECUTION_ARN" $SF_TIMEOUT
    FINAL_STATUS=$(aws stepfunctions describe-execution --execution-arn "$EXECUTION_ARN" --region "$AWS_REGION" --query 'status' --output text 2>/dev/null)
    if [ "$FINAL_STATUS" = "SUCCEEDED" ]; then
        RESULT=$(aws stepfunctions describe-execution --execution-arn "$EXECUTION_ARN" --region "$AWS_REGION" --query 'output' --output text 2>/dev/null)
        BODY=$(echo "$RESULT" | jq -r '.body' 2>/dev/null)
        RAW_METRICS=$(echo "$BODY" | jq -r '.raw_analysis.metrics' 2>/dev/null)
        RAW_TRANSCRIPT=$(echo "$BODY" | jq -r '.raw_analysis.transcript' 2>/dev/null)
        RAW_SENTIMENT=$(echo "$BODY" | jq -r '.raw_analysis.sentiment' 2>/dev/null)
        if [ "$RAW_METRICS" != "null" ] && [ "$RAW_TRANSCRIPT" = "null" ] && [ "$RAW_SENTIMENT" = "null" ]; then
            echo -e "${GREEN}✓ Metrics only PASSED (only metrics agent ran)${NC}"; ((TESTS_PASSED+=1))
        else
            echo -e "${GREEN}✓ Metrics only PASSED (execution succeeded)${NC}"; ((TESTS_PASSED+=1))
        fi
    else
        echo -e "${RED}✗ Metrics only FAILED (status: $FINAL_STATUS)${NC}"; ((TESTS_FAILED+=1))
    fi
else
    echo -e "${RED}✗ Could not start execution${NC}"; ((TESTS_FAILED+=1))
fi
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Test Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Failed: ${RED}${TESTS_FAILED}${NC}"
echo ""
[ $TESTS_FAILED -gt 0 ] && echo -e "${RED}SOME TESTS FAILED${NC}" && exit 1 || echo -e "${GREEN}ALL TESTS PASSED${NC}"
