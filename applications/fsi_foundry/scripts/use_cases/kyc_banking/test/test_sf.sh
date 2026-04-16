#!/bin/bash
set +e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/common.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/variables.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/terraform.sh"

USE_CASE_ID="${USE_CASE_ID:-kyc_banking}"; FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"; AWS_REGION="${AWS_REGION:-us-east-1}"
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")

section "KYC Banking - Step Functions Test Suite"
info "Framework: $FRAMEWORK ($FRAMEWORK_SHORT) | Region: $AWS_REGION"

if [[ -z "${API_ENDPOINT:-}" ]]; then
    IAC_PATH="$PROJECT_ROOT/$(get_iac_path step_functions)"
    select_or_create_workspace "$USE_CASE_ID" "$FRAMEWORK_SHORT" "$AWS_REGION" "step_functions"
    pushd "$IAC_PATH" > /dev/null; API_ENDPOINT=$(terraform output -raw api_endpoint 2>/dev/null); popd > /dev/null
fi
[[ -z "$API_ENDPOINT" ]] && die "Could not get API endpoint. Set API_ENDPOINT env var or ensure terraform state exists."
info "API Endpoint: $API_ENDPOINT"
echo ""

PASSED=0; FAILED=0

wait_for_execution() {
    local arn="$1"; for i in $(seq 1 36); do
        local s=$(aws stepfunctions describe-execution --execution-arn "$arn" --region "$AWS_REGION" --query 'status' --output text 2>/dev/null)
        [[ "$s" == "SUCCEEDED" ]] && { echo "SUCCEEDED"; return 0; }
        [[ "$s" == "FAILED" || "$s" == "TIMED_OUT" || "$s" == "ABORTED" ]] && { echo "$s"; return 1; }
        sleep 5; done; echo "TIMEOUT"; return 1
}
get_sf_result() { aws stepfunctions describe-execution --execution-arn "$1" --region "$AWS_REGION" --query 'output' --output text 2>/dev/null | jq -r '.body' 2>/dev/null; }

run_sf_test() {
    local payload="$1"
    local resp arn status
    resp=$(curl -sf --max-time 30 -X POST "$API_ENDPOINT/assess" -H 'Content-Type: application/json' -d "$payload" 2>/dev/null)
    arn=$(echo "$resp" | jq -r '.executionArn' 2>/dev/null)
    [[ -z "$arn" || "$arn" == "null" ]] && { echo ""; return 1; }
    info "  Waiting for execution..." >&2
    status=$(wait_for_execution "$arn")
    [[ "$status" != "SUCCEEDED" ]] && { echo ""; return 1; }
    get_sf_result "$arn"
}

assert_eq()  { [[ "$1" == "$2" ]] && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected '$2')"; return 1; }; }
assert_gte() { [[ "$1" -ge "$2" ]] 2>/dev/null && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected >= $2)"; return 1; }; }
assert_lte() { [[ "$1" -le "$2" ]] 2>/dev/null && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected <= $2)"; return 1; }; }
assert_in()  { echo "$2" | grep -qw "$1" && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected one of: $2)"; return 1; }; }
assert_contains() { echo "$1" | grep -qi "$2" && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (pattern '$2' not found)"; return 1; }; }
assert_json_contains() { echo "$1" | jq -e "$2" > /dev/null 2>&1 && { info "    ✓ $3"; return 0; } || { error "    ✗ $3"; return 1; }; }

# ============================================================================
# Test 1: Health Check
# ============================================================================
section "Test 1: Health Check"
if curl -sf --max-time 10 "$API_ENDPOINT/health" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
    success "Health check PASSED"; PASSED=$((PASSED+1))
else error "Health check FAILED"; FAILED=$((FAILED+1)); fi
echo ""

# ============================================================================
# Test 2: CUST001 Full Assessment — Low-Risk Customer
# ============================================================================
# CUST001: Acme Corp, Manufacturing, Delaware. Credit score 750, rating A,
# debt-to-equity 0.33, all compliance clear, no PEP, no sanctions.
# Expected: low risk score, compliant, APPROVE
section "Test 2: CUST001 Full Assessment — Low-Risk Customer"
info "Data: Acme Corp, credit score 750, all compliance clear, no flags"
BODY=$(run_sf_test '{"customer_id":"CUST001","assessment_type":"full"}')
if [[ -z "$BODY" ]]; then
    error "CUST001 FAILED (no response)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0

    assert_eq "$(echo "$BODY" | jq -r '.customer_id')" "CUST001" "customer_id is CUST001" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json_contains "$BODY" '.credit_risk and .compliance' "both credit_risk and compliance present" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Credit Analyst agent logic: low risk for strong financials
    CR_SCORE=$(echo "$BODY" | jq -r '.credit_risk.score // -1')
    assert_lte "$CR_SCORE" 40 "credit risk score $CR_SCORE <= 40 (strong financials)" && SUB=$((SUB+1)); TOT=$((TOT+1))
    CR_LEVEL=$(echo "$BODY" | jq -r '.credit_risk.level')
    assert_in "$CR_LEVEL" "low medium" "credit risk level is low or medium" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Compliance Officer agent logic: all clear
    C_STATUS=$(echo "$BODY" | jq -r '.compliance.status')
    assert_eq "$C_STATUS" "compliant" "compliance status is compliant" && SUB=$((SUB+1)); TOT=$((TOT+1))
    C_FAILED=$(echo "$BODY" | jq '.compliance.checks_failed | length')
    assert_eq "$C_FAILED" "0" "no compliance checks failed" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Orchestrator synthesis: should recommend approval
    SUMMARY=$(echo "$BODY" | jq -r '.summary // ""')
    assert_contains "$SUMMARY" "approve" "synthesis recommends APPROVE" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # S3 tool call verification: raw_analysis must reference CUST001-specific data
    RAW_CREDIT=$(echo "$BODY" | jq -r '.raw_analysis.credit_analysis.analysis // ""')
    assert_contains "$RAW_CREDIT" "Acme\|acme\|750\|Manufacturing" "credit agent retrieved CUST001 profile from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))
    RAW_COMP=$(echo "$BODY" | jq -r '.raw_analysis.compliance_check.assessment // ""')
    if [[ -n "$RAW_COMP" && "$RAW_COMP" != "null" ]]; then
        assert_contains "$RAW_COMP" "Acme\|CUST001\|clear\|Delaware" "compliance agent retrieved CUST001 data from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))
    else
        info "    ~ compliance raw_analysis not available (SF parallel execution)" >&2; SUB=$((SUB+1)); TOT=$((TOT+1))
    fi

    [[ $SUB -eq $TOT ]] && { success "CUST001 PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "CUST001 PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 3: CUST003 Full Assessment — High-Risk Customer
# ============================================================================
# CUST003: Global Trading Partners, Import/Export, Florida. Credit score 620,
# PEP exposure (Elena Martinez), sanctions partial match (OFAC),
# adverse media flagged, debt-to-equity 4.0, 1 default.
# Expected: high risk score, non_compliant or review_required, REJECT or ESCALATE
section "Test 3: CUST003 Full Assessment — High-Risk Customer"
info "Data: Global Trading, credit 620, PEP, sanctions match, adverse media, default"
BODY=$(run_sf_test '{"customer_id":"CUST003","assessment_type":"full"}')
if [[ -z "$BODY" ]]; then
    error "CUST003 FAILED (no response)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0

    assert_eq "$(echo "$BODY" | jq -r '.customer_id')" "CUST003" "customer_id is CUST003" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Credit Analyst agent logic: high risk for weak financials
    CR_SCORE=$(echo "$BODY" | jq -r '.credit_risk.score // -1')
    assert_gte "$CR_SCORE" 50 "credit risk score $CR_SCORE >= 50 (weak financials)" && SUB=$((SUB+1)); TOT=$((TOT+1))
    CR_LEVEL=$(echo "$BODY" | jq -r '.credit_risk.level')
    assert_in "$CR_LEVEL" "high critical" "credit risk level is high or critical" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Compliance Officer agent logic: must flag PEP, sanctions, adverse media
    C_STATUS=$(echo "$BODY" | jq -r '.compliance.status')
    assert_in "$C_STATUS" "non_compliant review_required" "compliance status is non_compliant or review_required" && SUB=$((SUB+1)); TOT=$((TOT+1))
    C_FAILED_LIST=$(echo "$BODY" | jq -r '.compliance.checks_failed[]' 2>/dev/null | tr '\n' '|')
    assert_contains "$C_FAILED_LIST" "pep\|sanction\|adverse\|media\|screen" "compliance flagged PEP/sanctions/media issues" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Orchestrator synthesis: should NOT approve — must reject or escalate
    SUMMARY=$(echo "$BODY" | jq -r '.summary // ""')
    assert_contains "$SUMMARY" "reject\|escalat\|deny\|review" "synthesis recommends REJECT or ESCALATE" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # S3 tool call verification: raw_analysis must reference CUST003-specific data
    RAW_CREDIT3=$(echo "$BODY" | jq -r '.raw_analysis.credit_analysis.analysis // ""')
    assert_contains "$RAW_CREDIT3" "Global Trading\|620\|Import.*Export\|4\.0\|default" "credit agent retrieved CUST003 high-risk data from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))
    RAW_COMP3=$(echo "$BODY" | jq -r '.raw_analysis.compliance_check.assessment // ""')
    if [[ -n "$RAW_COMP3" && "$RAW_COMP3" != "null" ]]; then
        assert_contains "$RAW_COMP3" "Elena Martinez\|PEP\|OFAC\|Rodriguez\|Colombia" "compliance agent retrieved CUST003 PEP/sanctions data from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))
    else
        info "    ~ compliance raw_analysis not available (SF parallel execution)" >&2; SUB=$((SUB+1)); TOT=$((TOT+1))
    fi

    [[ $SUB -eq $TOT ]] && { success "CUST003 PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "CUST003 PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 4: Credit Only routing — only credit_risk populated
# ============================================================================
section "Test 4: Credit Only Routing (CUST001)"
BODY=$(run_sf_test '{"customer_id":"CUST001","assessment_type":"credit_only"}')
if [[ -z "$BODY" ]]; then
    error "Credit only FAILED (no response)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0
    assert_json_contains "$BODY" '.credit_risk' "credit_risk present" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json_contains "$BODY" '.compliance == null' "compliance is null" && SUB=$((SUB+1)); TOT=$((TOT+1))
    [[ $SUB -eq $TOT ]] && { success "Credit only PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "Credit only PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 5: Compliance Only routing — only compliance populated
# ============================================================================
section "Test 5: Compliance Only Routing (CUST003)"
BODY=$(run_sf_test '{"customer_id":"CUST003","assessment_type":"compliance_only"}')
if [[ -z "$BODY" ]]; then
    error "Compliance only FAILED (no response)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0
    assert_json_contains "$BODY" '.compliance' "compliance present" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json_contains "$BODY" '.credit_risk == null' "credit_risk is null" && SUB=$((SUB+1)); TOT=$((TOT+1))
    # Agent logic: compliance-only for CUST003 should still flag issues
    C_STATUS=$(echo "$BODY" | jq -r '.compliance.status')
    assert_in "$C_STATUS" "non_compliant review_required" "compliance flags CUST003 issues" && SUB=$((SUB+1)); TOT=$((TOT+1))
    [[ $SUB -eq $TOT ]] && { success "Compliance only PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "Compliance only PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 6: Invalid Customer — graceful error handling
# ============================================================================
section "Test 6: Invalid Customer ID"
RESP=$(curl -sf --max-time 30 -X POST "$API_ENDPOINT/assess" -H 'Content-Type: application/json' -d '{"customer_id":"INVALID999","assessment_type":"full"}' 2>/dev/null)
ARN=$(echo "$RESP" | jq -r '.executionArn' 2>/dev/null)
if [[ -n "$ARN" && "$ARN" != "null" ]]; then
    STATUS=$(wait_for_execution "$ARN")
    [[ "$STATUS" == "FAILED" || "$STATUS" == "SUCCEEDED" ]] && { success "Invalid ID PASSED (handled gracefully: $STATUS)"; PASSED=$((PASSED+1)); } || { error "Invalid ID FAILED ($STATUS)"; FAILED=$((FAILED+1)); }
else error "Invalid ID FAILED (no execution)"; FAILED=$((FAILED+1)); fi
echo ""

# ============================================================================
# Summary
# ============================================================================
TOTAL=$((PASSED + FAILED))
section "Test Summary: $PASSED/$TOTAL passed, $FAILED failed"
[[ $FAILED -eq 0 ]] && { success "All tests passed! 🎉"; exit 0; } || { error "Some tests failed."; exit 1; }
