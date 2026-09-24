// SM&CR Accountability Data — Iteration 22
// Synthetic but realistic UK bank governance structure

export type AttestationStatus = 'current' | 'expiring' | 'overdue';

export interface ReasonableStepsEvidence {
  trainingCompleted: string[];
  oversightMeetings: number; // attended in last 6 months
  signOffsGiven: number;
  lastOversightDate: Date;
}

export interface AccountabilityHolder {
  id: string;
  name: string;
  role: string;
  smfFunction: string; // e.g., "SMF4", "SMF16", "SMF17", "SMF24", "Certified"
  aiSystems: string[]; // AI systems they are accountable for
  lastAttestation: Date; // Dynamic — calculated relative to current date
  attestationCadence: number; // months (typically 6 or 12)
  statementRef: string; // "SoR-XX-2026-vN"
  reportsTo: string | null; // id of parent in chain
  reasonableStepsEvidence: ReasonableStepsEvidence;
  quote?: string; // "I am accountable..." statement
}

export interface GovernanceFramework {
  policyName: string;
  version: string;
  approvalDate: string;
  section: string;
  description: string;
}

export interface DecisionAttribution {
  decisionId: string; // e.g., "CUST-001"
  customerName: string;
  decision: 'APPROVE' | 'REJECT' | 'ESCALATE';
  agent: string;
  evaluator: string;
  policyGate: string;
  humanOverride: string | null;
  technicalOwner: string; // accountabilityHolder id
  accountableSMF: string; // accountabilityHolder id
  ultimateOwner: string; // accountabilityHolder id
  governanceFramework: GovernanceFramework;
  regulatoryBasis: string[];
}

// --- Dynamic date calculations ---

const now = new Date();
const daysMs = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * daysMs);
}

// --- Accountability Holders ---

export const accountabilityHolders: AccountabilityHolder[] = [
  {
    id: 'sarah-thompson',
    name: 'Sarah Thompson',
    role: 'Chief Risk Officer',
    smfFunction: 'SMF4',
    aiSystems: ['KYC Agent', 'Trade Surveillance', 'Credit Scoring', 'Fraud Detection'],
    lastAttestation: daysAgo(21), // 3 weeks ago
    attestationCadence: 6,
    statementRef: 'SoR-ST-2026-v3',
    reportsTo: null,
    reasonableStepsEvidence: {
      trainingCompleted: ['AI Governance for Senior Managers (Jun 2026)', 'FCA SM&CR AI Accountability (Mar 2026)', 'Board AI Risk Awareness (Jan 2026)'],
      oversightMeetings: 6,
      signOffsGiven: 14,
      lastOversightDate: daysAgo(7),
    },
    quote: 'I am accountable for the governance outcomes of this AI system',
  },
  {
    id: 'james-chen',
    name: 'James Chen',
    role: 'Head of AI',
    smfFunction: 'SMF24',
    aiSystems: ['KYC Agent', 'Trade Surveillance'],
    lastAttestation: daysAgo(15), // ~2 weeks ago
    attestationCadence: 6,
    statementRef: 'SoR-JC-2026-v2',
    reportsTo: 'sarah-thompson',
    reasonableStepsEvidence: {
      trainingCompleted: ['Model Risk Management (May 2026)', 'PRA SS1/23 Technical Implementation (Apr 2026)', 'Responsible AI Engineering (Feb 2026)'],
      oversightMeetings: 12,
      signOffsGiven: 28,
      lastOversightDate: daysAgo(3),
    },
    quote: 'I am accountable for the safe development and deployment of AI systems within my function',
  },
  {
    id: 'priya-sharma',
    name: 'Priya Sharma',
    role: 'Head of Compliance',
    smfFunction: 'SMF16',
    aiSystems: ['KYC Agent (compliance oversight)'],
    lastAttestation: daysAgo(22), // ~3 weeks ago
    attestationCadence: 6,
    statementRef: 'SoR-PS-2026-v4',
    reportsTo: 'sarah-thompson',
    reasonableStepsEvidence: {
      trainingCompleted: ['AI Regulatory Compliance (Jun 2026)', 'FCA Dear CEO Letters — AI (Apr 2026)', 'MLR 2017 AI Applications (Jan 2026)'],
      oversightMeetings: 10,
      signOffsGiven: 22,
      lastOversightDate: daysAgo(5),
    },
    quote: 'I am accountable for compliance oversight of AI-driven KYC decisions',
  },
  {
    id: 'david-okafor',
    name: 'David Okafor',
    role: 'KYC ML Lead',
    smfFunction: 'Certified',
    aiSystems: ['KYC Agent (technical)'],
    lastAttestation: daysAgo(155), // ~5 months ago — expiring soon
    attestationCadence: 6,
    statementRef: 'CERT-DO-2026-v1',
    reportsTo: 'james-chen',
    reasonableStepsEvidence: {
      trainingCompleted: ['AWS ML Security Best Practices (Jan 2026)', 'Bedrock Guardrails Configuration (Dec 2025)'],
      oversightMeetings: 8,
      signOffsGiven: 45,
      lastOversightDate: daysAgo(2),
    },
    quote: 'I am the technical owner responsible for the safe operation of the KYC AI Agent',
  },
  {
    id: 'robert-adeyemi',
    name: 'Robert Adeyemi',
    role: 'MLRO',
    smfFunction: 'SMF17',
    aiSystems: ['KYC Agent (AML decisions)'],
    lastAttestation: daysAgo(220), // ~7 months ago — overdue
    attestationCadence: 6,
    statementRef: 'SoR-RA-2025-v2',
    reportsTo: 'sarah-thompson',
    reasonableStepsEvidence: {
      trainingCompleted: ['AML AI Decision Oversight (Nov 2025)', 'SAR Automation Governance (Sep 2025)'],
      oversightMeetings: 4,
      signOffsGiven: 8,
      lastOversightDate: daysAgo(35),
    },
    quote: 'I am accountable for the integrity of AI-assisted AML and KYC decisions',
  },
];

// --- Utility: compute attestation status ---

export function computeAttestationStatus(holder: AccountabilityHolder): AttestationStatus {
  const nextDue = new Date(holder.lastAttestation.getTime() + holder.attestationCadence * 30 * daysMs);
  const daysRemaining = (nextDue.getTime() - now.getTime()) / daysMs;
  if (daysRemaining < 0) return 'overdue';
  if (daysRemaining <= 30) return 'expiring';
  return 'current';
}

export function getNextDueDate(holder: AccountabilityHolder): Date {
  return new Date(holder.lastAttestation.getTime() + holder.attestationCadence * 30 * daysMs);
}

export function getDaysOverdue(holder: AccountabilityHolder): number {
  const nextDue = getNextDueDate(holder);
  const diff = (now.getTime() - nextDue.getTime()) / daysMs;
  return Math.max(0, Math.round(diff));
}

export function getDaysUntilDue(holder: AccountabilityHolder): number {
  const nextDue = getNextDueDate(holder);
  const diff = (nextDue.getTime() - now.getTime()) / daysMs;
  return Math.round(diff);
}

// --- Decision Attribution Data ---

export const decisionAttributions: DecisionAttribution[] = [
  {
    decisionId: 'CUST-001',
    customerName: 'Sarah Chen (Acme Corporation)',
    decision: 'APPROVE',
    agent: 'KYC AI Agent v2.3 (automated)',
    evaluator: 'Bedrock Guardrail (output grounding: 94%)',
    policyGate: 'Cedar policy: kyc-standard-cdd (ALLOW)',
    humanOverride: null,
    technicalOwner: 'david-okafor',
    accountableSMF: 'james-chen',
    ultimateOwner: 'sarah-thompson',
    governanceFramework: {
      policyName: 'AI Governance Policy',
      version: 'v2.1',
      approvalDate: '14 Mar 2026',
      section: 'Section 4.2',
      description: 'Automated decisioning for low-risk KYC where risk_score < 25 and no PEP/sanctions match',
    },
    regulatoryBasis: [
      'MLR 2017 Reg 28 (simplified due diligence)',
      'FCA SYSC 6.1 (systems and controls)',
    ],
  },
  {
    decisionId: 'CUST-047',
    customerName: 'Viktor Petrov (Omega Trading)',
    decision: 'REJECT',
    agent: 'KYC AI Agent v2.3 (automated)',
    evaluator: 'Bedrock Guardrail (PII intervention on SAR)',
    policyGate: 'Cedar policy: ORG-001 (DENY — sanctions match 78%)',
    humanOverride: 'MLRO Robert Adeyemi — SAR filing authority',
    technicalOwner: 'david-okafor',
    accountableSMF: 'james-chen',
    ultimateOwner: 'sarah-thompson',
    governanceFramework: {
      policyName: 'AI Governance Policy',
      version: 'v2.1',
      approvalDate: '14 Mar 2026',
      section: 'Section 5.1',
      description: 'Mandatory block for sanctions match >70%. MLRO oversight required for SAR filing.',
    },
    regulatoryBasis: [
      'MLR 2017 Reg 33 (enhanced due diligence)',
      'Sanctions & Anti-Money Laundering Act 2018 s.3',
      'FCA SYSC 6.3 (financial crime)',
      'POCA 2002 s.330 (SAR obligation)',
    ],
  },
];

// --- Board summary computed values ---

export function getAttestationSummary() {
  const statuses = accountabilityHolders.map(h => ({
    holder: h,
    status: computeAttestationStatus(h),
  }));

  const current = statuses.filter(s => s.status === 'current');
  const expiring = statuses.filter(s => s.status === 'expiring');
  const overdue = statuses.filter(s => s.status === 'overdue');

  const compliancePct = Math.round((current.length / statuses.length) * 100);

  return {
    totalSystems: 4, // KYC, Trade Surveillance, Credit Scoring, Fraud Detection
    totalHolders: accountabilityHolders.length,
    compliancePct,
    current,
    expiring,
    overdue,
  };
}
