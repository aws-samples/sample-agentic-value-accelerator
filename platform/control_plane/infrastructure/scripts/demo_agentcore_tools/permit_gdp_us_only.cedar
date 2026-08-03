// Demo Cedar policy — AgentCore Gateway tool access control.
//
// Permits the get_gdp_data tool (when country == "US"); because AgentCore's
// policy engine is default-deny in ENFORCE mode, every other tool — including
// get_inflation_data — is denied. This is the allow-list posture: name what is
// allowed, everything else is blocked.
//
// The <gateway-arn> placeholder is filled in at seed time by
// seed_demo_agentcore.py (Cedar requires a concrete resource ARN; wildcards are
// rejected). A standalone `forbid` is also rejected by AgentCore validation as
// "overly restrictive", which is why the block is expressed as default-deny.

permit(
  principal,
  action == AgentCore::Action::"econ-tools___get_gdp_data",
  resource == AgentCore::Gateway::"<gateway-arn>"
) when {
  context.input.country == "US"
};
