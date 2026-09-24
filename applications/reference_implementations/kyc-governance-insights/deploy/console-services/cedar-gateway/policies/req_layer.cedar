// ============================================================
// AgentCore Gateway Cedar - Request Layer Policies
// Layer: REQUEST (per-invocation, tier-gated constraints)
// Engine: AgentCore Gateway Native Cedar
// ============================================================

// REQ-001: Tier 2 cannot execute sanctions queries on HIGH/VERY_HIGH risk
forbid (
    principal in AgentCore::Governance::AgentGroup::"Tier2Agents",
    action == AgentCore::Governance::Action::"ExecuteSanctionsQuery",
    resource
)
when {
    resource.risk_tier == "HIGH" ||
    resource.risk_tier == "VERY_HIGH"
};

// REQ-002: Tier 1 cannot execute ANY sanctions query
forbid (
    principal in AgentCore::Governance::AgentGroup::"Tier1Agents",
    action == AgentCore::Governance::Action::"ExecuteSanctionsQuery",
    resource
);

// REQ-003: PEP-flagged customers require elevated tier for approval
forbid (
    principal in AgentCore::Governance::AgentGroup::"Tier1Agents",
    action == AgentCore::Governance::Action::"ApproveApplication",
    resource
)
when {
    resource.pep_level > 0
};

// REQ-004: High-value + high-risk compound gate for Tier 2
forbid (
    principal in AgentCore::Governance::AgentGroup::"Tier2Agents",
    action == AgentCore::Governance::Action::"ApproveApplication",
    resource
)
when {
    resource.requested_facility_amount > 250000 &&
    resource.risk_tier == "HIGH"
};

// REQ-005: Business hours enforcement - Non-supervisor agents blocked outside 08:00-18:00 UTC
forbid (
    principal in AgentCore::Governance::AgentGroup::"Tier1Agents",
    action == AgentCore::Governance::Action::"ApproveApplication",
    resource
)
when {
    context.request_hour < 8 ||
    context.request_hour >= 18
};

// REQ-006: Business hours enforcement for Tier 2
forbid (
    principal in AgentCore::Governance::AgentGroup::"Tier2Agents",
    action == AgentCore::Governance::Action::"ApproveApplication",
    resource
)
when {
    context.request_hour < 8 ||
    context.request_hour >= 18
};
