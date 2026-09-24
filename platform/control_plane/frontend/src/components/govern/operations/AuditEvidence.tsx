/**
 * AuditEvidence - Audit Evidence Collection and Management System
 *
 * Comprehensive evidence management for operational audits in FSI environments.
 * Supports multiple evidence categories, auto-collection rules, gap analysis,
 * and audit package generation for common compliance frameworks.
 *
 * Key capabilities:
 * - KPI dashboard with evidence metrics
 * - Evidence categories (Incident, Change, Access, Availability, Capacity, On-Call)
 * - Searchable evidence library with filtering
 * - Auto-collection rules from source systems
 * - Gap analysis with remediation guidance
 * - Audit package generation (SOC2, PCI-DSS, etc.)
 * - Attestation workflow with delegation
 */

import { useState, useMemo, useCallback } from 'react';
import StatCard from '../StatCard';
import { Icon, type IconName } from '../icons';
import { MockDataBadge, LiveDataBadge } from '../DataSourceIndicator';
import { usePersistedState } from '../usePersistedState';
import { useAuditEvidence, useEvidenceGaps, useAuditPackages } from './useOpsLiveData';

// ─────────────────────────── Types ───────────────────────────

type EvidenceStatus = 'collected' | 'pending' | 'missing' | 'expired' | 'attested';
type EvidenceCategory = 'incident' | 'change' | 'access' | 'availability' | 'capacity' | 'oncall';
type AttestationStatus = 'pending' | 'approved' | 'rejected' | 'delegated';

interface EvidenceItem {
  id: string;
  type: string;
  category: EvidenceCategory;
  description: string;
  source: string;
  sourceSystem: string;
  timestamp: string;
  framework: string[];
  controlId: string;
  status: EvidenceStatus;
  autoCollected: boolean;
  attachments: string[];
  relatedItems: string[];
  attestation?: {
    status: AttestationStatus;
    attestedBy?: string;
    attestedAt?: string;
    delegatedTo?: string;
    comments?: string;
  };
}

// Category summary interface for computed category stats
// interface EvidenceCategorySummary {
//   id: EvidenceCategory;
//   name: string;
//   description: string;
//   icon: IconName;
//   items: EvidenceItem[];
// }

interface AutoCollectionRule {
  id: string;
  name: string;
  category: EvidenceCategory;
  sourceSystem: string;
  frequency: string;
  lastCollection: string;
  nextCollection: string;
  enabled: boolean;
  evidenceType: string;
  mapping: string;
}

interface GapItem {
  framework: string;
  controlId: string;
  controlName: string;
  requiredEvidence: string;
  status: 'collected' | 'partial' | 'missing';
  priority: 'critical' | 'high' | 'medium' | 'low';
  remediation: string;
}

interface AuditPackage {
  id: string;
  name: string;
  framework: string;
  description: string;
  itemCount: number;
  lastGenerated: string;
  generatedBy: string;
  exportFormats: string[];
  status: 'ready' | 'generating' | 'incomplete';
}

// ─────────────────────────── Constants ───────────────────────────

const STATUS_CONFIG: Record<EvidenceStatus, { label: string; color: string; bgColor: string }> = {
  collected: { label: 'Collected', color: '#10b981', bgColor: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  pending: { label: 'Pending', color: '#f59e0b', bgColor: 'bg-amber-50 border-amber-200 text-amber-700' },
  missing: { label: 'Missing', color: '#ef4444', bgColor: 'bg-rose-50 border-rose-200 text-rose-700' },
  expired: { label: 'Expired', color: '#6b7280', bgColor: 'bg-slate-100 border-slate-200 text-slate-600' },
  attested: { label: 'Attested', color: '#8b5cf6', bgColor: 'bg-violet-50 border-violet-200 text-violet-700' },
};

const CATEGORY_CONFIG: Record<EvidenceCategory, { name: string; icon: IconName; description: string }> = {
  incident: { name: 'Incident Management', icon: 'exclamation-triangle', description: 'Incident logs, response times, postmortems' },
  change: { name: 'Change Management', icon: 'arrow-path', description: 'Change logs, approvals, rollbacks' },
  access: { name: 'Access Control', icon: 'finger-print', description: 'Access logs, privilege escalations' },
  availability: { name: 'Availability', icon: 'chart-bar', description: 'Uptime records, SLA compliance' },
  capacity: { name: 'Capacity Management', icon: 'server-stack', description: 'Quota usage, scaling events' },
  oncall: { name: 'On-Call', icon: 'phone', description: 'Coverage records, response times' },
};

// ─────────────────────────── Mock Data ───────────────────────────

const MOCK_EVIDENCE: EvidenceItem[] = [
  // Incident Management Evidence
  {
    id: 'EV-001',
    type: 'Incident Report',
    category: 'incident',
    description: 'Production outage - Agent orchestration service unavailable for 12 minutes',
    source: 'PagerDuty',
    sourceSystem: 'pagerduty',
    timestamp: '2026-08-09T14:23:00Z',
    framework: ['SOC2', 'ISO 27001'],
    controlId: 'IR-4',
    status: 'attested',
    autoCollected: true,
    attachments: ['incident_report_001.pdf', 'root_cause_analysis.docx'],
    relatedItems: ['EV-015', 'EV-022'],
    attestation: {
      status: 'approved',
      attestedBy: 'Sarah Chen',
      attestedAt: '2026-08-10T09:15:00Z',
    },
  },
  {
    id: 'EV-002',
    type: 'Postmortem Document',
    category: 'incident',
    description: 'Postmortem: Database connection pool exhaustion incident',
    source: 'Confluence',
    sourceSystem: 'confluence',
    timestamp: '2026-08-08T16:45:00Z',
    framework: ['SOC2', 'NIST CSF'],
    controlId: 'IR-6',
    status: 'collected',
    autoCollected: false,
    attachments: ['postmortem_db_connection.pdf'],
    relatedItems: ['EV-001'],
  },
  {
    id: 'EV-003',
    type: 'MTTR Report',
    category: 'incident',
    description: 'Monthly MTTR metrics - July 2026',
    source: 'CloudWatch',
    sourceSystem: 'cloudwatch',
    timestamp: '2026-08-01T00:00:00Z',
    framework: ['SOC2'],
    controlId: 'IR-5',
    status: 'collected',
    autoCollected: true,
    attachments: ['mttr_july_2026.pdf'],
    relatedItems: [],
  },
  // Change Management Evidence
  {
    id: 'EV-004',
    type: 'Change Request',
    category: 'change',
    description: 'CR-2026-0847: Deploy updated guardrail configuration for PII detection',
    source: 'ServiceNow',
    sourceSystem: 'servicenow',
    timestamp: '2026-08-07T11:30:00Z',
    framework: ['SOC2', 'PCI-DSS'],
    controlId: 'CM-3',
    status: 'attested',
    autoCollected: true,
    attachments: ['change_request_0847.pdf', 'approval_chain.pdf'],
    relatedItems: ['EV-005'],
    attestation: {
      status: 'approved',
      attestedBy: 'Michael Torres',
      attestedAt: '2026-08-08T14:00:00Z',
    },
  },
  {
    id: 'EV-005',
    type: 'Rollback Record',
    category: 'change',
    description: 'Rollback executed for CR-2026-0842 due to performance regression',
    source: 'GitHub Actions',
    sourceSystem: 'github',
    timestamp: '2026-08-05T22:15:00Z',
    framework: ['SOC2'],
    controlId: 'CM-5',
    status: 'collected',
    autoCollected: true,
    attachments: ['rollback_log.txt', 'deployment_history.json'],
    relatedItems: [],
  },
  {
    id: 'EV-006',
    type: 'CAB Meeting Minutes',
    category: 'change',
    description: 'Change Advisory Board meeting - August 2026 Week 1',
    source: 'SharePoint',
    sourceSystem: 'sharepoint',
    timestamp: '2026-08-06T15:00:00Z',
    framework: ['ISO 27001', 'SOC2'],
    controlId: 'CM-1',
    status: 'pending',
    autoCollected: false,
    attachments: [],
    relatedItems: [],
    attestation: {
      status: 'pending',
    },
  },
  // Access Control Evidence
  {
    id: 'EV-007',
    type: 'Access Review Report',
    category: 'access',
    description: 'Quarterly privileged access review - Q3 2026',
    source: 'IAM Identity Center',
    sourceSystem: 'iam',
    timestamp: '2026-07-31T00:00:00Z',
    framework: ['SOC2', 'PCI-DSS', 'FFIEC'],
    controlId: 'AC-2',
    status: 'attested',
    autoCollected: true,
    attachments: ['access_review_q3_2026.xlsx', 'remediation_actions.pdf'],
    relatedItems: [],
    attestation: {
      status: 'approved',
      attestedBy: 'Jennifer Wu',
      attestedAt: '2026-08-02T10:30:00Z',
    },
  },
  {
    id: 'EV-008',
    type: 'Privilege Escalation Log',
    category: 'access',
    description: 'Emergency production access granted - Incident INC-0892',
    source: 'AWS CloudTrail',
    sourceSystem: 'cloudtrail',
    timestamp: '2026-08-09T14:25:00Z',
    framework: ['SOC2', 'ISO 27001'],
    controlId: 'AC-6',
    status: 'collected',
    autoCollected: true,
    attachments: ['cloudtrail_events.json', 'access_justification.pdf'],
    relatedItems: ['EV-001'],
  },
  {
    id: 'EV-009',
    type: 'User Access Matrix',
    category: 'access',
    description: 'Role-based access control matrix for AI agent operations',
    source: 'Internal Documentation',
    sourceSystem: 'manual',
    timestamp: '2026-08-01T00:00:00Z',
    framework: ['SOC2', 'NIST CSF'],
    controlId: 'AC-3',
    status: 'missing',
    autoCollected: false,
    attachments: [],
    relatedItems: [],
  },
  // Availability Evidence
  {
    id: 'EV-010',
    type: 'Uptime Report',
    category: 'availability',
    description: 'Monthly availability report - July 2026 (99.94% uptime)',
    source: 'Datadog',
    sourceSystem: 'datadog',
    timestamp: '2026-08-01T00:00:00Z',
    framework: ['SOC2', 'SLA'],
    controlId: 'AV-1',
    status: 'collected',
    autoCollected: true,
    attachments: ['uptime_report_july.pdf', 'sla_dashboard.png'],
    relatedItems: [],
  },
  {
    id: 'EV-011',
    type: 'SLA Compliance Report',
    category: 'availability',
    description: 'SLA compliance metrics for agent response times - Q3 2026',
    source: 'CloudWatch',
    sourceSystem: 'cloudwatch',
    timestamp: '2026-08-10T08:00:00Z',
    framework: ['SOC2', 'SLA'],
    controlId: 'AV-2',
    status: 'collected',
    autoCollected: true,
    attachments: ['sla_metrics_q3.xlsx'],
    relatedItems: [],
  },
  {
    id: 'EV-012',
    type: 'DR Test Results',
    category: 'availability',
    description: 'Disaster recovery drill results - August 2026',
    source: 'DR Coordinator',
    sourceSystem: 'manual',
    timestamp: '2026-08-03T06:00:00Z',
    framework: ['SOC2', 'ISO 22301', 'FFIEC'],
    controlId: 'CP-4',
    status: 'attested',
    autoCollected: false,
    attachments: ['dr_test_report.pdf', 'recovery_times.xlsx', 'lessons_learned.docx'],
    relatedItems: [],
    attestation: {
      status: 'approved',
      attestedBy: 'David Park',
      attestedAt: '2026-08-05T11:00:00Z',
    },
  },
  // Capacity Management Evidence
  {
    id: 'EV-013',
    type: 'Capacity Planning Report',
    category: 'capacity',
    description: 'Monthly capacity analysis - Agent compute resources',
    source: 'AWS Cost Explorer',
    sourceSystem: 'aws-cost',
    timestamp: '2026-08-01T00:00:00Z',
    framework: ['SOC2'],
    controlId: 'CP-2',
    status: 'collected',
    autoCollected: true,
    attachments: ['capacity_report_aug.pdf'],
    relatedItems: [],
  },
  {
    id: 'EV-014',
    type: 'Auto-scaling Event Log',
    category: 'capacity',
    description: 'Auto-scaling events for agent orchestration cluster - Week 32',
    source: 'AWS Auto Scaling',
    sourceSystem: 'aws-autoscaling',
    timestamp: '2026-08-10T00:00:00Z',
    framework: ['SOC2'],
    controlId: 'CP-3',
    status: 'collected',
    autoCollected: true,
    attachments: ['scaling_events.json'],
    relatedItems: [],
  },
  {
    id: 'EV-015',
    type: 'Quota Utilization Report',
    category: 'capacity',
    description: 'Service quota utilization - Bedrock model invocations',
    source: 'Service Quotas',
    sourceSystem: 'aws-quotas',
    timestamp: '2026-08-09T00:00:00Z',
    framework: ['SOC2'],
    controlId: 'CP-1',
    status: 'pending',
    autoCollected: true,
    attachments: [],
    relatedItems: [],
    attestation: {
      status: 'pending',
    },
  },
  // On-Call Evidence
  {
    id: 'EV-016',
    type: 'On-Call Schedule',
    category: 'oncall',
    description: 'On-call rotation schedule - August 2026',
    source: 'PagerDuty',
    sourceSystem: 'pagerduty',
    timestamp: '2026-08-01T00:00:00Z',
    framework: ['SOC2'],
    controlId: 'OC-1',
    status: 'collected',
    autoCollected: true,
    attachments: ['oncall_schedule_aug.pdf'],
    relatedItems: [],
  },
  {
    id: 'EV-017',
    type: 'Response Time Report',
    category: 'oncall',
    description: 'On-call response time metrics - July 2026',
    source: 'PagerDuty',
    sourceSystem: 'pagerduty',
    timestamp: '2026-08-01T00:00:00Z',
    framework: ['SOC2', 'SLA'],
    controlId: 'OC-2',
    status: 'collected',
    autoCollected: true,
    attachments: ['response_times_july.xlsx'],
    relatedItems: [],
  },
  {
    id: 'EV-018',
    type: 'Coverage Gap Report',
    category: 'oncall',
    description: 'Identified coverage gaps requiring immediate staffing',
    source: 'PagerDuty',
    sourceSystem: 'pagerduty',
    timestamp: '2026-08-10T06:00:00Z',
    framework: ['SOC2'],
    controlId: 'OC-3',
    status: 'missing',
    autoCollected: true,
    attachments: [],
    relatedItems: [],
  },
];

const MOCK_COLLECTION_RULES: AutoCollectionRule[] = [
  {
    id: 'rule-001',
    name: 'Incident Reports',
    category: 'incident',
    sourceSystem: 'PagerDuty',
    frequency: 'Real-time',
    lastCollection: '2026-08-11T10:15:00Z',
    nextCollection: 'Continuous',
    enabled: true,
    evidenceType: 'Incident Report',
    mapping: 'IR-4, IR-5, IR-6',
  },
  {
    id: 'rule-002',
    name: 'Change Requests',
    category: 'change',
    sourceSystem: 'ServiceNow',
    frequency: 'Hourly',
    lastCollection: '2026-08-11T10:00:00Z',
    nextCollection: '2026-08-11T11:00:00Z',
    enabled: true,
    evidenceType: 'Change Request',
    mapping: 'CM-3, CM-4, CM-5',
  },
  {
    id: 'rule-003',
    name: 'CloudTrail Access Logs',
    category: 'access',
    sourceSystem: 'AWS CloudTrail',
    frequency: 'Every 15 minutes',
    lastCollection: '2026-08-11T10:15:00Z',
    nextCollection: '2026-08-11T10:30:00Z',
    enabled: true,
    evidenceType: 'Access Log',
    mapping: 'AC-2, AC-6',
  },
  {
    id: 'rule-004',
    name: 'Uptime Metrics',
    category: 'availability',
    sourceSystem: 'CloudWatch',
    frequency: 'Daily',
    lastCollection: '2026-08-11T00:00:00Z',
    nextCollection: '2026-08-12T00:00:00Z',
    enabled: true,
    evidenceType: 'Uptime Report',
    mapping: 'AV-1, AV-2',
  },
  {
    id: 'rule-005',
    name: 'Scaling Events',
    category: 'capacity',
    sourceSystem: 'AWS Auto Scaling',
    frequency: 'Every 30 minutes',
    lastCollection: '2026-08-11T10:00:00Z',
    nextCollection: '2026-08-11T10:30:00Z',
    enabled: true,
    evidenceType: 'Auto-scaling Event Log',
    mapping: 'CP-2, CP-3',
  },
  {
    id: 'rule-006',
    name: 'On-Call Schedules',
    category: 'oncall',
    sourceSystem: 'PagerDuty',
    frequency: 'Daily',
    lastCollection: '2026-08-11T06:00:00Z',
    nextCollection: '2026-08-12T06:00:00Z',
    enabled: true,
    evidenceType: 'On-Call Schedule',
    mapping: 'OC-1, OC-2, OC-3',
  },
  {
    id: 'rule-007',
    name: 'GitHub Deployment Logs',
    category: 'change',
    sourceSystem: 'GitHub Actions',
    frequency: 'Real-time',
    lastCollection: '2026-08-11T10:12:00Z',
    nextCollection: 'Continuous',
    enabled: true,
    evidenceType: 'Deployment Record',
    mapping: 'CM-5',
  },
  {
    id: 'rule-008',
    name: 'IAM Access Reviews',
    category: 'access',
    sourceSystem: 'IAM Identity Center',
    frequency: 'Weekly',
    lastCollection: '2026-08-05T00:00:00Z',
    nextCollection: '2026-08-12T00:00:00Z',
    enabled: false,
    evidenceType: 'Access Review Report',
    mapping: 'AC-2',
  },
];

const MOCK_GAPS: GapItem[] = [
  {
    framework: 'SOC2',
    controlId: 'AC-3',
    controlName: 'Access Enforcement',
    requiredEvidence: 'User Access Matrix',
    status: 'missing',
    priority: 'critical',
    remediation: 'Create and maintain a role-based access control matrix documenting all user permissions for AI agent operations.',
  },
  {
    framework: 'SOC2',
    controlId: 'CM-1',
    controlName: 'Configuration Management Policy',
    requiredEvidence: 'CAB Meeting Minutes',
    status: 'partial',
    priority: 'high',
    remediation: 'Complete attestation for pending CAB meeting minutes to demonstrate change advisory board governance.',
  },
  {
    framework: 'PCI-DSS',
    controlId: '10.7',
    controlName: 'Audit Trail History',
    requiredEvidence: '90-day audit log retention evidence',
    status: 'partial',
    priority: 'high',
    remediation: 'Document and attest to CloudTrail log retention configuration meeting 90-day minimum requirement.',
  },
  {
    framework: 'SOC2',
    controlId: 'OC-3',
    controlName: 'On-Call Coverage',
    requiredEvidence: 'Coverage Gap Report',
    status: 'missing',
    priority: 'medium',
    remediation: 'Generate and review on-call coverage gap report. Address any identified gaps in rotation schedules.',
  },
  {
    framework: 'ISO 27001',
    controlId: 'A.12.1.2',
    controlName: 'Change Management',
    requiredEvidence: 'Emergency change procedures documentation',
    status: 'missing',
    priority: 'medium',
    remediation: 'Document emergency change procedures including approval workflow and post-implementation review process.',
  },
  {
    framework: 'FFIEC',
    controlId: 'BCP-4',
    controlName: 'Business Continuity Testing',
    requiredEvidence: 'Annual BCP test results',
    status: 'collected',
    priority: 'low',
    remediation: 'Evidence collected. Ensure next annual test is scheduled within 12 months.',
  },
];

const MOCK_PACKAGES: AuditPackage[] = [
  {
    id: 'pkg-001',
    name: 'SOC2 Type II - Q3 2026',
    framework: 'SOC2',
    description: 'Complete evidence package for SOC2 Type II audit covering July-September 2026',
    itemCount: 47,
    lastGenerated: '2026-08-10T14:30:00Z',
    generatedBy: 'Sarah Chen',
    exportFormats: ['PDF', 'CSV', 'ZIP'],
    status: 'ready',
  },
  {
    id: 'pkg-002',
    name: 'PCI-DSS v4.0 Evidence',
    framework: 'PCI-DSS',
    description: 'Evidence package for PCI-DSS v4.0 compliance validation',
    itemCount: 32,
    lastGenerated: '2026-08-08T09:00:00Z',
    generatedBy: 'Michael Torres',
    exportFormats: ['PDF', 'ZIP'],
    status: 'incomplete',
  },
  {
    id: 'pkg-003',
    name: 'ISO 27001 Surveillance',
    framework: 'ISO 27001',
    description: 'Annual surveillance audit evidence for ISO 27001:2022 certification',
    itemCount: 58,
    lastGenerated: '2026-08-05T16:00:00Z',
    generatedBy: 'Jennifer Wu',
    exportFormats: ['PDF', 'CSV', 'ZIP'],
    status: 'ready',
  },
  {
    id: 'pkg-004',
    name: 'FFIEC IT Examination',
    framework: 'FFIEC',
    description: 'Evidence package for FFIEC IT examination - Information Security',
    itemCount: 0,
    lastGenerated: '',
    generatedBy: '',
    exportFormats: ['PDF', 'CSV', 'ZIP'],
    status: 'generating',
  },
];

// ─────────────────────────── Helper Functions ───────────────────────────

function formatTimestamp(ts: string): string {
  if (!ts) return '-';
  const date = new Date(ts);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(ts: string): string {
  if (!ts) return '-';
  const date = new Date(ts);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDaysSince(ts: string): number {
  const date = new Date(ts);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysUntil(ts: string): number {
  const date = new Date(ts);
  const now = new Date();
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ─────────────────────────── Components ───────────────────────────

interface KPIRowProps {
  evidence: EvidenceItem[];
}

function KPIRow({ evidence }: KPIRowProps) {
  const stats = useMemo(() => {
    const total = evidence.length;
    const autoCollected = evidence.filter(e => e.autoCollected).length;
    const autoCollectedPct = total > 0 ? Math.round((autoCollected / total) * 100) : 0;
    const manualNeeded = evidence.filter(e => !e.autoCollected && e.status !== 'attested').length;
    const gaps = evidence.filter(e => e.status === 'missing').length;
    // Illustrative sample dates - not sourced from a live audit schedule.
    const lastAuditDate = '2026-07-15T00:00:00Z';
    const nextAuditDate = '2026-10-15T00:00:00Z';
    const daysSinceAudit = getDaysSince(lastAuditDate);
    const daysUntilAudit = getDaysUntil(nextAuditDate);

    return { total, autoCollectedPct, manualNeeded, gaps, daysSinceAudit, daysUntilAudit };
  }, [evidence]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard
        label="Evidence Items"
        value={stats.total}
        sub="Total collected"
        variant="default"
        icon={<Icon name="folder" className="w-4 h-4 text-slate-400" />}
      />
      <StatCard
        label="Auto-Collected"
        value={`${stats.autoCollectedPct}%`}
        sub="Automated collection"
        variant={stats.autoCollectedPct >= 70 ? 'success' : 'warning'}
        icon={<Icon name="cog" className="w-4 h-4 text-emerald-500" />}
      />
      <StatCard
        label="Manual Entries"
        value={stats.manualNeeded}
        sub="Requiring input"
        variant={stats.manualNeeded === 0 ? 'success' : 'warning'}
        icon={<Icon name="document-text" className="w-4 h-4 text-amber-500" />}
      />
      <StatCard
        label="Evidence Gaps"
        value={stats.gaps}
        sub="Missing items"
        variant={stats.gaps === 0 ? 'success' : 'danger'}
        icon={<Icon name="exclamation-circle" className="w-4 h-4 text-rose-500" />}
      />
      <StatCard
        label="Last Audit"
        value={`${stats.daysSinceAudit}d`}
        sub="Days since (illustrative)"
        variant="default"
        icon={<Icon name="calendar" className="w-4 h-4 text-slate-400" />}
      />
      <StatCard
        label="Next Audit"
        value={`${stats.daysUntilAudit}d`}
        sub="Countdown (illustrative)"
        variant={stats.daysUntilAudit <= 30 ? 'warning' : 'info'}
        icon={<Icon name="clock" className="w-4 h-4 text-blue-500" />}
      />
    </div>
  );
}

interface CategoryCardsProps {
  evidence: EvidenceItem[];
  onCategoryClick: (category: EvidenceCategory) => void;
}

function CategoryCards({ evidence, onCategoryClick }: CategoryCardsProps) {
  const categories = useMemo(() => {
    return Object.entries(CATEGORY_CONFIG).map(([id, config]) => {
      const items = evidence.filter(e => e.category === id);
      const collected = items.filter(e => e.status === 'collected' || e.status === 'attested').length;
      const completeness = items.length > 0 ? Math.round((collected / items.length) * 100) : 0;
      const lastUpdated = items.length > 0
        ? items.reduce((latest, item) => item.timestamp > latest ? item.timestamp : latest, items[0].timestamp)
        : '';

      return {
        id: id as EvidenceCategory,
        ...config,
        itemCount: items.length,
        completeness,
        lastUpdated,
      };
    });
  }, [evidence]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onCategoryClick(cat.id)}
          className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-left hover:shadow-md hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              cat.completeness >= 80 ? 'bg-emerald-100' :
              cat.completeness >= 50 ? 'bg-amber-100' : 'bg-rose-100'
            }`}>
              <Icon
                name={cat.icon}
                className={`w-5 h-5 ${
                  cat.completeness >= 80 ? 'text-emerald-600' :
                  cat.completeness >= 50 ? 'text-amber-600' : 'text-rose-600'
                }`}
                strokeWidth={2}
              />
            </div>
            <span className={`text-xs font-semibold px-2 py-1 rounded ${
              cat.completeness >= 80 ? 'bg-emerald-50 text-emerald-700' :
              cat.completeness >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
            }`}>
              {cat.completeness}%
            </span>
          </div>
          <div className="text-sm font-semibold text-slate-900 mb-1">{cat.name}</div>
          <div className="text-[11px] text-slate-500 mb-3">{cat.description}</div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">{cat.itemCount} items</span>
            {cat.lastUpdated && (
              <span className="text-slate-400">Updated {formatDate(cat.lastUpdated)}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

interface EvidenceLibraryProps {
  evidence: EvidenceItem[];
  onEvidenceClick: (item: EvidenceItem) => void;
  categoryFilter?: EvidenceCategory;
}

function EvidenceLibrary({ evidence, onEvidenceClick, categoryFilter }: EvidenceLibraryProps) {
  const [search, setSearch] = useState('');
  const [frameworkFilter, setFrameworkFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all');

  const filteredEvidence = useMemo(() => {
    return evidence.filter(item => {
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (search && !item.description.toLowerCase().includes(search.toLowerCase()) &&
          !item.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (frameworkFilter !== 'all' && !item.framework.includes(frameworkFilter)) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (dateRange !== 'all') {
        const daysDiff = getDaysSince(item.timestamp);
        if (dateRange === '7d' && daysDiff > 7) return false;
        if (dateRange === '30d' && daysDiff > 30) return false;
        if (dateRange === '90d' && daysDiff > 90) return false;
      }
      return true;
    });
  }, [evidence, categoryFilter, search, frameworkFilter, statusFilter, dateRange]);

  const frameworks = useMemo(() => {
    const all = evidence.flatMap(e => e.framework);
    return [...new Set(all)].sort();
  }, [evidence]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Filters */}
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search evidence..."
            className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={frameworkFilter}
          onChange={(e) => setFrameworkFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
        >
          <option value="all">All Frameworks</option>
          {frameworks.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
        >
          <option value="all">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
        >
          <option value="all">All Time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
        <button
          disabled
          title="Exporting evidence is a planned capability and is not available in this demo"
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed transition-colors flex items-center gap-1"
        >
          <Icon name="document-arrow-down" className="w-3 h-3" />
          Export
          <span className="text-[10px]">(demo)</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 text-[10px] text-slate-500 uppercase tracking-wide">
              <th scope="col" className="px-4 py-2 text-left font-medium">ID</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Type</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Description</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Source</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Timestamp</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Framework</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Control</th>
              <th scope="col" className="px-4 py-2 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredEvidence.map(item => (
              <tr
                key={item.id}
                onClick={() => onEvidenceClick(item)}
                className="hover:bg-slate-50/40 cursor-pointer"
              >
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{item.id}</td>
                <td className="px-4 py-2 text-xs text-slate-700">{item.type}</td>
                <td className="px-4 py-2 text-xs text-slate-900 max-w-md truncate">{item.description}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{item.source}</td>
                <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{formatDate(item.timestamp)}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {item.framework.slice(0, 2).map(f => (
                      <span key={f} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
                        {f}
                      </span>
                    ))}
                    {item.framework.length > 2 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        +{item.framework.length - 2}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2 font-mono text-[10px] text-slate-500">{item.controlId}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-[9px] font-medium px-2 py-0.5 rounded border ${STATUS_CONFIG[item.status].bgColor}`}>
                    {STATUS_CONFIG[item.status].label}
                  </span>
                </td>
              </tr>
            ))}
            {filteredEvidence.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                  No evidence items match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-500">
        Showing {filteredEvidence.length} of {evidence.length} items
      </div>
    </div>
  );
}

interface EvidenceDetailProps {
  item: EvidenceItem;
  onClose: () => void;
  onAttest: (itemId: string, status: AttestationStatus, comments?: string) => void;
}

function EvidenceDetail({ item, onClose, onAttest }: EvidenceDetailProps) {
  const [attestComment, setAttestComment] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-slate-500">{item.id}</span>
              <span className={`text-[9px] font-medium px-2 py-0.5 rounded border ${STATUS_CONFIG[item.status].bgColor}`}>
                {STATUS_CONFIG[item.status].label}
              </span>
              {item.autoCollected && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
                  Auto-collected
                </span>
              )}
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mt-1">{item.type}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Icon name="x-mark" className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Description */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Description
            </label>
            <p className="text-sm text-slate-700">{item.description}</p>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Source System
              </label>
              <div className="text-sm text-slate-900 flex items-center gap-1">
                <Icon name="server-stack" className="w-4 h-4 text-slate-400" />
                {item.source}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Timestamp
              </label>
              <div className="text-sm text-slate-900">{formatTimestamp(item.timestamp)}</div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Category
              </label>
              <div className="text-sm text-slate-900 flex items-center gap-1">
                <Icon name={CATEGORY_CONFIG[item.category].icon} className="w-4 h-4 text-slate-400" />
                {CATEGORY_CONFIG[item.category].name}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Control ID
              </label>
              <div className="text-sm font-mono text-slate-900">{item.controlId}</div>
            </div>
          </div>

          {/* Frameworks */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-2">
              Framework Mapping
            </label>
            <div className="flex flex-wrap gap-2">
              {item.framework.map(f => (
                <span key={f} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Attachments */}
          {item.attachments.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-2">
                Attachments
              </label>
              <div className="space-y-2">
                {item.attachments.map((att, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <Icon name="paper-clip" className="w-4 h-4 text-slate-400" />
                    <span className="text-xs text-slate-700 flex-1">{att}</span>
                    <button
                      disabled
                      title="Attachment download is a planned capability and is not available in this demo"
                      className="text-xs text-slate-400 cursor-not-allowed"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related Items */}
          {item.relatedItems.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-2">
                Related Evidence
              </label>
              <div className="flex flex-wrap gap-2">
                {item.relatedItems.map(rel => (
                  <span key={rel} className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                    {rel}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Attestation Status */}
          {item.attestation && (
            <div className="p-4 rounded-lg bg-violet-50 border border-violet-200">
              <div className="flex items-center gap-2 mb-2">
                <Icon name="check-badge" className="w-5 h-5 text-violet-600" />
                <span className="text-sm font-semibold text-violet-800">Attestation</span>
              </div>
              {item.attestation.status === 'approved' ? (
                <div className="text-xs text-violet-700">
                  Attested by {item.attestation.attestedBy} on {formatDate(item.attestation.attestedAt || '')}
                </div>
              ) : item.attestation.status === 'pending' ? (
                <div className="space-y-3">
                  <div className="text-xs text-violet-700">Awaiting attestation</div>
                  <textarea
                    value={attestComment}
                    onChange={(e) => setAttestComment(e.target.value)}
                    placeholder="Add attestation comments..."
                    className="w-full text-xs border border-violet-200 rounded-lg px-3 py-2 h-16 resize-none focus:ring-2 focus:ring-violet-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => onAttest(item.id, 'approved', attestComment)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => onAttest(item.id, 'rejected', attestComment)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => onAttest(item.id, 'delegated', attestComment)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      Delegate
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-violet-700">
                  Status: {item.attestation.status}
                  {item.attestation.comments && ` - ${item.attestation.comments}`}
                </div>
              )}
            </div>
          )}

          {/* Source Link */}
          <div className="pt-4 border-t border-slate-100">
            <button
              disabled
              title={`Opening the source system (${item.source}) is a planned capability and is not available in this demo`}
              className="text-sm text-slate-400 cursor-not-allowed flex items-center gap-1"
            >
              <Icon name="arrow-top-right-on-square" className="w-4 h-4" />
              View in {item.source}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CollectionRulesProps {
  rules: AutoCollectionRule[];
  onToggleRule: (ruleId: string) => void;
}

function CollectionRules({ rules, onToggleRule }: CollectionRulesProps) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Auto-Collection Rules</h3>
          <p className="text-[11px] text-slate-500">Configure automatic evidence collection from source systems</p>
        </div>
        <button
          disabled
          title="Adding an auto-collection rule is a planned capability and is not available in this demo"
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed flex items-center gap-1"
        >
          <Icon name="plus" className="w-3 h-3" />
          Add Rule
          <span className="text-[10px]">(demo)</span>
        </button>
      </div>

      <div className="divide-y divide-slate-100">
        {rules.map(rule => (
          <div key={rule.id} className="px-5 py-3 flex items-center gap-4">
            <button
              onClick={() => onToggleRule(rule.id)}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                rule.enabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow ${
                rule.enabled ? 'left-5' : 'left-0.5'
              }`} />
            </button>

            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              rule.enabled ? 'bg-indigo-100' : 'bg-slate-100'
            }`}>
              <Icon
                name={CATEGORY_CONFIG[rule.category].icon}
                className={`w-4 h-4 ${rule.enabled ? 'text-indigo-600' : 'text-slate-400'}`}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${rule.enabled ? 'text-slate-900' : 'text-slate-500'}`}>
                  {rule.name}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                  {rule.sourceSystem}
                </span>
              </div>
              <div className="text-[10px] text-slate-500">
                {rule.frequency} | Maps to: {rule.mapping}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] text-slate-500">Last: {formatTimestamp(rule.lastCollection)}</div>
              <div className="text-[10px] text-slate-400">
                Next: {rule.nextCollection === 'Continuous' ? 'Continuous' : formatTimestamp(rule.nextCollection)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface GapAnalysisProps {
  gaps: GapItem[];
}

function GapAnalysis({ gaps }: GapAnalysisProps) {
  const priorityConfig: Record<string, { color: string; bgColor: string }> = {
    critical: { color: 'text-rose-700', bgColor: 'bg-rose-100' },
    high: { color: 'text-amber-700', bgColor: 'bg-amber-100' },
    medium: { color: 'text-blue-700', bgColor: 'bg-blue-100' },
    low: { color: 'text-slate-600', bgColor: 'bg-slate-100' },
  };

  const statusIcon: Record<string, IconName> = {
    collected: 'check-circle',
    partial: 'circle-half',
    missing: 'x-circle',
  };

  const grouped = useMemo(() => {
    const byFramework: Record<string, GapItem[]> = {};
    gaps.forEach(gap => {
      if (!byFramework[gap.framework]) byFramework[gap.framework] = [];
      byFramework[gap.framework].push(gap);
    });
    return byFramework;
  }, [gaps]);

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([framework, items]) => (
        <div key={framework} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{framework}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                {items.filter(i => i.status !== 'collected').length} gaps
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <Icon name="check-circle" className="w-3 h-3 text-emerald-500" />
                {items.filter(i => i.status === 'collected').length} collected
              </span>
              <span className="flex items-center gap-1">
                <Icon name="circle-half" className="w-3 h-3 text-amber-500" />
                {items.filter(i => i.status === 'partial').length} partial
              </span>
              <span className="flex items-center gap-1">
                <Icon name="x-circle" className="w-3 h-3 text-rose-500" />
                {items.filter(i => i.status === 'missing').length} missing
              </span>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {items.map((gap, idx) => (
              <div key={idx} className="px-5 py-3 flex items-start gap-3">
                <Icon
                  name={statusIcon[gap.status]}
                  className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    gap.status === 'collected' ? 'text-emerald-500' :
                    gap.status === 'partial' ? 'text-amber-500' : 'text-rose-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-500">{gap.controlId}</span>
                    <span className="text-sm font-medium text-slate-900">{gap.controlName}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${priorityConfig[gap.priority].bgColor} ${priorityConfig[gap.priority].color}`}>
                      {gap.priority}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 mb-2">Required: {gap.requiredEvidence}</div>
                  {gap.status !== 'collected' && (
                    <div className="p-2 rounded-lg bg-blue-50 border border-blue-100">
                      <div className="flex items-start gap-2 text-[11px] text-blue-700">
                        <Icon name="light-bulb" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{gap.remediation}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface AuditPackagesProps {
  packages: AuditPackage[];
  onGenerate: (packageId: string) => void;
  canGenerate: boolean;
}

function AuditPackages({ packages, onGenerate, canGenerate }: AuditPackagesProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-500">Pre-built audit packages for common compliance frameworks</p>
        <button
          disabled
          title="Creating a new package is a planned capability and is not available in this demo"
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed flex items-center gap-1"
        >
          <Icon name="plus" className="w-3 h-3" />
          New Package
          <span className="text-[10px]">(demo)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {packages.map(pkg => (
          <div key={pkg.id} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{pkg.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    pkg.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                    pkg.status === 'incomplete' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {pkg.status === 'generating' ? 'Generating...' : pkg.status}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{pkg.framework}</div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Icon name="document-arrow-down" className="w-5 h-5 text-indigo-600" />
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-3">{pkg.description}</p>

            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-3">
              <span>{pkg.itemCount} items</span>
              {pkg.lastGenerated && (
                <span>Generated {formatDate(pkg.lastGenerated)} by {pkg.generatedBy}</span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {pkg.exportFormats.map(fmt => (
                  <span key={fmt} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                    {fmt}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                {pkg.status === 'ready' && (
                  <button
                    disabled
                    title="Package download is a planned capability and is not available in this demo"
                    className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed"
                  >
                    Download
                  </button>
                )}
                <button
                  onClick={() => onGenerate(pkg.id)}
                  disabled={pkg.status === 'generating' || !canGenerate}
                  title={canGenerate
                    ? undefined
                    : 'Package generation requires a connected live evidence system and is not available in this demo'}
                  className="text-xs px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pkg.status === 'generating' ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface AttestationQueueProps {
  evidence: EvidenceItem[];
  onAttest: (itemId: string, status: AttestationStatus, comments?: string) => void;
}

function AttestationQueue({ evidence, onAttest }: AttestationQueueProps) {
  const pendingItems = useMemo(() => {
    return evidence.filter(e => e.attestation?.status === 'pending');
  }, [evidence]);

  if (pendingItems.length === 0) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-8 text-center">
        <Icon name="check-circle" className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
        <div className="text-sm font-semibold text-slate-900 mb-1">All Caught Up</div>
        <div className="text-xs text-slate-500">No evidence items pending attestation</div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Icon name="inbox-stack" className="w-5 h-5 text-violet-600" />
          <h3 className="text-sm font-semibold text-slate-900">Attestation Queue</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
            {pendingItems.length} pending
          </span>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {pendingItems.map(item => (
          <div key={item.id} className="px-5 py-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{item.id}</span>
                  <span className="text-sm font-medium text-slate-900">{item.type}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">{item.description}</p>
              </div>
              <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatDate(item.timestamp)}</span>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => onAttest(item.id, 'approved')}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1"
              >
                <Icon name="check" className="w-3 h-3" />
                Approve
              </button>
              <button
                onClick={() => onAttest(item.id, 'rejected')}
                className="text-xs px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1"
              >
                <Icon name="x-mark" className="w-3 h-3" />
                Reject
              </button>
              <button
                onClick={() => onAttest(item.id, 'delegated')}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1"
              >
                <Icon name="users" className="w-3 h-3" />
                Delegate
              </button>
              <div className="flex-1" />
              <button
                disabled
                title="Viewing full evidence details is a planned capability and is not available in this demo"
                className="text-xs text-slate-400 cursor-not-allowed"
              >
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Main Component ───────────────────────────

type ViewMode = 'categories' | 'library' | 'rules' | 'gaps' | 'packages' | 'attestation';

export default function AuditEvidence() {
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [localEvidence, setLocalEvidence] = usePersistedState<EvidenceItem[]>('audit_evidence_items', MOCK_EVIDENCE);
  const [collectionRules, setCollectionRules] = usePersistedState<AutoCollectionRule[]>('audit_collection_rules', MOCK_COLLECTION_RULES);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<EvidenceCategory | undefined>();

  // Live data hooks
  const { loading: evidenceLoading, evidence: liveEvidence, live: isEvidenceLive } = useAuditEvidence();
  const { loading: gapsLoading, live: isGapsLive } = useEvidenceGaps();
  const { loading: packagesLoading, live: isPackagesLive, generate: generateLivePackage } = useAuditPackages();

  // Use live data if available, otherwise fall back to local/mock
  const evidence = liveEvidence.length > 0 ? liveEvidence : localEvidence;
  const setEvidence = setLocalEvidence;
  const isLive = isEvidenceLive || isGapsLive || isPackagesLive;
  const isLoading = evidenceLoading || gapsLoading || packagesLoading;

  const handleCategoryClick = useCallback((category: EvidenceCategory) => {
    setCategoryFilter(category);
    setViewMode('library');
  }, []);

  const handleToggleRule = useCallback((ruleId: string) => {
    setCollectionRules(prev =>
      prev.map(rule =>
        rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
      )
    );
  }, [setCollectionRules]);

  const handleAttest = useCallback((itemId: string, status: AttestationStatus, comments?: string) => {
    setEvidence(prev =>
      prev.map(item =>
        item.id === itemId
          ? {
              ...item,
              status: status === 'approved' ? 'attested' : item.status,
              attestation: {
                ...item.attestation,
                status,
                attestedBy: status === 'approved' || status === 'rejected' ? 'Current User' : undefined,
                attestedAt: status === 'approved' || status === 'rejected' ? new Date().toISOString() : undefined,
                comments,
              },
            }
          : item
      )
    );
    setSelectedEvidence(null);
  }, [setEvidence]);

  const handleGeneratePackage = useCallback((packageId: string) => {
    // Package generation only works against a connected live evidence system.
    // In the demo (non-live) mode the Generate control is disabled, so there is
    // no fake/no-op path here.
    if (isLive) {
      generateLivePackage(packageId);
    }
  }, [isLive, generateLivePackage]);

  return (
    <div className="space-y-6">
      {/* Data Source Badge */}
      <div className="flex justify-end">
        {isLive ? <LiveDataBadge source="Evidence Systems" /> : <MockDataBadge integration="Evidence data stored locally" />}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Icon name="spinner" className="w-6 h-6 text-indigo-600 animate-spin" />
          <span className="ml-2 text-sm text-slate-600">Loading evidence data...</span>
        </div>
      )}

      {!isLoading && (
      <>
      {/* KPI Row */}
      <KPIRow evidence={evidence} />

      {/* View Mode Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'categories' as ViewMode, label: 'Categories', icon: 'folder' as IconName },
          { id: 'library' as ViewMode, label: 'Evidence Library', icon: 'rectangle-stack' as IconName },
          { id: 'rules' as ViewMode, label: 'Collection Rules', icon: 'cog' as IconName },
          { id: 'gaps' as ViewMode, label: 'Gap Analysis', icon: 'exclamation-triangle' as IconName },
          { id: 'packages' as ViewMode, label: 'Audit Packages', icon: 'document-arrow-down' as IconName },
          { id: 'attestation' as ViewMode, label: 'Attestation', icon: 'check-badge' as IconName },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setViewMode(tab.id);
              if (tab.id !== 'library') setCategoryFilter(undefined);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              viewMode === tab.id
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {viewMode === 'categories' && (
        <CategoryCards evidence={evidence} onCategoryClick={handleCategoryClick} />
      )}

      {viewMode === 'library' && (
        <>
          {categoryFilter && (
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => setCategoryFilter(undefined)}
                className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Icon name="arrow-left" className="w-4 h-4" />
                All Categories
              </button>
              <span className="text-slate-400">/</span>
              <span className="text-slate-700">{CATEGORY_CONFIG[categoryFilter].name}</span>
            </div>
          )}
          <EvidenceLibrary
            evidence={evidence}
            onEvidenceClick={setSelectedEvidence}
            categoryFilter={categoryFilter}
          />
        </>
      )}

      {viewMode === 'rules' && (
        <CollectionRules rules={collectionRules} onToggleRule={handleToggleRule} />
      )}

      {viewMode === 'gaps' && (
        <GapAnalysis gaps={MOCK_GAPS} />
      )}

      {viewMode === 'packages' && (
        <AuditPackages packages={MOCK_PACKAGES} onGenerate={handleGeneratePackage} canGenerate={isLive} />
      )}

      {viewMode === 'attestation' && (
        <AttestationQueue evidence={evidence} onAttest={handleAttest} />
      )}

      {/* Evidence Detail Modal */}
      {selectedEvidence && (
        <EvidenceDetail
          item={selectedEvidence}
          onClose={() => setSelectedEvidence(null)}
          onAttest={handleAttest}
        />
      )}
      </>
      )}
    </div>
  );
}
