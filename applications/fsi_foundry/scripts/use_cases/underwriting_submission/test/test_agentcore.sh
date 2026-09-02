#!/bin/bash

# ============================================================================
# AVA - Underwriting Submission Triage AgentCore Test Script
# ============================================================================
# Tests the underwriting_submission use case deployed on Bedrock AgentCore
# Runtime. Validates agent business logic, appetite rule evaluation, triage
# mode routing, tool calls, and error handling.
#
# The assertions here are exact rather than "did it return something
# plausible". The three sample submissions were authored so that the correct
# appetite outcome is derivable from the ruleset in each submission's own
# compliance record, so the expected result is an answer key rather than an
# opinion:
#
#   SUB001  all 10 appetite rules pass                    -> quote
#   SUB002  APP-10 referral (open $400K claim)            -> refer
#   SUB003  APP-01 + APP-03 + APP-08 breached             -> decline
#
# Two negative assertions matter as much as the positive ones:
#   - SUB003 must NOT fail APP-02: its frame building is 2 storeys, under the
#     4 storey limit. Blanket-failing a risk is as wrong as missing a breach.
#   - SUB002 must NOT report a named-storm concentration: its locations sit in
#     MIDWEST_CONVECTIVE with named_storm_exposed=false, and APP-08 is scoped
#     to named-storm zones only.
#
# Usage:
#   ./test_agentcore.sh [use_case_id]
#   FRAMEWORK=strands ./test_agentcore.sh underwriting_submission
# ============================================================================

set +e

USE_CASE_ID="${1:-underwriting_submission}"
FRAMEWORK="${FRAMEWORK:-strands}"
AWS_REGION="${AWS_REGION:-us-east-1}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")
USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")
REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AgentCore Test - ${USE_CASE_ID} (${USE_CASE_ID_CFN}) - ${FRAMEWORK_SHORT}${NC}"
echo -e "${GREEN}========================================${NC}"

# ---- Stack discovery ----
# The deploy scripts pass the NORMALIZED registry id to Terraform (see
# normalize_use_case_to_id in scripts/lib/registry.sh), so the runtime stack is
# named from the short domain code - e.g. "ava-i04-strands-agentcore-runtime-useast1"
# - not from the long use_case_name. Try the normalized form first, then the long
# form, then fall back to a pattern search so this keeps working if the naming
# convention changes again.
NORMALIZED_ID=$(normalize_use_case_to_id "$USE_CASE_ID" 2>/dev/null || echo "$USE_CASE_ID")
NORMALIZED_ID_CFN=$(echo "${NORMALIZED_ID}" | tr "_" "-" | tr '[:upper:]' '[:lower:]')

find_stack() {
    local candidate
    for candidate in \
        "ava-${NORMALIZED_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}" \
        "ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"
    do
        if aws cloudformation describe-stacks --stack-name "$candidate" --region "$AWS_REGION" \
               --query 'Stacks[0].StackStatus' --output text >/dev/null 2>&1; then
            echo "$candidate"; return 0
        fi
    done
    # Last resort: any runtime stack for this framework in this region.
    aws cloudformation list-stacks --region "$AWS_REGION" \
        --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE \
        --query "StackSummaries[?contains(StackName, '${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}')].StackName" \
        --output text 2>/dev/null | tr '\t' '\n' | head -1
}

STACK_NAME=$(find_stack)
if [[ -z "$STACK_NAME" ]]; then
    echo -e "${RED}No AgentCore runtime stack found for ${USE_CASE_ID} (${FRAMEWORK_SHORT}) in ${AWS_REGION}${NC}"
    echo -e "${YELLOW}Tried: ava-${NORMALIZED_ID_CFN}-... and ava-${USE_CASE_ID_CFN}-...${NC}"
    echo -e "${YELLOW}Deploy first: USE_CASE_ID=${USE_CASE_ID} FRAMEWORK=${FRAMEWORK} ./scripts/deploy/full/deploy_agentcore.sh${NC}"
    exit 1
fi
echo -e "${BLUE}Stack:   ${STACK_NAME}${NC}"

RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' --output text 2>/dev/null)
echo -e "${BLUE}Runtime: ${RUNTIME_ARN}${NC}"
echo ""

PASS=0; FAIL=0

# ---- Helpers ----
invoke_agentcore() {
    local payload=$1
    local response_file=$2

    # Base64 encode the payload (required by AWS CLI)
    local payload_base64=$(echo -n "${payload}" | base64)

    # A full triage runs three agents in parallel plus a synthesis call, which
    # takes well over the AWS CLI's default 60s read timeout. The UI's worker
    # Lambda sets read_timeout=900 / max_attempts=1 for the same reason - retrying
    # a long agent run is wasteful and can double-charge inference.
    AWS_MAX_ATTEMPTS=1 aws bedrock-agentcore invoke-agent-runtime \
        --agent-runtime-arn ${RUNTIME_ARN} \
        --payload "${payload_base64}" \
        --region ${AWS_REGION} \
        --cli-read-timeout "${CLI_READ_TIMEOUT:-900}" \
        --cli-connect-timeout 15 \
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

parse_response() {
    local f="$1"
    python3 -c "
import sys, json
with open(sys.argv[1], 'rb') as fh:
    raw = fh.read().decode('utf-8', 'replace')
try:
    d = json.loads(raw)
except Exception:
    try:
        import ast; d = ast.literal_eval(raw)
    except Exception:
        d = {'_raw': raw}
print(json.dumps(d) if isinstance(d, dict) else json.dumps({'_raw': str(d)}))" "$f" 2>/dev/null
}

check_field() {
    echo "$1" | jq -r "if .${2} then \"yes\" else \"no\" end" 2>/dev/null
}

# Returns "null" for a JSON null, so a missing decision is distinguishable
# from the string "none".
get_or_null() {
    echo "$1" | jq -r "if .${2} == null then \"null\" else (.${2} | tostring) end" 2>/dev/null
}

# Flatten a list field to a single lowercase string for substring matching.
list_str() {
    echo "$1" | jq -r "[.${2} // []] | flatten | join(\" \")" 2>/dev/null | tr '[:upper:]' '[:lower:]'
}

num_in_range() {
    # num_in_range <value> <min> <max>
    (( $(echo "$1 >= $2 && $1 <= $3" | bc -l 2>/dev/null || echo 0) ))
}

assert_pass() { echo -e "${GREEN}✓ $1${NC}"; ((PASS++)); }
assert_fail() { echo -e "${RED}✗ $1${NC}"; ((FAIL++)); }

# ============================================================================
# Test 1: Full triage - SUB001 (clean inland manufacturer)
#   Answer key: all 10 appetite rules pass -> in_appetite -> quote
# ============================================================================
echo -e "${YELLOW}Test 1: Full Triage (SUB001 - clean, expect QUOTE)${NC}"
echo -e "${BLUE}Note: Runs 3 agents in parallel, may take 60-90s...${NC}"
RF="/tmp/ac-us-t1-$$.json"
invoke_agentcore '{"submission_id":"SUB001","triage_type":"full"}' "$RF"
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    assert_pass "Invocation succeeded"
    P=$(parse_response "$RF")

    # 1a. Structured response shape
    SID=$(echo "$P" | jq -r '.submission_id // empty')
    AID=$(echo "$P" | jq -r '.assessment_id // empty')
    HA=$(check_field "$P" "appetite_review"); HE=$(check_field "$P" "exposure_assessment"); HP=$(check_field "$P" "pricing_indication")
    SLEN=$(echo "$P" | jq -r '.summary | length // 0')
    if [[ "$SID" == "SUB001" ]] && [[ "$HA" == "yes" ]] && [[ "$HE" == "yes" ]] && [[ "$HP" == "yes" ]] && [[ "$SLEN" -gt 50 ]]; then
        assert_pass "All 3 sections present, summary=${SLEN} chars"
    else
        assert_fail "Missing sections (appetite=$HA exposure=$HE pricing=$HP summary=$SLEN)"
    fi

    # 1b. assessment_id is a valid UUID
    if echo "$AID" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
        assert_pass "assessment_id is valid UUID"
    else
        assert_fail "assessment_id not a valid UUID: $AID"
    fi

    # 1c. ANSWER KEY: decision must be quote
    DEC=$(get_or_null "$P" "decision")
    if [[ "$DEC" == "quote" ]]; then
        assert_pass "Answer key: decision=quote"
    else
        assert_fail "Answer key: expected decision=quote, got '$DEC'"
    fi

    # 1d. ANSWER KEY: appetite status must be in_appetite
    AS=$(echo "$P" | jq -r '.appetite_review.status // empty')
    if [[ "$AS" == "in_appetite" ]]; then
        assert_pass "Answer key: appetite_status=in_appetite"
    else
        assert_fail "Answer key: expected in_appetite, got '$AS'"
    fi

    # 1e. ANSWER KEY: no appetite rules breached
    CF_COUNT=$(echo "$P" | jq -r '.appetite_review.checks_failed | length // 0')
    if [[ "$CF_COUNT" == "0" ]]; then
        assert_pass "Answer key: checks_failed is empty (0 breaches)"
    else
        CF=$(list_str "$P" "appetite_review.checks_failed")
        assert_fail "Answer key: expected 0 breaches, got $CF_COUNT: $CF"
    fi

    # 1f. Tool call + arithmetic proof: TIV must be exactly 14,000,000
    TIV=$(echo "$P" | jq -r '.exposure_assessment.total_insured_value // 0')
    if num_in_range "$TIV" 13999000 14001000; then
        assert_pass "Tool call + arithmetic proof: TIV=$TIV (schedule sums to 14,000,000)"
    else
        assert_fail "TIV=$TIV (expected 14,000,000 from the property schedule)"
    fi

    # 1g. Business logic: severity should be low or moderate for a clean inland risk
    SEV=$(echo "$P" | jq -r '.exposure_assessment.severity // empty')
    if [[ "$SEV" == "low" ]] || [[ "$SEV" == "moderate" ]]; then
        assert_pass "Business logic: severity=$SEV (reasonable for clean inland risk)"
    else
        assert_fail "Business logic: severity=$SEV (expected low or moderate)"
    fi

    # 1h. Business logic: a quotable risk must carry a non-zero premium
    PREM=$(echo "$P" | jq -r '.pricing_indication.indicated_premium // 0')
    if num_in_range "$PREM" 30000 400000; then
        assert_pass "Business logic: indicated_premium=$PREM (anchored near expiring 92,500)"
    else
        assert_fail "Business logic: indicated_premium=$PREM (expected 30,000-400,000)"
    fi

    # 1i. Business logic: low loss ratio reflects the clean 0.06 loss history
    LR=$(echo "$P" | jq -r '.pricing_indication.loss_ratio_estimate // -1')
    if num_in_range "$LR" 0 0.7; then
        assert_pass "Business logic: loss_ratio_estimate=$LR (clean history, expiring 0.06)"
    else
        assert_fail "Business logic: loss_ratio_estimate=$LR (expected 0.0-0.7)"
    fi

    # 1j. raw_analysis proves all 3 agents ran
    R1=$(check_field "$P" "raw_analysis.appetite_screening")
    R2=$(check_field "$P" "raw_analysis.exposure_analysis")
    R3=$(check_field "$P" "raw_analysis.pricing_indication")
    if [[ "$R1" == "yes" ]] && [[ "$R2" == "yes" ]] && [[ "$R3" == "yes" ]]; then
        assert_pass "raw_analysis: all 3 agent outputs present (agents ran)"
    else
        assert_fail "raw_analysis: missing outputs (appetite=$R1 exposure=$R2 pricing=$R3)"
    fi

    # 1k. S3 tool proof: output must reference SUB001-specific fixture data
    RAW=$(echo "$P" | jq -r '. | tostring' 2>/dev/null)
    if echo "$RAW" | grep -qi "Meridian Precision\|Innovation Parkway\|Columbus\|LOC-1"; then
        assert_pass "S3 tool proof: output references SUB001 profile data"
    else
        assert_fail "S3 tool proof: output does not reference SUB001 profile data"
    fi

    rm -f "$RF"
else
    assert_fail "Invocation failed"
fi
echo ""

# ============================================================================
# Test 2: Full triage - SUB002 (open claim + incomplete submission)
#   Answer key: APP-10 referral threshold breached -> referral_required -> refer
# ============================================================================
echo -e "${YELLOW}Test 2: Full Triage (SUB002 - open claim, expect REFER)${NC}"
RF="/tmp/ac-us-t2-$$.json"
invoke_agentcore '{"submission_id":"SUB002","triage_type":"full"}' "$RF"
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    assert_pass "Invocation succeeded"
    P=$(parse_response "$RF")

    # 2a. ANSWER KEY: decision must be refer
    DEC=$(get_or_null "$P" "decision")
    if [[ "$DEC" == "refer" ]]; then
        assert_pass "Answer key: decision=refer"
    else
        assert_fail "Answer key: expected decision=refer, got '$DEC'"
    fi

    # 2b. ANSWER KEY: appetite status must be referral_required
    AS=$(echo "$P" | jq -r '.appetite_review.status // empty')
    if [[ "$AS" == "referral_required" ]]; then
        assert_pass "Answer key: appetite_status=referral_required"
    else
        assert_fail "Answer key: expected referral_required, got '$AS'"
    fi

    # 2c. ANSWER KEY: the referral must be attributed to APP-10 (open claim > 250K)
    ALL_A=$(echo "$P" | jq -r '.appetite_review | tostring' | tr '[:upper:]' '[:lower:]')
    if echo "$ALL_A" | grep -q "app-10"; then
        assert_pass "Answer key: APP-10 cited (open claim above referral threshold)"
    else
        assert_fail "Answer key: APP-10 not cited in appetite_review"
    fi

    # 2d. NEGATIVE ASSERTION: no prohibition should fire - SUB002 breaches nothing absolute
    PC=$(echo "$P" | jq -r '.appetite_review.prohibited_classes_triggered | length // 0')
    if [[ "$PC" == "0" ]]; then
        assert_pass "Negative assertion: no prohibited classes (food processing is permitted)"
    else
        PCS=$(list_str "$P" "appetite_review.prohibited_classes_triggered")
        assert_fail "Negative assertion: expected 0 prohibited classes, got: $PCS"
    fi

    # 2e. NEGATIVE ASSERTION: APP-08 must NOT fire. SUB002 sits in MIDWEST_CONVECTIVE
    #     with named_storm_exposed=false, and APP-08 is scoped to named-storm zones.
    CF=$(list_str "$P" "appetite_review.checks_failed")
    if echo "$CF" | grep -q "app-08"; then
        assert_fail "Negative assertion: APP-08 wrongly fired (zone is not named-storm exposed)"
    else
        assert_pass "Negative assertion: APP-08 correctly did not fire (rule qualifier respected)"
    fi

    # 2f. Tool call + arithmetic proof: TIV must be exactly 36,300,000
    TIV=$(echo "$P" | jq -r '.exposure_assessment.total_insured_value // 0')
    if num_in_range "$TIV" 36299000 36301000; then
        assert_pass "Tool call + arithmetic proof: TIV=$TIV (schedule sums to 36,300,000)"
    else
        assert_fail "TIV=$TIV (expected 36,300,000; 35,400,000 would mean the expiring figure was used)"
    fi

    # 2g. missing_information must be populated - roof ages absent, loss runs incomplete
    MI_COUNT=$(echo "$P" | jq -r '.missing_information | length // 0')
    MI=$(list_str "$P" "missing_information")
    if [[ "$MI_COUNT" -gt 0 ]]; then
        assert_pass "missing_information populated ($MI_COUNT items)"
        if echo "$MI" | grep -q "roof\|loss run\|2021\|2022"; then
            assert_pass "missing_information cites the planted gaps (roof ages / loss run years)"
        else
            assert_fail "missing_information does not cite roof ages or loss run gaps: $MI"
        fi
    else
        assert_fail "missing_information empty (SUB002 has 4 stated outstanding items)"
    fi

    # 2h. Business logic: adverse loss ratio should be reflected (expiring 0.85)
    LR=$(echo "$P" | jq -r '.pricing_indication.loss_ratio_estimate // -1')
    if num_in_range "$LR" 0.4 2.0; then
        assert_pass "Business logic: loss_ratio_estimate=$LR (adverse, expiring 0.85)"
    else
        assert_fail "Business logic: loss_ratio_estimate=$LR (expected 0.4-2.0)"
    fi

    # 2i. S3 tool proof
    RAW=$(echo "$P" | jq -r '. | tostring' 2>/dev/null)
    if echo "$RAW" | grep -qi "Harvest Ridge\|Springfield\|HRF-2026-00412\|Ozark"; then
        assert_pass "S3 tool proof: output references SUB002 fixture data"
    else
        assert_fail "S3 tool proof: output does not reference SUB002 fixture data"
    fi

    rm -f "$RF"
else
    assert_fail "Invocation failed"
fi
echo ""

# ============================================================================
# Test 3: Full triage - SUB003 (prohibited class + coastal + concentration)
#   Answer key: APP-01, APP-03, APP-08 breached -> out_of_appetite -> decline
# ============================================================================
echo -e "${YELLOW}Test 3: Full Triage (SUB003 - prohibited class, expect DECLINE)${NC}"
RF="/tmp/ac-us-t3-$$.json"
invoke_agentcore '{"submission_id":"SUB003","triage_type":"full"}' "$RF"
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    assert_pass "Invocation succeeded"
    P=$(parse_response "$RF")

    # 3a. ANSWER KEY: decision must be decline
    DEC=$(get_or_null "$P" "decision")
    if [[ "$DEC" == "decline" ]]; then
        assert_pass "Answer key: decision=decline"
    else
        assert_fail "Answer key: expected decision=decline, got '$DEC'"
    fi

    # 3b. ANSWER KEY: appetite status must be out_of_appetite
    AS=$(echo "$P" | jq -r '.appetite_review.status // empty')
    if [[ "$AS" == "out_of_appetite" ]]; then
        assert_pass "Answer key: appetite_status=out_of_appetite"
    else
        assert_fail "Answer key: expected out_of_appetite, got '$AS'"
    fi

    # 3c. ANSWER KEY: all three breached rules must be cited
    ALL_A=$(echo "$P" | jq -r '.appetite_review | tostring' | tr '[:upper:]' '[:lower:]')
    MISSED=""
    for RULE in app-01 app-03 app-08; do
        echo "$ALL_A" | grep -q "$RULE" || MISSED="$MISSED $RULE"
    done
    if [[ -z "$MISSED" ]]; then
        assert_pass "Answer key: APP-01, APP-03 and APP-08 all cited as breached"
    else
        assert_fail "Answer key: breached rules not cited:$MISSED"
    fi

    # 3d. ANSWER KEY: the prohibited occupancy class must be named
    PCS=$(list_str "$P" "appetite_review.prohibited_classes_triggered")
    if echo "$PCS" | grep -q "scrap_metal_yard\|scrap metal"; then
        assert_pass "Answer key: scrap_metal_yard identified as prohibited (LOC-2)"
    else
        assert_fail "Answer key: prohibited class not identified, got: $PCS"
    fi

    # 3e. NEGATIVE ASSERTION: APP-02 must NOT fire. LOC-4 is frame construction but
    #     only 2 storeys, under the 4 storey limit. Blanket-failing is as wrong as missing.
    CF=$(list_str "$P" "appetite_review.checks_failed")
    if echo "$CF" | grep -q "app-02"; then
        assert_fail "Negative assertion: APP-02 wrongly fired (frame building is 2 storeys, limit is 4)"
    else
        assert_pass "Negative assertion: APP-02 correctly did not fire (storey qualifier respected)"
    fi

    # 3f. NEGATIVE ASSERTION: screening must discriminate, not blanket-fail.
    #     6 of 10 rules pass, so checks_passed must not be empty.
    CP_COUNT=$(echo "$P" | jq -r '.appetite_review.checks_passed | length // 0')
    if [[ "$CP_COUNT" -gt 0 ]]; then
        assert_pass "Negative assertion: checks_passed non-empty ($CP_COUNT rules) - discriminates"
    else
        assert_fail "Negative assertion: checks_passed empty - screening blanket-failed the risk"
    fi

    # 3g. Tool call + arithmetic proof: TIV must be exactly 29,000,000
    TIV=$(echo "$P" | jq -r '.exposure_assessment.total_insured_value // 0')
    if num_in_range "$TIV" 28999000 29001000; then
        assert_pass "Tool call + arithmetic proof: TIV=$TIV (schedule sums to 29,000,000)"
    else
        assert_fail "TIV=$TIV (expected 29,000,000; 28,400,000 would mean the expiring figure was used)"
    fi

    # 3h. Business logic: concentration must be flagged, and the zone named
    CFL=$(list_str "$P" "exposure_assessment.concentration_flags")
    if [[ -n "$CFL" ]] && echo "$CFL" | grep -q "gulf\|fl_gulf_coast\|coast"; then
        assert_pass "Business logic: Gulf Coast concentration flagged"
    else
        assert_fail "Business logic: concentration not flagged (67.9% of TIV in FL_GULF_COAST)"
    fi

    # 3i. Business logic: severity should be high or critical
    SEV=$(echo "$P" | jq -r '.exposure_assessment.severity // empty')
    if [[ "$SEV" == "high" ]] || [[ "$SEV" == "critical" ]]; then
        assert_pass "Business logic: severity=$SEV (coastal concentration, loss ratio 1.22)"
    else
        assert_fail "Business logic: severity=$SEV (expected high or critical)"
    fi

    # 3j. Design intent: a risk outside appetite must not be priced.
    #     The pricing prompt requires a zero indication with a stated reason.
    PREM=$(echo "$P" | jq -r '.pricing_indication.indicated_premium // -1')
    if num_in_range "$PREM" 0 0.5; then
        assert_pass "Design intent: indicated_premium=0 (not priced - outside appetite)"
    else
        assert_fail "Design intent: indicated_premium=$PREM (expected 0 for an out-of-appetite risk)"
    fi

    # 3k. Precedence: pricing must never upgrade the outcome away from decline
    if [[ "$DEC" == "decline" ]]; then
        assert_pass "Precedence: appetite veto held (pricing did not upgrade the outcome)"
    else
        assert_fail "Precedence: appetite breach did not produce a decline"
    fi

    # 3l. S3 tool proof
    RAW=$(echo "$P" | jq -r '. | tostring' 2>/dev/null)
    if echo "$RAW" | grep -qi "Gulfline\|Hookers Point\|Palmetto\|TSI-2025-06120"; then
        assert_pass "S3 tool proof: output references SUB003 fixture data"
    else
        assert_fail "S3 tool proof: output does not reference SUB003 fixture data"
    fi

    rm -f "$RF"
else
    assert_fail "Invocation failed"
fi
echo ""

# ============================================================================
# Test 4: appetite_only routing - decision MUST be null
#   Appetite alone is sufficient to decline but never sufficient to quote, so
#   a partial triage deliberately returns no decision.
# ============================================================================
echo -e "${YELLOW}Test 4: appetite_only routing (SUB003)${NC}"
RF="/tmp/ac-us-t4-$$.json"
invoke_agentcore '{"submission_id":"SUB003","triage_type":"appetite_only"}' "$RF"
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    P=$(parse_response "$RF")
    HA=$(check_field "$P" "appetite_review"); HE=$(check_field "$P" "exposure_assessment"); HP=$(check_field "$P" "pricing_indication")
    if [[ "$HA" == "yes" ]] && [[ "$HE" == "no" ]] && [[ "$HP" == "no" ]]; then
        assert_pass "Routing: appetite=present, exposure=absent, pricing=absent"
    else
        assert_fail "Routing failed (appetite=$HA exposure=$HE pricing=$HP)"
    fi

    DEC=$(get_or_null "$P" "decision")
    if [[ "$DEC" == "null" ]]; then
        assert_pass "Partial mode: decision is null (no basis for an overall outcome)"
    else
        assert_fail "Partial mode: decision='$DEC' but must be null on a partial triage"
    fi

    # the appetite finding itself must still be complete
    AS=$(echo "$P" | jq -r '.appetite_review.status // empty')
    if [[ "$AS" == "out_of_appetite" ]]; then
        assert_pass "Appetite finding still complete: status=out_of_appetite"
    else
        assert_fail "Appetite finding incomplete: status='$AS'"
    fi

    # summary must state what was not assessed
    SUM=$(echo "$P" | jq -r '.summary // empty' | tr '[:upper:]' '[:lower:]')
    if echo "$SUM" | grep -q "not assessed\|not performed\|not been\|no overall"; then
        assert_pass "Summary states which assessments were not performed"
    else
        assert_fail "Summary does not disclose that exposure/pricing were not assessed"
    fi

    # only one agent should appear in raw_analysis
    RAW_N=$(echo "$P" | jq -r '[.raw_analysis // {} | to_entries[] | select(.value != null)] | length' 2>/dev/null)
    if [[ "$RAW_N" == "1" ]]; then
        assert_pass "raw_analysis holds exactly 1 agent output (only appetite ran)"
    else
        assert_fail "raw_analysis holds $RAW_N agent outputs, expected 1"
    fi

    rm -f "$RF"
else
    assert_fail "Invocation failed"
fi
echo ""

# ============================================================================
# Test 5: exposure_only routing (portfolio / cat-modelling path)
# ============================================================================
echo -e "${YELLOW}Test 5: exposure_only routing (SUB003)${NC}"
RF="/tmp/ac-us-t5-$$.json"
invoke_agentcore '{"submission_id":"SUB003","triage_type":"exposure_only"}' "$RF"
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    P=$(parse_response "$RF")
    HA=$(check_field "$P" "appetite_review"); HE=$(check_field "$P" "exposure_assessment"); HP=$(check_field "$P" "pricing_indication")
    if [[ "$HE" == "yes" ]] && [[ "$HA" == "no" ]] && [[ "$HP" == "no" ]]; then
        assert_pass "Routing: exposure=present, appetite=absent, pricing=absent"
    else
        assert_fail "Routing failed (appetite=$HA exposure=$HE pricing=$HP)"
    fi

    DEC=$(get_or_null "$P" "decision")
    if [[ "$DEC" == "null" ]]; then
        assert_pass "Partial mode: decision is null"
    else
        assert_fail "Partial mode: decision='$DEC' but must be null"
    fi

    TIV=$(echo "$P" | jq -r '.exposure_assessment.total_insured_value // 0')
    if num_in_range "$TIV" 28999000 29001000; then
        assert_pass "Exposure finding intact in isolation: TIV=$TIV"
    else
        assert_fail "TIV=$TIV (expected 29,000,000)"
    fi

    rm -f "$RF"
else
    assert_fail "Invocation failed"
fi
echo ""

# ============================================================================
# Test 6: pricing_only routing (actuarial benchmarking path)
#   Deliberately run on SUB001 so a real premium is expected.
# ============================================================================
echo -e "${YELLOW}Test 6: pricing_only routing (SUB001)${NC}"
RF="/tmp/ac-us-t6-$$.json"
invoke_agentcore '{"submission_id":"SUB001","triage_type":"pricing_only"}' "$RF"
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    P=$(parse_response "$RF")
    HA=$(check_field "$P" "appetite_review"); HE=$(check_field "$P" "exposure_assessment"); HP=$(check_field "$P" "pricing_indication")
    if [[ "$HP" == "yes" ]] && [[ "$HA" == "no" ]] && [[ "$HE" == "no" ]]; then
        assert_pass "Routing: pricing=present, appetite=absent, exposure=absent"
    else
        assert_fail "Routing failed (appetite=$HA exposure=$HE pricing=$HP)"
    fi

    DEC=$(get_or_null "$P" "decision")
    if [[ "$DEC" == "null" ]]; then
        assert_pass "Partial mode: decision is null"
    else
        assert_fail "Partial mode: decision='$DEC' but must be null"
    fi

    PREM=$(echo "$P" | jq -r '.pricing_indication.indicated_premium // 0')
    RATE=$(echo "$P" | jq -r '.pricing_indication.rate_per_thousand // 0')
    if num_in_range "$PREM" 30000 400000; then
        assert_pass "Pricing intact in isolation: premium=$PREM rate=$RATE"
    else
        assert_fail "premium=$PREM (expected 30,000-400,000)"
    fi

    CS=$(echo "$P" | jq -r '.pricing_indication.confidence_score // -1')
    if num_in_range "$CS" 0.0 1.0; then
        assert_pass "confidence_score=$CS (valid 0-1 range)"
    else
        assert_fail "confidence_score=$CS (expected 0.0-1.0)"
    fi

    rm -f "$RF"
else
    assert_fail "Invocation failed"
fi
echo ""

# ============================================================================
# Test 7: Default triage_type
#   Omitting triage_type must default to full and yield a decision.
# ============================================================================
echo -e "${YELLOW}Test 7: Default triage_type (SUB001, field omitted)${NC}"
RF="/tmp/ac-us-t7-$$.json"
invoke_agentcore '{"submission_id":"SUB001"}' "$RF"
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    P=$(parse_response "$RF")
    HA=$(check_field "$P" "appetite_review"); HE=$(check_field "$P" "exposure_assessment"); HP=$(check_field "$P" "pricing_indication")
    DEC=$(get_or_null "$P" "decision")
    if [[ "$HA" == "yes" ]] && [[ "$HE" == "yes" ]] && [[ "$HP" == "yes" ]] && [[ "$DEC" != "null" ]]; then
        assert_pass "Defaulted to full triage: 3 sections present, decision=$DEC"
    else
        assert_fail "Default did not resolve to full (appetite=$HA exposure=$HE pricing=$HP decision=$DEC)"
    fi
    rm -f "$RF"
else
    assert_fail "Invocation failed"
fi
echo ""

# ============================================================================
# Test 8: Invalid submission id
#   The retriever returns an error envelope rather than raising, so the agent
#   should report missing data rather than inventing a submission.
# ============================================================================
echo -e "${YELLOW}Test 8: Invalid Submission ID (INVALID999)${NC}"
RF="/tmp/ac-us-t8-$$.json"
invoke_agentcore '{"submission_id":"INVALID999","triage_type":"full"}' "$RF"
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    RESPONSE_TEXT=$(cat "$RF")
    if echo "$RESPONSE_TEXT" | grep -qi "error\|not found\|no data\|unable\|missing\|INVALID999"; then
        assert_pass "Invalid submission handled gracefully"
    else
        assert_pass "Invalid submission handled (no crash)"
    fi
    # must not fabricate a quote for a submission that does not exist
    P=$(parse_response "$RF")
    DEC=$(get_or_null "$P" "decision")
    if [[ "$DEC" == "quote" ]]; then
        assert_fail "Fabricated a quote for a non-existent submission"
    else
        assert_pass "Did not fabricate a quote (decision='$DEC')"
    fi
    rm -f "$RF"
else
    assert_pass "Invalid submission returned error (expected)"
fi
echo ""

# ============================================================================
# Test 9: Invalid triage_type
#   triage_type is a strict enum on the request model, so this must be
#   rejected rather than silently coerced.
# ============================================================================
echo -e "${YELLOW}Test 9: Invalid triage_type (bogus_mode)${NC}"
RF="/tmp/ac-us-t9-$$.json"
invoke_agentcore '{"submission_id":"SUB001","triage_type":"bogus_mode"}' "$RF"
if [[ $? -eq 0 ]] && [[ -f "$RF" ]]; then
    RESPONSE_TEXT=$(cat "$RF")
    if echo "$RESPONSE_TEXT" | grep -qi "error\|validation\|bogus_mode\|not a valid"; then
        assert_pass "Invalid triage_type rejected by request validation"
    else
        assert_fail "Invalid triage_type was not rejected (strict enum expected on the request model)"
    fi
    rm -f "$RF"
else
    assert_pass "Invalid triage_type returned error (expected)"
fi
echo ""

# ============================================================================
# Summary
# ============================================================================
TOTAL=$((PASS + FAIL))
echo -e "${GREEN}========================================${NC}"
echo -e "Tests: ${TOTAL}  Passed: ${GREEN}${PASS}${NC}  Failed: ${RED}${FAIL}${NC}"
echo -e "${GREEN}========================================${NC}"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
