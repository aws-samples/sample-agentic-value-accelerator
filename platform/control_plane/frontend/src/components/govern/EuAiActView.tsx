/**
 * EuAiActView — EU AI Act (Regulation 2024/1689) deep-dive compliance view.
 *
 * Comprehensive view showing:
 * - Risk Classification Pyramid (Prohibited -> High-Risk -> Limited -> Minimal)
 * - Organization's AI systems mapped to risk tiers
 * - Provider vs Deployer obligations matrix
 * - Conformity Assessment tracker (Art. 43) with timeline
 * - Article-by-article control status (Art. 9-15 High-Risk requirements)
 * - GPAI obligations section
 * - Effective dates timeline (2024-2027 rollout)
 *
 * Backend-first design; falls back to mock data when offline.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { Icon } from './icons';
import { COMPLIANCE_CENTER_FRAMEWORKS, MODEL_DETAILS } from './mockData';
import GpaiModelCard from './compliance/GpaiModelCard';
import { ComplianceGapGuidanceCompact } from './compliance/ComplianceGapGuidance';

// ───────────────────────────────────── Types ─────────────────────────────────────

type RiskTier = 'prohibited' | 'high-risk' | 'limited-risk' | 'minimal-risk';

interface AiSystem {
  id: string;
  name: string;
  description: string;
  tier: RiskTier;
  annexRef?: string;
  model?: string;
  status: 'compliant' | 'in-progress' | 'gap';
}

interface TimelineEvent {
  date: string;
  label: string;
  description: string;
  status: 'complete' | 'current' | 'upcoming';
}

interface ObligationItem {
  id: string;
  obligation: string;
  article: string;
  provider: boolean;
  deployer: boolean;
  status: 'pass' | 'in-progress' | 'not-started';
}

// ───────────────────────────────────── Risk Tier Meta ─────────────────────────────────────

const riskTierMeta: Record<RiskTier, { label: string; color: string; bgLight: string; border: string; description: string }> = {
  prohibited: {
    label: 'Prohibited',
    color: 'text-rose-700',
    bgLight: 'bg-rose-50',
    border: 'border-rose-200',
    description: 'AI practices banned under Art. 5 (manipulation, social scoring, real-time biometric ID for law enforcement except narrow exceptions)',
  },
  'high-risk': {
    label: 'High-Risk',
    color: 'text-amber-700',
    bgLight: 'bg-amber-50',
    border: 'border-amber-200',
    description: 'AI systems in Annex III areas (biometrics, critical infrastructure, education, employment, credit, law enforcement, migration, justice)',
  },
  'limited-risk': {
    label: 'Limited Risk',
    color: 'text-blue-700',
    bgLight: 'bg-blue-50',
    border: 'border-blue-200',
    description: 'AI with transparency obligations (chatbots, emotion recognition, deepfakes) — users must be informed they interact with AI',
  },
  'minimal-risk': {
    label: 'Minimal Risk',
    color: 'text-emerald-700',
    bgLight: 'bg-emerald-50',
    border: 'border-emerald-200',
    description: 'AI with no specific obligations (spam filters, AI in video games) — voluntary codes of conduct encouraged',
  },
};

const statusMeta: Record<string, { icon: string; badge: string; label: string }> = {
  pass: { icon: '', badge: 'bg-emerald-100 text-emerald-700', label: 'Conformant' },
  'in-progress': { icon: '!', badge: 'bg-amber-100 text-amber-700', label: 'In Progress' },
  fail: { icon: '', badge: 'bg-rose-100 text-rose-700', label: 'Gap' },
  'not-started': { icon: '', badge: 'bg-slate-100 text-slate-500', label: 'Not Started' },
  compliant: { icon: '', badge: 'bg-emerald-100 text-emerald-700', label: 'Compliant' },
  gap: { icon: '', badge: 'bg-rose-100 text-rose-700', label: 'Gap' },
};

// ───────────────────────────────────── Mock Data ─────────────────────────────────────

// Organization's AI systems classified by risk tier
const AI_SYSTEMS: AiSystem[] = [
  { id: 'sys-001', name: 'Credit Decisioning Agent', description: 'Automated credit scoring and loan approval recommendations', tier: 'high-risk', annexRef: 'Annex III(5)(b) — creditworthiness assessment', model: 'Claude Sonnet 4.5', status: 'compliant' },
  { id: 'sys-002', name: 'Fraud Detection Agent', description: 'Real-time transaction fraud scoring and investigation triage', tier: 'high-risk', annexRef: 'Annex III(5)(a) — financial services risk assessment', model: 'Claude Sonnet 4.5', status: 'compliant' },
  { id: 'sys-003', name: 'Trading Assistant', description: 'Trade rationale generation and market commentary', tier: 'high-risk', annexRef: 'Annex III(5)(c) — financial advice', model: 'Claude Opus 4.7', status: 'in-progress' },
  { id: 'sys-004', name: 'Customer Service Bot', description: 'Customer inquiry handling and FAQ routing', tier: 'limited-risk', annexRef: 'Art. 50 — chatbot transparency', model: 'Claude Haiku 4.5', status: 'in-progress' },
  { id: 'sys-005', name: 'Document Classification', description: 'Internal document categorization and routing', tier: 'minimal-risk', model: 'Claude Haiku 4.5', status: 'compliant' },
  { id: 'sys-006', name: 'KYC Document Extraction', description: 'Identity document parsing and verification support', tier: 'limited-risk', annexRef: 'Art. 50 — transparency to users', model: 'Claude Haiku 4.5', status: 'compliant' },
  { id: 'sys-007', name: 'Internal Ops Triage', description: 'Internal ticket classification and routing', tier: 'minimal-risk', model: 'Nova Pro', status: 'compliant' },
  { id: 'sys-008', name: 'Log Summarization', description: 'Operational log analysis and summarization', tier: 'minimal-risk', model: 'Nova Pro', status: 'compliant' },
];

// Provider vs Deployer obligations matrix
const OBLIGATIONS_MATRIX: ObligationItem[] = [
  { id: 'ob-01', obligation: 'Risk management system (Art. 9)', article: 'Art. 9', provider: true, deployer: false, status: 'pass' },
  { id: 'ob-02', obligation: 'Data governance requirements (Art. 10)', article: 'Art. 10', provider: true, deployer: false, status: 'pass' },
  { id: 'ob-03', obligation: 'Technical documentation (Art. 11, Annex IV)', article: 'Art. 11', provider: true, deployer: false, status: 'pass' },
  { id: 'ob-04', obligation: 'Record-keeping / automatic logging (Art. 12)', article: 'Art. 12', provider: true, deployer: true, status: 'pass' },
  { id: 'ob-05', obligation: 'Transparency to deployers (Art. 13)', article: 'Art. 13', provider: true, deployer: false, status: 'in-progress' },
  { id: 'ob-06', obligation: 'Human oversight measures (Art. 14)', article: 'Art. 14', provider: true, deployer: true, status: 'pass' },
  { id: 'ob-07', obligation: 'Accuracy, robustness, cybersecurity (Art. 15)', article: 'Art. 15', provider: true, deployer: false, status: 'pass' },
  { id: 'ob-08', obligation: 'Quality management system (Art. 17)', article: 'Art. 17', provider: true, deployer: false, status: 'in-progress' },
  { id: 'ob-09', obligation: 'Use per instructions, monitor, log (Art. 26)', article: 'Art. 26', provider: false, deployer: true, status: 'in-progress' },
  { id: 'ob-10', obligation: 'FRIA before deployment (Art. 27)', article: 'Art. 27', provider: false, deployer: true, status: 'in-progress' },
  { id: 'ob-11', obligation: 'Conformity assessment (Art. 43)', article: 'Art. 43', provider: true, deployer: false, status: 'in-progress' },
  { id: 'ob-12', obligation: 'EU declaration of conformity (Art. 47)', article: 'Art. 47', provider: true, deployer: false, status: 'not-started' },
  { id: 'ob-13', obligation: 'Register in EU database (Art. 49/71)', article: 'Art. 49', provider: true, deployer: true, status: 'not-started' },
  { id: 'ob-14', obligation: 'Serious incident reporting (Art. 73)', article: 'Art. 73', provider: true, deployer: true, status: 'in-progress' },
];

// EU AI Act effective dates timeline
const TIMELINE_EVENTS: TimelineEvent[] = [
  { date: '2024-08-01', label: 'Entry into Force', description: 'Regulation 2024/1689 entered into force', status: 'complete' },
  { date: '2025-02-02', label: 'Prohibited Practices (Art. 5)', description: 'Prohibitions on unacceptable-risk AI practices apply', status: 'complete' },
  { date: '2025-08-02', label: 'GPAI & Governance', description: 'GPAI model obligations (Art. 51-55); governance structures; penalties', status: 'complete' },
  { date: '2026-08-02', label: 'High-Risk AI Systems', description: 'All Annex III high-risk AI system requirements apply', status: 'current' },
  { date: '2027-08-02', label: 'Annex I Systems', description: 'High-risk AI systems under Annex I product safety legislation', status: 'upcoming' },
];

// Conformity assessment milestones
const CONFORMITY_MILESTONES = [
  { step: 'Risk Classification', status: 'complete' as const, date: '2026-03-15', owner: 'RAI Council' },
  { step: 'Technical Documentation (Annex IV)', status: 'complete' as const, date: '2026-04-01', owner: 'ML Platform' },
  { step: 'Quality Management System (Art. 17)', status: 'in-progress' as const, dueDate: '2026-09-01', owner: 'Compliance' },
  { step: 'Internal Conformity Assessment', status: 'in-progress' as const, dueDate: '2026-10-01', owner: 'Compliance' },
  { step: 'EU Declaration of Conformity (Art. 47)', status: 'not-started' as const, dueDate: '2026-11-01', owner: 'Legal' },
  { step: 'EU Database Registration (Art. 49/71)', status: 'not-started' as const, dueDate: '2026-12-01', owner: 'Compliance' },
];

// ───────────────────────────────────── Component ─────────────────────────────────────

interface EuAiActViewProps {
  embedded?: boolean;
  onNavigateToProgram?: () => void;
}

export default function EuAiActView({ embedded = false, onNavigateToProgram }: EuAiActViewProps = {}) {
  const [selectedTier, setSelectedTier] = useState<RiskTier | 'all'>('all');
  const [showGpaiCards, setShowGpaiCards] = useState(false);

  // Get the EU AI Act framework from COMPLIANCE_CENTER_FRAMEWORKS
  const euAiActFramework = useMemo(() => {
    return COMPLIANCE_CENTER_FRAMEWORKS.find(fw => fw.id === 'eu-ai-act');
  }, []);

  // Compute stats from the framework controls
  const stats = useMemo(() => {
    if (!euAiActFramework) return { total: 0, passed: 0, inProgress: 0, failed: 0, conformancePct: 0 };
    const allControls = euAiActFramework.categories.flatMap(c => c.controls);
    const total = allControls.length;
    const passed = allControls.filter(c => c.status === 'pass').length;
    const inProgress = allControls.filter(c => c.status === 'in-progress').length;
    const failed = allControls.filter(c => c.status === 'fail').length;
    const notStarted = allControls.filter(c => c.status === 'not-started').length;
    const applicable = total - notStarted;
    const conformancePct = applicable > 0 ? Math.round((passed / applicable) * 100) : 0;
    return { total, passed, inProgress, failed, conformancePct };
  }, [euAiActFramework]);

  // Count systems by tier
  const systemsByTier = useMemo(() => {
    const counts: Record<RiskTier, number> = { prohibited: 0, 'high-risk': 0, 'limited-risk': 0, 'minimal-risk': 0 };
    AI_SYSTEMS.forEach(sys => { counts[sys.tier]++; });
    return counts;
  }, []);

  // Filter systems by selected tier
  const filteredSystems = useMemo(() => {
    if (selectedTier === 'all') return AI_SYSTEMS;
    return AI_SYSTEMS.filter(sys => sys.tier === selectedTier);
  }, [selectedTier]);

  // Get GPAI model info from MODEL_DETAILS
  const gpaiModels = useMemo(() => {
    return Object.values(MODEL_DETAILS).filter(m =>
      m.attestation?.euAiAct?.classification?.includes('High risk') ||
      m.id?.includes('claude') || m.id?.includes('opus') || m.id?.includes('sonnet')
    ).slice(0, 3);
  }, []);

  const body = (
    <div className="space-y-6">
      {/* Program Builder Link */}
      {onNavigateToProgram && (
        <div className="flex items-center justify-between bg-violet-50 rounded-xl border border-violet-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-violet-600 text-sm">📋</span>
            <span className="text-sm text-violet-800">Track EU AI Act controls in your governance program</span>
          </div>
          <button
            onClick={onNavigateToProgram}
            className="text-xs font-medium px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
          >
            Add to Program →
          </button>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Controls" value={stats.total} />
        <StatCard label="Conformant" value={stats.passed} variant="success" />
        <StatCard label="In Progress" value={stats.inProgress} variant="warning" />
        <StatCard label="Gaps" value={stats.failed} variant={stats.failed > 0 ? 'danger' : 'muted'} />
        <StatCard label="Conformance" value={`${stats.conformancePct}%`} variant="info" sub="excl. not started" />
      </div>

      {/* Risk Classification Pyramid — Hero Visual */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Risk Classification Pyramid</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">EU AI Act risk-based approach — systems classified by potential harm</p>
          </div>
          <select
            value={selectedTier}
            onChange={e => setSelectedTier(e.target.value as RiskTier | 'all')}
            className="text-[10px] border border-slate-200 rounded px-2 py-1 text-slate-600"
            aria-label="Filter by risk tier"
          >
            <option value="all">All tiers</option>
            <option value="prohibited">Prohibited</option>
            <option value="high-risk">High-Risk</option>
            <option value="limited-risk">Limited Risk</option>
            <option value="minimal-risk">Minimal Risk</option>
          </select>
        </div>

        {/* Pyramid Visualization */}
        <div className="flex flex-col items-center py-6">
          {/* Tier 1: Prohibited (narrowest) */}
          <button
            onClick={() => setSelectedTier(selectedTier === 'prohibited' ? 'all' : 'prohibited')}
            className={`w-[30%] py-2.5 rounded-t-lg border-2 transition-all ${
              selectedTier === 'prohibited' || selectedTier === 'all'
                ? 'bg-rose-100 border-rose-300 shadow-md'
                : 'bg-rose-50/50 border-rose-200/50'
            }`}
          >
            <div className="text-[11px] font-bold text-rose-700">PROHIBITED</div>
            <div className="text-[9px] text-rose-600">Art. 5</div>
            <div className="text-[10px] font-semibold text-rose-800 mt-0.5">{systemsByTier.prohibited} systems</div>
          </button>

          {/* Tier 2: High-Risk */}
          <button
            onClick={() => setSelectedTier(selectedTier === 'high-risk' ? 'all' : 'high-risk')}
            className={`w-[50%] py-2.5 border-x-2 border-b-2 transition-all ${
              selectedTier === 'high-risk' || selectedTier === 'all'
                ? 'bg-amber-100 border-amber-300 shadow-md'
                : 'bg-amber-50/50 border-amber-200/50'
            }`}
          >
            <div className="text-[11px] font-bold text-amber-700">HIGH-RISK</div>
            <div className="text-[9px] text-amber-600">Annex III + Annex I</div>
            <div className="text-[10px] font-semibold text-amber-800 mt-0.5">{systemsByTier['high-risk']} systems</div>
          </button>

          {/* Tier 3: Limited Risk */}
          <button
            onClick={() => setSelectedTier(selectedTier === 'limited-risk' ? 'all' : 'limited-risk')}
            className={`w-[70%] py-2.5 border-x-2 border-b-2 transition-all ${
              selectedTier === 'limited-risk' || selectedTier === 'all'
                ? 'bg-blue-100 border-blue-300 shadow-md'
                : 'bg-blue-50/50 border-blue-200/50'
            }`}
          >
            <div className="text-[11px] font-bold text-blue-700">LIMITED RISK</div>
            <div className="text-[9px] text-blue-600">Art. 50 Transparency</div>
            <div className="text-[10px] font-semibold text-blue-800 mt-0.5">{systemsByTier['limited-risk']} systems</div>
          </button>

          {/* Tier 4: Minimal Risk (widest) */}
          <button
            onClick={() => setSelectedTier(selectedTier === 'minimal-risk' ? 'all' : 'minimal-risk')}
            className={`w-[90%] py-2.5 border-x-2 border-b-2 rounded-b-lg transition-all ${
              selectedTier === 'minimal-risk' || selectedTier === 'all'
                ? 'bg-emerald-100 border-emerald-300 shadow-md'
                : 'bg-emerald-50/50 border-emerald-200/50'
            }`}
          >
            <div className="text-[11px] font-bold text-emerald-700">MINIMAL RISK</div>
            <div className="text-[9px] text-emerald-600">Voluntary codes</div>
            <div className="text-[10px] font-semibold text-emerald-800 mt-0.5">{systemsByTier['minimal-risk']} systems</div>
          </button>
        </div>

        {/* Selected Tier Description */}
        {selectedTier !== 'all' && (
          <div className={`mt-4 p-3 rounded-lg ${riskTierMeta[selectedTier].bgLight} ${riskTierMeta[selectedTier].border} border`}>
            <div className={`text-[11px] font-semibold ${riskTierMeta[selectedTier].color}`}>{riskTierMeta[selectedTier].label}</div>
            <div className="text-[10px] text-slate-600 mt-0.5">{riskTierMeta[selectedTier].description}</div>
          </div>
        )}
      </div>

      {/* AI Systems by Risk Tier */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">AI Systems Classification</div>
          <div className="text-[10px] text-slate-500">{filteredSystems.length} systems</div>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredSystems.map(sys => {
            const tierMeta = riskTierMeta[sys.tier];
            const statusM = statusMeta[sys.status];
            return (
              <div key={sys.id} className="px-5 py-3 flex items-center gap-4">
                <span className={`text-[9px] font-semibold px-2 py-1 rounded ${tierMeta.bgLight} ${tierMeta.color} ${tierMeta.border} border`}>
                  {tierMeta.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-slate-800 truncate">{sys.name}</div>
                  <div className="text-[10px] text-slate-500 truncate">{sys.description}</div>
                  {sys.annexRef && <div className="text-[9px] text-slate-400 mt-0.5">{sys.annexRef}</div>}
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${statusM.badge}`}>{statusM.label}</span>
                  {sys.model && <div className="text-[9px] text-slate-400 mt-0.5">{sys.model}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Provider vs Deployer Obligations Matrix */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-900">Provider vs Deployer Obligations</div>
          <div className="text-[10px] text-slate-500 mt-0.5">High-Risk AI obligations mapped by responsible party (you may be both)</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">Obligation</th>
                <th className="px-4 py-2 text-center font-semibold text-slate-700 w-20">Article</th>
                <th className="px-4 py-2 text-center font-semibold text-slate-700 w-24">Provider</th>
                <th className="px-4 py-2 text-center font-semibold text-slate-700 w-24">Deployer</th>
                <th className="px-4 py-2 text-center font-semibold text-slate-700 w-24">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {OBLIGATIONS_MATRIX.map(ob => {
                const statusM = statusMeta[ob.status];
                return (
                  <tr key={ob.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 text-slate-700">{ob.obligation}</td>
                    <td className="px-4 py-2 text-center text-slate-500">{ob.article}</td>
                    <td className="px-4 py-2 text-center">
                      {ob.provider ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold">P</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {ob.deployer ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold">D</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${statusM.badge}`}>{statusM.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-4 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-violet-100 text-violet-700 text-[9px] font-bold">P</span>
            Provider (develops/places AI on market)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-100 text-sky-700 text-[9px] font-bold">D</span>
            Deployer (uses AI under own authority)
          </span>
        </div>
      </div>

      {/* Conformity Assessment Tracker (Art. 43) */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-900">Conformity Assessment (Art. 43)</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Internal conformity assessment for Annex III high-risk systems (self-certification per Art. 43(2))</div>
        </div>
        <div className="p-5">
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-slate-200" />

            <div className="space-y-4">
              {CONFORMITY_MILESTONES.map((m, idx) => {
                const isComplete = m.status === 'complete';
                const isInProgress = m.status === 'in-progress';
                return (
                  <div key={idx} className="relative flex items-start gap-4 pl-8">
                    {/* Timeline dot */}
                    <div className={`absolute left-0 w-6 h-6 rounded-full flex items-center justify-center ${
                      isComplete ? 'bg-emerald-100 border-2 border-emerald-400' :
                      isInProgress ? 'bg-amber-100 border-2 border-amber-400 animate-pulse' :
                      'bg-slate-100 border-2 border-slate-300'
                    }`}>
                      {isComplete && <span className="text-emerald-600 text-[10px]">&#10003;</span>}
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

      {/* Article-by-Article Control Status (from framework data) */}
      {euAiActFramework && (
        <>
          {euAiActFramework.categories.map(cat => (
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

      {/* GPAI Obligations Section */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">GPAI Model Obligations (Art. 51-55)</div>
            <div className="text-[10px] text-slate-500 mt-0.5">General-Purpose AI model requirements — applies to foundation model providers; deployers rely on provider compliance</div>
          </div>
          <button
            onClick={() => setShowGpaiCards(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-medium hover:bg-amber-200 transition-colors flex items-center gap-1.5"
          >
            <Icon name="document-text" className="w-3.5 h-3.5" />
            View Model Cards
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
              <div className="text-[11px] font-semibold text-violet-800">Standard GPAI (Art. 53)</div>
              <ul className="mt-2 space-y-1.5 text-[10px] text-violet-700">
                <li className="flex items-start gap-2"><span className="text-emerald-600">&#10003;</span> Technical documentation maintained</li>
                <li className="flex items-start gap-2"><span className="text-emerald-600">&#10003;</span> Info provided to downstream deployers</li>
                <li className="flex items-start gap-2"><span className="text-emerald-600">&#10003;</span> Copyright policy in place</li>
                <li className="flex items-start gap-2"><span className="text-amber-600">!</span> Training-content summary (awaiting provider)</li>
              </ul>
            </div>
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
              <div className="text-[11px] font-semibold text-rose-800">Systemic Risk GPAI (Art. 55)</div>
              <div className="text-[9px] text-rose-600 mb-2">&gt;10^25 FLOPs presumption threshold</div>
              <ul className="mt-2 space-y-1.5 text-[10px] text-rose-700">
                <li className="flex items-start gap-2"><span className="text-amber-600">!</span> Adversarial evaluation (red-team WIP)</li>
                <li className="flex items-start gap-2"><span className="text-amber-600">!</span> Serious incident reporting process</li>
                <li className="flex items-start gap-2"><span className="text-emerald-600">&#10003;</span> Cybersecurity protections</li>
              </ul>
            </div>
          </div>

          {/* GPAI Model Cards Summary */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="document-text" className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-semibold text-amber-800">GPAI Model Transparency Cards (Art. 53)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">3 Complete</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">2 Partial</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-medium">1 Systemic Risk</span>
              </div>
            </div>
            <p className="text-[10px] text-amber-700 mb-3">
              Article 53 requires GPAI model providers to maintain transparency documentation including training data summaries,
              capabilities, limitations, evaluation results, and risk mitigations. Models exceeding 10^25 FLOPs have additional
              obligations under Article 51 (systemic risk).
            </p>
            <button
              onClick={() => setShowGpaiCards(true)}
              className="w-full py-2 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
            >
              <Icon name="document-text" className="w-4 h-4" />
              Open GPAI Model Card Registry
            </button>
          </div>

          {/* GPAI Models in Use */}
          <div className="mt-4">
            <div className="text-[11px] font-semibold text-slate-700 mb-2">Foundation Models in Use</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {gpaiModels.map(m => (
                <div key={m.id} className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-800">{m.name}</div>
                  <div className="text-[9px] text-slate-500">
                    {m.attestation?.euAiAct?.classification || 'Classification pending'}
                  </div>
                  <div className={`text-[9px] mt-1 ${m.attestation?.euAiAct?.documented ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {m.attestation?.euAiAct?.documented ? '&#10003; Documented' : '! Documentation pending'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Effective Dates Timeline */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-900">EU AI Act Rollout Timeline</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Phased implementation 2024-2027</div>
        </div>
        <div className="p-5">
          <div className="flex items-center overflow-x-auto pb-2">
            {TIMELINE_EVENTS.map((evt, idx) => {
              const isComplete = evt.status === 'complete';
              const isCurrent = evt.status === 'current';
              return (
                <div key={idx} className="flex items-center">
                  {/* Event */}
                  <div className="flex flex-col items-center min-w-[140px]">
                    <div className={`w-4 h-4 rounded-full ${
                      isComplete ? 'bg-emerald-500' :
                      isCurrent ? 'bg-amber-500 animate-pulse' :
                      'bg-slate-300'
                    }`} />
                    <div className={`text-[10px] font-semibold mt-2 ${
                      isComplete ? 'text-emerald-700' :
                      isCurrent ? 'text-amber-700' :
                      'text-slate-500'
                    }`}>{evt.date}</div>
                    <div className="text-[10px] font-semibold text-slate-800 mt-1 text-center">{evt.label}</div>
                    <div className="text-[9px] text-slate-500 text-center mt-0.5 max-w-[130px]">{evt.description}</div>
                  </div>
                  {/* Connector line */}
                  {idx < TIMELINE_EVENTS.length - 1 && (
                    <div className={`h-0.5 w-8 ${
                      isComplete && TIMELINE_EVENTS[idx + 1].status !== 'upcoming' ? 'bg-emerald-400' : 'bg-slate-200'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Current Status Callout */}
          <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[11px] font-semibold text-amber-800">Current Phase: High-Risk AI Systems</span>
            </div>
            <div className="text-[10px] text-amber-700 mt-1">
              As of August 2, 2026, all Annex III high-risk AI system requirements apply. Organizations must ensure conformity assessment, technical documentation, and registration are complete.
            </div>
          </div>
        </div>
      </div>

      {/* Beyond the Platform - Organizational Actions */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="clipboard-document-list" className="w-4 h-4 text-violet-600" strokeWidth={2} />
            <span className="text-sm font-semibold text-slate-800">EU AI Act: Organizational Actions Required</span>
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
          The platform automates technical controls, but these EU AI Act requirements need organizational processes and external actions.
        </p>
        <ComplianceGapGuidanceCompact framework="EU AI Act" />
      </div>

      {/* Footnote */}
      <p className="text-[10px] text-slate-400">
        Reference: Regulation (EU) 2024/1689 of the European Parliament and of the Council — EU AI Act.
        Control statuses are illustrative pending integration with a compliance management backend.
      </p>

      {/* GPAI Model Cards Modal */}
      {showGpaiCards && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowGpaiCards(false)} />
            <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl">
              <GpaiModelCard embedded onClose={() => setShowGpaiCards(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <GovernPageLayout
      title="EU AI Act (Regulation 2024/1689)"
      description="Risk-based AI regulation with obligations for High-Risk AI systems and General-Purpose AI models. Phased implementation 2024-2027."
      badge={<MockDataBadge integration="EU AI Act mapping — control-plane backend (DynamoDB)" />}
    >
      {body}
    </GovernPageLayout>
  );
}
