#!/bin/bash
set +e

USE_CASE_ID="${1:-trading_assistant}"
FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"
AWS_REGION="${AWS_REGION:-us-east-1}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
LLM_TIMEOUT=180

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
RESOURCE_ID=$(normalize_use_case_to_id "$USE_CASE_ID")
RESOURCE_ID=$(echo "$RESOURCE_ID" | tr '[:upper:]' '[:lower:]')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}EC2 Test - Trading Assistant${NC}"
echo -e "${GREEN}Use Case: ${USE_CASE_ID} (${RESOURCE_ID})${NC}"
echo -e "${GREEN}Framework: ${FRAMEWORK} (${FRAMEWORK_SHORT})${NC}"
echo -e "${GREEN}Region: ${AWS_REGION}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

IAC_DIR="$PROJECT_ROOT/applications/fsi_foundry/foundations/iac/ec2"
pushd "$IAC_DIR" > /dev/null
terraform workspace select "${RESOURCE_ID}-${FRAMEWORK_SHORT}-${AWS_REGION}" 2>/dev/null
ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "")
API_ENDPOINT="http://${ALB_DNS}"
popd > /dev/null

if [[ -z "$ALB_DNS" ]]; then
    echo -e "${RED}Error: Could not get ALB DNS. Deploy first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ API Endpoint: $API_ENDPOINT${NC}"
echo ""

TESTS_PASSED=0; TESTS_FAILED=0

# ========================================
# Test 1: Health Check
# ========================================
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 1: Health Check${NC}"
echo -e "${YELLOW}========================================${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 "$API_ENDPOINT/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response: $BODY"

if [[ "$HTTP_CODE" == "200" ]]; then
    STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
    AGENT=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('agent',''))" 2>/dev/null)
    if [[ "$STATUS" == "healthy" && "$AGENT" == "trading_assistant" ]]; then
        echo -e "${GREEN}✓ Health check PASSED (agent=trading_assistant)${NC}"; ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Health check FAILED (status=$STATUS, agent=$AGENT)${NC}"; ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ Health check FAILED (HTTP $HTTP_CODE)${NC}"; ((TESTS_FAILED++))
fi
echo ""

# ========================================
# Test 2: Full Analysis (TRADE001) — all 3 agents
# ========================================
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 2: Full Analysis (TRADE001)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "${BLUE}Running 3 agents in parallel (market_analyst, trade_idea_generator, execution_planner)...${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" \
    -d '{"entity_id": "TRADE001", "analysis_type": "full"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "200" ]]; then
    VALIDATION=$(echo "$BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
errors = []

# 1. Response structure
if d.get('entity_id') != 'TRADE001': errors.append('entity_id mismatch')
if not d.get('analysis_id'): errors.append('missing analysis_id')
if not d.get('timestamp'): errors.append('missing timestamp')

# 2. Summary quality
summary = d.get('summary', '')
if len(summary) < 100: errors.append(f'summary too short ({len(summary)} chars)')

# 3. Market analysis populated with valid enums
ma = d.get('market_analysis')
if not ma: errors.append('market_analysis is None')
else:
    if ma.get('condition') not in ['bullish','bearish','neutral','volatile']:
        errors.append(f'invalid market condition: {ma.get(\"condition\")}')
    if ma.get('urgency') not in ['low','medium','high','immediate']:
        errors.append(f'invalid urgency: {ma.get(\"urgency\")}')

# 4. All 3 agents ran (raw_analysis has all keys)
ra = d.get('raw_analysis', {})
for key in ['market_analysis', 'trade_ideas', 'execution_plan']:
    if not ra.get(key): errors.append(f'raw_analysis missing {key}')
    elif not ra[key].get('analysis'): errors.append(f'{key} has no analysis content')

# 5. Agents read sample data (TRADE001 has AAPL, NVDA, SPY positions)
raw_str = json.dumps(ra).lower()
found_symbols = [s for s in ['aapl','nvda','spy'] if s in raw_str]
if len(found_symbols) < 2: errors.append(f'agents did not reference sample data positions (found: {found_symbols})')

# 6. Recommendations populated
if len(d.get('recommendations', [])) == 0: errors.append('no recommendations')

if errors: print('FAIL:' + '|'.join(errors))
else: print(f'OK:condition={ma[\"condition\"]},symbols={found_symbols},summary={len(summary)}chars,recs={len(d[\"recommendations\"])}')
" 2>&1)
    if [[ "$VALIDATION" == OK:* ]]; then
        echo -e "${GREEN}✓ Full analysis PASSED — ${VALIDATION#OK:}${NC}"; ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Full analysis FAILED — ${VALIDATION}${NC}"; ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ Full analysis FAILED (HTTP $HTTP_CODE)${NC}"; ((TESTS_FAILED++))
fi
echo ""

# ========================================
# Test 3: Market Analysis Only — routing validation
# ========================================
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 3: Market Analysis Only (TRADE001)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "${BLUE}Should only run market_analyst, NOT trade_idea_generator or execution_planner${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" \
    -d '{"entity_id": "TRADE001", "analysis_type": "market_analysis"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "200" ]]; then
    VALIDATION=$(echo "$BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
errors = []
if d.get('entity_id') != 'TRADE001': errors.append('entity_id mismatch')
ra = d.get('raw_analysis', {})
if not ra.get('market_analysis'): errors.append('market_analysis agent did not run')
if ra.get('trade_ideas') is not None: errors.append('trade_ideas should be None for market_analysis type')
if ra.get('execution_plan') is not None: errors.append('execution_plan should be None for market_analysis type')
# Market analysis content should reference sample data
if ra.get('market_analysis'):
    ma_str = json.dumps(ra['market_analysis']).lower()
    if not any(s in ma_str for s in ['aapl','nvda','spy','4783','vix']):
        errors.append('market_analyst did not reference sample data')
if errors: print('FAIL:' + '|'.join(errors))
else: print('OK:only_market_analyst_ran')
" 2>&1)
    if [[ "$VALIDATION" == OK:* ]]; then
        echo -e "${GREEN}✓ Market analysis routing PASSED — only market_analyst ran${NC}"; ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Routing FAILED — ${VALIDATION}${NC}"; ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ Market analysis FAILED (HTTP $HTTP_CODE)${NC}"; ((TESTS_FAILED++))
fi
echo ""

# ========================================
# Test 4: Trade Idea type — should run market_analyst + trade_idea_generator
# ========================================
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 4: Trade Idea Analysis (TRADE001)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "${BLUE}Should run market_analyst + trade_idea_generator, NOT execution_planner${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" \
    -d '{"entity_id": "TRADE001", "analysis_type": "trade_idea"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "200" ]]; then
    VALIDATION=$(echo "$BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
errors = []
ra = d.get('raw_analysis', {})
if not ra.get('market_analysis'): errors.append('market_analysis should run for trade_idea type')
if not ra.get('trade_ideas'): errors.append('trade_ideas should run for trade_idea type')
if ra.get('execution_plan') is not None: errors.append('execution_plan should be None for trade_idea type')
if errors: print('FAIL:' + '|'.join(errors))
else: print('OK:market+trade_ran')
" 2>&1)
    if [[ "$VALIDATION" == OK:* ]]; then
        echo -e "${GREEN}✓ Trade idea routing PASSED — market_analyst + trade_idea_generator ran${NC}"; ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Routing FAILED — ${VALIDATION}${NC}"; ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ Trade idea analysis FAILED (HTTP $HTTP_CODE)${NC}"; ((TESTS_FAILED++))
fi
echo ""

# ========================================
# Test 5: Execution Plan type — should run market_analyst + execution_planner
# ========================================
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 5: Execution Plan Analysis (TRADE001)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "${BLUE}Should run market_analyst + execution_planner, NOT trade_idea_generator${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" \
    -d '{"entity_id": "TRADE001", "analysis_type": "execution_plan"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "200" ]]; then
    VALIDATION=$(echo "$BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
errors = []
ra = d.get('raw_analysis', {})
if not ra.get('market_analysis'): errors.append('market_analysis should run for execution_plan type')
if ra.get('trade_ideas') is not None: errors.append('trade_ideas should be None for execution_plan type')
if not ra.get('execution_plan'): errors.append('execution_plan should run for execution_plan type')
if errors: print('FAIL:' + '|'.join(errors))
else: print('OK:market+execution_ran')
" 2>&1)
    if [[ "$VALIDATION" == OK:* ]]; then
        echo -e "${GREEN}✓ Execution plan routing PASSED — market_analyst + execution_planner ran${NC}"; ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Routing FAILED — ${VALIDATION}${NC}"; ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ Execution plan FAILED (HTTP $HTTP_CODE)${NC}"; ((TESTS_FAILED++))
fi
echo ""

# ========================================
# Test 6: Invalid Entity — graceful handling
# ========================================
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 6: Invalid Entity (NONEXISTENT)${NC}"
echo -e "${YELLOW}========================================${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" \
    -d '{"entity_id": "NONEXISTENT", "analysis_type": "full"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "500" || "$HTTP_CODE" == "404" ]]; then
    echo -e "${GREEN}✓ Invalid entity PASSED (error response)${NC}"; ((TESTS_PASSED++))
elif [[ "$HTTP_CODE" == "200" ]]; then
    echo -e "${GREEN}✓ Invalid entity PASSED (graceful handling)${NC}"; ((TESTS_PASSED++))
else
    echo -e "${RED}✗ Invalid entity FAILED (HTTP $HTTP_CODE)${NC}"; ((TESTS_FAILED++))
fi
echo ""

# ========================================
# Test 7: Load Test (5 concurrent requests)
# ========================================
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 7: Load Test (5 concurrent)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "${BLUE}Running 5 concurrent market_analysis requests...${NC}"

START_TIME=$(date +%s)
for i in {1..5}; do
    (curl -s --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
        -H "Content-Type: application/json" \
        -d "{\"entity_id\": \"TRADE001\", \"analysis_type\": \"market_analysis\"}" > /dev/null 2>&1) &
done
wait
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if [[ $DURATION -lt 120 ]]; then
    echo -e "${GREEN}✓ Load test PASSED (${DURATION}s < 120s)${NC}"; ((TESTS_PASSED++))
else
    echo -e "${RED}✗ Load test FAILED (${DURATION}s >= 120s)${NC}"; ((TESTS_FAILED++))
fi
echo ""

# ========================================
# Summary
# ========================================
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Test Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"
TOTAL=$((TESTS_PASSED + TESTS_FAILED))
echo "Success Rate: $((TESTS_PASSED * 100 / TOTAL))%"
echo ""
[[ $TESTS_FAILED -eq 0 ]] && echo -e "${GREEN}All tests passed! 🎉${NC}" && exit 0 || exit 1
