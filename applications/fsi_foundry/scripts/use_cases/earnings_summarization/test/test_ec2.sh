#!/bin/bash
# ============================================================================
# AVA - Earnings Summarization EC2 Test Script
# ============================================================================
set +e

USE_CASE_ID="${1:-earnings_summarization}"
FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"
AWS_REGION="${AWS_REGION:-us-east-1}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
LLM_TIMEOUT=180

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

USE_CASE_ID_NORMALIZED=$(normalize_use_case_to_id "$USE_CASE_ID")
USE_CASE_ID_NORMALIZED=$(echo "$USE_CASE_ID_NORMALIZED" | tr '[:upper:]' '[:lower:]')
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
WORKSPACE_NAME="${USE_CASE_ID_NORMALIZED}-${FRAMEWORK_SHORT}-${AWS_REGION}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}EC2 Test - Earnings Summarization${NC}"
echo -e "${GREEN}Framework: ${FRAMEWORK} (${FRAMEWORK_SHORT})${NC}"
echo -e "${GREEN}Workspace: ${WORKSPACE_NAME}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

if ! command -v curl &>/dev/null || ! command -v jq &>/dev/null; then echo -e "${RED}Error: curl and jq required${NC}"; exit 1; fi

cd "$PROJECT_ROOT/applications/fsi_foundry/foundations/iac/ec2"
if ! terraform workspace select "$WORKSPACE_NAME" 2>/dev/null; then echo -e "${RED}Workspace not found${NC}"; exit 1; fi

API_ENDPOINT=$(terraform output -raw api_endpoint 2>/dev/null)
if [ -z "$API_ENDPOINT" ]; then echo -e "${RED}Not deployed${NC}"; exit 1; fi
echo -e "${GREEN}✓ Endpoint: $API_ENDPOINT${NC}"
echo ""

TESTS_PASSED=0; TESTS_FAILED=0

# Helper: invoke and validate
invoke_and_check() {
    local test_name="$1" payload="$2"
    shift 2
    echo -e "${YELLOW}${test_name}${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST $API_ENDPOINT/invoke -H "Content-Type: application/json" -d "$payload")
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    echo "$BODY" | jq '.' 2>/dev/null | head -20
    echo "..."
    if [ "$HTTP_CODE" != "200" ]; then echo -e "${RED}✗ FAILED (HTTP $HTTP_CODE)${NC}\n"; ((TESTS_FAILED+=1)); return 1; fi
    # Run all validation checks passed as args
    local all_pass=true
    while [ $# -gt 0 ]; do
        local check_desc="$1" check_expr="$2"; shift 2
        if eval "$check_expr"; then
            echo -e "  ${GREEN}✓ $check_desc${NC}"
        else
            echo -e "  ${RED}✗ $check_desc${NC}"
            all_pass=false
        fi
    done
    if $all_pass; then echo -e "${GREEN}✓ ${test_name} PASSED${NC}"; ((TESTS_PASSED+=1)); else echo -e "${RED}✗ ${test_name} FAILED${NC}"; ((TESTS_FAILED+=1)); fi
    echo ""
}

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
HEALTH=$(curl -s $API_ENDPOINT/health)
STATUS=$(echo "$HEALTH" | jq -r '.status' 2>/dev/null)
AGENT=$(echo "$HEALTH" | jq -r '.agent' 2>/dev/null)
if [ "$STATUS" = "healthy" ] && [ "$AGENT" = "earnings_summarization" ]; then
    echo -e "${GREEN}✓ Health check PASSED (status=healthy, agent=earnings_summarization)${NC}"
    ((TESTS_PASSED+=1))
else
    echo -e "${RED}✗ Health check FAILED (status=$STATUS, agent=$AGENT)${NC}"
    ((TESTS_FAILED+=1))
fi
echo ""

# Test 2: Full Summarization (EARN001) - validate all agent results present
invoke_and_check "Test 2: Full Summarization (EARN001)" \
    '{"entity_id": "EARN001", "summarization_type": "full"}' \
    "entity_id is EARN001" '[ "$(echo "$BODY" | jq -r .entity_id)" = "EARN001" ]' \
    "summarization_id is non-null" '[ "$(echo "$BODY" | jq -r .summarization_id)" != "null" ]' \
    "summary is non-empty (>50 chars)" '[ ${#BODY} -gt 50 ] && [ "$(echo "$BODY" | jq -r .summary)" != "null" ]' \
    "earnings_overview is present" '[ "$(echo "$BODY" | jq -r .earnings_overview)" != "null" ]' \
    "earnings_overview.sentiment is set" '[ "$(echo "$BODY" | jq -r .earnings_overview.sentiment)" != "null" ]' \
    "raw_analysis.transcript is present" '[ "$(echo "$BODY" | jq -r .raw_analysis.transcript)" != "null" ]' \
    "raw_analysis.metrics is present" '[ "$(echo "$BODY" | jq -r .raw_analysis.metrics)" != "null" ]' \
    "raw_analysis.sentiment is present" '[ "$(echo "$BODY" | jq -r .raw_analysis.sentiment)" != "null" ]' \
    "recommendations is non-empty array" '[ "$(echo "$BODY" | jq '.recommendations | length')" -gt 0 ]'

# Test 3: Metrics Only - validate only metric agent ran
invoke_and_check "Test 3: Metrics Only (EARN001)" \
    '{"entity_id": "EARN001", "summarization_type": "metrics_only"}' \
    "entity_id is EARN001" '[ "$(echo "$BODY" | jq -r .entity_id)" = "EARN001" ]' \
    "raw_analysis.metrics is present" '[ "$(echo "$BODY" | jq -r .raw_analysis.metrics)" != "null" ]' \
    "raw_analysis.transcript is null" '[ "$(echo "$BODY" | jq -r .raw_analysis.transcript)" = "null" ]' \
    "raw_analysis.sentiment is null" '[ "$(echo "$BODY" | jq -r .raw_analysis.sentiment)" = "null" ]'

# Test 4: Sentiment Only - validate only sentiment agent ran
invoke_and_check "Test 4: Sentiment Only (EARN001)" \
    '{"entity_id": "EARN001", "summarization_type": "sentiment_only"}' \
    "entity_id is EARN001" '[ "$(echo "$BODY" | jq -r .entity_id)" = "EARN001" ]' \
    "raw_analysis.sentiment is present" '[ "$(echo "$BODY" | jq -r .raw_analysis.sentiment)" != "null" ]' \
    "raw_analysis.transcript is null" '[ "$(echo "$BODY" | jq -r .raw_analysis.transcript)" = "null" ]' \
    "raw_analysis.metrics is null" '[ "$(echo "$BODY" | jq -r .raw_analysis.metrics)" = "null" ]'

# Test 5: Transcript Only - validate only transcript agent ran
invoke_and_check "Test 5: Transcript Only (EARN001)" \
    '{"entity_id": "EARN001", "summarization_type": "transcript_only"}' \
    "entity_id is EARN001" '[ "$(echo "$BODY" | jq -r .entity_id)" = "EARN001" ]' \
    "raw_analysis.transcript is present" '[ "$(echo "$BODY" | jq -r .raw_analysis.transcript)" != "null" ]' \
    "raw_analysis.metrics is null" '[ "$(echo "$BODY" | jq -r .raw_analysis.metrics)" = "null" ]' \
    "raw_analysis.sentiment is null" '[ "$(echo "$BODY" | jq -r .raw_analysis.sentiment)" = "null" ]'

# Test 6: Invalid Entity - graceful handling
echo -e "${YELLOW}Test 6: Invalid Entity (INVALID999)${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST $API_ENDPOINT/invoke -H "Content-Type: application/json" -d '{"entity_id": "INVALID999", "summarization_type": "full"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "500" ] || [ "$HTTP_CODE" = "404" ]; then
    echo -e "${GREEN}✓ Invalid entity handled gracefully (HTTP $HTTP_CODE)${NC}"
    ((TESTS_PASSED+=1))
else
    echo -e "${RED}✗ Invalid entity FAILED (HTTP $HTTP_CODE)${NC}"
    ((TESTS_FAILED+=1))
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
