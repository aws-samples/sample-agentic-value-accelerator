import type { ODStrategyInputs, ComputedOrganizationDesign } from '../types';
import {
  BUSINESS_MODELS, COMPETITIVE_POSITIONING, VALUE_DRIVERS,
  MARKET_DYNAMICS, REVENUE_MODELS, SOURCE_STRATEGIES,
} from '../types';

interface Props {
  strategy: ODStrategyInputs;
  setStrategy: (v: ODStrategyInputs) => void;
  computed: ComputedOrganizationDesign;
}

export default function StrategyStep({ strategy, setStrategy, computed }: Props) {
  const upd = <K extends keyof ODStrategyInputs>(k: K, v: ODStrategyInputs[K]) => setStrategy({ ...strategy, [k]: v });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Left: inputs */}
      <div className="lg:col-span-2 space-y-5">
        {/* Business model */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-2">1 · Business model & competitive positioning</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SelectField label="Business model" value={strategy.business_model} onChange={(v) => upd('business_model', v)} options={[...BUSINESS_MODELS]} />
            <SelectField label="Competitive positioning" value={strategy.competitive_positioning} onChange={(v) => upd('competitive_positioning', v)} options={[...COMPETITIVE_POSITIONING]} />
            <SelectField label="Primary value driver" value={strategy.primary_value_driver} onChange={(v) => upd('primary_value_driver', v)} options={[...VALUE_DRIVERS]} />
            <SelectField label="Market dynamics" value={strategy.market_dynamics} onChange={(v) => upd('market_dynamics', v)} options={[...MARKET_DYNAMICS]} />
            <SelectField label="Revenue model" value={strategy.revenue_model} onChange={(v) => upd('revenue_model', v)} options={[...REVENUE_MODELS]} />
          </div>
        </div>

        {/* Value chain */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-2">2 · Value chain activities (Porter)</h3>
          <p className="text-xs text-slate-500 mb-2">Score each activity 1–5. Higher automation potential + higher strategic importance signals investment priority.</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <tr>
                  <th className="text-left px-3 py-2">Activity</th>
                  <th className="text-center px-2 py-2">Strategic Importance</th>
                  <th className="text-center px-2 py-2">AI Automation Potential</th>
                  <th className="text-center px-2 py-2">Capability Gap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {strategy.value_chain.map((v, i) => (
                  <tr key={v.key} className={v.kind === 'primary' ? 'bg-white' : 'bg-slate-50/40'}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{v.label}</div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{v.kind}</div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <ScoreInput value={v.strategic_importance} onChange={(n) => {
                        const chain = [...strategy.value_chain]; chain[i] = { ...chain[i], strategic_importance: n }; upd('value_chain', chain);
                      }} />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <ScoreInput value={v.ai_automation_potential} onChange={(n) => {
                        const chain = [...strategy.value_chain]; chain[i] = { ...chain[i], ai_automation_potential: n }; upd('value_chain', chain);
                      }} />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <select value={v.current_capability_gap} onChange={(e) => {
                        const chain = [...strategy.value_chain]; chain[i] = { ...chain[i], current_capability_gap: e.target.value }; upd('value_chain', chain);
                      }} className="px-2 py-0.5 text-xs rounded border border-slate-200">
                        {['Low','Medium','High'].map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Capabilities */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-2">3 · Critical capabilities required</h3>
          <p className="text-xs text-slate-500 mb-2">Rank capabilities and pick a sourcing strategy per capability (Build/Buy/Borrow/Bot).</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <tr>
                  <th className="text-left px-3 py-2">Capability</th>
                  <th className="text-center px-2 py-2">Priority</th>
                  <th className="text-center px-2 py-2">Current Maturity</th>
                  <th className="text-center px-2 py-2">Gap</th>
                  <th className="text-center px-2 py-2">Source Strategy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {strategy.capabilities.map((c, i) => (
                  <tr key={c.key}>
                    <td className="px-3 py-2 font-medium text-slate-800">{c.label}</td>
                    <td className="px-2 py-2 text-center">
                      <ScoreInput value={c.priority} onChange={(n) => {
                        const caps = [...strategy.capabilities]; caps[i] = { ...caps[i], priority: n }; upd('capabilities', caps);
                      }} />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <ScoreInput value={c.current_maturity} onChange={(n) => {
                        const caps = [...strategy.capabilities]; caps[i] = { ...caps[i], current_maturity: n }; upd('capabilities', caps);
                      }} />
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums text-slate-600">{Math.max(0, c.priority - c.current_maturity)}</td>
                    <td className="px-2 py-2 text-center">
                      <select value={c.source_strategy} onChange={(e) => {
                        const caps = [...strategy.capabilities]; caps[i] = { ...caps[i], source_strategy: e.target.value }; upd('capabilities', caps);
                      }} className="px-2 py-0.5 text-xs rounded border border-slate-200">
                        {[...SOURCE_STRATEGIES].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right: strategic AI readiness preview */}
      <aside className="space-y-4 lg:sticky lg:top-4 self-start">
        <div className="p-4 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-violet-50/60">
          <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-700 mb-1">Live preview</div>
          <div className="text-3xl font-bold text-slate-900 tabular-nums">{computed.strategic_ai_readiness.toFixed(2)}</div>
          <div className="text-xs text-slate-600">Strategic AI Readiness Index</div>
          <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
            Blends avg primary-value-chain strategic importance and average capability gap.
            Higher = strategy already primed for AI investment.
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Source-strategy mix</div>
          <div className="space-y-1.5">
            {SOURCE_STRATEGIES.map((s) => {
              const count = strategy.capabilities.filter((c) => c.source_strategy === s).length;
              const pct = strategy.capabilities.length ? Math.round(count / strategy.capabilities.length * 100) : 0;
              return (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-14 text-slate-600">{s}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right tabular-nums text-slate-700">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
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

function ScoreInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={`w-6 h-6 rounded text-[10px] font-bold ${
            n === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}>{n}</button>
      ))}
    </div>
  );
}
