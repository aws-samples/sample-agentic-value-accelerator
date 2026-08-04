import { useEffect, useMemo, useState } from 'react';
import {
  DIMENSIONS, QUESTION_CATALOG, DEFAULT_WEIGHTS, DEFAULT_INVESTMENT, DEFAULT_ROADMAP,
  PATTERNS, GOVERNANCE_APPROACHES, CAPABILITIES, STATUSES, DIM_ACCENTS, LEVEL_NAMES,
} from './types';
import type {
  OperatingModel, OperatingModelCreate, OperatingModelWeights, InvestmentSplit,
  RoadmapPhase, CapabilityChoice, OperatingPattern, GovernanceApproach, Placement,
} from './types';
import { compute, levelColor, patternColor, placementColor } from './scoring';

type Step = 'meta' | 'score' | 'design' | 'capabilities' | 'investment' | 'review';

interface Props {
  open: boolean;
  initial?: OperatingModel | null;
  existingNames?: string[];
  onClose: () => void;
  onSubmit: (req: OperatingModelCreate, id?: string) => Promise<void>;
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'meta',          label: 'Details' },
  { id: 'score',         label: 'Score 21 questions' },
  { id: 'design',        label: 'Pattern & governance' },
  { id: 'capabilities',  label: '20 capabilities' },
  { id: 'investment',    label: 'Investment & roadmap' },
  { id: 'review',        label: 'Review & save' },
];

export default function OperatingModelDrawer({ open, initial, existingNames = [], onClose, onSubmit }: Props) {
  const [step, setStep] = useState<Step>('meta');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [organization, setOrganization] = useState('');
  const [designer, setDesigner] = useState('');
  const [status, setStatus] = useState<OperatingModel['status']>('Draft');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [weights, setWeights] = useState<OperatingModelWeights>(DEFAULT_WEIGHTS);
  const [pattern, setPattern] = useState<OperatingPattern | ''>('');
  const [governance, setGovernance] = useState<GovernanceApproach | ''>('');
  const [capabilityChoices, setCapabilityChoices] = useState<CapabilityChoice[]>(
    CAPABILITIES.map((c) => ({ capability_id: c.id, placement: c.defaultPlacement, ownership: c.defaultOwnership })),
  );
  const [investment, setInvestment] = useState<InvestmentSplit>(DEFAULT_INVESTMENT);
  const [roadmap, setRoadmap] = useState<RoadmapPhase[]>(DEFAULT_ROADMAP);
  const [activeDim, setActiveDim] = useState<string>(DIMENSIONS[0].key);
  const [openParams, setOpenParams] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    setStep('meta');
    setError(null);
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setOrganization(initial?.organization ?? '');
    setDesigner(initial?.designer ?? '');
    setStatus(initial?.status ?? 'Draft');
    setScores(initial?.scores ?? {});
    setWeights(initial?.weights ?? DEFAULT_WEIGHTS);
    setPattern(initial?.pattern ?? '');
    setGovernance(initial?.governance ?? '');
    setCapabilityChoices(initial?.capability_choices ?? CAPABILITIES.map((c) => ({ capability_id: c.id, placement: c.defaultPlacement, ownership: c.defaultOwnership })));
    setInvestment(initial?.investment ?? DEFAULT_INVESTMENT);
    setRoadmap(initial?.roadmap ?? DEFAULT_ROADMAP);
    setActiveDim(DIMENSIONS[0].key);
    setOpenParams({});
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const computed = useMemo(() => compute(scores, weights, roadmap, investment), [scores, weights, roadmap, investment]);
  const weightSum = useMemo(() => Object.values(weights).reduce((a, b) => a + b, 0), [weights]);
  const investmentSum = investment.people_pct + investment.technology_pct + investment.algorithms_pct;
  const totalInvestment = roadmap.filter((p) => p.enabled).reduce((s, p) => s + p.investment_m, 0);

  const setScore = (id: string, val: number) => setScores((prev) => ({ ...prev, [id]: val }));
  const clearScore = (id: string) => setScores((prev) => { const n = { ...prev }; delete n[id]; return n; });

  const validate = (): string | null => {
    if (!name.trim()) return 'Operating model name is required';
    const lc = name.trim().toLowerCase();
    if (existingNames.includes(lc)) return `Name "${name.trim()}" is already in use`;
    if (Math.abs(weightSum - 1) > 0.001) return 'Dimension weights must total 100%';
    if (investmentSum !== 100) return 'Investment split must total 100%';
    return null;
  };

  const handleSubmit = async () => {
    const v = validate();
    if (v) { setError(v); if (v.includes('Name')) setStep('meta'); return; }
    setSubmitting(true); setError(null);
    try {
      await onSubmit({
        name: name.trim(), description, organization, designer, status,
        scores, weights,
        pattern: (pattern || computed.recommended_pattern) as OperatingPattern,
        governance: (governance || computed.recommended_governance) as GovernanceApproach,
        capability_choices: capabilityChoices,
        investment, roadmap,
      }, initial?.operating_model_id);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const goNext = () => { if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1].id); };
  const goPrev = () => { if (stepIndex > 0) setStep(STEPS[stepIndex - 1].id); };

  if (!open) return null;
  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition';

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-5xl bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
              {initial ? 'Edit operating model' : 'Design operating model'}
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mt-0.5">{name || 'Untitled operating model'}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step nav + verdict */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50/40">
          {STEPS.map((s, i) => (
            <button key={s.id} onClick={() => setStep(s.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                step === s.id ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'
              }`}>
              <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${step === s.id ? 'bg-white/30' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
              {s.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Verdict</span>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${levelColor(computed.maturity_level)}`}>
              {computed.maturity_level ? `L${computed.maturity_level}` : '—'}
            </span>
            <span className="text-sm font-bold text-slate-800 tabular-nums">{computed.composite.toFixed(2)}</span>
            <span className="text-[10px] text-slate-400 tabular-nums">{computed.answered}/{computed.total}</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* STEP 1: Meta */}
          {step === 'meta' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Operating model name *</span>
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FY26 Hub-and-Spoke for Capital Markets" />
                  <span className="text-[11px] text-slate-400 mt-1 block">Names must be unique across all operating models.</span>
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Description</span>
                  <textarea className={inputCls} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why this design exists, what populations it covers, and how it ties to maturity / business cases." />
                </label>
              </div>
              <label className="block">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Organization</span>
                <input className={inputCls} value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Business unit / division" />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Designer</span>
                <input className={inputCls} value={designer} onChange={(e) => setDesigner(e.target.value)} placeholder="Lead architect / CAIO office" />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Status</span>
                <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as any)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
          )}

          {/* STEP 2: Score */}
          {step === 'score' && (
            <div className="space-y-5">
              {/* Weights */}
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
                    <button type="button" onClick={() => setWeights(DEFAULT_WEIGHTS)} className="text-[11px] font-semibold text-blue-600 hover:text-blue-800">Reset to defaults</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                    <button key={d.key}
                      onClick={() => {
                        setActiveDim(d.key);
                        const el = document.getElementById(`om-dim-${d.key}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        isActive ? `${DIM_ACCENTS[d.key].pill} border-current` : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}>
                      {d.label} <span className="text-[10px] tabular-nums opacity-70">{ans}/{total}</span>
                    </button>
                  );
                })}
              </div>

              {/* Per-dimension question list */}
              {DIMENSIONS.map((d) => {
                const accent = DIM_ACCENTS[d.key];
                const cat = QUESTION_CATALOG[d.key];
                const r = computed.dimensions[d.key];
                return (
                  <div key={d.key} id={`om-dim-${d.key}`} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/40">
                      <div className="flex items-center gap-2.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${accent.pill} tracking-wider`}>
                          {Math.round((weights as any)[d.key] * 100)}%
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{d.label}</div>
                          <div className="text-[10px] text-slate-500">{cat.description}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg</span>
                        <span className="text-sm font-bold text-slate-800 tabular-nums">{(r?.average ?? 0).toFixed(2)}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${levelColor(r?.level ?? 0)}`}>
                          {r?.level ? `L${r.level}` : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="px-5 py-3 divide-y divide-slate-100">
                      {cat.questions.map((q) => {
                        const v = scores[q.id] ?? 0;
                        const isOpen = !!openParams[q.id];
                        return (
                          <div key={q.id} className="py-2.5">
                            <div className="grid grid-cols-12 gap-3 items-start">
                              <div className="col-span-12 md:col-span-6">
                                <button type="button" onClick={() => setOpenParams((prev) => ({ ...prev, [q.id]: !prev[q.id] }))} className="text-left w-full">
                                  <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className="text-[10px] font-bold text-slate-400 tabular-nums tracking-wider">{q.id}</span>
                                    <span className="text-sm font-medium text-slate-800">{q.prompt}</span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5">{q.helper}</p>
                                </button>
                                {isOpen && q.anchors && (
                                  <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-slate-600 bg-slate-50/60 rounded-lg p-2 border border-slate-100">
                                    {Object.entries(q.anchors).map(([k, txt]) => (
                                      <div key={k} className="flex gap-2">
                                        <span className="font-bold text-slate-400 tabular-nums w-6">{k}</span>
                                        <span>{String(txt)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="col-span-9 md:col-span-4 flex items-center gap-2">
                                <input type="range" min={0} max={5} step={1} value={v}
                                  onChange={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    if (n === 0) clearScore(q.id); else setScore(q.id, n);
                                  }}
                                  className={`w-full ${accent.thumb}`} />
                              </div>
                              <div className="col-span-3 md:col-span-2 flex items-center justify-end gap-1.5">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <button key={n} type="button" onClick={() => v === n ? clearScore(q.id) : setScore(q.id, n)}
                                    className={`w-6 h-6 rounded-md text-[11px] font-bold transition-all ${
                                      v === n ? `bg-gradient-to-br ${accent.bar} text-white shadow` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}>
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

          {/* STEP 3: Pattern + governance design */}
          {step === 'design' && (
            <div className="space-y-5">
              {/* Recommendation banner */}
              <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5">
                <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">Recommendation from your assessment</div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full border ${patternColor(computed.recommended_pattern)}`}>
                    {computed.recommended_pattern}
                  </span>
                  <span className="text-xs text-slate-500">·</span>
                  <span className="text-xs font-semibold text-slate-700">{computed.recommended_governance}</span>
                  <span className="ml-auto text-[11px] text-slate-500 italic">{LEVEL_NAMES[computed.maturity_level].tagline}</span>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-2">Operating Model Pattern</h4>
                <p className="text-xs text-slate-500 mb-3">Override the recommendation if your context calls for it (e.g. regulatory constraint pulls toward Centralized).</p>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                  {PATTERNS.map((p) => {
                    const selected = (pattern || computed.recommended_pattern) === p;
                    return (
                      <button key={p} type="button" onClick={() => setPattern(p)}
                        className={`text-left rounded-xl border p-3 transition ${
                          selected ? 'border-blue-400 bg-blue-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-300'
                        }`}>
                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block border ${patternColor(p)}`}>{p}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-2">Governance Approach</h4>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                  {GOVERNANCE_APPROACHES.map((g) => {
                    const selected = (governance || computed.recommended_governance) === g;
                    return (
                      <button key={g} type="button" onClick={() => setGovernance(g)}
                        className={`text-left rounded-xl border p-3 transition ${
                          selected ? 'border-blue-400 bg-blue-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-300'
                        }`}>
                        <div className="text-[11px] font-semibold text-slate-700">{g}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Capabilities */}
          {step === 'capabilities' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                Place each of the 20 AI capabilities in your operating model. Defaults reflect the McKinsey-recommended placement; override per row to match your design.
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50/60 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-[10px] w-10">#</th>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-[10px]">Capability</th>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-[10px]">Placement</th>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-[10px]">Ownership</th>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-[10px]">AWS Service</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {CAPABILITIES.map((c) => {
                      const choice = capabilityChoices.find((x) => x.capability_id === c.id);
                      const placement = choice?.placement ?? c.defaultPlacement;
                      const ownership = choice?.ownership ?? c.defaultOwnership;
                      return (
                        <tr key={c.id} className="hover:bg-blue-50/30">
                          <td className="px-3 py-2 text-slate-400 tabular-nums">{c.id}</td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{c.name}</td>
                          <td className="px-3 py-2">
                            <select value={placement}
                              onChange={(e) => setCapabilityChoices((prev) => prev.map((x) => x.capability_id === c.id ? { ...x, placement: e.target.value as Placement } : x))}
                              className={`text-[11px] font-bold px-2 py-1 rounded-md border outline-none ${placementColor(placement)}`}>
                              <option value="Centralized">Centralized</option>
                              <option value="Hub-and-Spoke">Hub-and-Spoke</option>
                              <option value="Federated">Federated</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input value={ownership}
                              onChange={(e) => setCapabilityChoices((prev) => prev.map((x) => x.capability_id === c.id ? { ...x, ownership: e.target.value } : x))}
                              className="w-full px-2 py-1 text-xs rounded-md border border-slate-200 focus:border-blue-400 outline-none" />
                          </td>
                          <td className="px-3 py-2 text-[11px] text-slate-500 italic">{c.awsService}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 5: Investment & roadmap */}
          {step === 'investment' && (
            <div className="space-y-5">
              {/* BCG split */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Investment Split (BCG 10-20-70)</h4>
                    <p className="text-xs text-slate-500 mt-0.5">People/process : Technology : Algorithms. Total must equal 100%.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold tabular-nums ${investmentSum === 100 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {investmentSum}%
                    </span>
                    <button type="button" onClick={() => setInvestment(DEFAULT_INVESTMENT)} className="text-[11px] font-semibold text-blue-600 hover:text-blue-800">Reset</button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    ['people_pct',     'People & Process',  'from-blue-500 to-indigo-600'],
                    ['technology_pct', 'Technology & Platform', 'from-violet-500 to-purple-600'],
                    ['algorithms_pct', 'Algorithms & Models',   'from-amber-500 to-orange-500'],
                  ] as const).map(([k, label, accent]) => (
                    <div key={k} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{label}</div>
                      <div className="flex items-center gap-2">
                        <input type="number" min={0} max={100} step={1} value={investment[k]}
                          onChange={(e) => setInvestment({ ...investment, [k]: Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10))) })}
                          className="w-16 px-2 py-1 text-sm font-bold text-slate-800 tabular-nums rounded-md border border-slate-200 focus:border-blue-400 outline-none" />
                        <span className="text-xs text-slate-400">%</span>
                        <div className="flex-1 h-1.5 bg-slate-200/60 rounded-full overflow-hidden ml-1">
                          <div className={`h-full bg-gradient-to-r ${accent} rounded-full`} style={{ width: `${Math.min(100, investment[k])}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Roadmap phases */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Phased Roadmap</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Toggle phases on/off and adjust the per-phase budget (in $M).</p>
                  </div>
                  <div className="text-xs">
                    <span className="text-slate-400 mr-1">Total</span>
                    <span className="font-bold tabular-nums text-slate-800">${totalInvestment.toFixed(1)}M</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {roadmap.map((p, i) => (
                    <div key={i} className={`grid grid-cols-12 gap-3 items-center rounded-xl border p-3 ${p.enabled ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/40 opacity-60'}`}>
                      <div className="col-span-1">
                        <input type="checkbox" checked={p.enabled}
                          onChange={(e) => setRoadmap((prev) => prev.map((x, idx) => idx === i ? { ...x, enabled: e.target.checked } : x))}
                          className="accent-blue-600 w-4 h-4" />
                      </div>
                      <div className="col-span-5">
                        <input value={p.name}
                          onChange={(e) => setRoadmap((prev) => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                          className="w-full px-2 py-1.5 text-sm font-semibold rounded-md border border-slate-200 focus:border-blue-400 outline-none" />
                      </div>
                      <div className="col-span-3">
                        <input value={p.months}
                          onChange={(e) => setRoadmap((prev) => prev.map((x, idx) => idx === i ? { ...x, months: e.target.value } : x))}
                          placeholder="e.g. 0–6 months"
                          className="w-full px-2 py-1.5 text-sm rounded-md border border-slate-200 focus:border-blue-400 outline-none" />
                      </div>
                      <div className="col-span-3 flex items-center gap-2">
                        <span className="text-xs text-slate-400">$</span>
                        <input type="number" min={0} step={0.1} value={p.investment_m}
                          onChange={(e) => setRoadmap((prev) => prev.map((x, idx) => idx === i ? { ...x, investment_m: parseFloat(e.target.value || '0') } : x))}
                          className="w-full px-2 py-1.5 text-sm font-bold tabular-nums rounded-md border border-slate-200 focus:border-blue-400 outline-none" />
                        <span className="text-xs text-slate-400">M</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Review */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <ReviewStat label="Composite" value={computed.composite.toFixed(2)} accent="from-blue-600 to-indigo-600" />
                <ReviewStat label="Maturity Level" value={computed.maturity_level ? `L${computed.maturity_level}` : '—'} accent="from-indigo-600 to-violet-600" />
                <ReviewStat label="Total Investment" value={`$${computed.total_investment_m.toFixed(1)}M`} accent="from-amber-500 to-orange-500" />
              </div>

              <ReviewSection title="Pattern & Governance">
                <div className="flex items-center gap-3 flex-wrap text-sm">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${patternColor((pattern || computed.recommended_pattern) as OperatingPattern)}`}>
                    {pattern || computed.recommended_pattern}
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-700">{governance || computed.recommended_governance}</span>
                </div>
              </ReviewSection>

              <ReviewSection title="Per-Dimension Scores">
                <div className="space-y-1.5">
                  {DIMENSIONS.map((d) => {
                    const r = computed.dimensions[d.key];
                    const accent = DIM_ACCENTS[d.key];
                    return (
                      <div key={d.key} className="flex items-center gap-2 text-[11px]">
                        <span className="w-44 truncate text-slate-600">{d.label}</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full bg-gradient-to-r ${accent.bar}`} style={{ width: `${((r?.average ?? 0) / 5) * 100}%` }} />
                        </div>
                        <span className="w-12 text-right tabular-nums text-slate-700 font-semibold">{(r?.average ?? 0).toFixed(2)}</span>
                        <span className="w-12 text-right tabular-nums text-slate-400">{r?.answered ?? 0}/{r?.total ?? 0}</span>
                      </div>
                    );
                  })}
                </div>
              </ReviewSection>

              <ReviewSection title="Capability Distribution">
                <div className="grid grid-cols-3 gap-3 text-xs">
                  {(['Centralized', 'Hub-and-Spoke', 'Federated'] as const).map((p) => {
                    const count = capabilityChoices.filter((c) => c.placement === p).length;
                    return (
                      <div key={p} className={`rounded-xl border p-3 ${placementColor(p)}`}>
                        <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{p}</div>
                        <div className="text-2xl font-bold tabular-nums">{count}</div>
                        <div className="text-[10px] opacity-70">capabilities</div>
                      </div>
                    );
                  })}
                </div>
              </ReviewSection>

              <ReviewSection title="Investment & Roadmap">
                <div className="text-xs text-slate-700 mb-2">
                  Split: <span className="font-bold">{investment.people_pct}%</span> people · <span className="font-bold">{investment.technology_pct}%</span> tech · <span className="font-bold">{investment.algorithms_pct}%</span> algorithms
                </div>
                <ul className="space-y-1 text-xs">
                  {roadmap.filter((p) => p.enabled).map((p) => (
                    <li key={p.name} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1">
                      <span className="text-slate-700">
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-slate-400 ml-2">{p.months}</span>
                      </span>
                      <span className="font-bold tabular-nums text-slate-800">${p.investment_m.toFixed(1)}M</span>
                    </li>
                  ))}
                </ul>
              </ReviewSection>
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
                  {' · '}Pattern <span className="font-semibold text-slate-700">{pattern || computed.recommended_pattern}</span>
                </>
              ) : (
                <>Score 21 questions across 7 dimensions to see a recommendation</>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100">Cancel</button>
            {stepIndex > 0 && (
              <button onClick={goPrev} className="px-4 py-2 text-sm font-medium text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-50">← Back</button>
            )}
            {step !== 'review' && (
              <button onClick={goNext} className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800">
                Next →
              </button>
            )}
            {step === 'review' && (
              <button onClick={handleSubmit} disabled={submitting}
                className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg disabled:opacity-50">
                {submitting ? 'Saving…' : (initial ? 'Save changes' : 'Create operating model')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold bg-gradient-to-r ${accent} bg-clip-text text-transparent mt-1 tabular-nums`}>{value}</div>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{title}</div>
      {children}
    </div>
  );
}
