#!/bin/bash
set +e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/common.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/variables.sh"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"

USE_CASE_ID="${1:-code_generation}"; FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"; AWS_REGION="${AWS_REGION:-us-east-1}"
USE_CASE_ID_NORMALIZED=$(normalize_use_case_to_id "$USE_CASE_ID")
USE_CASE_ID_NORMALIZED=$(echo "$USE_CASE_ID_NORMALIZED" | tr '[:upper:]' '[:lower:]')
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")


section "Code Generation - AgentCore Test Suite"
info "Framework: $FRAMEWORK ($FRAMEWORK_SHORT) | Region: $AWS_REGION"

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
        local outfile="/tmp/ac_cg_$$_$RANDOM.json"
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
assert_contains() { echo "$1" | grep -qi "$2" && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (pattern '$2' not found)"; return 1; }; }
assert_json()     { echo "$1" | jq -e "$2" > /dev/null 2>&1 && { info "    ✓ $3"; return 0; } || { error "    ✗ $3"; return 1; }; }
assert_in()       { echo "$2" | grep -qw "$1" && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected one of: $2)"; return 1; }; }
assert_float_gte(){ awk "BEGIN{exit(!($1>=$2))}" && { info "    ✓ $3"; return 0; } || { error "    ✗ $3 (got '$1', expected >= $2)"; return 1; }; }

# ============================================================================
# Test 1: PROJ001 Full Generation — Agent Logic + Tool Call Verification
# ============================================================================
section "Test 1: PROJ001 Full Generation — Agent Logic + Tool Calls"
info "Data: Payment Gateway API, Python/FastAPI, 4 modules, PCI-DSS compliance"
BODY=$(invoke_ac '{"project_id":"PROJ001","generation_scope":"full"}')
if [[ -z "$BODY" ]]; then
    error "PROJ001 Full FAILED (no response)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0

    # Structure
    assert_eq "$(echo "$BODY" | jq -r '.project_id')" "PROJ001" "project_id is PROJ001" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.generation_id' "generation_id present" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.requirement_analysis and .scaffolded_code and .test_output' "all 3 agent results present" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.summary | length > 0' "summary is non-empty" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Requirement Analyst business logic
    FUNC_REQS=$(echo "$BODY" | jq '.requirement_analysis.functional_requirements | length' 2>/dev/null)
    assert_gte "${FUNC_REQS:-0}" 1 "requirements: at least 1 functional requirement" && SUB=$((SUB+1)); TOT=$((TOT+1))
    DEPS=$(echo "$BODY" | jq -r '.requirement_analysis.dependencies[]' 2>/dev/null | tr '\n' '|')
    assert_contains "$DEPS" "FastAPI\|fastapi\|Stripe\|stripe\|PayPal\|paypal\|database\|payment" "requirements: dependencies reference project tech" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Code Scaffolder business logic
    FILES=$(echo "$BODY" | jq -r '.scaffolded_code.files_generated // 0')
    assert_gte "${FILES:-0}" 1 "scaffolding: files_generated $FILES >= 1" && SUB=$((SUB+1)); TOT=$((TOT+1))
    STRUCTURE=$(echo "$BODY" | jq -r '.scaffolded_code.project_structure[]' 2>/dev/null | tr '\n' '|')
    assert_contains "$STRUCTURE" "py\|src\|app\|main\|api\|config\|model" "scaffolding: project_structure references Python files" && SUB=$((SUB+1)); TOT=$((TOT+1))
    QUALITY=$(echo "$BODY" | jq -r '.scaffolded_code.code_quality // ""')
    assert_in "$QUALITY" "low medium high production_ready" "scaffolding: code_quality is valid enum" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Test Generator business logic
    UNIT=$(echo "$BODY" | jq -r '.test_output.unit_tests_generated // 0')
    assert_gte "${UNIT:-0}" 1 "tests: unit_tests_generated $UNIT >= 1" && SUB=$((SUB+1)); TOT=$((TOT+1))
    COVERAGE=$(echo "$BODY" | jq -r '.test_output.test_coverage_estimate // 0')
    assert_float_gte "$COVERAGE" 0.5 "tests: test_coverage_estimate $COVERAGE >= 0.5" && SUB=$((SUB+1)); TOT=$((TOT+1))
    FRAMEWORKS=$(echo "$BODY" | jq -r '.test_output.test_frameworks_used[]' 2>/dev/null | tr '\n' '|')
    assert_contains "$FRAMEWORKS" "pytest\|unittest\|test" "tests: test_frameworks reference pytest/unittest" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # S3 tool call verification
    RAW_REQ=$(echo "$BODY" | jq -r '.raw_analysis.requirement_analysis.analysis // ""')
    assert_contains "$RAW_REQ" "Payment Gateway\|payment_processor\|FastAPI\|fastapi" "tool: requirement agent retrieved project data from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_contains "$RAW_REQ" "PCI-DSS\|PCI\|SOC2\|compliance" "tool: requirement agent retrieved compliance requirements from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))

    RAW_SCAFFOLD=$(echo "$BODY" | jq -r '.raw_analysis.scaffolded_code.analysis // ""')
    assert_contains "$RAW_SCAFFOLD" "payment\|FastAPI\|fastapi\|Python\|python" "tool: scaffolder agent retrieved project framework from S3" && SUB=$((SUB+1)); TOT=$((TOT+1))

    # Synthesis quality
    SUMMARY=$(echo "$BODY" | jq -r '.summary // ""')
    assert_contains "$SUMMARY" "code\|generat\|scaffold\|requirement\|test\|project" "synthesis: summary discusses code generation" && SUB=$((SUB+1)); TOT=$((TOT+1))

    [[ $SUB -eq $TOT ]] && { success "PROJ001 Full PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "PROJ001 Full PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 2: Requirements Only — Routing + Agent Isolation
# ============================================================================
section "Test 2: Requirements Only (PROJ001) — Routing"
BODY=$(invoke_ac '{"project_id":"PROJ001","generation_scope":"requirements_only"}')
if [[ -z "$BODY" ]]; then
    error "Requirements only FAILED (no response)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0
    assert_json "$BODY" '.requirement_analysis != null' "requirement_analysis present" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.scaffolded_code == null' "scaffolded_code is null" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.test_output == null' "test_output is null" && SUB=$((SUB+1)); TOT=$((TOT+1))
    FUNC_REQS=$(echo "$BODY" | jq '.requirement_analysis.functional_requirements | length' 2>/dev/null)
    assert_gte "${FUNC_REQS:-0}" 1 "requirements: has functional requirements" && SUB=$((SUB+1)); TOT=$((TOT+1))
    [[ $SUB -eq $TOT ]] && { success "Requirements only PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "Requirements only PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 3: Scaffolding Only — Routing + Agent Isolation
# ============================================================================
section "Test 3: Scaffolding Only (PROJ001) — Routing"
BODY=$(invoke_ac '{"project_id":"PROJ001","generation_scope":"scaffolding_only"}')
if [[ -z "$BODY" ]]; then
    error "Scaffolding only FAILED (no response)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0
    assert_json "$BODY" '.scaffolded_code != null' "scaffolded_code present" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.requirement_analysis == null' "requirement_analysis is null" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.test_output == null' "test_output is null" && SUB=$((SUB+1)); TOT=$((TOT+1))
    FILES=$(echo "$BODY" | jq -r '.scaffolded_code.files_generated // 0')
    assert_gte "${FILES:-0}" 1 "scaffolding: files_generated >= 1" && SUB=$((SUB+1)); TOT=$((TOT+1))
    [[ $SUB -eq $TOT ]] && { success "Scaffolding only PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "Scaffolding only PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 4: Testing Only — Routing + Agent Isolation
# ============================================================================
section "Test 4: Testing Only (PROJ001) — Routing"
BODY=$(invoke_ac '{"project_id":"PROJ001","generation_scope":"testing_only"}')
if [[ -z "$BODY" ]]; then
    error "Testing only FAILED (no response)"; FAILED=$((FAILED+1))
else
    SUB=0; TOT=0
    assert_json "$BODY" '.test_output != null' "test_output present" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.requirement_analysis == null' "requirement_analysis is null" && SUB=$((SUB+1)); TOT=$((TOT+1))
    assert_json "$BODY" '.scaffolded_code == null' "scaffolded_code is null" && SUB=$((SUB+1)); TOT=$((TOT+1))
    UNIT=$(echo "$BODY" | jq -r '.test_output.unit_tests_generated // 0')
    assert_gte "${UNIT:-0}" 1 "tests: unit_tests_generated >= 1" && SUB=$((SUB+1)); TOT=$((TOT+1))
    [[ $SUB -eq $TOT ]] && { success "Testing only PASSED ($SUB/$TOT)"; PASSED=$((PASSED+1)); } || { error "Testing only PARTIAL ($SUB/$TOT)"; FAILED=$((FAILED+1)); }
fi
echo ""

# ============================================================================
# Test 5: Invalid Project ID — Graceful Error Handling
# ============================================================================
section "Test 5: Invalid Project ID"
BODY=$(invoke_ac '{"project_id":"INVALID999","generation_scope":"full"}')
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
