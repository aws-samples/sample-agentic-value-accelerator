// Operating Model — interactive design form.
// Source: .context/plan/AWS - Enterprise Operating_model_assessment.xlsx
// Mirrors the shape of maturity/business_cases/prioritization modules.

export type OperatingModelStatus = 'Draft' | 'In Progress' | 'Complete' | 'Archived';

// 7 TOM Framework dimensions (McKinsey: every decision from staffing to compliance)
export const DIMENSIONS = [
  { key: 'strategy',     label: 'AI Strategy & Vision',       weight: 0.20, accent: 'indigo' },
  { key: 'governance',   label: 'Governance & Risk',          weight: 0.15, accent: 'red' },
  { key: 'organization', label: 'Organization & Operating Model', weight: 0.15, accent: 'blue' },
  { key: 'people',       label: 'People & Talent',            weight: 0.15, accent: 'amber' },
  { key: 'technology',   label: 'Technology & Platform',      weight: 0.15, accent: 'violet' },
  { key: 'process',      label: 'Process & Delivery',         weight: 0.10, accent: 'teal' },
  { key: 'ecosystem',    label: 'Ecosystem & Partners',       weight: 0.10, accent: 'pink' },
] as const;

export type DimensionKey = typeof DIMENSIONS[number]['key'];

export interface OperatingModelWeights {
  strategy: number;
  governance: number;
  organization: number;
  people: number;
  technology: number;
  process: number;
  ecosystem: number;
}

export const DEFAULT_WEIGHTS: OperatingModelWeights = {
  strategy: 0.20, governance: 0.15, organization: 0.15,
  people: 0.15, technology: 0.15, process: 0.10, ecosystem: 0.10,
};

// Each dimension has 3 questions, each scored 1–5.
export interface DimensionQuestion {
  id: string;
  prompt: string;
  helper: string;
  anchors: Record<string, string>; // 1..5 description
}

export interface DimensionCatalog {
  label: string;
  description: string;
  questions: DimensionQuestion[];
}

export const QUESTION_CATALOG: Record<DimensionKey, DimensionCatalog> = {
  strategy: {
    label: 'AI Strategy & Vision',
    description: 'Strategic direction, portfolio planning, investment thesis.',
    questions: [
      {
        id: 'STR1',
        prompt: 'Is there a documented AI strategy aligned to enterprise objectives?',
        helper: 'Vision, scope, and ambition level.',
        anchors: {
          '1': 'No formal strategy; ad hoc experimentation.',
          '2': 'Strategy drafted; limited executive sign-off.',
          '3': 'Approved strategy; portfolio prioritized; sponsor in place.',
          '4': 'Multi-year strategy aligned to BU plans; portfolio rebalanced annually.',
          '5': 'AI-first strategy; ecosystem plays; reshapes business model.',
        },
      },
      {
        id: 'STR2',
        prompt: 'How are AI investments prioritized?',
        helper: 'Use case selection method and ROI rigor.',
        anchors: {
          '1': 'Opportunistic; no formal criteria.',
          '2': 'Basic ROI estimate; informal review.',
          '3': 'Scored matrix; cross-BU prioritization committee.',
          '4': '10-20-70 allocation; portfolio NPV / IRR governance.',
          '5': 'Real-options + portfolio optimization with continuous re-allocation.',
        },
      },
      {
        id: 'STR3',
        prompt: 'Is build-vs-buy-vs-partner decision rights formalized?',
        helper: 'Architectural and sourcing intent for AI capabilities.',
        anchors: {
          '1': 'Decisions made case-by-case without framework.',
          '2': 'Some patterns exist; not consistently applied.',
          '3': 'Documented framework; reviewed quarterly.',
          '4': 'Tied to capability taxonomy; reuse measured.',
          '5': 'Self-optimizing; capability marketplace within enterprise.',
        },
      },
    ],
  },
  governance: {
    label: 'Governance & Risk',
    description: 'Decision rights, ethical frameworks, compliance.',
    questions: [
      {
        id: 'GOV1',
        prompt: 'Is a tiered governance structure operating?',
        helper: 'Board · AI Council · Working Teams.',
        anchors: {
          '1': 'No defined AI governance; ad hoc decisions.',
          '2': 'One body exists; cadence is irregular.',
          '3': 'Three-tier structure documented; meetings held.',
          '4': 'Three-tier with automated reporting; SLAs met.',
          '5': 'Governance embedded in workflow; real-time decisions.',
        },
      },
      {
        id: 'GOV2',
        prompt: 'Are AI ethics, fairness, and bias controls enforced?',
        helper: 'Pre-deployment and runtime controls.',
        anchors: {
          '1': 'No checks; no policy.',
          '2': 'Manual review for high-risk only.',
          '3': 'Standard checklist before release; documented exceptions.',
          '4': 'Automated guardrails; fairness metrics in CI.',
          '5': 'Continuous responsible-AI monitoring with auto-remediation.',
        },
      },
      {
        id: 'GOV3',
        prompt: 'How are regulatory frameworks mapped (NIST AI RMF, EU AI Act, ISO 42001, SR 26-2)?',
        helper: 'Compliance coverage and audit-readiness.',
        anchors: {
          '1': 'Not mapped.',
          '2': 'Partial mapping; gaps unknown.',
          '3': 'All frameworks mapped; controls in place.',
          '4': 'Automated evidence collection; audit-ready.',
          '5': 'Real-time compliance posture; continuous attestation.',
        },
      },
    ],
  },
  organization: {
    label: 'Organization & Operating Model',
    description: 'Structure, roles, decision authority, coordination.',
    questions: [
      {
        id: 'ORG1',
        prompt: 'Is the AI operating model defined and operating?',
        helper: 'CoE · Hub-and-Spoke · Federated.',
        anchors: {
          '1': 'No defined model.',
          '2': 'Single small team; informal.',
          '3': 'CoE with BU liaisons.',
          '4': 'Hub-and-Spoke; spokes operating in 3+ BUs.',
          '5': 'Federated with central guardrails; AI in every function.',
        },
      },
      {
        id: 'ORG2',
        prompt: 'Is there a senior AI leader (CAIO or equivalent) with executive sponsorship?',
        helper: 'Span, reporting line, and authority.',
        anchors: {
          '1': 'No dedicated AI leader.',
          '2': 'Director-level lead inside another function.',
          '3': 'Head-of-AI; reports to C-suite.',
          '4': 'CAIO appointed; on Exec Committee.',
          '5': 'CAIO drives enterprise transformation; peer to CFO/CTO.',
        },
      },
      {
        id: 'ORG3',
        prompt: 'How are cross-functional AI teams structured for delivery?',
        helper: 'Product squads, pods, embedded specialists.',
        anchors: {
          '1': 'Project-based; teams disbanded post-launch.',
          '2': 'Some persistent teams in select BUs.',
          '3': 'Standard pod model; product-aligned.',
          '4': 'Persistent product teams with ML/Data/PM.',
          '5': 'Autonomous human + agent teams reduce layers.',
        },
      },
    ],
  },
  people: {
    label: 'People & Talent',
    description: 'Skills, training, culture, change management.',
    questions: [
      {
        id: 'PEO1',
        prompt: 'How broadly is AI literacy distributed across the workforce?',
        helper: 'Coverage and depth of AI skills.',
        anchors: {
          '1': '<10% of staff; specialists only.',
          '2': '10–25% have basic AI literacy.',
          '3': '25–50%; structured curricula in place.',
          '4': '50–75%; role-based pathways completed annually.',
          '5': '>75%; AI literacy embedded in onboarding for all roles.',
        },
      },
      {
        id: 'PEO2',
        prompt: 'Is there an AI talent strategy (hire / build / partner)?',
        helper: 'Workforce plan, pipeline, retention.',
        anchors: {
          '1': 'Reactive; no plan.',
          '2': 'Plan in draft; some hiring.',
          '3': 'Approved 2-year talent plan; retention tracked.',
          '4': 'Active pipeline + university partnerships; retention >85%.',
          '5': 'AI talent magnet; net importer of talent in market.',
        },
      },
      {
        id: 'PEO3',
        prompt: 'Are AI / agentic-AI career paths formally defined?',
        helper: 'Roles, levels, comp bands.',
        anchors: {
          '1': 'Not defined.',
          '2': 'Job descriptions only.',
          '3': 'Career ladder defined for ML / Data Engineering.',
          '4': 'Includes AI Product, MLOps, Responsible-AI roles.',
          '5': 'Includes agentic-AI, prompt, evaluation, and HITL roles.',
        },
      },
    ],
  },
  technology: {
    label: 'Technology & Platform',
    description: 'Infrastructure, tools, platform services, architecture.',
    questions: [
      {
        id: 'TEC1',
        prompt: 'What is the current MLOps maturity level (manual → autonomous)?',
        helper: 'Pipeline, CI/CD, monitoring, rollback.',
        anchors: {
          '1': 'Manual notebooks; no pipeline.',
          '2': 'Some scripts; manual deploys.',
          '3': 'CI/CD for select models; basic monitoring.',
          '4': 'MLOps L3: continuous training + drift detection.',
          '5': 'MLOps L4: autonomous retraining + closed-loop control.',
        },
      },
      {
        id: 'TEC2',
        prompt: 'Is a self-service AI platform available?',
        helper: 'Notebook, feature store, model registry, MLOps.',
        anchors: {
          '1': 'No central platform.',
          '2': 'Shared notebooks only.',
          '3': 'Platform launched; <50% adoption.',
          '4': 'Platform standard; >50% adoption with feature store.',
          '5': 'AI-native platform; 100% adoption; agentic runtime.',
        },
      },
      {
        id: 'TEC3',
        prompt: 'Are reference architectures defined for GenAI / Agentic AI / RAG?',
        helper: 'Patterns, templates, guardrails.',
        anchors: {
          '1': 'No reference architectures.',
          '2': 'Some patterns documented.',
          '3': 'Approved patterns for GenAI + RAG.',
          '4': 'Patterns include agentic + multi-agent + HITL.',
          '5': 'Reusable components; pattern library w/ usage telemetry.',
        },
      },
    ],
  },
  process: {
    label: 'Process & Delivery',
    description: 'Methodologies, delivery patterns, quality assurance.',
    questions: [
      {
        id: 'PRO1',
        prompt: 'Is there a defined AI/ML delivery lifecycle?',
        helper: 'Discovery → design → develop → validate → deploy → monitor.',
        anchors: {
          '1': 'No defined lifecycle.',
          '2': 'Some phases; inconsistent.',
          '3': 'Lifecycle approved; quality gates documented.',
          '4': 'Automated quality gates + A/B testing in production.',
          '5': 'Continuous experimentation; learn-from-prod loops.',
        },
      },
      {
        id: 'PRO2',
        prompt: 'Are evaluation and validation processes formalized?',
        helper: 'Eval datasets, golden sets, regression suites.',
        anchors: {
          '1': 'No standard eval.',
          '2': 'Manual eval per project.',
          '3': 'Standard eval suites; tracked over time.',
          '4': 'Continuous eval in CI/CD; eval drift detected.',
          '5': 'Online evals; agent benchmarking; closed-loop tuning.',
        },
      },
      {
        id: 'PRO3',
        prompt: 'How is change management embedded in AI delivery?',
        helper: 'Adoption, training, feedback loops.',
        anchors: {
          '1': 'Change management is an afterthought.',
          '2': 'Light comms post-launch.',
          '3': 'Change plan included for each launch.',
          '4': 'Adoption metrics tracked; training pre-launch.',
          '5': 'Change is a first-class delivery workstream.',
        },
      },
    ],
  },
  ecosystem: {
    label: 'Ecosystem & Partners',
    description: 'Vendors, partners, academic, open source.',
    questions: [
      {
        id: 'ECO1',
        prompt: 'Are vendor and partner relationships formally governed?',
        helper: 'Selection, SLAs, exit plans.',
        anchors: {
          '1': 'Ad hoc procurement.',
          '2': 'Master agreements with key vendors.',
          '3': 'Formal vendor governance + SLA tracking.',
          '4': 'Strategic partnerships; joint roadmap.',
          '5': 'Co-innovation portfolio; outcome-based contracts.',
        },
      },
      {
        id: 'ECO2',
        prompt: 'Is there an academic / open-source / community engagement plan?',
        helper: 'External knowledge inflow.',
        anchors: {
          '1': 'None.',
          '2': 'Sporadic conference attendance.',
          '3': 'Partnerships with 2–3 universities; OSS consumption.',
          '4': 'Sustained research collaborations; OSS contribution.',
          '5': 'Net contributor to OSS / standards bodies.',
        },
      },
      {
        id: 'ECO3',
        prompt: 'Is the ISV / cloud / model-provider strategy defined?',
        helper: 'Multi-model, multi-cloud, AWS Bedrock alignment.',
        anchors: {
          '1': 'Not defined.',
          '2': 'Single vendor; lock-in risks.',
          '3': 'Primary + secondary providers identified.',
          '4': 'Multi-model abstraction; portable runtimes.',
          '5': 'Optimal-routing across providers; cost+quality balanced.',
        },
      },
    ],
  },
};

// Operating model patterns
export const PATTERNS = ['Centralized CoE', 'CoE + BU Liaisons', 'Hub-and-Spoke', 'Federated + Central Gov', 'Fully Federated'] as const;
export type OperatingPattern = typeof PATTERNS[number];

// Governance approach
export const GOVERNANCE_APPROACHES = [
  'Executive-sponsored / informal',
  'Formal AI Council',
  'Three-tier (Board · Council · Teams)',
  'Automated central guardrails',
  'Embedded in workflows',
] as const;
export type GovernanceApproach = typeof GOVERNANCE_APPROACHES[number];

// Capability placement options for the 20-capability taxonomy
export type Placement = 'Centralized' | 'Hub-and-Spoke' | 'Federated';

export interface Capability {
  id: number;
  name: string;
  defaultPlacement: Placement;
  defaultOwnership: string;
  awsService: string;
}

export const CAPABILITIES: Capability[] = [
  { id: 1,  name: 'AI Strategy',                 defaultPlacement: 'Centralized',   defaultOwnership: 'C-suite / CoE',                  awsService: 'AWS Cost Explorer, Budgets' },
  { id: 2,  name: 'Data Science',                defaultPlacement: 'Hub-and-Spoke', defaultOwnership: 'CoE + BU embedded',              awsService: 'SageMaker AI (Studio, Notebooks)' },
  { id: 3,  name: 'MLOps / AI Engineering',      defaultPlacement: 'Centralized',   defaultOwnership: 'Shared Services / Platform',     awsService: 'SageMaker Pipelines, CodePipeline' },
  { id: 4,  name: 'Generative AI',               defaultPlacement: 'Hub-and-Spoke', defaultOwnership: 'CoE platform + BU use cases',    awsService: 'Bedrock, SageMaker JumpStart' },
  { id: 5,  name: 'AI Product Management',       defaultPlacement: 'Federated',     defaultOwnership: 'BU-embedded',                    awsService: 'Amazon Q Business' },
  { id: 6,  name: 'Data Engineering',            defaultPlacement: 'Hub-and-Spoke', defaultOwnership: 'CoE platform + BU pipelines',    awsService: 'Glue, EMR, Kinesis' },
  { id: 7,  name: 'AI Governance & Ethics',      defaultPlacement: 'Centralized',   defaultOwnership: 'CAIO Office / Legal',            awsService: 'Bedrock Guardrails, SageMaker Clarify' },
  { id: 8,  name: 'AI Risk Management',          defaultPlacement: 'Centralized',   defaultOwnership: 'Risk / Compliance',              awsService: 'SageMaker Model Monitor' },
  { id: 9,  name: 'AI Platform Engineering',     defaultPlacement: 'Centralized',   defaultOwnership: 'Platform Team',                  awsService: 'SageMaker Unified Studio' },
  { id: 10, name: 'AI Talent & Training',        defaultPlacement: 'Hub-and-Spoke', defaultOwnership: 'HR + CoE',                       awsService: 'AWS Skill Builder' },
  { id: 11, name: 'AI Security',                 defaultPlacement: 'Centralized',   defaultOwnership: 'Security / CISO',                awsService: 'IAM, GuardDuty, Macie' },
  { id: 12, name: 'AI Infrastructure',           defaultPlacement: 'Centralized',   defaultOwnership: 'IT / Platform',                  awsService: 'EC2 (P5/Trainium), SageMaker' },
  { id: 13, name: 'Responsible AI',              defaultPlacement: 'Centralized',   defaultOwnership: 'CAIO Office / Ethics Board',     awsService: 'SageMaker Clarify, Bedrock Guardrails' },
  { id: 14, name: 'AI Change Management',        defaultPlacement: 'Hub-and-Spoke', defaultOwnership: 'HR + BU Change Leads',           awsService: 'N/A (Process-driven)' },
  { id: 15, name: 'AI Vendor Management',        defaultPlacement: 'Centralized',   defaultOwnership: 'Procurement / CoE',              awsService: 'AWS Marketplace' },
  { id: 16, name: 'AI Performance & KPIs',       defaultPlacement: 'Hub-and-Spoke', defaultOwnership: 'CoE + BU Owners',                awsService: 'CloudWatch, QuickSight' },
  { id: 17, name: 'Agentic AI',                  defaultPlacement: 'Hub-and-Spoke', defaultOwnership: 'CoE architecture + BU deploy',   awsService: 'Bedrock Agents, AgentCore' },
  { id: 18, name: 'AI Use Case Delivery',        defaultPlacement: 'Federated',     defaultOwnership: 'BU Product Teams',               awsService: 'Step Functions, Lambda' },
  { id: 19, name: 'AI Knowledge Management',     defaultPlacement: 'Hub-and-Spoke', defaultOwnership: 'CoE + BU domain experts',        awsService: 'Bedrock Knowledge Bases' },
  { id: 20, name: 'AI Ecosystem & Partners',     defaultPlacement: 'Federated',     defaultOwnership: 'BU + Partnerships',              awsService: 'AWS Partner Network' },
];

export interface InvestmentSplit {
  people_pct: number;
  technology_pct: number;
  algorithms_pct: number;
}

export const DEFAULT_INVESTMENT: InvestmentSplit = { people_pct: 70, technology_pct: 20, algorithms_pct: 10 };

export interface RoadmapPhase {
  name: string;
  months: string;
  investment_m: number;
  enabled: boolean;
}

export const DEFAULT_ROADMAP: RoadmapPhase[] = [
  { name: 'Phase 1: Foundation',     months: '0–6',   investment_m: 1.2, enabled: true },
  { name: 'Phase 2: Build & Pilot',  months: '6–12',  investment_m: 2.0, enabled: true },
  { name: 'Phase 3: Scale',          months: '12–24', investment_m: 2.2, enabled: true },
  { name: 'Phase 4: Optimize',       months: '24–36', investment_m: 1.4, enabled: true },
];

export const STATUSES: OperatingModelStatus[] = ['Draft', 'In Progress', 'Complete', 'Archived'];

// Maturity levels (mirrors maturity module, used for level rendering)
export const LEVEL_NAMES: Record<number, { name: string; tagline: string; pattern: OperatingPattern }> = {
  0: { name: 'Not yet assessed',           tagline: 'Score the dimensions to see a recommendation', pattern: 'Centralized CoE' },
  1: { name: 'L1 — Awareness',             tagline: 'Ad hoc; foundational capability building',     pattern: 'Centralized CoE' },
  2: { name: 'L2 — Developing',            tagline: 'Pilots; growing executive interest',           pattern: 'CoE + BU Liaisons' },
  3: { name: 'L3 — Defined',               tagline: 'Embedded in select processes',                 pattern: 'Hub-and-Spoke' },
  4: { name: 'L4 — Advanced',              tagline: 'Deployed across functions; measurable ROI',    pattern: 'Federated + Central Gov' },
  5: { name: 'L5 — Transformational',      tagline: 'Reshapes operating model & advantage',         pattern: 'Fully Federated' },
};

export const DIM_ACCENTS: Record<DimensionKey, { bar: string; pill: string; thumb: string; text: string }> = {
  strategy:     { bar: 'from-indigo-500 to-indigo-600',   pill: 'bg-indigo-50 text-indigo-700',   thumb: 'accent-indigo-600',   text: 'text-indigo-700' },
  governance:   { bar: 'from-red-500 to-red-600',         pill: 'bg-red-50 text-red-700',         thumb: 'accent-red-600',      text: 'text-red-700' },
  organization: { bar: 'from-blue-500 to-blue-600',       pill: 'bg-blue-50 text-blue-700',       thumb: 'accent-blue-600',     text: 'text-blue-700' },
  people:       { bar: 'from-amber-500 to-amber-600',     pill: 'bg-amber-50 text-amber-700',     thumb: 'accent-amber-600',    text: 'text-amber-700' },
  technology:   { bar: 'from-violet-500 to-violet-600',   pill: 'bg-violet-50 text-violet-700',   thumb: 'accent-violet-600',   text: 'text-violet-700' },
  process:      { bar: 'from-teal-500 to-teal-600',       pill: 'bg-teal-50 text-teal-700',       thumb: 'accent-teal-600',     text: 'text-teal-700' },
  ecosystem:    { bar: 'from-pink-500 to-pink-600',       pill: 'bg-pink-50 text-pink-700',       thumb: 'accent-pink-600',     text: 'text-pink-700' },
};

// Computed shape stored on each operating model record.
export interface DimensionResult {
  label: string;
  answered: number;
  total: number;
  average: number;
  weighted_contribution: number;
  level: number;
}

export interface ComputedOperatingModel {
  dimensions: Record<string, DimensionResult>;
  composite: number;        // 0–5
  maturity_level: number;   // 0–5 rounded
  recommended_pattern: OperatingPattern;
  recommended_governance: GovernanceApproach;
  answered: number;
  total: number;
  completion: number;       // 0–1
  total_investment_m: number;
}

export interface CapabilityChoice {
  capability_id: number;
  placement: Placement;
  ownership: string;
}

export interface OperatingModel {
  operating_model_id: string;
  name: string;
  description: string;
  organization: string;
  designer: string;
  status: OperatingModelStatus;
  created_at: string;
  updated_at: string;
  scores: Record<string, number>;
  weights: OperatingModelWeights;
  pattern: OperatingPattern;          // user choice; pre-filled from recommendation
  governance: GovernanceApproach;
  capability_choices: CapabilityChoice[];
  investment: InvestmentSplit;
  roadmap: RoadmapPhase[];
  computed?: ComputedOperatingModel | null;
}

export type OperatingModelCreate = Omit<OperatingModel, 'operating_model_id' | 'created_at' | 'updated_at' | 'computed'> & {
  operating_model_id?: string;
};
