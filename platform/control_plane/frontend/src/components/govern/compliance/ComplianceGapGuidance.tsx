/**
 * ComplianceGapGuidance - Organizational Actions Required Beyond Platform Automation
 *
 * A reusable component that helps users address non-technical and hybrid compliance gaps
 * that require organizational/procedural actions beyond what the platform can automate.
 *
 * Gap Categories:
 * - Non-Technical (Procedural): Require organizational processes, policies, or external actions
 * - Hybrid (Technical + Procedural): Platform provides partial support, user completes the rest
 *
 * Features:
 * - Interactive checklist with progress tracking
 * - Links to relevant Govern modules for technical portions
 * - Suggested owners and timelines
 * - Persisted state via localStorage
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../icons';

// ─────────────────────────── Types ───────────────────────────

type GapCategory = 'non-technical' | 'hybrid';
type GapPriority = 'critical' | 'high' | 'medium' | 'low';
type GapStatus = 'not-started' | 'in-progress' | 'complete';

interface ActionItem {
  id: string;
  label: string;
  description?: string;
}

interface ComplianceGap {
  id: string;
  title: string;
  category: GapCategory;
  priority: GapPriority;
  framework: string;
  article?: string;
  description: string;
  platformProvides: string[];
  organizationMustDo: ActionItem[];
  suggestedOwner: string;
  recommendedTimeline: string;
  governLink?: { path: string; label: string };
  icon: IconName;
}

// ─────────────────────────── Gap Definitions ───────────────────────────

const COMPLIANCE_GAPS: ComplianceGap[] = [
  // ===== NON-TECHNICAL GAPS (Procedural) =====
  {
    id: 'eu-database-registration',
    title: 'EU AI Act Database Registration',
    category: 'non-technical',
    priority: 'critical',
    framework: 'EU AI Act',
    article: 'Art. 49/71',
    description: 'High-risk AI systems and GPAI models must be registered in the EU public database before being placed on the market or put into service.',
    platformProvides: [
      'AI system inventory with classification metadata',
      'Technical documentation exports (Annex IV format)',
      'Risk tier classification tracking',
    ],
    organizationMustDo: [
      { id: 'eu-db-1', label: 'Create EU AI Database account for your organization', description: 'Register at the official EU AI Office portal' },
      { id: 'eu-db-2', label: 'Submit registration for each high-risk AI system', description: 'Use exported documentation from the platform' },
      { id: 'eu-db-3', label: 'Establish process for updating registrations when systems change', description: 'Define triggers and responsibilities' },
      { id: 'eu-db-4', label: 'Monitor registration status and renewal requirements', description: 'Set calendar reminders for annual reviews' },
    ],
    suggestedOwner: 'Legal / Compliance',
    recommendedTimeline: '60-90 days before system deployment',
    governLink: { path: '/govern/compliance?tab=eu-conformity', label: 'Conformity Assessment' },
    icon: 'globe-alt',
  },
  {
    id: 'iso-management-reviews',
    title: 'ISO 42001 Management Reviews',
    category: 'non-technical',
    priority: 'high',
    framework: 'ISO 42001',
    article: 'Clause 9.3',
    description: 'Top management must review the AI Management System at planned intervals to ensure its continuing suitability, adequacy, and effectiveness.',
    platformProvides: [
      'AIMS performance dashboards and metrics',
      'Control status and gap reports',
      'Audit trail and evidence repository',
      'Risk assessment outputs',
    ],
    organizationMustDo: [
      { id: 'iso-mgmt-1', label: 'Schedule management review meetings (at least annually)', description: 'Include C-suite and AI Governance Council' },
      { id: 'iso-mgmt-2', label: 'Prepare management review inputs per ISO 42001 9.3.2', description: 'Audit results, customer feedback, process performance, nonconformities' },
      { id: 'iso-mgmt-3', label: 'Document management review outputs and decisions', description: 'Opportunities for improvement, resource needs, changes to AIMS' },
      { id: 'iso-mgmt-4', label: 'Track and implement decisions from management reviews', description: 'Assign action owners and due dates' },
    ],
    suggestedOwner: 'AI Governance Council / C-Suite',
    recommendedTimeline: 'Quarterly (minimum annually)',
    governLink: { path: '/govern/compliance?framework=iso-42001', label: 'ISO 42001 AIMS' },
    icon: 'users',
  },
  {
    id: 'external-certification-audits',
    title: 'External Certification Audits',
    category: 'non-technical',
    priority: 'high',
    framework: 'ISO 42001',
    article: 'Clause 10.2',
    description: 'Organizations seeking ISO 42001 certification must engage accredited certification bodies to conduct Stage 1 and Stage 2 audits.',
    platformProvides: [
      'Pre-audit readiness assessment',
      'Evidence collection and organization',
      'Control implementation status',
      'Gap analysis reports',
    ],
    organizationMustDo: [
      { id: 'cert-1', label: 'Select and engage an accredited certification body', description: 'Verify IAF accreditation for ISO 42001' },
      { id: 'cert-2', label: 'Schedule Stage 1 (documentation review) audit', description: 'Typically 3-6 months before target certification date' },
      { id: 'cert-3', label: 'Schedule Stage 2 (implementation) audit', description: 'After Stage 1 findings are addressed' },
      { id: 'cert-4', label: 'Plan for surveillance audits post-certification', description: 'Typically annually for 3-year certification cycle' },
    ],
    suggestedOwner: 'Compliance / Internal Audit',
    recommendedTimeline: '6-12 months for initial certification',
    governLink: { path: '/govern/compliance?tab=conformance', label: 'ISO 42001 Conformance' },
    icon: 'clipboard-document-check',
  },
  {
    id: 'incident-response-runbooks',
    title: 'AI Incident Response Runbooks',
    category: 'non-technical',
    priority: 'critical',
    framework: 'EU AI Act / NIST AI RMF',
    article: 'Art. 73 / MANAGE 1.1',
    description: 'Organizations must have documented procedures for responding to AI incidents, including serious incidents that must be reported to authorities.',
    platformProvides: [
      'Real-time monitoring and alerting',
      'Incident detection and classification',
      'Audit logs and evidence capture',
      'Incident timeline reconstruction',
    ],
    organizationMustDo: [
      { id: 'ir-1', label: 'Develop AI-specific incident response procedures', description: 'Include model failures, hallucinations, bias incidents, security breaches' },
      { id: 'ir-2', label: 'Define escalation paths and decision authorities', description: 'When to invoke human override, when to report to regulators' },
      { id: 'ir-3', label: 'Create communication templates for stakeholders', description: 'Internal, customer, regulatory notifications' },
      { id: 'ir-4', label: 'Conduct tabletop exercises and drills', description: 'Test runbooks at least annually' },
      { id: 'ir-5', label: 'Establish post-incident review process', description: 'Root cause analysis and lessons learned' },
    ],
    suggestedOwner: 'Risk Management / Security Operations',
    recommendedTimeline: 'Before production deployment; review quarterly',
    governLink: { path: '/govern/risk', label: 'Risk Management' },
    icon: 'bell-alert',
  },
  {
    id: 'board-reporting',
    title: 'Board/Executive AI Reporting Cadence',
    category: 'non-technical',
    priority: 'high',
    framework: 'SR 26-2 / NAIC',
    article: 'GOV-2 / Exhibit B',
    description: 'Board and senior management must receive regular reports on AI governance, risk exposure, and compliance status.',
    platformProvides: [
      'Executive dashboard with key metrics',
      'Board package export functionality',
      'Risk heatmaps and trend analysis',
      'Compliance posture summaries',
    ],
    organizationMustDo: [
      { id: 'board-1', label: 'Establish AI reporting to Board/Risk Committee', description: 'Define frequency (quarterly recommended) and content' },
      { id: 'board-2', label: 'Create standardized board reporting template', description: 'Key metrics, material risks, regulatory developments' },
      { id: 'board-3', label: 'Ensure Board AI literacy and training', description: 'Board members must understand AI risks to provide effective oversight' },
      { id: 'board-4', label: 'Document Board review and challenge of AI decisions', description: 'Meeting minutes showing substantive engagement' },
    ],
    suggestedOwner: 'Chief Risk Officer / AI Governance Council',
    recommendedTimeline: 'Quarterly board meetings',
    governLink: { path: '/observability?tab=board-package', label: 'Board Package' },
    icon: 'briefcase',
  },
  {
    id: 'vendor-due-diligence',
    title: 'Third-Party AI Vendor Due Diligence',
    category: 'non-technical',
    priority: 'high',
    framework: 'CRI FS AI RMF / OSFI E-23',
    article: 'TP-1 / E23-TP-1',
    description: 'Organizations must conduct due diligence on third-party AI vendors and maintain ongoing vendor risk management.',
    platformProvides: [
      'Vendor concentration analysis',
      'Third-party model inventory',
      'Dependency mapping and risk scoring',
      'Contract metadata tracking',
    ],
    organizationMustDo: [
      { id: 'vendor-1', label: 'Develop AI-specific vendor assessment questionnaire', description: 'Cover model governance, data handling, security, explainability' },
      { id: 'vendor-2', label: 'Conduct due diligence before onboarding AI vendors', description: 'Review SOC 2, model cards, bias testing results' },
      { id: 'vendor-3', label: 'Include AI-specific clauses in vendor contracts', description: 'Audit rights, incident notification, model change notification' },
      { id: 'vendor-4', label: 'Establish ongoing vendor monitoring program', description: 'Periodic reassessment, performance monitoring' },
      { id: 'vendor-5', label: 'Document exit strategies for critical AI vendors', description: 'Alternative providers, data portability, model replacement plans' },
    ],
    suggestedOwner: 'Third-Party Risk Management / Procurement',
    recommendedTimeline: 'Before vendor engagement; annual reassessment',
    governLink: { path: '/govern/models', label: 'Model Inventory' },
    icon: 'hand-raised',
  },

  // ===== HYBRID GAPS (Technical + Procedural) =====
  {
    id: 'llm09-misinformation',
    title: 'LLM09: Misinformation Human Review',
    category: 'hybrid',
    priority: 'critical',
    framework: 'OWASP LLM Top 10',
    article: 'LLM09:2025',
    description: 'Platform provides automated grounding checks and hallucination detection, but high-stakes outputs require human review processes.',
    platformProvides: [
      'Contextual grounding checks via Bedrock Guardrails',
      'Hallucination detection scoring',
      'Citation and source tracking',
      'Confidence thresholds and alerts',
    ],
    organizationMustDo: [
      { id: 'llm09-1', label: 'Define which outputs require human review', description: 'Customer-facing, financial, medical, legal decisions' },
      { id: 'llm09-2', label: 'Establish human review workflows and SLAs', description: 'Queue management, reviewer qualifications, turnaround times' },
      { id: 'llm09-3', label: 'Train reviewers on AI output validation', description: 'How to verify claims, spot hallucinations, check sources' },
      { id: 'llm09-4', label: 'Create feedback loops from reviewers to model tuning', description: 'Track false positives/negatives, improve over time' },
    ],
    suggestedOwner: 'Business Operations / Quality Assurance',
    recommendedTimeline: 'Implement before production; ongoing',
    governLink: { path: '/secure/guardrails', label: 'Guardrails Configuration' },
    icon: 'magnifying-glass',
  },
  {
    id: 'third-party-exit-strategy',
    title: 'Third-Party AI Exit Strategy',
    category: 'hybrid',
    priority: 'high',
    framework: 'CRI FS AI RMF / FINOS AIR',
    article: 'TP-2 / AIR-OP-014',
    description: 'Platform monitors vendor concentration and dependencies; organization must document actionable exit strategies.',
    platformProvides: [
      'Vendor concentration dashboards',
      'Dependency risk scoring',
      'Model substitution analysis',
      'API compatibility tracking',
    ],
    organizationMustDo: [
      { id: 'exit-1', label: 'Document exit strategy for each critical AI vendor', description: 'Alternative providers, transition timelines, data migration' },
      { id: 'exit-2', label: 'Identify and test alternative models/providers', description: 'Proof of concept with backup providers' },
      { id: 'exit-3', label: 'Maintain data portability capabilities', description: 'Ensure training data and fine-tuning can be transferred' },
      { id: 'exit-4', label: 'Include exit provisions in vendor contracts', description: 'Transition assistance, data return, notice periods' },
    ],
    suggestedOwner: 'Business Continuity / Vendor Management',
    recommendedTimeline: 'Document within 90 days of vendor engagement',
    governLink: { path: '/govern/finops', label: 'FinOps & Vendor Analysis' },
    icon: 'arrow-right-on-rectangle',
  },
  {
    id: 'consumer-harm-escalation',
    title: 'Consumer Harm Escalation SOP',
    category: 'hybrid',
    priority: 'critical',
    framework: 'NAIC / EU AI Act',
    article: 'Model Bulletin / Art. 73',
    description: 'Platform monitors consumer outcomes and detects adverse impacts; organization must have procedures to investigate and remediate.',
    platformProvides: [
      'Consumer outcome monitoring',
      'Disparate impact detection',
      'Complaint pattern analysis',
      'Real-time alerting on threshold breaches',
    ],
    organizationMustDo: [
      { id: 'harm-1', label: 'Define consumer harm escalation criteria', description: 'Financial impact thresholds, frequency triggers, protected class impacts' },
      { id: 'harm-2', label: 'Establish investigation procedures', description: 'Root cause analysis, impact assessment, evidence preservation' },
      { id: 'harm-3', label: 'Create remediation playbooks', description: 'Customer communication, compensation, system fixes' },
      { id: 'harm-4', label: 'Define regulatory notification criteria and process', description: 'When and how to notify regulators of serious incidents' },
      { id: 'harm-5', label: 'Document appeals process for affected consumers', description: 'Human review path for adverse AI decisions' },
    ],
    suggestedOwner: 'Customer Operations / Compliance',
    recommendedTimeline: 'Before consumer-facing deployment',
    governLink: { path: '/govern/models?tab=bias', label: 'Bias & Fairness' },
    icon: 'shield-exclamation',
  },
  {
    id: 'model-validation-team',
    title: 'Independent Model Validation',
    category: 'hybrid',
    priority: 'high',
    framework: 'SR 26-2 / OSFI E-23',
    article: 'VAL-1 / E23-VAL-1',
    description: 'Platform tracks challenger models and provides validation infrastructure; organization must establish independent validation function.',
    platformProvides: [
      'Challenger model comparison dashboards',
      'Automated model testing and benchmarking',
      'Drift detection and performance monitoring',
      'Validation evidence repository',
    ],
    organizationMustDo: [
      { id: 'val-1', label: 'Establish independent model validation function', description: 'Separate from model development, with appropriate expertise' },
      { id: 'val-2', label: 'Define validation standards and acceptance criteria', description: 'Performance thresholds, bias limits, documentation requirements' },
      { id: 'val-3', label: 'Conduct initial validation before production deployment', description: 'Conceptual soundness, data quality, performance testing' },
      { id: 'val-4', label: 'Establish ongoing validation schedule', description: 'Annual revalidation, triggered validation on material changes' },
      { id: 'val-5', label: 'Document validation findings and remediation tracking', description: 'Validation reports, issue logs, remediation status' },
    ],
    suggestedOwner: 'Model Risk Management / Internal Audit',
    recommendedTimeline: 'Before production; annual revalidation',
    governLink: { path: '/govern/models', label: 'Model Governance' },
    icon: 'beaker',
  },
  {
    id: 'fria-stakeholder-engagement',
    title: 'FRIA Stakeholder Engagement',
    category: 'hybrid',
    priority: 'high',
    framework: 'EU AI Act',
    article: 'Art. 27',
    description: 'Platform provides FRIA templates and impact tracking; organization must conduct actual stakeholder consultations.',
    platformProvides: [
      'FRIA wizard and documentation templates',
      'Impact category checklists',
      'Rights mapping to system functions',
      'Historical FRIA archive',
    ],
    organizationMustDo: [
      { id: 'fria-1', label: 'Identify affected stakeholder groups', description: 'Employees, customers, third parties, vulnerable populations' },
      { id: 'fria-2', label: 'Conduct stakeholder consultations', description: 'Surveys, focus groups, public comment periods as appropriate' },
      { id: 'fria-3', label: 'Document stakeholder feedback and responses', description: 'How concerns were addressed or why not' },
      { id: 'fria-4', label: 'Update FRIA when stakeholder circumstances change', description: 'New use cases, changed demographics, new rights concerns' },
    ],
    suggestedOwner: 'Ethics Committee / Legal',
    recommendedTimeline: 'Before high-risk system deployment',
    governLink: { path: '/govern/compliance?tab=fria', label: 'FRIA Wizard' },
    icon: 'user',
  },
];

// ─────────────────────────── Priority Config ───────────────────────────

const PRIORITY_CONFIG: Record<GapPriority, { label: string; color: string; bgColor: string; borderColor: string }> = {
  critical: { label: 'Critical', color: '#dc2626', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
  high: { label: 'High', color: '#ea580c', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
  medium: { label: 'Medium', color: '#ca8a04', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
  low: { label: 'Low', color: '#16a34a', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
};

const CATEGORY_CONFIG: Record<GapCategory, { label: string; color: string; bgColor: string; description: string }> = {
  'non-technical': {
    label: 'Procedural',
    color: '#8b5cf6',
    bgColor: 'bg-violet-50',
    description: 'Requires organizational processes, policies, or external actions',
  },
  hybrid: {
    label: 'Hybrid',
    color: '#f59e0b',
    bgColor: 'bg-amber-50',
    description: 'Platform provides partial support; organization completes the rest',
  },
};

// ─────────────────────────── Component ───────────────────────────

interface ComplianceGapGuidanceProps {
  embedded?: boolean;
  filterFramework?: string;
  filterCategory?: GapCategory;
  compact?: boolean;
}

export default function ComplianceGapGuidance({
  embedded = false,
  filterFramework,
  filterCategory,
  compact = false,
}: ComplianceGapGuidanceProps) {
  // State for completed action items (persisted)
  const [completedActions, setCompletedActions] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('ava_compliance_gap_actions') || '{}');
    } catch {
      return {};
    }
  });

  // State for expanded gaps
  const [expandedGaps, setExpandedGaps] = useState<Set<string>>(new Set());

  // Filter controls
  const [selectedCategory, setSelectedCategory] = useState<GapCategory | 'all'>(filterCategory || 'all');
  const [selectedPriority, setSelectedPriority] = useState<GapPriority | 'all'>('all');

  // Toggle action completion
  const toggleAction = useCallback((actionId: string) => {
    setCompletedActions(prev => {
      const updated = { ...prev, [actionId]: !prev[actionId] };
      localStorage.setItem('ava_compliance_gap_actions', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Toggle gap expansion
  const toggleGap = useCallback((gapId: string) => {
    setExpandedGaps(prev => {
      const next = new Set(prev);
      if (next.has(gapId)) {
        next.delete(gapId);
      } else {
        next.add(gapId);
      }
      return next;
    });
  }, []);

  // Filter gaps
  const filteredGaps = useMemo(() => {
    return COMPLIANCE_GAPS.filter(gap => {
      if (filterFramework && !gap.framework.toLowerCase().includes(filterFramework.toLowerCase())) {
        return false;
      }
      if (selectedCategory !== 'all' && gap.category !== selectedCategory) {
        return false;
      }
      if (selectedPriority !== 'all' && gap.priority !== selectedPriority) {
        return false;
      }
      return true;
    });
  }, [filterFramework, selectedCategory, selectedPriority]);

  // Calculate progress stats
  const stats = useMemo(() => {
    let totalActions = 0;
    let completedCount = 0;
    filteredGaps.forEach(gap => {
      gap.organizationMustDo.forEach(action => {
        totalActions++;
        if (completedActions[action.id]) completedCount++;
      });
    });
    return {
      totalGaps: filteredGaps.length,
      totalActions,
      completedActions: completedCount,
      progressPct: totalActions > 0 ? Math.round((completedCount / totalActions) * 100) : 0,
    };
  }, [filteredGaps, completedActions]);

  // Get gap progress
  const getGapProgress = useCallback((gap: ComplianceGap) => {
    const total = gap.organizationMustDo.length;
    const completed = gap.organizationMustDo.filter(a => completedActions[a.id]).length;
    return { total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }, [completedActions]);

  const containerClass = embedded
    ? 'space-y-4'
    : 'bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6';

  return (
    <div className={containerClass}>
      {/* Header */}
      {!compact && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
              <Icon name="clipboard-document-list" className="w-5 h-5 text-violet-600" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Beyond the Platform</h2>
              <p className="text-sm text-slate-500">Organizational actions required for complete compliance</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 max-w-3xl">
            While AVA automates technical controls and provides monitoring capabilities, some compliance requirements
            need organizational processes, human judgment, or external actions. This guide helps you identify and
            track those gaps.
          </p>
        </div>
      )}

      {/* Progress Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Gaps Identified</div>
          <div className="text-2xl font-bold text-slate-800">{stats.totalGaps}</div>
        </div>
        <div className="bg-violet-50 rounded-lg p-3 border border-violet-200">
          <div className="text-[10px] text-violet-600 uppercase tracking-wide">Action Items</div>
          <div className="text-2xl font-bold text-violet-700">{stats.totalActions}</div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
          <div className="text-[10px] text-emerald-600 uppercase tracking-wide">Completed</div>
          <div className="text-2xl font-bold text-emerald-700">{stats.completedActions}</div>
        </div>
        <div className="rounded-lg p-3 border" style={{
          backgroundColor: stats.progressPct >= 80 ? '#ecfdf5' : stats.progressPct >= 40 ? '#fffbeb' : '#fef2f2',
          borderColor: stats.progressPct >= 80 ? '#a7f3d0' : stats.progressPct >= 40 ? '#fde68a' : '#fecaca',
        }}>
          <div className="text-[10px] uppercase tracking-wide" style={{
            color: stats.progressPct >= 80 ? '#059669' : stats.progressPct >= 40 ? '#d97706' : '#dc2626',
          }}>Progress</div>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold" style={{
              color: stats.progressPct >= 80 ? '#059669' : stats.progressPct >= 40 ? '#d97706' : '#dc2626',
            }}>{stats.progressPct}%</div>
            <div className="flex-1 h-2 bg-white/50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${stats.progressPct}%`,
                  backgroundColor: stats.progressPct >= 80 ? '#10b981' : stats.progressPct >= 40 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      {!compact && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Category:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              {(Object.keys(CATEGORY_CONFIG) as GapCategory[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? 'all' : cat)}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                    selectedCategory === cat
                      ? 'text-white'
                      : 'hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: selectedCategory === cat ? CATEGORY_CONFIG[cat].color : `${CATEGORY_CONFIG[cat].color}20`,
                    color: selectedCategory === cat ? 'white' : CATEGORY_CONFIG[cat].color,
                  }}
                >
                  {CATEGORY_CONFIG[cat].label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Priority:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setSelectedPriority('all')}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                  selectedPriority === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              {(Object.keys(PRIORITY_CONFIG) as GapPriority[]).map(pri => (
                <button
                  key={pri}
                  onClick={() => setSelectedPriority(selectedPriority === pri ? 'all' : pri)}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                    selectedPriority === pri
                      ? 'text-white'
                      : 'hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: selectedPriority === pri ? PRIORITY_CONFIG[pri].color : `${PRIORITY_CONFIG[pri].color}20`,
                    color: selectedPriority === pri ? 'white' : PRIORITY_CONFIG[pri].color,
                  }}
                >
                  {PRIORITY_CONFIG[pri].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Gap Cards */}
      <div className="space-y-4">
        {filteredGaps.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Icon name="check-circle" className="w-12 h-12 mx-auto mb-3 text-emerald-300" strokeWidth={1.5} />
            <div className="text-sm font-medium">No gaps match the current filters</div>
            <div className="text-xs mt-1">Try adjusting your filter criteria</div>
          </div>
        ) : (
          filteredGaps.map(gap => {
            const progress = getGapProgress(gap);
            const isExpanded = expandedGaps.has(gap.id) || compact;
            const priorityConfig = PRIORITY_CONFIG[gap.priority];
            const categoryConfig = CATEGORY_CONFIG[gap.category];

            return (
              <div
                key={gap.id}
                className={`rounded-xl border-2 overflow-hidden transition-all ${
                  progress.pct === 100
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : `${priorityConfig.bgColor} ${priorityConfig.borderColor}`
                }`}
              >
                {/* Gap Header */}
                <button
                  onClick={() => toggleGap(gap.id)}
                  className="w-full p-4 text-left hover:bg-white/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${categoryConfig.color}20` }}
                      >
                        <Icon name={gap.icon} className="w-5 h-5" style={{ color: categoryConfig.color }} strokeWidth={2} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900">{gap.title}</span>
                          <span
                            className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: `${priorityConfig.color}20`, color: priorityConfig.color }}
                          >
                            {priorityConfig.label}
                          </span>
                          <span
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: `${categoryConfig.color}20`, color: categoryConfig.color }}
                          >
                            {categoryConfig.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {gap.framework} {gap.article && <span className="text-slate-400">({gap.article})</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-semibold" style={{
                          color: progress.pct === 100 ? '#059669' : progress.pct > 0 ? '#d97706' : '#64748b',
                        }}>
                          {progress.completed}/{progress.total}
                        </div>
                        <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${progress.pct}%`,
                              backgroundColor: progress.pct === 100 ? '#10b981' : progress.pct > 0 ? '#f59e0b' : '#94a3b8',
                            }}
                          />
                        </div>
                      </div>
                      <Icon
                        name="chevron-down"
                        className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-200/50">
                    <p className="text-xs text-slate-600 mt-3 mb-4">{gap.description}</p>

                    {/* Platform Provides */}
                    <div className="mb-4">
                      <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <Icon name="check-circle" className="w-3.5 h-3.5" />
                        What the Platform Provides
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                        {gap.platformProvides.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-600 bg-emerald-50/50 rounded px-2 py-1.5">
                            <Icon name="check" className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                      {gap.governLink && (
                        <Link
                          to={gap.governLink.path}
                          className="inline-flex items-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-700 mt-2"
                        >
                          <Icon name="arrow-right" className="w-3 h-3" />
                          {gap.governLink.label}
                        </Link>
                      )}
                    </div>

                    {/* Organization Must Do */}
                    <div className="mb-4">
                      <div className="text-[10px] font-semibold text-violet-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <Icon name="clipboard-document-list" className="w-3.5 h-3.5" />
                        Organization Must Do
                      </div>
                      <div className="space-y-2">
                        {gap.organizationMustDo.map(action => (
                          <div
                            key={action.id}
                            className={`p-2.5 rounded-lg border transition-all ${
                              completedActions[action.id]
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleAction(action.id); }}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                                  completedActions[action.id]
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'border-slate-300 hover:border-violet-400'
                                }`}
                              >
                                {completedActions[action.id] && <Icon name="check" className="w-3 h-3" />}
                              </button>
                              <div className="flex-1">
                                <div className={`text-xs font-medium ${
                                  completedActions[action.id] ? 'text-slate-400 line-through' : 'text-slate-800'
                                }`}>
                                  {action.label}
                                </div>
                                {action.description && (
                                  <div className="text-[10px] text-slate-500 mt-0.5">{action.description}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-wrap gap-4 pt-3 border-t border-slate-200/50 text-[10px]">
                      <div>
                        <span className="text-slate-400">Suggested Owner:</span>{' '}
                        <span className="font-medium text-slate-700">{gap.suggestedOwner}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Timeline:</span>{' '}
                        <span className="font-medium text-slate-700">{gap.recommendedTimeline}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Legend */}
      {!compact && (
        <div className="mt-6 pt-4 border-t border-slate-200">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Gap Categories</div>
          <div className="flex flex-wrap gap-4">
            {(Object.entries(CATEGORY_CONFIG) as [GapCategory, typeof CATEGORY_CONFIG['hybrid']][]).map(([key, config]) => (
              <div key={key} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: config.color }} />
                <div>
                  <span className="text-xs font-medium text-slate-700">{config.label}:</span>{' '}
                  <span className="text-[10px] text-slate-500">{config.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Compact Export ───────────────────────────

/**
 * Compact version for embedding in framework-specific views
 */
export function ComplianceGapGuidanceCompact({ framework }: { framework: string }) {
  return <ComplianceGapGuidance embedded compact filterFramework={framework} />;
}
