/**
 * OsfiE23View — OSFI E-23 Model Risk Management deep-dive view.
 *
 * Comprehensive view of Canada's OSFI Guideline E-23 (Enterprise-wide Model
 * Risk Management) implementation status. E-23 applies to all Federally
 * Regulated Financial Institutions (FRFIs) in Canada and covers ALL models,
 * not just AI/ML. Final guideline issued September 2025, effective January 1, 2025.
 *
 * Key features:
 * - Hero section explaining OSFI E-23 scope and applicability
 * - Canadian regulatory context callout (maple leaf styling)
 * - Control categories based on E-23 structure (Governance, Lifecycle phases)
 * - Comparison to US SR 26-2 (the US equivalent)
 * - Stats cards showing compliance progress
 * - Supports `embedded` prop for ComplianceCenter integration
 */
import { useState, useMemo } from 'react';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { COMPLIANCE_CENTER_FRAMEWORKS } from './mockData';

// ─────────────────────────── Types ───────────────────────────

interface OsfiE23Control {
  id: string;
  label: string;
  section: string;
  status: 'pass' | 'in-progress' | 'fail' | 'not-started';
  evidence?: string;
  owner?: string;
  dueDate?: string;
}

interface OsfiE23Category {
  name: string;
  controls: OsfiE23Control[];
}

interface OsfiE23Framework {
  id: string;
  name: string;
  shortName: string;
  description: string;
  color: string;
  lastAudit: string;
  nextAudit: string;
  categories: OsfiE23Category[];
}

// ─────────────────────────── Status Metadata ───────────────────────────

const statusMeta: Record<string, { icon: string; label: string; badge: string }> = {
  pass: { icon: '+', label: 'Compliant', badge: 'bg-emerald-100 text-emerald-700' },
  'in-progress': { icon: '!', label: 'In Progress', badge: 'bg-amber-100 text-amber-700' },
  fail: { icon: '-', label: 'Gap', badge: 'bg-rose-100 text-rose-700' },
  'not-started': { icon: '=', label: 'Not Started', badge: 'bg-slate-100 text-slate-500' },
};

// ─────────────────────────── Helper Functions ───────────────────────────

function computeCategoryStats(category: OsfiE23Category) {
  const total = category.controls.length;
  const passed = category.controls.filter(c => c.status === 'pass').length;
  const inProgress = category.controls.filter(c => c.status === 'in-progress').length;
  const failed = category.controls.filter(c => c.status === 'fail').length;
  const compliancePct = total > 0 ? Math.round((passed / total) * 100) : 0;
  return { total, passed, inProgress, failed, compliancePct };
}

function computeOverallStats(categories: OsfiE23Category[]) {
  const allControls = categories.flatMap(c => c.controls);
  const total = allControls.length;
  const passed = allControls.filter(c => c.status === 'pass').length;
  const inProgress = allControls.filter(c => c.status === 'in-progress').length;
  const failed = allControls.filter(c => c.status === 'fail').length;
  const compliancePct = total > 0 ? Math.round((passed / total) * 100) : 0;
  return { total, passed, inProgress, failed, compliancePct };
}

// ─────────────────────────── Lifecycle Phase Metadata ───────────────────────────

const lifecyclePhases = [
  { key: 'design', name: 'Design', icon: 'D', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  { key: 'review', name: 'Review', icon: 'R', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  { key: 'approval', name: 'Approval', icon: 'A', color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200' },
  { key: 'deployment', name: 'Deploy', icon: 'P', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { key: 'monitoring', name: 'Monitor', icon: 'M', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  { key: 'decommission', name: 'Retire', icon: 'X', color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' },
];

// ─────────────────────────── Component ───────────────────────────

interface OsfiE23ViewProps {
  embedded?: boolean;
  onNavigateToProgram?: () => void;
}

export default function OsfiE23View({ embedded = false, onNavigateToProgram }: OsfiE23ViewProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Governance & Accountability (Outcomes)']));
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Get OSFI E-23 data from mock data
  const frameworkData = useMemo(() => {
    const fw = COMPLIANCE_CENTER_FRAMEWORKS.find(f => f.id === 'osfi-e23');
    return fw as OsfiE23Framework | undefined;
  }, []);

  const overallStats = useMemo(() => {
    if (!frameworkData) return { total: 0, passed: 0, inProgress: 0, failed: 0, compliancePct: 0 };
    return computeOverallStats(frameworkData.categories);
  }, [frameworkData]);

  const toggleCategory = (name: string) => {
    const next = new Set(expandedCategories);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setExpandedCategories(next);
  };

  const filteredCategories = useMemo(() => {
    if (!frameworkData) return [];
    if (filterStatus === 'all') return frameworkData.categories;
    return frameworkData.categories.map(cat => ({
      ...cat,
      controls: cat.controls.filter(c => c.status === filterStatus),
    })).filter(cat => cat.controls.length > 0);
  }, [frameworkData, filterStatus]);

  if (!frameworkData) {
    return (
      <div className="bg-white/80 rounded-xl border border-slate-200/60 shadow-sm p-6 text-center text-[12px] text-slate-400">
        OSFI E-23 framework data not found.
      </div>
    );
  }

  const body = (
    <div className="space-y-6">
      {/* Hero: OSFI E-23 Overview */}
      <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl border border-slate-200/60 shadow-sm p-6 overflow-hidden">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                E23
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">OSFI Guideline E-23</h2>
                <p className="text-[11px] text-slate-500">Enterprise-wide Model Risk Management for Canadian FRFIs</p>
              </div>
            </div>
            <p className="text-[12px] text-slate-600 leading-relaxed max-w-2xl">
              OSFI E-23 establishes requirements for how <strong>Federally Regulated Financial Institutions (FRFIs)</strong> in
              Canada must manage model risk across the enterprise. Unlike US SR 26-2 which focuses primarily on AI/ML,
              E-23 applies to <strong>all models</strong> including traditional quantitative models, scoring models, and AI/ML systems.
            </p>
          </div>
          <div className="text-right ml-6">
            <div className="text-3xl font-bold text-slate-900">{overallStats.compliancePct}%</div>
            <div className="text-[10px] text-slate-500">Overall Compliance</div>
            <div className="text-[10px] text-emerald-600 mt-1">{overallStats.passed}/{overallStats.total} controls</div>
          </div>
        </div>

        {/* Key dates */}
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-slate-200/60">
          <div className="text-[10px]">
            <span className="text-slate-500">Final guideline:</span>
            <span className="font-semibold text-slate-700 ml-1">September 2025</span>
          </div>
          <div className="text-[10px]">
            <span className="text-slate-500">Effective date:</span>
            <span className="font-semibold text-emerald-700 ml-1">January 1, 2025</span>
          </div>
          <div className="text-[10px]">
            <span className="text-slate-500">Last audit:</span>
            <span className="font-medium text-slate-600 ml-1">{frameworkData.lastAudit}</span>
          </div>
          <div className="text-[10px]">
            <span className="text-slate-500">Next audit:</span>
            <span className="font-medium text-slate-600 ml-1">{frameworkData.nextAudit}</span>
          </div>
        </div>
      </div>

      {/* Canadian Regulatory Context Callout */}
      <div className="bg-red-50 rounded-xl border border-red-200/60 px-5 py-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-white border border-red-200 flex items-center justify-center flex-shrink-0 text-2xl">
            {/* Maple leaf representation */}
            <span className="text-red-600">*</span>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-red-800 mb-1">Canadian Regulatory Context</div>
            <p className="text-[11px] text-red-700 leading-relaxed">
              OSFI (Office of the Superintendent of Financial Institutions) is Canada's federal prudential regulator
              for banks, insurance companies, and federally regulated pension plans. E-23 complements other OSFI
              guidelines including <strong>B-10</strong> (Third-Party Risk Management), <strong>B-13</strong> (Technology
              and Cyber Risk Management), and <strong>E-21</strong> (Operational Resilience).
            </p>
            <div className="flex items-center gap-4 mt-3 text-[10px]">
              <span className="px-2 py-1 bg-white rounded border border-red-200 text-red-700">Banks (D-SIBs)</span>
              <span className="px-2 py-1 bg-white rounded border border-red-200 text-red-700">Insurance Co.</span>
              <span className="px-2 py-1 bg-white rounded border border-red-200 text-red-700">Trust Companies</span>
              <span className="px-2 py-1 bg-white rounded border border-red-200 text-red-700">Pension Plans</span>
            </div>
          </div>
        </div>
      </div>

      {/* Program Builder Link */}
      {onNavigateToProgram && (
        <div className="flex items-center justify-between bg-emerald-50 rounded-xl border border-emerald-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 text-sm">*</span>
            <span className="text-sm text-emerald-800">Track OSFI E-23 controls in your governance program</span>
          </div>
          <button
            onClick={onNavigateToProgram}
            className="text-xs font-medium px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Add to Program
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Controls" value={overallStats.total} />
        <StatCard label="Compliant" value={overallStats.passed} variant="success" />
        <StatCard label="In Progress" value={overallStats.inProgress} variant="warning" />
        <StatCard label="Gaps" value={overallStats.failed} variant={overallStats.failed > 0 ? 'danger' : 'muted'} />
        <StatCard label="Compliance" value={`${overallStats.compliancePct}%`} variant="info" />
      </div>

      {/* Model Lifecycle Visualization */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="mb-4">
          <div className="text-sm font-semibold text-slate-900">E-23 Model Lifecycle</div>
          <div className="text-[10px] text-slate-500">OSFI E-23 structures controls around a defined model lifecycle</div>
        </div>
        <div className="relative">
          {/* Connection line */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-200 via-emerald-200 to-slate-200 -translate-y-1/2 hidden md:block" />
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 relative">
            {lifecyclePhases.map((phase, idx) => (
              <div
                key={phase.key}
                className={`relative p-3 rounded-xl border-2 ${phase.bg} ${phase.border} text-center`}
              >
                <div className={`absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${phase.bg} ${phase.color} border-2 ${phase.border}`}>
                  {idx + 1}
                </div>
                <div className={`w-8 h-8 mx-auto rounded-lg flex items-center justify-center ${phase.bg} mb-2`}>
                  <span className={`text-lg font-bold ${phase.color}`}>{phase.icon}</span>
                </div>
                <div className={`text-[11px] font-semibold ${phase.color}`}>{phase.name}</div>
              </div>
            ))}
          </div>
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

      {/* Control Categories */}
      {filteredCategories.map(category => {
        const isExpanded = expandedCategories.has(category.name);
        const stats = computeCategoryStats(category);
        const isLifecycle = category.name.toLowerCase().includes('lifecycle');

        return (
          <div
            key={category.name}
            className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden"
          >
            {/* Category header */}
            <button
              onClick={() => toggleCategory(category.name)}
              className={`w-full px-5 py-3 flex items-center gap-4 hover:bg-slate-50/50 transition-colors ${
                isExpanded ? (isLifecycle ? 'bg-blue-50/50' : 'bg-emerald-50/50') : ''
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isLifecycle ? 'bg-blue-100' : 'bg-emerald-100'
              }`}>
                <span className={`text-xl font-bold ${isLifecycle ? 'text-blue-600' : 'text-emerald-600'}`}>
                  {isLifecycle ? 'LC' : 'GV'}
                </span>
              </div>
              <div className="flex-1 text-left">
                <div className={`text-sm font-semibold ${isLifecycle ? 'text-blue-800' : 'text-emerald-800'}`}>
                  {category.name}
                </div>
                <div className="text-[10px] text-slate-500">{stats.total} controls</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className={`text-lg font-bold ${
                    stats.compliancePct >= 80 ? 'text-emerald-600' :
                    stats.compliancePct >= 50 ? 'text-amber-600' : 'text-rose-600'
                  }`}>{stats.compliancePct}%</div>
                  <div className="text-[9px] text-slate-500">{stats.passed}/{stats.total} compliant</div>
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
                {category.controls.map(ctrl => {
                  const sm = statusMeta[ctrl.status];
                  return (
                    <div key={ctrl.id} className="px-5 py-3">
                      <div className="flex items-start gap-3">
                        {/* Status icon */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${sm.badge}`}>
                          <span className="text-[11px] font-bold">{sm.icon}</span>
                        </div>

                        {/* Control info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold text-slate-800">{ctrl.id}</span>
                            <span className="text-[11px] text-slate-700">{ctrl.label}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                              {ctrl.section}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-[10px]">
                            {ctrl.evidence && (
                              <span className="text-slate-500">
                                Evidence: <span className="text-slate-600">{ctrl.evidence}</span>
                              </span>
                            )}
                            {ctrl.owner && (
                              <span className="text-slate-500">
                                Owner: <span className="text-slate-600">{ctrl.owner}</span>
                              </span>
                            )}
                            {ctrl.dueDate && (
                              <span className="text-amber-600">
                                Due: {ctrl.dueDate}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Comparison to SR 26-2 */}
      <div className="bg-slate-50 rounded-xl border border-slate-200/60 p-5">
        <div className="text-sm font-semibold text-slate-900 mb-3">Comparison: OSFI E-23 vs US SR 26-2</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <span className="text-emerald-700 font-bold text-[11px]">E23</span>
              </div>
              <div>
                <div className="text-[12px] font-semibold text-slate-800">OSFI E-23 (Canada)</div>
                <div className="text-[10px] text-slate-500">Effective Jan 2025</div>
              </div>
            </div>
            <ul className="space-y-1 text-[10px] text-slate-600">
              <li><span className="text-emerald-500">+</span> Covers <strong>all models</strong> (traditional + AI/ML)</li>
              <li><span className="text-emerald-500">+</span> Enterprise-wide MRM framework required</li>
              <li><span className="text-emerald-500">+</span> Explicit lifecycle phases defined</li>
              <li><span className="text-emerald-500">+</span> Board/senior management accountability</li>
              <li><span className="text-emerald-500">+</span> Proportionate to risk rating</li>
            </ul>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <span className="text-blue-700 font-bold text-[11px]">SR</span>
              </div>
              <div>
                <div className="text-[12px] font-semibold text-slate-800">US SR 26-2</div>
                <div className="text-[10px] text-slate-500">Effective Apr 2026</div>
              </div>
            </div>
            <ul className="space-y-1 text-[10px] text-slate-600">
              <li><span className="text-blue-500">+</span> Focused on <strong>AI/ML models</strong></li>
              <li><span className="text-blue-500">+</span> Supersedes SR 11-7 for AI systems</li>
              <li><span className="text-blue-500">+</span> Agent-specific considerations</li>
              <li><span className="text-blue-500">+</span> Effective challenge requirements</li>
              <li><span className="text-blue-500">+</span> Model inventory + validation pillars</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <div className="text-[11px] font-semibold text-blue-800 mb-1">Cross-Border Compliance</div>
          <div className="text-[10px] text-blue-700 leading-relaxed">
            Organizations operating in both Canada and the US should map controls between E-23 and SR 26-2.
            E-23's broader scope (all models) means compliance with E-23 provides a strong foundation for
            SR 26-2 compliance, though AI-specific requirements in SR 26-2 may need additional attention.
          </div>
        </div>
      </div>

      {/* E-23 Notable Requirements */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="text-sm font-semibold text-slate-900 mb-3">E-23 Notable Requirements</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-violet-50 rounded-lg border border-violet-200">
            <div className="text-[11px] font-semibold text-violet-800 mb-1">Enterprise Integration</div>
            <div className="text-[10px] text-violet-700">
              MRM must be integrated into overall enterprise risk management (ERM) framework, not siloed.
            </div>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
            <div className="text-[11px] font-semibold text-amber-800 mb-1">Model Inventory (Appendix 1)</div>
            <div className="text-[10px] text-amber-700">
              Detailed inventory requirements including model purpose, tier, owner, validation status, and performance metrics.
            </div>
          </div>
          <div className="p-3 bg-cyan-50 rounded-lg border border-cyan-200">
            <div className="text-[11px] font-semibold text-cyan-800 mb-1">AI/ML Specific Risks</div>
            <div className="text-[10px] text-cyan-700">
              Explicit requirements for AI/ML risks: explainability, self-learning models, third-party black-box models.
            </div>
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="text-[10px] text-slate-400 text-center">
        OSFI Guideline E-23 (Enterprise-wide Model Risk Management) — Final September 2025, effective January 1, 2025.
        Applies to all Federally Regulated Financial Institutions (FRFIs) in Canada.
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <GovernPageLayout
      title="OSFI E-23"
      description="OSFI Guideline E-23 — Canada's enterprise-wide Model Risk Management framework for FRFIs, covering all models including AI/ML."
      badge={<MockDataBadge integration="OSFI E-23 controls — control-plane backend (DynamoDB)" />}
    >
      {body}
    </GovernPageLayout>
  );
}
