import type { ComputedOrganizationDesign } from '../types';
import { SCENARIO_ATTRIBUTES } from '../types';
import { scenarioColor, fmtMoney } from '../scoring';

// Conservative / Moderate / Aggressive side-by-side (from Output_ScenarioCompare).
export default function ScenarioCompareTable({ computed, selected }: { computed: ComputedOrganizationDesign; selected: string }) {
  const rows: { k: keyof typeof SCENARIO_ATTRIBUTES[number]; label: string }[] = [
    { k: 'timeline',      label: 'Timeline (total)' },
    { k: 'p1',            label: 'Phase 1 duration' },
    { k: 'p2',            label: 'Phase 2 duration' },
    { k: 'p3',            label: 'Phase 3 duration' },
    { k: 'p4',            label: 'Phase 4 duration' },
    { k: 'productivity',  label: 'Expected productivity gain' },
    { k: 'investment',    label: 'Investment (% revenue)' },
    { k: 'headcount',     label: 'Headcount reduction' },
    { k: 'risk',          label: 'Risk level' },
    { k: 'disruption',    label: 'Disruption to ops' },
    { k: 'advantage',     label: 'Competitive advantage' },
    { k: 'success',       label: 'Success probability' },
    { k: 'payback',       label: 'Payback period' },
    { k: 'cultural',      label: 'Cultural impact' },
    { k: 'attrition',     label: 'Talent retention risk' },
    { k: 'ratio',         label: 'AI agent ratio (target)' },
    { k: 'layers',        label: 'Layers eliminated' },
    { k: 'governance',    label: 'Governance approach' },
  ];

  return (
    <div className="p-5 rounded-2xl border border-slate-200 bg-white">
      <div className="mb-3">
        <h3 className="text-base font-bold text-slate-900">Scenario comparison</h3>
        <p className="text-xs text-slate-500">Selected: <b>{selected}</b>. Cost figures scale from moderate baseline.</p>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            <tr>
              <th className="text-left px-3 py-2 w-52">Dimension</th>
              {SCENARIO_ATTRIBUTES.map((s) => (
                <th key={s.scenario} className={`px-3 py-2 text-left border-l border-slate-200 ${s.scenario === selected ? 'bg-indigo-50/60' : ''}`}>
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${scenarioColor(s.scenario)}`}>{s.scenario}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.k}>
                <td className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{r.label}</td>
                {SCENARIO_ATTRIBUTES.map((s) => (
                  <td key={s.scenario} className={`px-3 py-1.5 border-l border-slate-100 text-slate-700 ${s.scenario === selected ? 'bg-indigo-50/30' : ''}`}>
                    {(s as any)[r.k]}
                  </td>
                ))}
              </tr>
            ))}
            {/* Cost rows from computed scenarios */}
            <tr className="border-t border-slate-200 bg-slate-50/40">
              <td className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Severance (est.)</td>
              {computed.scenarios.map((s) => (
                <td key={s.scenario} className={`px-3 py-1.5 border-l border-slate-100 tabular-nums font-semibold text-slate-800 ${s.scenario === selected ? 'bg-indigo-50/40' : ''}`}>{fmtMoney(s.severance_cost)}</td>
              ))}
            </tr>
            <tr className="bg-slate-50/40">
              <td className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Reskilling investment</td>
              {computed.scenarios.map((s) => (
                <td key={s.scenario} className={`px-3 py-1.5 border-l border-slate-100 tabular-nums font-semibold text-slate-800 ${s.scenario === selected ? 'bg-indigo-50/40' : ''}`}>{fmtMoney(s.reskilling)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${computed.scenario_alignment === 'ALIGNED' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
        {computed.scenario_alignment === 'ALIGNED'
          ? '✓ Your scenario matches your composite score — the pathway is realistic for where you are.'
          : `⚠ ${computed.scenario_alignment}. Consider revisiting the scenario or investing to close the score gap first.`}
      </div>
    </div>
  );
}
