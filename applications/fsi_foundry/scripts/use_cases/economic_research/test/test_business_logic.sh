#!/bin/bash
# Economic Research - Business Logic Validation Tests
set +e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASSED=0; FAILED=0
ENDPOINT="${API_ENDPOINT:-http://ava-c03-langgraph-alb-1686023071.us-east-1.elb.amazonaws.com}"

check() { local name=$1 cond=$2; if eval "$cond"; then echo -e "${GREEN}✓ $name${NC}"; ((PASSED++)); else echo -e "${RED}✗ $name${NC}"; ((FAILED++)); fi; }

echo -e "${YELLOW}=== Economic Research Business Logic Tests ===${NC}"

# BL-1: Full research invokes ALL 3 agents
echo -e "\n${YELLOW}BL-1: Full research agent invocation${NC}"
R=$(curl -s --max-time 180 -X POST $ENDPOINT/invoke -H "Content-Type: application/json" -d '{"entity_id":"ECON001","research_type":"full"}')
DA=$(echo "$R" | jq -r '.raw_analysis.data_aggregation.agent')
TA=$(echo "$R" | jq -r '.raw_analysis.trend_analysis.agent')
RW=$(echo "$R" | jq -r '.raw_analysis.report.agent')
check "data_aggregator invoked" '[ "$DA" = "data_aggregator" ]'
check "trend_analyst invoked" '[ "$TA" = "trend_analyst" ]'
check "research_writer invoked" '[ "$RW" = "research_writer" ]'

# BL-2: economic_overview has valid enums
echo -e "\n${YELLOW}BL-2: Economic overview validation${NC}"
IND=$(echo "$R" | jq -r '.economic_overview.primary_indicator')
DIR=$(echo "$R" | jq -r '.economic_overview.trend_direction')
check "indicator valid (got $IND)" 'echo "gdp inflation employment interest_rates trade_balance" | grep -qw "$IND"'
check "direction valid (got $DIR)" 'echo "accelerating stable decelerating reversing uncertain" | grep -qw "$DIR"'
FH=$(echo "$R" | jq -r '.economic_overview.forecast_horizon')
check "forecast_horizon non-empty" '[ -n "$FH" ] && [ "$FH" != "null" ]'

# BL-3: Recommendations non-empty
REC=$(echo "$R" | jq '.recommendations | length')
check "recommendations non-empty (got $REC)" '[ "$REC" -gt 0 ] 2>/dev/null'

# BL-4: Summary substantive
SLEN=$(echo "$R" | jq -r '.summary | length')
check "summary > 200 chars (got $SLEN)" '[ "$SLEN" -gt 200 ] 2>/dev/null'

# BL-5: data_aggregation routing
echo -e "\n${YELLOW}BL-5: data_aggregation routing${NC}"
R2=$(curl -s --max-time 180 -X POST $ENDPOINT/invoke -H "Content-Type: application/json" -d '{"entity_id":"ECON001","research_type":"data_aggregation"}')
check "data_aggregator ran" '[ "$(echo "$R2" | jq -r ".raw_analysis.data_aggregation")" != "null" ]'
check "trend_analyst did NOT run" '[ "$(echo "$R2" | jq -r ".raw_analysis.trend_analysis")" = "null" ]'
check "research_writer did NOT run" '[ "$(echo "$R2" | jq -r ".raw_analysis.report")" = "null" ]'

# BL-6: trend_analysis routing
echo -e "\n${YELLOW}BL-6: trend_analysis routing${NC}"
R3=$(curl -s --max-time 180 -X POST $ENDPOINT/invoke -H "Content-Type: application/json" -d '{"entity_id":"ECON001","research_type":"trend_analysis"}')
check "trend_analyst ran" '[ "$(echo "$R3" | jq -r ".raw_analysis.trend_analysis")" != "null" ]'
check "data_aggregator did NOT run" '[ "$(echo "$R3" | jq -r ".raw_analysis.data_aggregation")" = "null" ]'
check "research_writer did NOT run" '[ "$(echo "$R3" | jq -r ".raw_analysis.report")" = "null" ]'

# BL-7: report_generation routing
echo -e "\n${YELLOW}BL-7: report_generation routing${NC}"
R4=$(curl -s --max-time 180 -X POST $ENDPOINT/invoke -H "Content-Type: application/json" -d '{"entity_id":"ECON001","research_type":"report_generation"}')
check "research_writer ran" '[ "$(echo "$R4" | jq -r ".raw_analysis.report")" != "null" ]'
check "data_aggregator did NOT run" '[ "$(echo "$R4" | jq -r ".raw_analysis.data_aggregation")" = "null" ]'
check "trend_analyst did NOT run" '[ "$(echo "$R4" | jq -r ".raw_analysis.trend_analysis")" = "null" ]'

echo -e "\n${YELLOW}=== Summary ===${NC}"
echo -e "${GREEN}Passed: $PASSED${NC} | ${RED}Failed: $FAILED${NC}"
[ $FAILED -eq 0 ] && echo -e "${GREEN}All business logic tests passed! 🎉${NC}" && exit 0
exit 1
