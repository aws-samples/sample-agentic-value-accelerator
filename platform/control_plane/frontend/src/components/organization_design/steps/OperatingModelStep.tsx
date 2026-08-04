import type { ODOperatingModelInputs, ODOrgProfile, ComputedOrganizationDesign } from '../types';
import { COORDINATION_MECHANISMS, OPERATING_ARCHETYPES } from '../types';

interface Props {
  operating: ODOperatingModelInputs;
  setOperating: (v: ODOperatingModelInputs) => void;
  profile: ODOrgProfile;
  computed: ComputedOrganizationDesign;
}

export default function OperatingModelStep({ operating, setOperating, profile, computed }: Props) {
  const upd = <K extends keyof ODOperatingModelInputs>(k: K, v: ODOperatingModelInputs[K]) => setOperating({ ...operating, [k]: v });
  const nodes = operating.num_product_lines * operating.num_geographies * operating.num_customer_segments;
  const complexityClass = nodes > 100 ? 'Complex' : nodes >= 20 ? 'Moderate' : 'Simple';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        {/* Complexity */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-2">1 · Organizational complexity (Mintzberg)</h3>
          <p className="text-xs text-slate-500 mb-3">Products × Geographies × Segments = coordination nodes. More nodes ⇒ heavier coordination burden ⇒ shifts required org shape.</p>
          <div className="grid grid-cols-3 gap-3">
            <NumField label="Product lines" value={operating.num_product_lines} onChange={(n) => upd('num_product_lines', n)} />
            <NumField label="Geographies" value={operating.num_geographies} onChange={(n) => upd('num_geographies', n)} />
            <NumField label="Customer segments" value={operating.num_customer_segments} onChange={(n) => upd('num_customer_segments', n)} />
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs">
            <span className="text-slate-500">Coordination nodes:</span>
            <span className="font-bold tabular-nums text-slate-800">{nodes}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              complexityClass === 'Complex' ? 'bg-red-50 text-red-700 border border-red-200'
              : complexityClass === 'Moderate' ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>{complexityClass}</span>
          </div>
        </div>

        {/* Coordination mechanism */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-2">2 · Coordination mechanism</h3>
          <p className="text-xs text-slate-500 mb-3">Pick how work gets coordinated across the org (Mintzberg's five). This shapes what AI can and can't standardize.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {COORDINATION_MECHANISMS.map((m) => (
              <label key={m} className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                operating.coordination_mechanism === m ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}>
                <input type="radio" checked={operating.coordination_mechanism === m}
                  onChange={() => upd('coordination_mechanism', m)}
                  className="mt-0.5 accent-indigo-600" />
                <div>
                  <div className="text-xs font-semibold text-slate-800">{m}</div>
                  <div className="text-[11px] text-slate-500">{coordDesc(m)}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Operating archetype */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-2">3 · Operating model archetype</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {OPERATING_ARCHETYPES.map((a) => (
              <label key={a} className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                operating.operating_archetype === a ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}>
                <input type="radio" checked={operating.operating_archetype === a}
                  onChange={() => upd('operating_archetype', a)}
                  className="mt-0.5 accent-indigo-600" />
                <div>
                  <div className="text-xs font-semibold text-slate-800">{a}</div>
                  <div className="text-[11px] text-slate-500">{archDesc(a)}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* RAPID */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-2">4 · Decision rights (Bain RAPID)</h3>
          <p className="text-xs text-slate-500 mb-3">Who plays each role for the AI-era decisions that will define the transition.</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <tr>
                  <th className="text-left px-3 py-2">Decision area</th>
                  <th className="text-left px-2 py-2">Recommend</th>
                  <th className="text-left px-2 py-2">Agree</th>
                  <th className="text-left px-2 py-2">Perform</th>
                  <th className="text-left px-2 py-2">Input</th>
                  <th className="text-left px-2 py-2">Decide</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {operating.rapid_decisions.map((d, i) => (
                  <tr key={d.key}>
                    <td className="px-3 py-2 font-medium text-slate-800 w-48">{d.label}</td>
                    {(['recommend','agree','perform','input_role','decide'] as const).map((f) => (
                      <td key={f} className="px-1 py-1">
                        <input type="text" value={(d as any)[f]} onChange={(e) => {
                          const list = [...operating.rapid_decisions];
                          list[i] = { ...list[i], [f]: e.target.value };
                          upd('rapid_decisions', list);
                        }} className="w-full px-2 py-1 text-xs rounded border border-slate-200" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 self-start">
        <div className="p-4 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-violet-50/60">
          <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-700 mb-1">Live preview</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums leading-tight">{computed.coordination_nodes}</div>
          <div className="text-xs text-slate-600">Coordination nodes</div>
          <hr className="my-3 border-slate-200/60" />
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Complexity</div><div className="text-sm font-semibold text-slate-800">{computed.complexity_class}</div></div>
            <div><div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Scale</div><div className="text-sm font-semibold text-slate-800">{computed.scale_class}</div></div>
            <div className="col-span-2"><div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Structure ({profile.structure_type})</div><div className="text-sm font-semibold text-slate-800">span {computed.span_current_min}–{computed.span_current_max} → AI {computed.span_ai_adjusted}</div></div>
            <div className="col-span-2"><div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Layers</div><div className="text-sm font-semibold text-slate-800">{computed.current_layers} → {computed.target_layers} (−{computed.layers_eliminated})</div></div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input type="number" value={value} min={1}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none" />
    </label>
  );
}

function coordDesc(m: string) {
  switch (m) {
    case 'Mutual Adjustment':          return 'Informal comms — small teams, innovation work → Adhocracy.';
    case 'Direct Supervision':         return 'One coordinates others — simple, small orgs → Simple Structure.';
    case 'Standardization of Work':    return 'Programming of work content — routine tasks → Machine Bureaucracy.';
    case 'Standardization of Outputs': return 'Specify results — diversified divisions → Divisionalized Form.';
    case 'Standardization of Skills':  return 'Training/socialization — professional expertise → Professional Bureaucracy.';
    default:                           return '';
  }
}

function archDesc(a: string) {
  switch (a) {
    case 'Coordination':    return 'Federated units share info, retain autonomy — Federated AI + shared platform.';
    case 'Unification':     return 'One company, one way — Centralized AI Center of Excellence.';
    case 'Diversification': return 'Max BU autonomy — Distributed AI, BU-owned.';
    case 'Replication':     return 'Standardized core replicated — Templated AI with local tuning.';
    default:                return '';
  }
}
