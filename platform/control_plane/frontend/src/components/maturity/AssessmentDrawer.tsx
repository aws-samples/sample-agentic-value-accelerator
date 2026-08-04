import { useEffect, useMemo, useState } from 'react';
import type {
  MaturityAssessment,
  MaturityAssessmentCreate,
  MaturityWeights,
} from '../../api/client';
import {
  CATALOG,
  DIM_ACCENTS,
  DIMENSIONS,
  DEFAULT_WEIGHTS,
  STATUSES,
  MATURITY_LEVELS,
} from './types';
import { computeMaturity, levelColor } from './scoring';

interface Props {
  open: boolean;
  initial?: MaturityAssessment | null;
  existingNames?: string[]; // lowercase, excluding current item
  onClose: () => void;
  onSubmit: (req: MaturityAssessmentCreate, id?: string) => Promise<void>;
}

export default function AssessmentDrawer({ open, initial, existingNames = [], onClose, onSubmit }: Props) {
  const [step, setStep] = useState<'meta' | 'score'>('meta');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [organization, setOrganization] = useState('');
  const [assessor, setAssessor] = useState('');
  const [status, setStatus] = useState<MaturityAssessmentCreate['status']>('Draft');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [weights, setWeights] = useState<MaturityWeights>(DEFAULT_WEIGHTS);
  const [activeDim, setActiveDim] = useState<string>(DIMENSIONS[0].key);
  const [openParams, setOpenParams] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    setStep('meta');
    setError(null);
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setOrganization(initial?.organization ?? '');
    setAssessor(initial?.assessor ?? '');
    setStatus(initial?.status ?? 'Draft');
    setScores(initial?.scores ?? {});
    setWeights(initial?.weights ?? DEFAULT_WEIGHTS);
    setActiveDim(DIMENSIONS[0].key);
    setOpenParams({});
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const computed = useMemo(() => computeMaturity(scores, weights), [scores, weights]);
  const weightSum = useMemo(() => Object.values(weights).reduce((a, b) => a + b, 0), [weights]);

  const setScore = (id: string, val: number) => setScores((prev) => ({ ...prev, [id]: val }));
  const clearScore = (id: string) => setScores((prev) => { const n = { ...prev }; delete n[id]; return n; });

  const validate = (): string | null => {
    if (!name.trim()) return 'Assessment name is required';
    const lc = name.trim().toLowerCase();
    if (existingNames.includes(lc)) return `Name "${name.trim()}" is already in use`;
    if (Math.abs(weightSum - 1) > 0.001) return 'Dimension weights must total 100%';
    return null;
  };

  const handleSubmit = async () => {
    const v = validate();
    if (v) { setError(v); if (v.includes('Name')) setStep('meta'); return; }
    setSubmitting(true); setError(null);
    try {
      await onSubmit({
        name: name.trim(), description, organization, assessor, status,
        scores, weights,
      }, initial?.assessment_id);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition';

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-4xl bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
              {initial ? 'Edit assessment' : 'New maturity assessment'}
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mt-0.5">{name || 'Untitled assessment'}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step tabs + live verdict */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50/40">
          {(['meta', 'score'] as const).map((s, i) => (
            <button key={s} onClick={() => setStep(s)} className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              step === s ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'
            }`}>
              <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${
                step === s ? 'bg-white/30' : 'bg-slate-100 text-slate-500'
              }`}>{i + 1}</span>
              {s === 'meta' ? 'Assessment details' : `Score 167 parameters`}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live verdict</span>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${levelColor(computed.maturity_level)}`}>
              {computed.maturity_level ? `L${computed.maturity_level}` : '—'}
            </span>
            <span className="text-sm font-bold text-slate-800 tabular-nums">{computed.composite.toFixed(2)}</span>
            <span className="text-[10px] text-slate-400 tabular-nums">{computed.answered}/{computed.total}</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {step === 'meta' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Assessment name *</span>
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 2026 Enterprise AI Baseline" />
                  <span className="text-[11px] text-slate-400 mt-1 block">Names must be unique across all assessments.</span>
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Description</span>
                  <textarea className={inputCls} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why this assessment is being run, what populations it covers, and how the results will be used." />
                </label>
              </div>
              <label className="block">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Organization</span>
                <input className={inputCls} value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Business unit / division" />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Assessor</span>
                <input className={inputCls} value={assessor} onChange={(e) => setAssessor(e.target.value)} placeholder="Lead assessor name" />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Status</span>
                <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as any)}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
          )}

          {step === 'score' && (
            <div className="space-y-5">
              {/* Dimension weights */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Dimension Weights</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Total must equal 100%.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold tabular-nums ${Math.abs(weightSum - 1) <= 0.001 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {(weightSum * 100).toFixed(0)}%
                    </span>
                    <button type="button" onClick={() => setWeights(DEFAULT_WEIGHTS)} className="text-[11px] font-semibold text-blue-600 hover:text-blue-800">
                      Reset to defaults
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {DIMENSIONS.map((d) => (
                    <div key={d.key} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{d.label}</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min={0} max={100} step={5}
                          value={Math.round((weights as any)[d.key] * 100)}
                          onChange={(e) => setWeights({ ...weights, [d.key]: Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10))) / 100 })}
                          className="w-16 px-2 py-1 text-sm font-bold text-slate-800 tabular-nums rounded-md border border-slate-200 focus:border-blue-400 outline-none"
                        />
                        <span className="text-xs text-slate-400">%</span>
                        <div className="flex-1 h-1.5 bg-slate-200/60 rounded-full overflow-hidden ml-1">
                          <div className={`h-full bg-gradient-to-r ${DIM_ACCENTS[d.key].bar} rounded-full`} style={{ width: `${Math.min(100, (weights as any)[d.key] * 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dimension nav */}
              <div className="sticky top-0 -mx-6 px-6 py-2 bg-white/90 backdrop-blur z-10 border-y border-slate-100 flex flex-wrap gap-1.5">
                {DIMENSIONS.map((d) => {
                  const r = computed.dimensions[d.key];
                  const ans = r?.answered ?? 0;
                  const total = r?.total ?? 0;
                  const isActive = activeDim === d.key;
                  return (
                    <button
                      key={d.key}
                      onClick={() => {
                        setActiveDim(d.key);
                        const el = document.getElementById(`mat-dim-${d.key}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        isActive
                          ? `${DIM_ACCENTS[d.key].pill} border-current`
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {d.label} <span className="text-[10px] tabular-nums opacity-70">{ans}/{total}</span>
                    </button>
                  );
                })}
              </div>

              {/* Per-dimension parameter list */}
              {DIMENSIONS.map((d) => {
                const accent = DIM_ACCENTS[d.key];
                const params = (CATALOG as any)[d.key]?.parameters ?? [];
                const r = computed.dimensions[d.key];
                return (
                  <div key={d.key} id={`mat-dim-${d.key}`} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/40">
                      <div className="flex items-center gap-2.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${accent.pill} tracking-wider`}>
                          {Math.round((weights as any)[d.key] * 100)}%
                        </span>
                        <span className="text-sm font-semibold text-slate-800">{d.label}</span>
                        <span className="text-[10px] text-slate-400 tabular-nums">{r?.answered ?? 0}/{r?.total ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg</span>
                        <span className="text-sm font-bold text-slate-800 tabular-nums">{(r?.average ?? 0).toFixed(2)}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${levelColor(r?.maturity_level ?? 0)}`}>
                          {r?.maturity_level ? `L${r.maturity_level}` : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="px-5 py-3 divide-y divide-slate-100">
                      {params.map((p: any) => {
                        const v = scores[p.id] ?? 0;
                        const isOpen = !!openParams[p.id];
                        return (
                          <div key={p.id} className="py-2.5">
                            <div className="grid grid-cols-12 gap-3 items-start">
                              <div className="col-span-12 md:col-span-6">
                                <button
                                  type="button"
                                  onClick={() => setOpenParams((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                                  className="text-left w-full"
                                >
                                  <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className="text-[10px] font-bold text-slate-400 tabular-nums tracking-wider">{p.id}</span>
                                    <span className="text-sm font-medium text-slate-800">{p.name}</span>
                                    {p.sub && <span className="text-[10px] text-slate-400 italic">{p.sub}</span>}
                                  </div>
                                  {p.description && <p className="text-[11px] text-slate-500 mt-0.5">{p.description}</p>}
                                </button>
                                {isOpen && p.anchors && (
                                  <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-slate-600 bg-slate-50/60 rounded-lg p-2 border border-slate-100">
                                    {Object.entries(p.anchors).map(([k, txt]) => (
                                      <div key={k} className="flex gap-2">
                                        <span className="font-bold text-slate-400 tabular-nums w-6">{k}</span>
                                        <span>{String(txt)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="col-span-9 md:col-span-4 flex items-center gap-2">
                                <input
                                  type="range" min={0} max={5} step={1}
                                  value={v}
                                  onChange={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    if (n === 0) clearScore(p.id); else setScore(p.id, n);
                                  }}
                                  className={`w-full ${accent.thumb}`}
                                />
                              </div>
                              <div className="col-span-3 md:col-span-2 flex items-center justify-end gap-1.5">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => v === n ? clearScore(p.id) : setScore(p.id, n)}
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
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-between bg-white">
          {error ? (
            <div className="text-xs font-medium text-red-600">{error}</div>
          ) : (
            <div className="text-xs text-slate-500">
              {computed.answered > 0 ? (
                <>
                  Composite <span className="font-bold text-slate-800 tabular-nums">{computed.composite.toFixed(2)}</span>
                  {' · '}Maturity <span className={`font-bold px-1.5 py-0.5 rounded-md text-[10px] border ${levelColor(computed.maturity_level)}`}>
                    {MATURITY_LEVELS[computed.maturity_level]?.name}
                  </span>
                </>
              ) : (
                <>Score parameters to see a maturity level</>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100">Cancel</button>
            {step === 'meta' && (
              <button onClick={() => setStep('score')} className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800">
                Next: Score →
              </button>
            )}
            {step === 'score' && (
              <button onClick={handleSubmit} disabled={submitting}
                className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg disabled:opacity-50">
                {submitting ? 'Saving…' : (initial ? 'Save changes' : 'Create assessment')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
