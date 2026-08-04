/**
 * Iso42001View — ISO/IEC 42001:2023 (AI Management Systems) deep-dive compliance view.
 *
 * Comprehensive view showing:
 * - Hero section explaining the first international AI management system standard
 * - ISO certification context callout
 * - PDCA cycle visualization (Plan-Do-Check-Act)
 * - Control categories based on ISO 42001 Annex A structure
 * - Certification readiness tracker
 * - Integration with existing ISO certifications (27001, 9001)
 *
 * Backend-first design; falls back to mock data when offline.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { COMPLIANCE_CENTER_FRAMEWORKS } from './mockData';
import { Icon, type IconName } from './icons';
import { ComplianceGapGuidanceCompact } from './compliance/ComplianceGapGuidance';

// ───────────────────────────────────── Types ─────────────────────────────────────

type PDCAPhase = 'plan' | 'do' | 'check' | 'act';

interface CertificationMilestone {
  step: string;
  status: 'complete' | 'in-progress' | 'not-started';
  date?: string;
  dueDate?: string;
  owner: string;
}

// ISO 42001 Certification Phase type
type CertPhaseStatus = 'not-started' | 'in-progress' | 'complete';

interface CertificationPhase {
  id: number;
  name: string;
  description: string;
  status: CertPhaseStatus;
  targetDate?: string;
  completedDate?: string;
  evidence: string[];
  notes?: string;
  governLink?: { path: string; label: string };
  icon: IconName;
}

interface AnnexAControl {
  id: string;
  title: string;
  objective: string;
  status: 'implemented' | 'partial' | 'planned';
}

// ───────────────────────────────────── PDCA Metadata ─────────────────────────────────────

const pdcaPhases: Record<PDCAPhase, { label: string; color: string; bgLight: string; border: string; clauses: string; description: string }> = {
  plan: {
    label: 'Plan',
    color: 'text-violet-700',
    bgLight: 'bg-violet-50',
    border: 'border-violet-200',
    clauses: 'Clauses 4-6',
    description: 'Establish AI policy, objectives, and processes to deliver results aligned with organizational context and stakeholder needs',
  },
  do: {
    label: 'Do',
    color: 'text-sky-700',
    bgLight: 'bg-sky-50',
    border: 'border-sky-200',
    clauses: 'Clauses 7-8',
    description: 'Implement the planned processes, controls, and AI system lifecycle management activities',
  },
  check: {
    label: 'Check',
    color: 'text-amber-700',
    bgLight: 'bg-amber-50',
    border: 'border-amber-200',
    clauses: 'Clause 9',
    description: 'Monitor, measure, analyze and evaluate AIMS performance against objectives and report results',
  },
  act: {
    label: 'Act',
    color: 'text-emerald-700',
    bgLight: 'bg-emerald-50',
    border: 'border-emerald-200',
    clauses: 'Clause 10',
    description: 'Take actions to continually improve AIMS suitability, adequacy, and effectiveness',
  },
};

const statusMeta: Record<string, { icon: string; badge: string; label: string }> = {
  pass: { icon: '', badge: 'bg-emerald-100 text-emerald-700', label: 'Compliant' },
  'in-progress': { icon: '!', badge: 'bg-amber-100 text-amber-700', label: 'In Progress' },
  fail: { icon: '', badge: 'bg-rose-100 text-rose-700', label: 'Gap' },
  'not-started': { icon: '', badge: 'bg-slate-100 text-slate-500', label: 'Not Started' },
  implemented: { icon: '', badge: 'bg-emerald-100 text-emerald-700', label: 'Implemented' },
  partial: { icon: '!', badge: 'bg-amber-100 text-amber-700', label: 'Partial' },
  planned: { icon: '', badge: 'bg-slate-100 text-slate-500', label: 'Planned' },
};

// ───────────────────────────────────── Mock Data ─────────────────────────────────────

// Certification readiness milestones
const CERTIFICATION_MILESTONES: CertificationMilestone[] = [
  { step: 'Gap Analysis & Scope Definition', status: 'complete', date: '2026-01-15', owner: 'AI Governance Council' },
  { step: 'AI Policy & Objectives Established', status: 'complete', date: '2026-02-01', owner: 'C-Suite' },
  { step: 'Risk Assessment & Treatment Plan', status: 'complete', date: '2026-03-01', owner: 'Risk Management' },
  { step: 'AIMS Documentation Complete', status: 'complete', date: '2026-04-01', owner: 'Compliance' },
  { step: 'Annex A Controls Implementation', status: 'in-progress', dueDate: '2026-08-01', owner: 'AI Governance Council' },
  { step: 'Internal Audit Cycle', status: 'in-progress', dueDate: '2026-09-01', owner: 'Internal Audit' },
  { step: 'Management Review', status: 'not-started', dueDate: '2026-09-15', owner: 'C-Suite' },
  { step: 'Stage 1 Certification Audit', status: 'not-started', dueDate: '2026-10-01', owner: 'External Auditor' },
  { step: 'Stage 2 Certification Audit', status: 'not-started', dueDate: '2026-11-01', owner: 'External Auditor' },
];

// Annex A control objectives (simplified structure)
const ANNEX_A_CONTROLS: AnnexAControl[] = [
  { id: 'A.2', title: 'AI Policies', objective: 'Establish policies for responsible AI aligned with organizational objectives', status: 'implemented' },
  { id: 'A.3', title: 'Internal Organization', objective: 'Define roles, responsibilities, and governance structures for AI', status: 'implemented' },
  { id: 'A.4', title: 'Resources for AI Systems', objective: 'Ensure adequate resources including computing, data, and human expertise', status: 'implemented' },
  { id: 'A.5', title: 'Assessing AI System Impacts', objective: 'Assess societal, individual, and organizational impacts of AI systems', status: 'implemented' },
  { id: 'A.6', title: 'AI System Lifecycle', objective: 'Manage AI systems through design, development, deployment, and retirement', status: 'partial' },
  { id: 'A.7', title: 'Data for AI Systems', objective: 'Ensure data quality, provenance, and appropriate handling throughout lifecycle', status: 'partial' },
  { id: 'A.8', title: 'Information for Interested Parties', objective: 'Provide transparency and communication about AI systems to stakeholders', status: 'partial' },
  { id: 'A.9', title: 'Use of AI Systems', objective: 'Ensure AI systems are used responsibly and in accordance with policies', status: 'implemented' },
  { id: 'A.10', title: 'Third-Party Relationships', objective: 'Manage risks from AI-related suppliers and third-party AI systems', status: 'partial' },
];

// ISO integration opportunities
const ISO_INTEGRATIONS = [
  { standard: 'ISO/IEC 27001', name: 'Information Security', overlap: 'Shared Annex SL structure, information security controls', status: 'certified', synergy: 'High' },
  { standard: 'ISO 9001', name: 'Quality Management', overlap: 'Process approach, PDCA cycle, documented information', status: 'certified', synergy: 'High' },
  { standard: 'ISO 22301', name: 'Business Continuity', overlap: 'Risk assessment, incident management', status: 'certified', synergy: 'Medium' },
  { standard: 'ISO 31000', name: 'Risk Management', overlap: 'Risk identification, analysis, treatment framework', status: 'aligned', synergy: 'High' },
  { standard: 'ISO/IEC 38500', name: 'IT Governance', overlap: 'Governance of AI as part of IT governance', status: 'aligned', synergy: 'Medium' },
];

// ISO 42001 Certification Phases (7-phase model)
const CERTIFICATION_PHASES: CertificationPhase[] = [
  {
    id: 1,
    name: 'Gap Analysis',
    description: 'Understand current state vs. ISO 42001 requirements. Identify gaps in existing AI governance practices.',
    status: 'complete',
    targetDate: '2026-01-31',
    completedDate: '2026-01-15',
    evidence: ['Gap Analysis Report v1.2', 'Current State Assessment', 'Scope Definition Document'],
    notes: 'Completed ahead of schedule. 47 gaps identified across 9 Annex A control areas.',
    governLink: { path: '/maturity-assessment', label: 'Maturity Assessment' },
    icon: 'magnifying-glass',
  },
  {
    id: 2,
    name: 'AIMS Design',
    description: 'Design the AI Management System structure, policies, roles, and governance framework.',
    status: 'complete',
    targetDate: '2026-03-15',
    completedDate: '2026-03-01',
    evidence: ['AIMS Policy Document', 'AI Governance Charter', 'Roles & Responsibilities Matrix', 'Risk Treatment Plan'],
    notes: 'Management approved AIMS policy. Governance council established.',
    governLink: { path: '/govern/risk', label: 'Risk Management' },
    icon: 'clipboard-list',
  },
  {
    id: 3,
    name: 'Implementation',
    description: 'Deploy controls, integrate AIMS into operations. Implement Annex A controls across all AI systems.',
    status: 'in-progress',
    targetDate: '2026-08-01',
    evidence: ['Control Implementation Log', 'Model Governance Procedures', 'Data Quality Standards'],
    notes: '65% of Annex A controls implemented. Focus areas: A.6 Lifecycle, A.7 Data, A.10 Third-Party. See also: Data Governance (/govern/data).',
    governLink: { path: '/govern/models', label: 'Model Management' },
    icon: 'wrench-screwdriver',
  },
  {
    id: 4,
    name: 'Internal Audit',
    description: 'Pre-certification check to verify AIMS effectiveness. Internal audit against ISO 42001 requirements.',
    status: 'not-started',
    targetDate: '2026-09-01',
    evidence: [],
    notes: 'Internal audit team trained. Audit program designed.',
    governLink: { path: '/govern/audit', label: 'Audit & Incidents' },
    icon: 'clipboard',
  },
  {
    id: 5,
    name: 'Stage 1 Audit',
    description: 'External auditor documentation review. Verify AIMS design and readiness for Stage 2.',
    status: 'not-started',
    targetDate: '2026-10-01',
    evidence: [],
    notes: 'Certification body selected: BSI. Stage 1 audit scheduled.',
    icon: 'document-check',
  },
  {
    id: 6,
    name: 'Stage 2 Audit',
    description: 'Implementation verification audit. External auditor confirms AIMS is effectively implemented.',
    status: 'not-started',
    targetDate: '2026-11-01',
    evidence: [],
    notes: 'Dependent on successful Stage 1 completion.',
    icon: 'shield-check',
  },
  {
    id: 7,
    name: 'Certification Decision',
    description: 'Certification body reviews audit findings and issues ISO 42001 certificate if conformant.',
    status: 'not-started',
    targetDate: '2026-11-30',
    evidence: [],
    notes: 'Target: Q4 2026 certification.',
    icon: 'check-badge',
  },
];

// ───────────────────────────────────── Component ─────────────────────────────────────

interface Iso42001ViewProps {
  embedded?: boolean;
  onNavigateToProgram?: () => void;
}

export default function Iso42001View({ embedded = false, onNavigateToProgram }: Iso42001ViewProps = {}) {
  const [selectedPhase, setSelectedPhase] = useState<PDCAPhase | null>(null);
  const [certReadinessExpanded, setCertReadinessExpanded] = useState(true);
  const [expandedCertPhase, setExpandedCertPhase] = useState<number | null>(null);

  // Get the ISO 42001 framework from COMPLIANCE_CENTER_FRAMEWORKS
  const isoFramework = useMemo(() => {
    return COMPLIANCE_CENTER_FRAMEWORKS.find(fw => fw.id === 'iso-42001');
  }, []);

  // Compute certification readiness percentage from 7-phase model
  const certReadinessStats = useMemo(() => {
    const completed = CERTIFICATION_PHASES.filter(p => p.status === 'complete').length;
    const inProgress = CERTIFICATION_PHASES.filter(p => p.status === 'in-progress').length;
    const notStarted = CERTIFICATION_PHASES.filter(p => p.status === 'not-started').length;
    const total = CERTIFICATION_PHASES.length;
    // Weight: complete = 100%, in-progress = 50%
    const weightedProgress = (completed * 100 + inProgress * 50) / total;
    return { completed, inProgress, notStarted, total, pct: Math.round(weightedProgress) };
  }, []);

  // Compute stats from the framework controls
  const stats = useMemo(() => {
    if (!isoFramework) return { total: 0, passed: 0, inProgress: 0, failed: 0, conformancePct: 0 };
    const allControls = isoFramework.categories.flatMap(c => c.controls);
    const total = allControls.length;
    const passed = allControls.filter(c => c.status === 'pass').length;
    const inProgress = allControls.filter(c => c.status === 'in-progress').length;
    const failed = allControls.filter(c => c.status === 'fail').length;
    const notStarted = allControls.filter(c => c.status === 'not-started').length;
    const applicable = total - notStarted;
    const conformancePct = applicable > 0 ? Math.round((passed / applicable) * 100) : 0;
    return { total, passed, inProgress, failed, conformancePct };
  }, [isoFramework]);

  // Count Annex A controls by status
  const annexAStats = useMemo(() => {
    const implemented = ANNEX_A_CONTROLS.filter(c => c.status === 'implemented').length;
    const partial = ANNEX_A_CONTROLS.filter(c => c.status === 'partial').length;
    const planned = ANNEX_A_CONTROLS.filter(c => c.status === 'planned').length;
    return { implemented, partial, planned, total: ANNEX_A_CONTROLS.length };
  }, []);

  // Certification progress
  const certProgress = useMemo(() => {
    const complete = CERTIFICATION_MILESTONES.filter(m => m.status === 'complete').length;
    const total = CERTIFICATION_MILESTONES.length;
    return { complete, total, pct: Math.round((complete / total) * 100) };
  }, []);

  const body = (
    <div className="space-y-6">
      {/* Program Builder Link */}
      {onNavigateToProgram && (
        <div className="flex items-center justify-between bg-violet-50 rounded-xl border border-violet-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-violet-600 text-sm">ISO</span>
            <span className="text-sm text-violet-800">Track ISO 42001 controls in your governance program</span>
          </div>
          <button
            onClick={onNavigateToProgram}
            className="text-xs font-medium px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
          >
            Add to Program
          </button>
        </div>
      )}

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-violet-50 to-sky-50 rounded-xl border border-violet-200/60 p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-lg">ISO</span>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">ISO/IEC 42001:2023</h2>
            <p className="text-sm text-slate-600 mt-1">
              The first international standard for Artificial Intelligence Management Systems (AIMS).
              Published December 2023, it provides a framework for organizations to establish, implement,
              maintain, and continually improve an AI management system.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-[10px] px-2 py-1 rounded-full bg-violet-100 text-violet-700 font-medium">First Certifiable AI Standard</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-sky-100 text-sky-700 font-medium">ISO High-Level Structure</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">December 2023</span>
            </div>
          </div>
        </div>
      </div>

      {/* ISO Certification Context Callout */}
      <div className="bg-sky-50 rounded-xl border border-sky-200 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-sky-900">Certification Pathway</h3>
            <p className="text-[11px] text-sky-700 mt-1 leading-relaxed">
              ISO 42001 follows the ISO High-Level Structure (Annex SL), enabling integration with existing
              certifications like ISO 27001 (Information Security) and ISO 9001 (Quality Management).
              Organizations already certified to these standards can leverage existing processes, documentation,
              and audit cycles to accelerate ISO 42001 certification.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Clause Requirements" value={stats.total} />
        <StatCard label="Compliant" value={stats.passed} variant="success" />
        <StatCard label="In Progress" value={stats.inProgress} variant="warning" />
        <StatCard label="Conformance" value={`${stats.conformancePct}%`} variant="info" sub="excl. not started" />
        <StatCard label="Cert Progress" value={`${certProgress.pct}%`} variant="info" sub={`${certProgress.complete}/${certProgress.total} steps`} />
      </div>

      {/* PDCA Cycle Visualization */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">PDCA Management System Model</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Plan-Do-Check-Act cycle for continual improvement (ISO Annex SL)</p>
          </div>
          {selectedPhase && (
            <button
              onClick={() => setSelectedPhase(null)}
              className="text-[10px] text-slate-500 hover:text-slate-700"
            >
              Clear selection
            </button>
          )}
        </div>

        {/* PDCA Cycle Visual - Grid layout */}
        <div className="grid grid-cols-4 gap-2 py-4">
          {(['plan', 'do', 'check', 'act'] as PDCAPhase[]).map(phase => {
            const meta = pdcaPhases[phase];
            const isSelected = selectedPhase === phase || !selectedPhase;
            return (
              <button
                key={phase}
                onClick={() => setSelectedPhase(selectedPhase === phase ? null : phase)}
                className={`p-4 rounded-xl flex flex-col items-center justify-center transition-all border-2 ${
                  isSelected ? `${meta.bgLight} ${meta.border} shadow-md` : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <span className={`text-sm font-bold ${meta.color}`}>{meta.label.toUpperCase()}</span>
                <span className="text-[9px] text-slate-500 mt-1">{meta.clauses}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Phase Description */}
        {selectedPhase && (
          <div className={`mt-4 p-4 rounded-lg ${pdcaPhases[selectedPhase].bgLight} ${pdcaPhases[selectedPhase].border} border`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-sm font-bold ${pdcaPhases[selectedPhase].color}`}>{pdcaPhases[selectedPhase].label}</span>
              <span className="text-[10px] text-slate-500">({pdcaPhases[selectedPhase].clauses})</span>
            </div>
            <p className="text-[11px] text-slate-600">{pdcaPhases[selectedPhase].description}</p>
          </div>
        )}
      </div>

      {/* Annex A Control Objectives */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Annex A Control Objectives</div>
            <div className="text-[10px] text-slate-500 mt-0.5">AI-specific controls to support AIMS implementation</div>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1 text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {annexAStats.implemented} implemented
            </span>
            <span className="flex items-center gap-1 text-amber-600">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              {annexAStats.partial} partial
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <span className="w-2 h-2 rounded-full bg-slate-300" />
              {annexAStats.planned} planned
            </span>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {ANNEX_A_CONTROLS.map(ctrl => {
            const sm = statusMeta[ctrl.status];
            return (
              <div key={ctrl.id} className="px-5 py-3 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-[11px] font-bold text-violet-700">{ctrl.id}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-slate-800">{ctrl.title}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{ctrl.objective}</div>
                </div>
                <span className={`text-[9px] font-semibold px-2 py-1 rounded ${sm.badge}`}>{sm.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ISO 42001 Certification Readiness Tracker - 7-Phase Model */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-violet-200/60 shadow-sm overflow-hidden">
        {/* Collapsible Header */}
        <button
          onClick={() => setCertReadinessExpanded(!certReadinessExpanded)}
          className="w-full px-5 py-3 border-b border-slate-100 flex items-center justify-between hover:bg-violet-50/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center flex-shrink-0">
              <Icon name="check-badge" className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-900">ISO 42001 Certification Readiness</div>
              <div className="text-[10px] text-slate-500 mt-0.5">7-phase certification journey toward AIMS compliance</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Overall readiness gauge */}
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-lg font-bold text-violet-700">{certReadinessStats.pct}%</div>
                <div className="text-[9px] text-slate-500">Readiness</div>
              </div>
              <div className="w-16 h-16 relative">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none" stroke="url(#certGradient)" strokeWidth="3"
                    strokeDasharray={`${certReadinessStats.pct} ${100 - certReadinessStats.pct}`}
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="certGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[9px] font-semibold text-violet-600">{certReadinessStats.completed}/{certReadinessStats.total}</span>
                </div>
              </div>
            </div>
            <Icon
              name={certReadinessExpanded ? 'chevron-up' : 'chevron-down'}
              className="w-5 h-5 text-slate-400"
            />
          </div>
        </button>

        {/* Expanded Content */}
        {certReadinessExpanded && (
          <div className="p-5">
            {/* Phase summary stats */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-lg font-bold text-emerald-700">{certReadinessStats.completed}</div>
                <div className="text-[10px] text-emerald-600">Phases Complete</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-lg font-bold text-amber-700">{certReadinessStats.inProgress}</div>
                <div className="text-[10px] text-amber-600">In Progress</div>
              </div>
              <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 text-center">
                <div className="text-lg font-bold text-slate-600">{certReadinessStats.notStarted}</div>
                <div className="text-[10px] text-slate-500">Not Started</div>
              </div>
            </div>

            {/* Phase Timeline */}
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-gradient-to-b from-emerald-300 via-amber-300 to-slate-200" />

              <div className="space-y-3">
                {CERTIFICATION_PHASES.map((phase) => {
                  const isComplete = phase.status === 'complete';
                  const isInProgress = phase.status === 'in-progress';
                  const isExpanded = expandedCertPhase === phase.id;

                  return (
                    <div key={phase.id} className="relative">
                      {/* Phase Card */}
                      <button
                        onClick={() => setExpandedCertPhase(isExpanded ? null : phase.id)}
                        className={`w-full text-left pl-14 pr-4 py-3 rounded-lg border transition-all ${
                          isComplete ? 'bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50' :
                          isInProgress ? 'bg-amber-50/50 border-amber-200 hover:bg-amber-50' :
                          'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {/* Phase number circle */}
                        <div className={`absolute left-0 w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                          isComplete ? 'bg-emerald-100 border-emerald-400' :
                          isInProgress ? 'bg-amber-100 border-amber-400 animate-pulse' :
                          'bg-slate-100 border-slate-300'
                        }`}>
                          {isComplete ? (
                            <Icon name="check" className="w-5 h-5 text-emerald-600" />
                          ) : (
                            <span className={`text-sm font-bold ${isInProgress ? 'text-amber-700' : 'text-slate-500'}`}>
                              {phase.id}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Icon name={phase.icon} className={`w-4 h-4 ${
                                isComplete ? 'text-emerald-600' : isInProgress ? 'text-amber-600' : 'text-slate-400'
                              }`} />
                              <span className="text-[11px] font-semibold text-slate-800">
                                Phase {phase.id}: {phase.name}
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                isComplete ? 'bg-emerald-100 text-emerald-700' :
                                isInProgress ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-500'
                              }`}>
                                {isComplete ? 'Complete' : isInProgress ? 'In Progress' : 'Not Started'}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{phase.description}</p>
                          </div>
                          <div className="flex items-center gap-3 ml-3">
                            <div className="text-right">
                              <div className="text-[9px] text-slate-400">
                                {phase.completedDate ? 'Completed' : 'Target'}
                              </div>
                              <div className={`text-[10px] font-medium ${
                                phase.completedDate ? 'text-emerald-600' : 'text-slate-600'
                              }`}>
                                {phase.completedDate || phase.targetDate}
                              </div>
                            </div>
                            <Icon
                              name={isExpanded ? 'chevron-up' : 'chevron-down'}
                              className="w-4 h-4 text-slate-400"
                            />
                          </div>
                        </div>
                      </button>

                      {/* Expanded Phase Details */}
                      {isExpanded && (
                        <div className="mt-2 ml-14 mr-4 p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            {/* Target/Completed Date */}
                            <div>
                              <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
                                <Icon name="calendar" className="w-3 h-3 inline mr-1" />
                                {phase.completedDate ? 'Completed' : 'Target Date'}
                              </div>
                              <div className={`text-[11px] font-medium ${
                                phase.completedDate ? 'text-emerald-600' : 'text-slate-700'
                              }`}>
                                {phase.completedDate || phase.targetDate || 'Not scheduled'}
                              </div>
                            </div>

                            {/* Status */}
                            <div>
                              <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
                                <Icon name="flag" className="w-3 h-3 inline mr-1" />
                                Status
                              </div>
                              <div className={`text-[11px] font-medium ${
                                isComplete ? 'text-emerald-600' : isInProgress ? 'text-amber-600' : 'text-slate-500'
                              }`}>
                                {isComplete ? 'Completed' : isInProgress ? 'In Progress' : 'Not Started'}
                              </div>
                            </div>
                          </div>

                          {/* Evidence Documents */}
                          <div className="mb-4">
                            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-2">
                              <Icon name="paper-clip" className="w-3 h-3 inline mr-1" />
                              Evidence Documents ({phase.evidence.length})
                            </div>
                            {phase.evidence.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {phase.evidence.map((doc, i) => (
                                  <span
                                    key={i}
                                    className="text-[9px] px-2 py-1 bg-violet-50 text-violet-700 rounded border border-violet-200"
                                  >
                                    <Icon name="document" className="w-3 h-3 inline mr-1" />
                                    {doc}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-400 italic">No evidence attached yet</div>
                            )}
                          </div>

                          {/* Notes */}
                          {phase.notes && (
                            <div className="mb-4">
                              <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
                                <Icon name="chat-bubble" className="w-3 h-3 inline mr-1" />
                                Notes
                              </div>
                              <div className="text-[10px] text-slate-600 bg-slate-50 rounded p-2 border border-slate-100">
                                {phase.notes}
                              </div>
                            </div>
                          )}

                          {/* Link to Govern Module */}
                          {phase.governLink && (
                            <div className="pt-3 border-t border-slate-100">
                              <Link
                                to={phase.governLink.path}
                                className="inline-flex items-center gap-1.5 text-[10px] font-medium text-violet-600 hover:text-violet-800 transition-colors"
                              >
                                <Icon name="arrow-right" className="w-3 h-3" />
                                Go to {phase.governLink.label}
                              </Link>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Certification Target Banner */}
            <div className="mt-5 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-lg border border-violet-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <Icon name="rocket-launch" className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-violet-800">Certification Target: Q4 2026</div>
                  <div className="text-[10px] text-violet-600">
                    On track for ISO/IEC 42001:2023 certification by November 2026 via BSI Group
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legacy Certification Milestones (Implementation Detail) */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-900">Implementation Milestones</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Detailed task tracking within certification phases</div>
        </div>
        <div className="p-5">
          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-slate-600">Milestone Progress</span>
              <span className="font-semibold text-violet-700">{certProgress.pct}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-violet-600 rounded-full transition-all"
                style={{ width: `${certProgress.pct}%` }}
              />
            </div>
          </div>

          {/* Timeline */}
          <div className="relative">
            <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-slate-200" />
            <div className="space-y-4">
              {CERTIFICATION_MILESTONES.map((m, idx) => {
                const isComplete = m.status === 'complete';
                const isInProgress = m.status === 'in-progress';
                return (
                  <div key={idx} className="relative flex items-start gap-4 pl-8">
                    <div className={`absolute left-0 w-6 h-6 rounded-full flex items-center justify-center ${
                      isComplete ? 'bg-emerald-100 border-2 border-emerald-400' :
                      isInProgress ? 'bg-amber-100 border-2 border-amber-400 animate-pulse' :
                      'bg-slate-100 border-2 border-slate-300'
                    }`}>
                      {isComplete && <Icon name="check" className="w-3 h-3 text-emerald-600" />}
                      {isInProgress && <span className="text-amber-600 text-[10px]">!</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-800">{m.step}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          isComplete ? 'bg-emerald-100 text-emerald-700' :
                          isInProgress ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {isComplete ? 'Complete' : isInProgress ? 'In Progress' : 'Not Started'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {m.date ? `Completed: ${m.date}` : `Due: ${m.dueDate}`} | Owner: {m.owner}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Control Categories from Framework Data */}
      {isoFramework && (
        <>
          {isoFramework.categories.map(cat => (
            <div key={cat.name} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="px-5 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-900">{cat.name}</div>
              <div className="divide-y divide-slate-100">
                {cat.controls.map(ctrl => {
                  const sm = statusMeta[ctrl.status] ?? statusMeta['not-started'];
                  return (
                    <div key={ctrl.id} className="px-5 py-3 flex items-center gap-3">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${sm.badge}`}>{sm.label}</span>
                      <div className="flex-1">
                        <div className="text-[11px] font-semibold text-slate-800">{ctrl.id} | {ctrl.label}</div>
                        <div className="text-[10px] text-slate-400">{ctrl.section}{ctrl.owner ? ` | Owner: ${ctrl.owner}` : ''}</div>
                        {ctrl.evidence && ctrl.evidence !== '' && <div className="text-[9px] text-slate-400 mt-0.5">Evidence: {ctrl.evidence}</div>}
                      </div>
                      {ctrl.dueDate && <div className="text-[9px] text-amber-600">Due: {ctrl.dueDate}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ISO Integration Opportunities */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-900">ISO Integration Opportunities</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Leverage existing ISO certifications for integrated management</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">Standard</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">Name</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">Overlap Areas</th>
                <th className="px-4 py-2 text-center font-semibold text-slate-700 w-24">Status</th>
                <th className="px-4 py-2 text-center font-semibold text-slate-700 w-20">Synergy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ISO_INTEGRATIONS.map(iso => (
                <tr key={iso.standard} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2 font-semibold text-violet-700">{iso.standard}</td>
                  <td className="px-4 py-2 text-slate-700">{iso.name}</td>
                  <td className="px-4 py-2 text-slate-500">{iso.overlap}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                      iso.status === 'certified' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
                    }`}>
                      {iso.status === 'certified' ? 'Certified' : 'Aligned'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-[9px] font-semibold ${
                      iso.synergy === 'High' ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      {iso.synergy}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-sky-50 border-t border-sky-100">
          <div className="text-[10px] text-sky-700">
            <strong>Integration benefit:</strong> Organizations certified to ISO 27001 and ISO 9001 can
            leverage up to 60% of existing documentation, processes, and audit cycles for ISO 42001 certification.
          </div>
        </div>
      </div>

      {/* Beyond the Platform - Organizational Actions */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="clipboard-document-list" className="w-4 h-4 text-violet-600" strokeWidth={2} />
            <span className="text-sm font-semibold text-slate-800">ISO 42001: Organizational Actions Required</span>
          </div>
          <Link
            to="/govern/compliance?tab=gap-guidance"
            className="text-[10px] text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
          >
            View All Gaps
            <Icon name="arrow-right" className="w-3 h-3" />
          </Link>
        </div>
        <p className="text-[10px] text-slate-500 mb-3">
          The platform tracks AIMS controls, but certification requires management reviews, external audits, and ongoing organizational commitment.
        </p>
        <ComplianceGapGuidanceCompact framework="ISO 42001" />
      </div>

      {/* Footnote */}
      <p className="text-[10px] text-slate-400">
        Reference: ISO/IEC 42001:2023 — Information technology - Artificial intelligence - Management system.
        Published December 2023 by ISO/IEC JTC 1/SC 42. Control statuses are illustrative pending integration
        with a compliance management backend.
      </p>
    </div>
  );

  if (embedded) return body;

  return (
    <GovernPageLayout
      title="ISO/IEC 42001:2023 (AI Management Systems)"
      description="The first international standard for establishing, implementing, maintaining, and improving an AI management system. Certifiable via accredited bodies."
      badge={<MockDataBadge integration="ISO 42001 mapping - control-plane backend (DynamoDB)" />}
    >
      {body}
    </GovernPageLayout>
  );
}
