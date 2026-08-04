/**
 * Sr26MappingView — SR 26-2 agent-aware model-risk mapping, in the UI.
 *
 * Shows how AVA satisfies the current US model-risk guidance of record (SR 26-2,
 * supersedes SR 11-7) for autonomous agents — each control reframed for agents
 * and bound to a live signal. The differentiator: the "Evaluate against live
 * signals" action resolves controls against the real audit log and shows both a
 * conformance % and an evidence-backed % (how much is proven vs attested).
 *
 * Backend-first with an honest empty/offline state; creates a default mapping
 * on demand. FSI whitespace: MRM-credible vendors are model-centric.
 */
import { useEffect, useRef, useState } from 'react';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { governSr26Api, type Sr26Mapping } from '../../api/client';

const statusMeta: Record<string, { icon: string; badge: string }> = {
  pass: { icon: '✓', badge: 'bg-emerald-100 text-emerald-700' },
  'in-progress': { icon: '!', badge: 'bg-amber-100 text-amber-700' },
  fail: { icon: '✕', badge: 'bg-rose-100 text-rose-700' },
  'not-started': { icon: '—', badge: 'bg-slate-100 text-slate-500' },
  'not-applicable': { icon: '·', badge: 'bg-slate-100 text-slate-400' },
};

const sourceMeta: Record<string, { label: string; cls: string }> = {
  live: { label: 'live', cls: 'bg-emerald-100 text-emerald-700' },
  client_supplied: { label: 'supplied', cls: 'bg-blue-100 text-blue-700' },
  pending: { label: 'pending', cls: 'bg-slate-100 text-slate-500' },
};

export default function Sr26MappingView({ embedded = false }: { embedded?: boolean } = {}) {
  const [mapping, setMapping] = useState<Sr26Mapping | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'offline'>('loading');
  const [busy, setBusy] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    governSr26Api.list()
      .then(list => {
        if (!mounted.current) return;
        if (list && list.length > 0) { setMapping(list[0]); setState('ready'); }
        else setState('empty');
      })
      // A list failure is almost always "table not provisioned yet" (backend
      // reachable) — show the empty state + build action, which surfaces any
      // true backend failure itself.
      .catch(() => { if (mounted.current) setState('empty'); });
    return () => { mounted.current = false; };
  }, []);

  async function createDefault() {
    setBusy(true);
    try {
      const m = await governSr26Api.create('FSI Agent MRM — SR 26-2', 'agt-00001');
      setMapping(m); setState('ready');
    } catch { setState('offline'); }
    finally { setBusy(false); }
  }

  async function evaluate() {
    if (!mapping || busy) return;
    setBusy(true);
    setEvalError(null);
    try {
      const m = await governSr26Api.evaluate(mapping.sr26_id, 3);
      if (mounted.current) setMapping(m);
    } catch {
      if (mounted.current) setEvalError('Evaluation failed — could not reach the live signal engine.');
    }
    finally { if (mounted.current) setBusy(false); }
  }

  const c = mapping?.computed;

  const body = (
      <div className="space-y-6">
        {state === 'loading' && (
          <div className="bg-white/80 rounded-xl border border-slate-200/60 shadow-sm p-6 text-center text-[12px] text-slate-400 animate-pulse">
            Loading SR 26-2 mapping…
          </div>
        )}

        {state === 'offline' && (
          <div className="text-[12px] text-amber-700 bg-amber-50/70 rounded-xl border border-amber-200 px-5 py-4">
            Backend unreachable or the SR 26-2 table isn't provisioned. This surface is backend-driven; start the control-plane backend (and its DynamoDB table) to load mappings.
          </div>
        )}

        {state === 'empty' && (
          <div className="bg-white/80 rounded-xl border border-slate-200/60 shadow-sm p-6 text-center">
            <div className="text-sm font-semibold text-slate-800 mb-1">No SR 26-2 mapping yet</div>
            <p className="text-[11px] text-slate-500 mb-3 max-w-md mx-auto">Create the default agent-reframed SR 26-2 control catalog (inventory, validation & effective challenge, ongoing monitoring, governance) to begin.</p>
            <button disabled={busy} onClick={createDefault} className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50">Build default catalog</button>
          </div>
        )}

        {state === 'ready' && mapping && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">{mapping.name}</div>
                <div className="text-[10px] text-slate-400">{mapping.standard} · {mapping.materiality_tier} · agent {mapping.agent_id ?? '(fleet)'}</div>
              </div>
              <button disabled={busy} onClick={evaluate} className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                {busy ? 'Evaluating…' : 'Evaluate against live signals'}
              </button>
            </div>

            {evalError && <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{evalError}</div>}

            {c && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Controls" value={c.total_controls} />
                <StatCard label="Passed" value={c.passed} variant="success" />
                <StatCard label="Conformance" value={`${c.conformance_pct}%`} variant="info" />
                <StatCard label="Evidence-Backed" value={`${c.evidence_backed_pct}%`} variant={c.evidence_backed_pct > 0 ? 'success' : 'muted'} sub="proven, not attested" />
              </div>
            )}

            {mapping.pillars.map(p => (
              <div key={p.key} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-900">{p.name}</div>
                <div className="divide-y divide-slate-100">
                  {p.controls.map(ctrl => {
                    const sm = statusMeta[ctrl.status] ?? statusMeta['not-started'];
                    const src = sourceMeta[ctrl.signal_source] ?? sourceMeta.pending;
                    return (
                      <div key={ctrl.id} className="px-5 py-3 flex items-start gap-3">
                        <span className={`text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${sm.badge}`}>{sm.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-800">{ctrl.id} · {ctrl.label}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${src.cls}`}>{src.label}</span>
                            {ctrl.iso42001_ref && <span className="text-[9px] text-slate-500">↔ {ctrl.iso42001_ref}</span>}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{ctrl.agent_reframe}</div>
                          {ctrl.evaluated_value && <div className="text-[10px] text-slate-500 mt-0.5">signal: {ctrl.evaluated_value}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
  );

  if (embedded) return body;
  return (
    <GovernPageLayout
      title="SR 26-2 — Agent Model Risk"
      description="The current US model-risk guidance of record (SR 26-2, Apr 2026, supersedes SR 11-7), reframed for autonomous agents and evaluated against live signals. Exact clause text to be confirmed against the Fed letter."
      badge={<MockDataBadge integration="SR 26-2 mapping — control-plane backend (DynamoDB)" />}
    >
      {body}
    </GovernPageLayout>
  );
}
