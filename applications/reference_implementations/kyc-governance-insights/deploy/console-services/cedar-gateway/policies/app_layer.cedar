// ============================================================
// AgentCore Gateway Cedar - Application Layer Policies
// Layer: APPLICATION (agent-type-specific constraints)
// Engine: AgentCore Gateway Native Cedar
// ============================================================

// APP-001: KYC Agents restricted to UK customer records
forbid (
    principal in AgentCore::Governance::AgentGroup::"KYCAgents",
    action == AgentCore::Governance::Action::"AccessCustomerRecord",
    resource
)
when {
    resource.data_residency_region != "UK"
};

// APP-002: Tier 1 amount ceiling - Credit Analysts max £500K
forbid (
    principal in AgentCore::Governance::AgentGroup::"Tier1Agents",
    action == AgentCore::Governance::Action::"ApproveApplication",
    resource
)
when {
    resource.requested_facility_amount > 500000
};

// APP-003: Credit Analysts cannot use SANCTIONS or KYC tools
forbid (
    principal in AgentCore::Governance::AgentGroup::"CreditAnalysts",
    action == AgentCore::Governance::Action::"ExecuteToolCall",
    resource
)
when {
    resource.tool_category == "SANCTIONS" ||
    resource.tool_category == "KYC"
};

// APP-004: Tool invocation rate limiting (blocked when max reached)
forbid (
    principal in AgentCore::Governance::AgentGroup::"AllAgents",
    action == AgentCore::Governance::Action::"ExecuteToolCall",
    resource
)
when {
    resource.max_invocations_per_session == 0
};

// APP-005: Tier 2 amount ceiling - Compliance Officers max £2M
forbid (
    principal in AgentCore::Governance::AgentGroup::"Tier2Agents",
    action == AgentCore::Governance::Action::"ApproveApplication",
    resource
)
when {
    resource.requested_facility_amount > 2000000
};

// APP-006: Risk score hard-block threshold (score >= 80)
forbid (
    principal in AgentCore::Governance::AgentGroup::"AllAgents",
    action == AgentCore::Governance::Action::"ApproveApplication",
    resource
)
when {
    resource.risk_score >= 80
};
