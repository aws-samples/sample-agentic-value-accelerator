import { useEffect, useMemo, useState } from 'react';
import type {
  UseCase,
  UseCaseCreate,
  PrioritizationScores,
  DimensionWeights,
} from '../../api/client';
import {
  AI_TYPES,
  AUTOMATION_SCOPES,
  COMPLEXITIES,
  DEFAULT_SCORES,
  DEFAULT_WEIGHTS,
  DIMENSIONS,
  INTEGRATION_DEPTHS,
  STATUSES,
  SUB_CRITERIA,
} from './types';
import { computeLocal, verdictColor } from './scoring';

interface Props {
  open: boolean;
  initial?: UseCase | null;
  onClose: () => void;
  onSubmit: (req: UseCaseCreate, id?: string) => Promise<void>;
}

const DIM_ACCENTS: Record<string, { bar: string; pill: string; thumb: string }> = {
  business_value:        { bar: 'from-blue-500 to-blue-600',       pill: 'bg-blue-50 text-blue-700',       thumb: 'accent-blue-600' },
  technical_feasibility: { bar: 'from-teal-500 to-teal-600',       pill: 'bg-teal-50 text-teal-700',       thumb: 'accent-teal-600' },
  risk_governance:       { bar: 'from-red-500 to-red-600',         pill: 'bg-red-50 text-red-700',         thumb: 'accent-red-600' },
  org_readiness:         { bar: 'from-violet-500 to-violet-600',   pill: 'bg-violet-50 text-violet-700',   thumb: 'accent-violet-600' },
  strategic_alignment:   { bar: 'from-indigo-500 to-indigo-600',   pill: 'bg-indigo-50 text-indigo-700',   thumb: 'accent-indigo-600' },
  cost_efficiency:       { bar: 'from-emerald-500 to-emerald-600', pill: 'bg-emerald-50 text-emerald-700', thumb: 'accent-emerald-600' },
};

export default function UseCaseDrawer({ open, initial, onClose, onSubmit }: Props) {
  const [step, setStep] = useState<'meta' | 'score'>('meta');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [aiType, setAiType] = useState<UseCaseCreate['ai_type']>('Generative AI');
  const [businessDomain, setBusinessDomain] = useState('');
  const [complexity, setComplexity] = useState<UseCaseCreate['complexity']>('Medium');
  const [automationScope, setAutomationScope] = useState<UseCaseCreate['automation_scope']>('Co-pilot');
  const [integrationDepth, setIntegrationDepth] = useState<UseCaseCreate['integration_depth']>('API-connected real-time');
  const [businessOwner, setBusinessOwner] = useState('');
  const [technicalOwner, setTechnicalOwner] = useState('');
  const [targetGoLive, setTargetGoLive] = useState('');
  const [status, setStatus] = useState<UseCaseCreate['status']>('Concept');
  const [scores, setScores] = useState<PrioritizationScores>(DEFAULT_SCORES);
  const [weights, setWeights] = useState<DimensionWeights>(DEFAULT_WEIGHTS);

  useEffect(() => {
    if (!open) return;
    setStep('meta');
    setError(null);
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setAiType(initial?.ai_type ?? 'Generative AI');
    setBusinessDomain(initial?.business_domain ?? '');
    setComplexity(initial?.complexity ?? 'Medium');
    setAutomationScope(initial?.automation_scope ?? 'Co-pilot');
    setIntegrationDepth(initial?.integration_depth ?? 'API-connected real-time');
    setBusinessOwner(initial?.business_owner ?? '');
    setTechnicalOwner(initial?.technical_owner ?? '');
    setTargetGoLive(initial?.target_go_live ?? '');
    setStatus(initial?.status ?? 'Concept');
    setScores(initial?.scores ?? DEFAULT_SCORES);
    setWeights(initial?.weights ?? DEFAULT_WEIGHTS);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const computed = useMemo(() => computeLocal(scores, weights), [scores, weights]);
  const weightSum = useMemo(
    () => Object.values(weights).reduce((a, b) => a + b, 0),
    [weights]
  );

  const setSub = (dim: keyof PrioritizationScores, sub: string, value: number) => {
    setScores((prev) => ({ ...prev, [dim]: { ...prev[dim], [sub]: value } }));
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); setStep('meta'); return; }
    if (Math.abs(weightSum - 1) > 0.001) { setError('Dimension weights must total 100%'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        {
          name: name.trim(),
          description,
          ai_type: aiType,
          business_domain: businessDomain,
          complexity,
          automation_scope: automationScope,
          integration_depth: integrationDepth,
          business_owner: businessOwner,
          technical_owner: technicalOwner,
          target_go_live: targetGoLive,
          status,
          scores,
          weights,
        },
        initial?.use_case_id,
      );
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-3xl bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
              {initial ? 'Edit use case' : 'New use case'}
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mt-0.5">
              {name || 'Untitled use case'}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex gap-1 px-6 py-3 border-b border-slate-100 bg-slate-50/40">
          {(['meta', 'score'] as const).map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                step === s
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${
                step === s ? 'bg-white/30' : 'bg-slate-100 text-slate-500'
              }`}>
                {i + 1}
              </span>
              {s === 'meta' ? 'Use case details' : 'Score 25 sub-criteria'}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live verdict</span>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${verdictColor(computed.go_no_go)}`}>
              {computed.go_no_go}
            </span>
            <span className="text-sm font-bold text-slate-800 tabular-nums">{computed.composite.toFixed(2)}</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {step === 'meta' && <MetaForm
            name={name} setName={setName}
            description={description} setDescription={setDescription}
            aiType={aiType} setAiType={setAiType}
            businessDomain={businessDomain} setBusinessDomain={setBusinessDomain}
            complexity={complexity} setComplexity={setComplexity}
            automationScope={automationScope} setAutomationScope={setAutomationScope}
            integrationDepth={integrationDepth} setIntegrationDepth={setIntegrationDepth}
            businessOwner={businessOwner} setBusinessOwner={setBusinessOwner}
            technicalOwner={technicalOwner} setTechnicalOwner={setTechnicalOwner}
            targetGoLive={targetGoLive} setTargetGoLive={setTargetGoLive}
            status={status} setStatus={setStatus}
          />}
          {step === 'score' && <ScoreForm
            scores={scores} setSub={setSub}
            weights={weights} setWeights={setWeights}
            weightSum={weightSum}
            computed={computed}
          />}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-between bg-white">
          {error ? (
            <div className="text-xs font-medium text-red-600">{error}</div>
          ) : (
            <div className="text-xs text-slate-500">
              Composite <span className="font-bold text-slate-800 tabular-nums">{computed.composite.toFixed(2)}</span>
              {' · '}Risk <span className="font-bold text-slate-800 tabular-nums">{computed.risk_score}</span>
              {' · '}Readiness <span className="font-bold text-slate-800 tabular-nums">{computed.readiness_score.toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100">
              Cancel
            </button>
            {step === 'meta' && (
              <button
                onClick={() => setStep('score')}
                className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800"
              >
                Next: Score →
              </button>
            )}
            {step === 'score' && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg disabled:opacity-50"
              >
                {submitting ? 'Saving…' : (initial ? 'Save changes' : 'Create use case')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Meta form ----------

interface MetaProps {
  name: string; setName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  aiType: any; setAiType: (v: any) => void;
  businessDomain: string; setBusinessDomain: (v: string) => void;
  complexity: any; setComplexity: (v: any) => void;
  automationScope: any; setAutomationScope: (v: any) => void;
  integrationDepth: any; setIntegrationDepth: (v: any) => void;
  businessOwner: string; setBusinessOwner: (v: string) => void;
  technicalOwner: string; setTechnicalOwner: (v: string) => void;
  targetGoLive: string; setTargetGoLive: (v: string) => void;
  status: any; setStatus: (v: any) => void;
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{label}</span>
    {children}
  </label>
);

function MetaForm(p: MetaProps) {
  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <Field label="Use case name *">
          <input className={inputCls} value={p.name} onChange={(e) => p.setName(e.target.value)} placeholder="e.g. Customer Churn Prediction" />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Description">
          <textarea className={inputCls} rows={3} value={p.description} onChange={(e) => p.setDescription(e.target.value)} placeholder="What problem does this solve, who benefits, how does it tie to a measurable outcome?" />
        </Field>
      </div>
      <Field label="AI Type">
        <select className={inputCls} value={p.aiType} onChange={(e) => p.setAiType(e.target.value)}>
          {AI_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Business Domain">
        <input className={inputCls} value={p.businessDomain} onChange={(e) => p.setBusinessDomain(e.target.value)} placeholder="e.g. Sales & Marketing" />
      </Field>
      <Field label="Complexity">
        <select className={inputCls} value={p.complexity} onChange={(e) => p.setComplexity(e.target.value)}>
          {COMPLEXITIES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Automation Scope">
        <select className={inputCls} value={p.automationScope} onChange={(e) => p.setAutomationScope(e.target.value)}>
          {AUTOMATION_SCOPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Integration Depth">
        <select className={inputCls} value={p.integrationDepth} onChange={(e) => p.setIntegrationDepth(e.target.value)}>
          {INTEGRATION_DEPTHS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Status">
        <select className={inputCls} value={p.status} onChange={(e) => p.setStatus(e.target.value)}>
          {STATUSES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Business Owner">
        <input className={inputCls} value={p.businessOwner} onChange={(e) => p.setBusinessOwner(e.target.value)} placeholder="VP / Director name" />
      </Field>
      <Field label="Technical Owner">
        <input className={inputCls} value={p.technicalOwner} onChange={(e) => p.setTechnicalOwner(e.target.value)} placeholder="Tech lead name" />
      </Field>
      <Field label="Target Go-Live">
        <input className={inputCls} value={p.targetGoLive} onChange={(e) => p.setTargetGoLive(e.target.value)} placeholder="e.g. Q3 2026" />
      </Field>
    </div>
  );
}

// ---------- Score form ----------

interface ScoreProps {
  scores: PrioritizationScores;
  setSub: (dim: keyof PrioritizationScores, sub: string, val: number) => void;
  weights: DimensionWeights;
  setWeights: (w: DimensionWeights) => void;
  weightSum: number;
  computed: ReturnType<typeof computeLocal>;
}

function ScoreForm({ scores, setSub, weights, setWeights, weightSum, computed }: ScoreProps) {
  const balanced = Math.abs(weightSum - 1) <= 0.001;

  return (
    <div className="space-y-5">
      {/* Dimension weights */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Dimension Weights</h4>
            <p className="text-xs text-slate-500 mt-0.5">Tune top-level weighting. Must total 100%.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold tabular-nums ${balanced ? 'text-emerald-600' : 'text-red-600'}`}>
              {(weightSum * 100).toFixed(0)}%
            </span>
            <button
              type="button"
              onClick={() => setWeights({
                business_value: 0.30, technical_feasibility: 0.20,
                risk_governance: 0.15, org_readiness: 0.15,
                strategic_alignment: 0.10, cost_efficiency: 0.10,
              })}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
            >
              Reset to defaults
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {DIMENSIONS.map((d) => (
            <div key={d.key} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{d.name}</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round((weights as any)[d.key] * 100)}
                  onChange={(e) => setWeights({ ...weights, [d.key]: Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10))) / 100 })}
                  className="w-16 px-2 py-1 text-sm font-bold text-slate-800 tabular-nums rounded-md border border-slate-200 focus:border-blue-400 outline-none"
                />
                <span className="text-xs text-slate-400">%</span>
                <div className="flex-1 h-1.5 bg-slate-200/60 rounded-full overflow-hidden ml-1">
                  <div
                    className={`h-full bg-gradient-to-r ${DIM_ACCENTS[d.key].bar} rounded-full`}
                    style={{ width: `${Math.min(100, (weights as any)[d.key] * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-criteria */}
      {DIMENSIONS.map((d) => {
        const accent = DIM_ACCENTS[d.key];
        const subs = SUB_CRITERIA[d.key];
        const subtotal = (computed.dimension_subtotals as any)[d.key] as number;
        return (
          <div key={d.key} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/40">
              <div className="flex items-center gap-2.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${accent.pill} tracking-wider`}>
                  {Math.round((weights as any)[d.key] * 100)}%
                </span>
                <span className="text-sm font-semibold text-slate-800">{d.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subtotal</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">{subtotal.toFixed(2)}</span>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {subs.map((s) => {
                const v = (scores as any)[d.key][s.key] as number;
                return (
                  <div key={s.key} className="grid grid-cols-12 gap-3 items-center">
                    <div className="col-span-12 md:col-span-5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-slate-800">{s.label}</span>
                        <span className="text-[10px] font-bold text-slate-400 tracking-wider">{Math.round(s.weight * 100)}%</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{s.help}</p>
                    </div>
                    <div className="col-span-9 md:col-span-5 flex items-center gap-2">
                      <input
                        type="range"
                        min={1}
                        max={5}
                        step={1}
                        value={v}
                        onChange={(e) => setSub(d.key as keyof PrioritizationScores, s.key, parseInt(e.target.value, 10))}
                        className={`w-full ${accent.thumb}`}
                      />
                    </div>
                    <div className="col-span-3 md:col-span-2 flex items-center justify-end gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setSub(d.key as keyof PrioritizationScores, s.key, n)}
                          className={`w-6 h-6 rounded-md text-[11px] font-bold transition-all ${
                            v === n
                              ? `bg-gradient-to-br ${accent.bar} text-white shadow`
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
