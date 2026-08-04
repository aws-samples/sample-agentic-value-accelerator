/**
 * AgentCorePostureCard — live AWS Bedrock AgentCore control-plane posture.
 *
 * Shows what the account actually has provisioned in AgentCore: gateways (+ their
 * targets), memories, workload identities, policy engines, and Bedrock knowledge
 * bases — each from its own list API. Complements the agent inventory (the runtimes
 * themselves appear in the registry). Honest per-category live badges.
 */
import { useEffect, useState } from 'react';
import { governAgentCoreApi, type AwsAgentCorePostureResponse } from '../../api/client';
import LiveHeader from './LiveHeader';

export default function AgentCorePostureCard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsAgentCorePostureResponse | null>(null);
  // fetchError = the request itself failed (transient/network) — distinct from a
  // valid live:false response, so we don't falsely imply AgentCore isn't permitted.
  const [fetchError, setFetchError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = (attempt: number) =>
      governAgentCoreApi.posture()
        .then(d => { if (!cancelled) { setData(d); setFetchError(false); setLoading(false); } })
        .catch(() => {
          if (cancelled) return;
          if (attempt < 1) { setTimeout(() => load(attempt + 1), 1500); return; } // one retry
          setFetchError(true); setLoading(false);
        });
    load(0);
    return () => { cancelled = true; };
  }, []);

  const live = !!data?.live;
  const cats = data?.categories ?? [];

  return (
    <div className="mb-6 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
      <LiveHeader
        live={live}
        label="Live · AWS AgentCore Posture"
        caption="gateways · memories · identities · policy engines · knowledge bases — from the connected account"
      />

      {loading ? (
        <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading…</div>
      ) : live ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {cats.map(c => (
            <div key={c.key} className={`bg-white/80 backdrop-blur-sm rounded-xl border p-3 ${c.live ? 'border-slate-200/60' : 'border-slate-200/60 opacity-70'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide truncate">{c.label}</span>
                {c.live && c.total > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" title="Live" />}
              </div>
              {c.live ? (
                <>
                  <div className="text-2xl font-bold text-slate-900 tabular-nums">{c.total}</div>
                  <div className="text-[10px] text-slate-400">
                    {c.total > 0 ? `${c.ready}/${c.total} ready` : 'none provisioned'}
                  </div>
                  {c.items.length > 0 && (
                    <div className="mt-1.5 text-[10px] text-slate-500 truncate" title={c.items.map(i => i.name).join(', ')}>
                      {c.items.slice(0, 2).map(i => i.name).join(', ')}{c.total > 2 ? '…' : ''}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[10px] text-slate-400 mt-1">{c.note ?? 'Unavailable'}</div>
              )}
            </div>
          ))}
        </div>
      ) : fetchError ? (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5">●</span>
          <div>
            <div className="font-medium text-slate-600">Couldn’t reach the AgentCore service</div>
            <div className="text-[11px] mt-0.5">The request to the govern backend failed — if it was just restarted, refresh in a moment. This is a connectivity hiccup, not an AWS permissions problem.</div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5">●</span>
          <div>
            <div className="font-medium text-slate-600">No AgentCore resources found</div>
            <div className="text-[11px] mt-0.5">{data?.note ?? 'No gateways, memories, or runtimes are provisioned in the connected account yet.'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
