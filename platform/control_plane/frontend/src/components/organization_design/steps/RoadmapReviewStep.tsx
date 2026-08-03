import type { ODOrgProfile, ComputedOrganizationDesign } from '../types';
import { PHASE_ATTRIBUTES, PHASES } from '../types';
import { archetypeColor, gateColor, phaseColor, fmtMoney, scenarioColor } from '../scoring';

interface Props {
  profile: ODOrgProfile;
  setProfile: (v: ODOrgProfile) => void;
  computed: ComputedOrganizationDesign;
}

export default function RoadmapReviewStep({ profile, setProfile, computed }: Props) {
  const upd = <K extends keyof ODOrgProfile>(k: K, v: ODOrgProfile[K]) => setProfile({ ...profile, [k]: v });

  return (
    <div className="space-y-5">
      {/* Phase & scenario controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SelectField label="Current phase" value={profile.current_phase} onChange={(v) => upd('current_phase', v)} options={[...PHASES]} />
        <SelectField label="Target phase" value={profile.target_phase} onChange={(v) => upd('target_phase', v)} options={[...PHASES]} />
        <SelectField label="Scenario pathway" value={profile.scenario_pathway} onChange={(v) => upd('scenario_pathway', v)} options={['Conservative','Moderate','Aggressive']} />
      </div>

      {/* Top-line KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Composite" value={computed.composite.toFixed(2)} accent="from-indigo-500 to-blue-600" />
        <Kpi label="Archetype" value={computed.expanded_archetype} pillCls={archetypeColor(computed.archetype)} />
        <Kpi label="Layers" value={`${computed.current_layers} → ${computed.target_layers}`} accent="from-blue-500 to-violet-500" />
        <Kpi label="Total AI agents" value={String(computed.total_ai_agents)} accent="from-violet-500 to-fuchsia-500" />
        <Kpi label="H:AI ratio" value={computed.effective_ratio} accent="from-fuchsia-500 to-rose-500" />
        <Kpi label="Gates" value={computed.all_gates_passed ? 'All passed' : 'Not met'} pillCls={gateColor(computed.all_gates_passed)} />
      </div>

      {/* Recommendation card */}
      <div className="p-4 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-violet-50/40">
        <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-700 mb-1">Recommended target-state</div>
        <div className="text-lg font-semibold text-slate-900">{computed.recommended_structure}</div>
        <div className="text-xs text-slate-600 mt-1">
          Governance: <b>{computed.governance_level}</b> · Ratio: <b>{computed.ratio_target}</b> · Expected gain: <b>{computed.expected_productivity_gain}</b>
        </div>
      </div>

      {/* Phase attributes table */}
      <div>
        <h3 className="text-sm font-bold text-slate-800 mb-2">4-phase roadmap</h3>
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              <tr>
                <th className="text-left px-3 py-2 w-40">Attribute</th>
                {PHASES.map((p) => (
                  <th key={p} className={`text-left px-3 py-2 border-l border-slate-200 ${profile.target_phase === p ? 'bg-indigo-50/60 text-indigo-700' : ''}`}>{p}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(['timeline','agentRole','governance','ratio','gain','span','layers','keyRoles','investment','risk','change','success','gates'] as const).map((k) => (
                <tr key={k}>
                  <td className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{labelFor(k)}</td>
                  {PHASES.map((p) => (
                    <td key={p} className={`px-3 py-1.5 border-l border-slate-100 text-slate-700 ${profile.target_phase === p ? 'bg-indigo-50/30' : ''}`}>
                      {(PHASE_ATTRIBUTES[p] as any)[k]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transition economics + investment split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Transition economics</div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Item label="Severance"      value={fmtMoney(computed.transition.severance_cost)} />
            <Item label="Reskilling"     value={fmtMoney(computed.transition.reskilling_investment)} />
            <Item label="Hiring"          value={fmtMoney(computed.transition.hiring_cost)} />
            <Item label="Productivity dip"value={fmtMoney(computed.transition.productivity_dip_cost)} />
            <Item label="Total"            value={fmtMoney(computed.transition.total_transition_cost)} strong />
            <Item label="Annual savings"   value={fmtMoney(computed.transition.expected_annual_savings)} />
            <Item label="Payback"          value={computed.transition.payback_years === null ? '—' : `${computed.transition.payback_years} yrs`} />
            <Item label="3-yr ROI"         value={`${Math.round((computed.transition.three_year_roi || 0) * 100)}%`} />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">AI budget allocation (BCG 10/20/70)</div>
          <div className="text-3xl font-bold text-slate-900 tabular-nums">${computed.investment.total_budget_m.toFixed(1)}M</div>
          <div className="text-xs text-slate-500 mb-2">total AI investment ({(profile.ai_budget_pct * 100).toFixed(1)}% of revenue)</div>
          <BudgetBar label="Technology"        value={computed.investment.technology_m}      total={computed.investment.total_budget_m} color="bg-blue-500" />
          <BudgetBar label="Data & Infra"      value={computed.investment.data_infra_m}      total={computed.investment.total_budget_m} color="bg-violet-500" />
          <BudgetBar label="People & Process"  value={computed.investment.people_process_m}  total={computed.investment.total_budget_m} color="bg-fuchsia-500" />
        </div>
      </div>

      {/* Scenario compare mini table */}
      <div>
        <h3 className="text-sm font-bold text-slate-800 mb-2">Scenario comparison</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {computed.scenarios.map((s) => (
            <div key={s.scenario} className={`p-3 rounded-xl border ${profile.scenario_pathway === s.scenario ? 'border-indigo-400 bg-indigo-50/40' : 'border-slate-200 bg-white'}`}>
              <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${scenarioColor(s.scenario)}`}>{s.scenario}</span>
              <div className="mt-2 space-y-1 text-xs text-slate-700">
                <div><b>Timeline:</b> {s.timeline}</div>
                <div><b>Productivity:</b> {s.productivity}</div>
                <div><b>Headcount Δ:</b> {s.headcount_reduction}</div>
                <div><b>Success prob:</b> {s.success_probability}</div>
                <div><b>Layers −:</b> {s.layers_eliminated}</div>
                <div><b>Severance est:</b> {fmtMoney(s.severance_cost)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function labelFor(k: string): string {
  const m: Record<string, string> = {
    timeline: 'Timeline', agentRole: 'Agent role', governance: 'Governance', ratio: 'Human:AI',
    gain: 'Prod gain', span: 'Span', layers: 'Layers', keyRoles: 'Key roles',
    investment: 'Investment focus', risk: 'Risk', change: 'Change mgmt',
    success: 'Success metric', gates: 'Gate criteria',
  };
  return m[k] ?? k;
}

function Kpi({ label, value, accent, pillCls }: { label: string; value: string; accent?: string; pillCls?: string }) {
  return (
    <div className="p-3 rounded-xl border border-slate-200 bg-white">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
      {pillCls ? (
        <div className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full border ${pillCls}`}>{value}</div>
      ) : (
        <div className={`text-lg font-bold bg-gradient-to-r ${accent} bg-clip-text text-transparent mt-0.5 tabular-nums`}>{value}</div>
      )}
    </div>
  );
}

function Item({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</div>
      <div className={`tabular-nums ${strong ? 'text-base font-bold text-slate-900' : 'text-sm font-semibold text-slate-800'}`}>{value}</div>
    </div>
  );
}

function BudgetBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between text-[11px] mb-0.5">
        <span className="text-slate-600">{label}</span>
        <span className="tabular-nums font-semibold text-slate-800">${value.toFixed(2)}M · {pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${color}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
