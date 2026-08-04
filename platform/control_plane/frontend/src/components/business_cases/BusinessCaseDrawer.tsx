import { useEffect, useMemo, useState } from 'react';
import type {
  BusinessCase, BusinessCaseCreate, ProjectInputs,
  CostModel, BenefitModel, RiskScorecard, RiskWeights,
  CostLineItem, BenefitLineItem,
} from '../../api/client';
import {
  STATUSES, INDUSTRIES, AI_TYPES, PROJECT_SIZES,
  RISK_CATEGORIES, INDUSTRY_WACC,
  DEFAULT_INPUTS, DEFAULT_COSTS, DEFAULT_BENEFITS,
  DEFAULT_RISK, DEFAULT_RISK_WEIGHTS,
} from './types';
import { computeBC, decisionColor, riskColor, fmtMoney, fmtPct } from './scoring';

type Tab = 'meta' | 'inputs' | 'costs' | 'benefits' | 'risk';

interface Props {
  open: boolean;
  initial?: BusinessCase | null;
  existingNames?: string[];
  onClose: () => void;
  onSubmit: (req: BusinessCaseCreate, id?: string) => Promise<void>;
}

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition';

export default function BusinessCaseDrawer({ open, initial, existingNames = [], onClose, onSubmit }: Props) {
  const [tab, setTab] = useState<Tab>('meta');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<BusinessCaseCreate['status']>('Draft');
  const [inputs, setInputs] = useState<ProjectInputs>(DEFAULT_INPUTS);
  const [costs, setCosts] = useState<CostModel>(DEFAULT_COSTS);
  const [benefits, setBenefits] = useState<BenefitModel>(DEFAULT_BENEFITS);
  const [riskScores, setRiskScores] = useState<RiskScorecard>(DEFAULT_RISK);
  const [riskWeights] = useState<RiskWeights>(DEFAULT_RISK_WEIGHTS);

  useEffect(() => {
    if (!open) return;
    setTab('meta');
    setError(null);
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setStatus(initial?.status ?? 'Draft');
    setInputs(initial?.inputs ?? DEFAULT_INPUTS);
    setCosts(initial?.costs ?? DEFAULT_COSTS);
    setBenefits(initial?.benefits ?? DEFAULT_BENEFITS);
    setRiskScores(initial?.risk_scores ?? DEFAULT_RISK);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const computed = useMemo(
    () => computeBC(inputs, costs, benefits, riskScores, riskWeights),
    [inputs, costs, benefits, riskScores, riskWeights]
  );

  // When industry changes, suggest the matching WACC.
  const setIndustry = (v: ProjectInputs['industry']) => {
    setInputs((prev) => ({ ...prev, industry: v, wacc_base: INDUSTRY_WACC[v] ?? prev.wacc_base }));
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'Business case name is required';
    if (existingNames.includes(name.trim().toLowerCase())) return `Name "${name.trim()}" is already in use`;
    return null;
  };

  const handleSubmit = async () => {
    const v = validate();
    if (v) { setError(v); if (v.includes('Name')) setTab('meta'); return; }
    setSubmitting(true); setError(null);
    try {
      await onSubmit({
        name: name.trim(), description, status,
        inputs, costs, benefits,
        risk_scores: riskScores, risk_weights: riskWeights,
      }, initial?.business_case_id);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  const fin = computed.financials;
  const risk = computed.risk;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-5xl bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
              {initial ? 'Edit business case' : 'New business case'}
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mt-0.5">{name || 'Untitled business case'}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab nav + verdict */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50/40">
          {(['meta', 'inputs', 'costs', 'benefits', 'risk'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
              tab === t ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'
            }`}>
              {t === 'meta' ? 'Details' : t === 'inputs' ? 'Project inputs' : t}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">NPV</span>
            <span className="text-sm font-bold text-slate-800 tabular-nums">{fmtMoney(fin.npv)}</span>
            <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${decisionColor(fin.npv_decision)}`}>
              {fin.npv_decision.split(' - ')[0]}
            </span>
            <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${riskColor(risk.level)}`}>
              {risk.level.split(' ')[0]}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {tab === 'meta' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Business case name *</span>
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AI-Powered Underwriting Acceleration" />
                  <span className="text-[11px] text-slate-400 mt-1 block">Names must be unique across all business cases.</span>
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Description</span>
                  <textarea className={inputCls} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why this investment, what outcome, and how value is realized." />
                </label>
              </div>
              <label className="block">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Status</span>
                <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as any)}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
          )}

          {tab === 'inputs' && <InputsTab inputs={inputs} setInputs={setInputs} setIndustry={setIndustry} />}
          {tab === 'costs' && <CostsTab costs={costs} setCosts={setCosts} />}
          {tab === 'benefits' && <BenefitsTab benefits={benefits} setBenefits={setBenefits} />}
          {tab === 'risk' && <RiskTab scores={riskScores} setScores={setRiskScores} computed={computed.risk} />}

          {/* Metrics summary always visible at bottom of body */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-2">
            {[
              { label: 'NPV', value: fmtMoney(fin.npv), accent: 'from-blue-600 to-indigo-600' },
              { label: 'IRR', value: fmtPct(fin.irr), accent: fin.irr_passes_hurdle ? 'from-emerald-500 to-teal-600' : 'from-amber-500 to-orange-500' },
              { label: 'ROI', value: fmtPct(fin.roi), accent: 'from-violet-600 to-fuchsia-600' },
              { label: 'Payback', value: fin.payback_years === null ? '>3 yrs' : `${fin.payback_years.toFixed(2)} yrs`, accent: 'from-indigo-500 to-purple-500' },
              { label: 'B/C Ratio', value: fin.benefit_cost_ratio.toFixed(2), accent: 'from-teal-500 to-cyan-600' },
              { label: 'Risk', value: risk.composite.toFixed(2), accent: risk.level.startsWith('LOW') ? 'from-emerald-500 to-teal-600' : risk.level.startsWith('HIGH') ? 'from-red-500 to-pink-600' : 'from-amber-500 to-orange-500' },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{m.label}</div>
                <div className={`text-lg font-bold bg-gradient-to-r ${m.accent} bg-clip-text text-transparent tabular-nums mt-1`}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-between bg-white">
          {error ? (
            <div className="text-xs font-medium text-red-600">{error}</div>
          ) : (
            <div className="text-xs text-slate-500">
              Total benefits {fmtMoney(fin.total_benefits)} · Total costs {fmtMoney(fin.total_costs)} · Hurdle {fmtPct(inputs.hurdle_rate, 0)} {fin.irr_passes_hurdle ? '(IRR passes)' : '(IRR below)'}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting}
              className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg disabled:opacity-50">
              {submitting ? 'Saving…' : (initial ? 'Save changes' : 'Create business case')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Tabs
// ----------------------------------------------------------------------------

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-slate-400 mt-1 block">{hint}</span>}
    </label>
  );
}

function InputsTab({ inputs, setInputs, setIndustry }: { inputs: ProjectInputs; setInputs: (i: ProjectInputs) => void; setIndustry: (v: ProjectInputs['industry']) => void }) {
  const set = <K extends keyof ProjectInputs>(k: K, v: ProjectInputs[K]) => setInputs({ ...inputs, [k]: v });
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h4 className="text-sm font-semibold text-slate-800 mb-3">Identification</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Sponsor"><input className={inputCls} value={inputs.sponsor} onChange={(e) => set('sponsor', e.target.value)} placeholder="Chief Digital Officer" /></Field>
          <Field label="Business Unit"><input className={inputCls} value={inputs.business_unit} onChange={(e) => set('business_unit', e.target.value)} placeholder="Enterprise" /></Field>
          <Field label="Evaluation Date"><input type="date" className={inputCls} value={inputs.evaluation_date ?? ''} onChange={(e) => set('evaluation_date', e.target.value || null)} /></Field>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h4 className="text-sm font-semibold text-slate-800 mb-3">Industry & Technology</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Industry Sub-Sector" hint="WACC auto-suggests when changed">
            <select className={inputCls} value={inputs.industry} onChange={(e) => setIndustry(e.target.value as any)}>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="AI Technology Type">
            <select className={inputCls} value={inputs.ai_technology_type} onChange={(e) => set('ai_technology_type', e.target.value as any)}>
              {AI_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Project Size">
            <select className={inputCls} value={inputs.project_size} onChange={(e) => set('project_size', e.target.value as any)}>
              {PROJECT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h4 className="text-sm font-semibold text-slate-800 mb-1">Financial Parameters</h4>
        <p className="text-xs text-slate-500 mb-3">Effective discount rate = WACC + technology risk premium = <span className="font-semibold tabular-nums">{((inputs.wacc_base + inputs.technology_risk_premium) * 100).toFixed(2)}%</span></p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <PctField label="WACC (Base)" value={inputs.wacc_base} onChange={(v) => set('wacc_base', v)} />
          <PctField label="Tech Risk Premium" value={inputs.technology_risk_premium} onChange={(v) => set('technology_risk_premium', v)} />
          <PctField label="Hurdle Rate (Min IRR)" value={inputs.hurdle_rate} onChange={(v) => set('hurdle_rate', v)} />
          <PctField label="Corporate Tax Rate" value={inputs.tax_rate} onChange={(v) => set('tax_rate', v)} />
          <PctField label="Inflation Rate" value={inputs.inflation_rate} onChange={(v) => set('inflation_rate', v)} />
          <PctField label="Compliance Adder" value={inputs.compliance_adder_pct} onChange={(v) => set('compliance_adder_pct', v)} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h4 className="text-sm font-semibold text-slate-800 mb-1">Benefit Realization Ramp</h4>
        <p className="text-xs text-slate-500 mb-3">J-curve assumption — informational. Per-line benefit values on the Benefits tab.</p>
        <div className="grid grid-cols-3 gap-3">
          <PctField label="Year 1" value={inputs.ramp_y1} onChange={(v) => set('ramp_y1', v)} />
          <PctField label="Year 2" value={inputs.ramp_y2} onChange={(v) => set('ramp_y2', v)} />
          <PctField label="Year 3" value={inputs.ramp_y3} onChange={(v) => set('ramp_y3', v)} />
        </div>
      </div>
    </div>
  );
}

function PctField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={`${label} (%)`}>
      <input type="number" step="0.01" min="0" max="100" className={inputCls}
        value={(value * 100).toFixed(2)}
        onChange={(e) => onChange(Math.max(0, Math.min(100, parseFloat(e.target.value || '0'))) / 100)} />
    </Field>
  );
}

function CostsTab({ costs, setCosts }: { costs: CostModel; setCosts: (c: CostModel) => void }) {
  const sections: Array<{ key: keyof CostModel; label: string; hint: string }> = [
    { key: 'initial',   label: 'Initial Investment (one-time)', hint: 'Year 0 only' },
    { key: 'operating', label: 'Annual Operating Costs',         hint: 'Recurring Years 1–3' },
    { key: 'staffing',  label: 'Staffing Costs',                 hint: 'FTE × avg cost per year' },
  ];
  const updateRow = (section: keyof CostModel, idx: number, field: keyof CostLineItem, value: any) => {
    const next = { ...costs, [section]: [...costs[section]] };
    next[section][idx] = { ...next[section][idx], [field]: value };
    setCosts(next);
  };
  const addRow = (section: keyof CostModel) => {
    const next = { ...costs, [section]: [...costs[section], { label: 'New line item', year_0: 0, year_1: 0, year_2: 0, year_3: 0 }] };
    setCosts(next);
  };
  const removeRow = (section: keyof CostModel, idx: number) => {
    const next = { ...costs, [section]: costs[section].filter((_, i) => i !== idx) };
    setCosts(next);
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500 italic">All values in $000s. Compliance adder applies on top of the cost subtotal.</p>
      {sections.map((s) => (
        <div key={s.key} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/40">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">{s.label}</h4>
              <p className="text-xs text-slate-500">{s.hint}</p>
            </div>
            <button type="button" onClick={() => addRow(s.key)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">+ Add row</button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50/40 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-2 text-left">Line item</th>
                <th className="px-3 py-2 text-right w-20">Y0</th>
                <th className="px-3 py-2 text-right w-20">Y1</th>
                <th className="px-3 py-2 text-right w-20">Y2</th>
                <th className="px-3 py-2 text-right w-20">Y3</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {costs[s.key].map((row, idx) => (
                <tr key={idx}>
                  <td className="px-5 py-2">
                    <input className="w-full px-2 py-1 text-sm rounded-md border border-transparent hover:border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                      value={row.label} onChange={(e) => updateRow(s.key, idx, 'label', e.target.value)} />
                  </td>
                  {(['year_0', 'year_1', 'year_2', 'year_3'] as const).map((y) => (
                    <td key={y} className="px-1 py-2 text-right">
                      <input type="number" min="0" step="1" className="w-20 px-2 py-1 text-right text-sm tabular-nums rounded-md border border-transparent hover:border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                        value={row[y]} onChange={(e) => updateRow(s.key, idx, y, parseFloat(e.target.value || '0'))} />
                    </td>
                  ))}
                  <td className="pr-3">
                    <button type="button" onClick={() => removeRow(s.key, idx)} className="text-xs text-red-500 hover:text-red-700">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function BenefitsTab({ benefits, setBenefits }: { benefits: BenefitModel; setBenefits: (b: BenefitModel) => void }) {
  const sections: Array<{ key: keyof BenefitModel; label: string; hint: string }> = [
    { key: 'tangible',   label: 'Tangible Benefits',                hint: 'Quantifiable cost savings, revenue uplift, risk reduction' },
    { key: 'intangible', label: 'Intangible / Strategic Benefits',  hint: 'Monetized estimates of CX, brand, option value' },
  ];
  const updateRow = (section: keyof BenefitModel, idx: number, field: keyof BenefitLineItem, value: any) => {
    const next = { ...benefits, [section]: [...benefits[section]] };
    next[section][idx] = { ...next[section][idx], [field]: value };
    setBenefits(next);
  };
  const addRow = (section: keyof BenefitModel) => {
    setBenefits({ ...benefits, [section]: [...benefits[section], { label: 'New benefit', year_1: 0, year_2: 0, year_3: 0 }] });
  };
  const removeRow = (section: keyof BenefitModel, idx: number) => {
    setBenefits({ ...benefits, [section]: benefits[section].filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500 italic">All values in $000s. Year 0 has zero benefits by definition.</p>
      {sections.map((s) => (
        <div key={s.key} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/40">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">{s.label}</h4>
              <p className="text-xs text-slate-500">{s.hint}</p>
            </div>
            <button type="button" onClick={() => addRow(s.key)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">+ Add row</button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50/40 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-2 text-left">Benefit category</th>
                <th className="px-3 py-2 text-right w-20">Y1</th>
                <th className="px-3 py-2 text-right w-20">Y2</th>
                <th className="px-3 py-2 text-right w-20">Y3</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {benefits[s.key].map((row, idx) => (
                <tr key={idx}>
                  <td className="px-5 py-2">
                    <input className="w-full px-2 py-1 text-sm rounded-md border border-transparent hover:border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                      value={row.label} onChange={(e) => updateRow(s.key, idx, 'label', e.target.value)} />
                  </td>
                  {(['year_1', 'year_2', 'year_3'] as const).map((y) => (
                    <td key={y} className="px-1 py-2 text-right">
                      <input type="number" min="0" step="1" className="w-20 px-2 py-1 text-right text-sm tabular-nums rounded-md border border-transparent hover:border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                        value={row[y]} onChange={(e) => updateRow(s.key, idx, y, parseFloat(e.target.value || '0'))} />
                    </td>
                  ))}
                  <td className="pr-3">
                    <button type="button" onClick={() => removeRow(s.key, idx)} className="text-xs text-red-500 hover:text-red-700">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function RiskTab({ scores, setScores, computed }: { scores: RiskScorecard; setScores: (r: RiskScorecard) => void; computed: { composite: number; level: string; by_category: Record<string, number> } }) {
  const set = (k: keyof RiskScorecard, v: number) => setScores({ ...scores, [k]: v });
  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-5 ${riskColor(computed.level)}`}>
        <div className="flex items-baseline gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Composite Risk</div>
            <div className="text-3xl font-bold tabular-nums">{computed.composite.toFixed(2)}</div>
          </div>
          <div className="ml-auto text-sm font-semibold">{computed.level}</div>
        </div>
        <p className="text-xs mt-2 opacity-80">1 = Low, 5 = High. Composite uses the 8-category weighted rubric from the AWS Business Case Evaluation Model.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        {RISK_CATEGORIES.map((cat) => {
          const v = (scores as any)[cat.key] as number;
          return (
            <div key={cat.key} className="grid grid-cols-12 gap-3 items-center">
              <div className="col-span-12 md:col-span-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-slate-800">{cat.label}</span>
                  <span className="text-[10px] font-bold text-slate-400 tracking-wider">{Math.round(cat.weight * 100)}%</span>
                </div>
                <p className="text-[11px] text-slate-500">Contribution: <span className="font-bold tabular-nums">{(computed.by_category[cat.key] ?? 0).toFixed(2)}</span></p>
              </div>
              <div className="col-span-9 md:col-span-6 flex items-center gap-2">
                <input type="range" min={1} max={5} step={1} value={v} onChange={(e) => set(cat.key as keyof RiskScorecard, parseInt(e.target.value, 10))} className="w-full accent-red-600" />
              </div>
              <div className="col-span-3 md:col-span-2 flex items-center justify-end gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => set(cat.key as keyof RiskScorecard, n)}
                    className={`w-6 h-6 rounded-md text-[11px] font-bold transition-all ${
                      v === n ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}>
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
}
