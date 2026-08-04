/**
 * RuntimeEnforcementView — the runtime allow/pause/deny PDP, in the UI.
 *
 * Two panels:
 *  - The AUTONOMY_GATE matrix (scope level x action type x risk tier -> default
 *    disposition) — the hero artifact no competitor ships even statically.
 *  - An interactive "evaluate an action" tester that calls the real backend PDP
 *    (dry-run) and shows the live decision + reason + what matched.
 *
 * Fully live locally: the gate + dry-run evaluate are pure logic (no table).
 * Falls back to a bundled copy of the matrix if the backend is unreachable.
 */
import { useEffect, useRef, useState } from 'react';
import {
  governEnforcementApi,
  type GateMatrix, type EnforcementDecision, type EvaluateActionRequest,
} from '../../api/client';
import { AGENT_SCOPE_META } from './autonomyLadder';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';

const ACTIONS = ['read', 'write', 'execute', 'external', 'admin'] as const;
const RISKS = ['low', 'medium', 'high', 'critical'] as const;

const dispMeta: Record<string, { label: string; cell: string; dot: string }> = {
  allow: { label: 'Allow', cell: 'bg-emerald-50 text-emerald-700', dot: '#10b981' },
  pause: { label: 'Pause', cell: 'bg-amber-50 text-amber-700', dot: '#f59e0b' },
  deny:  { label: 'Deny',  cell: 'bg-rose-50 text-rose-700', dot: '#ef4444' },
};

// Fallback matrix (mirrors backend AUTONOMY_GATE) if backend is unreachable.
const FALLBACK_GATE: GateMatrix = {
  '1': { read: { low: 'allow', medium: 'allow', high: 'pause', critical: 'pause' }, write: { low: 'deny', medium: 'deny', high: 'deny', critical: 'deny' }, execute: { low: 'deny', medium: 'deny', high: 'deny', critical: 'deny' }, external: { low: 'deny', medium: 'deny', high: 'deny', critical: 'deny' }, admin: { low: 'deny', medium: 'deny', high: 'deny', critical: 'deny' } },
  '2': { read: { low: 'allow', medium: 'allow', high: 'allow', critical: 'pause' }, write: { low: 'pause', medium: 'pause', high: 'pause', critical: 'deny' }, execute: { low: 'pause', medium: 'pause', high: 'deny', critical: 'deny' }, external: { low: 'pause', medium: 'pause', high: 'deny', critical: 'deny' }, admin: { low: 'deny', medium: 'deny', high: 'deny', critical: 'deny' } },
  '3': { read: { low: 'allow', medium: 'allow', high: 'allow', critical: 'allow' }, write: { low: 'allow', medium: 'allow', high: 'pause', critical: 'pause' }, execute: { low: 'allow', medium: 'allow', high: 'pause', critical: 'deny' }, external: { low: 'allow', medium: 'pause', high: 'pause', critical: 'deny' }, admin: { low: 'pause', medium: 'pause', high: 'deny', critical: 'deny' } },
  '4': { read: { low: 'allow', medium: 'allow', high: 'allow', critical: 'allow' }, write: { low: 'allow', medium: 'allow', high: 'allow', critical: 'pause' }, execute: { low: 'allow', medium: 'allow', high: 'allow', critical: 'pause' }, external: { low: 'allow', medium: 'allow', high: 'pause', critical: 'pause' }, admin: { low: 'pause', medium: 'pause', high: 'pause', critical: 'deny' } },
};

export default function RuntimeEnforcementView() {
  const [gate, setGate] = useState<GateMatrix>(FALLBACK_GATE);
  const [source, setSource] = useState<'loading' | 'live' | 'demo'>('loading');
  const [scope, setScope] = useState(2);
  const [decision, setDecision] = useState<EnforcementDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [req, setReq] = useState<EvaluateActionRequest>({
    agent_id: 'agt-demo', scope_level: 2, action_type: 'write', tool: 'wire-transfer', risk_tier: 'high',
  });
  // Guards against setState-after-unmount (this view is a tab, so unmount-on-
  // switch is normal) and against an older in-flight evaluate overwriting a newer.
  const mounted = useRef(true);
  const reqSeq = useRef(0);

  useEffect(() => {
    mounted.current = true;
    governEnforcementApi.gate()
      .then(r => { if (mounted.current) { setGate(r.gate); setSource('live'); } })
      .catch(() => { if (mounted.current) setSource('demo'); });
    return () => { mounted.current = false; };
  }, []);

  async function evaluate() {
    if (busy) return;
    const seq = ++reqSeq.current;
    setBusy(true);
    setError(null);
    try {
      const d = await governEnforcementApi.evaluate({ ...req, scope_level: scope }, true);
      if (mounted.current && seq === reqSeq.current) setDecision(d);
    } catch {
      // Don't silently erase the last result — surface that the live call failed.
      if (mounted.current && seq === reqSeq.current) setError('Evaluation failed — the decision engine is unreachable.');
    } finally {
      if (mounted.current && seq === reqSeq.current) setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Runtime Enforcement</h3>
          {source === 'live' && <LiveDataBadge />}
          {source === 'demo' && <MockDataBadge integration="Backend unreachable — using fallback matrix" />}
          {source === 'loading' && <span className="text-[9px] text-slate-400">Loading...</span>}
        </div>
        <p className="text-[11px] text-slate-500 max-w-3xl">
          Inline allow / pause / deny for agent actions, gated by the autonomy ladder — the decision point no competitor ships GA. "Pause" routes to the Human Oversight handoff; every decision is recorded to the audit log with reasoning. Advisory locally; blocking at a live agent intercept.
        </p>
      </div>

      {/* The gate matrix — scope x action x risk */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Autonomy Gate</h4>
            <p className="text-[10px] text-slate-400">Default disposition by scope level × action × risk. Select a scope level to inspect.</p>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(l => (
              <button key={l} onClick={() => setScope(l)}
                className={`text-[10px] font-semibold px-2 py-1 rounded ${scope === l ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                style={scope === l ? { background: AGENT_SCOPE_META[l as 1 | 2 | 3 | 4].color } : undefined}>
                L{l} {AGENT_SCOPE_META[l as 1 | 2 | 3 | 4].name}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="py-2 px-5 text-left font-medium">Action \ Risk</th>
              {RISKS.map(r => <th scope="col" key={r} className="py-2 px-2 text-center font-medium">{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {ACTIONS.map(a => (
              <tr key={a} className="border-t border-slate-100">
                <td className="py-2 px-5 font-medium text-slate-700 capitalize">{a}</td>
                {RISKS.map(r => {
                  const disp = gate[String(scope)]?.[a]?.[r] ?? 'pause';
                  const m = dispMeta[disp];
                  return <td key={r} className="py-2 px-2 text-center"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${m.cell}`}>{m.label}</span></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-4 px-5 py-2 border-t border-slate-100 text-[10px] text-slate-500">
          {Object.entries(dispMeta).map(([k, m]) => (
            <span key={k} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: m.dot }} />{m.label}</span>
          ))}
        </div>
      </div>

      {/* Interactive evaluate */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <h4 className="text-sm font-semibold text-slate-900 mb-1">Evaluate an action (live PDP)</h4>
        <p className="text-[10px] text-slate-400 mb-3">Dry-run against the real decision engine — no writes. Change the inputs and see the disposition move.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[10px] text-slate-500">Scope
            <select value={scope} onChange={e => setScope(Number(e.target.value))} className="block text-[11px] border border-slate-200 rounded px-2 py-1 mt-0.5">
              {[1, 2, 3, 4].map(l => <option key={l} value={l}>L{l} {AGENT_SCOPE_META[l as 1 | 2 | 3 | 4].name}</option>)}
            </select>
          </label>
          <label className="text-[10px] text-slate-500">Action
            <select value={req.action_type} onChange={e => setReq({ ...req, action_type: e.target.value as EvaluateActionRequest['action_type'] })} className="block text-[11px] border border-slate-200 rounded px-2 py-1 mt-0.5">
              {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="text-[10px] text-slate-500">Risk
            <select value={req.risk_tier} onChange={e => setReq({ ...req, risk_tier: e.target.value as EvaluateActionRequest['risk_tier'] })} className="block text-[11px] border border-slate-200 rounded px-2 py-1 mt-0.5">
              {RISKS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="text-[10px] text-slate-500 flex-1 min-w-[140px]">Tool
            <input value={req.tool} onChange={e => setReq({ ...req, tool: e.target.value })} className="block w-full text-[11px] border border-slate-200 rounded px-2 py-1 mt-0.5" />
          </label>
          <button disabled={busy} onClick={evaluate} className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50">{busy ? 'Evaluating…' : 'Evaluate'}</button>
        </div>

        {error && <div className="mt-4 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

        {decision && (() => {
          // Disposition is a live backend value — guard against an unexpected one
          // (default to deny) so an out-of-set value can't crash the whole page.
          const m = dispMeta[decision.disposition] ?? dispMeta.deny;
          return (
          <div className="mt-4 rounded-lg border p-3" style={{ borderColor: `${m.dot}55`, background: `${m.dot}0d` }}>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.dot }} />
              <span className="text-sm font-semibold" style={{ color: m.dot }}>{m.label.toUpperCase()}</span>
              <span className="text-[10px] text-slate-500">matched by {decision.matched_by} · mode {decision.enforcement_mode}</span>
            </div>
            <div className="text-[11px] text-slate-600 mt-1">{decision.reason}</div>
            {decision.disposition === 'pause' && <div className="text-[10px] text-amber-600 mt-1">→ would route to the Human Oversight handoff workspace.</div>}
          </div>
          );
        })()}
      </div>
    </div>
  );
}
