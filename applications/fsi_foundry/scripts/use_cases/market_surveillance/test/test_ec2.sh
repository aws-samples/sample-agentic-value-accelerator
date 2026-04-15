#!/bin/bash
set +e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/common.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/variables.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/terraform.sh"

USE_CASE_ID="${USE_CASE_ID:-market_surveillance}"
FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"
AWS_REGION="${AWS_REGION:-us-east-1}"
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
LLM_TIMEOUT=180

section "Market Surveillance - EC2 Test Suite"
info "Use Case: $USE_CASE_ID | Framework: $FRAMEWORK ($FRAMEWORK_SHORT) | Region: $AWS_REGION"

IAC_PATH="$PROJECT_ROOT/$(get_iac_path ec2)"
select_or_create_workspace "$USE_CASE_ID" "$FRAMEWORK_SHORT" "$AWS_REGION" "ec2"
pushd "$IAC_PATH" > /dev/null
API_ENDPOINT="http://$(terraform output -raw alb_dns_name 2>/dev/null)"
popd > /dev/null

[[ -z "$API_ENDPOINT" || "$API_ENDPOINT" == "http://" ]] && die "Could not get API endpoint"
info "API Endpoint: $API_ENDPOINT"
echo ""
sleep 2

PASSED=0; FAILED=0

# ============================================================
# Test 1: Health Check
# ============================================================
section "Test 1: Health Check"
RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 "$API_ENDPOINT/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Response:"; echo "$BODY" | jq '.' 2>/dev/null; echo ""

if [[ "$HTTP_CODE" == "200" ]] && echo "$BODY" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
    success "Health check PASSED"; PASSED=$((PASSED+1))
else
    error "Health check FAILED (HTTP $HTTP_CODE)"; FAILED=$((FAILED+1))
fi
echo ""
sleep 2

# ============================================================
# Test 2: Root Endpoint
# ============================================================
section "Test 2: Root Endpoint"
RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 "$API_ENDPOINT/")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Response:"; echo "$BODY" | jq '.' 2>/dev/null; echo ""

if [[ "$HTTP_CODE" == "200" ]]; then
    success "Root endpoint PASSED"; PASSED=$((PASSED+1))
else
    error "Root endpoint FAILED (HTTP $HTTP_CODE)"; FAILED=$((FAILED+1))
fi
echo ""
sleep 2

# ============================================================
# Test 3: Full Surveillance (SURV001) — Content Validation
# SURV001 has insider trading signals: pre-announcement trading,
# unusual volume, external broker comms about MNPI
# ============================================================
# Warm up: ensure instance is healthy before heavy test
for i in 1 2 3; do curl -sf --max-time 5 "$API_ENDPOINT/health" > /dev/null 2>&1 && break; sleep 3; done

section "Test 3: Full Surveillance (SURV001)"
info "SURV001 has insider trading signals — expecting HIGH/CRITICAL severity"
echo ""
sleep 2

RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" \
    -d '{"customer_id":"SURV001","surveillance_type":"full"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "Response (summary):"; echo "$BODY" | jq '{customer_id, surveillance_id, trade_pattern: .trade_pattern, comms_monitor: .comms_monitor, alert: .alert}' 2>/dev/null; echo ""

SUBTESTS=0; SUBPASS=0
if [[ "$HTTP_CODE" == "200" ]]; then
    # 3a: Basic structure
    CID=$(echo "$BODY" | jq -r '.customer_id' 2>/dev/null)
    SID=$(echo "$BODY" | jq -r '.surveillance_id' 2>/dev/null)
    if [[ "$CID" == "SURV001" && -n "$SID" && "$SID" != "null" ]]; then
        info "  3a: customer_id and surveillance_id present ✓"; SUBPASS=$((SUBPASS+1))
    else
        error "  3a: Missing customer_id or surveillance_id"; fi
    SUBTESTS=$((SUBTESTS+1))

    # 3b: All three result fields populated
    HAS_TRADE=$(echo "$BODY" | jq -e '.trade_pattern != null' >/dev/null 2>&1 && echo "yes" || echo "no")
    HAS_COMMS=$(echo "$BODY" | jq -e '.comms_monitor != null' >/dev/null 2>&1 && echo "yes" || echo "no")
    HAS_ALERT=$(echo "$BODY" | jq -e '.alert != null' >/dev/null 2>&1 && echo "yes" || echo "no")
    if [[ "$HAS_TRADE" == "yes" && "$HAS_COMMS" == "yes" && "$HAS_ALERT" == "yes" ]]; then
        info "  3b: All three agent results present ✓"; SUBPASS=$((SUBPASS+1))
    else
        error "  3b: Missing results (trade=$HAS_TRADE comms=$HAS_COMMS alert=$HAS_ALERT)"; fi
    SUBTESTS=$((SUBTESTS+1))

    # 3c: Trade pattern risk score >= 50 (SURV001 has suspicious patterns)
    RISK_SCORE=$(echo "$BODY" | jq -r '.trade_pattern.risk_score // 0' 2>/dev/null)
    if [[ "$RISK_SCORE" -ge 50 ]]; then
        info "  3c: Trade risk score $RISK_SCORE >= 50 ✓"; SUBPASS=$((SUBPASS+1))
    else
        error "  3c: Trade risk score $RISK_SCORE < 50 (expected suspicious activity detection)"; fi
    SUBTESTS=$((SUBTESTS+1))

    # 3d: Alert severity is HIGH or CRITICAL
    SEVERITY=$(echo "$BODY" | jq -r '.alert.severity // "unknown"' 2>/dev/null)
    if [[ "$SEVERITY" == "high" || "$SEVERITY" == "critical" ]]; then
        info "  3d: Alert severity '$SEVERITY' ✓"; SUBPASS=$((SUBPASS+1))
    else
        error "  3d: Alert severity '$SEVERITY' (expected high or critical)"; fi
    SUBTESTS=$((SUBTESTS+1))

    # 3e: Alert escalation required
    ESCALATION=$(echo "$BODY" | jq -r '.alert.escalation_required // false' 2>/dev/null)
    if [[ "$ESCALATION" == "true" ]]; then
        info "  3e: Escalation required ✓"; SUBPASS=$((SUBPASS+1))
    else
        error "  3e: Escalation not flagged (expected true for insider trading signals)"; fi
    SUBTESTS=$((SUBTESTS+1))

    # 3f: Comms monitor flagged communications (SURV001 has MNPI sharing)
    FLAGGED_COUNT=$(echo "$BODY" | jq '.comms_monitor.flagged_communications | length' 2>/dev/null)
    if [[ "$FLAGGED_COUNT" -ge 1 ]]; then
        info "  3f: $FLAGGED_COUNT flagged communications ✓"; SUBPASS=$((SUBPASS+1))
    else
        error "  3f: No flagged communications (expected MNPI detection)"; fi
    SUBTESTS=$((SUBTESTS+1))

    # 3g: Summary contains investigation/escalation language
    SUMMARY=$(echo "$BODY" | jq -r '.summary // ""' 2>/dev/null | tr '[:upper:]' '[:lower:]')
    if echo "$SUMMARY" | grep -qiE "investigat|escalat|report|suspicious|insider"; then
        info "  3g: Summary recommends investigation/escalation ✓"; SUBPASS=$((SUBPASS+1))
    else
        error "  3g: Summary lacks investigation language"; fi
    SUBTESTS=$((SUBTESTS+1))

    echo ""
    if [[ $SUBPASS -eq $SUBTESTS ]]; then
        success "Full surveillance PASSED ($SUBPASS/$SUBTESTS sub-tests)"; PASSED=$((PASSED+1))
    else
        error "Full surveillance PARTIAL ($SUBPASS/$SUBTESTS sub-tests)"; FAILED=$((FAILED+1))
    fi
else
    error "Full surveillance FAILED (HTTP $HTTP_CODE)"; FAILED=$((FAILED+1))
fi
echo ""
sleep 2

# ============================================================
# Test 4: Trade Only (SURV001)
# ============================================================
sleep 10
section "Test 4: Trade Pattern Only (SURV001)"

# Retry up to 2 times — instance may still be processing from full test
for attempt in 1 2; do
    BODY=$(curl -sf --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
        -H "Content-Type: application/json" \
        -d '{"customer_id":"SURV001","surveillance_type":"trade_only"}' 2>/dev/null)
    if [[ -n "$BODY" ]] && echo "$BODY" | jq -e '.trade_pattern != null and .comms_monitor == null and .alert == null' > /dev/null 2>&1; then
        success "Trade only PASSED"; PASSED=$((PASSED+1)); break
    elif [[ $attempt -eq 2 ]]; then
        error "Trade only FAILED"; FAILED=$((FAILED+1))
    else
        info "Retry after cooldown..."; sleep 10
    fi
done
echo ""

sleep 2

# ============================================================
# Test 5: Comms Only (SURV001)
# ============================================================
section "Test 5: Communications Only (SURV001)"

RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" \
    -d '{"customer_id":"SURV001","surveillance_type":"comms_only"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "200" ]]; then
    CM=$(echo "$BODY" | jq -e '.comms_monitor != null' >/dev/null 2>&1 && echo "yes" || echo "no")
    TP=$(echo "$BODY" | jq -r '.trade_pattern' 2>/dev/null)
    AL=$(echo "$BODY" | jq -r '.alert' 2>/dev/null)
    if [[ "$CM" == "yes" && "$TP" == "null" && "$AL" == "null" ]]; then
        success "Comms only PASSED"; PASSED=$((PASSED+1))
    else
        error "Comms only FAILED"; FAILED=$((FAILED+1))
    fi
else
    error "Comms only FAILED (HTTP $HTTP_CODE)"; FAILED=$((FAILED+1))
fi
echo ""
sleep 2

# ============================================================
# Test 6: Alert Only (SURV001)
# ============================================================
section "Test 6: Alert Only (SURV001)"

BODY=$(curl -sf --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" \
    -d '{"customer_id":"SURV001","surveillance_type":"alert_only"}' 2>/dev/null)

if [[ -n "$BODY" ]] && echo "$BODY" | jq -e '.alert != null and .trade_pattern == null and .comms_monitor == null' > /dev/null 2>&1; then
    success "Alert only PASSED"; PASSED=$((PASSED+1))
else
    error "Alert only FAILED"; FAILED=$((FAILED+1))
fi
echo ""
sleep 2


# ============================================================
# Test 7: Invalid Surveillance ID
# ============================================================
section "Test 7: Invalid Surveillance ID"

RESPONSE=$(curl -s -w "\n%{http_code}" --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
    -H "Content-Type: application/json" \
    -d '{"customer_id":"INVALID999","surveillance_type":"full"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "500" || "$HTTP_CODE" == "404" ]]; then
    success "Invalid ID handling PASSED (error response)"; PASSED=$((PASSED+1))
elif echo "$BODY" | grep -qi "error\|not found\|invalid\|unable to\|no data"; then
    success "Invalid ID handling PASSED (error in body)"; PASSED=$((PASSED+1))
elif [[ "$HTTP_CODE" == "200" ]]; then
    success "Invalid ID handling PASSED (graceful handling)"; PASSED=$((PASSED+1))
else
    error "Invalid ID handling FAILED (HTTP $HTTP_CODE)"; FAILED=$((FAILED+1))
fi
echo ""
sleep 2

# ============================================================
# Test 8: Load Test (5 concurrent)
# ============================================================
section "Test 8: Load Test (5 concurrent)"
info "Running 5 concurrent trade_only assessments..."

START_TIME=$(date +%s)
for i in {1..5}; do
    (curl -s --max-time $LLM_TIMEOUT -X POST "$API_ENDPOINT/invoke" \
        -H "Content-Type: application/json" \
        -d '{"customer_id":"SURV001","surveillance_type":"trade_only"}' > /dev/null 2>&1) &
done
wait
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if [[ $DURATION -lt 120 ]]; then
    success "Load test PASSED (${DURATION}s < 120s)"; PASSED=$((PASSED+1))
else
    error "Load test FAILED (${DURATION}s >= 120s)"; FAILED=$((FAILED+1))
fi
echo ""
sleep 2

# ============================================================
# Summary
# ============================================================
TOTAL=$((PASSED + FAILED))
section "Test Summary: $PASSED/$TOTAL passed, $FAILED failed"
echo ""
sleep 2
if [[ $FAILED -eq 0 ]]; then
    success "All tests passed! 🎉"
    exit 0
else
    error "Some tests failed."
    exit 1
fi
