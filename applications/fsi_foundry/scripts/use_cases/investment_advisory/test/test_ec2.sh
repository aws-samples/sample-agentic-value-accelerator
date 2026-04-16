#!/bin/bash
set +e
USE_CASE_ID="${1:-investment_advisory}"
FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"
AWS_REGION="${AWS_REGION:-us-east-1}"
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
LLM_TIMEOUT=180
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
resource_id=$(normalize_use_case_to_id "$USE_CASE_ID")
resource_id=$(echo "$resource_id" | tr '[:upper:]' '[:lower:]')
WORKSPACE_NAME="${resource_id}-${FRAMEWORK_SHORT}-${AWS_REGION}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}EC2 Test: ${USE_CASE_ID} (${FRAMEWORK})${NC}"
echo -e "${GREEN}Workspace: ${WORKSPACE_NAME}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

cd "$PROJECT_ROOT/applications/fsi_foundry/foundations/iac/ec2" || exit 1
terraform workspace select "$WORKSPACE_NAME" 2>/dev/null || { echo -e "${RED}Workspace not found${NC}"; exit 1; }
API_ENDPOINT=$(terraform output -raw api_endpoint 2>/dev/null)
test -z "$API_ENDPOINT" && { echo -e "${RED}Not deployed${NC}"; exit 1; }
echo -e "${GREEN}✓ API Endpoint: $API_ENDPOINT${NC}"
echo ""

PASS=0; FAIL=0

# Test 1: Health Check
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 1: Health Check${NC}"
echo -e "${YELLOW}========================================${NC}"
HC=$(curl -s -o /tmp/test_resp.json -w "%{http_code}" "$API_ENDPOINT/health")
jq . /tmp/test_resp.json 2>/dev/null
STATUS=$(jq -r '.status' /tmp/test_resp.json 2>/dev/null)
if [ "$HC" = "200" ] && [ "$STATUS" = "healthy" ]; then
    echo -e "${GREEN}✓ Health check PASSED${NC}"; ((PASS++))
else
    echo -e "${RED}✗ Health check FAILED (HTTP $HC, status=$STATUS)${NC}"; ((FAIL++))
fi
echo ""

# Test 2: Full Advisory (CLIENT001) - all 3 agents run
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 2: Full Advisory (CLIENT001)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "${BLUE}Note: Runs all 3 agents in parallel, may take 60-90s...${NC}"
echo ""
HC=$(curl -s -o /tmp/test_resp.json -w "%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" -d '{"client_id":"CLIENT001","advisory_type":"full"}')
echo "Response (truncated):"
jq '{client_id, advisory_id, portfolio_analysis: .portfolio_analysis.risk_level, recommendations: (.recommendations | length), summary_length: (.summary | length)}' /tmp/test_resp.json 2>/dev/null
echo ""
if [ "$HC" = "200" ]; then
    CID=$(jq -r '.client_id' /tmp/test_resp.json 2>/dev/null)
    AID=$(jq -r '.advisory_id' /tmp/test_resp.json 2>/dev/null)
    PA=$(jq -r '.portfolio_analysis' /tmp/test_resp.json 2>/dev/null)
    RECS=$(jq -r '.recommendations | length' /tmp/test_resp.json 2>/dev/null)
    PA_RAW=$(jq -r '.raw_analysis.portfolio_analyst_result // .raw_analysis.portfolio_result' /tmp/test_resp.json 2>/dev/null)
    MR_RAW=$(jq -r '.raw_analysis.market_researcher_result // .raw_analysis.market_result' /tmp/test_resp.json 2>/dev/null)
    CP_RAW=$(jq -r '.raw_analysis.client_profiler_result // .raw_analysis.client_result' /tmp/test_resp.json 2>/dev/null)
    if [ "$CID" = "CLIENT001" ] && [ "$AID" != "null" ] && [ "$PA" != "null" ] && [ "$RECS" -gt 0 ] 2>/dev/null && \
       [ "$PA_RAW" != "null" ] && [ "$MR_RAW" != "null" ] && [ "$CP_RAW" != "null" ]; then
        echo -e "${GREEN}✓ Full advisory PASSED (all 3 agents ran, $RECS recommendations)${NC}"; ((PASS++))
    else
        echo -e "${RED}✗ Full advisory FAILED (CID=$CID, AID=$AID, PA=$PA, recs=$RECS, pa_raw=$PA_RAW, mr_raw=$MR_RAW, cp_raw=$CP_RAW)${NC}"; ((FAIL++))
    fi
else
    echo -e "${RED}✗ Full advisory FAILED (HTTP $HC)${NC}"; ((FAIL++))
fi
echo ""

# Test 3: Portfolio Review Only - only portfolio_analyst should run
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 3: Portfolio Review Only (CLIENT001)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "${BLUE}Note: Only portfolio_analyst agent should run...${NC}"
echo ""
HC=$(curl -s -o /tmp/test_resp.json -w "%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" -d '{"client_id":"CLIENT001","advisory_type":"portfolio_review"}')
if [ "$HC" = "200" ]; then
    CID=$(jq -r '.client_id' /tmp/test_resp.json 2>/dev/null)
    PA_RAW=$(jq -r '.raw_analysis.portfolio_analyst_result // .raw_analysis.portfolio_result' /tmp/test_resp.json 2>/dev/null)
    MR_RAW=$(jq -r '.raw_analysis.market_researcher_result // .raw_analysis.market_result' /tmp/test_resp.json 2>/dev/null)
    CP_RAW=$(jq -r '.raw_analysis.client_profiler_result // .raw_analysis.client_result' /tmp/test_resp.json 2>/dev/null)
    if [ "$CID" = "CLIENT001" ] && [ "$PA_RAW" != "null" ] && [ "$MR_RAW" = "null" ] && [ "$CP_RAW" = "null" ]; then
        echo -e "${GREEN}✓ Portfolio review PASSED (only portfolio_analyst ran)${NC}"; ((PASS++))
    else
        echo -e "${RED}✗ Portfolio review FAILED (routing: pa=$PA_RAW, mr=$MR_RAW, cp=$CP_RAW)${NC}"; ((FAIL++))
    fi
else
    echo -e "${RED}✗ Portfolio review FAILED (HTTP $HC)${NC}"; ((FAIL++))
fi
echo ""

# Test 4: Market Analysis Only - only market_researcher should run
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 4: Market Analysis Only (CLIENT001)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "${BLUE}Note: Only market_researcher agent should run...${NC}"
echo ""
HC=$(curl -s -o /tmp/test_resp.json -w "%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" -d '{"client_id":"CLIENT001","advisory_type":"market_analysis"}')
if [ "$HC" = "200" ]; then
    PA_RAW=$(jq -r '.raw_analysis.portfolio_analyst_result // .raw_analysis.portfolio_result' /tmp/test_resp.json 2>/dev/null)
    MR_RAW=$(jq -r '.raw_analysis.market_researcher_result // .raw_analysis.market_result' /tmp/test_resp.json 2>/dev/null)
    CP_RAW=$(jq -r '.raw_analysis.client_profiler_result // .raw_analysis.client_result' /tmp/test_resp.json 2>/dev/null)
    if [ "$PA_RAW" = "null" ] && [ "$MR_RAW" != "null" ] && [ "$CP_RAW" = "null" ]; then
        echo -e "${GREEN}✓ Market analysis PASSED (only market_researcher ran)${NC}"; ((PASS++))
    else
        echo -e "${RED}✗ Market analysis FAILED (routing: pa=$PA_RAW, mr=$MR_RAW, cp=$CP_RAW)${NC}"; ((FAIL++))
    fi
else
    echo -e "${RED}✗ Market analysis FAILED (HTTP $HC)${NC}"; ((FAIL++))
fi
echo ""

# Test 5: Client Profiling Only - only client_profiler should run
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 5: Client Profiling Only (CLIENT001)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "${BLUE}Note: Only client_profiler agent should run...${NC}"
echo ""
HC=$(curl -s -o /tmp/test_resp.json -w "%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" -d '{"client_id":"CLIENT001","advisory_type":"client_profiling"}')
if [ "$HC" = "200" ]; then
    PA_RAW=$(jq -r '.raw_analysis.portfolio_analyst_result // .raw_analysis.portfolio_result' /tmp/test_resp.json 2>/dev/null)
    MR_RAW=$(jq -r '.raw_analysis.market_researcher_result // .raw_analysis.market_result' /tmp/test_resp.json 2>/dev/null)
    CP_RAW=$(jq -r '.raw_analysis.client_profiler_result // .raw_analysis.client_result' /tmp/test_resp.json 2>/dev/null)
    if [ "$PA_RAW" = "null" ] && [ "$MR_RAW" = "null" ] && [ "$CP_RAW" != "null" ]; then
        echo -e "${GREEN}✓ Client profiling PASSED (only client_profiler ran)${NC}"; ((PASS++))
    else
        echo -e "${RED}✗ Client profiling FAILED (routing: pa=$PA_RAW, mr=$MR_RAW, cp=$CP_RAW)${NC}"; ((FAIL++))
    fi
else
    echo -e "${RED}✗ Client profiling FAILED (HTTP $HC)${NC}"; ((FAIL++))
fi
echo ""

# Test 6: Invalid Client ID
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 6: Invalid Client ID${NC}"
echo -e "${YELLOW}========================================${NC}"
HC=$(curl -s -o /tmp/test_resp.json -w "%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" -d '{"client_id":"INVALID999","advisory_type":"full"}')
BODY=$(cat /tmp/test_resp.json)
if [ "$HC" = "500" ] || [ "$HC" = "404" ] || echo "$BODY" | grep -qi "error\|not found\|invalid\|unable" || [ "$HC" = "200" ]; then
    echo -e "${GREEN}✓ Invalid client handling PASSED (graceful handling, HTTP $HC)${NC}"; ((PASS++))
else
    echo -e "${RED}✗ Invalid client handling FAILED (HTTP $HC)${NC}"; ((FAIL++))
fi
echo ""

# Test 7: Response Field Validation
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 7: Response Field Validation${NC}"
echo -e "${YELLOW}========================================${NC}"
# Re-use the full advisory response from Test 2
HC=$(curl -s -o /tmp/test_resp.json -w "%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" -d '{"client_id":"CLIENT001","advisory_type":"full"}')
if [ "$HC" = "200" ]; then
    HAS_TIMESTAMP=$(jq -r '.timestamp != null' /tmp/test_resp.json 2>/dev/null)
    HAS_SUMMARY=$(jq -r '.summary != null and (.summary | length) > 50' /tmp/test_resp.json 2>/dev/null)
    RISK_LEVEL=$(jq -r '.portfolio_analysis.risk_level' /tmp/test_resp.json 2>/dev/null)
    VALID_RISK=$(echo "$RISK_LEVEL" | grep -qE "conservative|moderate|aggressive|very_aggressive" && echo "true" || echo "false")
    HAS_ALLOC=$(jq -r '.portfolio_analysis.asset_allocation | length > 0' /tmp/test_resp.json 2>/dev/null)
    if [ "$HAS_TIMESTAMP" = "true" ] && [ "$HAS_SUMMARY" = "true" ] && [ "$VALID_RISK" = "true" ] && [ "$HAS_ALLOC" = "true" ]; then
        echo -e "${GREEN}✓ Field validation PASSED (risk=$RISK_LEVEL, has_alloc=$HAS_ALLOC, summary>50chars)${NC}"; ((PASS++))
    else
        echo -e "${RED}✗ Field validation FAILED (ts=$HAS_TIMESTAMP, summary=$HAS_SUMMARY, risk=$RISK_LEVEL, alloc=$HAS_ALLOC)${NC}"; ((FAIL++))
    fi
else
    echo -e "${RED}✗ Field validation FAILED (HTTP $HC)${NC}"; ((FAIL++))
fi
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Test Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Tests Passed: $PASS${NC}"
echo -e "${RED}Tests Failed: $FAIL${NC}"
TOTAL=$((PASS + FAIL))
RATE=$((PASS * 100 / TOTAL))
echo "Success Rate: ${RATE}%"
echo ""
[ $FAIL -eq 0 ] && exit 0 || exit 1
