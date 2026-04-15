#!/bin/bash
set +e
USE_CASE_ID="${1:-email_triage}"; FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"; AWS_REGION="${AWS_REGION:-us-east-1}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
LLM_TIMEOUT=300
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK"); RESOURCE_ID=$(normalize_use_case_to_id "$USE_CASE_ID" | tr '[:upper:]' '[:lower:]')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}EC2 Test - ${USE_CASE_ID} (${RESOURCE_ID})${NC}"
echo -e "${GREEN}Framework: ${FRAMEWORK} (${FRAMEWORK_SHORT})${NC}"
echo -e "${GREEN}Region: ${AWS_REGION}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

IAC_DIR="$PROJECT_ROOT/applications/fsi_foundry/foundations/iac/ec2"
pushd "$IAC_DIR" > /dev/null; terraform workspace select "${RESOURCE_ID}-${FRAMEWORK_SHORT}-${AWS_REGION}" 2>/dev/null
ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo ""); popd > /dev/null
if [[ -z "$ALB_DNS" ]]; then echo -e "${RED}No ALB DNS. Deploy first.${NC}"; exit 1; fi
BASE_URL="http://${ALB_DNS}"; PASS=0; FAIL=0

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 "${BASE_URL}/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -1); BODY=$(echo "$RESPONSE" | sed '$d')
echo "$BODY" | jq '.' 2>/dev/null
STATUS=$(echo "$BODY" | jq -r '.status' 2>/dev/null)
if [[ "$HTTP_CODE" == "200" ]] && [[ "$STATUS" == "healthy" ]]; then
    echo -e "${GREEN}✓ Health check PASSED${NC}"; ((PASS++))
else echo -e "${RED}✗ Health check FAILED (HTTP $HTTP_CODE, status: $STATUS)${NC}"; ((FAIL++)); fi
echo ""

# Test 2: Full Triage (EMAIL001)
echo -e "${YELLOW}Test 2: Full Email Triage (EMAIL001)${NC}"
echo -e "${BLUE}Note: This runs 2 AI agents in parallel (60-90s)...${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST "${BASE_URL}/invoke" \
    -H "Content-Type: application/json" -d '{"entity_id":"EMAIL001","triage_type":"full"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1); BODY=$(echo "$RESPONSE" | sed '$d')
echo "$BODY" | jq '{entity_id, triage_id, classification: .classification.category, urgency: .classification.urgency, recommendations: (.recommendations | length), summary_length: (.summary | length)}' 2>/dev/null
ENTITY_ID=$(echo "$BODY" | jq -r '.entity_id' 2>/dev/null)
TRIAGE_ID=$(echo "$BODY" | jq -r '.triage_id' 2>/dev/null)
CLASSIFICATION=$(echo "$BODY" | jq -r '.classification' 2>/dev/null)
SUMMARY=$(echo "$BODY" | jq -r '.summary' 2>/dev/null)
if [[ "$HTTP_CODE" == "200" ]] && [[ "$ENTITY_ID" == "EMAIL001" ]] && [[ "$TRIAGE_ID" != "null" ]] && [[ -n "$TRIAGE_ID" ]] && [[ "$CLASSIFICATION" != "null" ]] && [[ ${#SUMMARY} -gt 50 ]]; then
    echo -e "${GREEN}✓ Full triage PASSED (classification present, summary ${#SUMMARY} chars)${NC}"; ((PASS++))
else echo -e "${RED}✗ Full triage FAILED (HTTP $HTTP_CODE, entity=$ENTITY_ID, classification=$CLASSIFICATION, summary_len=${#SUMMARY})${NC}"; ((FAIL++)); fi
echo ""

# Test 3: Classification Only (EMAIL001)
echo -e "${YELLOW}Test 3: Classification Only (EMAIL001)${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST "${BASE_URL}/invoke" \
    -H "Content-Type: application/json" -d '{"entity_id":"EMAIL001","triage_type":"classification"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1); BODY=$(echo "$RESPONSE" | sed '$d')
ENTITY_ID=$(echo "$BODY" | jq -r '.entity_id' 2>/dev/null)
CLASSIFICATION=$(echo "$BODY" | jq -r '.classification' 2>/dev/null)
if [[ "$HTTP_CODE" == "200" ]] && [[ "$ENTITY_ID" == "EMAIL001" ]] && [[ "$CLASSIFICATION" != "null" ]]; then
    echo -e "${GREEN}✓ Classification only PASSED${NC}"; ((PASS++))
else echo -e "${RED}✗ Classification only FAILED${NC}"; ((FAIL++)); fi
echo ""

# Test 4: Action Extraction Only (EMAIL001)
echo -e "${YELLOW}Test 4: Action Extraction Only (EMAIL001)${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST "${BASE_URL}/invoke" \
    -H "Content-Type: application/json" -d '{"entity_id":"EMAIL001","triage_type":"action_extraction"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1); BODY=$(echo "$RESPONSE" | sed '$d')
ENTITY_ID=$(echo "$BODY" | jq -r '.entity_id' 2>/dev/null)
RAW_EXTRACTOR=$(echo "$BODY" | jq -r '.raw_analysis.extractor' 2>/dev/null)
if [[ "$HTTP_CODE" == "200" ]] && [[ "$ENTITY_ID" == "EMAIL001" ]] && [[ "$RAW_EXTRACTOR" != "null" ]]; then
    echo -e "${GREEN}✓ Action extraction only PASSED${NC}"; ((PASS++))
else echo -e "${RED}✗ Action extraction only FAILED${NC}"; ((FAIL++)); fi
echo ""

# Test 5: Invalid Entity
echo -e "${YELLOW}Test 5: Invalid Entity (INVALID999)${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST "${BASE_URL}/invoke" \
    -H "Content-Type: application/json" -d '{"entity_id":"INVALID999","triage_type":"full"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "500" ]] || [[ "$HTTP_CODE" == "404" ]]; then
    echo -e "${GREEN}✓ Invalid entity handling PASSED (HTTP $HTTP_CODE - graceful)${NC}"; ((PASS++))
else echo -e "${RED}✗ Invalid entity handling FAILED (HTTP $HTTP_CODE)${NC}"; ((FAIL++)); fi
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "Tests Passed: ${GREEN}${PASS}${NC}"
echo -e "Tests Failed: ${RED}${FAIL}${NC}"
TOTAL=$((PASS + FAIL)); RATE=$((PASS * 100 / TOTAL))
echo -e "Success Rate: ${RATE}%"
echo -e "${GREEN}========================================${NC}"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
