/**
 * SecurityPostureCard — unified AWS security posture, live from four services.
 *
 * GuardDuty (threats) + Macie (sensitive data) + Inspector (vulnerabilities) +
 * IAM Access Analyzer (external access), each pulled from its own API and
 * normalized to a severity rollup. Real AWS telemetry — distinct from the
 * internal risk register. Honest per-source live badges + graceful empty states.
 */
import { useEffect, useState } from 'react';
import { governSecurityApi, type AwsSecurityPostureResponse } from '../../../api/client';
import { LiveDataBadge } from '../DataSourceIndicator';
import LiveHeader from '../LiveHeader';
import { usePollingKey } from '../usePollingKey';

const sevStyle: Record<string, { bar: string; badge: string }> = {
  CRITICAL: { bar: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700' },
  HIGH: { bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
  MEDIUM: { bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  LOW: { bar: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600' },
};

export default function SecurityPostureCard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsSecurityPostureResponse | null>(null);
  const pollKey = usePollingKey(60_000);
  useEffect(() => {
    let cancelled = false;
    // Silent refetch on poll — keep the current rollup on screen while refreshing.
    governSecurityApi.posture()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey]);

  const live = !!data?.live;
  const sources = data?.sources ?? [];

  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
      <LiveHeader
        live={live}
        label="Live · AWS Security Posture"
        caption="GuardDuty · Macie · Inspector · Access Analyzer — each from its own API"
        autoRefresh
        right={live ? (
          <span className="flex items-center gap-2 text-[11px]">
            {data!.critical > 0 && <span className="font-semibold text-rose-600">{data!.critical} critical</span>}
            <span className="font-semibold text-orange-600">{data!.high} high</span>
            <span className="text-slate-500 tabular-nums">{data!.total_findings} findings · {data!.sources_live}/{data!.sources_total} services</span>
          </span>
        ) : undefined}
      />

      {loading ? (
        <div className="h-24 flex items-center justify-center text-xs text-slate-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {sources.map(s => {
            const maxCount = Math.max(...s.by_severity.map(x => x.count), 1);
            return (
              <div key={s.source} className={`bg-white/80 backdrop-blur-sm rounded-xl border p-4 ${s.live ? 'border-slate-200/60' : 'border-slate-200/60 opacity-75'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-slate-900">{s.label}</span>
                  {s.live && <LiveDataBadge />}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">{s.dimension}</div>
                {s.live ? (
                  s.total > 0 ? (
                    <>
                      <div className="flex items-baseline gap-1.5 mb-2">
                        <span className="text-2xl font-bold text-slate-900 tabular-nums">{s.total}</span>
                        <span className="text-[10px] text-slate-500">findings</span>
                        {s.critical > 0 && <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">{s.critical} crit</span>}
                      </div>
                      <div className="space-y-1">
                        {s.by_severity.map(x => (
                          <div key={x.severity} className="flex items-center gap-1.5 text-[10px]">
                            <span className={`w-14 shrink-0 font-medium px-1 py-0.5 rounded text-center ${sevStyle[x.severity]?.badge ?? 'bg-slate-100 text-slate-600'}`}>{x.severity}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className={`h-full rounded-full ${sevStyle[x.severity]?.bar ?? 'bg-slate-400'}`} style={{ width: `${(x.count / maxCount) * 100}%` }} />
                            </div>
                            <span className="w-6 text-right tabular-nums text-slate-600">{x.count}</span>
                          </div>
                        ))}
                      </div>
                      {s.top_types.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400 truncate" title={s.top_types.join(', ')}>
                          {s.top_types.join(' · ')}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-[11px] text-emerald-600">✓ No active findings</div>
                  )
                ) : (
                  <div className="text-[11px] text-slate-500">{s.note ?? 'Not enabled'}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
