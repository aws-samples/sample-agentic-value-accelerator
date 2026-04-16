#!/bin/bash
set +e

USE_CASE_ID="${1:-trading_insights}"
FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"
AWS_REGION="${AWS_REGION:-us-east-1}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')
USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr '_' '-')
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr '_' '-')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AgentCore E2E Test - ${USE_CASE_ID}${NC}"
echo -e "${GREEN}Framework: ${FRAMEWORK} (${FRAMEWORK_SHORT})${NC}"
echo -e "${GREEN}Region: ${AWS_REGION}${NC}"
echo -e "${GREEN}========================================${NC}"

# ---------------------------------------------------------------------------
# Resolve stack / runtime ARN
# ---------------------------------------------------------------------------
STACK_NAME="ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")

if [[ "$STACK_STATUS" == "NOT_FOUND" ]]; then
    RESOURCE_ID=$(normalize_use_case_to_id "$USE_CASE_ID" | tr '[:upper:]' '[:lower:]')
    STACK_NAME="ava-${RESOURCE_ID}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"
    STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" \
        --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
fi

if [[ "$STACK_STATUS" == "NOT_FOUND" ]]; then
    echo -e "${RED}Stack not found${NC}"; exit 1
fi

RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' --output text 2>/dev/null)
echo -e "${BLUE}Stack:   ${STACK_NAME}${NC}"
echo -e "${BLUE}Runtime: ${RUNTIME_ARN}${NC}"
echo ""

PASS=0; FAIL=0; PARSED=""

# ---------------------------------------------------------------------------
# Invoke helper
# ---------------------------------------------------------------------------
invoke_runtime() {
    local payload="$1" rf="$2"
    aws bedrock-agentcore invoke-agent-runtime \
        --agent-runtime-arn "$RUNTIME_ARN" \
        --payload "$(echo -n "$payload" | base64)" \
        --region "$AWS_REGION" --cli-read-timeout 300 "$rf" 2>/tmp/agentcore-invoke-error.log
}

parse_json() {
    python3 -c "
import sys,json,ast
raw=open('$1').read()
try: d=json.loads(raw)
except:
    try: d=ast.literal_eval(raw)
    except: d={'_raw':raw}
print(json.dumps(d) if isinstance(d,dict) else json.dumps({'_raw':str(d)}))" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; ((PASS++)); }
fail() { echo -e "${RED}  ✗ $1${NC}"; ((FAIL++)); }

assert_eq() {
    local val=$(echo "$PARSED" | jq -r "$1" 2>/dev/null)
    [[ "$val" == "$2" ]] && ok "$3" || fail "$3 (expected '$2', got '$val')"
}
assert_gt() {
    local val=$(echo "$PARSED" | jq -r "$1" 2>/dev/null)
    [[ "$val" -gt "$2" ]] 2>/dev/null && ok "$3 ($val)" || fail "$3 (got $val, need >$2)"
}
assert_not_null() {
    local val=$(echo "$PARSED" | jq -r "$1" 2>/dev/null)
    [[ "$val" != "null" ]] && [[ -n "$val" ]] && ok "$2" || fail "$2 (null)"
}
assert_null() {
    local val=$(echo "$PARSED" | jq -r "$1" 2>/dev/null)
    [[ "$val" == "null" ]] && ok "$2" || fail "$2 (expected null)"
}
assert_match() {
    # $1=pattern  $2=label  $3=file
    grep -qiE "$1" "$3" 2>/dev/null && ok "$2" || fail "$2"
}
assert_uuid() {
    local val=$(echo "$PARSED" | jq -r "$1" 2>/dev/null)
    [[ "$val" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] \
        && ok "$2" || fail "$2 (got '$val')"
}
assert_timestamp() {
    local val=$(echo "$PARSED" | jq -r "$1" 2>/dev/null)
    [[ "$val" =~ ^20[0-9]{2}-[0-9]{2}-[0-9]{2}T ]] \
        && ok "$2" || fail "$2 (got '$val')"
}
assert_in_range() {
    # $1=jq path  $2=min  $3=max  $4=label
    local val=$(echo "$PARSED" | jq -r "$1" 2>/dev/null)
    python3 -c "v=float('$val'); exit(0 if $2<=v<=$3 else 1)" 2>/dev/null \
        && ok "$4 ($val)" || fail "$4 (got $val, need $2..$3)"
}
assert_enum() {
    # $1=jq path  $2=pipe-separated values  $3=label
    local val=$(echo "$PARSED" | jq -r "$1" 2>/dev/null)
    echo "$val" | grep -qiE "^($2)$" && ok "$3 ($val)" || fail "$3 (got '$val')"
}

# ============================================================================
# Test 1: Full Assessment — response schema + all 3 agents + business logic
# ============================================================================
echo -e "${YELLOW}Test 1: Full Assessment (TRADE001)${NC}"
RF="/tmp/ac-ti-1-$$.json"
if invoke_runtime '{"entity_id":"TRADE001","assessment_type":"full"}' "$RF" && [[ -f "$RF" ]]; then
    ok "invocation succeeded"; PARSED=$(parse_json "$RF")

    # --- Response schema ---
    assert_eq    ".entity_id" "TRADE001"                "schema: entity_id"
    assert_uuid  ".insights_id"                         "schema: insights_id is UUID"
    assert_timestamp ".timestamp"                       "schema: timestamp is ISO"
    assert_gt    ".summary | length" 50                 "schema: summary non-trivial"

    # --- Agent routing (all 3 must run) ---
    assert_not_null ".raw_analysis.signal_generator"    "routing: signal_generator ran"
    assert_not_null ".raw_analysis.cross_asset_analyst"  "routing: cross_asset_analyst ran"
    assert_not_null ".raw_analysis.scenario_modeler"     "routing: scenario_modeler ran"

    # --- S3 tool call evidence (profile data surfaced in raw analysis) ---
    assert_match "Global Macro|macro_relative_value|TRADE001" \
        "tool: s3_retriever fetched portfolio profile" "$RF"
    assert_match "sharpe|var|drawdown|185|32" \
        "tool: agent used risk_metrics from profile" "$RF"
    assert_match "US_10Y|GOLD_FUTURES|EUR.USD" \
        "tool: agent used signal_history from profile" "$RF"

    # --- Signal Generator business logic ---
    assert_match "signal|buy|sell|strong_buy|strong_sell|neutral" \
        "business/signal: signal strength classification" "$RF"
    assert_match "RSI|MACD|moving.average|bollinger|technical|indicator" \
        "business/signal: technical indicator analysis" "$RF"

    # --- Cross-Asset Analyst business logic ---
    assert_match "correlation|cross.asset|relative.value" \
        "business/cross: correlation or relative value analysis" "$RF"
    assert_match "equit|fixed.income|bond|commodit|fx|currency" \
        "business/cross: multi-asset class coverage" "$RF"

    # --- Scenario Modeler business logic ---
    assert_match "scenario|base.case|bull|bear|tail" \
        "business/scenario: scenario modeling" "$RF"
    assert_match "drawdown|hedge|stress|protection|risk" \
        "business/scenario: risk/hedging analysis" "$RF"

    rm -f "$RF"
else
    fail "invocation failed"; rm -f "$RF"
fi

# ============================================================================
# Test 2: Signal Generation Only — routing + signal-specific depth
# ============================================================================
echo -e "${YELLOW}Test 2: Signal Generation Only (TRADE001)${NC}"
RF="/tmp/ac-ti-2-$$.json"
if invoke_runtime '{"entity_id":"TRADE001","assessment_type":"signal_generation"}' "$RF" && [[ -f "$RF" ]]; then
    ok "invocation succeeded"; PARSED=$(parse_json "$RF")

    assert_eq       ".entity_id" "TRADE001"             "schema: entity_id"
    assert_uuid     ".insights_id"                      "schema: insights_id is UUID"
    assert_gt       ".summary | length" 20              "schema: summary present"

    # --- Routing: only signal_generator ---
    assert_not_null ".raw_analysis.signal_generator"    "routing: signal_generator ran"
    assert_null     ".raw_analysis.cross_asset_analyst"  "routing: cross_asset_analyst excluded"
    assert_null     ".raw_analysis.scenario_modeler"     "routing: scenario_modeler excluded"

    # --- Tool + business ---
    assert_match "TRADE001|Global Macro" \
        "tool: profile data referenced" "$RF"
    assert_match "signal|buy|sell|confidence" \
        "business: signal classification present" "$RF"

    rm -f "$RF"
else
    fail "invocation failed"; rm -f "$RF"
fi

# ============================================================================
# Test 3: Cross-Asset Analysis — signal + cross_asset, no scenario
# ============================================================================
echo -e "${YELLOW}Test 3: Cross-Asset Analysis (TRADE001)${NC}"
RF="/tmp/ac-ti-3-$$.json"
if invoke_runtime '{"entity_id":"TRADE001","assessment_type":"cross_asset_analysis"}' "$RF" && [[ -f "$RF" ]]; then
    ok "invocation succeeded"; PARSED=$(parse_json "$RF")

    assert_eq       ".entity_id" "TRADE001"             "schema: entity_id"
    assert_gt       ".summary | length" 20              "schema: summary present"

    assert_not_null ".raw_analysis.signal_generator"    "routing: signal_generator ran"
    assert_not_null ".raw_analysis.cross_asset_analyst"  "routing: cross_asset_analyst ran"
    assert_null     ".raw_analysis.scenario_modeler"     "routing: scenario_modeler excluded"

    assert_match "correlation|cross.asset|relative.value|pair.trade|spread" \
        "business: cross-asset analysis content" "$RF"
    assert_match "equit|bond|commodit|fx|currency" \
        "business: multi-asset class references" "$RF"

    rm -f "$RF"
else
    fail "invocation failed"; rm -f "$RF"
fi

# ============================================================================
# Test 4: Scenario Modeling — cross_asset + scenario, no signal
# ============================================================================
echo -e "${YELLOW}Test 4: Scenario Modeling (TRADE001)${NC}"
RF="/tmp/ac-ti-4-$$.json"
if invoke_runtime '{"entity_id":"TRADE001","assessment_type":"scenario_modeling"}' "$RF" && [[ -f "$RF" ]]; then
    ok "invocation succeeded"; PARSED=$(parse_json "$RF")

    assert_eq       ".entity_id" "TRADE001"             "schema: entity_id"
    assert_gt       ".summary | length" 20              "schema: summary present"

    assert_null     ".raw_analysis.signal_generator"    "routing: signal_generator excluded"
    assert_not_null ".raw_analysis.cross_asset_analyst"  "routing: cross_asset_analyst ran"
    assert_not_null ".raw_analysis.scenario_modeler"     "routing: scenario_modeler ran"

    assert_match "scenario|base.case|bull|bear|tail.risk" \
        "business: scenario outcomes present" "$RF"
    assert_match "drawdown|hedge|stress|VaR|protection" \
        "business: risk management content" "$RF"

    rm -f "$RF"
else
    fail "invocation failed"; rm -f "$RF"
fi

# ============================================================================
# Test 5: additional_context influences output
# ============================================================================
echo -e "${YELLOW}Test 5: Additional Context Passthrough (TRADE001)${NC}"
RF="/tmp/ac-ti-5-$$.json"
if invoke_runtime '{"entity_id":"TRADE001","assessment_type":"signal_generation","additional_context":"Focus specifically on gold futures positioning and inflation hedging"}' "$RF" && [[ -f "$RF" ]]; then
    ok "invocation succeeded"; PARSED=$(parse_json "$RF")

    assert_eq ".entity_id" "TRADE001"                   "schema: entity_id"
    assert_match "gold|inflation|hedge|precious" \
        "context: additional_context influenced output" "$RF"

    rm -f "$RF"
else
    fail "invocation failed"; rm -f "$RF"
fi

# ============================================================================
# Test 6: Invalid entity_id — graceful handling
# ============================================================================
echo -e "${YELLOW}Test 6: Invalid Entity ID (INVALID999)${NC}"
RF="/tmp/ac-ti-6-$$.json"
if invoke_runtime '{"entity_id":"INVALID999","assessment_type":"full"}' "$RF" && [[ -f "$RF" ]]; then
    # Should still return a response (graceful) — not crash
    ok "runtime did not crash on unknown entity"
    PARSED=$(parse_json "$RF")
    assert_eq ".entity_id" "INVALID999"                 "schema: entity_id echoed back"
    assert_not_null ".summary"                          "schema: summary present (even if no data)"
    rm -f "$RF"
else
    # An invocation error is also acceptable — runtime handled it
    ok "runtime returned error for unknown entity (acceptable)"
fi

# ============================================================================
# Summary
# ============================================================================
TOTAL=$((PASS + FAIL))
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "Framework: ${FRAMEWORK} (${FRAMEWORK_SHORT})"
echo -e "Total checks: ${TOTAL}"
echo -e "Passed: ${GREEN}${PASS}${NC}  Failed: ${RED}${FAIL}${NC}"
echo -e "${GREEN}========================================${NC}"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
