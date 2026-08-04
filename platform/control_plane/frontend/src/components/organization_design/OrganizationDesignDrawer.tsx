import { useEffect, useMemo, useState } from 'react';
import type {
  OrganizationDesign, OrganizationDesignCreate,
  ODOrgProfile, ODStrategyInputs, ODOperatingModelInputs,
  ODMaturityScores, ODAgentConfig,
} from './types';
import {
  DEFAULT_PROFILE, DEFAULT_STRATEGY, DEFAULT_OPERATING_MODEL,
  DEFAULT_SCORES, DEFAULT_AGENT_CONFIG, STATUSES,
} from './types';
import { compute, industryWeights } from './scoring';
import StrategyStep from './steps/StrategyStep';
import OperatingModelStep from './steps/OperatingModelStep';
import ScoringStep from './steps/ScoringStep';
import AgentConfigStep from './steps/AgentConfigStep';
import RoadmapReviewStep from './steps/RoadmapReviewStep';

type StepId = 'meta' | 'strategy' | 'operating' | 'scoring' | 'agents' | 'roadmap';

interface Props {
  open: boolean;
  initial?: OrganizationDesign | null;
  existingNames?: string[];
  onClose: () => void;
  onSubmit: (req: OrganizationDesignCreate, id?: string) => Promise<void>;
}

const STEPS: { id: StepId; label: string; sub: string }[] = [
  { id: 'meta',      label: 'Details',                sub: 'Company profile & context' },
  { id: 'strategy',  label: 'Strategy & Value Chain', sub: 'Business model, value chain, capabilities' },
  { id: 'operating', label: 'Operating Model',        sub: 'Complexity, coordination, decision rights' },
  { id: 'scoring',   label: 'Maturity Scoring',       sub: '8 dimensions with industry weights' },
  { id: 'agents',    label: 'Agent Configuration',    sub: 'Human:AI ratios per function' },
  { id: 'roadmap',   label: 'Roadmap & Review',       sub: '4 phases + save' },
];

export default function OrganizationDesignDrawer({ open, initial, existingNames = [], onClose, onSubmit }: Props) {
  const [step, setStep] = useState<StepId>('meta');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Meta
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [organization, setOrganization] = useState('');
  const [designer, setDesigner] = useState('');
  const [status, setStatus] = useState<OrganizationDesign['status']>('Draft');

  // Inputs
  const [profile, setProfile] = useState<ODOrgProfile>(DEFAULT_PROFILE);
  const [strategy, setStrategy] = useState<ODStrategyInputs>(DEFAULT_STRATEGY);
  const [operating, setOperating] = useState<ODOperatingModelInputs>(DEFAULT_OPERATING_MODEL);
  const [scores, setScores] = useState<ODMaturityScores>(DEFAULT_SCORES);
  const [weights, setWeights] = useState<Record<string, number> | null>(null);
  const [agents, setAgents] = useState<ODAgentConfig>(DEFAULT_AGENT_CONFIG);

  useEffect(() => {
    if (!open) return;
    setStep('meta');
    setError(null);
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setOrganization(initial?.organization ?? '');
    setDesigner(initial?.designer ?? '');
    setStatus(initial?.status ?? 'Draft');
    setProfile(initial?.profile ?? DEFAULT_PROFILE);
    setStrategy(initial?.strategy ?? DEFAULT_STRATEGY);
    setOperating(initial?.operating_model ?? DEFAULT_OPERATING_MODEL);
    setScores(initial?.scores ?? DEFAULT_SCORES);
    setWeights(initial?.weights ?? null);
    setAgents(initial?.agent_config ?? DEFAULT_AGENT_CONFIG);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Recompute weights when industry changes (unless user explicitly customized)
  useEffect(() => {
    if (weights === null) return; // will be filled at compute time from industry
  }, [profile.industry]);

  const activeWeights = weights ?? industryWeights(profile.industry);
  const computed = useMemo(
    () => compute(profile, strategy, operating, scores, activeWeights, agents),
    [profile, strategy, operating, scores, activeWeights, agents],
  );

  const validate = (): string | null => {
    if (!name.trim()) return 'Design name is required';
    const lc = name.trim().toLowerCase();
    if (existingNames.includes(lc)) return `Name "${name.trim()}" is already in use`;
    if (profile.company_size < 1) return 'Company size must be > 0';
    return null;
  };

  const handleSubmit = async () => {
    const v = validate();
    if (v) { setError(v); if (v.includes('Name') || v.includes('name')) setStep('meta'); return; }
    setSubmitting(true); setError(null);
    try {
      await onSubmit({
        name: name.trim(), description, organization, designer, status,
        profile, strategy, operating_model: operating, scores, weights, agent_config: agents,
      }, initial?.organization_design_id);
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

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 z-40" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-6xl bg-white z-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 mb-0.5">Plan · Organization Design</div>
            <h2 className="text-lg font-semibold text-slate-900">{initial ? 'Edit design' : 'New design'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{STEPS[stepIndex].sub}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step tabs */}
        <div className="px-6 pt-3 pb-2 border-b border-slate-100 bg-slate-50/40">
          <div className="flex items-center gap-1 overflow-x-auto">
            {STEPS.map((s, i) => (
              <button key={s.id} onClick={() => setStep(s.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  step === s.id
                    ? 'bg-white border border-indigo-300 text-indigo-700 shadow-sm'
                    : i < stepIndex
                      ? 'text-slate-500 hover:bg-white'
                      : 'text-slate-400 hover:bg-white'
                }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === s.id ? 'bg-indigo-600 text-white' : i < stepIndex ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                }`}>{i < stepIndex ? '✓' : i + 1}</span>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'meta' && (
            <MetaStep
              name={name} description={description} organization={organization}
              designer={designer} status={status} profile={profile}
              setName={setName} setDescription={setDescription}
              setOrganization={setOrganization} setDesigner={setDesigner}
              setStatus={setStatus} setProfile={setProfile}
            />
          )}
          {step === 'strategy' && <StrategyStep strategy={strategy} setStrategy={setStrategy} computed={computed} />}
          {step === 'operating' && <OperatingModelStep operating={operating} setOperating={setOperating} profile={profile} computed={computed} />}
          {step === 'scoring' && (
            <ScoringStep
              scores={scores} setScores={setScores}
              weights={activeWeights} setWeights={setWeights}
              profile={profile} computed={computed}
            />
          )}
          {step === 'agents' && <AgentConfigStep agents={agents} setAgents={setAgents} computed={computed} />}
          {step === 'roadmap' && <RoadmapReviewStep profile={profile} setProfile={setProfile} computed={computed} />}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 flex items-center justify-between bg-white">
          <div className="flex-1">
            {error && <div className="text-xs text-red-600 font-medium">{error}</div>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={goPrev} disabled={stepIndex === 0}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed">
              ← Back
            </button>
            {stepIndex < STEPS.length - 1 ? (
              <button onClick={goNext}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-600 rounded-lg hover:shadow-md transition-all">
                Next: {STEPS[stepIndex + 1].label} →
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-600 rounded-lg hover:shadow-md transition-all disabled:opacity-50">
                {submitting ? 'Saving…' : (initial ? 'Update design' : 'Create design')}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// Meta step (details + profile)
// -----------------------------------------------------------------------------

function MetaStep({
  name, description, organization, designer, status, profile,
  setName, setDescription, setOrganization, setDesigner, setStatus, setProfile,
}: {
  name: string; description: string; organization: string; designer: string;
  status: OrganizationDesign['status']; profile: ODOrgProfile;
  setName: (v: string) => void; setDescription: (v: string) => void;
  setOrganization: (v: string) => void; setDesigner: (v: string) => void;
  setStatus: (v: OrganizationDesign['status']) => void;
  setProfile: (v: ODOrgProfile) => void;
}) {
  const upd = <K extends keyof ODOrgProfile>(k: K, v: ODOrgProfile[K]) => setProfile({ ...profile, [k]: v });
  return (
    <div className="space-y-5 max-w-3xl">
      <Section title="Design name & metadata" sub="Give this design a memorable name — you can create multiple designs to compare.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Design name*">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2027 Retail Bank Reimagined"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none" />
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as any)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Description" full>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={2} placeholder="Optional: What is this design's purpose?"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none resize-none" />
          </Field>
          <Field label="Organization"><input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" /></Field>
          <Field label="Designer"><input type="text" value={designer} onChange={(e) => setDesigner(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" /></Field>
        </div>
      </Section>

      <Section title="Organization profile" sub="Where you are today. These drive industry-specific weights, gates, and complexity.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Company name"><input type="text" value={profile.company_name}
              onChange={(e) => upd('company_name', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" /></Field>
          <Field label="Company size (headcount)"><input type="number" value={profile.company_size} min={1}
              onChange={(e) => upd('company_size', Number(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" /></Field>
          <Field label="Industry">
            <select value={profile.industry} onChange={(e) => upd('industry', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200">
              {(['Financial Services','Healthcare','Manufacturing','Technology','Retail','Other'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Current structure type">
            <select value={profile.structure_type} onChange={(e) => upd('structure_type', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200">
              {(['Traditional Hierarchy','Functional','Matrix','Flat/Agile','Network'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Scenario pathway">
            <select value={profile.scenario_pathway} onChange={(e) => upd('scenario_pathway', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200">
              {(['Conservative','Moderate','Aggressive'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Geographic presence">
            <select value={profile.geographic_presence} onChange={(e) => upd('geographic_presence', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200">
              {(['Single','Multi-site','National','Multi-national','Global'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Current phase">
            <select value={profile.current_phase} onChange={(e) => upd('current_phase', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200">
              {(['Phase 1','Phase 2','Phase 3','Phase 4'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Target phase">
            <select value={profile.target_phase} onChange={(e) => upd('target_phase', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200">
              {(['Phase 1','Phase 2','Phase 3','Phase 4'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Annual revenue ($M)"><input type="number" value={profile.annual_revenue_m} min={0} step={10}
              onChange={(e) => upd('annual_revenue_m', Number(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" /></Field>
          <Field label="AI budget (% of revenue)"><input type="number" value={profile.ai_budget_pct} min={0} max={0.2} step={0.005}
              onChange={(e) => upd('ai_budget_pct', Number(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" /></Field>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-800 mb-0.5">{title}</h3>
      {sub && <p className="text-xs text-slate-500 mb-3">{sub}</p>}
      {children}
    </div>
  );
}

function Field({ label, full = false, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}
