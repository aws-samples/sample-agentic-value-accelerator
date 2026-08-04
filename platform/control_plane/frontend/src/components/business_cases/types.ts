import type {
  BusinessCase,
  BusinessCaseCreate,
  BusinessCaseStatus,
  IndustrySubSector,
  BCAITechnologyType,
  ProjectSize,
  ProjectInputs,
  CostModel,
  BenefitModel,
  CostLineItem,
  BenefitLineItem,
  RiskScorecard,
  RiskWeights,
  ComputedBC,
  ComputedFinancials,
  ComputedRisk,
  CashFlowYear,
} from '../../api/client';

export type {
  BusinessCase, BusinessCaseCreate, BusinessCaseStatus,
  IndustrySubSector, BCAITechnologyType, ProjectSize,
  ProjectInputs, CostModel, BenefitModel, CostLineItem, BenefitLineItem,
  RiskScorecard, RiskWeights, ComputedBC, ComputedFinancials, ComputedRisk, CashFlowYear,
};

export const STATUSES: BusinessCaseStatus[] = ['Draft', 'Review', 'Approved', 'Rejected', 'Archived'];
export const INDUSTRIES: IndustrySubSector[] = ['Retail Banking', 'Insurance', 'Capital Markets', 'Other'];
export const AI_TYPES: BCAITechnologyType[] = ['Traditional ML', 'Generative AI', 'Agentic AI'];
export const PROJECT_SIZES: ProjectSize[] = ['Small', 'Medium', 'Large'];

export const RISK_CATEGORIES = [
  { key: 'technical',         label: 'Technical Risk',           weight: 0.15 },
  { key: 'data',              label: 'Data Risk',                weight: 0.20 },
  { key: 'model',             label: 'Model Risk',               weight: 0.20 },
  { key: 'regulatory',        label: 'Regulatory & Compliance',  weight: 0.15 },
  { key: 'organizational',    label: 'Organizational Readiness', weight: 0.10 },
  { key: 'vendor_lockin',     label: 'Vendor & Lock-in Risk',    weight: 0.08 },
  { key: 'change_management', label: 'Change Management',        weight: 0.07 },
  { key: 'cybersecurity',     label: 'Cybersecurity & Adversarial', weight: 0.05 },
] as const;

export const INDUSTRY_WACC: Record<IndustrySubSector, number> = {
  'Retail Banking': 0.0498,
  'Insurance': 0.0634,
  'Capital Markets': 0.0608,
  'Other': 0.05,
};

export const DEFAULT_INPUTS: ProjectInputs = {
  sponsor: '', business_unit: '', evaluation_date: null,
  industry: 'Other', ai_technology_type: 'Generative AI', project_size: 'Medium',
  wacc_base: 0.0498, technology_risk_premium: 0.04, hurdle_rate: 0.12,
  tax_rate: 0.21, inflation_rate: 0.025,
  ramp_y1: 0.25, ramp_y2: 0.65, ramp_y3: 0.90,
  compliance_adder_pct: 0.15,
};

export const DEFAULT_RISK: RiskScorecard = {
  technical: 3, data: 3, model: 3, regulatory: 3,
  organizational: 3, vendor_lockin: 3, change_management: 3, cybersecurity: 3,
};

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  technical: 0.15, data: 0.20, model: 0.20, regulatory: 0.15,
  organizational: 0.10, vendor_lockin: 0.08, change_management: 0.07, cybersecurity: 0.05,
};

export const DEFAULT_COSTS: CostModel = {
  initial: [
    { label: 'Infrastructure & Cloud Setup',     year_0: 250, year_1: 0, year_2: 0, year_3: 0 },
    { label: 'AI Platform / Software Licenses',  year_0: 200, year_1: 0, year_2: 0, year_3: 0 },
    { label: 'Data Engineering & Preparation',   year_0: 350, year_1: 0, year_2: 0, year_3: 0 },
    { label: 'Model Development & Training',     year_0: 400, year_1: 0, year_2: 0, year_3: 0 },
    { label: 'System Integration & Testing',     year_0: 200, year_1: 0, year_2: 0, year_3: 0 },
    { label: 'Change Management & Training',     year_0: 150, year_1: 0, year_2: 0, year_3: 0 },
    { label: 'Regulatory Compliance Setup',      year_0: 100, year_1: 0, year_2: 0, year_3: 0 },
  ],
  operating: [
    { label: 'Inference / API / Token Costs',      year_0: 0, year_1: 100, year_2: 150, year_3: 200 },
    { label: 'Cloud Compute & GPU',                year_0: 0, year_1: 80,  year_2: 100, year_3: 120 },
    { label: 'Data Storage & Management',          year_0: 0, year_1: 40,  year_2: 50,  year_3: 55 },
    { label: 'Model Retraining & Updates',         year_0: 0, year_1: 60,  year_2: 80,  year_3: 90 },
    { label: 'MLOps & Monitoring',                 year_0: 0, year_1: 50,  year_2: 60,  year_3: 70 },
    { label: 'Governance & Compliance (Ongoing)', year_0: 0, year_1: 80,  year_2: 90,  year_3: 100 },
    { label: 'Cybersecurity & Risk Controls',      year_0: 0, year_1: 30,  year_2: 35,  year_3: 40 },
    { label: 'Vendor Licenses & Subscriptions',    year_0: 0, year_1: 100, year_2: 110, year_3: 120 },
  ],
  staffing: [
    { label: 'Data Scientists',       year_0: 0, year_1: 250, year_2: 300, year_3: 400 },
    { label: 'ML Engineers',          year_0: 0, year_1: 350, year_2: 400, year_3: 400 },
    { label: 'Data Engineers',        year_0: 0, year_1: 250, year_2: 280, year_3: 280 },
    { label: 'Project / Program Mgmt', year_0: 0, year_1: 180, year_2: 180, year_3: 150 },
    { label: 'Domain Experts / SMEs', year_0: 0, year_1: 130, year_2: 130, year_3: 100 },
    { label: 'Change Management',     year_0: 0, year_1: 120, year_2: 100, year_3: 80 },
  ],
};

export const DEFAULT_BENEFITS: BenefitModel = {
  tangible: [
    { label: 'Cost Savings — Process Automation',          year_1: 350, year_2: 600, year_3: 720 },
    { label: 'Cost Savings — FTE Redeployment',            year_1: 250, year_2: 375, year_3: 450 },
    { label: 'Cost Savings — Error/Rework Reduction',      year_1: 100, year_2: 150, year_3: 180 },
    { label: 'Revenue Uplift — Personalization/Cross-sell', year_1: 300, year_2: 450, year_3: 540 },
    { label: 'Revenue Uplift — New Products/Services',     year_1: 150, year_2: 225, year_3: 270 },
    { label: 'Risk Reduction — Fraud Loss Avoidance',      year_1: 200, year_2: 300, year_3: 360 },
    { label: 'Risk Reduction — Compliance Penalty',        year_1: 75,  year_2: 125, year_3: 135 },
    { label: 'Operational Speed — Time-to-Market',         year_1: 100, year_2: 150, year_3: 180 },
  ],
  intangible: [
    { label: 'Customer Experience (NPS/CSAT)',        year_1: 150,  year_2: 400, year_3: 500 },
    { label: 'Employee Productivity & Satisfaction',  year_1: 125,  year_2: 250, year_3: 300 },
    { label: 'Competitive Advantage / Market Position', year_1: 150, year_2: 500, year_3: 800 },
    { label: 'Innovation Capacity / Option Value',    year_1: 67.5, year_2: 200, year_3: 450 },
    { label: 'Brand & Reputation Enhancement',        year_1: 50,   year_2: 250, year_3: 400 },
    { label: 'Organizational Learning & Agility',     year_1: 50,   year_2: 75,  year_3: 100 },
  ],
};
