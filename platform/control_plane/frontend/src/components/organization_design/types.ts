// Organization Design — interactive AI-integrated org design.
// Source: .context/AWS_Agentic_Enterprise_OrgDesign.xlsx (18 sheets).
// Reference data lifted verbatim from workbook.

import type {
  OrganizationDesign,
  OrganizationDesignCreate,
  OrganizationDesignStatus,
  ComputedOrganizationDesign,
  ODOrgProfile,
  ODStrategyInputs,
  ODOperatingModelInputs,
  ODMaturityScores,
  ODAgentConfig,
  ODFunctionConfig,
  ODValueChainActivity,
  ODCriticalCapability,
  ODRapidDecision,
  ODFunctionAgentBreakdown,
  ODHierarchyLayer,
  ODGateStatus,
  ODDimensionResult,
  ODScenarioSummary,
  ODWorkforcePhase,
  ODWorkforcePlan,
  ODTransitionEconomics,
  ODInvestmentAllocation,
} from '../../api/client';

export type {
  OrganizationDesign,
  OrganizationDesignCreate,
  OrganizationDesignStatus,
  ComputedOrganizationDesign,
  ODOrgProfile,
  ODStrategyInputs,
  ODOperatingModelInputs,
  ODMaturityScores,
  ODAgentConfig,
  ODFunctionConfig,
  ODValueChainActivity,
  ODCriticalCapability,
  ODRapidDecision,
  ODFunctionAgentBreakdown,
  ODHierarchyLayer,
  ODGateStatus,
  ODDimensionResult,
  ODScenarioSummary,
  ODWorkforcePhase,
  ODWorkforcePlan,
  ODTransitionEconomics,
  ODInvestmentAllocation,
};

// -----------------------------------------------------------------------------
// Enumerations (Reference_Tables + Input_* dropdowns)
// -----------------------------------------------------------------------------

export const INDUSTRIES = [
  'Financial Services', 'Healthcare', 'Manufacturing', 'Technology', 'Retail', 'Other',
] as const;
export type Industry = typeof INDUSTRIES[number];

export const STRUCTURE_TYPES = [
  'Traditional Hierarchy', 'Functional', 'Matrix', 'Flat/Agile', 'Network',
] as const;
export type StructureType = typeof STRUCTURE_TYPES[number];

export const SCENARIO_PATHWAYS = ['Conservative', 'Moderate', 'Aggressive'] as const;
export type ScenarioPathway = typeof SCENARIO_PATHWAYS[number];

export const PHASES = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'] as const;
export type Phase = typeof PHASES[number];

export const BUSINESS_MODELS = [
  'Product-led', 'Platform', 'Services', 'Marketplace', 'Hybrid',
] as const;
export const COMPETITIVE_POSITIONING = [
  'Cost Leadership', 'Differentiation', 'Niche Focus', 'Innovation',
] as const;
export const VALUE_DRIVERS = [
  'Scale', 'Technology & Innovation', 'Customer Intimacy', 'Operational Excellence',
] as const;
export const MARKET_DYNAMICS = ['Stable', 'Moderate', 'Fast-moving', 'Disruptive'] as const;
export const REVENUE_MODELS = [
  'Subscription', 'Transaction', 'Licensing', 'Advertising', 'Hybrid',
] as const;
export const COORDINATION_MECHANISMS = [
  'Mutual Adjustment', 'Direct Supervision', 'Standardization of Work',
  'Standardization of Outputs', 'Standardization of Skills',
] as const;
export const OPERATING_ARCHETYPES = [
  'Coordination', 'Unification', 'Diversification', 'Replication',
] as const;
export const SOURCE_STRATEGIES = ['Build', 'Buy', 'Borrow', 'Bot'] as const;
export const STATUSES: OrganizationDesignStatus[] = ['Draft', 'In Progress', 'Complete', 'Archived'];

// -----------------------------------------------------------------------------
// 8 Maturity Dimensions + Industry-specific weight profiles
// -----------------------------------------------------------------------------

export const DIMENSIONS = [
  { key: 'ai_maturity',               label: 'AI Maturity',                accent: 'blue',    anchor_1: 'No AI usage',           anchor_3: 'Departmental AI tools',        anchor_5: 'AI-native operations' },
  { key: 'skills_talent',             label: 'Skills & Talent',            accent: 'indigo',  anchor_1: 'No AI skills',          anchor_3: 'Some trained staff',           anchor_5: 'Org-wide AI fluency' },
  { key: 'resources_investment',      label: 'Resources & Investment',     accent: 'violet',  anchor_1: 'No AI budget',          anchor_3: '1-3% revenue on AI',           anchor_5: '>5% revenue on AI' },
  { key: 'coordination_complexity',   label: 'Coordination Complexity',    accent: 'amber',   anchor_1: 'Simple (<20 nodes)',    anchor_3: 'Moderate (20-100 nodes)',      anchor_5: 'Complex (>100 nodes)' },
  { key: 'industry_context',          label: 'Industry Context',           accent: 'teal',    anchor_1: 'Highly regulated/slow', anchor_3: 'Average adoption pace',        anchor_5: 'Digital-native industry' },
  { key: 'culture_change_readiness',  label: 'Culture & Change Readiness', accent: 'emerald', anchor_1: 'Resistant to change',   anchor_3: 'Open to experimentation',      anchor_5: 'Innovation-obsessed' },
  { key: 'governance_accountability', label: 'Governance & Accountability',accent: 'red',     anchor_1: 'No AI governance',      anchor_3: 'Formal framework',             anchor_5: 'Adaptive autonomous governance' },
  { key: 'leadership_capability',     label: 'Leadership Capability',      accent: 'fuchsia', anchor_1: 'No AI understanding',   anchor_3: 'Active sponsorship',           anchor_5: 'AI-native leadership' },
] as const;

export type DimensionKey = typeof DIMENSIONS[number]['key'];

export const DIM_ACCENTS: Record<string, { bar: string; pill: string; text: string }> = {
  ai_maturity:               { bar: 'from-blue-500 to-blue-600',       pill: 'bg-blue-50 text-blue-700',       text: 'text-blue-700' },
  skills_talent:             { bar: 'from-indigo-500 to-indigo-600',   pill: 'bg-indigo-50 text-indigo-700',   text: 'text-indigo-700' },
  resources_investment:      { bar: 'from-violet-500 to-violet-600',   pill: 'bg-violet-50 text-violet-700',   text: 'text-violet-700' },
  coordination_complexity:   { bar: 'from-amber-500 to-amber-600',     pill: 'bg-amber-50 text-amber-700',     text: 'text-amber-700' },
  industry_context:          { bar: 'from-teal-500 to-teal-600',       pill: 'bg-teal-50 text-teal-700',       text: 'text-teal-700' },
  culture_change_readiness:  { bar: 'from-emerald-500 to-emerald-600', pill: 'bg-emerald-50 text-emerald-700', text: 'text-emerald-700' },
  governance_accountability: { bar: 'from-red-500 to-red-600',         pill: 'bg-red-50 text-red-700',         text: 'text-red-700' },
  leadership_capability:     { bar: 'from-fuchsia-500 to-fuchsia-600', pill: 'bg-fuchsia-50 text-fuchsia-700', text: 'text-fuchsia-700' },
};

// Verbatim from Input_Scoring rows 24-31
export const INDUSTRY_WEIGHTS: Record<string, Record<DimensionKey, number>> = {
  'Financial Services': { ai_maturity: 0.15, skills_talent: 0.15, resources_investment: 0.10, coordination_complexity: 0.05, industry_context: 0.10, culture_change_readiness: 0.10, governance_accountability: 0.25, leadership_capability: 0.10 },
  'Healthcare':         { ai_maturity: 0.15, skills_talent: 0.15, resources_investment: 0.10, coordination_complexity: 0.05, industry_context: 0.10, culture_change_readiness: 0.10, governance_accountability: 0.25, leadership_capability: 0.10 },
  'Manufacturing':      { ai_maturity: 0.20, skills_talent: 0.15, resources_investment: 0.15, coordination_complexity: 0.05, industry_context: 0.05, culture_change_readiness: 0.15, governance_accountability: 0.15, leadership_capability: 0.10 },
  'Technology':         { ai_maturity: 0.25, skills_talent: 0.20, resources_investment: 0.10, coordination_complexity: 0.05, industry_context: 0.00, culture_change_readiness: 0.20, governance_accountability: 0.10, leadership_capability: 0.10 },
  'Retail':             { ai_maturity: 0.20, skills_talent: 0.15, resources_investment: 0.10, coordination_complexity: 0.05, industry_context: 0.10, culture_change_readiness: 0.15, governance_accountability: 0.15, leadership_capability: 0.10 },
  'Other':              { ai_maturity: 0.20, skills_talent: 0.15, resources_investment: 0.15, coordination_complexity: 0.10, industry_context: 0.10, culture_change_readiness: 0.10, governance_accountability: 0.10, leadership_capability: 0.10 },
};

export const INDUSTRY_GATES: Record<string, { governance: number; ai_maturity: number; culture: number; leadership: number; rationale: string }> = {
  'Financial Services': { governance: 3.5, ai_maturity: 2.0, culture: 2.0, leadership: 2.5, rationale: 'Regulatory compliance prerequisite (FINRA)' },
  'Healthcare':         { governance: 3.5, ai_maturity: 2.0, culture: 2.5, leadership: 2.5, rationale: 'Patient safety, clinical validation' },
  'Manufacturing':      { governance: 2.5, ai_maturity: 3.0, culture: 2.0, leadership: 2.0, rationale: 'Operational safety, scaled deployment' },
  'Technology':         { governance: 2.0, ai_maturity: 3.0, culture: 3.0, leadership: 2.5, rationale: 'Innovation speed, talent retention' },
  'Retail':             { governance: 2.5, ai_maturity: 2.5, culture: 2.5, leadership: 2.0, rationale: 'Balanced customer experience focus' },
  'Other':              { governance: 2.5, ai_maturity: 2.5, culture: 2.5, leadership: 2.0, rationale: '' },
};

// -----------------------------------------------------------------------------
// 6 Expanded archetypes (AI Readiness × Complexity)  — Reference_Tables §1
// -----------------------------------------------------------------------------

export const EXPANDED_ARCHETYPES = [
  { key: 'Stagnating-Simple',    scoreRange: '1.0-2.49', complexity: 'Simple (<20 nodes)',       pctCompanies: '25%', description: 'Early AI, simple org; mutual adjustment coordination',      gain: '10-15%',      coordination: 'Mutual Adjustment' },
  { key: 'Stagnating-Complex',   scoreRange: '1.0-2.49', complexity: 'Moderate-Complex (20+)',   pctCompanies: '35%', description: 'Early AI, complex org; heavy hierarchy, slow adoption',    gain: '5-15%',       coordination: 'Direct Supervision' },
  { key: 'Scaling-Simple',       scoreRange: '2.5-3.49', complexity: 'Simple (<20 nodes)',       pctCompanies: '10%', description: 'Active AI, lean org; rapid experimentation possible',       gain: '25-40%',      coordination: 'Standardization of Skills' },
  { key: 'Scaling-Complex',      scoreRange: '2.5-3.49', complexity: 'Moderate-Complex (20+)',   pctCompanies: '20%', description: 'Active AI, complex org; matrix + agent orchestration',      gain: '20-35%',      coordination: 'Standardization of Outputs' },
  { key: 'Future-Built-Simple',  scoreRange: '3.5-5.0',  complexity: 'Simple (<20 nodes)',       pctCompanies: '3%',  description: 'AI-native, lean; flat autonomous, network structure',       gain: '60%+ / 3x-10x',coordination: 'Mutual Adjustment (AI-enhanced)' },
  { key: 'Future-Built-Complex', scoreRange: '3.5-5.0',  complexity: 'Moderate-Complex (20+)',   pctCompanies: '7%',  description: 'AI-native, complex; federated AI with agent networks',      gain: '50%+ / 1.7x revenue', coordination: 'Standardization of Outputs (AI)' },
] as const;

// -----------------------------------------------------------------------------
// Structure spans + recommendation matrix
// -----------------------------------------------------------------------------

export const STRUCTURE_SPANS: Record<string, { min: number; max: number }> = {
  'Traditional Hierarchy': { min: 4, max: 7 },
  'Functional':            { min: 5, max: 8 },
  'Matrix':                { min: 3, max: 5 },
  'Flat/Agile':            { min: 10, max: 20 },
  'Network':               { min: 15, max: 25 },
};

export const STRUCTURE_MATRIX: Record<'Stagnating'|'Scaling'|'Future-built', Record<Phase, string>> = {
  'Stagnating':  { 'Phase 1': 'Traditional + AI Pilots',    'Phase 2': 'Functional + Hybrid Teams',     'Phase 3': 'Matrix + AI Automation',       'Phase 4': 'Flat/Agile + AI Integration' },
  'Scaling':     { 'Phase 1': 'Functional + AI Teams',      'Phase 2': 'Matrix + Agent Orchestration',  'Phase 3': 'Flat/Agile + Semi-Autonomous', 'Phase 4': 'Network + AI-Native Ops' },
  'Future-built':{ 'Phase 1': 'Flat/Agile + Full AI Teams', 'Phase 2': 'Network + Agent Networks',      'Phase 3': 'AI-Integrated + Autonomous',   'Phase 4': 'AI-Native + Minimal Hierarchy' },
};

export const PHASE_ATTRIBUTES: Record<Phase, { timeline: string; agentRole: string; governance: string; ratio: string; gain: string; span: string; layers: string; keyRoles: string; investment: string; risk: string; change: string; success: string; gates: string }> = {
  'Phase 1': { timeline: '2025-2027', agentRole: 'Subordinates/Copilots',    governance: 'Observe & Advise',              ratio: '1:1-3',    gain: '10-20%',              span: '5-8 (traditional)',       layers: 'Traditional (4-7)',      keyRoles: 'CAIO, AI Champion',                  investment: 'Pilots & Training',           risk: 'Low',         change: 'Awareness & Education',         success: 'AI tool adoption rate',        gates: 'Score ≥2.0 all dims + Governance gate' },
  'Phase 2': { timeline: '2027-2029', agentRole: 'Peers',                    governance: 'Act with Approval',             ratio: '1:5-20',   gain: '25-50%',              span: '8-15 (expanding)',        layers: 'Reduced by 1-2',         keyRoles: 'Agent Orchestrator, Hybrid Mgr',     investment: 'Scale & Integration',         risk: 'Medium',      change: 'Skill Building & Adoption',     success: 'Process automation %',        gates: 'Composite ≥2.5 + All gates pass + Readiness audit' },
  'Phase 3': { timeline: '2029-2031', agentRole: 'Semi-Autonomous',          governance: 'Act Autonomously (bounded)',    ratio: '1:20-100', gain: '60%+ cost reduction', span: '15-25 (wide)',            layers: 'Reduced by 2-4',         keyRoles: 'Agentic Process Owner',              investment: 'Automation & Autonomy',       risk: 'Medium-High', change: 'Restructuring & Reskilling',    success: 'Cost reduction achieved',     gates: 'Composite ≥3.5 + Board approval + External audit' },
  'Phase 4': { timeline: '2031-2033+',agentRole: 'Autonomous Networks',      governance: 'Full Autonomy (monitored)',     ratio: '1:100+',   gain: '3x-10x multiplier',   span: '25+ (AI-managed)',        layers: 'Minimal (2-3)',          keyRoles: 'AI-Native Architect',                investment: 'AI-Native Operations',        risk: 'High',        change: 'Cultural Transformation',       success: 'Revenue per employee',        gates: 'Composite ≥4.0 + Full readiness + Board + Audit' },
};

// -----------------------------------------------------------------------------
// 7 Hierarchy layers (Output_RoleMatrix)
// -----------------------------------------------------------------------------

export const HIERARCHY_ROLES = [
  { layer: 1, level: 'C-Suite',        human: 'Chief AI Officer (CAIO)\nChief AI Risk Officer\nCEO (AI Decision-Maker)', agent: 'Strategic AI advisory systems\nCEO decision-support agents',                        reports: 'CAIO → CEO',                    ratio: '1:1-3',    phase: 'Phase 1 (2025-2026)',   respons: 'AI strategy alignment, enterprise value creation, risk & trust governance' },
  { layer: 2, level: 'VP/Senior Dir',  human: 'AI Agent Orchestrator\nVP of AI Strategy\nHuman-Agent Collaboration Designer\nAI Ethics & Governance Specialist', agent: 'Multi-agent orchestration platforms\nGovernance monitoring agents', reports: 'Orchestrator → CAIO/CTO',       ratio: '1:50-200', phase: 'Phase 2 (2026-2027)',   respons: 'Fleet management of AI agents, agent stack oversight, cross-silo coordination' },
  { layer: 3, level: 'Director',       human: 'Director of AI Operations\nAgentic Process Owner\nDirector of AI Governance',                                    agent: 'Process-level autonomous agents\nCompliance monitoring agents',                            reports: 'Director → VP/Orchestrator',    ratio: '1:100+',   phase: 'Phase 2-3 (2026-2028)', respons: 'End-to-end process ownership, autonomous workflow design, compliance' },
  { layer: 4, level: 'Manager',        human: 'Hybrid Manager\nSupport Agent Manager\nAgent Operations Manager',                                                agent: 'Task-execution agents\nCustomer service agents\nWorkflow agents',                          reports: 'Manager → Director',            ratio: '1:20-50',  phase: 'Phase 1-2 (2025-2027)', respons: 'Blended team leadership, agent performance monitoring, 24/7 orchestration' },
  { layer: 5, level: 'Senior IC',      human: 'AI Agent Builder\nAI Agent Owner\nAI Architect\nPrompt/Context Engineer',                                        agent: 'Specialized task agents\nCode generation agents\nAnalysis agents',                        reports: 'IC → Manager/Hybrid Manager',   ratio: '1:3-10',   phase: 'Phase 1 (2025-2026)',   respons: 'Bridge business needs & technical execution, maximize agent strategic impact' },
  { layer: 6, level: 'IC',             human: 'AI Champion\nAI Coach\nAI Accelerator\nKnowledge Worker + Copilot',                                              agent: 'Copilot agents\nResearch assistants\nData processing agents',                              reports: 'IC → Manager',                  ratio: '1:1-3',    phase: 'Phase 1 (2025-2026)',   respons: 'Cultural adoption, daily AI usage, productivity enhancement' },
  { layer: 7, level: 'AI-Only Layer',  human: 'N/A (Human oversight only)',                                                                                     agent: 'Autonomous execution agents\nMulti-agent coordination systems\nAgent-to-agent networks', reports: 'Agents → Orchestrator/Hybrid',  ratio: '0:many',   phase: 'Phase 3-4 (2028-2030+)',respons: 'Autonomous execution within boundaries, 24/7 operations, self-coordination' },
] as const;

// 5 emerging role archetypes
export const EMERGING_ROLES = [
  { archetype: 'Prototyper', func: 'Rapid concept validation with AI',       traditional: 'Product Manager / Designer',   aiLevel: 'High - AI co-creation',           phase: 'Phase 1-2' },
  { archetype: 'Builder',    func: 'Construct AI-powered solutions',         traditional: 'Software Engineer / Developer',aiLevel: 'Very High - AI pair programming', phase: 'Phase 1-2' },
  { archetype: 'Sweeper',    func: 'Quality assurance & exception handling', traditional: 'QA / Compliance Officer',      aiLevel: 'Medium - AI flags, human resolves',phase: 'Phase 2-3' },
  { archetype: 'Grower',     func: 'Scale and optimize AI systems',          traditional: 'Growth Manager / Ops Lead',    aiLevel: 'High - AI-driven optimization',   phase: 'Phase 2-3' },
  { archetype: 'Maintainer', func: 'Sustain & govern AI operations',         traditional: 'IT Operations / SRE',          aiLevel: 'Very High - AI self-healing',     phase: 'Phase 3-4' },
] as const;

// 9-domain accountability
export const ACCOUNTABILITY_MATRIX = [
  { domain: 'Strategy & Vision',        human: 'Yes',       ai: 'No',   shared: 'Decision support' },
  { domain: 'Ethics & Compliance',      human: 'Yes',       ai: 'No',   shared: 'Monitoring & flagging' },
  { domain: 'Exception Handling',       human: 'Yes',       ai: 'No',   shared: 'Escalation triggers' },
  { domain: 'Creative Work',            human: 'Yes',       ai: 'No',   shared: 'Ideation assistance' },
  { domain: 'Routine Execution',        human: 'No',        ai: 'Yes',  shared: 'Human oversight' },
  { domain: 'Data Processing',          human: 'No',        ai: 'Yes',  shared: 'Quality validation' },
  { domain: 'Workflow Coordination',    human: 'Oversight', ai: 'Yes',  shared: 'Handoff management' },
  { domain: 'Relationship Management',  human: 'Yes',       ai: 'No',   shared: 'CRM automation' },
  { domain: 'System Design',            human: 'Yes',       ai: 'No',   shared: 'Architecture suggestions' },
] as const;

// -----------------------------------------------------------------------------
// 10 functions (Input_AgentConfig)
// -----------------------------------------------------------------------------

export const FUNCTION_CATALOG = [
  { key: 'hr_people',        label: 'HR & People Operations',      type: 'Shared Services' as const, defaultHeadcount: 80,  defaultAutomated: 20 },
  { key: 'finance',          label: 'Finance & Accounting',        type: 'Shared Services' as const, defaultHeadcount: 100, defaultAutomated: 30 },
  { key: 'it_infra',         label: 'IT & Infrastructure',         type: 'Shared Services' as const, defaultHeadcount: 120, defaultAutomated: 25 },
  { key: 'procurement',      label: 'Procurement & Supply Chain',  type: 'Shared Services' as const, defaultHeadcount: 60,  defaultAutomated: 15 },
  { key: 'customer_service', label: 'Customer Service',            type: 'Shared Services' as const, defaultHeadcount: 150, defaultAutomated: 30 },
  { key: 'rd_innovation',    label: 'R&D / Innovation',            type: 'Specialized'     as const, defaultHeadcount: 120, defaultAutomated: 20 },
  { key: 'product_eng',      label: 'Product & Engineering',       type: 'Specialized'     as const, defaultHeadcount: 150, defaultAutomated: 10 },
  { key: 'sales_bd',         label: 'Sales & Business Dev',        type: 'Specialized'     as const, defaultHeadcount: 100, defaultAutomated: 15 },
  { key: 'legal_compliance', label: 'Legal & Compliance',          type: 'Specialized'     as const, defaultHeadcount: 40,  defaultAutomated: 5  },
  { key: 'marketing_comms',  label: 'Marketing & Communications',  type: 'Specialized'     as const, defaultHeadcount: 80,  defaultAutomated: 35 },
] as const;

// Team composition patterns
export const TEAM_COMPOSITION_MODELS = [
  { type: 'Shared Services (High Automation)',    structure: 'Supervisor + AI Team',      humanRole: 'Supervisor: Monitors, handles exceptions, approves outputs',      subordinateRole: 'Execute routine tasks: data entry, reconciliation, ticket routing, payroll processing', peerRole: 'Handle complex queries: analysis, reporting, cross-system coordination', example: '1 HR Manager supervises 4 AI agents processing leave requests & onboarding' },
  { type: 'Specialized (Peer Collaboration)',     structure: 'Human-AI Partnership',      humanRole: 'Domain expert: Strategy, creative decisions, stakeholder relationships', subordinateRole: 'Support tasks: research compilation, draft preparation, data gathering',            peerRole: 'Co-create outputs: code review, design iteration, market analysis, legal research', example: '1 Product Manager works with 1 AI peer on roadmap and 1 AI assistant for research' },
  { type: 'Leadership & Strategy (AI-Augmented)', structure: 'Human-Led + AI Advisory',   humanRole: 'Decision-maker: Vision, culture, stakeholder mgmt, ethics oversight',    subordinateRole: 'Administrative support: scheduling, reporting, meeting prep',                     peerRole: 'Strategic advisor: scenario modeling, market intelligence, risk assessment', example: 'CEO uses AI peer for strategic scenarios + AI assistant for briefings' },
] as const;

// Recommended ratios by maturity tier (Input_AgentConfig section 2)
export const MATURITY_RATIO_TIERS = [
  { tier: 'Stagnating (Low)',     range: '1.0 - 2.49', ratio: '5:1 to 3:1', pctSubordinate: 0.80, pctPeer: 0.20, intensity: 'Low (5-15%)',    guidance: 'Agents assist humans; heavy supervision required' },
  { tier: 'Scaling (Medium)',     range: '2.5 - 3.99', ratio: '3:1 to 1:1', pctSubordinate: 0.60, pctPeer: 0.40, intensity: 'Medium (25-50%)', guidance: 'Agents handle routine; humans supervise & handle exceptions' },
  { tier: 'Future-Built (High)',  range: '4.0 - 5.0',  ratio: '1:1 to 1:3', pctSubordinate: 0.35, pctPeer: 0.65, intensity: 'High (50-80%)',   guidance: 'Agents work autonomously as peers; humans focus on strategy' },
] as const;

// -----------------------------------------------------------------------------
// RAPID decision defaults
// -----------------------------------------------------------------------------

export const DEFAULT_RAPID: ODRapidDecision[] = [
  { key: 'ai_tool_selection', label: 'AI Tool Selection',       recommend: 'AI Team',        agree: 'CISO/CTO',        perform: 'IT Ops',       input_role: 'Business Units',    decide: 'CTO' },
  { key: 'agent_deployment',  label: 'AI Agent Deployment',     recommend: 'AI Ops',         agree: 'Legal/Compliance',perform: 'AI Engineers', input_role: 'HR/Affected Teams', decide: 'CAIO' },
  { key: 'restructuring',     label: 'Workforce Restructuring', recommend: 'HR/Strategy',    agree: 'CEO/Board',       perform: 'HR Ops',       input_role: 'Managers',          decide: 'CEO' },
  { key: 'budget_allocation', label: 'Budget Allocation (AI)',  recommend: 'CFO/Strategy',   agree: 'Board',           perform: 'Finance',      input_role: 'Department Heads',  decide: 'CEO' },
  { key: 'data_governance',   label: 'Data Governance',         recommend: 'Data Team',      agree: 'Legal/Privacy',   perform: 'Data Eng',     input_role: 'All Departments',   decide: 'CDO' },
  { key: 'process_automation',label: 'Process Automation',      recommend: 'Process Owners', agree: 'Risk/Compliance', perform: 'AI Team',      input_role: 'Workers',           decide: 'COO' },
];

// -----------------------------------------------------------------------------
// Value chain + capabilities defaults
// -----------------------------------------------------------------------------

export const DEFAULT_VALUE_CHAIN: ODValueChainActivity[] = [
  { key: 'inbound_logistics',  label: 'Inbound Logistics',                    kind: 'primary', strategic_importance: 3, ai_automation_potential: 4, current_capability_gap: 'Low' },
  { key: 'operations',         label: 'Operations / Production',              kind: 'primary', strategic_importance: 4, ai_automation_potential: 3, current_capability_gap: 'Medium' },
  { key: 'outbound_logistics', label: 'Outbound Logistics',                   kind: 'primary', strategic_importance: 3, ai_automation_potential: 4, current_capability_gap: 'Low' },
  { key: 'marketing_sales',    label: 'Marketing & Sales',                    kind: 'primary', strategic_importance: 5, ai_automation_potential: 4, current_capability_gap: 'High' },
  { key: 'service_support',    label: 'Service & Support',                    kind: 'primary', strategic_importance: 4, ai_automation_potential: 5, current_capability_gap: 'Medium' },
  { key: 'technology_dev',     label: 'Technology Development',               kind: 'support', strategic_importance: 5, ai_automation_potential: 4, current_capability_gap: 'Medium' },
  { key: 'hr_mgmt',            label: 'Human Resource Management',            kind: 'support', strategic_importance: 3, ai_automation_potential: 3, current_capability_gap: 'Medium' },
  { key: 'procurement',        label: 'Procurement',                          kind: 'support', strategic_importance: 2, ai_automation_potential: 4, current_capability_gap: 'Low' },
  { key: 'firm_infra',         label: 'Firm Infrastructure (Finance, Legal)', kind: 'support', strategic_importance: 3, ai_automation_potential: 3, current_capability_gap: 'Low' },
];

export const DEFAULT_CAPABILITIES: ODCriticalCapability[] = [
  { key: 'ai_ml_eng',      label: 'AI/ML Engineering',        priority: 5, current_maturity: 3, source_strategy: 'Build' },
  { key: 'data_analytics', label: 'Data Analytics & Science', priority: 5, current_maturity: 3, source_strategy: 'Build' },
  { key: 'process_auto',   label: 'Process Automation',       priority: 4, current_maturity: 2, source_strategy: 'Bot' },
  { key: 'change_mgmt',    label: 'Change Management',        priority: 4, current_maturity: 3, source_strategy: 'Build' },
  { key: 'ai_governance',  label: 'AI Governance & Ethics',   priority: 4, current_maturity: 2, source_strategy: 'Buy' },
  { key: 'cx_design',      label: 'Customer Experience Design',priority: 3, current_maturity: 4, source_strategy: 'Borrow' },
];

// -----------------------------------------------------------------------------
// Cost benchmarks & workforce mix (Logic_TransitionEcon + Logic_WorkforcePlan)
// -----------------------------------------------------------------------------

export const COST_BENCHMARKS = {
  weeklySalary: 2500,
  severanceCSuiteWeeks: 40,   // 30-50+ (Challenger)
  severanceVPWeeks: 20,       // 15-25 (Challenger)
  severanceICWeeks: 8,        // <10 (Challenger)
  reskillingPerEmployee: 24800, // WEF benchmark
  hiringNonExec: 5475,        // SHRM 2025
  hiringExecutive: 35879,     // SHRM 2025
  reskillingSavingsVsHiring: 49000, // Standard Chartered
  productivityDipPct: 0.15,
  productivityDipMonths: 18,
  engagementDeclinePct: 0.21, // Gallup 2024
} as const;

export const WORKFORCE_MIX_DEFAULT = { build: 0.40, buy: 0.20, borrow: 0.15, bot: 0.25 };

export const SCENARIO_ATTRIBUTES = [
  { scenario: 'Conservative', timeline: '7-10 years', p1: '2025-2028 (3 yrs)', p2: '2028-2031 (3 yrs)', p3: '2031-2034 (3 yrs)', p4: '2034+ (ongoing)',    productivity: '10-25%',        investment: '1-2%', headcount: '5-10%',  risk: 'Low',    disruption: 'Minimal',     advantage: 'Incremental',    success: '70-80%', payback: '3-5 years', cultural: 'Low stress',       attrition: '5-10% attrition',   ratio: '1:3-5',   layers: '1-2', governance: 'Observe & Advise' },
  { scenario: 'Moderate',     timeline: '5-7 years',  p1: '2025-2027 (2 yrs)', p2: '2027-2029 (2 yrs)', p3: '2029-2031 (2 yrs)', p4: '2031-2033+ (2+ yrs)',productivity: '25-60%',        investment: '2-4%', headcount: '15-25%', risk: 'Medium', disruption: 'Moderate',    advantage: 'Meaningful',     success: '50-60%', payback: '2-3 years', cultural: 'Manageable change',attrition: '15-20% attrition',  ratio: '1:20-50', layers: '2-4', governance: 'Act with Approval' },
  { scenario: 'Aggressive',   timeline: '3-5 years',  p1: '2025-2026 (1 yr)',  p2: '2026-2028 (2 yrs)', p3: '2028-2029 (1 yr)',  p4: '2029-2031 (2 yrs)',  productivity: '60%+ to 3x-10x',investment: '4-8%', headcount: '30-50%', risk: 'High',   disruption: 'Significant', advantage: 'Transformative', success: '24-30%', payback: '1-2 years', cultural: 'High disruption',  attrition: '25-30% attrition',  ratio: '1:100+',  layers: '4-6', governance: 'Act Autonomously' },
] as const;

// Evidence tiers (Reference_Tables §2)
export const EVIDENCE_TIERS = [
  { tier: 'PROVEN TODAY', study: 'GitHub Copilot (Microsoft Research)',  gain: '55.8% faster task completion', sample: 'Controlled experiment',      source: 'Microsoft Research',        confidence: 'High (RCT)',       year: 2023 },
  { tier: 'PROVEN TODAY', study: 'BCG/Harvard Jagged Frontier',           gain: '12.2% more tasks, 25.1% faster, 40% quality', sample: '758 BCG consultants', source: 'Harvard/Wharton/MIT',  confidence: 'High (RCT)',       year: 2023 },
  { tier: 'PROVEN TODAY', study: 'Stanford/MIT Customer Service',         gain: '14% avg productivity; 34% for novices', sample: '5,172 agents',        source: 'Stanford GSB',            confidence: 'High (large n)',   year: 2023 },
  { tier: 'PROVEN TODAY', study: 'Klarna AI Assistant',                    gain: '700 FTE-equivalent automated', sample: '150M customers served',     source: 'Klarna Press Release',      confidence: 'Medium (single co)',year: 2024 },
  { tier: 'EMERGING',     study: 'BCG European Bank',                     gain: '90%+ loan automation, 50%+ productivity', sample: 'Single institution pilot', source: 'BCG Case Study',      confidence: 'Medium (pilot)',   year: 2024 },
  { tier: 'EMERGING',     study: 'BCG Industrial Goods',                   gain: '~70% requests resolved without humans', sample: 'Single company',      source: 'BCG Case Study',            confidence: 'Medium (pilot)',   year: 2024 },
  { tier: 'THEORETICAL',  study: 'McKinsey Projection',                    gain: '60% work hours automatable; 3x-10x', sample: 'Modeling estimate',    source: 'McKinsey 2024-25',         confidence: 'Low (projection)', year: 2024 },
  { tier: 'THEORETICAL',  study: 'Full Agentic Redesign',                  gain: '60%+ cost reduction (vs <20% overlay)', sample: 'Framework estimate',source: 'BCG/Internal',              confidence: 'Low (limited data)',year: 2025 },
] as const;

// Human:AI ratio real deployments (Reference_Tables §3)
export const RATIO_BENCHMARKS = [
  { company: 'ClickUp',                 ratio: '3:1',   context: '3,000 agents for ~1,000 employees (production)', year: 2026, source: 'Fortune' },
  { company: 'Midmarket (Techaisle)',   ratio: '144:1', context: 'Custom agentic ecosystems',                       year: 2026, source: 'Techaisle Research' },
  { company: 'Small Business (Techaisle)',ratio: '59:1',context: 'Packaged AI features',                            year: 2026, source: 'Techaisle Research' },
  { company: 'NVIDIA (Target)',          ratio: '100:1',context: '75,000 workers : 7.5M agents (planned)',          year: 2036, source: 'NVIDIA/Internal' },
  { company: 'Goldman Sachs (Planned)',  ratio: 'Hundreds-Thousands', context: 'AI software engineers alongside 12,000', year: 2025, source: 'Internal Framework' },
] as const;

// Productivity J-curve (Logic_TransitionEcon §4)
export const PRODUCTIVITY_JCURVE = [
  { quarter: 'Q1 (Start)',       months: '0-3',   productivity: 0.85, cumulative: -0.15, note: 'Initial disruption, learning curve' },
  { quarter: 'Q2',               months: '3-6',   productivity: 0.80, cumulative: -0.20, note: 'Deepest dip; restructuring underway' },
  { quarter: 'Q3',               months: '6-9',   productivity: 0.88, cumulative: -0.12, note: 'Early adopters showing gains' },
  { quarter: 'Q4',               months: '9-12',  productivity: 0.95, cumulative: -0.05, note: 'Recovery begins' },
  { quarter: 'Q5',               months: '12-15', productivity: 1.05, cumulative: 0.05,  note: 'Break-even; new processes stabilizing' },
  { quarter: 'Q6',               months: '15-18', productivity: 1.15, cumulative: 0.15,  note: 'Gains accelerating' },
  { quarter: 'Q7',               months: '18-21', productivity: 1.25, cumulative: 0.25,  note: 'Full productivity recovery + gains' },
  { quarter: 'Q8 (Steady State)',months: '21-24', productivity: 1.35, cumulative: 0.35,  note: 'Target state achieved' },
] as const;

// -----------------------------------------------------------------------------
// Defaults for inputs
// -----------------------------------------------------------------------------

export const DEFAULT_PROFILE: ODOrgProfile = {
  company_name: 'Acme Corp',
  company_size: 1000,
  industry: 'Technology',
  structure_type: 'Functional',
  scenario_pathway: 'Moderate',
  current_phase: 'Phase 1',
  target_phase: 'Phase 2',
  annual_revenue_m: 500,
  ai_budget_pct: 0.02,
  num_departments: 8,
  geographic_presence: 'National',
};

export const DEFAULT_STRATEGY: ODStrategyInputs = {
  business_model: 'Product-led',
  competitive_positioning: 'Differentiation',
  primary_value_driver: 'Technology & Innovation',
  market_dynamics: 'Fast-moving',
  revenue_model: 'Subscription',
  value_chain: DEFAULT_VALUE_CHAIN,
  capabilities: DEFAULT_CAPABILITIES,
};

export const DEFAULT_OPERATING_MODEL: ODOperatingModelInputs = {
  num_product_lines: 5,
  num_geographies: 10,
  num_customer_segments: 3,
  coordination_mechanism: 'Standardization of Outputs',
  operating_archetype: 'Coordination',
  rapid_decisions: DEFAULT_RAPID,
};

export const DEFAULT_SCORES: ODMaturityScores = {
  ai_maturity: 4, skills_talent: 4, resources_investment: 4, coordination_complexity: 4,
  industry_context: 4, culture_change_readiness: 4, governance_accountability: 4, leadership_capability: 4,
};

export const DEFAULT_FUNCTIONS: ODFunctionConfig[] = FUNCTION_CATALOG.map((f) => ({
  key: f.key, label: f.label, type: f.type,
  headcount: f.defaultHeadcount, automated_processes: f.defaultAutomated,
}));

export const DEFAULT_AGENT_CONFIG: ODAgentConfig = {
  total_automated_processes: 200,
  target_ratio_label: '3:1',
  span_of_control: 8,
  pct_subordinate: 0.60,
  pct_peer: 0.40,
  functions: DEFAULT_FUNCTIONS,
};
