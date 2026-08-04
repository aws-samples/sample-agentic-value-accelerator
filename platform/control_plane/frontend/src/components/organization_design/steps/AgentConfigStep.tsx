import type { ODAgentConfig, ComputedOrganizationDesign } from '../types';
import { MATURITY_RATIO_TIERS, TEAM_COMPOSITION_MODELS } from '../types';

interface Props {
  agents: ODAgentConfig;
  setAgents: (v: ODAgentConfig) => void;
  computed: ComputedOrganizationDesign;
}

export default function AgentConfigStep({ agents, setAgents, computed }: Props) {
  const upd = <K extends keyof ODAgentConfig>(k: K, v: ODAgentConfig[K]) => setAgents({ ...agents, [k]: v });

  // Snap the two ratio sliders so they always sum to 1
  const setSubordinatePct = (v: number) => setAgents({ ...agents, pct_subordinate: v, pct_peer: 1 - v });

  const applyTierRecommendation = (tierIdx: number) => {
    const t = MATURITY_RATIO_TIERS[tierIdx];
    setAgents({ ...agents, pct_subordinate: t.pctSubordinate, pct_peer: t.pctPeer, target_ratio_label: t.ratio });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        {/* Global parameters */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-2">1 · Global parameters</h3>
          <p className="text-xs text-slate-500 mb-3">The org-wide dials for automation intensity, span, and where agents sit in the team.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumField label="Automated processes (total)" value={agents.total_automated_processes} onChange={(n) => upd('total_automated_processes', n)} step={10} />
            <TextField label="Target ratio (H:AI)" value={agents.target_ratio_label} onChange={(v) => upd('target_ratio_label', v)} />
            <NumField label="Supervisor span (max)" value={agents.span_of_control} onChange={(n) => upd('span_of_control', Math.max(1, n))} min={1} max={50} />
            <NumField label="Automated Δ across fns" value={agents.functions.reduce((s, f) => s + f.automated_processes, 0)} onChange={() => {}} readOnly />
          </div>

          {/* Sub vs Peer sliders */}
          <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-slate-800">Where do agents sit?</div>
              <div className="text-[11px] text-slate-500">Subordinate = team member under a human supervisor · Peer = autonomous collaborator</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-blue-700">Subordinate (team member)</span>
                  <span className="tabular-nums font-bold">{Math.round(agents.pct_subordinate * 100)}%</span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={agents.pct_subordinate}
                  onChange={(e) => setSubordinatePct(Number(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none accent-blue-500" />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-emerald-700">Peer (autonomous)</span>
                  <span className="tabular-nums font-bold">{Math.round(agents.pct_peer * 100)}%</span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={agents.pct_peer}
                  onChange={(e) => setSubordinatePct(1 - Number(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none accent-emerald-500" />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              {MATURITY_RATIO_TIERS.map((t, i) => (
                <button key={t.tier} onClick={() => applyTierRecommendation(i)}
                  className="text-left p-2 rounded-lg border border-slate-200 hover:border-indigo-300 bg-slate-50/40">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">{t.tier}</div>
                  <div className="text-[11px] text-slate-800">{t.ratio}</div>
                  <div className="text-[10px] text-slate-500">{Math.round(t.pctSubordinate * 100)}% sub / {Math.round(t.pctPeer * 100)}% peer</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Per-function config */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-2">2 · Function-by-function configuration</h3>
          <p className="text-xs text-slate-500 mb-3">Shared Services default toward subordinate-heavy; Specialized functions default toward peer-heavy. Live agent split shown per row.</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <tr>
                  <th className="text-left px-3 py-2">Function</th>
                  <th className="text-left px-2 py-2">Type</th>
                  <th className="text-center px-2 py-2">Humans</th>
                  <th className="text-center px-2 py-2">Auto processes</th>
                  <th className="text-center px-2 py-2">Total agents</th>
                  <th className="text-center px-2 py-2 text-blue-700">Sub</th>
                  <th className="text-center px-2 py-2 text-emerald-700">Peer</th>
                  <th className="text-center px-2 py-2">Supervisors</th>
                  <th className="text-center px-2 py-2">Ratio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.functions.map((fn, i) => {
                  const row = computed.functions[i];
                  return (
                    <tr key={fn.key}>
                      <td className="px-3 py-2 font-medium text-slate-800">{fn.label}</td>
                      <td className="px-2 py-2 text-[11px] text-slate-500">{fn.type}</td>
                      <td className="px-2 py-2 text-center">
                        <input type="number" value={fn.headcount} min={0}
                          onChange={(e) => {
                            const list = [...agents.functions];
                            list[i] = { ...list[i], headcount: Number(e.target.value) || 0 };
                            upd('functions', list);
                          }}
                          className="w-20 px-2 py-0.5 text-xs rounded border border-slate-200 tabular-nums" />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="number" value={fn.automated_processes} min={0}
                          onChange={(e) => {
                            const list = [...agents.functions];
                            list[i] = { ...list[i], automated_processes: Number(e.target.value) || 0 };
                            upd('functions', list);
                          }}
                          className="w-20 px-2 py-0.5 text-xs rounded border border-slate-200 tabular-nums" />
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums font-bold text-slate-800">{row?.total_agents ?? 0}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-blue-700">{row?.agents_subordinate ?? 0}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-emerald-700">{row?.agents_peer ?? 0}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-slate-600">{row?.supervisors ?? 0}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-slate-600">{row?.ratio_label ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 text-[11px] font-bold">
                <tr>
                  <td className="px-3 py-2 uppercase tracking-wider text-slate-500" colSpan={2}>Total</td>
                  <td className="px-2 py-2 text-center tabular-nums">{agents.functions.reduce((s, f) => s + f.headcount, 0)}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{agents.functions.reduce((s, f) => s + f.automated_processes, 0)}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-slate-800">{computed.total_ai_agents}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-blue-700">{computed.total_agents_subordinate}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-emerald-700">{computed.total_agents_peer}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-slate-600">{computed.total_human_supervisors}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-slate-600">{computed.effective_ratio}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Team composition guidance */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-2">3 · Team composition patterns</h3>
          <p className="text-xs text-slate-500 mb-3">How agents show up in each team type. Reference — not editable.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {TEAM_COMPOSITION_MODELS.map((m) => (
              <div key={m.type} className="p-3 rounded-xl border border-slate-200 bg-white text-xs">
                <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-700 mb-1">{m.structure}</div>
                <div className="text-sm font-semibold text-slate-900 mb-1.5">{m.type}</div>
                <div className="mb-1"><b className="text-slate-700">Human:</b> <span className="text-slate-500">{m.humanRole}</span></div>
                <div className="mb-1"><b className="text-blue-700">Subordinate agent:</b> <span className="text-slate-500">{m.subordinateRole}</span></div>
                <div className="mb-1"><b className="text-emerald-700">Peer agent:</b> <span className="text-slate-500">{m.peerRole}</span></div>
                <div className="mt-2 text-[11px] italic text-slate-400 border-t border-slate-100 pt-1.5">Example: {m.example}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 self-start">
        <div className="p-4 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-violet-50/60">
          <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-700 mb-1">Workforce composition</div>
          <div className="text-3xl font-bold text-slate-900 tabular-nums">{Math.round(computed.pct_workforce_ai * 100)}%</div>
          <div className="text-xs text-slate-600">of positions filled by AI agents</div>
          <div className="mt-3 text-xs text-slate-800"><b>{computed.effective_ratio}</b> effective human:AI ratio</div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Agent role split</div>
          <div className="space-y-1.5 text-xs">
            <Row label="Subordinate" value={computed.total_agents_subordinate} color="bg-blue-500" total={computed.total_ai_agents || 1} />
            <Row label="Peer"        value={computed.total_agents_peer}        color="bg-emerald-500" total={computed.total_ai_agents || 1} />
          </div>
          <hr className="my-2 border-slate-200/60" />
          <div className="text-xs text-slate-800"><b>{computed.total_human_supervisors}</b> supervisors managing {computed.total_teams} teams</div>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value, color, total }: { label: string; value: number; color: string; total: number }) {
  const pct = total ? Math.round(value / total * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5"><span className="text-slate-600">{label}</span><span className="tabular-nums font-bold text-slate-800">{value} · {pct}%</span></div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${color}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function NumField({ label, value, onChange, step = 1, min = 0, max, readOnly = false }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; readOnly?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input type="number" value={value} step={step} min={min} max={max} readOnly={readOnly}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className={`w-full px-3 py-2 text-sm rounded-lg border border-slate-200 tabular-nums ${readOnly ? 'bg-slate-50 text-slate-500' : ''}`} />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" />
    </label>
  );
}
