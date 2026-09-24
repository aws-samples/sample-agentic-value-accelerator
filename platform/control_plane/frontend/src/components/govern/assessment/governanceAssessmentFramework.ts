/**
 * AI Governance Assessment Framework - Expanded
 *
 * Comprehensive assessment covering:
 * - Maturity levels (1-5) per domain
 * - 11 regulatory frameworks (NIST AI RMF, EU AI Act, SR 26-2, ISO 42001, CRI FS AI RMF, OSFI E-23, etc.)
 * - 14 governance domains with 8-10 questions each
 * - Gap analysis with remediation recommendations
 * - Stakeholder views (Board, Risk, Tech, Legal, Audit)
 * - Integration with Plan module (Organization Design, Operating Model, Use Cases)
 *
 * Domains mapped to AVA modules + regulatory frameworks
 */

// ─── Maturity Levels ───────────────────────────────────────────────────────

export type MaturityLevel = 1 | 2 | 3 | 4 | 5;

export const MATURITY_LEVELS: Record<MaturityLevel, { label: string; description: string; color: string }> = {
  1: { label: 'Initial', description: 'Ad-hoc, undocumented processes', color: 'rose' },
  2: { label: 'Developing', description: 'Basic processes defined but inconsistent', color: 'orange' },
  3: { label: 'Defined', description: 'Standardized processes across organization', color: 'amber' },
  4: { label: 'Managed', description: 'Measured, controlled, and continuously improved', color: 'blue' },
  5: { label: 'Optimizing', description: 'Industry-leading, automated, and adaptive', color: 'emerald' },
};

// ─── Regulatory Frameworks ─────────────────────────────────────────────────

// Lives here rather than in GovernanceAssessment.tsx so AssessmentResult.assessmentScope
// can reference it without the component and this module importing each other.
export type OperatingRegion = 'north_america' | 'eu' | 'apac' | 'latam' | 'mea' | 'canada';

export type FrameworkId =
  | 'NIST_AI_RMF'
  | 'EU_AI_ACT'
  | 'SR_26_2'
  | 'SR_11_7'
  | 'ISO_42001'
  | 'CRI_FS_AI_RMF'
  | 'OSFI_E23'
  | 'NAIC_AI_BULLETIN'
  | 'MAS_FEAT'
  | 'SG_AI_FRAMEWORK'
  | 'APRA_CPG235';

export interface RegulatoryFramework {
  id: FrameworkId;
  name: string;
  shortName: string;
  description: string;
  applicability: string;
  regions: string[];
  industries: string[];
  effectiveDate?: string;
  mandatory: boolean;
}

export const REGULATORY_FRAMEWORKS: RegulatoryFramework[] = [
  {
    id: 'NIST_AI_RMF',
    name: 'NIST AI Risk Management Framework',
    shortName: 'NIST AI RMF',
    description: 'Voluntary framework for managing AI risks throughout the AI lifecycle',
    applicability: 'US organizations, federal contractors, global best practice',
    regions: ['US', 'Global'],
    industries: ['All'],
    effectiveDate: '2023-01-26',
    mandatory: false,
  },
  {
    id: 'EU_AI_ACT',
    name: 'EU Artificial Intelligence Act',
    shortName: 'EU AI Act',
    description: 'Comprehensive AI regulation with risk-based requirements',
    applicability: 'Organizations operating in or serving EU markets',
    regions: ['EU', 'EEA'],
    industries: ['All'],
    effectiveDate: '2026-08-02',
    mandatory: true,
  },
  {
    id: 'SR_26_2',
    name: 'SR 26-2 Interagency Guidance on AI',
    shortName: 'SR 26-2',
    description: 'US banking regulator guidance on AI risk management',
    applicability: 'US banks and financial institutions',
    regions: ['US'],
    industries: ['Banking', 'Financial Services'],
    effectiveDate: '2026-07-01',
    mandatory: true,
  },
  {
    id: 'SR_11_7',
    name: 'SR 11-7 Model Risk Management',
    shortName: 'SR 11-7',
    description: 'Federal Reserve guidance on model risk management',
    applicability: 'US banks using models for decision-making',
    regions: ['US'],
    industries: ['Banking', 'Financial Services'],
    effectiveDate: '2011-04-04',
    mandatory: true,
  },
  {
    id: 'ISO_42001',
    name: 'ISO/IEC 42001 AI Management System',
    shortName: 'ISO 42001',
    description: 'International standard for AI management systems',
    applicability: 'Organizations seeking AI certification',
    regions: ['Global'],
    industries: ['All'],
    effectiveDate: '2023-12-01',
    mandatory: false,
  },
  {
    id: 'CRI_FS_AI_RMF',
    name: 'CRI Financial Services AI Risk Management Framework',
    shortName: 'CRI FS AI RMF',
    description: 'Industry-developed framework for AI risk management in financial services',
    applicability: 'US financial institutions seeking comprehensive AI risk guidance',
    regions: ['US'],
    industries: ['Banking', 'Financial Services', 'Insurance', 'Asset Management'],
    effectiveDate: '2024-01-01',
    mandatory: false,
  },
  {
    id: 'OSFI_E23',
    name: 'OSFI Guideline E-23: Enterprise-Wide Model Risk Management',
    shortName: 'OSFI E-23',
    description: 'Canadian banking regulator guidance on model risk management including AI/ML',
    applicability: 'Federally regulated financial institutions in Canada',
    regions: ['Canada'],
    industries: ['Banking', 'Insurance', 'Trust Companies'],
    effectiveDate: '2024-09-01',
    mandatory: true,
  },
  {
    id: 'NAIC_AI_BULLETIN',
    name: 'NAIC Model Bulletin on Use of AI Systems by Insurers',
    shortName: 'NAIC AI Bulletin',
    description: 'Guidance for insurers on responsible AI use in underwriting and claims',
    applicability: 'Insurance companies operating in adopting US states',
    regions: ['US'],
    industries: ['Insurance'],
    effectiveDate: '2023-12-01',
    mandatory: false,
  },
  {
    id: 'MAS_FEAT',
    name: 'MAS FEAT: Fairness, Ethics, Accountability, Transparency',
    shortName: 'MAS FEAT',
    description: 'Singapore MAS principles for responsible AI/ML in financial services',
    applicability: 'Financial institutions regulated by MAS',
    regions: ['Singapore'],
    industries: ['Banking', 'Insurance', 'Capital Markets', 'Payments'],
    effectiveDate: '2022-05-01',
    mandatory: false,
  },
  {
    id: 'SG_AI_FRAMEWORK',
    name: 'Singapore Model AI Governance Framework',
    shortName: 'SG AI Framework',
    description: 'National AI governance framework for responsible AI deployment',
    applicability: 'Organizations deploying AI in Singapore',
    regions: ['Singapore'],
    industries: ['All'],
    effectiveDate: '2020-01-01',
    mandatory: false,
  },
  {
    id: 'APRA_CPG235',
    name: 'APRA CPG 235: Managing Data and Information Risk',
    shortName: 'APRA CPG 235',
    description: 'Australian prudential guidance on data risk including AI/ML models',
    applicability: 'APRA-regulated entities in Australia',
    regions: ['Australia'],
    industries: ['Banking', 'Insurance', 'Superannuation'],
    effectiveDate: '2023-07-01',
    mandatory: true,
  },
];

// ─── Stakeholder Views ─────────────────────────────────────────────────────

export type StakeholderRole = 'board' | 'risk' | 'tech' | 'legal' | 'audit';

export interface StakeholderView {
  role: StakeholderRole;
  name: string;
  description: string;
  focusAreas: string[];
  domainPriorities: Record<string, number>;
  reportingCadence: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  keyQuestions: string[];
}

export const STAKEHOLDER_VIEWS: StakeholderView[] = [
  {
    role: 'board',
    name: 'Board / Executive',
    description: 'Strategic oversight focused on enterprise risk, regulatory exposure, and business alignment',
    focusAreas: [
      'Overall AI risk posture',
      'Regulatory compliance status',
      'Strategic AI investments and ROI',
      'Reputational risk from AI',
      'Competitive positioning',
    ],
    domainPriorities: {
      'risk-management': 5,
      'compliance-audit': 5,
      'incident-management': 4,
      'fairness-bias': 4,
      'human-oversight': 4,
      'agentic-autonomy': 3,
      'inventory-registry': 3,
      'model-governance': 3,
      'transparency-explainability': 3,
      'security-safety': 4,
      'data-governance': 3,
      'multi-agent-governance': 2,
      'shadow-ai': 3,
      'finops-cost': 2,
    },
    reportingCadence: 'quarterly',
    keyQuestions: [
      'What is our overall AI governance maturity?',
      'What regulatory gaps create the highest exposure?',
      'Are we prepared for upcoming regulations (EU AI Act)?',
      'What AI incidents have occurred and what is the trend?',
    ],
  },
  {
    role: 'risk',
    name: 'Risk / Compliance',
    description: 'Control effectiveness, gap remediation, and regulatory alignment',
    focusAreas: [
      'Control testing results',
      'Gap analysis and remediation',
      'Regulatory change impact',
      'Risk treatment status',
      'Policy compliance',
    ],
    domainPriorities: {
      'risk-management': 5,
      'compliance-audit': 5,
      'fairness-bias': 5,
      'human-oversight': 4,
      'incident-management': 5,
      'model-governance': 4,
      'agentic-autonomy': 4,
      'inventory-registry': 4,
      'transparency-explainability': 4,
      'security-safety': 4,
      'data-governance': 4,
      'multi-agent-governance': 3,
      'shadow-ai': 4,
      'finops-cost': 2,
    },
    reportingCadence: 'monthly',
    keyQuestions: [
      'What gaps exist against each applicable framework?',
      'Which controls are failing or inadequate?',
      'What is the remediation status and timeline?',
      'Are third-party AI vendors properly assessed?',
    ],
  },
  {
    role: 'tech',
    name: 'Tech / Engineering',
    description: 'Implementation maturity, tooling capabilities, and automation',
    focusAreas: [
      'Technical implementation status',
      'Tooling and automation gaps',
      'Architecture compliance',
      'Performance and reliability',
      'Technical debt',
    ],
    domainPriorities: {
      'model-governance': 5,
      'security-safety': 5,
      'data-governance': 4,
      'multi-agent-governance': 5,
      'agentic-autonomy': 5,
      'human-oversight': 4,
      'inventory-registry': 4,
      'transparency-explainability': 4,
      'incident-management': 4,
      'shadow-ai': 4,
      'risk-management': 3,
      'compliance-audit': 3,
      'fairness-bias': 4,
      'finops-cost': 4,
    },
    reportingCadence: 'weekly',
    keyQuestions: [
      'What governance tooling is implemented vs needed?',
      'How automated are our governance controls?',
      'What technical debt affects governance posture?',
      'Are guardrails and safety controls in place?',
    ],
  },
  {
    role: 'legal',
    name: 'Legal',
    description: 'Regulatory mapping, liability exposure, and contractual requirements',
    focusAreas: [
      'Regulatory applicability',
      'Liability and indemnification',
      'Contract AI clauses',
      'IP and data rights',
      'Disclosure requirements',
    ],
    domainPriorities: {
      'compliance-audit': 5,
      'transparency-explainability': 5,
      'fairness-bias': 5,
      'human-oversight': 4,
      'incident-management': 5,
      'data-governance': 4,
      'risk-management': 4,
      'inventory-registry': 3,
      'model-governance': 3,
      'security-safety': 3,
      'agentic-autonomy': 3,
      'multi-agent-governance': 2,
      'shadow-ai': 3,
      'finops-cost': 1,
    },
    reportingCadence: 'monthly',
    keyQuestions: [
      'Which regulations apply to our AI systems?',
      'What disclosure obligations do we have?',
      'Are liability risks properly allocated in contracts?',
      'What is our exposure for AI-related litigation?',
    ],
  },
  {
    role: 'audit',
    name: 'Audit',
    description: 'Evidence collection, control testing, and attestation readiness',
    focusAreas: [
      'Evidence availability',
      'Control testing coverage',
      'Attestation readiness',
      'Finding remediation',
      'Audit trail completeness',
    ],
    domainPriorities: {
      'compliance-audit': 5,
      'inventory-registry': 5,
      'model-governance': 5,
      'human-oversight': 4,
      'incident-management': 4,
      'risk-management': 4,
      'data-governance': 4,
      'security-safety': 4,
      'transparency-explainability': 4,
      'fairness-bias': 4,
      'agentic-autonomy': 3,
      'multi-agent-governance': 3,
      'shadow-ai': 4,
      'finops-cost': 2,
    },
    reportingCadence: 'quarterly',
    keyQuestions: [
      'Is evidence sufficient to demonstrate compliance?',
      'What controls have been tested and what are the results?',
      'Are audit trails complete and tamper-evident?',
      'What findings remain open from prior audits?',
    ],
  },
];

// ─── Question Types ────────────────────────────────────────────────────────

export type QuestionCategory = 'maturity' | 'compliance' | 'capability' | 'evidence';

export interface AssessmentQuestion {
  id: string;
  text: string;
  category: QuestionCategory;
  type: 'scale' | 'boolean' | 'multi-select' | 'single-select';
  options?: string[];
  maturityMapping?: Record<MaturityLevel, string>;
  regulatoryRef?: string;
  frameworks?: FrameworkId[];
  weight: number;
  helpText?: string;
  evidenceHint?: string;
  stakeholderRelevance?: StakeholderRole[];
  planModuleLink?: 'organization-design' | 'operating-model' | 'use-cases' | 'business-cases';
}

export interface RegulatoryMapping {
  framework: FrameworkId;
  requirement: string;
  section: string;
}

export interface GovernanceDomain {
  id: string;
  name: string;
  description: string;
  avaModule: string;
  regulatoryMappings: RegulatoryMapping[];
  questions: AssessmentQuestion[];
  weight: number;
}

// ─── Assessment Response Types ─────────────────────────────────────────────

export interface AssessmentResponse {
  questionId: string;
  value: number | boolean | string[];
  notes?: string;
  evidence?: string[];
  assessedAt: string;
  assessedBy: string;
}

export interface DomainAssessment {
  domainId: string;
  responses: AssessmentResponse[];
  maturityScore: MaturityLevel;
  complianceScore: number;
  gaps: Gap[];
}

export interface Gap {
  id: string;
  domainId: string;
  questionId: string;
  currentState: string;
  targetState: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  remediation: string;
  effort: 'low' | 'medium' | 'high';
  timeline: string;
  regulatoryRisk?: string;
  frameworks?: FrameworkId[];
}

export interface AssessmentResult {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  assessor: string;
  organization: string;
  domainAssessments: DomainAssessment[];
  overallMaturity: number;
  overallCompliance: number;
  totalGaps: number;
  criticalGaps: number;
  recommendations: Recommendation[];
  planContext?: PlanModuleContext;
  /**
   * The scope the assessment was actually run under.
   *
   * Persisted WITH the result because the results view needs it after a reload, and the
   * only other source is wizard state seeded from the draft - which handleComplete deletes
   * on the way to the results view. Without this, a rehydrated results view fell back to
   * an empty selection and listed every framework any assessed domain maps to, then the
   * auto-populate pass overwrote it with NIST_AI_RMF / ISO_42001 (which
   * getApplicableFrameworks always seeds), so the "Assessment Scope" banner named
   * frameworks the user never chose. Optional for backward compatibility with results
   * stored before this field existed.
   */
  assessmentScope?: {
    selectedFrameworks: FrameworkId[];
    operatingRegions: OperatingRegion[];
  };
}

export interface Recommendation {
  id: string;
  priority: number;
  title: string;
  description: string;
  domains: string[];
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  timeline: string;
  regulatoryBenefit?: string[];
}

// ─── Plan Module Integration ───────────────────────────────────────────────

export interface PlanModuleContext {
  organizationDesignId?: string;
  organizationProfile?: {
    companyName: string;
    companySize: number;
    industry: string;
    regions: string[];
  };
  operatingModel?: {
    id: string;
    pattern: string;
    maturityLevel: number;
  };
  useCases?: {
    total: number;
    byRiskTier: Record<string, number>;
    inProduction: number;
  };
  businessCases?: {
    total: number;
    approved: number;
    totalInvestment: number;
  };
}

export function getApplicableFrameworks(context: PlanModuleContext): FrameworkId[] {
  const frameworks: FrameworkId[] = ['NIST_AI_RMF', 'ISO_42001'];
  const regions = context.organizationProfile?.regions || [];
  const industry = context.organizationProfile?.industry || '';

  if (regions.some(r => ['EU', 'EEA', 'UK', 'Germany', 'France', 'Italy', 'Spain'].includes(r))) {
    frameworks.push('EU_AI_ACT');
  }
  if (regions.includes('US')) {
    if (['Banking', 'Financial Services', 'Insurance'].includes(industry)) {
      frameworks.push('SR_26_2', 'SR_11_7', 'CRI_FS_AI_RMF');
    }
    if (industry === 'Insurance') {
      frameworks.push('NAIC_AI_BULLETIN');
    }
  }
  if (regions.includes('Canada') && ['Banking', 'Insurance'].includes(industry)) {
    frameworks.push('OSFI_E23');
  }
  if (regions.includes('Singapore')) {
    frameworks.push('SG_AI_FRAMEWORK');
    if (['Banking', 'Financial Services', 'Insurance'].includes(industry)) {
      frameworks.push('MAS_FEAT');
    }
  }
  if (regions.includes('Australia') && ['Banking', 'Insurance'].includes(industry)) {
    frameworks.push('APRA_CPG235');
  }

  return Array.from(new Set(frameworks));
}

// ─── Governance Domains ────────────────────────────────────────────────────

export const GOVERNANCE_DOMAINS: GovernanceDomain[] = [
  // ═══ Domain 1: AI Inventory & Registry ═══
  {
    id: 'inventory-registry',
    name: 'AI Inventory & Registry',
    description: 'Maintaining a complete inventory of AI systems, models, and agents across the organization',
    avaModule: 'Fleet / Agent Registry',
    weight: 10,
    regulatoryMappings: [
      { framework: 'EU_AI_ACT', requirement: 'Registration of high-risk AI systems', section: 'Article 51' },
      { framework: 'NIST_AI_RMF', requirement: 'MAP 1.1 - Intended purpose documented', section: 'Map' },
      { framework: 'SR_26_2', requirement: 'Maintain inventory of AI activities', section: '4.1' },
      { framework: 'OSFI_E23', requirement: 'Model inventory with risk tiering', section: '3.1' },
      { framework: 'CRI_FS_AI_RMF', requirement: 'AI inventory and classification', section: '2.1' },
    ],
    questions: [
      {
        id: 'inv-1',
        text: 'Do you maintain a centralized inventory of all AI/ML systems?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['NIST_AI_RMF', 'EU_AI_ACT', 'SR_26_2', 'ISO_42001', 'OSFI_E23'],
        stakeholderRelevance: ['board', 'risk', 'audit'],
        helpText: 'A centralized inventory enables visibility and governance across all AI assets',
        planModuleLink: 'organization-design',
        maturityMapping: {
          1: 'No formal inventory exists',
          2: 'Partial inventory in spreadsheets',
          3: 'Centralized registry with basic metadata',
          4: 'Automated discovery and classification',
          5: 'Real-time inventory with lineage tracking',
        },
      },
      {
        id: 'inv-2',
        text: 'Are AI systems classified by risk level (Unacceptable/High/Limited/Minimal)?',
        category: 'compliance',
        type: 'boolean',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'OSFI_E23'],
        regulatoryRef: 'EU AI Act Article 6',
        stakeholderRelevance: ['risk', 'legal', 'audit'],
        helpText: 'Risk classification determines applicable regulatory requirements',
      },
      {
        id: 'inv-3',
        text: 'Is there ownership and accountability assigned for each AI system?',
        category: 'maturity',
        type: 'scale',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'SR_26_2', 'SR_11_7', 'ISO_42001'],
        stakeholderRelevance: ['board', 'risk', 'audit'],
        planModuleLink: 'operating-model',
        maturityMapping: {
          1: 'No ownership defined',
          2: 'Informal ownership',
          3: 'Documented owners for most systems',
          4: 'RACI matrix with clear escalation',
          5: 'Automated ownership with succession planning',
        },
      },
      {
        id: 'inv-4',
        text: 'Are AI system purposes and intended uses documented?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'ISO_42001'],
        regulatoryRef: 'EU AI Act Article 13',
        stakeholderRelevance: ['legal', 'audit'],
      },
      {
        id: 'inv-5',
        text: 'What metadata is captured for each AI system?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'EU_AI_ACT', 'ISO_42001'],
        stakeholderRelevance: ['tech', 'audit'],
        options: [
          'System name and description',
          'Owner and stakeholders',
          'Risk classification',
          'Deployment status',
          'Data sources used',
          'Model versions',
          'Regulatory applicability',
          'Last review date',
        ],
      },
      {
        id: 'inv-6',
        text: 'How frequently is the AI inventory reviewed and updated?',
        category: 'maturity',
        type: 'single-select',
        weight: 2,
        frameworks: ['SR_26_2', 'OSFI_E23', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['risk', 'audit'],
        options: [
          'Never / ad-hoc',
          'Annually',
          'Quarterly',
          'Monthly',
          'Continuously / real-time',
        ],
      },
      {
        id: 'inv-7',
        text: 'Is there a process to register new AI systems before deployment?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'OSFI_E23'],
        regulatoryRef: 'EU AI Act Article 51',
        stakeholderRelevance: ['risk', 'tech'],
        planModuleLink: 'use-cases',
      },
      {
        id: 'inv-8',
        text: 'What documentation exists for the AI inventory process?',
        category: 'evidence',
        type: 'multi-select',
        weight: 2,
        frameworks: ['ISO_42001', 'SR_26_2', 'OSFI_E23'],
        stakeholderRelevance: ['audit'],
        evidenceHint: 'Request inventory policy, registration forms, and audit reports',
        options: [
          'AI inventory policy',
          'Registration procedures',
          'Classification criteria',
          'Ownership assignment process',
          'Review and update procedures',
          'Inventory audit reports',
        ],
      },
    ],
  },

  // ═══ Domain 2: Model Risk Management ═══
  {
    id: 'model-governance',
    name: 'Model Risk Management',
    description: 'Governance of ML model lifecycle including validation, monitoring, and documentation',
    avaModule: 'Models',
    weight: 15,
    regulatoryMappings: [
      { framework: 'SR_11_7', requirement: 'Model validation and ongoing monitoring', section: 'III' },
      { framework: 'NIST_AI_RMF', requirement: 'MEASURE 2.1 - Test AI system performance', section: 'Measure' },
      { framework: 'EU_AI_ACT', requirement: 'Technical documentation requirements', section: 'Article 11' },
      { framework: 'OSFI_E23', requirement: 'Independent model validation', section: '4.2' },
      { framework: 'CRI_FS_AI_RMF', requirement: 'Model risk management integration', section: '3.1' },
    ],
    questions: [
      {
        id: 'mdl-1',
        text: 'Do you have a formal model validation process?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['SR_11_7', 'NIST_AI_RMF', 'ISO_42001', 'OSFI_E23'],
        stakeholderRelevance: ['risk', 'tech', 'audit'],
        maturityMapping: {
          1: 'No validation process',
          2: 'Ad-hoc validation by developers',
          3: 'Independent validation team',
          4: 'Risk-tiered validation with challenger models',
          5: 'Continuous validation with automated testing',
        },
      },
      {
        id: 'mdl-2',
        text: 'Is model performance monitored in production?',
        category: 'capability',
        type: 'scale',
        weight: 3,
        frameworks: ['SR_11_7', 'NIST_AI_RMF', 'EU_AI_ACT', 'OSFI_E23'],
        stakeholderRelevance: ['tech', 'risk'],
        maturityMapping: {
          1: 'No monitoring',
          2: 'Manual periodic checks',
          3: 'Automated metrics collection',
          4: 'Drift detection with alerts',
          5: 'Predictive monitoring with auto-remediation',
        },
      },
      {
        id: 'mdl-3',
        text: 'Are model limitations and assumptions documented?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['SR_11_7', 'EU_AI_ACT', 'OSFI_E23'],
        regulatoryRef: 'SR 11-7 Section III.B',
        stakeholderRelevance: ['risk', 'legal', 'audit'],
      },
      {
        id: 'mdl-4',
        text: 'Is there a model change management process?',
        category: 'maturity',
        type: 'scale',
        weight: 2,
        frameworks: ['SR_11_7', 'OSFI_E23', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['tech', 'risk'],
        maturityMapping: {
          1: 'No change management',
          2: 'Informal change tracking',
          3: 'Documented change procedures',
          4: 'Automated change detection with approval workflows',
          5: 'Continuous deployment with automated validation gates',
        },
      },
      {
        id: 'mdl-5',
        text: 'Are foundation model providers assessed and monitored?',
        category: 'maturity',
        type: 'scale',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['risk', 'legal'],
        helpText: 'Assess providers like OpenAI, Anthropic, AWS Bedrock for risk',
        maturityMapping: {
          1: 'No provider assessment',
          2: 'Initial due diligence only',
          3: 'Annual provider reviews',
          4: 'Continuous provider monitoring',
          5: 'Real-time provider risk intelligence',
        },
      },
      {
        id: 'mdl-6',
        text: 'What model governance capabilities are implemented?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['SR_11_7', 'NIST_AI_RMF', 'OSFI_E23'],
        stakeholderRelevance: ['tech'],
        options: [
          'Model versioning',
          'Model lineage tracking',
          'Automated testing pipelines',
          'A/B testing framework',
          'Shadow deployment',
          'Canary releases',
          'Rollback automation',
          'Model cards / documentation',
        ],
      },
      {
        id: 'mdl-7',
        text: 'Is there a process for model retirement/sunset?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['SR_11_7', 'OSFI_E23'],
        stakeholderRelevance: ['risk', 'tech'],
      },
      {
        id: 'mdl-8',
        text: 'What model governance documentation exists?',
        category: 'evidence',
        type: 'multi-select',
        weight: 2,
        frameworks: ['SR_11_7', 'EU_AI_ACT', 'ISO_42001', 'OSFI_E23'],
        stakeholderRelevance: ['audit'],
        evidenceHint: 'Request model risk policy, validation reports, and model cards',
        options: [
          'Model risk management policy',
          'Validation methodology',
          'Model inventory/registry',
          'Model cards for each system',
          'Performance monitoring reports',
          'Change management logs',
          'Retirement procedures',
        ],
      },
    ],
  },

  // ═══ Domain 3: AI Risk Management ═══
  {
    id: 'risk-management',
    name: 'AI Risk Management',
    description: 'Identifying, assessing, and mitigating risks associated with AI systems',
    avaModule: 'Risk Management',
    weight: 15,
    regulatoryMappings: [
      { framework: 'NIST_AI_RMF', requirement: 'GOVERN 1.1 - Legal and regulatory requirements identified', section: 'Govern' },
      { framework: 'EU_AI_ACT', requirement: 'Risk management system for high-risk AI', section: 'Article 9' },
      { framework: 'SR_26_2', requirement: 'Risk assessment and controls', section: '5' },
      { framework: 'CRI_FS_AI_RMF', requirement: 'AI risk assessment framework', section: '4.1' },
      { framework: 'MAS_FEAT', requirement: 'Risk management for AI systems', section: 'Section 3' },
    ],
    questions: [
      {
        id: 'rsk-1',
        text: 'Do you have a formal AI risk assessment framework?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['NIST_AI_RMF', 'EU_AI_ACT', 'SR_26_2', 'ISO_42001', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['board', 'risk'],
        maturityMapping: {
          1: 'No formal framework',
          2: 'Basic risk categories defined',
          3: 'Standardized risk scoring methodology',
          4: 'Quantitative risk assessment with controls mapping',
          5: 'Dynamic risk assessment with real-time signals',
        },
      },
      {
        id: 'rsk-2',
        text: 'Are third-party AI vendors assessed for risk?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['SR_26_2', 'NIST_AI_RMF', 'EU_AI_ACT', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['risk', 'legal'],
        maturityMapping: {
          1: 'No vendor assessment',
          2: 'Basic due diligence',
          3: 'Formal TPRM process for AI vendors',
          4: 'Continuous monitoring of vendor risk',
          5: 'Real-time intelligence with automated alerts',
        },
      },
      {
        id: 'rsk-3',
        text: 'Is there a process for AI incident response?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'SR_26_2', 'EU_AI_ACT'],
        regulatoryRef: 'NIST AI RMF MANAGE 4.1',
        stakeholderRelevance: ['risk', 'tech'],
      },
      {
        id: 'rsk-4',
        text: 'Are AI risks integrated into enterprise risk management?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['NIST_AI_RMF', 'SR_26_2', 'ISO_42001', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['board', 'risk'],
        planModuleLink: 'operating-model',
        maturityMapping: {
          1: 'AI risks managed separately',
          2: 'Informal linkage to ERM',
          3: 'AI risks in ERM taxonomy',
          4: 'Integrated risk reporting',
          5: 'Unified risk management with AI-specific controls',
        },
      },
      {
        id: 'rsk-5',
        text: 'What AI risk categories are assessed?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'EU_AI_ACT', 'SR_26_2', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['risk'],
        options: [
          'Model risk (accuracy, drift)',
          'Data risk (quality, bias)',
          'Operational risk (availability)',
          'Compliance/regulatory risk',
          'Reputational risk',
          'Security/adversarial risk',
          'Third-party/vendor risk',
          'Strategic/competitive risk',
        ],
      },
      {
        id: 'rsk-6',
        text: 'Is there board-level oversight of AI risk?',
        category: 'compliance',
        type: 'boolean',
        weight: 3,
        frameworks: ['SR_26_2', 'CRI_FS_AI_RMF', 'OSFI_E23'],
        regulatoryRef: 'SR 26-2 Section 3.1',
        stakeholderRelevance: ['board', 'risk'],
        planModuleLink: 'organization-design',
      },
      {
        id: 'rsk-7',
        text: 'How frequently are AI risk assessments performed?',
        category: 'maturity',
        type: 'single-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'OSFI_E23'],
        stakeholderRelevance: ['risk', 'audit'],
        options: [
          'Never / not performed',
          'Ad-hoc / when issues arise',
          'Annually',
          'Quarterly or at major changes',
          'Continuously with trigger-based reviews',
        ],
      },
      {
        id: 'rsk-8',
        text: 'What risk management documentation exists?',
        category: 'evidence',
        type: 'multi-select',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'EU_AI_ACT', 'ISO_42001', 'SR_26_2'],
        stakeholderRelevance: ['audit'],
        evidenceHint: 'Request risk policy, assessment templates, and risk register',
        options: [
          'AI risk management policy',
          'Risk assessment methodology',
          'Risk appetite statement for AI',
          'AI risk register',
          'Risk treatment plans',
          'Board risk reports',
          'Third-party risk assessments',
        ],
      },
    ],
  },

  // ═══ Domain 4: Human Oversight & Control ═══
  {
    id: 'human-oversight',
    name: 'Human Oversight & Control',
    description: 'Ensuring appropriate human involvement, escalation paths, and override capabilities',
    avaModule: 'Safety / Human Oversight',
    weight: 12,
    regulatoryMappings: [
      { framework: 'EU_AI_ACT', requirement: 'Human oversight measures', section: 'Article 14' },
      { framework: 'NIST_AI_RMF', requirement: 'GOVERN 3.2 - Policies define human oversight', section: 'Govern' },
      { framework: 'SR_26_2', requirement: 'Human review for consequential decisions', section: '6.1' },
      { framework: 'SG_AI_FRAMEWORK', requirement: 'Human-centric decision augmentation', section: '2.1' },
      { framework: 'OSFI_E23', requirement: 'Human judgment integration', section: '4.3' },
    ],
    questions: [
      {
        id: 'ho-1',
        text: 'What is the maturity of human-in-the-loop (HITL) processes?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'SR_26_2', 'SG_AI_FRAMEWORK'],
        stakeholderRelevance: ['board', 'risk', 'tech'],
        helpText: 'Assess how systematically humans review AI outputs before action',
        maturityMapping: {
          1: 'No human review of AI decisions',
          2: 'Ad-hoc human review for some decisions',
          3: 'Defined HITL for high-risk decisions',
          4: 'Risk-tiered HITL with documented criteria',
          5: 'Adaptive HITL with continuous optimization',
        },
      },
      {
        id: 'ho-2',
        text: 'Is there an escalation framework for AI decisions requiring human judgment?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'OSFI_E23'],
        stakeholderRelevance: ['risk', 'tech', 'audit'],
        maturityMapping: {
          1: 'No escalation framework exists',
          2: 'Informal escalation to supervisors',
          3: 'Documented escalation tiers with SLAs',
          4: 'Automated routing with expertise matching',
          5: 'Predictive escalation with preemptive alerts',
        },
      },
      {
        id: 'ho-3',
        text: 'Can authorized humans override AI system outputs?',
        category: 'compliance',
        type: 'boolean',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF'],
        regulatoryRef: 'EU AI Act Article 14(4)(d)',
        stakeholderRelevance: ['legal', 'risk'],
      },
      {
        id: 'ho-4',
        text: 'Are human oversight requirements documented per AI system risk level?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'SR_26_2'],
        regulatoryRef: 'EU AI Act Article 14(1)',
        stakeholderRelevance: ['risk', 'audit', 'legal'],
      },
      {
        id: 'ho-5',
        text: 'Are personnel assigned to oversight trained on AI limitations?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'OSFI_E23'],
        regulatoryRef: 'EU AI Act Article 14(4)(a)',
        stakeholderRelevance: ['risk', 'tech'],
      },
      {
        id: 'ho-6',
        text: 'What human oversight capabilities are implemented?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'SR_26_2'],
        stakeholderRelevance: ['tech', 'risk'],
        options: [
          'Real-time decision review queues',
          'Batch review workflows',
          'Confidence-based routing',
          'Exception handling dashboards',
          'Override audit logging',
          'Decision explanation interfaces',
          'Feedback capture mechanisms',
        ],
      },
      {
        id: 'ho-7',
        text: 'What intervention speed is achievable for human operators?',
        category: 'capability',
        type: 'single-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF'],
        stakeholderRelevance: ['tech', 'risk'],
        options: [
          'No intervention capability',
          'Hours (batch review)',
          'Minutes (near real-time)',
          'Seconds (real-time queuing)',
          'Instantaneous (pre-action approval)',
        ],
      },
      {
        id: 'ho-8',
        text: 'What documentation exists for human oversight?',
        category: 'evidence',
        type: 'multi-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'ISO_42001', 'OSFI_E23'],
        stakeholderRelevance: ['audit', 'legal'],
        evidenceHint: 'Request oversight SOPs, training materials, and role definitions',
        options: [
          'Human oversight policy',
          'Role-based oversight requirements',
          'Escalation procedures',
          'Training curriculum for overseers',
          'Override request forms/workflows',
          'Oversight effectiveness metrics',
        ],
      },
    ],
  },

  // ═══ Domain 5: Agentic Autonomy Management ═══
  {
    id: 'agentic-autonomy',
    name: 'Agentic Autonomy Management',
    description: 'Managing autonomy levels, earned autonomy progression, and emergency controls',
    avaModule: 'Fleet / Autonomy Ladder',
    weight: 10,
    regulatoryMappings: [
      { framework: 'EU_AI_ACT', requirement: 'Control for autonomous systems', section: 'Article 14(4)' },
      { framework: 'NIST_AI_RMF', requirement: 'MANAGE 1.3 - Responses to risks deployed', section: 'Manage' },
      { framework: 'SR_26_2', requirement: 'Autonomous decision controls', section: '6.4' },
      { framework: 'SG_AI_FRAMEWORK', requirement: 'Graduated autonomy approach', section: '3.2' },
      { framework: 'MAS_FEAT', requirement: 'Accountability for autonomous decisions', section: 'A.2' },
    ],
    questions: [
      {
        id: 'aa-1',
        text: 'Are agent autonomy levels formally defined and enforced?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'SR_26_2', 'SG_AI_FRAMEWORK'],
        stakeholderRelevance: ['risk', 'tech'],
        maturityMapping: {
          1: 'No autonomy classification',
          2: 'Informal autonomy categories',
          3: 'Defined autonomy levels with criteria',
          4: 'Enforced autonomy limits with monitoring',
          5: 'Dynamic autonomy adjustment based on context',
        },
      },
      {
        id: 'aa-2',
        text: 'Is there a process for agents to earn higher autonomy?',
        category: 'maturity',
        type: 'scale',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'SG_AI_FRAMEWORK'],
        stakeholderRelevance: ['risk', 'tech'],
        helpText: 'Earned autonomy based on demonstrated reliability and safety',
        maturityMapping: {
          1: 'No earned autonomy concept',
          2: 'Ad-hoc autonomy changes',
          3: 'Documented graduation criteria',
          4: 'Automated performance-based progression',
          5: 'Continuous earned autonomy with real-time adjustment',
        },
      },
      {
        id: 'aa-3',
        text: 'Are emergency stop/kill switch controls in place?',
        category: 'compliance',
        type: 'boolean',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF'],
        regulatoryRef: 'EU AI Act Article 14',
        stakeholderRelevance: ['risk', 'tech', 'legal'],
      },
      {
        id: 'aa-4',
        text: 'What autonomy controls are implemented?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'SR_26_2'],
        stakeholderRelevance: ['tech'],
        options: [
          'Action scope limits',
          'Resource consumption limits',
          'Time-bounded operations',
          'Approval gates for high-impact actions',
          'Rollback capabilities',
          'Kill switch / emergency stop',
          'Geofencing / scope restrictions',
          'Rate limiting',
        ],
      },
      {
        id: 'aa-5',
        text: 'Can agent autonomy be reduced in response to incidents?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'SR_26_2'],
        stakeholderRelevance: ['risk', 'tech'],
      },
      {
        id: 'aa-6',
        text: 'Are autonomy decisions logged and auditable?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'ISO_42001'],
        stakeholderRelevance: ['audit'],
      },
      {
        id: 'aa-7',
        text: 'What is the maximum autonomy level allowed without human approval?',
        category: 'capability',
        type: 'single-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'SG_AI_FRAMEWORK'],
        stakeholderRelevance: ['risk', 'board'],
        options: [
          'No autonomous actions allowed',
          'Information retrieval only',
          'Recommendations requiring approval',
          'Low-risk actions autonomously',
          'All actions within defined scope',
        ],
      },
      {
        id: 'aa-8',
        text: 'What autonomy governance documentation exists?',
        category: 'evidence',
        type: 'multi-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'ISO_42001', 'NIST_AI_RMF'],
        stakeholderRelevance: ['audit'],
        options: [
          'Autonomy classification policy',
          'Earned autonomy criteria',
          'Emergency control procedures',
          'Autonomy change logs',
          'Incident-triggered demotions',
          'Kill switch testing records',
        ],
      },
    ],
  },

  // ═══ Domain 6: Multi-Agent Governance ═══
  {
    id: 'multi-agent-governance',
    name: 'Multi-Agent Governance',
    description: 'Governing agent-to-agent interactions, trust relationships, and orchestration',
    avaModule: 'Fleet / Multi-Agent',
    weight: 8,
    regulatoryMappings: [
      { framework: 'EU_AI_ACT', requirement: 'General-purpose AI model obligations', section: 'Article 53' },
      { framework: 'NIST_AI_RMF', requirement: 'MAP 3.4 - AI system dependencies mapped', section: 'Map' },
      { framework: 'SR_26_2', requirement: 'Third-party and interconnected AI risks', section: '5.3' },
      { framework: 'ISO_42001', requirement: 'AI system interactions', section: '7.4' },
      { framework: 'CRI_FS_AI_RMF', requirement: 'Agent orchestration controls', section: '3.5' },
    ],
    questions: [
      {
        id: 'mag-1',
        text: 'What is the maturity of agent-to-agent (A2A) trust management?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['NIST_AI_RMF', 'SR_26_2', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['tech', 'risk'],
        maturityMapping: {
          1: 'No A2A trust controls',
          2: 'Static trust configurations',
          3: 'Role-based agent permissions',
          4: 'Dynamic trust with attestation',
          5: 'Zero-trust A2A with continuous verification',
        },
      },
      {
        id: 'mag-2',
        text: 'Is there orchestration governance for multi-agent workflows?',
        category: 'maturity',
        type: 'scale',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'EU_AI_ACT', 'ISO_42001'],
        stakeholderRelevance: ['tech', 'risk'],
        maturityMapping: {
          1: 'No orchestration governance',
          2: 'Manual workflow definitions',
          3: 'Policy-controlled orchestration',
          4: 'Monitored orchestration with guardrails',
          5: 'Adaptive orchestration with anomaly detection',
        },
      },
      {
        id: 'mag-3',
        text: 'Are delegation controls defined between agents?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['SR_26_2', 'CRI_FS_AI_RMF', 'OSFI_E23'],
        stakeholderRelevance: ['risk', 'audit'],
      },
      {
        id: 'mag-4',
        text: 'Are all agent interactions logged for audit?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'OSFI_E23'],
        regulatoryRef: 'EU AI Act Article 12',
        stakeholderRelevance: ['audit', 'risk'],
      },
      {
        id: 'mag-5',
        text: 'What multi-agent governance capabilities exist?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['tech'],
        options: [
          'Agent identity management',
          'Capability-based access control',
          'Message signing/verification',
          'Delegation depth limits',
          'Cross-agent audit trails',
          'Orchestration visualization',
          'Inter-agent rate limiting',
          'Conflict resolution',
        ],
      },
      {
        id: 'mag-6',
        text: 'How are agent capabilities and permissions defined?',
        category: 'capability',
        type: 'single-select',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'ISO_42001'],
        stakeholderRelevance: ['tech', 'risk'],
        options: [
          'Not defined',
          'Static configuration files',
          'Centralized policy engine',
          'Attribute-based access control',
          'Zero-trust with continuous evaluation',
        ],
      },
      {
        id: 'mag-7',
        text: 'What multi-agent documentation exists?',
        category: 'evidence',
        type: 'multi-select',
        weight: 2,
        frameworks: ['ISO_42001', 'NIST_AI_RMF'],
        stakeholderRelevance: ['audit', 'legal'],
        options: [
          'Multi-agent architecture docs',
          'Trust relationship diagrams',
          'Delegation policy documents',
          'Agent capability matrices',
          'Interaction logging standards',
          'Incident procedures for agent failures',
        ],
      },
    ],
  },

  // ═══ Domain 7: Incident Management ═══
  {
    id: 'incident-management',
    name: 'AI Incident Management',
    description: 'Detection, response, reporting, and remediation of AI incidents',
    avaModule: 'Safety / Incidents',
    weight: 10,
    regulatoryMappings: [
      { framework: 'EU_AI_ACT', requirement: 'Serious incident reporting', section: 'Article 73' },
      { framework: 'NIST_AI_RMF', requirement: 'MANAGE 4.1 - Incident response plans', section: 'Manage' },
      { framework: 'SR_26_2', requirement: 'AI incident escalation and reporting', section: '7.2' },
      { framework: 'ISO_42001', requirement: 'AI incident management process', section: '10.2' },
      { framework: 'OSFI_E23', requirement: 'Model failure response', section: '5.4' },
    ],
    questions: [
      {
        id: 'im-1',
        text: 'What is the maturity of AI incident detection?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'ISO_42001', 'OSFI_E23'],
        stakeholderRelevance: ['tech', 'risk'],
        maturityMapping: {
          1: 'No AI-specific incident detection',
          2: 'Manual incident identification',
          3: 'Automated monitoring with alerts',
          4: 'Predictive detection with root cause analysis',
          5: 'AI-powered incident anticipation',
        },
      },
      {
        id: 'im-2',
        text: 'Is there an AI-specific incident response process?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'SR_26_2'],
        stakeholderRelevance: ['risk', 'tech', 'board'],
        maturityMapping: {
          1: 'No AI incident response process',
          2: 'General IT incident process used',
          3: 'AI-specific incident playbooks',
          4: 'Automated triage with expert escalation',
          5: 'Orchestrated response with auto-remediation',
        },
      },
      {
        id: 'im-3',
        text: 'Can you report serious AI incidents within required timeframes?',
        category: 'compliance',
        type: 'boolean',
        weight: 3,
        frameworks: ['EU_AI_ACT'],
        regulatoryRef: 'EU AI Act Article 73 (15-day reporting)',
        stakeholderRelevance: ['legal', 'risk', 'board'],
        helpText: 'EU AI Act requires reporting within 15 days (72 hours if safety-critical)',
      },
      {
        id: 'im-4',
        text: 'Are AI incident severity classifications defined?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'OSFI_E23'],
        stakeholderRelevance: ['legal', 'risk'],
      },
      {
        id: 'im-5',
        text: 'Is there a process for customer notification of AI incidents?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['SR_26_2', 'NAIC_AI_BULLETIN', 'MAS_FEAT'],
        stakeholderRelevance: ['legal', 'risk', 'board'],
      },
      {
        id: 'im-6',
        text: 'What incident management capabilities exist?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'EU_AI_ACT', 'ISO_42001'],
        stakeholderRelevance: ['tech', 'risk'],
        options: [
          'AI-specific incident classification',
          'Automated model rollback',
          'Guardrail activation on incident',
          'Customer impact assessment',
          'Regulatory notification workflows',
          'Evidence preservation automation',
          'Post-incident review process',
        ],
      },
      {
        id: 'im-7',
        text: 'What is target mean time to detect (MTTD) for AI incidents?',
        category: 'capability',
        type: 'single-select',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'SR_26_2'],
        stakeholderRelevance: ['tech', 'risk'],
        options: [
          'Not measured',
          '> 24 hours',
          '1-24 hours',
          '15-60 minutes',
          '< 15 minutes',
        ],
      },
      {
        id: 'im-8',
        text: 'What incident management documentation exists?',
        category: 'evidence',
        type: 'multi-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'ISO_42001', 'OSFI_E23'],
        stakeholderRelevance: ['audit', 'legal'],
        options: [
          'AI incident response plan',
          'Incident severity classification',
          'Escalation matrices',
          'Regulatory reporting procedures',
          'Post-incident review templates',
          'Lessons learned database',
          'Incident drill records',
        ],
      },
    ],
  },

  // ═══ Domain 8: Shadow AI Governance ═══
  {
    id: 'shadow-ai',
    name: 'Shadow AI Governance',
    description: 'Discovery, sanctioning, and monitoring of unauthorized AI usage',
    avaModule: 'Fleet / Shadow AI',
    weight: 8,
    regulatoryMappings: [
      { framework: 'NIST_AI_RMF', requirement: 'MAP 1.2 - AI actors identified', section: 'Map' },
      { framework: 'SR_26_2', requirement: 'Comprehensive AI inventory', section: '4.1' },
      { framework: 'EU_AI_ACT', requirement: 'Provider and deployer obligations', section: 'Article 26' },
      { framework: 'CRI_FS_AI_RMF', requirement: 'Shadow AI discovery', section: '2.3' },
      { framework: 'OSFI_E23', requirement: 'Complete model inventory', section: '3.1' },
    ],
    questions: [
      {
        id: 'sha-1',
        text: 'Can you detect unauthorized AI/ML tool usage?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['SR_26_2', 'CRI_FS_AI_RMF', 'OSFI_E23'],
        stakeholderRelevance: ['risk', 'tech'],
        maturityMapping: {
          1: 'No detection capability',
          2: 'Manual periodic reviews',
          3: 'Network/log-based detection',
          4: 'API-level monitoring with classification',
          5: 'Real-time discovery with auto-blocking',
        },
      },
      {
        id: 'sha-2',
        text: 'Is there a sanctioning process for discovered AI tools?',
        category: 'maturity',
        type: 'scale',
        weight: 2,
        frameworks: ['SR_26_2', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['risk', 'tech'],
        maturityMapping: {
          1: 'No sanctioning process',
          2: 'Ad-hoc approval/denial',
          3: 'Formal evaluation criteria',
          4: 'Risk-based sanctioning workflow',
          5: 'Automated risk assessment and fast-track',
        },
      },
      {
        id: 'sha-3',
        text: 'Are employees trained on acceptable AI use policies?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'SR_26_2'],
        stakeholderRelevance: ['risk', 'legal'],
      },
      {
        id: 'sha-4',
        text: 'Is there a process to onboard Shadow AI into governance?',
        category: 'capability',
        type: 'boolean',
        weight: 2,
        frameworks: ['SR_26_2', 'CRI_FS_AI_RMF', 'OSFI_E23'],
        stakeholderRelevance: ['risk', 'tech'],
        helpText: 'Bringing discovered AI into formal inventory and governance',
      },
      {
        id: 'sha-5',
        text: 'What Shadow AI detection methods are used?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['SR_26_2', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['tech'],
        options: [
          'Network traffic analysis',
          'Browser extension monitoring',
          'API call logging',
          'Endpoint DLP',
          'Cloud access security broker (CASB)',
          'Employee surveys',
          'Expense report analysis',
        ],
      },
      {
        id: 'sha-6',
        text: 'What documentation exists for Shadow AI governance?',
        category: 'evidence',
        type: 'multi-select',
        weight: 2,
        frameworks: ['SR_26_2', 'ISO_42001'],
        stakeholderRelevance: ['audit'],
        options: [
          'Acceptable AI use policy',
          'Shadow AI discovery procedures',
          'Sanctioning workflow documentation',
          'Employee training materials',
          'Discovery and remediation logs',
        ],
      },
    ],
  },

  // ═══ Domain 9: Fairness & Bias ═══
  {
    id: 'fairness-bias',
    name: 'Fairness & Bias Management',
    description: 'Detecting, measuring, and mitigating algorithmic bias and ensuring fairness',
    avaModule: 'Evals / Bias',
    weight: 12,
    regulatoryMappings: [
      { framework: 'EU_AI_ACT', requirement: 'Non-discrimination requirements', section: 'Article 10' },
      { framework: 'NIST_AI_RMF', requirement: 'MEASURE 2.11 - Fairness assessed', section: 'Measure' },
      { framework: 'SR_26_2', requirement: 'Fair lending and bias monitoring', section: '8.1' },
      { framework: 'NAIC_AI_BULLETIN', requirement: 'Unfair discrimination prevention', section: '4' },
      { framework: 'MAS_FEAT', requirement: 'Fairness principles', section: 'F' },
    ],
    questions: [
      {
        id: 'fb-1',
        text: 'Do you assess AI systems for bias before deployment?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'SR_26_2', 'NAIC_AI_BULLETIN'],
        stakeholderRelevance: ['risk', 'legal', 'board'],
        maturityMapping: {
          1: 'No bias assessment',
          2: 'Ad-hoc bias reviews',
          3: 'Standardized bias testing pre-deployment',
          4: 'Comprehensive fairness metrics with thresholds',
          5: 'Continuous bias monitoring with auto-mitigation',
        },
      },
      {
        id: 'fb-2',
        text: 'Are fairness metrics defined and monitored?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['NIST_AI_RMF', 'MAS_FEAT', 'NAIC_AI_BULLETIN'],
        stakeholderRelevance: ['risk', 'tech'],
        maturityMapping: {
          1: 'No fairness metrics',
          2: 'Basic accuracy parity checks',
          3: 'Multiple fairness metrics (demographic parity, equalized odds)',
          4: 'Context-appropriate metrics with thresholds',
          5: 'Adaptive metrics with stakeholder input',
        },
      },
      {
        id: 'fb-3',
        text: 'Is there a process for bias incident remediation?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'NAIC_AI_BULLETIN'],
        stakeholderRelevance: ['risk', 'legal'],
      },
      {
        id: 'fb-4',
        text: 'Are protected attributes identified and monitored?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'NAIC_AI_BULLETIN'],
        regulatoryRef: 'EU AI Act Article 10(2)(f)',
        stakeholderRelevance: ['legal', 'risk'],
      },
      {
        id: 'fb-5',
        text: 'What bias detection methods are used?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'MAS_FEAT'],
        stakeholderRelevance: ['tech'],
        options: [
          'Statistical parity analysis',
          'Disparate impact testing',
          'Fairness through awareness',
          'Counterfactual fairness',
          'Red teaming for bias',
          'Adversarial debiasing',
          'Bias audits by third parties',
        ],
      },
      {
        id: 'fb-6',
        text: 'Are bias assessments documented with remediation plans?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'ISO_42001'],
        stakeholderRelevance: ['audit', 'legal'],
      },
      {
        id: 'fb-7',
        text: 'What fairness documentation exists?',
        category: 'evidence',
        type: 'multi-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'ISO_42001', 'NIST_AI_RMF'],
        stakeholderRelevance: ['audit', 'legal'],
        options: [
          'Fairness policy',
          'Protected attribute definitions',
          'Bias testing methodology',
          'Bias assessment reports',
          'Remediation plans',
          'Third-party audit reports',
        ],
      },
    ],
  },

  // ═══ Domain 10: Transparency & Explainability ═══
  {
    id: 'transparency-explainability',
    name: 'Transparency & Explainability',
    description: 'Ensuring AI decisions can be explained and system operations are transparent',
    avaModule: 'Trail / Explainability',
    weight: 10,
    regulatoryMappings: [
      { framework: 'EU_AI_ACT', requirement: 'Transparency obligations', section: 'Article 13' },
      { framework: 'NIST_AI_RMF', requirement: 'GOVERN 4.1 - Organizational transparency', section: 'Govern' },
      { framework: 'SR_26_2', requirement: 'Explainability for customer decisions', section: '8.2' },
      { framework: 'MAS_FEAT', requirement: 'Transparency principles', section: 'T' },
      { framework: 'SG_AI_FRAMEWORK', requirement: 'Decision explainability', section: '2.2' },
    ],
    questions: [
      {
        id: 'te-1',
        text: 'Can you explain AI-driven decisions to affected individuals?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'SR_26_2', 'MAS_FEAT'],
        stakeholderRelevance: ['legal', 'risk', 'board'],
        maturityMapping: {
          1: 'No explanation capability',
          2: 'Generic explanations only',
          3: 'Rule-based explanation generation',
          4: 'Feature attribution with confidence levels',
          5: 'Personalized, context-aware explanations',
        },
      },
      {
        id: 'te-2',
        text: 'Are users notified when interacting with AI systems?',
        category: 'compliance',
        type: 'boolean',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'SG_AI_FRAMEWORK'],
        regulatoryRef: 'EU AI Act Article 52',
        stakeholderRelevance: ['legal', 'board'],
      },
      {
        id: 'te-3',
        text: 'Is AI decision logic documented and accessible?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'ISO_42001'],
        stakeholderRelevance: ['audit', 'legal'],
      },
      {
        id: 'te-4',
        text: 'What explainability methods are implemented?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'MAS_FEAT'],
        stakeholderRelevance: ['tech'],
        options: [
          'Feature importance (SHAP, LIME)',
          'Attention visualization',
          'Counterfactual explanations',
          'Rule extraction',
          'Natural language explanations',
          'Decision path visualization',
          'Confidence/uncertainty display',
        ],
      },
      {
        id: 'te-5',
        text: 'Are transparency reports published?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF'],
        stakeholderRelevance: ['legal', 'board'],
      },
      {
        id: 'te-6',
        text: 'What transparency documentation exists?',
        category: 'evidence',
        type: 'multi-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'ISO_42001', 'NIST_AI_RMF'],
        stakeholderRelevance: ['audit', 'legal'],
        options: [
          'Transparency policy',
          'AI disclosure notices',
          'Explainability methodology',
          'Decision documentation templates',
          'Public transparency reports',
          'Consumer-facing explanations',
        ],
      },
    ],
  },

  // ═══ Domain 11: Data Governance ═══
  {
    id: 'data-governance',
    name: 'AI Data Governance',
    description: 'Managing data quality, lineage, privacy, and consent for AI systems',
    avaModule: 'Data Governance',
    weight: 10,
    regulatoryMappings: [
      { framework: 'EU_AI_ACT', requirement: 'Data governance practices', section: 'Article 10' },
      { framework: 'NIST_AI_RMF', requirement: 'MAP 2.3 - Data characteristics documented', section: 'Map' },
      { framework: 'SR_26_2', requirement: 'Data quality for AI', section: '9.1' },
      { framework: 'APRA_CPG235', requirement: 'Data risk management', section: '3' },
      { framework: 'OSFI_E23', requirement: 'Data quality standards', section: '3.3' },
    ],
    questions: [
      {
        id: 'dg-1',
        text: 'What is the maturity of AI training data governance?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'SR_26_2', 'APRA_CPG235'],
        stakeholderRelevance: ['risk', 'tech'],
        maturityMapping: {
          1: 'No training data governance',
          2: 'Basic data quality checks',
          3: 'Documented data requirements per model',
          4: 'Data lineage with quality metrics',
          5: 'Continuous data monitoring with drift detection',
        },
      },
      {
        id: 'dg-2',
        text: 'Is data lineage tracked for AI training data?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'ISO_42001'],
        regulatoryRef: 'EU AI Act Article 10(2)',
        stakeholderRelevance: ['tech', 'audit'],
      },
      {
        id: 'dg-3',
        text: 'Are data privacy requirements enforced for AI systems?',
        category: 'compliance',
        type: 'boolean',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'APRA_CPG235'],
        stakeholderRelevance: ['legal', 'risk'],
      },
      {
        id: 'dg-4',
        text: 'Is consent managed for AI training data?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF'],
        stakeholderRelevance: ['legal'],
      },
      {
        id: 'dg-5',
        text: 'What data governance capabilities are implemented?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'EU_AI_ACT', 'APRA_CPG235'],
        stakeholderRelevance: ['tech'],
        options: [
          'Data cataloging',
          'Data lineage tracking',
          'Data quality scoring',
          'PII detection and masking',
          'Consent management',
          'Data retention policies',
          'Cross-border data controls',
        ],
      },
      {
        id: 'dg-6',
        text: 'What data governance documentation exists?',
        category: 'evidence',
        type: 'multi-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'ISO_42001', 'APRA_CPG235'],
        stakeholderRelevance: ['audit'],
        options: [
          'AI data governance policy',
          'Data quality standards',
          'Lineage documentation',
          'Privacy impact assessments',
          'Consent records',
          'Data retention schedules',
        ],
      },
    ],
  },

  // ═══ Domain 12: Security & Safety ═══
  {
    id: 'security-safety',
    name: 'AI Security & Safety',
    description: 'Protecting AI systems from adversarial attacks and ensuring safe operation',
    avaModule: 'Security',
    weight: 12,
    regulatoryMappings: [
      { framework: 'EU_AI_ACT', requirement: 'Accuracy, robustness, cybersecurity', section: 'Article 15' },
      { framework: 'NIST_AI_RMF', requirement: 'MEASURE 2.7 - Security tested', section: 'Measure' },
      { framework: 'SR_26_2', requirement: 'AI security controls', section: '10' },
      { framework: 'ISO_42001', requirement: 'AI security management', section: '8.3' },
      { framework: 'CRI_FS_AI_RMF', requirement: 'AI-specific security controls', section: '5.1' },
    ],
    questions: [
      {
        id: 'ss-1',
        text: 'What is the maturity of AI-specific security controls?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'SR_26_2', 'ISO_42001'],
        stakeholderRelevance: ['tech', 'risk'],
        maturityMapping: {
          1: 'No AI-specific security',
          2: 'General IT security applied',
          3: 'AI threat modeling performed',
          4: 'AI-specific controls implemented',
          5: 'Adaptive security with adversarial testing',
        },
      },
      {
        id: 'ss-2',
        text: 'Are AI systems tested for adversarial robustness?',
        category: 'compliance',
        type: 'boolean',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF'],
        regulatoryRef: 'EU AI Act Article 15(4)',
        stakeholderRelevance: ['tech', 'risk'],
      },
      {
        id: 'ss-3',
        text: 'Are guardrails implemented to prevent harmful outputs?',
        category: 'compliance',
        type: 'boolean',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'SR_26_2'],
        stakeholderRelevance: ['risk', 'legal'],
      },
      {
        id: 'ss-4',
        text: 'Is prompt injection protection in place for LLM systems?',
        category: 'capability',
        type: 'boolean',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['tech'],
      },
      {
        id: 'ss-5',
        text: 'What AI security capabilities are implemented?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'EU_AI_ACT', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['tech'],
        options: [
          'Input validation and sanitization',
          'Output filtering',
          'Model access controls',
          'Adversarial testing (red teaming)',
          'Model watermarking',
          'Prompt injection detection',
          'Rate limiting',
          'Anomaly detection',
        ],
      },
      {
        id: 'ss-6',
        text: 'What security documentation exists?',
        category: 'evidence',
        type: 'multi-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'ISO_42001', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['audit'],
        options: [
          'AI security policy',
          'Threat models',
          'Penetration test reports',
          'Red team findings',
          'Guardrail configurations',
          'Incident response for AI attacks',
        ],
      },
    ],
  },

  // ═══ Domain 13: Compliance & Audit ═══
  {
    id: 'compliance-audit',
    name: 'Compliance & Audit',
    description: 'Regulatory compliance management, audit trails, and attestation readiness',
    avaModule: 'Compliance',
    weight: 10,
    regulatoryMappings: [
      { framework: 'EU_AI_ACT', requirement: 'Record-keeping and logs', section: 'Article 12' },
      { framework: 'NIST_AI_RMF', requirement: 'GOVERN 1.2 - Compliance processes', section: 'Govern' },
      { framework: 'SR_26_2', requirement: 'Audit and examination readiness', section: '11' },
      { framework: 'ISO_42001', requirement: 'Internal audit', section: '9.2' },
      { framework: 'OSFI_E23', requirement: 'Audit and validation independence', section: '6' },
    ],
    questions: [
      {
        id: 'ca-1',
        text: 'What is the maturity of AI compliance management?',
        category: 'maturity',
        type: 'scale',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'SR_26_2', 'ISO_42001'],
        stakeholderRelevance: ['risk', 'audit', 'board'],
        maturityMapping: {
          1: 'No AI compliance program',
          2: 'Ad-hoc compliance activities',
          3: 'Formal compliance program',
          4: 'Integrated GRC with continuous monitoring',
          5: 'Predictive compliance with auto-remediation',
        },
      },
      {
        id: 'ca-2',
        text: 'Are audit trails maintained for AI system decisions?',
        category: 'compliance',
        type: 'boolean',
        weight: 3,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'OSFI_E23'],
        regulatoryRef: 'EU AI Act Article 12',
        stakeholderRelevance: ['audit', 'legal'],
      },
      {
        id: 'ca-3',
        text: 'Can you produce evidence for regulatory examinations?',
        category: 'compliance',
        type: 'boolean',
        weight: 3,
        frameworks: ['SR_26_2', 'OSFI_E23', 'EU_AI_ACT'],
        stakeholderRelevance: ['audit', 'legal', 'board'],
      },
      {
        id: 'ca-4',
        text: 'Is there a process for tracking regulatory changes?',
        category: 'maturity',
        type: 'scale',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'ISO_42001'],
        stakeholderRelevance: ['legal', 'risk'],
        maturityMapping: {
          1: 'No regulatory tracking',
          2: 'Ad-hoc monitoring',
          3: 'Subscription to regulatory updates',
          4: 'Automated change detection with impact analysis',
          5: 'Predictive regulatory intelligence',
        },
      },
      {
        id: 'ca-5',
        text: 'What compliance capabilities are implemented?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'SR_26_2', 'ISO_42001'],
        stakeholderRelevance: ['audit', 'risk'],
        options: [
          'Compliance dashboard',
          'Evidence repository',
          'Control testing automation',
          'Gap analysis tools',
          'Regulatory change tracking',
          'Audit scheduling and tracking',
          'Finding remediation workflow',
        ],
      },
      {
        id: 'ca-6',
        text: 'What compliance documentation exists?',
        category: 'evidence',
        type: 'multi-select',
        weight: 2,
        frameworks: ['EU_AI_ACT', 'ISO_42001', 'SR_26_2'],
        stakeholderRelevance: ['audit'],
        options: [
          'Compliance policy',
          'Regulatory mapping matrix',
          'Control framework',
          'Evidence catalog',
          'Audit reports',
          'Remediation tracking',
          'Management attestations',
        ],
      },
    ],
  },

  // ═══ Domain 14: FinOps & Cost Governance ═══
  {
    id: 'finops-cost',
    name: 'AI FinOps & Cost Governance',
    description: 'Managing AI costs, budgets, chargebacks, and financial accountability',
    avaModule: 'FinOps',
    weight: 5,
    regulatoryMappings: [
      { framework: 'NIST_AI_RMF', requirement: 'GOVERN 2.1 - Roles and responsibilities', section: 'Govern' },
      { framework: 'ISO_42001', requirement: 'Resource management', section: '7.1' },
      { framework: 'CRI_FS_AI_RMF', requirement: 'AI cost management', section: '6.1' },
    ],
    questions: [
      {
        id: 'fc-1',
        text: 'What is the maturity of AI cost visibility?',
        category: 'maturity',
        type: 'scale',
        weight: 2,
        frameworks: ['CRI_FS_AI_RMF', 'ISO_42001'],
        stakeholderRelevance: ['board', 'tech'],
        planModuleLink: 'business-cases',
        maturityMapping: {
          1: 'No AI cost tracking',
          2: 'Aggregate AI spend known',
          3: 'Cost by model/service tracked',
          4: 'Full allocation to teams/use cases',
          5: 'Predictive cost management with optimization',
        },
      },
      {
        id: 'fc-2',
        text: 'Are AI budgets defined and monitored?',
        category: 'compliance',
        type: 'boolean',
        weight: 2,
        frameworks: ['NIST_AI_RMF', 'ISO_42001'],
        stakeholderRelevance: ['board', 'risk'],
        planModuleLink: 'business-cases',
      },
      {
        id: 'fc-3',
        text: 'Is there a chargeback model for AI consumption?',
        category: 'capability',
        type: 'boolean',
        weight: 1,
        frameworks: ['CRI_FS_AI_RMF'],
        stakeholderRelevance: ['board', 'tech'],
      },
      {
        id: 'fc-4',
        text: 'What FinOps capabilities are implemented?',
        category: 'capability',
        type: 'multi-select',
        weight: 2,
        frameworks: ['CRI_FS_AI_RMF', 'ISO_42001'],
        stakeholderRelevance: ['tech', 'board'],
        options: [
          'Cost dashboards',
          'Budget alerts',
          'Usage forecasting',
          'Team/project allocation',
          'Cost anomaly detection',
          'Reserved capacity planning',
          'ROI tracking',
        ],
      },
      {
        id: 'fc-5',
        text: 'What FinOps documentation exists?',
        category: 'evidence',
        type: 'multi-select',
        weight: 1,
        frameworks: ['ISO_42001', 'CRI_FS_AI_RMF'],
        stakeholderRelevance: ['audit', 'board'],
        options: [
          'AI cost policy',
          'Budget allocation procedures',
          'Chargeback methodology',
          'Cost reports',
          'Optimization recommendations',
        ],
      },
    ],
  },
];

// ─── Helper Functions ──────────────────────────────────────────────────────

export function calculateDomainMaturity(responses: AssessmentResponse[], domain: GovernanceDomain): MaturityLevel {
  const maturityQuestions = domain.questions.filter(q => q.category === 'maturity' && q.type === 'scale');
  if (maturityQuestions.length === 0) return 1;

  let totalScore = 0;
  let totalWeight = 0;

  for (const question of maturityQuestions) {
    const response = responses.find(r => r.questionId === question.id);
    if (response && typeof response.value === 'number') {
      totalScore += response.value * question.weight;
      totalWeight += question.weight;
    }
  }

  if (totalWeight === 0) return 1;
  const avgScore = totalScore / totalWeight;
  return Math.round(avgScore) as MaturityLevel;
}

export function calculateComplianceScore(responses: AssessmentResponse[], domain: GovernanceDomain): number {
  const complianceQuestions = domain.questions.filter(q => q.category === 'compliance');
  if (complianceQuestions.length === 0) return 100;

  let compliantCount = 0;
  let totalWeight = 0;

  for (const question of complianceQuestions) {
    const response = responses.find(r => r.questionId === question.id);
    if (response) {
      if (question.type === 'boolean' && response.value === true) {
        compliantCount += question.weight;
      }
      totalWeight += question.weight;
    }
  }

  if (totalWeight === 0) return 0;
  return Math.round((compliantCount / totalWeight) * 100);
}

export function identifyGaps(
  responses: AssessmentResponse[],
  domain: GovernanceDomain,
  targetMaturity: MaturityLevel = 4
): Gap[] {
  const gaps: Gap[] = [];

  for (const question of domain.questions) {
    const response = responses.find(r => r.questionId === question.id);
    if (!response) continue;

    let isGap = false;
    let currentState = '';
    let targetState = '';

    if (question.type === 'scale' && typeof response.value === 'number') {
      if (response.value < targetMaturity) {
        isGap = true;
        currentState = question.maturityMapping?.[response.value as MaturityLevel] || `Level ${response.value}`;
        targetState = question.maturityMapping?.[targetMaturity] || `Level ${targetMaturity}`;
      }
    } else if (question.type === 'boolean' && response.value === false) {
      isGap = true;
      currentState = 'Not implemented';
      targetState = 'Implemented';
    }

    if (isGap) {
      const severity = question.weight >= 3 ? 'high' : question.weight >= 2 ? 'medium' : 'low';
      gaps.push({
        id: `gap-${domain.id}-${question.id}`,
        domainId: domain.id,
        questionId: question.id,
        currentState,
        targetState,
        severity: question.frameworks?.includes('EU_AI_ACT') || question.frameworks?.includes('SR_26_2')
          ? 'critical'
          : severity,
        remediation: generateRemediation(question, domain),
        effort: question.weight >= 3 ? 'high' : question.weight >= 2 ? 'medium' : 'low',
        timeline: question.weight >= 3 ? '6-12 months' : question.weight >= 2 ? '3-6 months' : '1-3 months',
        frameworks: question.frameworks,
      });
    }
  }

  return gaps.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

function generateRemediation(question: AssessmentQuestion, domain: GovernanceDomain): string {
  const domainName = domain.name;
  const questionText = question.text.toLowerCase();

  if (questionText.includes('policy') || questionText.includes('documentation')) {
    return `Develop and document ${domainName.toLowerCase()} policies and procedures`;
  }
  if (questionText.includes('monitor')) {
    return `Implement monitoring and alerting for ${domainName.toLowerCase()}`;
  }
  if (questionText.includes('process')) {
    return `Define and implement formal processes for ${domainName.toLowerCase()}`;
  }
  if (questionText.includes('train')) {
    return `Develop training program for ${domainName.toLowerCase()} awareness`;
  }

  return `Enhance ${domainName.toLowerCase()} capabilities to address identified gap`;
}

export function generateRecommendations(assessmentResult: AssessmentResult): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const domainGaps: Record<string, Gap[]> = {};

  for (const domainAssessment of assessmentResult.domainAssessments) {
    domainGaps[domainAssessment.domainId] = domainAssessment.gaps;
  }

  // Group critical gaps by domain
  const criticalDomains = Object.entries(domainGaps)
    .filter(([_, gaps]) => gaps.some(g => g.severity === 'critical'))
    .map(([domainId]) => domainId);

  if (criticalDomains.length > 0) {
    recommendations.push({
      id: 'rec-critical',
      priority: 1,
      title: 'Address Critical Regulatory Gaps',
      description: `Critical compliance gaps identified in ${criticalDomains.length} domain(s). Immediate remediation required for EU AI Act and SR 26-2 requirements.`,
      domains: criticalDomains,
      effort: 'high',
      impact: 'high',
      timeline: '0-3 months',
      regulatoryBenefit: ['EU_AI_ACT', 'SR_26_2'],
    });
  }

  // Recommend foundational improvements
  const lowMaturityDomains = assessmentResult.domainAssessments
    .filter(da => da.maturityScore <= 2)
    .map(da => da.domainId);

  if (lowMaturityDomains.length > 0) {
    recommendations.push({
      id: 'rec-foundation',
      priority: 2,
      title: 'Build Foundational Governance Capabilities',
      description: `${lowMaturityDomains.length} domain(s) at initial/developing maturity. Establish baseline governance processes.`,
      domains: lowMaturityDomains,
      effort: 'medium',
      impact: 'high',
      timeline: '3-6 months',
    });
  }

  return recommendations;
}

export function filterByStakeholder(
  domains: GovernanceDomain[],
  stakeholder: StakeholderRole
): GovernanceDomain[] {
  const view = STAKEHOLDER_VIEWS.find(v => v.role === stakeholder);
  if (!view) return domains;

  return domains
    .filter(d => (view.domainPriorities[d.id] || 0) >= 3)
    .sort((a, b) => (view.domainPriorities[b.id] || 0) - (view.domainPriorities[a.id] || 0));
}

export function getQuestionsForStakeholder(
  domain: GovernanceDomain,
  stakeholder: StakeholderRole
): AssessmentQuestion[] {
  return domain.questions.filter(
    q => !q.stakeholderRelevance || q.stakeholderRelevance.includes(stakeholder)
  );
}

// ─── Summary Statistics ────────────────────────────────────────────────────

export const FRAMEWORK_COUNT = REGULATORY_FRAMEWORKS.length;
export const DOMAIN_COUNT = GOVERNANCE_DOMAINS.length;
export const TOTAL_QUESTIONS = GOVERNANCE_DOMAINS.reduce((sum, d) => sum + d.questions.length, 0);

export function getFrameworkStats() {
  return {
    total: FRAMEWORK_COUNT,
    mandatory: REGULATORY_FRAMEWORKS.filter(f => f.mandatory).length,
    byRegion: {
      US: REGULATORY_FRAMEWORKS.filter(f => f.regions.includes('US')).length,
      EU: REGULATORY_FRAMEWORKS.filter(f => f.regions.includes('EU')).length,
      APAC: REGULATORY_FRAMEWORKS.filter(f =>
        f.regions.some(r => ['Singapore', 'Australia'].includes(r))
      ).length,
      Global: REGULATORY_FRAMEWORKS.filter(f => f.regions.includes('Global')).length,
    },
  };
}

export function getDomainStats() {
  return {
    total: DOMAIN_COUNT,
    totalQuestions: TOTAL_QUESTIONS,
    avgQuestionsPerDomain: Math.round(TOTAL_QUESTIONS / DOMAIN_COUNT),
    byCategory: {
      maturity: GOVERNANCE_DOMAINS.reduce(
        (sum, d) => sum + d.questions.filter(q => q.category === 'maturity').length,
        0
      ),
      compliance: GOVERNANCE_DOMAINS.reduce(
        (sum, d) => sum + d.questions.filter(q => q.category === 'compliance').length,
        0
      ),
      capability: GOVERNANCE_DOMAINS.reduce(
        (sum, d) => sum + d.questions.filter(q => q.category === 'capability').length,
        0
      ),
      evidence: GOVERNANCE_DOMAINS.reduce(
        (sum, d) => sum + d.questions.filter(q => q.category === 'evidence').length,
        0
      ),
    },
  };
}