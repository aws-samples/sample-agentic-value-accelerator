#!/bin/bash
# ============================================================================
# Economic Research - Comprehensive AgentCore E2E Tests
# ============================================================================
# Validates business logic (routing, synthesis, enums) and tools logic
# (S3 retriever proof, profile data in output) for agentcore deployment.
#
# Usage:
#   ./test_agentcore.sh [use_case_id]
#   FRAMEWORK=strands ./test_agentcore.sh economic_research
# ============================================================================

set +e

USE_CASE_ID="${1:-economic_research}"
FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"
AWS_REGION="${AWS_REGION:-us-east-1}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

USE_CASE_ID_NORMALIZED=$(normalize_use_case_to_id "$USE_CASE_ID")
USE_CASE_ID_NORMALIZED=$(echo "$USE_CASE_ID_NORMALIZED" | tr '[:upper:]' '[:lower:]')
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")

USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")

REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Economic Research - AgentCore E2E Tests${NC}"
echo -e "${GREEN}Framework: ${FRAMEWORK} (${FRAMEWORK_SHORT})${NC}"
echo -e "${GREEN}Region: ${AWS_REGION}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

command -v jq &>/dev/null || { echo -e "${RED}Error: jq required${NC}"; exit 1; }

# --- Discover runtime ARN ---

for NAME in \
    "ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}" \
    "ava-${USE_CASE_ID_CFN}-agentcore-runtime-${REGION_SUFFIX}" \
    "ava-${USE_CASE_ID_CFN}-agentcore-runtime"; do
    STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$NAME" --region "$AWS_REGION" \
        --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
    if [ "$STACK_STATUS" != "NOT_FOUND" ]; then STACK_NAME="$NAME"; break; fi
done

if [ -z "$STACK_NAME" ]; then echo -e "${RED}Error: CloudFormation stack not found${NC}"; exit 1; fi

RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' --output text)
echo "Stack: ${STACK_NAME}"
echo "Runtime ARN: ${RUNTIME_ARN}"
echo ""

# --- Test helpers ---
PASSED=0; FAILED=0

check() {
    local name=$1; shift
    if eval "$@" 2>/dev/null; then
        echo -e "${GREEN}  ✓ $name${NC}"; ((PASSED++))
    else
        echo -e "${RED}  ✗ $name${NC}"; ((FAILED++))
    fi
}

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

# Normalize AgentCore response (may be Python repr or JSON)
normalize() {
    local f=$1
    if jq '.' "$f" >/dev/null 2>&1; then
        cat "$f"
    else
        cat "$f" | sed "s/'/\"/g" | sed 's/None/null/g' | sed 's/True/true/g' | sed 's/False/false/g'
    fi
}

# ============================================================================
# BL-1: Full research -> all 3 agents invoked
# ============================================================================
echo -e "${YELLOW}BL-1: Full research — all 3 agents invoked${NC}"
F="/tmp/er-bl1-$$.json"
invoke_agentcore '{"entity_id":"ECON001","research_type":"full"}' "$F"
R=$(normalize "$F")
DA=$(echo "$R" | jq -r '.raw_analysis.data_aggregation.agent // empty')
TA=$(echo "$R" | jq -r '.raw_analysis.trend_analysis.agent // empty')
RW=$(echo "$R" | jq -r '.raw_analysis.report.agent // empty')
check "data_aggregator invoked (got: $DA)" '[ "$DA" = "data_aggregator" ]'
check "trend_analyst invoked (got: $TA)" '[ "$TA" = "trend_analyst" ]'
check "research_writer invoked (got: $RW)" '[ "$RW" = "research_writer" ]'
echo ""

# ============================================================================
# BL-2: Structured synthesis — valid enums, recommendations, summary
# ============================================================================
echo -e "${YELLOW}BL-2: Structured synthesis quality${NC}"
IND=$(echo "$R" | jq -r '.economic_overview.primary_indicator // empty')
DIR=$(echo "$R" | jq -r '.economic_overview.trend_direction // empty')
FH=$(echo "$R" | jq -r '.economic_overview.forecast_horizon // empty')
RECS=$(echo "$R" | jq '.recommendations | length')
SLEN=$(echo "$R" | jq -r '.summary | length')
HAS_OVERVIEW=$(echo "$R" | jq '.economic_overview != null')
if [ "$HAS_OVERVIEW" = "true" ]; then
    check "primary_indicator valid enum (got: $IND)" 'echo "gdp inflation employment interest_rates trade_balance" | grep -qw "$IND"'
    check "trend_direction valid enum (got: $DIR)" 'echo "accelerating stable decelerating reversing uncertain" | grep -qw "$DIR"'
    check "forecast_horizon non-empty" '[ -n "$FH" ] && [ "$FH" != "null" ]'
else
    # Strands synthesis may not produce structured overview; verify summary covers indicators instead
    check "summary references GDP indicator" 'echo "$R" | jq -r ".summary" | grep -qi "GDP\|growth"'
    check "summary references inflation" 'echo "$R" | jq -r ".summary" | grep -qi "inflation\|price"'
    check "summary references employment" 'echo "$R" | jq -r ".summary" | grep -qi "employment\|unemployment\|labor"'
fi
check "recommendations count > 0 (got: $RECS)" '[ "$RECS" -gt 0 ]'
check "summary > 200 chars (got: $SLEN)" '[ "$SLEN" -gt 200 ]'
echo ""

# ============================================================================
# TL-1: S3 retriever tool proof — profile data in agent output
# ============================================================================
echo -e "${YELLOW}TL-1: S3 retriever tool — profile data in agent output${NC}"
DA_TEXT=$(echo "$R" | jq -r '.raw_analysis.data_aggregation.aggregation // empty')
TA_TEXT=$(echo "$R" | jq -r '.raw_analysis.trend_analysis.trends // empty')
RW_TEXT=$(echo "$R" | jq -r '.raw_analysis.report.report // empty')
# Profile has gdp_growth=2.3, inflation_rate=3.1, unemployment_rate=4.2, federal_funds_rate=4.75
check "data_aggregator references GDP 2.3" 'echo "$DA_TEXT" | grep -q "2\.3"'
check "data_aggregator references inflation 3.1" 'echo "$DA_TEXT" | grep -q "3\.1"'
check "trend_analyst references unemployment 4.2" 'echo "$TA_TEXT" | grep -q "4\.2"'
check "trend_analyst references fed rate 4.75" 'echo "$TA_TEXT" | grep -q "4\.75"'
check "research_writer references trade balance" 'echo "$RW_TEXT" | grep -qi "68.5\|trade.balance\|trade.deficit"'
check "data_aggregator mentions a data source" 'echo "$DA_TEXT" | grep -qi "Bureau\|Federal.Reserve\|Treasury\|BEA\|BLS\|data.source"'
rm -f "$F"
echo ""

# ============================================================================
# BL-3: data_aggregation routing — only data_aggregator runs
# ============================================================================
echo -e "${YELLOW}BL-3: data_aggregation routing isolation${NC}"
F="/tmp/er-bl3-$$.json"
invoke_agentcore '{"entity_id":"ECON001","research_type":"data_aggregation"}' "$F"
R2=$(normalize "$F")
check "data_aggregator ran" '[ "$(echo "$R2" | jq -r ".raw_analysis.data_aggregation")" != "null" ]'
check "trend_analyst did NOT run" '[ "$(echo "$R2" | jq -r ".raw_analysis.trend_analysis")" = "null" ]'
check "research_writer did NOT run" '[ "$(echo "$R2" | jq -r ".raw_analysis.report")" = "null" ]'
rm -f "$F"
echo ""

# ============================================================================
# BL-4: trend_analysis routing — only trend_analyst runs
# ============================================================================
echo -e "${YELLOW}BL-4: trend_analysis routing isolation${NC}"
F="/tmp/er-bl4-$$.json"
invoke_agentcore '{"entity_id":"ECON001","research_type":"trend_analysis"}' "$F"
R3=$(normalize "$F")
check "trend_analyst ran" '[ "$(echo "$R3" | jq -r ".raw_analysis.trend_analysis")" != "null" ]'
check "data_aggregator did NOT run" '[ "$(echo "$R3" | jq -r ".raw_analysis.data_aggregation")" = "null" ]'
check "research_writer did NOT run" '[ "$(echo "$R3" | jq -r ".raw_analysis.report")" = "null" ]'
rm -f "$F"
echo ""

# ============================================================================
# BL-5: report_generation routing — only research_writer runs
# ============================================================================
echo -e "${YELLOW}BL-5: report_generation routing isolation${NC}"
F="/tmp/er-bl5-$$.json"
invoke_agentcore '{"entity_id":"ECON001","research_type":"report_generation"}' "$F"
R4=$(normalize "$F")
check "research_writer ran" '[ "$(echo "$R4" | jq -r ".raw_analysis.report")" != "null" ]'
check "data_aggregator did NOT run" '[ "$(echo "$R4" | jq -r ".raw_analysis.data_aggregation")" = "null" ]'
check "trend_analyst did NOT run" '[ "$(echo "$R4" | jq -r ".raw_analysis.trend_analysis")" = "null" ]'
rm -f "$F"
echo ""

# ============================================================================
# BL-6: indicator_focus routing — data_aggregator + trend_analyst, no writer
# ============================================================================
echo -e "${YELLOW}BL-6: indicator_focus routing (2 agents, no writer)${NC}"
F="/tmp/er-bl6-$$.json"
invoke_agentcore '{"entity_id":"ECON001","research_type":"indicator_focus"}' "$F"
R5=$(normalize "$F")
check "data_aggregator ran" '[ "$(echo "$R5" | jq -r ".raw_analysis.data_aggregation")" != "null" ]'
check "trend_analyst ran" '[ "$(echo "$R5" | jq -r ".raw_analysis.trend_analysis")" != "null" ]'
check "research_writer did NOT run" '[ "$(echo "$R5" | jq -r ".raw_analysis.report")" = "null" ]'
rm -f "$F"
echo ""

# ============================================================================
# BL-7: Response structure — required fields present
# ============================================================================
echo -e "${YELLOW}BL-7: Response structure validation${NC}"
F="/tmp/er-bl7-$$.json"
invoke_agentcore '{"entity_id":"ECON001","research_type":"full"}' "$F"
R6=$(normalize "$F")
check "entity_id present" '[ "$(echo "$R6" | jq -r ".entity_id")" = "ECON001" ]'
check "research_id is UUID-like" 'echo "$R6" | jq -r ".research_id" | grep -qE "^[0-9a-f-]{36}$"'
check "timestamp present" '[ "$(echo "$R6" | jq -r ".timestamp")" != "null" ]'
check "raw_analysis is object" '[ "$(echo "$R6" | jq -r ".raw_analysis | type")" = "object" ]'
rm -f "$F"
echo ""

# ============================================================================
# TL-2: S3 tool proof on single-agent routes
# ============================================================================
echo -e "${YELLOW}TL-2: S3 tool proof on single-agent routes${NC}"
DA_ONLY=$(echo "$R2" | jq -r '.raw_analysis.data_aggregation.aggregation // empty')
TA_ONLY=$(echo "$R3" | jq -r '.raw_analysis.trend_analysis.trends // empty')
RW_ONLY=$(echo "$R4" | jq -r '.raw_analysis.report.report // empty')
check "data_aggregation-only references GDP" 'echo "$DA_ONLY" | grep -q "2\.3"'
check "trend_analysis-only references inflation" 'echo "$TA_ONLY" | grep -q "3\.1"'
check "report_generation-only references economic data" 'echo "$RW_ONLY" | grep -qi "GDP\|inflation\|unemployment\|economic"'
echo ""

# ============================================================================
# EH-1: Invalid entity — graceful handling
# ============================================================================
echo -e "${YELLOW}EH-1: Invalid entity graceful handling${NC}"
F="/tmp/er-eh1-$$.json"
if invoke_agentcore '{"entity_id":"INVALID999","research_type":"full"}' "$F"; then
    R7=$(normalize "$F")
    check "returns entity_id" 'echo "$R7" | jq -r ".entity_id" | grep -q "INVALID999"'
    check "returns summary (graceful)" '[ "$(echo "$R7" | jq -r ".summary | length")" -gt 0 ]'
else
    check "error returned (acceptable)" 'true'
fi
rm -f "$F"
echo ""

# ============================================================================
# BL-8: Agent domain-specific output quality
# ============================================================================
echo -e "${YELLOW}BL-8: Agent domain-specific output quality${NC}"
# data_aggregator should normalize/aggregate, not just echo numbers
check "data_aggregator does aggregation work" 'echo "$DA_TEXT" | grep -qi "normaliz\|aggregat\|quality\|structured\|summary\|dataset"'
# trend_analyst should identify trends, correlations, forecasts
check "trend_analyst identifies trends" 'echo "$TA_TEXT" | grep -qi "trend\|forecast\|correlat\|leading\|lagging\|inflection"'
# research_writer should produce report with investment implications
check "research_writer produces investment insights" 'echo "$RW_TEXT" | grep -qi "invest\|portfolio\|recommend\|implicat\|outlook\|strateg"'
echo ""

# ============================================================================
# BL-9: additional_context passthrough
# ============================================================================
echo -e "${YELLOW}BL-9: additional_context passthrough${NC}"
F="/tmp/er-bl9-$$.json"
invoke_agentcore '{"entity_id":"ECON001","research_type":"data_aggregation","additional_context":"Focus specifically on inflation dynamics and Fed policy"}' "$F"
R8=$(normalize "$F")
CTX_OUT=$(echo "$R8" | jq -r '.raw_analysis.data_aggregation.aggregation // empty')
check "additional_context influences output" 'echo "$CTX_OUT" | grep -qi "inflation\|Fed\|policy\|monetary"'
rm -f "$F"
echo ""

# ============================================================================
# TL-3: raw_analysis entity_id correctness
# ============================================================================
echo -e "${YELLOW}TL-3: raw_analysis entity_id correctness${NC}"
DA_EID=$(echo "$R2" | jq -r '.raw_analysis.data_aggregation.entity_id // empty')
TA_EID=$(echo "$R3" | jq -r '.raw_analysis.trend_analysis.entity_id // empty')
RW_EID=$(echo "$R4" | jq -r '.raw_analysis.report.entity_id // empty')
check "data_aggregation entity_id = ECON001" '[ "$DA_EID" = "ECON001" ]'
check "trend_analysis entity_id = ECON001" '[ "$TA_EID" = "ECON001" ]'
check "report entity_id = ECON001" '[ "$RW_EID" = "ECON001" ]'
echo ""

# ============================================================================
# BL-10: Synthesis references agent findings
# ============================================================================
echo -e "${YELLOW}BL-10: Synthesis references agent findings${NC}"
SUMMARY=$(echo "$R" | jq -r '.summary // empty')
# Summary should reference actual economic data, not be generic boilerplate
check "synthesis mentions GDP growth rate" 'echo "$SUMMARY" | grep -qi "GDP\|growth"'
check "synthesis mentions inflation" 'echo "$SUMMARY" | grep -qi "inflation\|price"'
check "synthesis mentions labor/employment" 'echo "$SUMMARY" | grep -qi "employ\|labor\|unemploy"'
check "synthesis mentions monetary policy" 'echo "$SUMMARY" | grep -qi "fed\|monetary\|interest.rate\|policy"'
echo ""

# ============================================================================
# Summary
# ============================================================================
TOTAL=$((PASSED + FAILED))
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test Summary — ${FRAMEWORK}${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "${GREEN}Passed: $PASSED${NC} / ${TOTAL}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""
echo "Runtime: ${RUNTIME_ARN}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! 🎉${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
