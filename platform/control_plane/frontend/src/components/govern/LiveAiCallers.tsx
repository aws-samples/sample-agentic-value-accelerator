/**
 * LiveAiCallers — real AI-service callers observed in CloudTrail, cross-referenced
 * against the governed Agent Registry. The live shadow-AI SIGNAL.
 *
 * HONEST FRAMING: this is an anomaly / coverage signal, not a verdict. An identity
 * invoking Bedrock/SageMaker that isn't a known governed agent is a candidate for
 * review — but "unrecognized" ≠ "malicious", and completeness depends on how much
 * of the fleet is registered. Distinct from the illustrative shadow-asset list.
 */
import { useEffect, useMemo, useState } from 'react';
import { governTrailApi, type AwsAiCallersResponse } from '../../api/client';
import { useAgentRegistry } from './useAgentRegistry';
import { LiveDataBadge } from './DataSourceIndicator';
import { usePollingKey } from './usePollingKey';
import MaskedIdentity from './MaskedIdentity';

export default function LiveAiCallers() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsAiCallersResponse | null>(null);
  const { agents } = useAgentRegistry();
  const pollKey = usePollingKey(60_000);

  useEffect(() => {
    let cancelled = false;
    // Silent refetch on poll — surface newly-observed callers without a flash.
    governTrailApi.aiCallers(168)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey]);

  // Recognize a caller if its identity appears in / contains a governed agent name
  // or owner (best-effort substring match — deliberately conservative).
  const known = useMemo(() => {
    const toks = new Set<string>();
    for (const a of agents) {
      for (const s of [a.name, a.owner, a.id]) {
        if (s) s.toLowerCase().split(/[\s\-_/]+/).forEach(t => { if (t.length > 3) toks.add(t); });
      }
    }
    return toks;
  }, [agents]);

  const callers = useMemo(() => {
    return (data?.callers ?? []).map(c => {
      const id = c.identity.toLowerCase();
      const recognized = [...known].some(t => id.includes(t));
      return { ...c, recognized };
    });
  }, [data, known]);

  const live = !!data?.live;
  const unrecognized = callers.filter(c => !c.recognized).length;

  const fmtTime = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-200/70 shadow-sm p-5 mb-6">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="relative flex h-2 w-2">
          {live && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} />
        </span>
        <span className="text-sm font-semibold text-slate-900">Observed AI Callers</span>
        {live && <LiveDataBadge />}
        <span className="text-[11px] text-slate-400">real Bedrock/SageMaker callers from CloudTrail · last {data?.window_hours ?? 168}h</span>
        {live && (
          <span className="inline-flex items-center gap-1 text-[9px] text-emerald-600/80" title="Refreshes automatically every 60s">
            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            auto-refreshing
          </span>
        )}
        {live && <span className="ml-auto text-[11px] font-semibold text-slate-700 tabular-nums">{unrecognized}/{callers.length} unrecognized</span>}
      </div>
      <div className="text-[11px] text-amber-700 bg-amber-50/60 rounded px-2 py-1.5 mb-3">
        <span className="font-semibold">Signal, not verdict:</span> identities calling AI services that don’t match a governed Agent Registry entry are candidates for review — “unrecognized” ≠ unauthorized. Coverage is only as complete as the registry.
      </div>

      {loading ? (
        <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading…</div>
      ) : callers.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                <th scope="col" className="font-medium pb-2">Identity</th>
                <th scope="col" className="font-medium pb-2">Sources</th>
                <th scope="col" className="font-medium pb-2">Top actions</th>
                <th scope="col" className="font-medium pb-2 text-right">Events</th>
                <th scope="col" className="font-medium pb-2 text-right">Last seen</th>
                <th scope="col" className="font-medium pb-2 text-right">Registry</th>
              </tr>
            </thead>
            <tbody>
              {callers.map((c, i) => (
                <tr key={c.identity + i} className={i > 0 ? 'border-t border-slate-100' : ''}>
                  <td className="py-2 pr-2 font-medium max-w-[220px]">
                    <MaskedIdentity identity={c.identity} />
                  </td>
                  <td className="py-2 pr-2 text-slate-500">{c.sources.join(', ')}</td>
                  <td className="py-2 pr-2 text-slate-500 max-w-[260px] truncate" title={c.top_actions.join(', ')}>{c.top_actions.join(', ')}</td>
                  <td className="py-2 text-right tabular-nums text-slate-700">{c.event_count.toLocaleString()}</td>
                  <td className="py-2 text-right text-slate-500 whitespace-nowrap">{fmtTime(c.last_seen)}</td>
                  <td className="py-2 text-right">
                    {c.recognized
                      ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Recognized</span>
                      : <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Review</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5">●</span>
          <div>
            <div className="font-medium text-slate-600">{live ? 'No AI-service callers observed' : 'CloudTrail unavailable'}</div>
            <div className="text-[11px] mt-0.5">{data?.note ?? 'Bedrock/SageMaker API callers in the window will appear here from CloudTrail.'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
