#!/bin/bash
set +e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/common.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/variables.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

USE_CASE_ID="${USE_CASE_ID:-market_surveillance}"; FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"; AWS_REGION="${AWS_REGION:-us-east-1}"
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")
USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")

section "Market Surveillance - AgentCore Test Suite"
info "Framework: $FRAMEWORK ($FRAMEWORK_SHORT) | Region: $AWS_REGION"

if [[ -z "${RUNTIME_ARN:-}" ]]; then
    REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')
    STACK_NAME="ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"
    RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' --output text 2>/dev/null)
fi
[[ -z "$RUNTIME_ARN" ]] && die "Could not get AgentCore runtime ARN. Set RUNTIME_ARN env var."
info "Runtime ARN: $RUNTIME_ARN"
echo ""

PASSED=0; FAILED=0; MAX_RETRIES=3; RETRY_DELAY=30

invoke_ac() {
    local payload="$1"
    for attempt in $(seq 1 $MAX_RETRIES); do
        local outfile="/tmp/ac_surv_$$_$RANDOM.json"
        aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn "$RUNTIME_ARN" \
            --payload "$(echo -n "$payload" | base64)" --region "$AWS_REGION" \
            --cli-read-timeout 300 "$outfile" 2>/tmp/agentcore-invoke-error.log
        if [ -f "$outfile" ] && [ -s "$outfile" ]; then
            cat "$outfile"; rm -f "$outfile"; return 0
        fi
        rm -f "$outfile"
        [[ $attempt -lt $MAX_RETRIES ]] && { info "  Retry $attempt/$MAX_RETRIES (waiting ${RETRY_DELAY}s)..." >&2; sleep $RETRY_DELAY; }
    done
    return 1
}

assert_eq()  { [[ "$1" == "$2" ]] && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected '$2')"; return 1; }; }
assert_gte() { [[ "$1" -ge "$2" ]] 2>/dev/null && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected >= $2)"; return 1; }; }
assert_lte() { [[ "$1" -le "$2" ]] 2>/dev/null && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected <= $2)"; return 1; }; }
assert_contains() { echo "$1" | grep -qi "$2" && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (pattern '$2' not found)"; return 1; }; }
assert_json() { echo "$1" | jq -e "$2" > /dev/null 2>&1 && { info "    ✓ $3"; return 0; } || { error "    ✗ $3"; return 1; }; }

# ============================================================================
# Test 1: SURV001 Full Surveillance — Agent Logic + Tool Call Verification
# ============================================================================
section "Test 1: SURV001 Full Surveillance — Agent Logic"
info "Data: pre-announcement ACME trades, MNPI receipt, external broker comms"
BODY=$(invoke_ac '{"customer_id":"SURV001","surveillance_type":"full"}')
if [[ -z "$BODY" ]]; then
    error "SURV001 FAILED (no response — runtime may not be ready)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0

    # Structure
    assert_eq "$(echo "$BODY" | jq -r '.customer_id')" "SURV001" "customer_id is SURV001" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.trade_pattern and .comms_monitor and .alert' "all 3 agent results present" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Trade Pattern Agent logic
    PATTERNS=$(echo "$BODY" | jq -r '.trade_pattern.patterns_detected[]' 2>/dev/null | tr '\n' '|')
    assert_contains "$PATTERNS" "insider trading" "trade agent detected insider trading" && SUB=$((SUB+1)); TOT=$((TOT+1))
    RISK=$(echo "$BODY" | jq -r '.trade_pattern.risk_score // 0')
    assert_gte "$RISK" 50 "risk_score $RISK >= 50" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Communication Monitor Agent logic
    FLAGGED=$(echo "$BODY" | jq -r '.comms_monitor.flagged_communications[]' 2>/dev/null | tr '\n' '|')
    assert_contains "$FLAGGED" "MNPI" "comms agent flagged MNPI sharing" && SUB=$((SUB+1)); TOT=$((TOT+1))
    CONCERNS=$(echo "$BODY" | jq -r '.comms_monitor.compliance_concerns[]' 2>/dev/null | tr '\n' '|')
    assert_contains "$CONCERNS" "barrier\|insider" "comms agent raised barrier/insider concern" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Alert Generator Agent logic
    SEV=$(echo "$BODY" | jq -r '.alert.severity')
    [[ "$SEV" == "high" || "$SEV" == "critical" ]] && { info "    ✓ alert severity is $SEV"; SUB=$((SUB+1)); } || { error "    ✗ alert severity '$SEV' (expected high|critical)"; }; TOT=$((TOT+1))
    assert_eq "$(echo "$BODY" | jq -r '.alert.escalation_required')" "true" "escalation_required is true" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_contains "$(echo "$BODY" | jq -r '.alert.alert_type')" "insider" "alert_type references insider trading" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Orchestrator synthesis
    assert_contains "$(echo "$BODY" | jq -r '.summary // ""')" "escalat\|report\|investigat" "synthesis recommends escalation" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # S3 tool call verification
    RAW_TRADE=$(echo "$BODY" | jq -r '.raw_analysis.trade_result.analysis // ""')
    assert_contains "$RAW_TRADE" "ACME\|acme" "trade agent retrieved ACME from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_contains "$RAW_TRADE" "TRD-4521\|Michael Chen" "trade agent retrieved trader identity from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_contains "$RAW_TRADE" "50.000\|50,000\|75.000\|75,000\|125.000\|125,000" "trade agent referenced trade quantities from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))

    [[ $SUB -eq $TOT ]] && { success "SURV001 PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "SURV001 PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 2: SURV002 Full Surveillance — Clean Trader (Negative Case)
# ============================================================================
section "Test 2: SURV002 Full Surveillance — Clean Trader"
info "Data: routine treasury trades, internal comms only, no flags"
BODY=$(invoke_ac '{"customer_id":"SURV002","surveillance_type":"full"}')
if [[ -z "$BODY" ]]; then
    error "SURV002 FAILED (no response)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0
    assert_eq "$(echo "$BODY" | jq -r '.customer_id')" "SURV002" "customer_id is SURV002" && SUB=$((SUB+1)); TOT=$((TOT+1))
    RISK2=$(echo "$BODY" | jq -r '.trade_pattern.risk_score // 0')
    assert_lte "$RISK2" 60 "risk_score $RISK2 <= 60 (clean data)" && SUB=$((SUB+1)); TOT=$((TOT+1))
    SEV2=$(echo "$BODY" | jq -r '.alert.severity')
    [[ "$SEV2" == "low" || "$SEV2" == "medium" ]] && { info "    ✓ alert severity is $SEV2 (not critical)"; SUB=$((SUB+1)); } || { error "    ✗ alert severity '$SEV2' (expected low|medium)"; }; TOT=$((TOT+1))
    assert_contains "$(echo "$BODY" | jq -r '.summary // ""')" "clear\|no.* action\|standard\|routine\|low" "synthesis indicates clear/routine" && SUB=$((SUB+1)); TOT=$((TOT+1))
    RAW_TRADE2=$(echo "$BODY" | jq -r '.raw_analysis.trade_result.analysis // ""')
    assert_contains "$RAW_TRADE2" "UST10Y\|Sarah Williams\|TRD-7890\|Fixed Income" "trade agent retrieved SURV002-specific data from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))
    [[ $SUB -eq $TOT ]] && { success "SURV002 PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "SURV002 PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 3: Trade Only Routing
# ============================================================================
section "Test 3: Trade Only Routing (SURV001)"
BODY=$(invoke_ac '{"customer_id":"SURV001","surveillance_type":"trade_only"}')
if [[ -z "$BODY" ]]; then
    error "Trade only FAILED (no response)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0
    assert_json "$BODY" '.trade_pattern' "trade_pattern present" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.comms_monitor == null' "comms_monitor is null" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.alert == null' "alert is null" && SUB=$((SUB+1)); TOT=$((TOT+1))
    [[ $SUB -eq $TOT ]] && { success "Trade only PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "Trade only PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 4: Invalid ID — graceful error handling
# ============================================================================
section "Test 4: Invalid Surveillance ID"
BODY=$(invoke_ac '{"customer_id":"INVALID999","surveillance_type":"full"}')
if [[ -n "$BODY" ]]; then
    success "Invalid ID PASSED (graceful handling)"; PASSED=$((PASSED+1))
else error "Invalid ID FAILED"; FAILED=$((FAILED+1)); fi
echo ""

# ============================================================================
# Summary
# ============================================================================
TOTAL=$((PASSED + FAILED))
section "Test Summary: $PASSED/$TOTAL passed, $FAILED failed"
[[ $FAILED -eq 0 ]] && { success "All tests passed! 🎉"; exit 0; } || { error "Some tests failed."; exit 1; }
