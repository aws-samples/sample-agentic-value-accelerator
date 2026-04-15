#!/bin/bash
set +e
USE_CASE_ID="${1:-investment_advisory}"
FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"
AWS_REGION="${AWS_REGION:-us-east-1}"
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
resource_id=$(normalize_use_case_to_id "$USE_CASE_ID")
resource_id=$(echo "$resource_id" | tr '[:upper:]' '[:lower:]')
WORKSPACE_NAME="${resource_id}-${FRAMEWORK_SHORT}-${AWS_REGION}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}SF Test: ${USE_CASE_ID} (${FRAMEWORK})${NC}"
echo -e "${GREEN}Workspace: ${WORKSPACE_NAME}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

cd "$PROJECT_ROOT/applications/fsi_foundry/foundations/iac/step_functions" || exit 1
terraform workspace select "$WORKSPACE_NAME" 2>/dev/null || { echo -e "${RED}Workspace not found${NC}"; exit 1; }
API_ENDPOINT=$(terraform output -raw api_endpoint 2>/dev/null)
test -z "$API_ENDPOINT" && { echo -e "${RED}Not deployed${NC}"; exit 1; }
echo -e "${GREEN}✓ API Endpoint: $API_ENDPOINT${NC}"
echo ""

PASS=0; FAIL=0

# Helper: invoke SF, wait for result, extract body
sf_invoke_and_wait() {
    local payload="$1"
    local max_wait="${2:-180}"
    local resp exec_arn status elapsed
    resp=$(curl -s --max-time 30 -X POST "$API_ENDPOINT/invoke" -H "Content-Type: application/json" -d "$payload")
    exec_arn=$(echo "$resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('executionArn',''))" 2>/dev/null)
    test -z "$exec_arn" && { echo ""; return 1; }
    elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        sleep 30; elapsed=$((elapsed+30))
        status=$(aws stepfunctions describe-execution --execution-arn "$exec_arn" --region "$AWS_REGION" --query 'status' --output text 2>/dev/null)
        [ "$status" != "RUNNING" ] && break
    done
    if [ "$status" = "SUCCEEDED" ]; then
        aws stepfunctions describe-execution --execution-arn "$exec_arn" --region "$AWS_REGION" --query 'output' --output text 2>/dev/null | \
            python3 -c "import sys,json;d=json.loads(sys.stdin.read());b=d.get('body',d);print(json.dumps(b))" 2>/dev/null
    else
        echo "{\"error\":\"$status\"}"
    fi
}

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
HC=$(curl -s -o /tmp/sf_resp.json -w "%{http_code}" "$API_ENDPOINT/health")
STATUS=$(jq -r '.status' /tmp/sf_resp.json 2>/dev/null)
if [ "$HC" = "200" ] && [ "$STATUS" = "healthy" ]; then
    echo -e "${GREEN}✓ PASSED${NC}"; ((PASS++))
else
    echo -e "${RED}✗ FAILED ($HC, $STATUS)${NC}"; ((FAIL++))
fi
echo ""

# Test 2: Full Advisory
echo -e "${YELLOW}Test 2: Full Advisory (CLIENT001)${NC}"
echo -e "${BLUE}Starting execution, waiting up to 3 min...${NC}"
BODY=$(sf_invoke_and_wait '{"client_id":"CLIENT001","advisory_type":"full"}')
if [ -n "$BODY" ]; then
    echo "$BODY" > /tmp/sf_resp.json
    CID=$(jq -r '.client_id' /tmp/sf_resp.json 2>/dev/null)
    PA=$(jq -r '.raw_analysis.portfolio_analyst_result // .raw_analysis.portfolio_result' /tmp/sf_resp.json 2>/dev/null)
    MR=$(jq -r '.raw_analysis.market_researcher_result // .raw_analysis.market_result' /tmp/sf_resp.json 2>/dev/null)
    CP=$(jq -r '.raw_analysis.client_profiler_result // .raw_analysis.client_result' /tmp/sf_resp.json 2>/dev/null)
    if [ "$CID" = "CLIENT001" ] && [ "$PA" != "null" ] && [ "$MR" != "null" ] && [ "$CP" != "null" ]; then
        echo -e "${GREEN}✓ PASSED (all 3 agents ran)${NC}"; ((PASS++))
    else
        echo -e "${RED}✗ FAILED (cid=$CID, pa=$PA, mr=$MR, cp=$CP)${NC}"; ((FAIL++))
    fi
else
    echo -e "${RED}✗ FAILED (no response)${NC}"; ((FAIL++))
fi
echo ""

# Test 3: Portfolio Review Only - routing validation
echo -e "${YELLOW}Test 3: Portfolio Review Only${NC}"
echo -e "${BLUE}Only portfolio_analyst should run...${NC}"
BODY=$(sf_invoke_and_wait '{"client_id":"CLIENT001","advisory_type":"portfolio_review"}')
if [ -n "$BODY" ]; then
    echo "$BODY" > /tmp/sf_resp.json
    PA=$(jq -r '.raw_analysis.portfolio_analyst_result // .raw_analysis.portfolio_result' /tmp/sf_resp.json 2>/dev/null)
    MR=$(jq -r '.raw_analysis.market_researcher_result // .raw_analysis.market_result' /tmp/sf_resp.json 2>/dev/null)
    CP=$(jq -r '.raw_analysis.client_profiler_result // .raw_analysis.client_result' /tmp/sf_resp.json 2>/dev/null)
    if [ "$PA" != "null" ] && [ "$MR" = "null" ] && [ "$CP" = "null" ]; then
        echo -e "${GREEN}✓ PASSED (only portfolio_analyst ran)${NC}"; ((PASS++))
    else
        echo -e "${RED}✗ FAILED (pa=$PA, mr=$MR, cp=$CP)${NC}"; ((FAIL++))
    fi
else
    echo -e "${RED}✗ FAILED (no response)${NC}"; ((FAIL++))
fi
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Results: ${PASS} passed, ${FAIL} failed${NC}"
echo -e "${GREEN}========================================${NC}"
[ $FAIL -eq 0 ] && exit 0 || exit 1
