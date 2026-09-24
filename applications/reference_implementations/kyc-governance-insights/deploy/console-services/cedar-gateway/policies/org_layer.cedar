// ============================================================
// AgentCore Gateway Cedar - Organization Layer Policies
// Layer: ORGANIZATION (highest precedence — global hard blocks)
// Engine: AgentCore Gateway Native Cedar
// ============================================================

// ORG-001: Global Amount Ceiling - No agent may approve > £500K GBP
forbid (
    principal in AgentCore::Governance::AgentGroup::"AllAgents",
    action == AgentCore::Governance::Action::"ApproveApplication",
    resource
)
when {
    resource.requested_facility_amount > 500000 &&
    resource.currency == "GBP"
};

// ORG-002: Prohibited Jurisdictions - Hard block sanctioned countries
forbid (
    principal in AgentCore::Governance::AgentGroup::"AllAgents",
    action == AgentCore::Governance::Action::"ApproveApplication",
    resource
)
when {
    resource.incorporation_country == "KP" ||
    resource.incorporation_country == "IR" ||
    resource.incorporation_country == "SY" ||
    resource.incorporation_country == "MM"
};

// ORG-003: Sanctions Hard-Block - Fuzzy match score > 85 = blocked
forbid (
    principal in AgentCore::Governance::AgentGroup::"AllAgents",
    action == AgentCore::Governance::Action::"ApproveApplication",
    resource
)
when {
    resource.sanctions_fuzzy_match_score > 85
};

// ORG-004: PEP Level 3+ Hard-Block - Cannot approve politically exposed persons (high tier)
forbid (
    principal in AgentCore::Governance::AgentGroup::"AllAgents",
    action == AgentCore::Governance::Action::"ApproveApplication",
    resource
)
when {
    resource.pep_level >= 3
};

// ORG-005: Data Residency Enforcement - No processing outside permitted regions
forbid (
    principal in AgentCore::Governance::AgentGroup::"AllAgents",
    action == AgentCore::Governance::Action::"AccessCustomerRecord",
    resource
)
when {
    resource.data_residency_region != "UK" &&
    resource.data_residency_region != "EU"
};

// ORG-006: UBO Chain Depth Limit - Deep ownership structures require escalation
forbid (
    principal in AgentCore::Governance::AgentGroup::"AllAgents",
    action == AgentCore::Governance::Action::"ApproveApplication",
    resource
)
when {
    resource.ubo_chain_depth > 4
};
