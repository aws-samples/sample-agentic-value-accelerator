#!/bin/bash
set +e

USE_CASE_ID="${1:-mainframe_migration}"
FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"
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
echo -e "${GREEN}AgentCore E2E Test - ${USE_CASE_ID} - ${FRAMEWORK_SHORT}${NC}"
echo -e "${GREEN}========================================${NC}"

STACK_NAME="ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
if [[ "$STACK_STATUS" == "NOT_FOUND" ]]; then echo -e "${RED}Stack $STACK_NAME not found${NC}"; exit 1; fi

RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' --output text 2>/dev/null)
echo -e "${BLUE}Runtime: ${RUNTIME_ARN}${NC}"
echo ""

PASS=0; FAIL=0; PARSED=""

invoke_runtime() {
    aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn "$RUNTIME_ARN" \
        --payload "$(echo -n "$1" | base64)" --region "$AWS_REGION" --cli-read-timeout 300 "$2" 2>/tmp/agentcore-invoke-error.log
}
parse_json() {
    python3 -c "import sys,json; raw=open('$1').read()
try: d=json.loads(raw)
except:
    import ast
    try: d=ast.literal_eval(raw)
    except: d={'_raw':raw}
print(json.dumps(d) if isinstance(d,dict) else json.dumps({'_raw':str(d)}))" 2>/dev/null
}

ok()   { echo -e "${GREEN}  ✓ $1${NC}"; ((PASS++)); }
fail() { echo -e "${RED}  ✗ $1${NC}"; ((FAIL++)); }

assert_eq()       { local v=$(echo "$PARSED"|jq -r "$1" 2>/dev/null); [[ "$v" == "$2" ]] && ok "$3" || fail "$3 (got '$v')"; }
assert_gt()       { local v=$(echo "$PARSED"|jq -r "$1" 2>/dev/null); [[ "$v" -gt "$2" ]] 2>/dev/null && ok "$3 ($v)" || fail "$3 (got $v)"; }
assert_not_null() { local v=$(echo "$PARSED"|jq -r "$1" 2>/dev/null); [[ "$v" != "null" ]] && [[ -n "$v" ]] && ok "$2" || fail "$2 (null)"; }
assert_null()     { local v=$(echo "$PARSED"|jq -r "$1" 2>/dev/null); [[ "$v" == "null" ]] && ok "$2" || fail "$2 (expected null)"; }
assert_uuid()     { local v=$(echo "$PARSED"|jq -r "$1" 2>/dev/null); [[ "$v" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] && ok "$2" || fail "$2 ($v)"; }
assert_match()    { grep -qiE "$1" "$3" 2>/dev/null && ok "$2" || fail "$2"; }

# ============================================================================
# Test 1: Full Migration Assessment (PROJECT001)
# ============================================================================
echo -e "${YELLOW}Test 1: Full Migration Assessment (PROJECT001)${NC}"
RF="/tmp/ac-mm-1-$$.json"
if invoke_runtime '{"project_id":"PROJECT001","migration_scope":"full"}' "$RF" && [[ -f "$RF" ]]; then
    ok "invocation succeeded"; PARSED=$(parse_json "$RF")
    assert_eq ".project_id" "PROJECT001" "schema: project_id"
    assert_uuid ".migration_id" "schema: migration_id is UUID"
    assert_not_null ".timestamp" "schema: timestamp present"
    assert_gt ".summary | length" 50 "schema: summary non-trivial"
    assert_not_null ".raw_analysis.mainframe_analyzer" "routing: mainframe_analyzer ran"
    assert_not_null ".raw_analysis.business_rule_extractor" "routing: business_rule_extractor ran"
    assert_not_null ".raw_analysis.cloud_code_generator" "routing: cloud_code_generator ran"
    assert_match "PROJECT001|Core Banking|z.OS" "tool: s3 profile fetched" "$RF"
    assert_match "COBOL|JCL|copybook|program" "business/analyzer: mainframe artifact analysis" "$RF"
    assert_match "rule|validation|formula|decision|COMPUTE|EVALUATE" "business/extractor: rule extraction" "$RF"
    assert_match "cloud|AWS|Python|microservice|API|Lambda|Step.Function|DynamoDB|RDS" "business/generator: cloud code mapping" "$RF"
    assert_match "340|125|680000|ACCTINQ|FUNDXFR|DB2|VSAM" "tool: profile data used in analysis" "$RF"
    assert_match "risk|complex|migration|compliance|SOX|PCI" "business: risk and compliance" "$RF"

    # Per-agent raw_analysis depth: verify each agent's output references profile data
    ANALYZER_TEXT=$(echo "$PARSED" | jq -r '.raw_analysis.mainframe_analyzer.analysis // ""' 2>/dev/null)
    EXTRACTOR_TEXT=$(echo "$PARSED" | jq -r '.raw_analysis.business_rule_extractor.analysis // ""' 2>/dev/null)
    GENERATOR_TEXT=$(echo "$PARSED" | jq -r '.raw_analysis.cloud_code_generator.analysis // ""' 2>/dev/null)
    echo "$ANALYZER_TEXT" | grep -qiE "COBOL|340|JCL|125|z.OS" && ok "agent-depth/analyzer: references COBOL/JCL metrics from profile" || fail "agent-depth/analyzer: missing profile metrics"
    echo "$EXTRACTOR_TEXT" | grep -qiE "rule|validation|business|logic|COMPUTE|EVALUATE" && ok "agent-depth/extractor: references business rule patterns" || fail "agent-depth/extractor: missing rule patterns"
    echo "$GENERATOR_TEXT" | grep -qiE "AWS|Python|cloud|Lambda|DynamoDB|Step.Function|API" && ok "agent-depth/generator: references cloud service mappings" || fail "agent-depth/generator: missing cloud mappings"
    rm -f "$RF"
else fail "invocation failed"; rm -f "$RF"; fi

# ============================================================================
# Test 2: Mainframe Analysis Only
# ============================================================================
echo -e "${YELLOW}Test 2: Mainframe Analysis Only (PROJECT001)${NC}"
RF="/tmp/ac-mm-2-$$.json"
if invoke_runtime '{"project_id":"PROJECT001","migration_scope":"mainframe_analysis"}' "$RF" && [[ -f "$RF" ]]; then
    ok "invocation succeeded"; PARSED=$(parse_json "$RF")
    assert_eq ".project_id" "PROJECT001" "schema: project_id"
    assert_gt ".summary | length" 20 "schema: summary present"
    assert_not_null ".raw_analysis.mainframe_analyzer" "routing: mainframe_analyzer ran"
    assert_null ".raw_analysis.business_rule_extractor" "routing: extractor excluded"
    assert_null ".raw_analysis.cloud_code_generator" "routing: generator excluded"
    assert_match "COBOL|JCL|program|complexity" "business: mainframe analysis content" "$RF"
    rm -f "$RF"
else fail "invocation failed"; rm -f "$RF"; fi

# ============================================================================
# Test 3: Rule Extraction (analyzer + extractor)
# ============================================================================
echo -e "${YELLOW}Test 3: Rule Extraction (PROJECT001)${NC}"
RF="/tmp/ac-mm-3-$$.json"
if invoke_runtime '{"project_id":"PROJECT001","migration_scope":"rule_extraction"}' "$RF" && [[ -f "$RF" ]]; then
    ok "invocation succeeded"; PARSED=$(parse_json "$RF")
    assert_eq ".project_id" "PROJECT001" "schema: project_id"
    assert_not_null ".raw_analysis.mainframe_analyzer" "routing: analyzer ran"
    assert_not_null ".raw_analysis.business_rule_extractor" "routing: extractor ran"
    assert_null ".raw_analysis.cloud_code_generator" "routing: generator excluded"
    assert_match "rule|validation|business.logic" "business: rule extraction content" "$RF"
    rm -f "$RF"
else fail "invocation failed"; rm -f "$RF"; fi

# ============================================================================
# Test 4: Code Generation (all 3 agents)
# ============================================================================
echo -e "${YELLOW}Test 4: Code Generation (PROJECT001)${NC}"
RF="/tmp/ac-mm-4-$$.json"
if invoke_runtime '{"project_id":"PROJECT001","migration_scope":"code_generation"}' "$RF" && [[ -f "$RF" ]]; then
    ok "invocation succeeded"; PARSED=$(parse_json "$RF")
    assert_eq ".project_id" "PROJECT001" "schema: project_id"
    assert_not_null ".raw_analysis.mainframe_analyzer" "routing: analyzer ran"
    assert_not_null ".raw_analysis.business_rule_extractor" "routing: extractor ran"
    assert_not_null ".raw_analysis.cloud_code_generator" "routing: generator ran"
    assert_match "cloud|AWS|Python|generat" "business: code generation content" "$RF"
    rm -f "$RF"
else fail "invocation failed"; rm -f "$RF"; fi

# ============================================================================
# Test 5: Additional Context
# ============================================================================
echo -e "${YELLOW}Test 5: Additional Context (PROJECT001)${NC}"
RF="/tmp/ac-mm-5-$$.json"
if invoke_runtime '{"project_id":"PROJECT001","migration_scope":"mainframe_analysis","additional_context":"Focus on CICS transaction migration and DB2 to DynamoDB conversion"}' "$RF" && [[ -f "$RF" ]]; then
    ok "invocation succeeded"; PARSED=$(parse_json "$RF")
    assert_eq ".project_id" "PROJECT001" "schema: project_id"
    assert_match "CICS|DynamoDB|transaction" "context: additional_context influenced output" "$RF"
    rm -f "$RF"
else fail "invocation failed"; rm -f "$RF"; fi

# ============================================================================
# Test 6: Invalid Project ID
# ============================================================================
echo -e "${YELLOW}Test 6: Invalid Project ID (INVALID999)${NC}"
RF="/tmp/ac-mm-6-$$.json"
if invoke_runtime '{"project_id":"INVALID999","migration_scope":"full"}' "$RF" && [[ -f "$RF" ]]; then
    ok "runtime did not crash on unknown project"
    PARSED=$(parse_json "$RF")
    assert_eq ".project_id" "INVALID999" "schema: project_id echoed back"
    rm -f "$RF"
else ok "runtime returned error for unknown project (acceptable)"; fi

# ============================================================================
TOTAL=$((PASS + FAIL))
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "Framework: ${FRAMEWORK_SHORT} | Checks: ${TOTAL}"
echo -e "Passed: ${GREEN}${PASS}${NC}  Failed: ${RED}${FAIL}${NC}"
echo -e "${GREEN}========================================${NC}"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
