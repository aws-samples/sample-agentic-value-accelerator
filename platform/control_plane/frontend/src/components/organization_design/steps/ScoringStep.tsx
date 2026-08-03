import type { ODMaturityScores, ODOrgProfile, ComputedOrganizationDesign } from '../types';
import { DIMENSIONS, DIM_ACCENTS, INDUSTRY_GATES, INDUSTRY_WEIGHTS } from '../types';
import { archetypeColor, gateColor } from '../scoring';

interface Props {
  scores: ODMaturityScores;
  setScores: (v: ODMaturityScores) => void;
  weights: Record<string, number>;
  setWeights: (v: Record<string, number> | null) => void;
  profile: ODOrgProfile;
  computed: ComputedOrganizationDesign;
}

export default function ScoringStep({ scores, setScores, weights, setWeights, profile, computed }: Props) {
  const industryDefault = INDUSTRY_WEIGHTS[profile.industry] ?? INDUSTRY_WEIGHTS['Other'];
  const isCustomized = JSON.stringify(weights) !== JSON.stringify(industryDefault);
  const weightSum = Object.values(weights).reduce((s, v) => s + v, 0);
  const gates = INDUSTRY_GATES[profile.industry] ?? INDUSTRY_GATES['Other'];

  const updScore = (k: keyof ODMaturityScores, v: number) => setScores({ ...scores, [k]: v });
  const updWeight = (k: string, v: number) => setWeights({ ...weights, [k]: v });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-800">Rate your organization — 8 dimensions</h3>
            <span className="text-[11px] text-slate-500">
              Weights auto-loaded from <b>{profile.industry}</b> profile.
              {isCustomized && <button onClick={() => setWeights(null)} className="ml-2 text-indigo-600 hover:underline">Reset</button>}
            </span>
          </div>
          <div className="space-y-2">
            {DIMENSIONS.map((d) => {
              const accent = DIM_ACCENTS[d.key];
              const s = (scores as any)[d.key] as number;
              const w = weights[d.key] ?? 0;
              return (
                <div key={d.key} className="p-3 rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <div className={`text-sm font-semibold ${accent.text}`}>{d.label}</div>
                      <div className="text-[11px] text-slate-500">1: {d.anchor_1} · 3: {d.anchor_3} · 5: {d.anchor_5}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${accent.pill}`}>weight {Math.round(w * 100)}%</span>
                      <input type="number" value={Math.round(w * 100)} min={0} max={100} step={5}
                        onChange={(e) => updWeight(d.key, Number(e.target.value) / 100)}
                        className="w-16 px-2 py-0.5 text-xs rounded border border-slate-200 tabular-nums" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="range" min={1} max={5} step={1} value={s}
                      onChange={(e) => updScore(d.key as keyof ODMaturityScores, Number(e.target.value))}
                      className={`flex-1 h-2 rounded-lg appearance-none ${accent.pill}`} />
                    <span className="w-8 text-sm font-bold tabular-nums text-slate-800 text-right">{s}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Weight sum: <b className={Math.abs(weightSum - 1) > 0.001 ? 'text-red-600' : 'text-emerald-700'}>{Math.round(weightSum * 100)}%</b> {Math.abs(weightSum - 1) > 0.001 && '(should total 100%)'}</span>
          </div>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 self-start">
        <div className="p-4 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-violet-50/60">
          <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-700 mb-1">Composite</div>
          <div className="text-3xl font-bold text-slate-900 tabular-nums">{computed.composite.toFixed(2)}</div>
          <div className="text-xs text-slate-600">Simple avg {computed.simple_average.toFixed(2)}</div>
          <div className="mt-2">
            <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${archetypeColor(computed.archetype)}`}>{computed.archetype}</span>
            <span className="ml-2 text-[11px] text-slate-500">× {computed.complexity_class} = <b>{computed.expanded_archetype}</b></span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Industry Gates ({profile.industry})</div>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${gateColor(computed.all_gates_passed)}`}>
              {computed.all_gates_passed ? 'All passed' : 'Not met'}
            </span>
          </div>
          <div className="space-y-1.5">
            {computed.gates.map((g) => (
              <div key={g.key} className="flex items-center justify-between text-xs">
                <span className="text-slate-700">{g.label}</span>
                <span className={`text-[10px] font-semibold ${g.passed ? 'text-emerald-700' : 'text-red-700'}`}>{g.detail}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-400 mt-2 italic">Rationale: {gates.rationale || '—'}</div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Scenario alignment</div>
          <div className="text-xs text-slate-800">Your pathway: <b>{profile.scenario_pathway}</b></div>
          <div className={`text-[11px] mt-1 ${computed.scenario_alignment === 'ALIGNED' ? 'text-emerald-700' : 'text-amber-700'}`}>{computed.scenario_alignment}</div>
        </div>
      </aside>
    </div>
  );
}
