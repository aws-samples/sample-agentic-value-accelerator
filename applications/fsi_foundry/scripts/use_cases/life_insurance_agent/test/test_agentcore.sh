#!/bin/bash
set +e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/common.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/variables.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

USE_CASE_ID="${1:-life_insurance_agent}"; FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"; AWS_REGION="${AWS_REGION:-us-east-1}"
USE_CASE_ID_NORMALIZED=$(normalize_use_case_to_id "$USE_CASE_ID")
USE_CASE_ID_NORMALIZED=$(echo "$USE_CASE_ID_NORMALIZED" | tr '[:upper:]' '[:lower:]')
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")


section "Life Insurance Agent - AgentCore Test Suite"
info "Framework: $FRAMEWORK ($FRAMEWORK_SHORT) | Region: $AWS_REGION"

# Resolve runtime ARN from CloudFormation
USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")

REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')

STACK_NAME="ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"
LEGACY_STACK_NAME="ava-${USE_CASE_ID_CFN}-agentcore-runtime-${REGION_SUFFIX}"

if [[ -z "${RUNTIME_ARN:-}" ]]; then
    RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' --output text 2>/dev/null)
    if [[ -z "$RUNTIME_ARN" || "$RUNTIME_ARN" == "None" ]]; then
        RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name "$LEGACY_STACK_NAME" --region "$AWS_REGION" \
            --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' --output text 2>/dev/null)
    fi
fi
[[ -z "$RUNTIME_ARN" || "$RUNTIME_ARN" == "None" ]] && die "Could not get AgentCore runtime ARN. Deploy first or set RUNTIME_ARN."
info "Runtime ARN: $RUNTIME_ARN"
echo ""

PASSED=0; FAILED=0; MAX_RETRIES=2; RETRY_DELAY=20

invoke_ac() {
    local payload="$1"
    for attempt in $(seq 1 $MAX_RETRIES); do
        local outfile="/tmp/ac_lia_$$_$RANDOM.json"
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

assert_eq()       { [[ "$1" == "$2" ]] && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected '$2')"; return 1; }; }
assert_gte()      { [[ "$1" -ge "$2" ]] 2>/dev/null && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected >= $2)"; return 1; }; }
assert_lte()      { [[ "$1" -le "$2" ]] 2>/dev/null && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected <= $2)"; return 1; }; }
assert_contains() { echo "$1" | grep -qi "$2" && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (pattern '$2' not found)"; return 1; }; }
assert_json()     { echo "$1" | jq -e "$2" > /dev/null 2>&1 && { info "    ✓ $3"; return 0; } || { error "    ✗ $3"; return 1; }; }
assert_in()       { echo "$2" | grep -qw "$1" && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected one of: $2)"; return 1; }; }
assert_float_gte(){ awk "BEGIN{exit(!($1>=$2))}" && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected >= $2)"; return 1; }; }
assert_float_lte(){ awk "BEGIN{exit(!($1<=$2))}" && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected <= $2)"; return 1; }; }

# ============================================================================
# Test 1: APP001 Full Assessment — Agent Logic + Tool Call Verification
# ============================================================================
section "Test 1: APP001 Full Assessment — Agent Logic + Tool Calls"
info "Data: 35yo family builder, \$120K income, employer coverage only, heart disease family history"
BODY=$(invoke_ac '{"applicant_id":"APP001","analysis_type":"full"}')
if [[ -z "$BODY" ]]; then
    error "APP001 Full FAILED (no response — runtime may not be ready)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0

    # --- Structure ---
    assert_eq "$(echo "$BODY" | jq -r '.applicant_id')" "APP001" "applicant_id is APP001" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.assessment_id' "assessment_id present" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.needs_analysis and .product_recommendations and .underwriting_assessment' "all 3 agent results present" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.summary | length > 0' "summary is non-empty" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # --- Needs Analyst business logic ---
    LIFE_STAGE=$(echo "$BODY" | jq -r '.needs_analysis.life_stage // ""')
    assert_eq "$LIFE_STAGE" "family_building" "needs: life_stage is family_building" && SUB=$((SUB+1)); TOT=$((TOT+1))

    REC_COV=$(echo "$BODY" | jq -r '.needs_analysis.recommended_coverage // 0')
    assert_float_gte "$REC_COV" 1000000 "needs: recommended_coverage $REC_COV >= 1,000,000" && SUB=$((SUB+1)); TOT=$((TOT+1))

    COV_GAP=$(echo "$BODY" | jq -r '.needs_analysis.coverage_gap // 0')
    assert_float_gte "$COV_GAP" 500000 "needs: coverage_gap $COV_GAP >= 500,000" && SUB=$((SUB+1)); TOT=$((TOT+1))

    INC_YEARS=$(echo "$BODY" | jq -r '.needs_analysis.income_replacement_years // 0')
    assert_gte "$INC_YEARS" 5 "needs: income_replacement_years $INC_YEARS >= 5" && SUB=$((SUB+1)); TOT=$((TOT+1))

    KEY_NEEDS=$(echo "$BODY" | jq -r '.needs_analysis.key_needs[]' 2>/dev/null | tr '\n' '|')
    assert_contains "$KEY_NEEDS" "income\|mortgage\|coverage\|education" "needs: key_needs reference income/mortgage/coverage/education" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # --- Product Matcher business logic ---
    PRIMARY=$(echo "$BODY" | jq -r '.product_recommendations.primary_product // ""')
    assert_in "$PRIMARY" "term whole_life universal variable indexed_universal" "product: primary_product '$PRIMARY' is valid enum" && SUB=$((SUB+1)); TOT=$((TOT+1))

    PROD_COV=$(echo "$BODY" | jq -r '.product_recommendations.coverage_amount // 0')
    assert_float_gte "$PROD_COV" 100000 "product: coverage_amount $PROD_COV >= 100,000" && SUB=$((SUB+1)); TOT=$((TOT+1))

    PREMIUM=$(echo "$BODY" | jq -r '.product_recommendations.estimated_premium // 0')
    assert_float_gte "$PREMIUM" 10 "product: estimated_premium $PREMIUM >= 10" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_float_lte "$PREMIUM" 1000 "product: estimated_premium $PREMIUM <= 1000 (reasonable)" && SUB=$((SUB+1)); TOT=$((TOT+1))

    REC_PRODS=$(echo "$BODY" | jq '.product_recommendations.recommended_products | length' 2>/dev/null)
    assert_gte "${REC_PRODS:-0}" 1 "product: at least 1 recommended product" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # --- Underwriting Assistant business logic ---
    RISK_CAT=$(echo "$BODY" | jq -r '.underwriting_assessment.risk_category // ""')
    assert_in "$RISK_CAT" "preferred_plus preferred standard_plus standard substandard" "underwriting: risk_category '$RISK_CAT' is valid enum" && SUB=$((SUB+1)); TOT=$((TOT+1))

    CONF=$(echo "$BODY" | jq -r '.underwriting_assessment.confidence_score // 0')
    assert_float_gte "$CONF" 0.5 "underwriting: confidence_score $CONF >= 0.5" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_float_lte "$CONF" 1.0 "underwriting: confidence_score $CONF <= 1.0" && SUB=$((SUB+1)); TOT=$((TOT+1))

    HEALTH=$(echo "$BODY" | jq -r '.underwriting_assessment.health_factors[]' 2>/dev/null | tr '\n' '|')
    assert_contains "$HEALTH" "heart\|BMI\|smok\|age\|health" "underwriting: health_factors reference heart/BMI/smoking/age" && SUB=$((SUB+1)); TOT=$((TOT+1))

    ACTIONS=$(echo "$BODY" | jq -r '.underwriting_assessment.recommended_actions[]' 2>/dev/null | tr '\n' '|')
    assert_contains "$ACTIONS" "exam\|EKG\|blood\|lab\|medical\|screen" "underwriting: recommended_actions include medical exams" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # --- S3 tool call verification (raw_analysis should reference APP001 profile data) ---
    RAW_NEEDS=$(echo "$BODY" | jq -r '.raw_analysis.needs_analysis.analysis // ""')
    assert_contains "$RAW_NEEDS" "120.000\|120,000\|\$120" "tool: needs agent retrieved \$120K income from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_contains "$RAW_NEEDS" "240.000\|240,000\|\$240" "tool: needs agent retrieved \$240K employer coverage from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_contains "$RAW_NEEDS" "350.000\|350,000\|\$350" "tool: needs agent retrieved \$350K mortgage from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))

    RAW_UW=$(echo "$BODY" | jq -r '.raw_analysis.underwriting_assessment.analysis // ""')
    assert_contains "$RAW_UW" "heart\|cardiac" "tool: underwriting agent retrieved heart disease family history from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_contains "$RAW_UW" "24.5\|24,5" "tool: underwriting agent retrieved BMI 24.5 from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_contains "$RAW_UW" "non.smok\|non-smok\|Non.smok" "tool: underwriting agent retrieved non-smoker status from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # --- Synthesis quality ---
    SUMMARY=$(echo "$BODY" | jq -r '.summary // ""')
    assert_contains "$SUMMARY" "coverage\|insurance\|recommend\|protection" "synthesis: summary discusses coverage/insurance" && SUB=$((SUB+1)); TOT=$((TOT+1))

    [[ $SUB -eq $TOT ]] && { success "APP001 Full PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "APP001 Full PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 2: Needs Analysis Only — Routing + Agent Isolation
# ============================================================================
section "Test 2: Needs Analysis Only (APP001) — Routing"
BODY=$(invoke_ac '{"applicant_id":"APP001","analysis_type":"needs_analysis_only"}')
if [[ -z "$BODY" ]]; then
    error "Needs only FAILED (no response)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0
    assert_eq "$(echo "$BODY" | jq -r '.applicant_id')" "APP001" "applicant_id is APP001" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.needs_analysis != null' "needs_analysis present" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.product_recommendations == null' "product_recommendations is null" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.underwriting_assessment == null' "underwriting_assessment is null" && SUB=$((SUB+1)); TOT=$((TOT+1))

    LIFE_STAGE=$(echo "$BODY" | jq -r '.needs_analysis.life_stage // ""')
    assert_eq "$LIFE_STAGE" "family_building" "needs: life_stage is family_building" && SUB=$((SUB+1)); TOT=$((TOT+1))

    COV_GAP=$(echo "$BODY" | jq -r '.needs_analysis.coverage_gap // 0')
    assert_float_gte "$COV_GAP" 500000 "needs: coverage_gap $COV_GAP >= 500,000" && SUB=$((SUB+1)); TOT=$((TOT+1))

    [[ $SUB -eq $TOT ]] && { success "Needs only PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "Needs only PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 3: Product Matching Only — Routing + Agent Isolation
# ============================================================================
section "Test 3: Product Matching Only (APP001) — Routing"
BODY=$(invoke_ac '{"applicant_id":"APP001","analysis_type":"product_matching_only"}')
if [[ -z "$BODY" ]]; then
    error "Product only FAILED (no response)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0
    assert_json "$BODY" '.product_recommendations != null' "product_recommendations present" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.needs_analysis == null' "needs_analysis is null" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.underwriting_assessment == null' "underwriting_assessment is null" && SUB=$((SUB+1)); TOT=$((TOT+1))

    PRIMARY=$(echo "$BODY" | jq -r '.product_recommendations.primary_product // ""')
    assert_in "$PRIMARY" "term whole_life universal variable indexed_universal" "product: primary_product is valid enum" && SUB=$((SUB+1)); TOT=$((TOT+1))

    PREMIUM=$(echo "$BODY" | jq -r '.product_recommendations.estimated_premium // 0')
    assert_float_gte "$PREMIUM" 10 "product: estimated_premium $PREMIUM >= 10" && SUB=$((SUB+1)); TOT=$((TOT+1))

    [[ $SUB -eq $TOT ]] && { success "Product only PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "Product only PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 4: Underwriting Only — Routing + Agent Isolation
# ============================================================================
section "Test 4: Underwriting Only (APP001) — Routing"
BODY=$(invoke_ac '{"applicant_id":"APP001","analysis_type":"underwriting_only"}')
if [[ -z "$BODY" ]]; then
    error "Underwriting only FAILED (no response)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0
    assert_json "$BODY" '.underwriting_assessment != null' "underwriting_assessment present" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.needs_analysis == null' "needs_analysis is null" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.product_recommendations == null' "product_recommendations is null" && SUB=$((SUB+1)); TOT=$((TOT+1))

    RISK_CAT=$(echo "$BODY" | jq -r '.underwriting_assessment.risk_category // ""')
    assert_in "$RISK_CAT" "preferred_plus preferred standard_plus standard substandard" "underwriting: risk_category is valid enum" && SUB=$((SUB+1)); TOT=$((TOT+1))

    CONF=$(echo "$BODY" | jq -r '.underwriting_assessment.confidence_score // 0')
    assert_float_gte "$CONF" 0.5 "underwriting: confidence_score $CONF >= 0.5" && SUB=$((SUB+1)); TOT=$((TOT+1))

    [[ $SUB -eq $TOT ]] && { success "Underwriting only PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "Underwriting only PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 5: Invalid Applicant ID — Graceful Error Handling
# ============================================================================
section "Test 5: Invalid Applicant ID"
BODY=$(invoke_ac '{"applicant_id":"INVALID999","analysis_type":"full"}')
if [[ -n "$BODY" ]]; then
    success "Invalid ID PASSED (graceful handling)"; PASSED=$((PASSED+1))
else
    error "Invalid ID FAILED (no response)"; FAILED=$((FAILED+1))
fi
echo ""

# ============================================================================
# Summary
# ============================================================================
TOTAL=$((PASSED + FAILED))
section "Test Summary: $PASSED/$TOTAL passed, $FAILED failed"
info "Runtime: $RUNTIME_ARN"
info "Framework: $FRAMEWORK | Region: $AWS_REGION"
[[ $FAILED -eq 0 ]] && { success "All tests passed! 🎉"; exit 0; } || { error "Some tests failed."; exit 1; }
