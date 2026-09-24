/**
 * LiveCtLakeActivity — long-window AI-service activity from CloudTrail Lake.
 *
 * The short-window LiveAiActivity feed (LookupEvents, last 24h) answers "what just
 * happened". This sibling answers "how much, over a long window" — the 30-day
 * DENOMINATOR for coverage/rate metrics: total_events, active_days, a by-day trend,
 * and top-N breakdowns by action and by principal (identities masked).
 *
 * CloudTrail Lake bills per query by bytes scanned, so the server runs ONE aggregating
 * query per window per hour and caches it for ~60 min. We therefore poll SLOWLY (10 min)
 * and never spin the server. The Live badge is gated on the payload's real `.live`; when
 * the store has no matching AI events yet the surface honest-degrades to a Demo badge and
 * renders the server's own `note`. The per-query `cost_note` is shown as a footnote.
 */
import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { governCtLakeApi, type AwsCtLakeAiActivityResponse } from '../../api/client';
import { LiveDataBadge } from './DataSourceIndicator';
import LiveHeader from './LiveHeader';
import { usePollingKey } from './usePollingKey';
import MaskedIdentity from './MaskedIdentity';
import { Icon } from './icons';
import { useDataSources } from './DataSourceContext';
import { tooltipStyle } from './mockData';

const WINDOW_DAYS = 30;
const TOP_N = 8;

const sourceLabel = (s: string) => s.replace('.amazonaws.com', '');
const fmtDay = (iso: string) => (iso && iso.length >= 10 ? iso.slice(5) : iso); // YYYY-MM-DD → MM-DD

export default function LiveCtLakeActivity() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsCtLakeAiActivityResponse | null>(null);
  // Server caches the underlying Lake query for ~60 min; poll slowly so we never
  // trigger a fresh (billed) scan more than the cache already allows.
  const pollKey = usePollingKey(600_000); // 10 min
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    // Silent refetch on poll — update state in place, no spinner flash.
    governCtLakeApi.aiActivity(WINDOW_DAYS)
      .then(d => {
        if (cancelled) return;
        setData(d);
        // Honest source health: only 'live' when the payload really is live.
        updateSource('aws-cloudtrail-lake', {
          name: 'CloudTrail Lake',
          provider: 'aws',
          status: d?.live ? 'live' : 'demo',
          lastFetch: Date.now(),
          description: 'Long-window AI-activity denominators (aggregates)',
        });
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        updateSource('aws-cloudtrail-lake', {
          name: 'CloudTrail Lake',
          provider: 'aws',
          status: 'error',
          error: 'API unavailable',
        });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey, updateSource]);

  const live = !!data?.live;
  const windowDays = data?.window_days ?? WINDOW_DAYS;
  const totalEvents = data?.total_events ?? 0;
  const hasActivity = live && totalEvents > 0;

  const byDay = data?.by_day ?? [];
  const byAction = (data?.by_action ?? []).slice(0, TOP_N);
  const byPrincipal = (data?.by_principal ?? []).slice(0, TOP_N);
  const maxActionCount = byAction.reduce((m, a) => Math.max(m, a.count), 0) || 1;

  return (
    <div className={`mb-6 rounded-2xl border p-4 shadow-sm ${
      hasActivity
        ? 'border-sky-200/70 bg-gradient-to-br from-sky-50/50 via-white to-white'
        : 'border-slate-200/60 bg-white/80 backdrop-blur-sm'
    }`}>
      <LiveHeader
        live={live}
        label="Long-Window AI Activity · CloudTrail Lake"
        caption={`${windowDays}-day activity denominators · aggregates only`}
        autoRefresh
        right={
          <span className="flex items-center gap-3 text-[11px] text-slate-500">
            {data?.store_name && (
              <span className="inline-flex items-center gap-1">
                <Icon name="circle-stack" className="w-3.5 h-3.5 text-slate-400" />
                {data.store_name}
              </span>
            )}
            {typeof data?.mb_scanned === 'number' && (
              <span className="tabular-nums" title="Bytes scanned by the last Lake query">
                {data.mb_scanned.toFixed(1)} MB scanned
              </span>
            )}
          </span>
        }
      />

      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Activity Denominators</h3>
          <LiveDataBadge live={live} source="CloudTrail Lake" detail="Aggregate long-window AI activity from CloudTrail Lake" />
          <span className="text-[10px] text-slate-400">last {windowDays}d</span>
        </div>

        {loading ? (
          <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading…</div>
        ) : hasActivity ? (
          <>
            {/* KPI tiles — total_events is the coverage/rate DENOMINATOR */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="rounded-xl border border-slate-200/60 bg-white p-3">
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Total Events</div>
                <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{totalEvents.toLocaleString()}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">denominator · over {windowDays}d</div>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white p-3">
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Active Days</div>
                <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{data?.active_days ?? 0}<span className="text-sm font-normal text-slate-400">/{windowDays}</span></div>
                <div className="text-[11px] text-slate-400 mt-0.5">days with activity</div>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white p-3">
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Distinct Actions</div>
                <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{data?.distinct_actions ?? 0}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">unique API calls</div>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white p-3">
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Distinct Principals</div>
                <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{data?.distinct_principals ?? 0}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">unique callers</div>
              </div>
            </div>

            {/* By-day trend */}
            {byDay.length > 0 && (
              <div className="rounded-xl border border-slate-200/60 bg-white p-4 mb-4">
                <div className="text-sm font-semibold text-slate-900 mb-3">Daily Activity Trend</div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={byDay}>
                    <defs>
                      <linearGradient id="ctLakeDayGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={fmtDay} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="count" name="events" stroke="#0ea5e9" fill="url(#ctLakeDayGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top-N breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* By action */}
              <div className="rounded-xl border border-slate-200/60 bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="bolt" className="w-4 h-4 text-slate-400" />
                  <h4 className="text-sm font-semibold text-slate-900">Top Actions</h4>
                  <span className="text-[10px] text-slate-400">top {byAction.length}</span>
                </div>
                <div className="space-y-2">
                  {byAction.map((a, i) => (
                    <div key={`${a.event_source}:${a.event_name}:${i}`} className="flex items-center gap-2 text-[12px]">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-800 truncate">{a.event_name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{sourceLabel(a.event_source)}</div>
                      </div>
                      <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.round((a.count / maxActionCount) * 100)}%` }} />
                      </div>
                      <span className="w-14 text-right tabular-nums font-semibold text-slate-700 flex-shrink-0">{a.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* By principal — identities masked */}
              <div className="rounded-xl border border-slate-200/60 bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="users" className="w-4 h-4 text-slate-400" />
                  <h4 className="text-sm font-semibold text-slate-900">Top Principals</h4>
                  <span className="text-[10px] text-slate-400">top {byPrincipal.length} · masked</span>
                </div>
                <div className="space-y-2">
                  {byPrincipal.map((p, i) => (
                    <div key={`${p.principal}:${i}`} className="flex items-center gap-2 text-[12px]">
                      <div className="flex-1 min-w-0 text-slate-600 max-w-[220px]">
                        <MaskedIdentity identity={p.principal} />
                      </div>
                      <span className="w-14 text-right tabular-nums font-semibold text-slate-700 flex-shrink-0">{p.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Honest empty-state — the query ran against a real store but found no
             matching AI activity (or the store/endpoint was unavailable). We show the
             server's own note verbatim rather than claiming coverage we don't have. */
          <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
            <Icon name="information-circle" className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-slate-600">
                {live ? 'No AI activity in window' : 'No long-window AI activity yet'}
              </div>
              <div className="text-[11px] mt-0.5">
                {data?.note ?? `A ${windowDays}-day CloudTrail Lake aggregate over Bedrock/SageMaker/AgentCore activity will appear here once matching events are captured.`}
              </div>
            </div>
          </div>
        )}

        {/* Cost footnote — CloudTrail Lake bills per query by bytes scanned. */}
        {data?.cost_note && (
          <div className="flex items-start gap-1.5 text-[10px] text-slate-400 mt-3 pt-3 border-t border-slate-100">
            <Icon name="currency-dollar" className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
            <span>{data.cost_note}</span>
          </div>
        )}
      </div>
    </div>
  );
}
