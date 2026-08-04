/**
 * ModelLifecycle — Track model states from onboarding through retirement
 *
 * Features:
 * - Visual lifecycle pipeline (CANDIDATE → APPROVED → PRODUCTION → DEPRECATED → RETIRED)
 * - Sunset schedules with countdown timers
 * - Migration paths and successor models
 * - Version history with change tracking
 * - Regulatory hold flags
 */

import { useState, useMemo } from 'react';

// ─────────────────────────── Types ───────────────────────────

type LifecycleState = 'candidate' | 'approved' | 'production' | 'deprecated' | 'retired';

type LifecycleEvent = {
  date: string;
  fromState: LifecycleState | null;
  toState: LifecycleState;
  reason: string;
  actor: string;
};

type MigrationPath = {
  fromModel: string;
  toModel: string;
  deadline: string;
  useCasesRemaining: number;
  status: 'not-started' | 'in-progress' | 'completed';
};

type UseCaseMigrationStatus = 'active' | 'migrating' | 'migrated' | 'blocked';

type ModelUseCase = {
  id: string;
  name: string;
  owner: string;
  businessUnit: string;
  invocations: number;
  migrationStatus: UseCaseMigrationStatus;
  targetModel?: string;
  blockerReason?: string;
  lastActivity: string;
};

type ModelLifecycleData = {
  id: string;
  name: string;
  provider: string;
  currentState: LifecycleState;
  version: string;
  previousVersions: string[];
  sunsetDate: string | null;
  successorModel: string | null;
  regulatoryHold: boolean;
  holdReason?: string;
  history: LifecycleEvent[];
  useCases: ModelUseCase[];
};

// ─────────────────────────── Mock Data ───────────────────────────

const LIFECYCLE_DATA: ModelLifecycleData[] = [
  {
    id: 'haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    currentState: 'production',
    version: '4.5',
    previousVersions: ['4.0', '3.5'],
    sunsetDate: null,
    successorModel: null,
    regulatoryHold: false,
    useCases: [
      { id: 'uc-h1', name: 'Customer inquiry triage', owner: 'J. Martinez', businessUnit: 'Retail Banking', invocations: 45200, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-h2', name: 'KYC document extraction', owner: 'S. Chen', businessUnit: 'Risk & Compliance', invocations: 8200, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-h3', name: 'Email classification', owner: 'R. Patel', businessUnit: 'Operations', invocations: 6100, migrationStatus: 'active', lastActivity: '2026-05-26' },
      { id: 'uc-h4', name: 'FAQ response generation', owner: 'L. Thompson', businessUnit: 'Customer Service', invocations: 12400, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-h5', name: 'Document summarization', owner: 'A. Williams', businessUnit: 'Operations', invocations: 3200, migrationStatus: 'active', lastActivity: '2026-05-25' },
      { id: 'uc-h6', name: 'Sentiment analysis', owner: 'M. Garcia', businessUnit: 'Marketing', invocations: 2100, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-h7', name: 'Ticket routing', owner: 'K. Brown', businessUnit: 'IT Support', invocations: 4500, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-h8', name: 'Data extraction - forms', owner: 'D. Lee', businessUnit: 'Operations', invocations: 1800, migrationStatus: 'active', lastActivity: '2026-05-26' },
      { id: 'uc-h9', name: 'Compliance screening', owner: 'P. Johnson', businessUnit: 'Compliance', invocations: 950, migrationStatus: 'active', lastActivity: '2026-05-24' },
      { id: 'uc-h10', name: 'Internal search assistant', owner: 'T. Wilson', businessUnit: 'HR', invocations: 780, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-h11', name: 'Meeting notes summary', owner: 'E. Davis', businessUnit: 'Enterprise', invocations: 620, migrationStatus: 'active', lastActivity: '2026-05-26' },
      { id: 'uc-h12', name: 'Policy Q&A bot', owner: 'C. Miller', businessUnit: 'Legal', invocations: 340, migrationStatus: 'active', lastActivity: '2026-05-23' },
    ],
    history: [
      { date: '2026-01-15', fromState: null, toState: 'candidate', reason: 'Initial evaluation request', actor: 'ML Platform' },
      { date: '2026-02-01', fromState: 'candidate', toState: 'approved', reason: 'Passed safety & bias evaluation', actor: 'RAI Council' },
      { date: '2026-02-15', fromState: 'approved', toState: 'production', reason: 'SR 26-2 attestation complete', actor: 'MRM Committee' },
    ],
  },
  {
    id: 'sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    currentState: 'production',
    version: '4.5',
    previousVersions: ['4.0', '3.5', '3.0'],
    sunsetDate: null,
    successorModel: null,
    regulatoryHold: false,
    useCases: [
      { id: 'uc-s1', name: 'Fraud alert triage', owner: 'M. Rodriguez', businessUnit: 'Risk & Fraud', invocations: 38900, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-s2', name: 'Credit decisioning assist', owner: 'J. Kim', businessUnit: 'Credit Risk', invocations: 9400, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-s3', name: 'AML investigation summary', owner: 'R. Singh', businessUnit: 'Compliance', invocations: 2800, migrationStatus: 'active', lastActivity: '2026-05-26' },
      { id: 'uc-s4', name: 'Regulatory filing review', owner: 'A. Nguyen', businessUnit: 'Legal', invocations: 1200, migrationStatus: 'active', lastActivity: '2026-05-25' },
      { id: 'uc-s5', name: 'Risk assessment narrative', owner: 'S. Taylor', businessUnit: 'Enterprise Risk', invocations: 850, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-s6', name: 'Contract analysis', owner: 'B. Anderson', businessUnit: 'Legal', invocations: 620, migrationStatus: 'active', lastActivity: '2026-05-24' },
      { id: 'uc-s7', name: 'Dispute resolution assist', owner: 'H. White', businessUnit: 'Operations', invocations: 480, migrationStatus: 'active', lastActivity: '2026-05-26' },
      { id: 'uc-s8', name: 'Audit evidence gathering', owner: 'F. Jackson', businessUnit: 'Internal Audit', invocations: 290, migrationStatus: 'active', lastActivity: '2026-05-22' },
    ],
    history: [
      { date: '2025-11-01', fromState: null, toState: 'candidate', reason: 'Upgrade from Sonnet 4.0', actor: 'ML Platform' },
      { date: '2025-11-20', fromState: 'candidate', toState: 'approved', reason: 'Improved safety scores', actor: 'RAI Council' },
      { date: '2025-12-05', fromState: 'approved', toState: 'production', reason: 'Migration from 4.0 complete', actor: 'MRM Committee' },
    ],
  },
  {
    id: 'opus-4-7',
    name: 'Claude Opus 4.7',
    provider: 'Anthropic',
    currentState: 'production',
    version: '4.7',
    previousVersions: ['4.5', '4.0'],
    sunsetDate: null,
    successorModel: null,
    regulatoryHold: false,
    useCases: [
      { id: 'uc-o1', name: 'Trade rationale generation', owner: 'W. Chang', businessUnit: 'Trading', invocations: 12800, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-o2', name: 'Market commentary draft', owner: 'N. Patel', businessUnit: 'Research', invocations: 1400, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-o3', name: 'Complex reasoning tasks', owner: 'G. Thompson', businessUnit: 'Strategy', invocations: 680, migrationStatus: 'active', lastActivity: '2026-05-26' },
      { id: 'uc-o4', name: 'Investment memo drafting', owner: 'V. Kumar', businessUnit: 'Wealth Mgmt', invocations: 420, migrationStatus: 'active', lastActivity: '2026-05-25' },
    ],
    history: [
      { date: '2026-02-01', fromState: null, toState: 'candidate', reason: 'Upgrade from Opus 4.5', actor: 'Trading' },
      { date: '2026-02-20', fromState: 'candidate', toState: 'approved', reason: 'Enhanced reasoning capabilities', actor: 'RAI Council' },
      { date: '2026-03-10', fromState: 'approved', toState: 'production', reason: 'Gradual rollout complete', actor: 'MRM Committee' },
    ],
  },
  {
    id: 'nova-pro',
    name: 'Nova Pro',
    provider: 'Amazon',
    currentState: 'production',
    version: '1.0',
    previousVersions: [],
    sunsetDate: null,
    successorModel: null,
    regulatoryHold: false,
    useCases: [
      { id: 'uc-np1', name: 'Internal ops triage', owner: 'L. Martinez', businessUnit: 'Operations', invocations: 5400, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-np2', name: 'Log summarization', owner: 'Q. Davis', businessUnit: 'Platform', invocations: 4200, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-np3', name: 'Internal wiki search', owner: 'U. Brown', businessUnit: 'IT', invocations: 2100, migrationStatus: 'active', lastActivity: '2026-05-26' },
      { id: 'uc-np4', name: 'Code documentation', owner: 'I. Wilson', businessUnit: 'Engineering', invocations: 1800, migrationStatus: 'active', lastActivity: '2026-05-25' },
      { id: 'uc-np5', name: 'Incident triage assist', owner: 'O. Garcia', businessUnit: 'SRE', invocations: 1200, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-np6', name: 'Test case generation', owner: 'Y. Lee', businessUnit: 'QA', invocations: 680, migrationStatus: 'active', lastActivity: '2026-05-24' },
    ],
    history: [
      { date: '2026-03-01', fromState: null, toState: 'candidate', reason: 'Cost optimization initiative', actor: 'Operations' },
      { date: '2026-03-15', fromState: 'candidate', toState: 'approved', reason: 'Approved for internal use only', actor: 'RAI Council' },
      { date: '2026-04-01', fromState: 'approved', toState: 'production', reason: 'Internal ops deployment', actor: 'Platform' },
    ],
  },
  {
    id: 'nova-lite',
    name: 'Nova Lite',
    provider: 'Amazon',
    currentState: 'candidate',
    version: '1.0',
    previousVersions: [],
    sunsetDate: null,
    successorModel: null,
    regulatoryHold: false,
    useCases: [
      { id: 'uc-nl1', name: 'FAQ routing (pilot)', owner: 'Z. Anderson', businessUnit: 'Customer Svc', invocations: 8900, migrationStatus: 'active', lastActivity: '2026-05-27' },
      { id: 'uc-nl2', name: 'Simple classification (pilot)', owner: 'X. Taylor', businessUnit: 'Operations', invocations: 3200, migrationStatus: 'active', lastActivity: '2026-05-26' },
      { id: 'uc-nl3', name: 'Keyword extraction (pilot)', owner: 'W. White', businessUnit: 'Marketing', invocations: 1100, migrationStatus: 'active', lastActivity: '2026-05-25' },
    ],
    history: [
      { date: '2026-04-15', fromState: null, toState: 'candidate', reason: 'Low-cost tier evaluation', actor: 'Customer Svc' },
    ],
  },
  {
    id: 'sonnet-4-0',
    name: 'Claude Sonnet 4.0',
    provider: 'Anthropic',
    currentState: 'deprecated',
    version: '4.0',
    previousVersions: ['3.5', '3.0'],
    sunsetDate: '2026-07-01',
    successorModel: 'sonnet-4-5',
    regulatoryHold: false,
    useCases: [
      { id: 'uc-s40-1', name: 'Legacy fraud rules engine', owner: 'T. Rodriguez', businessUnit: 'Risk & Fraud', invocations: 2400, migrationStatus: 'migrating', targetModel: 'sonnet-4-5', lastActivity: '2026-05-27' },
      { id: 'uc-s40-2', name: 'Old AML workflow', owner: 'P. Kim', businessUnit: 'Compliance', invocations: 890, migrationStatus: 'blocked', targetModel: 'sonnet-4-5', blockerReason: 'Awaiting prompt template update approval', lastActivity: '2026-05-20' },
    ],
    history: [
      { date: '2025-06-01', fromState: null, toState: 'candidate', reason: 'Initial evaluation', actor: 'ML Platform' },
      { date: '2025-06-20', fromState: 'candidate', toState: 'approved', reason: 'Safety evaluation passed', actor: 'RAI Council' },
      { date: '2025-07-01', fromState: 'approved', toState: 'production', reason: 'Enterprise rollout', actor: 'MRM Committee' },
      { date: '2026-01-15', fromState: 'production', toState: 'deprecated', reason: 'Sonnet 4.5 available, migration initiated', actor: 'ML Platform' },
    ],
  },
  {
    id: 'haiku-3-5',
    name: 'Claude Haiku 3.5',
    provider: 'Anthropic',
    currentState: 'retired',
    version: '3.5',
    previousVersions: ['3.0'],
    sunsetDate: '2026-03-01',
    successorModel: 'haiku-4-5',
    regulatoryHold: false,
    useCases: [
      { id: 'uc-h35-1', name: 'Customer inquiry (legacy)', owner: 'J. Martinez', businessUnit: 'Retail Banking', invocations: 0, migrationStatus: 'migrated', targetModel: 'haiku-4-5', lastActivity: '2026-02-28' },
      { id: 'uc-h35-2', name: 'Email classification (legacy)', owner: 'R. Patel', businessUnit: 'Operations', invocations: 0, migrationStatus: 'migrated', targetModel: 'haiku-4-5', lastActivity: '2026-02-25' },
    ],
    history: [
      { date: '2024-12-01', fromState: null, toState: 'candidate', reason: 'Initial evaluation', actor: 'ML Platform' },
      { date: '2024-12-15', fromState: 'candidate', toState: 'approved', reason: 'Safety evaluation passed', actor: 'RAI Council' },
      { date: '2025-01-01', fromState: 'approved', toState: 'production', reason: 'Enterprise rollout', actor: 'MRM Committee' },
      { date: '2025-12-01', fromState: 'production', toState: 'deprecated', reason: 'Haiku 4.5 available', actor: 'ML Platform' },
      { date: '2026-03-01', fromState: 'deprecated', toState: 'retired', reason: 'All use cases migrated', actor: 'Platform' },
    ],
  },
  {
    id: 'titan-text',
    name: 'Titan Text Express',
    provider: 'Amazon',
    currentState: 'deprecated',
    version: '1.0',
    previousVersions: [],
    sunsetDate: '2026-08-15',
    successorModel: 'nova-pro',
    regulatoryHold: true,
    holdReason: 'Pending fair lending analysis completion',
    useCases: [
      { id: 'uc-tt1', name: 'Loan application pre-screen', owner: 'B. Singh', businessUnit: 'Lending', invocations: 1200, migrationStatus: 'blocked', targetModel: 'nova-pro', blockerReason: 'Fair lending review required before migration', lastActivity: '2026-05-15' },
    ],
    history: [
      { date: '2025-03-01', fromState: null, toState: 'candidate', reason: 'AWS native model evaluation', actor: 'Platform' },
      { date: '2025-03-20', fromState: 'candidate', toState: 'approved', reason: 'Approved for limited use', actor: 'RAI Council' },
      { date: '2025-04-01', fromState: 'approved', toState: 'production', reason: 'Internal deployment', actor: 'Operations' },
      { date: '2026-04-01', fromState: 'production', toState: 'deprecated', reason: 'Nova Pro preferred', actor: 'ML Platform' },
    ],
  },
];

const MIGRATION_PATHS: MigrationPath[] = [
  { fromModel: 'Sonnet 4.0', toModel: 'Sonnet 4.5', deadline: '2026-07-01', useCasesRemaining: 2, status: 'in-progress' },
  { fromModel: 'Titan Text', toModel: 'Nova Pro', deadline: '2026-08-15', useCasesRemaining: 1, status: 'not-started' },
  { fromModel: 'Haiku 3.5', toModel: 'Haiku 4.5', deadline: '2026-03-01', useCasesRemaining: 0, status: 'completed' },
];

// ─────────────────────────── Constants ───────────────────────────

const LIFECYCLE_STATES: { id: LifecycleState; label: string; color: string; bgColor: string }[] = [
  { id: 'candidate', label: 'Candidate', color: '#6366f1', bgColor: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
  { id: 'approved', label: 'Approved', color: '#3b82f6', bgColor: 'bg-blue-50 border-blue-200 text-blue-700' },
  { id: 'production', label: 'Production', color: '#10b981', bgColor: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  { id: 'deprecated', label: 'Deprecated', color: '#f59e0b', bgColor: 'bg-amber-50 border-amber-200 text-amber-700' },
  { id: 'retired', label: 'Retired', color: '#6b7280', bgColor: 'bg-slate-100 border-slate-300 text-slate-500' },
];

const getStateStyle = (state: LifecycleState) => LIFECYCLE_STATES.find(s => s.id === state)!;

const daysUntil = (dateStr: string | null): number | null => {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

// ─────────────────────────── Component ───────────────────────────

export default function ModelLifecycle() {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<LifecycleState | 'all'>('all');

  const stats = useMemo(() => ({
    candidate: LIFECYCLE_DATA.filter(m => m.currentState === 'candidate').length,
    approved: LIFECYCLE_DATA.filter(m => m.currentState === 'approved').length,
    production: LIFECYCLE_DATA.filter(m => m.currentState === 'production').length,
    deprecated: LIFECYCLE_DATA.filter(m => m.currentState === 'deprecated').length,
    retired: LIFECYCLE_DATA.filter(m => m.currentState === 'retired').length,
    withHolds: LIFECYCLE_DATA.filter(m => m.regulatoryHold).length,
    pendingMigrations: MIGRATION_PATHS.filter(m => m.status !== 'completed').length,
  }), []);

  const selectedModelData = selectedModel ? LIFECYCLE_DATA.find(m => m.id === selectedModel) : null;

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {LIFECYCLE_STATES.map(state => (
          <button
            key={state.id}
            onClick={() => setStateFilter(stateFilter === state.id ? 'all' : state.id)}
            className={`bg-white/80 backdrop-blur-sm rounded-xl border p-4 shadow-sm transition-all text-left ${
              stateFilter === state.id ? 'ring-2 ring-offset-1' : 'border-slate-200/60 hover:border-slate-300'
            }`}
            style={{ ['--tw-ring-color' as string]: state.color }}
          >
            <div className="text-[10px] font-medium text-slate-500 uppercase">{state.label}</div>
            <div className="text-2xl font-bold mt-1" style={{ color: state.color }}>
              {stats[state.id]}
            </div>
            <div className="text-[11px] text-slate-400">models</div>
          </button>
        ))}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="text-[10px] font-medium text-slate-500 uppercase">Reg. Holds</div>
          <div className="text-2xl font-bold mt-1 text-rose-600">{stats.withHolds}</div>
          <div className="text-[11px] text-slate-400">blocked</div>
        </div>
      </div>

      {/* Lifecycle Pipeline Visualization */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Lifecycle Pipeline</h3>
        <div className="flex items-center justify-between mb-6">
          {LIFECYCLE_STATES.map((state, i) => (
            <div key={state.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md"
                  style={{ backgroundColor: state.color }}
                >
                  {stats[state.id]}
                </div>
                <div className="text-xs font-medium text-slate-600 mt-2">{state.label}</div>
              </div>
              {i < LIFECYCLE_STATES.length - 1 && (
                <div className="flex-shrink-0 w-16 h-0.5 bg-slate-200 relative">
                  <div className="absolute inset-y-0 right-0 w-2 h-2 -mt-0.5 border-t-2 border-r-2 border-slate-300 transform rotate-45" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Models by state */}
        <div className="grid grid-cols-5 gap-3">
          {LIFECYCLE_STATES.map(state => {
            const models = LIFECYCLE_DATA.filter(m => m.currentState === state.id);
            return (
              <div key={state.id} className="space-y-2">
                {models.map(model => (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(selectedModel === model.id ? null : model.id)}
                    className={`w-full text-left p-2 rounded-lg border text-xs transition-all ${
                      selectedModel === model.id
                        ? 'ring-2 ring-blue-500 border-blue-300 bg-blue-50'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-medium text-slate-900 truncate">{model.name}</div>
                    <div className="text-slate-500 text-[10px]">v{model.version}</div>
                    {model.regulatoryHold && (
                      <div className="text-rose-600 text-[10px] font-semibold mt-1">HOLD</div>
                    )}
                    {model.sunsetDate && (
                      <div className="text-amber-600 text-[10px] mt-1">
                        {daysUntil(model.sunsetDate)}d to sunset
                      </div>
                    )}
                  </button>
                ))}
                {models.length === 0 && (
                  <div className="text-[10px] text-slate-400 text-center py-4">None</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Model Detail Panel */}
      {selectedModelData && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{selectedModelData.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${getStateStyle(selectedModelData.currentState).bgColor}`}>
                  {getStateStyle(selectedModelData.currentState).label}
                </span>
                <span className="text-sm text-slate-500">{selectedModelData.provider}</span>
                <span className="text-sm text-slate-400">v{selectedModelData.version}</span>
              </div>
            </div>
            <button onClick={() => setSelectedModel(null)} className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Alerts */}
          {selectedModelData.regulatoryHold && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-rose-600 font-semibold text-sm">Regulatory Hold</span>
              </div>
              <div className="text-rose-700 text-sm mt-1">{selectedModelData.holdReason}</div>
            </div>
          )}

          {selectedModelData.sunsetDate && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-amber-700 font-semibold text-sm">Sunset Scheduled</div>
                  <div className="text-amber-600 text-sm">{selectedModelData.sunsetDate}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-amber-600">{daysUntil(selectedModelData.sunsetDate)}</div>
                  <div className="text-[10px] text-amber-500 uppercase">days remaining</div>
                </div>
              </div>
              {selectedModelData.successorModel && (
                <div className="text-amber-700 text-sm mt-2">
                  Migrate to: <span className="font-semibold">{LIFECYCLE_DATA.find(m => m.id === selectedModelData.successorModel)?.name || selectedModelData.successorModel}</span>
                </div>
              )}
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-6 gap-3 mb-4">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase">Total Use Cases</div>
              <div className="text-xl font-bold text-slate-900">{selectedModelData.useCases.length}</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3">
              <div className="text-[10px] text-emerald-600 uppercase">Active</div>
              <div className="text-xl font-bold text-emerald-700">{selectedModelData.useCases.filter(u => u.migrationStatus === 'active').length}</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-[10px] text-blue-600 uppercase">Migrating</div>
              <div className="text-xl font-bold text-blue-700">{selectedModelData.useCases.filter(u => u.migrationStatus === 'migrating').length}</div>
            </div>
            <div className="bg-rose-50 rounded-lg p-3">
              <div className="text-[10px] text-rose-600 uppercase">Blocked</div>
              <div className="text-xl font-bold text-rose-700">{selectedModelData.useCases.filter(u => u.migrationStatus === 'blocked').length}</div>
            </div>
            <div className="bg-slate-100 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase">Migrated</div>
              <div className="text-xl font-bold text-slate-600">{selectedModelData.useCases.filter(u => u.migrationStatus === 'migrated').length}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase">Invocations/mo</div>
              <div className="text-xl font-bold text-slate-900">{selectedModelData.useCases.reduce((s, u) => s + u.invocations, 0).toLocaleString()}</div>
            </div>
          </div>

          {/* Use Cases Table */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-900 mb-3">Use Cases on This Model</div>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50">
                    <th scope="col" className="text-left py-2 px-3 font-medium">Use Case</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Owner</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Business Unit</th>
                    <th scope="col" className="text-right py-2 px-3 font-medium">Invocations</th>
                    <th scope="col" className="text-center py-2 px-3 font-medium">Status</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Target / Blocker</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedModelData.useCases.map(uc => (
                    <tr key={uc.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="py-2 px-3">
                        <div className="font-medium text-slate-900">{uc.name}</div>
                        <div className="text-[10px] text-slate-400">{uc.lastActivity}</div>
                      </td>
                      <td className="py-2 px-3 text-slate-600">{uc.owner}</td>
                      <td className="py-2 px-3 text-slate-600">{uc.businessUnit}</td>
                      <td className="py-2 px-3 text-right text-slate-700 tabular-nums">{uc.invocations.toLocaleString()}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          uc.migrationStatus === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                          uc.migrationStatus === 'migrating' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                          uc.migrationStatus === 'blocked' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                          'bg-slate-100 border-slate-200 text-slate-500'
                        }`}>
                          {uc.migrationStatus === 'active' ? 'Active' :
                           uc.migrationStatus === 'migrating' ? 'Migrating' :
                           uc.migrationStatus === 'blocked' ? 'Blocked' : 'Migrated'}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {uc.migrationStatus === 'blocked' && uc.blockerReason ? (
                          <div className="text-rose-600 text-xs">{uc.blockerReason}</div>
                        ) : uc.targetModel ? (
                          <div className="text-blue-600 text-xs">→ {LIFECYCLE_DATA.find(m => m.id === uc.targetModel)?.name || uc.targetModel}</div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* History Timeline */}
          <div>
            <div className="text-sm font-semibold text-slate-900 mb-3">Lifecycle History</div>
            <div className="space-y-3">
              {selectedModelData.history.slice().reverse().map((event, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getStateStyle(event.toState).color }}
                    />
                    {i < selectedModelData.history.length - 1 && (
                      <div className="w-0.5 flex-1 bg-slate-200 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getStateStyle(event.toState).bgColor}`}>
                        {getStateStyle(event.toState).label}
                      </span>
                      <span className="text-xs text-slate-500">{event.date}</span>
                    </div>
                    <div className="text-sm text-slate-700 mt-1">{event.reason}</div>
                    <div className="text-xs text-slate-400 mt-0.5">by {event.actor}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active Migrations */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Migration Paths</h3>
        <div className="space-y-3">
          {MIGRATION_PATHS.map((migration, i) => {
            const days = daysUntil(migration.deadline);
            const isUrgent = days !== null && days < 30;
            return (
              <div key={i} className="flex items-center gap-4 p-3 border border-slate-200 rounded-lg">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-sm font-medium text-slate-600">{migration.fromModel}</span>
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <span className="text-sm font-semibold text-slate-900">{migration.toModel}</span>
                </div>
                <div className="text-right">
                  <div className={`text-xs font-medium ${isUrgent ? 'text-rose-600' : 'text-slate-500'}`}>
                    {days !== null ? `${days}d to deadline` : 'No deadline'}
                  </div>
                  <div className="text-[10px] text-slate-400">{migration.deadline}</div>
                </div>
                <div className="text-center min-w-[80px]">
                  <div className="text-lg font-bold text-slate-900">{migration.useCasesRemaining}</div>
                  <div className="text-[10px] text-slate-400">remaining</div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-1 rounded border ${
                  migration.status === 'completed' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                  migration.status === 'in-progress' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                  'bg-slate-100 border-slate-200 text-slate-600'
                }`}>
                  {migration.status === 'completed' ? 'Completed' :
                   migration.status === 'in-progress' ? 'In Progress' : 'Not Started'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming Sunsets */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Upcoming Sunsets</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                <th scope="col" className="text-left py-2 px-3 font-medium">Model</th>
                <th scope="col" className="text-left py-2 px-3 font-medium">Sunset Date</th>
                <th scope="col" className="text-center py-2 px-3 font-medium">Days Left</th>
                <th scope="col" className="text-left py-2 px-3 font-medium">Successor</th>
                <th scope="col" className="text-center py-2 px-3 font-medium">Use Cases</th>
                <th scope="col" className="text-center py-2 px-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {LIFECYCLE_DATA.filter(m => m.sunsetDate).sort((a, b) =>
                new Date(a.sunsetDate!).getTime() - new Date(b.sunsetDate!).getTime()
              ).map(model => {
                const days = daysUntil(model.sunsetDate);
                const isUrgent = days !== null && days < 30;
                const isPast = days !== null && days < 0;
                return (
                  <tr key={model.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900">{model.name}</div>
                      <div className="text-[10px] text-slate-400">v{model.version}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{model.sunsetDate}</td>
                    <td className={`py-2.5 px-3 text-center font-semibold ${
                      isPast ? 'text-rose-600' : isUrgent ? 'text-amber-600' : 'text-slate-600'
                    }`}>
                      {isPast ? 'Past due' : `${days}d`}
                    </td>
                    <td className="py-2.5 px-3">
                      {model.successorModel ? (
                        <span className="text-blue-600 font-medium">
                          {LIFECYCLE_DATA.find(m => m.id === model.successorModel)?.name || model.successorModel}
                        </span>
                      ) : (
                        <span className="text-slate-400">None specified</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {model.useCases.filter(u => u.migrationStatus === 'active').length > 0 ? (
                        <span className="text-amber-600 font-semibold">{model.useCases.filter(u => u.migrationStatus === 'active').length}</span>
                      ) : (
                        <span className="text-emerald-600">0</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${getStateStyle(model.currentState).bgColor}`}>
                        {getStateStyle(model.currentState).label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
