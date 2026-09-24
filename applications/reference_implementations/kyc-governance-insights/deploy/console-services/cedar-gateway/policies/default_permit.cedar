// ============================================================
// AgentCore Gateway Cedar - Default Permit
// All agent actions are ALLOWED unless explicitly FORBIDDEN
// by Organization, Application, or Request layer policies.
// Engine: AgentCore Gateway Native Cedar
// ============================================================

// DEFAULT-001: Default permit - allow all agent actions unless explicitly forbidden
permit (
    principal in AgentCore::Governance::AgentGroup::"AllAgents",
    action,
    resource
);
