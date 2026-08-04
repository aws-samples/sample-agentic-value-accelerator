/**
 * A2ATrustEvaluator — live delegation-authorization panel for A2A Governance.
 *
 * Calls the real A2A trust backend to evaluate an agent->agent delegation,
 * surfacing the differentiator: the AUTONOMY CEILING = min(source scope, target
 * scope, policy cap). An agent cannot delegate more autonomy than either party
 * holds. Shown as a compact interactive card above the (mock) A2A config views.
 *
 * Backend-first: if the trust-policy table is absent, it degrades to an honest
 * "backend unreachable / no policy" state rather than breaking the page.
 */
import { useState } from 'react';
import { governA2AApi, type DelegationDecision } from '../../api/client';

export default function A2ATrustEvaluator() {
  const [src, setSrc] = useState('agt-00001');
  const [tgt, setTgt] = useState('agt-00002');
  const [action, setAction] = useState('read-customer-data');
  const [autonomy, setAutonomy] = useState(3);
  const [decision, setDecision] = useState<DelegationDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function evaluate() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const d = await governA2AApi.evaluate({
        source_agent_id: src, target_agent_id: tgt, action,
        requested_autonomy: autonomy, chain_depth: 1,
      });
      setDecision(d);
    } catch {
      setDecision(null);
      setError('Backend unreachable or trust-policy table not provisioned — evaluation needs the A2A table.');
    } finally {
      setBusy(false);
    }
  }

  const permit = decision?.effect === 'permit';

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <h4 className="text-sm font-semibold text-slate-900">Delegation Evaluator</h4>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">live authz engine</span>
      </div>
      <p className="text-[10px] text-slate-400 mb-3">
        Evaluate an agent→agent delegation against real trust policy. The differentiator: an agent can't delegate more autonomy than the <span className="font-medium">ceiling = min(source, target, policy cap)</span>.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[10px] text-slate-500">Source agent
          <input value={src} onChange={e => setSrc(e.target.value)} className="block text-[11px] border border-slate-200 rounded px-2 py-1 mt-0.5 w-32" />
        </label>
        <label className="text-[10px] text-slate-500">Target agent
          <input value={tgt} onChange={e => setTgt(e.target.value)} className="block text-[11px] border border-slate-200 rounded px-2 py-1 mt-0.5 w-32" />
        </label>
        <label className="text-[10px] text-slate-500 flex-1 min-w-[140px]">Delegated action
          <input value={action} onChange={e => setAction(e.target.value)} className="block w-full text-[11px] border border-slate-200 rounded px-2 py-1 mt-0.5" />
        </label>
        <label className="text-[10px] text-slate-500">Requested autonomy
          <select value={autonomy} onChange={e => setAutonomy(Number(e.target.value))} className="block text-[11px] border border-slate-200 rounded px-2 py-1 mt-0.5">
            {[1, 2, 3, 4].map(l => <option key={l} value={l}>L{l}</option>)}
          </select>
        </label>
        <button disabled={busy} onClick={evaluate} className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50">{busy ? 'Evaluating…' : 'Evaluate'}</button>
      </div>

      {error && <div className="mt-3 text-[10px] text-amber-600 bg-amber-50/60 rounded-lg px-3 py-2 border border-amber-100">{error}</div>}

      {decision && (
        <div className={`mt-4 rounded-lg border p-3 ${permit ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: permit ? '#10b981' : '#ef4444' }} />
            <span className={`text-sm font-semibold ${permit ? 'text-emerald-700' : 'text-rose-700'}`}>{decision.effect.toUpperCase()}</span>
            {decision.denied_by && <span className="text-[10px] text-slate-400">denied by: {decision.denied_by.replace(/_/g, ' ')}</span>}
          </div>
          <div className="text-[11px] text-slate-600 mt-1">{decision.reason}</div>
          <div className="text-[10px] text-slate-400 mt-1.5 flex flex-wrap gap-x-3">
            <span>source scope <span className="font-medium text-slate-600">L{decision.source_scope}</span></span>
            <span>target scope <span className="font-medium text-slate-600">L{decision.target_scope}</span></span>
            <span>requested <span className="font-medium text-slate-600">L{decision.requested_autonomy}</span></span>
            <span>ceiling <span className="font-medium text-slate-600">L{decision.effective_autonomy_ceiling}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}
