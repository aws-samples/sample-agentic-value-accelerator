#!/bin/bash
set +e
USE_CASE_ID="${1:-post_call_analytics}"; FRAMEWORK="${FRAMEWORK:-langchain_langgraph}"; AWS_REGION="${AWS_REGION:-us-east-1}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../../../.." && pwd)}"
source "$PROJECT_ROOT/applications/fsi_foundry/scripts/lib/registry.sh"
FRAMEWORK_SHORT=$(get_framework_short_name "$FRAMEWORK"); USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")
FRAMEWORK_SHORT_CFN=$(echo "${FRAMEWORK_SHORT}" | tr "_" "-")

USE_CASE_ID_CFN=$(echo "${USE_CASE_ID}" | tr "_" "-")

REGION_SUFFIX=$(echo "${AWS_REGION}" | tr -d '-')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AgentCore Test - ${USE_CASE_ID} (${USE_CASE_ID_CFN}) - ${FRAMEWORK_SHORT}${NC}"
echo -e "${GREEN}========================================${NC}"

STACK_NAME="ava-${USE_CASE_ID_CFN}-${FRAMEWORK_SHORT_CFN}-agentcore-runtime-${REGION_SUFFIX}"
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
if [[ "$STACK_STATUS" == "NOT_FOUND" ]]; then echo -e "${RED}Stack ${STACK_NAME} not found${NC}"; exit 1; fi
RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].Outputs[?OutputKey==`AgentRuntimeArn`].OutputValue' --output text 2>/dev/null)
echo -e "${BLUE}Runtime: ${RUNTIME_ARN}${NC}"
PASS=0; FAIL=0

invoke_and_parse() {
    local payload="$1"; local outfile="$2"
    local payload_b64=$(echo -n "$payload" | base64)
    aws bedrock-agentcore invoke-agent-runtime --agent-runtime-arn "$RUNTIME_ARN" --payload "$payload_b64" --region "$AWS_REGION" "$outfile" 2>/tmp/agentcore-invoke-error.log
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        cat /tmp/agentcore-invoke-error.log 2>/dev/null
        return 1
    fi
    if [ ! -s "$outfile" ]; then
        echo "No response body written" >&2
        return 1
    fi
    return 0
}

parse_json() {
    python3 -c "
import sys, json, ast
raw = open('$1').read()
try: d = json.loads(raw)
except:
    try: d = ast.literal_eval(raw)
    except: d = {'_raw': raw}
print(json.dumps(d) if isinstance(d, dict) else json.dumps({'_raw': str(d)}))
" 2>/dev/null
}

assert_eq() { if [[ "$1" == "$2" ]]; then echo -e "${GREEN}  ✓ $3${NC}"; ((PASS++)); else echo -e "${RED}  ✗ $3 (expected='$2', got='$1')${NC}"; ((FAIL++)); fi; }
assert_contains() { if echo "$1" | grep -qi "$2"; then echo -e "${GREEN}  ✓ $3${NC}"; ((PASS++)); else echo -e "${RED}  ✗ $3 (missing '$2')${NC}"; ((FAIL++)); fi; }
assert_gt() { if [[ "$1" -gt "$2" ]]; then echo -e "${GREEN}  ✓ $3${NC}"; ((PASS++)); else echo -e "${RED}  ✗ $3 ($1 <= $2)${NC}"; ((FAIL++)); fi; }
assert_not_null() { if [[ -n "$1" ]] && [[ "$1" != "null" ]] && [[ "$1" != "None" ]]; then echo -e "${GREEN}  ✓ $3${NC}"; ((PASS++)); else echo -e "${RED}  ✗ $3 (was null/empty)${NC}"; ((FAIL++)); fi; }

# ============================================================================
# Test 1: Full Analysis - Structure & Business Logic
# ============================================================================
echo ""
echo -e "${YELLOW}Test 1: Full Post-Call Analysis (CALL001) - Structure & Business Logic${NC}"
RF="/tmp/pca-full-$$.json"
if invoke_and_parse '{"call_id":"CALL001","analysis_type":"full"}' "$RF"; then
    P=$(parse_json "$RF")

    # Structure checks
    CALL_ID=$(echo "$P" | jq -r '.call_id // empty')
    assert_eq "$CALL_ID" "CALL001" "call_id is CALL001"

    ANALYTICS_ID=$(echo "$P" | jq -r '.analytics_id // empty')
    assert_not_null "$ANALYTICS_ID" "" "analytics_id is present"

    SUMMARY=$(echo "$P" | jq -r '.summary // empty')
    SUMMARY_LEN=${#SUMMARY}
    assert_gt "$SUMMARY_LEN" 50 "summary is substantial (${SUMMARY_LEN} chars)"

    # Transcription present
    HAS_TRANS=$(echo "$P" | jq -r 'if .transcription then "yes" else "no" end')
    assert_eq "$HAS_TRANS" "yes" "transcription result present"

    # Sentiment present
    HAS_SENT=$(echo "$P" | jq -r 'if .sentiment then "yes" else "no" end')
    assert_eq "$HAS_SENT" "yes" "sentiment result present"

    # Business logic: raw_analysis has all 3 agent outputs
    RA_TRANS=$(echo "$P" | jq -r 'if .raw_analysis.transcription then "yes" else "no" end')
    RA_SENT=$(echo "$P" | jq -r 'if .raw_analysis.sentiment then "yes" else "no" end')
    RA_ACT=$(echo "$P" | jq -r 'if .raw_analysis.actions then "yes" else "no" end')
    assert_eq "$RA_TRANS" "yes" "raw_analysis.transcription agent ran"
    assert_eq "$RA_SENT" "yes" "raw_analysis.sentiment agent ran"
    assert_eq "$RA_ACT" "yes" "raw_analysis.actions agent ran"

    # Tool call validation: agents reference CALL001 data from S3
    RAW_TEXT=$(echo "$P" | jq -r '.raw_analysis | tostring')
    assert_contains "$RAW_TEXT" "CALL001" "agents reference CALL001 entity"
    assert_contains "$RAW_TEXT" "dispute\|unauthorized\|fraud" "agents identify fraud/dispute content"
    assert_contains "$RAW_TEXT" "Sarah\|agent\|AGT" "agents identify agent speaker"

    # Business logic: summary references key call content
    assert_contains "$SUMMARY" "dispute\|unauthorized\|fraud\|charge" "summary references fraud dispute"

    rm -f "$RF"
else
    echo -e "${RED}  ✗ Invocation failed${NC}"; ((FAIL++))
fi

# ============================================================================
# Test 2: Sentiment Only - Routing & Agent Logic
# ============================================================================
echo ""
echo -e "${YELLOW}Test 2: Sentiment Only (CALL001) - Routing & Agent Logic${NC}"
RF="/tmp/pca-sent-$$.json"
if invoke_and_parse '{"call_id":"CALL001","analysis_type":"sentiment"}' "$RF"; then
    P=$(parse_json "$RF")

    CALL_ID=$(echo "$P" | jq -r '.call_id // empty')
    assert_eq "$CALL_ID" "CALL001" "call_id is CALL001"

    # Sentiment should be present
    HAS_SENT=$(echo "$P" | jq -r 'if .sentiment then "yes" else "no" end')
    assert_eq "$HAS_SENT" "yes" "sentiment result present"

    # Transcription should NOT be present (routing correctness)
    HAS_TRANS=$(echo "$P" | jq -r 'if .transcription then "yes" else "no" end')
    assert_eq "$HAS_TRANS" "no" "transcription correctly absent (sentiment-only routing)"

    # raw_analysis: only sentiment agent should have run
    RA_SENT=$(echo "$P" | jq -r 'if .raw_analysis.sentiment then "yes" else "no" end')
    assert_eq "$RA_SENT" "yes" "sentiment agent ran"

    RA_TRANS=$(echo "$P" | jq -r '.raw_analysis.transcription // "null"')
    assert_eq "$RA_TRANS" "null" "transcription agent did NOT run (correct routing)"

    # Business logic: sentiment agent references call data from S3 tool
    SENT_RAW=$(echo "$P" | jq -r '.raw_analysis.sentiment.analysis // .raw_analysis.sentiment | tostring')
    assert_contains "$SENT_RAW" "CALL001\|customer\|agent" "sentiment agent retrieved call data via tool"

    rm -f "$RF"
else
    echo -e "${RED}  ✗ Invocation failed${NC}"; ((FAIL++))
fi

# ============================================================================
# Test 3: Action Extraction Only - Routing & Agent Logic
# ============================================================================
echo ""
echo -e "${YELLOW}Test 3: Action Extraction Only (CALL001) - Routing & Agent Logic${NC}"
RF="/tmp/pca-act-$$.json"
if invoke_and_parse '{"call_id":"CALL001","analysis_type":"action_extraction"}' "$RF"; then
    P=$(parse_json "$RF")

    CALL_ID=$(echo "$P" | jq -r '.call_id // empty')
    assert_eq "$CALL_ID" "CALL001" "call_id is CALL001"

    # Sentiment should NOT be present (routing correctness)
    HAS_SENT=$(echo "$P" | jq -r 'if .sentiment then "yes" else "no" end')
    assert_eq "$HAS_SENT" "no" "sentiment correctly absent (action-only routing)"

    # raw_analysis: only action agent should have run
    RA_ACT=$(echo "$P" | jq -r 'if .raw_analysis.actions then "yes" else "no" end')
    assert_eq "$RA_ACT" "yes" "action_extractor agent ran"

    RA_TRANS=$(echo "$P" | jq -r '.raw_analysis.transcription // "null"')
    assert_eq "$RA_TRANS" "null" "transcription agent did NOT run (correct routing)"

    # Business logic: action agent references call data from S3 tool
    ACT_RAW=$(echo "$P" | jq -r '.raw_analysis.actions.analysis // .raw_analysis.actions | tostring')
    assert_contains "$ACT_RAW" "dispute\|card\|alert\|follow" "action agent extracted relevant actions"

    rm -f "$RF"
else
    echo -e "${RED}  ✗ Invocation failed${NC}"; ((FAIL++))
fi

# ============================================================================
# Test 4: Transcription Only - Routing & Agent Logic
# ============================================================================
echo ""
echo -e "${YELLOW}Test 4: Transcription Only (CALL001) - Routing & Agent Logic${NC}"
RF="/tmp/pca-trans-$$.json"
if invoke_and_parse '{"call_id":"CALL001","analysis_type":"transcription"}' "$RF"; then
    P=$(parse_json "$RF")

    CALL_ID=$(echo "$P" | jq -r '.call_id // empty')
    assert_eq "$CALL_ID" "CALL001" "call_id is CALL001"

    # Transcription should be present
    HAS_TRANS=$(echo "$P" | jq -r 'if .transcription then "yes" else "no" end')
    assert_eq "$HAS_TRANS" "yes" "transcription result present"

    # Sentiment should NOT be present (routing correctness)
    HAS_SENT=$(echo "$P" | jq -r 'if .sentiment then "yes" else "no" end')
    assert_eq "$HAS_SENT" "no" "sentiment correctly absent (transcription-only routing)"

    # raw_analysis: only transcription agent should have run
    RA_TRANS=$(echo "$P" | jq -r 'if .raw_analysis.transcription then "yes" else "no" end')
    assert_eq "$RA_TRANS" "yes" "transcription agent ran"

    RA_ACT=$(echo "$P" | jq -r '.raw_analysis.actions // "null"')
    assert_eq "$RA_ACT" "null" "action agent did NOT run (correct routing)"

    # Business logic: transcription agent references call data from S3 tool
    TRANS_RAW=$(echo "$P" | jq -r '.raw_analysis.transcription.analysis // .raw_analysis.transcription | tostring')
    assert_contains "$TRANS_RAW" "CALL001\|speaker\|transcript\|Sarah" "transcription agent processed call data via tool"

    rm -f "$RF"
else
    echo -e "${RED}  ✗ Invocation failed${NC}"; ((FAIL++))
fi

# ============================================================================
# Test 5: Additional Context Passthrough
# ============================================================================
echo ""
echo -e "${YELLOW}Test 5: Additional Context Passthrough${NC}"
RF="/tmp/pca-ctx-$$.json"
if invoke_and_parse '{"call_id":"CALL001","analysis_type":"sentiment","additional_context":"Focus on customer frustration levels"}' "$RF"; then
    P=$(parse_json "$RF")

    CALL_ID=$(echo "$P" | jq -r '.call_id // empty')
    assert_eq "$CALL_ID" "CALL001" "call_id is CALL001 with context"

    SUMMARY_LEN=$(echo "$P" | jq -r '.summary | length')
    assert_gt "$SUMMARY_LEN" 20 "summary present with additional context (${SUMMARY_LEN} chars)"

    rm -f "$RF"
else
    echo -e "${RED}  ✗ Invocation failed${NC}"; ((FAIL++))
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo -e "${GREEN}========================================${NC}"
TOTAL=$((PASS + FAIL))
echo -e "Passed: ${GREEN}${PASS}${NC}, Failed: ${RED}${FAIL}${NC}, Total: ${TOTAL}"
[[ $TOTAL -gt 0 ]] && echo -e "Success Rate: $((PASS * 100 / TOTAL))%"
echo -e "${GREEN}========================================${NC}"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
