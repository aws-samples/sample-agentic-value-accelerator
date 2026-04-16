#!/bin/bash
set +e
USE_CASE_ID="${1:-trading_assistant}"; FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"; AWS_REGION="${AWS_REGION:-us-east-1}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
RESOURCE_ID=$(normalize_use_case_to_id "$USE_CASE_ID"); RESOURCE_ID=$(echo "$RESOURCE_ID" | tr '[:upper:]' '[:lower:]')
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Step Functions Test - Trading Assistant (${RESOURCE_ID})${NC}"
echo -e "${GREEN}Framework: ${FRAMEWORK} (${FRAMEWORK_SHORT})${NC}"
echo -e "${GREEN}========================================${NC}"
IAC_DIR="$PROJECT_ROOT/applications/fsi_foundry/foundations/iac/step_functions"
pushd "$IAC_DIR" > /dev/null; terraform workspace select "${RESOURCE_ID}-${FRAMEWORK_SHORT}-${AWS_REGION}" 2>/dev/null
API_ENDPOINT=$(terraform output -raw api_endpoint 2>/dev/null || echo ""); popd > /dev/null
[[ -z "$API_ENDPOINT" ]] && echo -e "${RED}No API endpoint. Deploy first.${NC}" && exit 1
PASS=0; FAIL=0

wait_exec() { local ea="$1"; for i in $(seq 1 30); do
  S=$(aws stepfunctions describe-execution --execution-arn "$ea" --region "$AWS_REGION" --query 'status' --output text 2>/dev/null)
  if [[ "$S" == "SUCCEEDED" ]]; then aws stepfunctions describe-execution --execution-arn "$ea" --region "$AWS_REGION" --query 'output' --output text 2>/dev/null; return 0; fi
  [[ "$S" == "FAILED" || "$S" == "TIMED_OUT" || "$S" == "ABORTED" ]] && echo "EXECUTION_${S}" && return 1
  echo -n "."; sleep 10; done; echo "TIMEOUT"; return 1; }

# Test 1: Health check
echo -e "${YELLOW}Test 1: Health Check${NC}"
H=$(curl -s --max-time 10 "${API_ENDPOINT}/health")
if echo "$H" | grep -qi "healthy\|ok\|running"; then echo -e "${GREEN}✓ Health check passed${NC}"; ((PASS++)); else echo -e "${RED}✗ Health check failed: ${H}${NC}"; ((FAIL++)); fi

# Test 2: Full analysis — validate agent output content
echo -e "${YELLOW}Test 2: Full Analysis — validate agent outputs (TRADE001)${NC}"
IR=$(curl -s --max-time 30 -X POST "${API_ENDPOINT}/assess" -H "Content-Type: application/json" -d '{"entity_id": "TRADE001", "analysis_type": "full"}')
EA=$(echo "$IR" | python3 -c "import sys,json; print(json.load(sys.stdin).get('executionArn',''))" 2>/dev/null)
if [[ -n "$EA" ]]; then
    echo "Waiting for execution..."
    O=$(wait_exec "$EA")
    CHECKS=0
    echo "$O" | grep -q "TRADE001" && ((CHECKS++))
    echo "$O" | grep -qi "aapl\|nvda\|spy" && ((CHECKS++))
    echo "$O" | grep -qi "market\|trading\|execution" && ((CHECKS++))
    if [[ $CHECKS -ge 2 ]]; then
        echo -e "${GREEN}✓ Full analysis passed — content validated (${CHECKS}/3 checks)${NC}"; ((PASS++))
    else echo -e "${RED}✗ Content validation failed (${CHECKS}/3 checks)${NC}"; echo "$O" | head -3; ((FAIL++)); fi
else echo -e "${RED}✗ Failed to start execution${NC}"; ((FAIL++)); fi

echo -e "${GREEN}Results: ${PASS} passed, ${FAIL} failed${NC}"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
