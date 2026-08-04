/**
 * CriAiRmfView — CRI Financial Services AI Risk Management Framework deep-dive view.
 *
 * Comprehensive view showing:
 * - Framework overview with FSI-specific context
 * - Control categories aligned with CRI's 7 domains (Governance, Data, Development, etc.)
 * - NIST CSF + AI RMF alignment visualization
 * - Third-party AI vendor risk considerations
 * - Model risk management integration points
 * - AWS service mapping for automated detection
 *
 * Backend-first design; falls back to mock data when offline.
 */
import { useMemo, useState } from 'react';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { COMPLIANCE_CENTER_FRAMEWORKS } from './mockData';

// ───────────────────────────────────── Types ─────────────────────────────────────

interface CriControl {
  id: string;
  label: string;
  section: string;
  status: 'pass' | 'in-progress' | 'fail' | 'not-started';
  evidence?: string;
  owner?: string;
  dueDate?: string;
}

interface CriCategory {
  name: string;
  controls: CriControl[];
}

interface AwsServiceMapping {
  service: string;
  domain: string;
  description: string;
  status: 'active' | 'configured' | 'pending';
}

// ───────────────────────────────────── CRI Domain Metadata ─────────────────────────────────────

const criDomainMeta: Record<string, { color: string; bgLight: string; border: string; icon: string; nistAlignment: string }> = {
  'D1: Governance': {
    color: 'text-violet-700',
    bgLight: 'bg-violet-50',
    border: 'border-violet-200',
    icon: 'GV',
    nistAlignment: 'GOVERN (GV)',
  },
  'D2: Data Management': {
    color: 'text-blue-700',
    bgLight: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'DA',
    nistAlignment: 'MAP (MP)',
  },
  'D3: Model Development': {
    color: 'text-cyan-700',
    bgLight: 'bg-cyan-50',
    border: 'border-cyan-200',
    icon: 'MD',
    nistAlignment: 'MAP (MP) / MEASURE (MS)',
  },
  'D4: Validation & Testing': {
    color: 'text-emerald-700',
    bgLight: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: 'VT',
    nistAlignment: 'MEASURE (MS)',
  },
  'D5: Deployment & Monitoring': {
    color: 'text-amber-700',
    bgLight: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'DM',
    nistAlignment: 'MANAGE (MG)',
  },
  'D6: Third-Party Risk': {
    color: 'text-orange-700',
    bgLight: 'bg-orange-50',
    border: 'border-orange-200',
    icon: 'TP',
    nistAlignment: 'MAP (MP) / MANAGE (MG)',
  },
  'D7: Consumer Protection': {
    color: 'text-rose-700',
    bgLight: 'bg-rose-50',
    border: 'border-rose-200',
    icon: 'CP',
    nistAlignment: 'GOVERN (GV) / MANAGE (MG)',
  },
};

const statusMeta: Record<string, { badge: string; label: string }> = {
  pass: { badge: 'bg-emerald-100 text-emerald-700', label: 'Compliant' },
  'in-progress': { badge: 'bg-amber-100 text-amber-700', label: 'In Progress' },
  fail: { badge: 'bg-rose-100 text-rose-700', label: 'Gap' },
  'not-started': { badge: 'bg-slate-100 text-slate-500', label: 'Not Started' },
};

const awsStatusMeta: Record<string, { dot: string; label: string }> = {
  active: { dot: 'bg-emerald-500', label: 'Active' },
  configured: { dot: 'bg-blue-500', label: 'Configured' },
  pending: { dot: 'bg-amber-400', label: 'Pending' },
};

// ───────────────────────────────────── AWS Service Mappings ─────────────────────────────────────

const AWS_SERVICE_MAPPINGS: AwsServiceMapping[] = [
  { service: 'Bedrock Guardrails', domain: 'D5: Deployment & Monitoring', description: 'Content safety and prompt attack prevention', status: 'active' },
  { service: 'CloudWatch', domain: 'D5: Deployment & Monitoring', description: 'Performance metrics and drift detection', status: 'active' },
  { service: 'CloudTrail', domain: 'D1: Governance', description: 'Audit trail and compliance logging', status: 'active' },
  { service: 'AWS Config', domain: 'D1: Governance', description: 'Automated compliance monitoring', status: 'active' },
  { service: 'Security Hub', domain: 'D6: Third-Party Risk', description: 'Security posture and findings', status: 'active' },
  { service: 'IAM', domain: 'D1: Governance', description: 'Access control and role management', status: 'active' },
  { service: 'SageMaker', domain: 'D3: Model Development', description: 'Model registry and training', status: 'active' },
  { service: 'Bedrock', domain: 'D3: Model Development', description: 'Foundation model catalog', status: 'active' },
  { service: 'Cost Explorer', domain: 'D5: Deployment & Monitoring', description: 'AI spend tracking and forecasting', status: 'active' },
  { service: 'S3', domain: 'D2: Data Management', description: 'Data storage and lineage', status: 'active' },
  { service: 'Lambda', domain: 'D5: Deployment & Monitoring', description: 'Emergency shutdown and automation', status: 'configured' },
  { service: 'EventBridge', domain: 'D5: Deployment & Monitoring', description: 'Anomaly detection events', status: 'configured' },
];

// ───────────────────────────────────── Adoption Stages ─────────────────────────────────────

const ADOPTION_STAGES = [
  { stage: 'Initial', description: 'Beginning AI adoption journey', focus: 'Foundational governance, inventory, basic risk awareness' },
  { stage: 'Minimal', description: 'Basic AI risk management in place', focus: 'Core policies, defined roles, initial monitoring' },
  { stage: 'Evolving', description: 'Maturing AI risk practices', focus: 'Integrated controls, automated monitoring, validation' },
  { stage: 'Embedded', description: 'AI risk fully integrated into enterprise', focus: 'Continuous improvement, proactive risk management' },
];

// ───────────────────────────────────── Component ─────────────────────────────────────

interface CriAiRmfViewProps {
  embedded?: boolean;
  onNavigateToProgram?: () => void;
}

export default function CriAiRmfView({ embedded = false, onNavigateToProgram }: CriAiRmfViewProps) {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set(['D1: Governance']));
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Get the CRI framework from COMPLIANCE_CENTER_FRAMEWORKS
  const criFramework = useMemo(() => {
    return COMPLIANCE_CENTER_FRAMEWORKS.find(fw => fw.id === 'cri-fs-ai-rmf');
  }, []);

  // Compute stats from the framework controls
  const stats = useMemo(() => {
    if (!criFramework) return { total: 0, passed: 0, inProgress: 0, failed: 0, compliancePct: 0, domainsCount: 0 };
    const allControls = criFramework.categories.flatMap(c => c.controls);
    const total = allControls.length;
    const passed = allControls.filter(c => c.status === 'pass').length;
    const inProgress = allControls.filter(c => c.status === 'in-progress').length;
    const failed = allControls.filter(c => c.status === 'fail').length;
    const applicable = total - allControls.filter(c => c.status === 'not-started').length;
    const compliancePct = applicable > 0 ? Math.round((passed / applicable) * 100) : 0;
    return { total, passed, inProgress, failed, compliancePct, domainsCount: criFramework.categories.length };
  }, [criFramework]);

  // Compute per-domain stats
  const domainStats = useMemo(() => {
    if (!criFramework) return {};
    const result: Record<string, { total: number; passed: number; inProgress: number; failed: number; compliancePct: number }> = {};
    criFramework.categories.forEach(cat => {
      const total = cat.controls.length;
      const passed = cat.controls.filter(c => c.status === 'pass').length;
      const inProgress = cat.controls.filter(c => c.status === 'in-progress').length;
      const failed = cat.controls.filter(c => c.status === 'fail').length;
      const compliancePct = total > 0 ? Math.round((passed / total) * 100) : 0;
      result[cat.name] = { total, passed, inProgress, failed, compliancePct };
    });
    return result;
  }, [criFramework]);

  const toggleDomain = (name: string) => {
    const next = new Set(expandedDomains);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setExpandedDomains(next);
  };

  // Filter categories by status
  const filteredCategories = useMemo(() => {
    if (!criFramework || filterStatus === 'all') return criFramework?.categories || [];
    return criFramework.categories.map(cat => ({
      ...cat,
      controls: cat.controls.filter(c => c.status === filterStatus),
    })).filter(cat => cat.controls.length > 0);
  }, [criFramework, filterStatus]);

  const body = (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-slate-50 to-emerald-50/30 rounded-2xl border border-slate-200/60 shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">CRI Financial Services AI Risk Management</h2>
            <p className="text-[11px] text-slate-500 mt-1 max-w-2xl">
              The Cyber Risk Institute (CRI) Financial Services AI RMF is a comprehensive "framework of frameworks"
              providing 230 Control Objectives tailored for financial services AI adoption. Built on NIST AI RMF's
              four functions (Govern, Map, Measure, Manage), it harmonizes with SR 26-2, OSFI E-23, and EU AI Act requirements.
            </p>
          </div>
          <div className="text-right ml-6">
            <div className="text-3xl font-bold text-emerald-700">{stats.compliancePct}%</div>
            <div className="text-[10px] text-slate-500">Overall Compliance</div>
          </div>
        </div>

        {/* NIST AI RMF Alignment Visual */}
        <div className="mt-4 p-4 bg-white/60 rounded-xl border border-slate-200/60">
          <div className="text-[11px] font-semibold text-slate-700 mb-3">NIST AI RMF Alignment</div>
          <div className="flex items-center justify-between gap-2">
            {['GOVERN', 'MAP', 'MEASURE', 'MANAGE'].map((func, idx) => (
              <div key={func} className="flex-1 relative">
                <div className={`p-3 rounded-lg text-center ${
                  func === 'GOVERN' ? 'bg-violet-100 border border-violet-200' :
                  func === 'MAP' ? 'bg-blue-100 border border-blue-200' :
                  func === 'MEASURE' ? 'bg-emerald-100 border border-emerald-200' :
                  'bg-amber-100 border border-amber-200'
                }`}>
                  <div className={`text-[11px] font-bold ${
                    func === 'GOVERN' ? 'text-violet-700' :
                    func === 'MAP' ? 'text-blue-700' :
                    func === 'MEASURE' ? 'text-emerald-700' :
                    'text-amber-700'
                  }`}>{func}</div>
                  <div className="text-[9px] text-slate-500 mt-0.5">
                    {func === 'GOVERN' && 'D1, D7'}
                    {func === 'MAP' && 'D2, D3, D6'}
                    {func === 'MEASURE' && 'D3, D4'}
                    {func === 'MANAGE' && 'D5, D6, D7'}
                  </div>
                </div>
                {idx < 3 && (
                  <div className="absolute top-1/2 -right-1 w-2 h-0.5 bg-slate-300 -translate-y-1/2 hidden md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FSI Context Callout */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-600 text-sm font-bold">FSI</span>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-blue-800">Financial Services Industry Context</div>
            <div className="text-[10px] text-blue-700 mt-1 leading-relaxed">
              Developed by the Cyber Risk Institute in coordination with the Financial Services Sector Coordinating
              Council (FSSCC), this framework addresses unique FSI challenges: model risk management (OCC SR 11-7),
              third-party vendor concentration, fair lending compliance (ECOA/FCRA), consumer protection obligations,
              and regulatory examination expectations. Aligns to the eight AI Trustworthy Principles: Validity, Safety,
              Security, Accountability, Transparency, Explainability, Privacy, and Fairness.
            </div>
          </div>
        </div>
      </div>

      {/* Program Builder Link */}
      {onNavigateToProgram && (
        <div className="flex items-center justify-between bg-emerald-50 rounded-xl border border-emerald-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 text-sm">&#128203;</span>
            <span className="text-sm text-emerald-800">Track CRI FS AI RMF controls in your governance program</span>
          </div>
          <button
            onClick={onNavigateToProgram}
            className="text-xs font-medium px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Add to Program
          </button>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard label="Total Controls" value={stats.total} />
        <StatCard label="Compliant" value={stats.passed} variant="success" />
        <StatCard label="In Progress" value={stats.inProgress} variant="warning" />
        <StatCard label="Gaps" value={stats.failed} variant={stats.failed > 0 ? 'danger' : 'muted'} />
        <StatCard label="Compliance" value={`${stats.compliancePct}%`} variant="info" />
        <StatCard label="Domains" value={stats.domainsCount} sub="CRI control domains" />
      </div>

      {/* Adoption Stage Overview */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="text-sm font-semibold text-slate-900 mb-3">AI Adoption Maturity Stages</div>
        <div className="text-[10px] text-slate-500 mb-4">
          CRI organizes control objectives by adoption stage. Controls scale with organizational AI maturity.
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ADOPTION_STAGES.map((s, idx) => (
            <div key={s.stage} className={`p-3 rounded-lg border ${
              idx === 2 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  idx === 2 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                }`}>{idx + 1}</span>
                <span className={`text-[11px] font-semibold ${idx === 2 ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {s.stage}
                </span>
              </div>
              <div className="text-[9px] text-slate-500">{s.description}</div>
              <div className="text-[9px] text-slate-400 mt-1">{s.focus}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[9px] text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg inline-block">
          Current: Evolving Stage (Stage 3)
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-4 bg-white/80 rounded-xl border border-slate-200/60 px-4 py-2.5">
        <span className="text-[11px] text-slate-500 font-medium">Filter by status:</span>
        <div className="flex items-center gap-2">
          {[
            { value: 'all', label: 'All' },
            { value: 'pass', label: 'Compliant' },
            { value: 'in-progress', label: 'In Progress' },
            { value: 'fail', label: 'Gaps' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`text-[10px] px-2.5 py-1 rounded-lg transition-colors ${
                filterStatus === opt.value
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Domain Control Panels */}
      {filteredCategories.map(cat => {
        const isExpanded = expandedDomains.has(cat.name);
        const meta = criDomainMeta[cat.name] || {
          color: 'text-slate-700',
          bgLight: 'bg-slate-50',
          border: 'border-slate-200',
          icon: '?',
          nistAlignment: 'N/A',
        };
        const dStats = domainStats[cat.name] || { total: 0, passed: 0, inProgress: 0, failed: 0, compliancePct: 0 };

        return (
          <div
            key={cat.name}
            className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm overflow-hidden transition-all ${
              isExpanded ? meta.border : 'border-slate-200/60'
            }`}
          >
            {/* Domain header */}
            <button
              onClick={() => toggleDomain(cat.name)}
              className={`w-full px-5 py-3 flex items-center gap-4 hover:bg-slate-50/50 transition-colors ${
                isExpanded ? meta.bgLight : ''
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isExpanded ? `${meta.bgLight} border ${meta.border}` : 'bg-slate-100'
              }`}>
                <span className={`text-sm font-bold ${isExpanded ? meta.color : 'text-slate-500'}`}>
                  {meta.icon}
                </span>
              </div>
              <div className="flex-1 text-left">
                <div className={`text-sm font-semibold ${isExpanded ? meta.color : 'text-slate-900'}`}>
                  {cat.name}
                </div>
                <div className="text-[10px] text-slate-500">
                  NIST AI RMF: {meta.nistAlignment}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-[9px]">
                  <span className="text-emerald-600 font-medium">{dStats.passed} pass</span>
                  <span className="text-amber-600 font-medium">{dStats.inProgress} prog</span>
                  {dStats.failed > 0 && <span className="text-rose-600 font-medium">{dStats.failed} gap</span>}
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold ${
                    dStats.compliancePct >= 80 ? 'text-emerald-600' :
                    dStats.compliancePct >= 50 ? 'text-amber-600' : 'text-rose-600'
                  }`}>{dStats.compliancePct}%</div>
                  <div className="text-[9px] text-slate-500">{dStats.passed}/{dStats.total}</div>
                </div>
                <svg
                  className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Controls list */}
            {isExpanded && (
              <div className="border-t border-slate-100 divide-y divide-slate-100">
                {cat.controls.map((ctrl: CriControl) => {
                  const sm = statusMeta[ctrl.status] || statusMeta['not-started'];
                  return (
                    <div key={ctrl.id} className="px-5 py-3 flex items-start gap-3">
                      {/* Status badge */}
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${sm.badge}`}>
                        {sm.label}
                      </span>

                      {/* Control info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-semibold text-slate-800">{ctrl.id}</span>
                          <span className="text-[11px] text-slate-700">{ctrl.label}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            {ctrl.section}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                          {ctrl.owner && <span>Owner: <span className="text-slate-600">{ctrl.owner}</span></span>}
                          {ctrl.evidence && <span>Evidence: <span className="text-slate-600">{ctrl.evidence}</span></span>}
                        </div>
                      </div>

                      {/* Due date if any */}
                      {ctrl.dueDate && (
                        <span className="text-[9px] text-amber-600 flex-shrink-0">
                          Due: {ctrl.dueDate}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Third-Party AI Risk Section */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-900">Third-Party AI Vendor Risk Considerations</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            CRI emphasizes unique risks from AI vendors including concentration risk, model explainability gaps, and exit strategy planning
          </div>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
            <div className="text-[11px] font-semibold text-orange-800 mb-2">Concentration Risk</div>
            <ul className="space-y-1 text-[10px] text-orange-700">
              <li className="flex items-start gap-2">
                <span className="text-emerald-600">&#10003;</span>
                Provider diversity analysis complete
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600">&#10003;</span>
                Multi-model fallback configured
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-600">!</span>
                Exit strategy documentation WIP
              </li>
            </ul>
          </div>
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
            <div className="text-[11px] font-semibold text-blue-800 mb-2">Vendor Due Diligence</div>
            <ul className="space-y-1 text-[10px] text-blue-700">
              <li className="flex items-start gap-2">
                <span className="text-emerald-600">&#10003;</span>
                AI-specific DDQ template
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600">&#10003;</span>
                Contract terms include AI clauses
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600">&#10003;</span>
                AI-BOM (Bill of Materials) maintained
              </li>
            </ul>
          </div>
          <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
            <div className="text-[11px] font-semibold text-violet-800 mb-2">Model Risk Integration</div>
            <ul className="space-y-1 text-[10px] text-violet-700">
              <li className="flex items-start gap-2">
                <span className="text-emerald-600">&#10003;</span>
                Aligned to OCC SR 11-7
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600">&#10003;</span>
                Three Lines of Defense model
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600">&#10003;</span>
                MRM Committee oversight
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* AWS Service Coverage */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-900">AWS Service Coverage</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Services providing automated detection and evidence for CRI FS AI RMF controls
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {AWS_SERVICE_MAPPINGS.map(svc => {
              const asm = awsStatusMeta[svc.status];
              return (
                <div key={svc.service} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center">
                    <span className="text-white text-[9px] font-bold">AWS</span>
                  </div>
                  <div className="text-[11px] font-medium text-slate-800 text-center truncate">{svc.service}</div>
                  <div className="text-[9px] text-slate-500 text-center truncate">{svc.domain.split(':')[0]}</div>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${asm.dot}`} />
                    <span className="text-[9px] text-slate-500">{asm.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="text-[10px] text-slate-400 text-center">
        CRI Financial Services AI Risk Management Framework. Control statuses aligned with organizational AI governance maturity.
        Framework integrates NIST AI RMF, SR 11-7, and financial services regulatory expectations.
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <GovernPageLayout
      title="CRI FS AI RMF"
      description="Cyber Risk Institute Financial Services AI Risk Management Framework - 230 Control Objectives with NIST AI RMF alignment and FSI-specific guidance."
      badge={<MockDataBadge integration="CRI FS AI RMF controls - control-plane backend (DynamoDB)" />}
    >
      {body}
    </GovernPageLayout>
  );
}
