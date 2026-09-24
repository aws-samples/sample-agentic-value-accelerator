/**
 * OpsCompliance - Operations ↔ GRC Bridge
 *
 * Shows compliance posture through the lens of operational events.
 * Bridges SRE operations with GRC requirements for FSI environments.
 *
 * Features:
 * - KPI row: Compliance Score, Policy Violations, Incidents with Compliance Impact
 * - Framework Impact Matrix: SR 26-2, NIST AI RMF, EU AI Act with ops-related controls
 * - Incident → Compliance Mapping: Which frameworks/controls affected by incidents
 * - Operational Policy Violations: Change without approval, SLA breaches, etc.
 * - Change Compliance: Pre/post deployment compliance checks
 * - Evidence Dashboard: Operational evidence for auditors
 * - Upcoming Audits: Scheduled audits with prep status
 */

import { useState, useMemo } from 'react';
import { Icon, type IconName } from '../icons';
import StatCard from '../StatCard';
import { MockDataBadge, LiveDataBadge } from '../DataSourceIndicator';
import CoreBadge from '../CoreBadge';
import { useComplianceMapping } from './useOpsLiveData';

// ============================================================================
// Types
// ============================================================================

type ViolationType = 'change-no-approval' | 'sla-breach' | 'runbook-skip' | 'escalation-bypass' | 'evidence-gap';
type RemediationStatus = 'open' | 'in-progress' | 'resolved' | 'accepted-risk';
type EvidenceCategory = 'incident-response' | 'change-management' | 'oncall-coverage' | 'sla-compliance' | 'runbook-execution';
type AuditPrepStatus = 'not-started' | 'in-progress' | 'ready' | 'overdue';

interface FrameworkOpsImpact {
  id: string;
  name: string;
  shortName: string;
  opsRelatedControls: number;
  compliant: number;
  atRisk: number;
  nonCompliant: number;
  lastAssessed: string;
  criticalControls: string[];
}

interface IncidentComplianceImpact {
  id: string;
  incidentId: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  occurredAt: string;
  frameworksAffected: { framework: string; controls: string[] }[];
  complianceImpactSeverity: 'critical' | 'high' | 'medium' | 'low';
  remediationStatus: RemediationStatus;
  evidenceGenerated: string[];
  rootCauseDocumented: boolean;
}

interface PolicyViolation {
  id: string;
  type: ViolationType;
  description: string;
  timestamp: string;
  owner: string;
  agentOrSystem: string;
  remediationStatus: RemediationStatus;
  frameworksImpacted: string[];
  daysOpen: number;
}

interface ChangeComplianceRecord {
  id: string;
  changeId: string;
  title: string;
  requestedBy: string;
  reviewRequired: boolean;
  preDeploymentCheck: 'pass' | 'fail' | 'waived' | 'pending';
  postDeploymentVerification: 'pass' | 'fail' | 'pending' | 'not-required';
  exceptionGranted: boolean;
  exceptionReason?: string;
  approvedBy?: string;
  timestamp: string;
  frameworksRelevant: string[];
}

interface EvidenceItem {
  id: string;
  category: EvidenceCategory;
  title: string;
  description: string;
  generatedAt: string;
  expiresAt?: string;
  status: 'current' | 'expiring-soon' | 'expired' | 'missing';
  frameworksCovered: string[];
  lastVerified: string;
  source: string;
}

interface UpcomingAudit {
  id: string;
  name: string;
  framework: string;
  scheduledDate: string;
  prepStatus: AuditPrepStatus;
  requiredEvidence: { item: string; status: 'ready' | 'in-progress' | 'missing' }[];
  owner: string;
  scope: string[];
}

// ============================================================================
// Mock Data - FSI-Realistic Compliance Scenarios
// ============================================================================

const MOCK_KPI_DATA = {
  complianceScore: 87.3,
  complianceScoreTrend: -2.1,
  policyViolationsFromOps: 4,
  incidentsWithComplianceImpact: 2,
  auditFindingsOpen: 3,
  changeCompliancePct: 94.2,
  evidenceGaps: 5,
};

const MOCK_FRAMEWORK_IMPACT: FrameworkOpsImpact[] = [
  {
    id: 'sr26-2',
    name: 'SR 26-2 Third-Party Risk',
    shortName: 'SR 26-2',
    opsRelatedControls: 12,
    compliant: 8,
    atRisk: 3,
    nonCompliant: 1,
    lastAssessed: '2026-08-09',
    criticalControls: ['GOV-2 (Oversight)', 'USE-2 (Monitoring)', 'VAL-3 (Ongoing Validation)'],
  },
  {
    id: 'nist-ai-rmf',
    name: 'NIST AI RMF',
    shortName: 'NIST AI RMF',
    opsRelatedControls: 18,
    compliant: 14,
    atRisk: 3,
    nonCompliant: 1,
    lastAssessed: '2026-08-08',
    criticalControls: ['MANAGE 3.1 (Monitoring)', 'MANAGE 1.1 (Incident Response)', 'GOVERN 5.1 (Inventory)'],
  },
  {
    id: 'eu-ai-act',
    name: 'EU AI Act',
    shortName: 'EU AI Act',
    opsRelatedControls: 9,
    compliant: 6,
    atRisk: 2,
    nonCompliant: 1,
    lastAssessed: '2026-08-07',
    criticalControls: ['EU-MON-1 (Post-Market Monitoring)', 'EU-INC-1 (Incident Reporting)', 'EU-LOG-1 (Logging)'],
  },
  {
    id: 'iso-42001',
    name: 'ISO 42001',
    shortName: 'ISO 42001',
    opsRelatedControls: 8,
    compliant: 7,
    atRisk: 1,
    nonCompliant: 0,
    lastAssessed: '2026-08-10',
    criticalControls: ['ISO-9.1 (Performance Evaluation)', 'ISO-10.1 (Continual Improvement)'],
  },
  {
    id: 'cri-fs-ai',
    name: 'CRI FS AI RMF',
    shortName: 'CRI FS AI',
    opsRelatedControls: 14,
    compliant: 10,
    atRisk: 3,
    nonCompliant: 1,
    lastAssessed: '2026-08-09',
    criticalControls: ['DM-1 (Deployment Monitoring)', 'TP-2 (Third-Party Ops)', 'GV-3 (Governance Ops)'],
  },
  {
    id: 'osfi-e23',
    name: 'OSFI E-23',
    shortName: 'OSFI E-23',
    opsRelatedControls: 6,
    compliant: 5,
    atRisk: 1,
    nonCompliant: 0,
    lastAssessed: '2026-08-06',
    criticalControls: ['E23-MON-1 (Monitoring)', 'E23-TP-1 (Third-Party Ops)'],
  },
];

const MOCK_INCIDENT_COMPLIANCE: IncidentComplianceImpact[] = [
  {
    id: 'ic-001',
    incidentId: 'INC-2026-0847',
    title: 'Trading Assistant Error Spike - Unauthorized model update',
    severity: 'high',
    occurredAt: '2026-08-11T10:23:00Z',
    frameworksAffected: [
      { framework: 'SR 26-2', controls: ['USE-2', 'VAL-3'] },
      { framework: 'NIST AI RMF', controls: ['MANAGE 3.1', 'GOVERN 5.1'] },
      { framework: 'CRI FS AI', controls: ['DM-1'] },
    ],
    complianceImpactSeverity: 'high',
    remediationStatus: 'in-progress',
    evidenceGenerated: ['Incident timeline', 'Root cause analysis', 'Remediation plan'],
    rootCauseDocumented: true,
  },
  {
    id: 'ic-002',
    incidentId: 'INC-2026-0842',
    title: 'KYC Agent SLA breach - Third-party API degradation',
    severity: 'medium',
    occurredAt: '2026-08-10T14:45:00Z',
    frameworksAffected: [
      { framework: 'SR 26-2', controls: ['GOV-2', 'TP-OPS'] },
      { framework: 'OSFI E-23', controls: ['E23-TP-1'] },
    ],
    complianceImpactSeverity: 'medium',
    remediationStatus: 'resolved',
    evidenceGenerated: ['SLA breach report', 'Vendor communication log', 'Recovery timeline'],
    rootCauseDocumented: true,
  },
  {
    id: 'ic-003',
    incidentId: 'INC-2026-0838',
    title: 'Fraud Detection Agent timeout during peak load',
    severity: 'high',
    occurredAt: '2026-08-08T09:12:00Z',
    frameworksAffected: [
      { framework: 'NIST AI RMF', controls: ['MANAGE 3.1'] },
      { framework: 'EU AI Act', controls: ['EU-MON-1'] },
    ],
    complianceImpactSeverity: 'medium',
    remediationStatus: 'resolved',
    evidenceGenerated: ['Capacity analysis', 'Scaling playbook update'],
    rootCauseDocumented: true,
  },
];

const MOCK_POLICY_VIOLATIONS: PolicyViolation[] = [
  {
    id: 'pv-001',
    type: 'change-no-approval',
    description: 'Model parameter change deployed without CAB approval',
    timestamp: '2026-08-11T08:15:00Z',
    owner: 'DevOps Team',
    agentOrSystem: 'risk-scoring-agent',
    remediationStatus: 'in-progress',
    frameworksImpacted: ['SR 26-2', 'ISO 42001'],
    daysOpen: 0,
  },
  {
    id: 'pv-002',
    type: 'sla-breach',
    description: 'SLA breach without required stakeholder notification',
    timestamp: '2026-08-10T16:30:00Z',
    owner: 'SRE Team',
    agentOrSystem: 'kyc-verification',
    remediationStatus: 'resolved',
    frameworksImpacted: ['OSFI E-23'],
    daysOpen: 1,
  },
  {
    id: 'pv-003',
    type: 'runbook-skip',
    description: 'Incident response runbook not followed during recovery',
    timestamp: '2026-08-09T11:20:00Z',
    owner: 'Platform Team',
    agentOrSystem: 'trading-assistant',
    remediationStatus: 'open',
    frameworksImpacted: ['NIST AI RMF', 'CRI FS AI'],
    daysOpen: 2,
  },
  {
    id: 'pv-004',
    type: 'escalation-bypass',
    description: 'Critical alert acknowledged without manager escalation',
    timestamp: '2026-08-08T22:45:00Z',
    owner: 'Night Shift',
    agentOrSystem: 'fraud-detection',
    remediationStatus: 'accepted-risk',
    frameworksImpacted: ['SR 26-2'],
    daysOpen: 3,
  },
];

const MOCK_CHANGE_COMPLIANCE: ChangeComplianceRecord[] = [
  {
    id: 'cc-001',
    changeId: 'CHG-2026-0892',
    title: 'Update guardrail thresholds for trading-assistant',
    requestedBy: 'Sarah Chen',
    reviewRequired: true,
    preDeploymentCheck: 'pass',
    postDeploymentVerification: 'pass',
    exceptionGranted: false,
    approvedBy: 'Mike Torres',
    timestamp: '2026-08-11T09:00:00Z',
    frameworksRelevant: ['NIST AI RMF', 'EU AI Act'],
  },
  {
    id: 'cc-002',
    changeId: 'CHG-2026-0891',
    title: 'Emergency patch for KYC timeout issue',
    requestedBy: 'DevOps Team',
    reviewRequired: true,
    preDeploymentCheck: 'waived',
    postDeploymentVerification: 'pass',
    exceptionGranted: true,
    exceptionReason: 'Emergency change - production incident mitigation',
    approvedBy: 'CTO',
    timestamp: '2026-08-10T15:30:00Z',
    frameworksRelevant: ['SR 26-2', 'OSFI E-23'],
  },
  {
    id: 'cc-003',
    changeId: 'CHG-2026-0890',
    title: 'Add new compliance checks to fraud-detection',
    requestedBy: 'Compliance Team',
    reviewRequired: true,
    preDeploymentCheck: 'pass',
    postDeploymentVerification: 'pending',
    exceptionGranted: false,
    approvedBy: 'Risk Committee',
    timestamp: '2026-08-09T14:00:00Z',
    frameworksRelevant: ['CRI FS AI', 'NIST AI RMF'],
  },
  {
    id: 'cc-004',
    changeId: 'CHG-2026-0889',
    title: 'Parameter tuning for risk-scoring model',
    requestedBy: 'ML Team',
    reviewRequired: false,
    preDeploymentCheck: 'fail',
    postDeploymentVerification: 'not-required',
    exceptionGranted: false,
    timestamp: '2026-08-08T11:00:00Z',
    frameworksRelevant: ['SR 26-2'],
  },
];

const MOCK_EVIDENCE: EvidenceItem[] = [
  {
    id: 'ev-001',
    category: 'incident-response',
    title: 'Incident Response Logs (Q3 2026)',
    description: 'Complete incident response documentation for all Sev 1-2 incidents',
    generatedAt: '2026-08-01T00:00:00Z',
    status: 'current',
    frameworksCovered: ['NIST AI RMF', 'EU AI Act', 'ISO 42001'],
    lastVerified: '2026-08-10',
    source: 'PagerDuty + Confluence',
  },
  {
    id: 'ev-002',
    category: 'change-management',
    title: 'Change Advisory Board Records',
    description: 'CAB meeting minutes and change approval records',
    generatedAt: '2026-07-15T00:00:00Z',
    status: 'current',
    frameworksCovered: ['SR 26-2', 'OSFI E-23', 'ISO 42001'],
    lastVerified: '2026-08-09',
    source: 'ServiceNow',
  },
  {
    id: 'ev-003',
    category: 'oncall-coverage',
    title: 'On-Call Coverage Report',
    description: '24/7 coverage verification with response time metrics',
    generatedAt: '2026-08-01T00:00:00Z',
    expiresAt: '2026-08-31T23:59:59Z',
    status: 'expiring-soon',
    frameworksCovered: ['NIST AI RMF', 'CRI FS AI'],
    lastVerified: '2026-08-05',
    source: 'PagerDuty',
  },
  {
    id: 'ev-004',
    category: 'sla-compliance',
    title: 'SLA Compliance Dashboard Export',
    description: 'Monthly SLA compliance metrics across all production agents',
    generatedAt: '2026-08-01T00:00:00Z',
    status: 'current',
    frameworksCovered: ['SR 26-2', 'OSFI E-23'],
    lastVerified: '2026-08-11',
    source: 'CloudWatch + Datadog',
  },
  {
    id: 'ev-005',
    category: 'runbook-execution',
    title: 'Runbook Execution Audit Trail',
    description: 'Automated runbook execution logs with outcomes',
    generatedAt: '2026-07-01T00:00:00Z',
    status: 'missing',
    frameworksCovered: ['NIST AI RMF', 'ISO 42001'],
    lastVerified: '2026-07-15',
    source: 'AWS Systems Manager',
  },
];

const MOCK_UPCOMING_AUDITS: UpcomingAudit[] = [
  {
    id: 'audit-001',
    name: 'OCC Model Risk Review',
    framework: 'SR 26-2',
    scheduledDate: '2026-08-25',
    prepStatus: 'in-progress',
    requiredEvidence: [
      { item: 'Model inventory with risk ratings', status: 'ready' },
      { item: 'Ongoing monitoring reports', status: 'in-progress' },
      { item: 'Incident response documentation', status: 'ready' },
      { item: 'Third-party oversight evidence', status: 'missing' },
    ],
    owner: 'Sarah Chen',
    scope: ['trading-assistant', 'risk-scoring-agent', 'fraud-detection'],
  },
  {
    id: 'audit-002',
    name: 'Internal AI Governance Audit',
    framework: 'NIST AI RMF',
    scheduledDate: '2026-09-05',
    prepStatus: 'in-progress',
    requiredEvidence: [
      { item: 'AI risk management framework documentation', status: 'ready' },
      { item: 'Bias testing results', status: 'ready' },
      { item: 'Human oversight procedures', status: 'in-progress' },
      { item: 'Change management records', status: 'ready' },
    ],
    owner: 'Mike Torres',
    scope: ['All production agents'],
  },
  {
    id: 'audit-003',
    name: 'OSFI Technology Risk Assessment',
    framework: 'OSFI E-23',
    scheduledDate: '2026-09-20',
    prepStatus: 'not-started',
    requiredEvidence: [
      { item: 'Technology risk inventory', status: 'missing' },
      { item: 'Third-party due diligence', status: 'missing' },
      { item: 'Operational resilience testing', status: 'missing' },
    ],
    owner: 'Compliance Team',
    scope: ['kyc-verification', 'fraud-detection'],
  },
];

// ============================================================================
// Helper Components & Utilities
// ============================================================================

const REMEDIATION_COLORS: Record<RemediationStatus, { bg: string; text: string }> = {
  open: { bg: 'bg-rose-100', text: 'text-rose-700' },
  'in-progress': { bg: 'bg-amber-100', text: 'text-amber-700' },
  resolved: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  'accepted-risk': { bg: 'bg-slate-100', text: 'text-slate-600' },
};

const VIOLATION_TYPE_CONFIG: Record<ViolationType, { label: string; icon: IconName }> = {
  'change-no-approval': { label: 'Change Without Approval', icon: 'x-circle' },
  'sla-breach': { label: 'SLA Breach', icon: 'clock' },
  'runbook-skip': { label: 'Runbook Not Followed', icon: 'document-text' },
  'escalation-bypass': { label: 'Escalation Bypassed', icon: 'arrow-up-circle' },
  'evidence-gap': { label: 'Evidence Gap', icon: 'folder' },
};

const EVIDENCE_CATEGORY_CONFIG: Record<EvidenceCategory, { label: string; icon: IconName }> = {
  'incident-response': { label: 'Incident Response', icon: 'exclamation-triangle' },
  'change-management': { label: 'Change Management', icon: 'arrows-right-left' },
  'oncall-coverage': { label: 'On-Call Coverage', icon: 'phone' },
  'sla-compliance': { label: 'SLA Compliance', icon: 'check-badge' },
  'runbook-execution': { label: 'Runbook Execution', icon: 'document-text' },
};

const AUDIT_PREP_COLORS: Record<AuditPrepStatus, { bg: string; text: string }> = {
  'not-started': { bg: 'bg-slate-100', text: 'text-slate-600' },
  'in-progress': { bg: 'bg-amber-100', text: 'text-amber-700' },
  ready: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  overdue: { bg: 'bg-rose-100', text: 'text-rose-700' },
};

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
};

function timeSince(isoString: string): string {
  const mins = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ============================================================================
// Main Component
// ============================================================================

export default function OpsCompliance() {
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'matrix' | 'incidents' | 'violations' | 'changes' | 'evidence' | 'audits'>('matrix');

  // Live data hooks
  const { loading: complianceLoading, mapping: liveMapping, live: isComplianceLive } = useComplianceMapping();

  // Use live data if available, otherwise fall back to mock
  const evidenceItems = liveMapping?.evidence ?? MOCK_EVIDENCE;
  const baseKpiData = liveMapping?.kpis ?? MOCK_KPI_DATA;
  const isLive = isComplianceLive;
  const isLoading = complianceLoading;

  // Calculate evidence gap analysis
  const evidenceGapAnalysis = useMemo(() => {
    const total = evidenceItems.length;
    const current = evidenceItems.filter(e => e.status === 'current').length;
    const expiringSoon = evidenceItems.filter(e => e.status === 'expiring-soon').length;
    const missing = evidenceItems.filter(e => e.status === 'missing').length;
    return { total, current, expiringSoon, missing };
  }, [evidenceItems]);

  // KPIs that also appear as drill-down tables are derived from the SAME source
  // data those tables render, so the summary row can never contradict the detail
  // (e.g. "Change Compliance" reflects the actual pre-deploy pass rate of the
  // records shown, and "Evidence Gaps" reflects the gap analysis above).
  const kpiData = useMemo(() => {
    const changesReviewed = MOCK_CHANGE_COMPLIANCE.length;
    const changesPassed = MOCK_CHANGE_COMPLIANCE.filter(c => c.preDeploymentCheck === 'pass').length;
    return {
      ...baseKpiData,
      incidentsWithComplianceImpact: MOCK_INCIDENT_COMPLIANCE.length,
      changeCompliancePct: changesReviewed > 0 ? Math.round((changesPassed / changesReviewed) * 1000) / 10 : 0,
      evidenceGaps: evidenceGapAnalysis.missing + evidenceGapAnalysis.expiringSoon,
    };
  }, [baseKpiData, evidenceGapAnalysis]);

  return (
    <div className="space-y-6">
      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Icon name="spinner" className="w-6 h-6 text-indigo-600 animate-spin" />
          <span className="ml-2 text-sm text-slate-600">Loading compliance data...</span>
        </div>
      )}

      {!isLoading && (
      <>
      <div className="flex items-center gap-2 mb-6">
        <CoreBadge pillar="show" compact />
        {isLive ? <LiveDataBadge source="GRC Systems" /> : <MockDataBadge integration="Connect Audit + GRC Systems" />}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Compliance Score"
          value={`${kpiData.complianceScore}%`}
          sub="ops-weighted"
          trend={{
            value: `${Math.abs(kpiData.complianceScoreTrend)}%`,
            direction: kpiData.complianceScoreTrend >= 0 ? 'up' : 'down',
            isPositive: kpiData.complianceScoreTrend >= 0,
          }}
          variant={kpiData.complianceScore >= 90 ? 'success' : kpiData.complianceScore >= 80 ? 'warning' : 'danger'}
        />
        <StatCard
          label="Policy Violations"
          value={kpiData.policyViolationsFromOps.toString()}
          sub="from ops events"
          variant={kpiData.policyViolationsFromOps > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Compliance Incidents"
          value={kpiData.incidentsWithComplianceImpact.toString()}
          sub="with framework impact"
          variant={kpiData.incidentsWithComplianceImpact > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Audit Findings"
          value={kpiData.auditFindingsOpen.toString()}
          sub="open"
          variant={kpiData.auditFindingsOpen > 2 ? 'danger' : kpiData.auditFindingsOpen > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Change Compliance"
          value={`${kpiData.changeCompliancePct}%`}
          sub="pre-deployment pass"
          variant={kpiData.changeCompliancePct >= 95 ? 'success' : kpiData.changeCompliancePct >= 90 ? 'warning' : 'danger'}
        />
        <StatCard
          label="Evidence Gaps"
          value={kpiData.evidenceGaps.toString()}
          sub="items missing/expiring"
          variant={kpiData.evidenceGaps > 3 ? 'danger' : kpiData.evidenceGaps > 0 ? 'warning' : 'success'}
        />
      </div>

      {/* Section Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1">
          {[
            { id: 'matrix', label: 'Framework Impact' },
            { id: 'incidents', label: 'Incident Mapping' },
            { id: 'violations', label: 'Policy Violations' },
            { id: 'changes', label: 'Change Compliance' },
            { id: 'evidence', label: 'Evidence Dashboard' },
            { id: 'audits', label: 'Upcoming Audits' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as typeof activeSection)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeSection === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section Content */}
      {activeSection === 'matrix' && (
        <FrameworkImpactMatrix
          frameworks={MOCK_FRAMEWORK_IMPACT}
          selectedFramework={selectedFramework}
          onSelectFramework={setSelectedFramework}
        />
      )}
      {activeSection === 'incidents' && (
        <IncidentComplianceMapping incidents={MOCK_INCIDENT_COMPLIANCE} />
      )}
      {activeSection === 'violations' && (
        <PolicyViolationsList violations={MOCK_POLICY_VIOLATIONS} />
      )}
      {activeSection === 'changes' && (
        <ChangeComplianceSection changes={MOCK_CHANGE_COMPLIANCE} />
      )}
      {activeSection === 'evidence' && (
        <EvidenceDashboard evidence={MOCK_EVIDENCE} gapAnalysis={evidenceGapAnalysis} />
      )}
      {activeSection === 'audits' && (
        <UpcomingAuditsList audits={MOCK_UPCOMING_AUDITS} />
      )}
      </>
      )}
    </div>
  );
}

// ============================================================================
// Framework Impact Matrix
// ============================================================================

function FrameworkImpactMatrix({
  frameworks,
  selectedFramework,
  onSelectFramework,
}: {
  frameworks: FrameworkOpsImpact[];
  selectedFramework: string | null;
  onSelectFramework: (id: string | null) => void;
}) {
  const selected = selectedFramework ? frameworks.find(f => f.id === selectedFramework) : null;

  return (
    <div className="space-y-4">
      {/* Matrix Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Framework Impact Matrix</h3>
          <p className="text-xs text-slate-500 mt-0.5">Compliance status of ops-related controls by framework</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                <th className="text-left py-2.5 px-4 font-medium">Framework</th>
                <th className="text-center py-2.5 px-4 font-medium">Ops Controls</th>
                <th className="text-center py-2.5 px-4 font-medium">Compliant</th>
                <th className="text-center py-2.5 px-4 font-medium">At Risk</th>
                <th className="text-center py-2.5 px-4 font-medium">Non-Compliant</th>
                <th className="text-left py-2.5 px-4 font-medium">Last Assessed</th>
                <th className="text-right py-2.5 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {frameworks.map((framework) => {
                return (
                  <tr
                    key={framework.id}
                    className={`border-t border-slate-100 hover:bg-slate-50/50 transition-colors cursor-pointer ${
                      selectedFramework === framework.id ? 'bg-indigo-50/50' : ''
                    }`}
                    onClick={() => onSelectFramework(selectedFramework === framework.id ? null : framework.id)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{framework.shortName}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[200px]">{framework.name}</div>
                    </td>
                    <td className="py-3 px-4 text-center font-medium text-slate-700">{framework.opsRelatedControls}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-xs font-medium">
                        {framework.compliant}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                        framework.atRisk > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {framework.atRisk}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                        framework.nonCompliant > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {framework.nonCompliant}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-xs">{framework.lastAssessed}</td>
                    <td className="py-3 px-4 text-right">
                      <button className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                        View Controls
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Framework Details */}
      {selected && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-indigo-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-900">{selected.name} - Critical Ops Controls</h4>
            <button
              onClick={() => onSelectFramework(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
          </div>
          <div className="space-y-2">
            {selected.criticalControls.map((control, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100"
              >
                <Icon name="shield-check" className="w-4 h-4 text-indigo-500" />
                <span className="text-sm text-slate-700">{control}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Incident → Compliance Mapping
// ============================================================================

function IncidentComplianceMapping({ incidents }: { incidents: IncidentComplianceImpact[] }) {
  const [expandedIncident, setExpandedIncident] = useState<string | null>(null);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">Incident to Compliance Mapping</h3>
        <p className="text-xs text-slate-500 mt-0.5">Recent incidents with compliance framework impact assessment</p>
      </div>
      <div className="divide-y divide-slate-100">
        {incidents.map((incident) => (
          <div key={incident.id} className="p-4">
            <div
              className="flex items-start justify-between cursor-pointer"
              onClick={() => setExpandedIncident(expandedIncident === incident.id ? null : incident.id)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-slate-500">{incident.incidentId}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded uppercase ${
                    SEVERITY_COLORS[incident.severity].bg
                  } ${SEVERITY_COLORS[incident.severity].text}`}>
                    {incident.severity}
                  </span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                    REMEDIATION_COLORS[incident.remediationStatus].bg
                  } ${REMEDIATION_COLORS[incident.remediationStatus].text}`}>
                    {incident.remediationStatus.replace('-', ' ')}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-900">{incident.title}</p>
                <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                  <span>{timeSince(incident.occurredAt)}</span>
                  <span className="flex items-center gap-1">
                    <Icon name="folder" className="w-3 h-3" />
                    {incident.frameworksAffected.length} frameworks affected
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="document-text" className="w-3 h-3" />
                    {incident.evidenceGenerated.length} evidence items
                  </span>
                </div>
              </div>
              <Icon
                name={expandedIncident === incident.id ? 'chevron-up' : 'chevron-down'}
                className="w-4 h-4 text-slate-400"
              />
            </div>

            {expandedIncident === incident.id && (
              <div className="mt-4 space-y-4">
                {/* Frameworks Affected */}
                <div>
                  <h5 className="text-xs font-medium text-slate-700 mb-2">Frameworks &amp; Controls Affected</h5>
                  <div className="space-y-2">
                    {incident.frameworksAffected.map((fa, idx) => (
                      <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50">
                        <Icon name="shield-exclamation" className="w-4 h-4 text-amber-500 mt-0.5" />
                        <div>
                          <div className="text-sm font-medium text-slate-900">{fa.framework}</div>
                          <div className="text-xs text-slate-500">{fa.controls.join(', ')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Evidence Generated */}
                <div>
                  <h5 className="text-xs font-medium text-slate-700 mb-2">Evidence Generated</h5>
                  <div className="flex flex-wrap gap-2">
                    {incident.evidenceGenerated.map((ev, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-700"
                      >
                        <Icon name="check" className="w-3 h-3" />
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Root Cause Status */}
                <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
                  <Icon
                    name={incident.rootCauseDocumented ? 'check-circle' : 'x-circle'}
                    className={`w-4 h-4 ${incident.rootCauseDocumented ? 'text-emerald-500' : 'text-rose-500'}`}
                  />
                  <span className="text-xs text-slate-600">
                    Root cause {incident.rootCauseDocumented ? 'documented' : 'not yet documented'}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Policy Violations List
// ============================================================================

function PolicyViolationsList({ violations }: { violations: PolicyViolation[] }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Operational Policy Violations</h3>
          <p className="text-xs text-slate-500 mt-0.5">Ops events that violated governance policies</p>
        </div>
        <div className="flex gap-2">
          <span className="text-xs text-slate-500">
            {violations.filter(v => v.remediationStatus === 'open').length} open
          </span>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {violations.map((violation) => {
          const typeConfig = VIOLATION_TYPE_CONFIG[violation.type];
          return (
            <div key={violation.id} className="p-4 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${
                  violation.remediationStatus === 'open' ? 'bg-rose-100' :
                  violation.remediationStatus === 'in-progress' ? 'bg-amber-100' : 'bg-slate-100'
                }`}>
                  <Icon
                    name={typeConfig.icon}
                    className={`w-4 h-4 ${
                      violation.remediationStatus === 'open' ? 'text-rose-600' :
                      violation.remediationStatus === 'in-progress' ? 'text-amber-600' : 'text-slate-500'
                    }`}
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-slate-500">{typeConfig.label}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                      REMEDIATION_COLORS[violation.remediationStatus].bg
                    } ${REMEDIATION_COLORS[violation.remediationStatus].text}`}>
                      {violation.remediationStatus.replace('-', ' ')}
                    </span>
                    {violation.daysOpen > 0 && (
                      <span className="text-[10px] text-slate-400">{violation.daysOpen}d open</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-900">{violation.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Icon name="user" className="w-3 h-3" />
                      {violation.owner}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="cube" className="w-3 h-3" />
                      {violation.agentOrSystem}
                    </span>
                    <span>{timeSince(violation.timestamp)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {violation.frameworksImpacted.map((fw, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                      >
                        {fw}
                      </span>
                    ))}
                  </div>
                </div>
                <button className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                  Review
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Change Compliance Section
// ============================================================================

function ChangeComplianceSection({ changes }: { changes: ChangeComplianceRecord[] }) {
  const CHECK_STATUS_COLORS: Record<string, { bg: string; text: string; icon: IconName }> = {
    pass: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'check' },
    fail: { bg: 'bg-rose-100', text: 'text-rose-700', icon: 'x-mark' },
    waived: { bg: 'bg-amber-100', text: 'text-amber-700', icon: 'arrow-path' },
    pending: { bg: 'bg-slate-100', text: 'text-slate-500', icon: 'clock' },
    'not-required': { bg: 'bg-slate-50', text: 'text-slate-400', icon: 'circle' },
  };

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">
            {changes.filter(c => c.preDeploymentCheck === 'pass').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Pre-Deploy Pass</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">
            {changes.filter(c => c.preDeploymentCheck === 'waived').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Waived</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-rose-600">
            {changes.filter(c => c.preDeploymentCheck === 'fail').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Pre-Deploy Fail</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-indigo-600">
            {changes.filter(c => c.exceptionGranted).length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Exceptions</div>
        </div>
      </div>

      {/* Changes Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Change Compliance Records</h3>
          <p className="text-xs text-slate-500 mt-0.5">Changes requiring compliance review with pre/post deployment checks</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                <th className="text-left py-2.5 px-4 font-medium">Change</th>
                <th className="text-left py-2.5 px-4 font-medium">Requested By</th>
                <th className="text-center py-2.5 px-4 font-medium">Pre-Deploy</th>
                <th className="text-center py-2.5 px-4 font-medium">Post-Deploy</th>
                <th className="text-center py-2.5 px-4 font-medium">Exception</th>
                <th className="text-left py-2.5 px-4 font-medium">Frameworks</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="py-3 px-4">
                    <div className="text-xs font-mono text-slate-500">{change.changeId}</div>
                    <div className="text-sm font-medium text-slate-900 truncate max-w-[250px]">{change.title}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{change.requestedBy}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                      CHECK_STATUS_COLORS[change.preDeploymentCheck].bg
                    } ${CHECK_STATUS_COLORS[change.preDeploymentCheck].text}`}>
                      <Icon name={CHECK_STATUS_COLORS[change.preDeploymentCheck].icon} className="w-3 h-3" />
                      {change.preDeploymentCheck}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                      CHECK_STATUS_COLORS[change.postDeploymentVerification].bg
                    } ${CHECK_STATUS_COLORS[change.postDeploymentVerification].text}`}>
                      <Icon name={CHECK_STATUS_COLORS[change.postDeploymentVerification].icon} className="w-3 h-3" />
                      {change.postDeploymentVerification.replace('-', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {change.exceptionGranted ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">
                        <Icon name="shield-exclamation" className="w-3 h-3" />
                        Yes
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {change.frameworksRelevant.map((fw, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                        >
                          {fw}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Evidence Dashboard
// ============================================================================

function EvidenceDashboard({
  evidence,
  gapAnalysis,
}: {
  evidence: EvidenceItem[];
  gapAnalysis: { total: number; current: number; expiringSoon: number; missing: number };
}) {
  const EVIDENCE_STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; label: string }> = {
    current: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Current' },
    'expiring-soon': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Expiring Soon' },
    expired: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: 'Expired' },
    missing: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: 'Missing' },
  };

  return (
    <div className="space-y-4">
      {/* Gap Analysis Summary */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Evidence Gap Analysis</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-2xl font-bold text-slate-700">{gapAnalysis.total}</div>
            <div className="text-xs text-slate-500 mt-1">Total Items</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <div className="text-2xl font-bold text-emerald-600">{gapAnalysis.current}</div>
            <div className="text-xs text-emerald-700 mt-1">Current</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-amber-50 border border-amber-200">
            <div className="text-2xl font-bold text-amber-600">{gapAnalysis.expiringSoon}</div>
            <div className="text-xs text-amber-700 mt-1">Expiring Soon</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-rose-50 border border-rose-200">
            <div className="text-2xl font-bold text-rose-600">{gapAnalysis.missing}</div>
            <div className="text-xs text-rose-700 mt-1">Missing</div>
          </div>
        </div>
      </div>

      {/* Evidence List by Category */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Operational Evidence for Auditors</h3>
          <p className="text-xs text-slate-500 mt-0.5">Evidence artifacts from operational processes</p>
        </div>
        <div className="divide-y divide-slate-100">
          {evidence.map((item) => {
            const categoryConfig = EVIDENCE_CATEGORY_CONFIG[item.category];
            const statusConfig = EVIDENCE_STATUS_CONFIG[item.status];
            return (
              <div key={item.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${statusConfig.bg} border ${statusConfig.border}`}>
                    <Icon name={categoryConfig.icon} className={`w-4 h-4 ${statusConfig.text}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-slate-500">{categoryConfig.label}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border}`}>
                        {statusConfig.label}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Icon name="clock" className="w-3 h-3" />
                        Verified: {item.lastVerified}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="server-stack" className="w-3 h-3" />
                        {item.source}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.frameworksCovered.map((fw, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100"
                        >
                          {fw}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                    View
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Upcoming Audits List
// ============================================================================

function UpcomingAuditsList({ audits }: { audits: UpcomingAudit[] }) {
  return (
    <div className="space-y-4">
      {audits.map((audit) => {
        const prepConfig = AUDIT_PREP_COLORS[audit.prepStatus];
        // Derive days-until from the scheduled date vs now instead of a hardcoded
        // value, so a past scheduledDate honestly reads as overdue.
        const daysUntil = Math.ceil((new Date(audit.scheduledDate).getTime() - Date.now()) / 86400000);
        const isPast = daysUntil < 0;
        const readyCount = audit.requiredEvidence.filter(e => e.status === 'ready').length;
        const totalCount = audit.requiredEvidence.length;
        const progressPct = totalCount > 0 ? (readyCount / totalCount) * 100 : 0;

        return (
          <div
            key={audit.id}
            className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-semibold text-slate-900">{audit.name}</h4>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${prepConfig.bg} ${prepConfig.text}`}>
                    {audit.prepStatus.replace('-', ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Icon name="document-check" className="w-3 h-3" />
                    {audit.framework}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="calendar" className="w-3 h-3" />
                    {audit.scheduledDate}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="user" className="w-3 h-3" />
                    {audit.owner}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${
                  isPast || daysUntil <= 7 ? 'text-rose-600' :
                  daysUntil <= 14 ? 'text-amber-600' : 'text-slate-700'
                }`}>
                  {Math.abs(daysUntil)}d
                </div>
                <div className="text-[10px] text-slate-500">{isPast ? 'overdue' : 'until audit'}</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Evidence Readiness</span>
                <span>{readyCount}/{totalCount} ready</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    progressPct >= 75 ? 'bg-emerald-500' :
                    progressPct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Evidence Checklist */}
            <div className="space-y-2">
              <h5 className="text-xs font-medium text-slate-700">Required Evidence</h5>
              <div className="grid grid-cols-2 gap-2">
                {audit.requiredEvidence.map((ev, idx) => {
                  const statusColors: Record<string, { bg: string; text: string; icon: IconName }> = {
                    ready: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'check' },
                    'in-progress': { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'clock' },
                    missing: { bg: 'bg-rose-50', text: 'text-rose-700', icon: 'x-mark' },
                  };
                  const sc = statusColors[ev.status];
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 p-2 rounded-lg ${sc.bg} border border-slate-100`}
                    >
                      <Icon name={sc.icon} className={`w-3 h-3 ${sc.text}`} />
                      <span className={`text-xs ${sc.text} truncate`}>{ev.item}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scope */}
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-medium">Scope:</span>
                <div className="flex flex-wrap gap-1">
                  {audit.scope.map((s, idx) => (
                    <span key={idx} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
