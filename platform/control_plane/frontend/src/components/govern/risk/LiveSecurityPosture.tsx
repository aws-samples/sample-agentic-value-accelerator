/**
 * LiveSecurityPosture — real AWS Security Hub findings for the Risk monitoring surface.
 *
 * Severity roll-up + the top open findings, straight from securityhub:GetFindings.
 * This is live AWS telemetry — distinct from the illustrative runtime-signal feed
 * and the internal risk register. Honest live badge; graceful empty/fallback.
 */
import { useEffect, useState } from 'react';
import { governRiskPostureApi, type AwsRiskPostureResponse } from '../../../api/client';
import { LiveDataBadge } from '../DataSourceIndicator';
import LiveHeader from '../LiveHeader';
import { usePollingKey } from '../usePollingKey';

const sevStyle: Record<string, { bar: string; badge: string }> = {
  CRITICAL: { bar: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700' },
  HIGH: { bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
  MEDIUM: { bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  LOW: { bar: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600' },
  INFORMATIONAL: { bar: 'bg-blue-400', badge: 'bg-blue-100 text-blue-700' },
};

export default function LiveSecurityPosture() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsRiskPostureResponse | null>(null);
  const pollKey = usePollingKey(60_000);
  useEffect(() => {
    let cancelled = false;
    // Silent refetch on poll — keep the current posture on screen while refreshing.
    governRiskPostureApi.securityHub(200)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey]);

  const live = !!data?.live;
  const maxCount = Math.max(...(data?.by_severity ?? []).map(s => s.count), 1);

  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
      <LiveHeader
        live={live}
        label="Live · AWS Security Hub"
        caption="real active findings as a risk-posture signal (securityhub:GetFindings)"
        autoRefresh
        right={live && data!.total > 0 ? (
          <span className="text-[11px] font-semibold text-slate-700 tabular-nums">{data!.total} active findings</span>
        ) : undefined}
      />

      {loading ? (
        <div className="h-24 flex items-center justify-center text-xs text-slate-400">Loading…</div>
      ) : live && data!.total > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Severity roll-up */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-sm font-semibold text-slate-900">Findings by Severity</h4>
              <LiveDataBadge />
            </div>
            <div className="space-y-2">
              {data!.by_severity.map(s => (
                <div key={s.severity} className="flex items-center gap-2 text-[11px]">
                  <span className={`w-20 font-medium px-1.5 py-0.5 rounded ${sevStyle[s.severity]?.badge ?? 'bg-slate-100 text-slate-600'}`}>{s.severity}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${sevStyle[s.severity]?.bar ?? 'bg-slate-400'}`} style={{ width: `${(s.count / maxCount) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right tabular-nums text-slate-700 font-semibold">{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top open findings */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
            <h4 className="text-sm font-semibold text-slate-900 mb-3">Top Open Findings</h4>
            <div className="space-y-1.5">
              {data!.top_findings.slice(0, 6).map(f => (
                <div key={f.id} className="flex items-start gap-2 text-[11px]">
                  <span className={`mt-0.5 px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${sevStyle[f.severity]?.badge ?? 'bg-slate-100 text-slate-600'}`}>{f.severity}</span>
                  <span className="text-slate-700 leading-snug flex-1 truncate" title={f.title}>{f.title}</span>
                  <span className="text-slate-400 flex-shrink-0">{f.product}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5">●</span>
          <div>
            <div className="font-medium text-slate-600">{live ? 'No active Security Hub findings' : 'Security Hub unavailable'}</div>
            <div className="text-[11px] mt-0.5">{data?.note ?? 'Enable AWS Security Hub to surface real findings as a risk-posture signal here.'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
