/**
 * LiveAiActivity — real CloudTrail AI-service activity for the Audit surface.
 *
 * Recent Bedrock + SageMaker API calls (who / what / when / errored) straight from
 * cloudtrail:LookupEvents — the live "what actually happened" audit feed, alongside
 * the existing guardrail-intervention bridge and the illustrative event log.
 * Honest live badge; graceful empty/fallback.
 */
import { useEffect, useState } from 'react';
import { governTrailApi, type AwsTrailResponse } from '../../api/client';
import { LiveDataBadge } from './DataSourceIndicator';
import LiveHeader from './LiveHeader';
import { usePollingKey } from './usePollingKey';
import MaskedIdentity from './MaskedIdentity';

const sourceLabel = (s: string) => s.replace('.amazonaws.com', '');

export default function LiveAiActivity() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsTrailResponse | null>(null);
  const pollKey = usePollingKey(60_000);
  useEffect(() => {
    let cancelled = false;
    // Silent refetch on poll — near-real-time trail without a spinner flash.
    governTrailApi.aiActivity(24)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey]);

  const live = !!data?.live;
  const events = data?.events ?? [];

  const fmtTime = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  return (
    <div className="mb-6 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
      <LiveHeader
        live={live}
        label="Live · AWS CloudTrail"
        caption={`real Bedrock & SageMaker API activity · last ${data?.window_hours ?? 24}h`}
        autoRefresh
        right={live ? (
          <span className="flex items-center gap-2 text-[11px]">
            {Object.entries(data!.by_source).map(([s, n]) => (
              <span key={s} className="text-slate-600"><span className="font-semibold tabular-nums">{n}</span> {sourceLabel(s)}</span>
            ))}
            {data!.errors > 0 && <span className="text-rose-600 font-medium">{data!.errors} errored</span>}
          </span>
        ) : undefined}
      />

      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Recent AI-Service Activity</h3>
          {live && <LiveDataBadge />}
        </div>
        {loading ? (
          <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading…</div>
        ) : events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                  <th scope="col" className="font-medium pb-2">Event</th>
                  <th scope="col" className="font-medium pb-2">Source</th>
                  <th scope="col" className="font-medium pb-2">Identity</th>
                  <th scope="col" className="font-medium pb-2">When</th>
                  <th scope="col" className="font-medium pb-2 text-right">Result</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 10).map((e, i) => (
                  <tr key={e.event_id || i} className={i > 0 ? 'border-t border-slate-100' : ''}>
                    <td className="py-2 pr-2 font-medium text-slate-800">{e.event_name}</td>
                    <td className="py-2 pr-2 text-slate-500">{sourceLabel(e.event_source)}</td>
                    <td className="py-2 pr-2 text-slate-500 max-w-[220px]">{e.username ? <MaskedIdentity identity={e.username} /> : '—'}</td>
                    <td className="py-2 pr-2 text-slate-500 whitespace-nowrap">{fmtTime(e.event_time)}</td>
                    <td className="py-2 text-right">
                      {e.error_code
                        ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-700" title={e.error_code}>{e.error_code}</span>
                        : <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">OK</span>}
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
              <div className="font-medium text-slate-600">{live ? 'No recent AI-service activity' : 'CloudTrail unavailable'}</div>
              <div className="text-[11px] mt-0.5">{data?.note ?? 'Bedrock/SageMaker API calls in the last 24h will appear here from CloudTrail.'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
