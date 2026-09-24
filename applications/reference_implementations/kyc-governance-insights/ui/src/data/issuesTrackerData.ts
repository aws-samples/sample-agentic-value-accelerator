// =============================================================================
// issuesTrackerData.ts — Iteration 23: Issues & Findings Tracker
// Complete audit findings lifecycle: identification → remediation → closure
// =============================================================================

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';
export type FindingStatus = 'open' | 'in_progress' | 'remediated' | 'closed';
export type FindingSource = 'internal_audit' | 'external_audit' | 'self_assessment' | 'regulatory_exam';

export interface Finding {
  id: string; // FND-YYYY-NNN
  source: FindingSource;
  severity: FindingSeverity;
  title: string;
  description: string;
  owner: string;
  ownerRole: string;
  status: FindingStatus;
  openedDate: Date;
  targetDate: Date;
  closedDate?: Date;
  remediationPlan: string;
  remediationEvidence?: string;
  linkedControls: string[]; // control IDs from controlMappingData
  rootCause: string;
}

// --- Dynamic date calculations ---
const now = new Date();
const daysMs = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * daysMs);
}

function daysFromNow(days: number): Date {
  return new Date(now.getTime() + days * daysMs);
}

// --- Utility functions ---

export type AgingStatus = 'green' | 'amber' | 'red';

export function computeAging(finding: Finding): number {
  if (finding.closedDate) {
    return Math.round((finding.closedDate.getTime() - finding.openedDate.getTime()) / daysMs);
  }
  return Math.round((now.getTime() - finding.openedDate.getTime()) / daysMs);
}

export function computeAgingStatus(finding: Finding): AgingStatus {
  const days = computeAging(finding);
  if (days > 60) return 'red';
  if (days > 30) return 'amber';
  return 'green';
}

export function isOverdue(finding: Finding): boolean {
  if (finding.status === 'closed' || finding.status === 'remediated') return false;
  return finding.targetDate.getTime() < now.getTime();
}

// --- Issues & Findings Data ---

export const issuesData: Finding[] = [
  {
    id: 'FND-2026-001',
    source: 'internal_audit',
    severity: 'critical',
    title: 'Model validation gap: Nova Pro lacking bias testing evidence',
    description: 'Annual bias testing for Nova Pro risk classification model has not been completed within the required validation window. External audit (Deloitte) identified geographic bias in Q1 testing but full re-validation has not been scheduled.',
    owner: 'J. Singh',
    ownerRole: 'CRO Office',
    status: 'open',
    openedDate: daysAgo(17),
    targetDate: daysFromNow(17),
    remediationPlan: '1. Commission independent bias re-assessment (Deloitte engaged). 2. Implement interim Cedar policy adjustment for geographic weighting. 3. Schedule full model re-validation within 30 days.',
    linkedControls: ['RS.AN-07', 'MP.VL-01'],
    rootCause: 'Validation cadence tracker did not trigger alert due to misconfigured date field. Manual override required.',
  },
  {
    id: 'FND-2026-002',
    source: 'self_assessment',
    severity: 'medium',
    title: 'Control GV.OV-03 partial pass — change management log incomplete',
    description: 'Model change governance control tested as partial pass. 2 of 15 sampled model changes (CHG-2026-008, CHG-2026-011) had verbal approval but missing written impact assessment documentation.',
    owner: 'A. Patel',
    ownerRole: 'Compliance',
    status: 'in_progress',
    openedDate: daysAgo(22),
    targetDate: daysFromNow(32),
    remediationPlan: '1. Implement mandatory form submission gate in CI/CD pipeline. 2. Retrospectively document impact assessments for CHG-008 and CHG-011. 3. Training session for engineering team on change governance requirements.',
    linkedControls: ['GV.OV-03'],
    rootCause: 'No technical enforcement of documentation requirement. Process relied on manual compliance which broke down during sprint pressure.',
  },
  {
    id: 'FND-2026-003',
    source: 'external_audit',
    severity: 'medium',
    title: 'EU AI Act Annex VIII documentation gaps for Claude Sonnet model card',
    description: 'External audit identified that the Claude Sonnet model card does not fully meet EU AI Act Annex VIII requirements for high-risk AI systems. Missing: detailed training data provenance, energy consumption metrics, and explicit fundamental rights impact assessment.',
    owner: 'R. Shaw',
    ownerRole: 'Legal & Regulatory',
    status: 'open',
    openedDate: daysAgo(10),
    targetDate: daysFromNow(34),
    remediationPlan: '1. Engage Anthropic for training data provenance statement (under NDA). 2. Estimate energy consumption from usage metrics. 3. Commission fundamental rights impact assessment (external counsel).',
    linkedControls: ['GV.OV-01', 'RS.AN-01'],
    rootCause: 'EU AI Act enforcement timeline was unclear; documentation prepared against draft regulation rather than final text.',
  },
  {
    id: 'FND-2026-004',
    source: 'internal_audit',
    severity: 'low',
    title: 'Attestation records not centralised',
    description: 'SM&CR attestation records stored across multiple systems (SharePoint, email, HR system). No single source of truth for regulatory inspection.',
    owner: 'M. Brown',
    ownerRole: 'Operations',
    status: 'remediated',
    openedDate: daysAgo(45),
    targetDate: daysAgo(14),
    closedDate: daysAgo(5),
    remediationPlan: 'Migrate all attestation records to centralised governance platform. Implement automated attestation workflow with digital signature capture.',
    remediationEvidence: 'All 5 SMF holder attestations migrated to platform. Digital signatures captured. Audit trail verified.',
    linkedControls: ['GV.OV-01', 'GV.OV-02'],
    rootCause: 'Legacy process from pre-AI governance era. No dedicated tooling for AI-specific SM&CR attestation.',
  },
  {
    id: 'FND-2026-005',
    source: 'regulatory_exam',
    severity: 'high',
    title: 'Insufficient HITL escalation documentation for SAR decisions',
    description: 'FCA skilled person review identified that human-in-the-loop escalation decisions for SAR (Suspicious Activity Report) filing lack sufficient documented reasoning. Decisions recorded as "approve/reject" without narrative justification.',
    owner: 'R. Adeyemi',
    ownerRole: 'MLRO',
    status: 'in_progress',
    openedDate: daysAgo(38),
    targetDate: daysFromNow(7),
    remediationPlan: '1. Update HITL decision form to require mandatory reasoning field (min 50 chars). 2. Retrain MLRO team on documentation standards. 3. Implement automated completeness check before case closure.',
    linkedControls: ['HO.HI-01', 'TR.AU-01'],
    rootCause: 'Original HITL interface designed for speed over documentation. Regulatory expectations for AI-assisted SAR decisions higher than traditional manual process.',
  },
  {
    id: 'FND-2026-006',
    source: 'self_assessment',
    severity: 'low',
    title: 'Monitoring dashboard alert fatigue — non-actionable alerts',
    description: 'Self-assessment identified that 40% of monitoring alerts in Q1 were non-actionable (false positives or below intervention threshold). Contributing to alert fatigue and potential for missed genuine alerts.',
    owner: 'D. Okafor',
    ownerRole: 'Engineering',
    status: 'closed',
    openedDate: daysAgo(62),
    targetDate: daysAgo(20),
    closedDate: daysAgo(18),
    remediationPlan: 'Recalibrate alert thresholds based on Q1 data. Implement alert severity tiering. Add 15-minute aggregation window to reduce noise.',
    remediationEvidence: 'Alert thresholds recalibrated 18 Jun 2026. Q2 false positive rate reduced from 40% to 12%. Alert fatigue score improved from 3.2 to 1.8 (target: <2.0).',
    linkedControls: ['RS.CM-01'],
    rootCause: 'Initial threshold settings were conservative (from pre-production tuning). Never recalibrated after 6 months of production data.',
  },
  {
    id: 'FND-2026-007',
    source: 'internal_audit',
    severity: 'medium',
    title: 'Third-party model risk assessment not updated for Bedrock version change',
    description: 'AWS Bedrock updated Claude Sonnet from 3.5 to 4.5 in February 2026. Third-party risk assessment still references v3.5. Updated assessment required per vendor management policy.',
    owner: 'J. Chen',
    ownerRole: 'Head of AI',
    status: 'remediated',
    openedDate: daysAgo(55),
    targetDate: daysAgo(10),
    closedDate: daysAgo(8),
    remediationPlan: '1. Obtain updated model card from AWS. 2. Commission delta risk assessment (v3.5 → v4.5). 3. Update model inventory record. 4. Board notification of material model change.',
    remediationEvidence: 'Delta assessment completed 20 Jun 2026 (PwC). Model inventory updated. Board notified at June meeting. Risk profile: no material change in risk.',
    linkedControls: ['GV.OV-03', 'MP.VL-01'],
    rootCause: 'Version change notification from AWS was received by engineering but not routed to compliance. Process gap in vendor communication handling.',
  },
  {
    id: 'FND-2026-008',
    source: 'external_audit',
    severity: 'low',
    title: 'Minor formatting inconsistencies in automated compliance reports',
    description: 'External audit noted that automated compliance reports generated by the system have inconsistent date formatting (mix of DD/MM/YYYY and YYYY-MM-DD) and occasional truncation of long control descriptions.',
    owner: 'D. Okafor',
    ownerRole: 'Engineering',
    status: 'closed',
    openedDate: daysAgo(70),
    targetDate: daysAgo(40),
    closedDate: daysAgo(42),
    remediationPlan: 'Standardise date formatting to DD MMM YYYY across all reports. Increase description field max length. Add automated formatting test to CI pipeline.',
    remediationEvidence: 'Fix deployed in release v2.1.4 (16 May 2026). Formatting test added to CI. No further instances detected in subsequent report generation.',
    linkedControls: ['TR.AU-01'],
    rootCause: 'Multiple developers contributed to report generation module without shared formatting standard.',
  },
];

// --- Summary for fleet/executive view ---

export function getIssuesSummary() {
  const open = issuesData.filter(f => f.status === 'open');
  const inProgress = issuesData.filter(f => f.status === 'in_progress');
  const critical = issuesData.filter(f => f.severity === 'critical' && (f.status === 'open' || f.status === 'in_progress'));
  const overdue = issuesData.filter(f => isOverdue(f));

  const oldestOpenDays = open.length > 0
    ? Math.max(...open.map(f => computeAging(f)))
    : 0;

  return {
    totalOpen: open.length + inProgress.length,
    open: open.length,
    inProgress: inProgress.length,
    critical: critical.length,
    overdue: overdue.length,
    oldestOpenDays,
  };
}
