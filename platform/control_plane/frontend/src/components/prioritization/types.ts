import type {
  UseCase,
  UseCaseCreate,
  PrioritizationScores,
  DimensionWeights,
  PrioritizationAIType,
  PrioritizationComplexity,
  PrioritizationAutomationScope,
  PrioritizationIntegrationDepth,
  UseCaseStatus,
  GoNoGo,
} from '../../api/client';

export type {
  UseCase,
  UseCaseCreate,
  PrioritizationScores,
  DimensionWeights,
  PrioritizationAIType,
  PrioritizationComplexity,
  PrioritizationAutomationScope,
  PrioritizationIntegrationDepth,
  UseCaseStatus,
  GoNoGo,
};

export const DIMENSIONS = [
  { key: 'business_value', name: 'Business Value', weight: 0.30, accent: 'blue' },
  { key: 'technical_feasibility', name: 'Technical Feasibility', weight: 0.20, accent: 'teal' },
  { key: 'risk_governance', name: 'Risk & Governance', weight: 0.15, accent: 'red' },
  { key: 'org_readiness', name: 'Org Readiness', weight: 0.15, accent: 'violet' },
  { key: 'strategic_alignment', name: 'Strategic Alignment', weight: 0.10, accent: 'indigo' },
  { key: 'cost_efficiency', name: 'Cost Efficiency', weight: 0.10, accent: 'emerald' },
] as const;

export const SUB_CRITERIA: Record<string, { key: string; label: string; weight: number; help: string }[]> = {
  business_value: [
    { key: 'revenue_impact', label: 'Revenue Impact', weight: 0.25, help: '5 = >15% growth · 1 = no impact' },
    { key: 'cost_savings', label: 'Cost Savings', weight: 0.25, help: '5 = >25% of cost base · 1 = none' },
    { key: 'productivity_gains', label: 'Productivity Gains', weight: 0.20, help: '5 = >6 hrs/person/week saved' },
    { key: 'customer_experience', label: 'Customer Experience', weight: 0.15, help: '5 = industry-leading CX' },
    { key: 'scalability_potential', label: 'Scalability Potential', weight: 0.15, help: '5 = enterprise + ecosystem reuse' },
  ],
  technical_feasibility: [
    { key: 'data_readiness', label: 'Data Readiness', weight: 0.25, help: '5 = real-time governed pipelines' },
    { key: 'technical_complexity', label: 'Technical Complexity', weight: 0.20, help: '5 = plug-and-play · 1 = R&D required' },
    { key: 'integration_requirements', label: 'Integration Requirements', weight: 0.20, help: '5 = standalone · 1 = 5+ system overhaul' },
    { key: 'time_to_value', label: 'Time-to-Value', weight: 0.20, help: '5 = <3 months · 1 = >18 months' },
    { key: 'talent_availability', label: 'Talent Availability', weight: 0.15, help: '5 = full team with proven expertise' },
  ],
  risk_governance: [
    { key: 'regulatory_compliance', label: 'Regulatory Compliance', weight: 0.25, help: '5 = fully compliant · 1 = EU AI Act prohibited' },
    { key: 'data_privacy_security', label: 'Data Privacy & Security', weight: 0.20, help: '5 = no sensitive data · 1 = PII/PHI' },
    { key: 'ethical_bias_risk', label: 'Ethical & Bias Risk', weight: 0.20, help: '5 = minimal · 1 = affects vulnerable groups' },
    { key: 'model_reliability', label: 'Model Reliability', weight: 0.20, help: '5 = highly reliable validated outputs' },
    { key: 'autonomous_decision_risk', label: 'Autonomous Decision Risk', weight: 0.15, help: '5 = human-in-the-loop · 1 = full autonomy on critical' },
  ],
  org_readiness: [
    { key: 'data_infrastructure', label: 'Data Infrastructure', weight: 0.25, help: '5 = real-time ML-ready · 1 = ad hoc' },
    { key: 'process_maturity', label: 'Process Maturity', weight: 0.20, help: '5 = continuous improvement culture' },
    { key: 'change_management', label: 'Change Management', weight: 0.20, help: '5 = change-ready agile culture' },
    { key: 'executive_sponsorship', label: 'Executive Sponsorship', weight: 0.20, help: '5 = board-level priority' },
    { key: 'cross_functional_collab', label: 'Cross-functional Collab.', weight: 0.15, help: '5 = integrated agile squads' },
  ],
  strategic_alignment: [
    { key: 'mission_criticality', label: 'Mission Criticality', weight: 0.35, help: '5 = essential to corporate mission' },
    { key: 'competitive_advantage', label: 'Competitive Advantage', weight: 0.35, help: '5 = disruptive differentiation' },
    { key: 'innovation_potential', label: 'Innovation Potential', weight: 0.30, help: '5 = breakthrough/transformational' },
  ],
  cost_efficiency: [
    { key: 'implementation_cost', label: 'Implementation Cost', weight: 0.35, help: '5 = <$100K · 1 = >$5M' },
    { key: 'ongoing_operational_cost', label: 'Ongoing Operational Cost', weight: 0.35, help: '5 = <$25K/yr · 1 = >$1M/yr' },
    { key: 'roi_timeline', label: 'ROI Timeline', weight: 0.30, help: '5 = <6 months · 1 = >3 years' },
  ],
};

export const DEFAULT_SCORES: PrioritizationScores = {
  business_value: { revenue_impact: 3, cost_savings: 3, productivity_gains: 3, customer_experience: 3, scalability_potential: 3 },
  technical_feasibility: { data_readiness: 3, technical_complexity: 3, integration_requirements: 3, time_to_value: 3, talent_availability: 3 },
  risk_governance: { regulatory_compliance: 3, data_privacy_security: 3, ethical_bias_risk: 3, model_reliability: 3, autonomous_decision_risk: 3 },
  org_readiness: { data_infrastructure: 3, process_maturity: 3, change_management: 3, executive_sponsorship: 3, cross_functional_collab: 3 },
  strategic_alignment: { mission_criticality: 3, competitive_advantage: 3, innovation_potential: 3 },
  cost_efficiency: { implementation_cost: 3, ongoing_operational_cost: 3, roi_timeline: 3 },
};

export const DEFAULT_WEIGHTS: DimensionWeights = {
  business_value: 0.30,
  technical_feasibility: 0.20,
  risk_governance: 0.15,
  org_readiness: 0.15,
  strategic_alignment: 0.10,
  cost_efficiency: 0.10,
};

export const AI_TYPES: PrioritizationAIType[] = ['Traditional ML', 'Generative AI', 'Agentic AI'];
export const COMPLEXITIES: PrioritizationComplexity[] = ['Low', 'Medium', 'High'];
export const AUTOMATION_SCOPES: PrioritizationAutomationScope[] = ['Augmentation', 'Co-pilot', 'Full Autonomy'];
export const INTEGRATION_DEPTHS: PrioritizationIntegrationDepth[] = ['Single-system batch', 'API-connected real-time', 'Multi-system orchestration'];
export const STATUSES: UseCaseStatus[] = ['Concept', 'Active', 'Pilot', 'Production', 'Paused', 'Archived'];
