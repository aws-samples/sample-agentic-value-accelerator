import type { ComputedOrganizationDesign } from '../types';

// 10 functions × human / subordinate / peer / supervisor / team, split by function type.
export default function AgentOrgTable({ computed }: { computed: ComputedOrganizationDesign }) {
  const shared = computed.functions.filter((f) => f.type === 'Shared Services');
  const specialized = computed.functions.filter((f) => f.type === 'Specialized');
  const sumFns = (fns: typeof computed.functions) => ({
    humans: fns.reduce((s, f) => s + f.human_staff, 0),
    subs: fns.reduce((s, f) => s + f.agents_subordinate, 0),
    peers: fns.reduce((s, f) => s + f.agents_peer, 0),
    sup: fns.reduce((s, f) => s + f.supervisors, 0),
    teams: fns.reduce((s, f) => s + f.teams, 0),
    agents: fns.reduce((s, f) => s + f.total_agents, 0),
  });
  const sharedSum = sumFns(shared);
  const specSum = sumFns(specialized);

  return (
    <div className="p-5 rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Agent org structure by function</h3>
          <p className="text-xs text-slate-500">Subordinate (supervised team member) vs Peer (autonomous partner) split, per function.</p>
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            <tr>
              <th className="text-left px-3 py-2">Function</th>
              <th className="text-center px-2 py-2">Humans</th>
              <th className="text-center px-2 py-2 text-blue-700">Subordinates</th>
              <th className="text-center px-2 py-2 text-emerald-700">Peers</th>
              <th className="text-center px-2 py-2">Supervisors</th>
              <th className="text-center px-2 py-2">Teams</th>
              <th className="text-center px-2 py-2">Ratio</th>
              <th className="text-left px-3 py-2">Dominant role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <SectionHeader label="Shared Services" />
            {shared.map((f) => <FnRow key={f.key} f={f} />)}
            <TotalRow label="Shared services subtotal" sum={sharedSum} accent="text-blue-700" />
            <SectionHeader label="Specialized" />
            {specialized.map((f) => <FnRow key={f.key} f={f} />)}
            <TotalRow label="Specialized subtotal" sum={specSum} accent="text-emerald-700" />
          </tbody>
          <tfoot className="bg-slate-50 border-t border-slate-200 text-[11px] font-bold">
            <tr>
              <td className="px-3 py-2 uppercase tracking-wider text-slate-500">TOTAL</td>
              <td className="px-2 py-2 text-center tabular-nums">{sharedSum.humans + specSum.humans}</td>
              <td className="px-2 py-2 text-center tabular-nums text-blue-700">{computed.total_agents_subordinate}</td>
              <td className="px-2 py-2 text-center tabular-nums text-emerald-700">{computed.total_agents_peer}</td>
              <td className="px-2 py-2 text-center tabular-nums">{computed.total_human_supervisors}</td>
              <td className="px-2 py-2 text-center tabular-nums">{computed.total_teams}</td>
              <td className="px-2 py-2 text-center tabular-nums">{computed.effective_ratio}</td>
              <td className="px-3 py-2 text-slate-500">{Math.round(computed.pct_workforce_ai * 100)}% AI positions</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <Callout title="Shared Services (subordinate-heavy)" text="Routine, rules-based work. Agents execute under human supervision. 1 manager supervises ~4 AI agents." accent="blue" />
        <Callout title="Specialized functions (peer-heavy)" text="Creative, expert work. Agents co-create alongside domain experts as autonomous collaborators." accent="emerald" />
      </div>
    </div>
  );
}

function FnRow({ f }: { f: ComputedOrganizationDesign['functions'][number] }) {
  return (
    <tr>
      <td className="px-3 py-1.5 font-medium text-slate-800">{f.label}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-slate-700">{f.human_staff}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-blue-700">{f.agents_subordinate}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-emerald-700">{f.agents_peer}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">{f.supervisors}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">{f.teams}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">{f.ratio_label}</td>
      <td className="px-3 py-1.5 text-slate-500">{f.dominant_role}</td>
    </tr>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="bg-slate-50/60">
      <td className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-500" colSpan={8}>{label}</td>
    </tr>
  );
}

function TotalRow({ label, sum, accent }: { label: string; sum: { humans: number; subs: number; peers: number; sup: number; teams: number; agents: number }; accent: string }) {
  return (
    <tr className="border-t border-slate-100 bg-slate-50/30">
      <td className="px-3 py-1.5 text-[11px] italic text-slate-500">{label}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-slate-700 font-semibold">{sum.humans}</td>
      <td className={`px-2 py-1.5 text-center tabular-nums font-semibold ${accent}`}>{sum.subs}</td>
      <td className={`px-2 py-1.5 text-center tabular-nums font-semibold ${accent}`}>{sum.peers}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-slate-700 font-semibold">{sum.sup}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-slate-700 font-semibold">{sum.teams}</td>
      <td className="px-2 py-1.5"></td>
      <td className="px-3 py-1.5 text-[11px] text-slate-400 italic">{sum.agents} agents</td>
    </tr>
  );
}

function Callout({ title, text, accent }: { title: string; text: string; accent: 'blue' | 'emerald' }) {
  const bg = accent === 'blue' ? 'from-blue-50/80 border-blue-200' : 'from-emerald-50/80 border-emerald-200';
  const tx = accent === 'blue' ? 'text-blue-700' : 'text-emerald-700';
  return (
    <div className={`p-3 rounded-xl bg-gradient-to-br ${bg} border`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest ${tx}`}>{title}</div>
      <div className="text-xs text-slate-700 mt-1">{text}</div>
    </div>
  );
}
