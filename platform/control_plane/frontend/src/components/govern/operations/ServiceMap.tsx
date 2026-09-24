/**
 * ServiceMap - Live X-Ray service map & distributed traces for Govern Operations
 *
 * Renders two live views backed by `governXRayApi`:
 *  1. Service graph  — each node's name, type, avg response time, error rate,
 *     throughput, and its downstream edges (dependency service names).
 *  2. Trace summaries — a table of recent traces (shortened id, duration,
 *     HTTP method/status, fault/error/throttle/partial flags, service count).
 *     Clicking a row loads `getTraceDetails([id])` into a side drawer that
 *     renders the segment timing tree as a lightweight Gantt.
 *
 * Data honesty:
 *  - The header LiveDataBadge is gated on the graph/traces `.live` flags; when
 *    neither reports live we show a MockDataBadge instead.
 *  - Live-but-empty windows render an honest empty state ("no traces in the
 *    selected window - X-Ray tracing may not be enabled on these services")
 *    rather than fabricating any numbers.
 *  - Every displayed number comes straight from the API response.
 *
 * Units note (from the backend): `error_rate` is already a percentage and
 * `response_time_avg_ms` is already in milliseconds, while trace-summary
 * `duration`/`response_time` are X-Ray seconds and segment `duration_ms` is ms.
 */

import { useState, useEffect } from 'react';
import { Icon, type IconName } from '../icons';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import {
  governXRayApi,
  type XRayServiceGraphResponse,
  type XRayServiceNode,
  type XRayTraceSummaryResponse,
  type XRayTraceSummary,
  type XRayTraceDetail,
  type XRayTraceSegment,
} from '../../../api/client';

// ─────────────────────────── Constants ───────────────────────────

const HOURS_OPTIONS = [1, 3, 6] as const;
type HoursOption = (typeof HOURS_OPTIONS)[number];

interface TraceFlag {
  key: 'has_fault' | 'has_error' | 'has_throttle';
  label: string;
  icon: IconName;
  color: string;
  bg: string;
}

const TRACE_FLAGS: TraceFlag[] = [
  { key: 'has_fault', label: 'Fault', icon: 'fire', color: 'text-rose-700', bg: 'bg-rose-100' },
  { key: 'has_error', label: 'Error', icon: 'exclamation-triangle', color: 'text-amber-700', bg: 'bg-amber-100' },
  { key: 'has_throttle', label: 'Throttle', icon: 'no-symbol', color: 'text-orange-700', bg: 'bg-orange-100' },
];

// ─────────────────────────── Helpers ───────────────────────────

/** Format a millisecond value (used for X-Ray SummaryStatistics avg response time). */
function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '-';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
}

/** Format a duration expressed in seconds (X-Ray trace/response time is seconds). */
function formatSeconds(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '-';
  if (sec < 1) return `${Math.round(sec * 1000)} ms`;
  return `${sec.toFixed(2)} s`;
}

/** error_rate is already a percentage from the backend. */
function formatErrorRate(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return '-';
  return `${pct.toFixed(1)}%`;
}

function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return n.toLocaleString();
}

/** Shorten an X-Ray trace id (1-<8hex>-<24hex>) while keeping it recognizable. */
function shortTraceId(id: string): string {
  if (id.length <= 18) return id;
  return `${id.slice(0, 12)}…${id.slice(-6)}`;
}

function httpStatusStyle(status: number | null | undefined): string {
  if (status === null || status === undefined) return 'text-slate-500 bg-slate-100';
  if (status >= 500) return 'text-rose-700 bg-rose-100';
  if (status >= 400) return 'text-amber-700 bg-amber-100';
  if (status >= 200 && status < 300) return 'text-emerald-700 bg-emerald-100';
  return 'text-slate-600 bg-slate-100';
}

/** Flatten a recursive segment tree into rows with depth for the Gantt view. */
interface FlatSegment {
  seg: XRayTraceSegment;
  depth: number;
}

function flattenSegments(segments: XRayTraceSegment[], depth = 0, acc: FlatSegment[] = []): FlatSegment[] {
  for (const seg of segments) {
    acc.push({ seg, depth });
    if (seg.subsegments && seg.subsegments.length > 0) {
      flattenSegments(seg.subsegments, depth + 1, acc);
    }
  }
  return acc;
}

/** Resolve a segment's end time in epoch seconds (fall back to start + duration). */
function segmentEnd(seg: XRayTraceSegment): number {
  if (seg.end_time !== null && seg.end_time !== undefined) return seg.end_time;
  if (seg.duration_ms !== null && seg.duration_ms !== undefined) return seg.start_time + seg.duration_ms / 1000;
  return seg.start_time;
}

// ─────────────────────────── Component ───────────────────────────

interface ServiceMapProps {
  /** When embedded in another surface, the large page heading is suppressed. */
  embedded?: boolean;
}

export default function ServiceMap({ embedded = false }: ServiceMapProps) {
  const [hours, setHours] = useState<HoursOption>(1);
  const [graph, setGraph] = useState<XRayServiceGraphResponse | null>(null);
  const [traces, setTraces] = useState<XRayTraceSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Trace detail drawer
  const [selectedTrace, setSelectedTrace] = useState<XRayTraceSummary | null>(null);
  const [traceDetail, setTraceDetail] = useState<XRayTraceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Fetch service graph + trace summaries for the selected window.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      const [graphRes, tracesRes] = await Promise.allSettled([
        governXRayApi.getServiceGraph(hours),
        governXRayApi.getTraceSummaries(hours),
      ]);
      if (cancelled) return;

      setGraph(graphRes.status === 'fulfilled' ? graphRes.value : null);
      setTraces(tracesRes.status === 'fulfilled' ? tracesRes.value : null);

      if (graphRes.status === 'rejected' && tracesRes.status === 'rejected') {
        setError('Unable to reach X-Ray - check credentials and permissions.');
      }
      setLoading(false);
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [hours]);

  // Load segment detail when a trace row is selected.
  useEffect(() => {
    if (!selectedTrace) {
      setTraceDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setTraceDetail(null);

    governXRayApi
      .getTraceDetails([selectedTrace.trace_id])
      .then((details) => {
        if (cancelled) return;
        setTraceDetail(details && details.length > 0 ? details[0] : null);
        setDetailLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDetailError('Unable to load trace segments.');
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTrace]);

  const graphLive = graph?.live ?? false;
  const tracesLive = traces?.live ?? false;
  const isLive = graphLive || tracesLive;
  const source = graph?.source || traces?.source || 'AWS X-Ray';

  const services = graph?.services ?? [];
  const traceRows = traces?.traces ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {!embedded && (
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Service Map &amp; Traces</h1>
          )}
          <p className="text-slate-500 mt-1">
            Distributed tracing for agent operations via AWS X-Ray
          </p>
          <div className="mt-2 flex items-center gap-2">
            {isLive ? (
              <LiveDataBadge source={source} detail={graph?.note || traces?.note || undefined} />
            ) : (
              <MockDataBadge integration={graph?.note || traces?.note || 'Enable AWS X-Ray tracing on agent services'} />
            )}
          </div>
        </div>

        {/* Time window selector */}
        <div className="flex items-center gap-2">
          <Icon name="clock" className="w-4 h-4 text-slate-400" strokeWidth={2} />
          <span className="text-xs text-slate-500">Window:</span>
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
            {HOURS_OPTIONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHours(h)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  hours === h ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary strip - all figures come straight from the trace response */}
      {traces && tracesLive && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryTile label="Services" value={formatCount(services.length)} icon="share" tone="slate" />
          <SummaryTile label="Traces" value={formatCount(traces.total)} icon="signal" tone="indigo" />
          <SummaryTile label="With Faults" value={formatCount(traces.has_faults)} icon="fire" tone="rose" />
          <SummaryTile label="With Errors" value={formatCount(traces.has_errors)} icon="exclamation-triangle" tone="amber" />
        </div>
      )}

      {/* Global fetch error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <Icon name="exclamation-circle" className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}

      {/* ─────────── Service Graph ─────────── */}
      <section className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Icon name="share" className="w-4 h-4 text-slate-500" strokeWidth={2} />
            <span className="text-sm font-semibold text-slate-900">Service Graph</span>
            {graphLive && services.length > 0 && (
              <span className="text-[11px] text-slate-500">{services.length} services</span>
            )}
          </div>
          {graphLive ? (
            <LiveDataBadge source="X-Ray GetServiceGraph" detail={graph?.note || undefined} />
          ) : (
            <MockDataBadge integration={graph?.note || 'Connect AWS X-Ray (GetServiceGraph)'} />
          )}
        </div>

        {loading ? (
          <div className="px-4 py-8 text-sm text-slate-400">Loading service graph...</div>
        ) : !graphLive ? (
          <div className="px-4 py-8 text-sm text-slate-500">
            {graph?.note || 'X-Ray service graph is unavailable - check credentials and permissions.'}
          </div>
        ) : services.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-500">
            No services reported by X-Ray in the selected window - X-Ray tracing may not be enabled on these services.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {services.map((node) => (
              <ServiceNodeCard key={`${node.name}-${node.type}`} node={node} />
            ))}
          </div>
        )}
      </section>

      {/* ─────────── Trace Summaries ─────────── */}
      <section className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Icon name="signal" className="w-4 h-4 text-slate-500" strokeWidth={2} />
            <span className="text-sm font-semibold text-slate-900">Recent Traces</span>
            {tracesLive && traceRows.length > 0 && (
              <span className="text-[11px] text-slate-500">showing {traceRows.length} of {traces?.total ?? traceRows.length}</span>
            )}
          </div>
          {tracesLive ? (
            <LiveDataBadge source="X-Ray GetTraceSummaries" detail={traces?.note || undefined} />
          ) : (
            <MockDataBadge integration={traces?.note || 'Connect AWS X-Ray (GetTraceSummaries)'} />
          )}
        </div>

        {loading ? (
          <div className="px-4 py-8 text-sm text-slate-400">Loading traces...</div>
        ) : !tracesLive ? (
          <div className="px-4 py-8 text-sm text-slate-500">
            {traces?.note || 'X-Ray traces are unavailable - check credentials and permissions.'}
          </div>
        ) : traceRows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-500">
            No traces in the selected window - X-Ray tracing may not be enabled on these services.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Trace ID</th>
                  <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Duration</th>
                  <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Method</th>
                  <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Status</th>
                  <th className="text-left py-2.5 px-4 font-semibold text-slate-700">Flags</th>
                  <th className="text-center py-2.5 px-4 font-semibold text-slate-700">Services</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-slate-700"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {traceRows.map((trace) => {
                  const isSelected = selectedTrace?.trace_id === trace.trace_id;
                  return (
                    <tr
                      key={trace.trace_id}
                      onClick={() => setSelectedTrace(trace)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50/50'}`}
                    >
                      <td className="py-2.5 px-4">
                        <span className="font-mono text-slate-700" title={trace.trace_id}>
                          {shortTraceId(trace.trace_id)}
                        </span>
                        {trace.is_partial && (
                          <span
                            className="ml-2 inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium bg-slate-100 text-slate-500"
                            title="Trace is still being collected (partial)"
                          >
                            <Icon name="information-circle" className="w-3 h-3" strokeWidth={2} />
                            Partial
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{formatSeconds(trace.duration)}</td>
                      <td className="py-2.5 px-4 text-slate-600">{trace.http_method || '-'}</td>
                      <td className="py-2.5 px-4">
                        {trace.http_status !== null && trace.http_status !== undefined ? (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${httpStatusStyle(trace.http_status)}`}>
                            {trace.http_status}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1">
                          {TRACE_FLAGS.filter((f) => trace[f.key]).map((f) => (
                            <span
                              key={f.key}
                              className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium ${f.bg} ${f.color}`}
                            >
                              <Icon name={f.icon} className="w-3 h-3" strokeWidth={2} />
                              {f.label}
                            </span>
                          ))}
                          {!trace.has_fault && !trace.has_error && !trace.has_throttle && (
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700">
                              <Icon name="check" className="w-3 h-3" strokeWidth={2} />
                              OK
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className="text-slate-600"
                          title={trace.service_ids.length > 0 ? trace.service_ids.join('\n') : 'No services on this trace'}
                        >
                          {trace.service_ids.length}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <Icon name="chevron-right" className="w-4 h-4 text-slate-300 inline" strokeWidth={2} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─────────── Trace Detail Drawer ─────────── */}
      {selectedTrace && (
        <TraceDetailDrawer
          trace={selectedTrace}
          detail={traceDetail}
          loading={detailLoading}
          error={detailError}
          onClose={() => setSelectedTrace(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── Service Node Card ───────────────────────────

function ServiceNodeCard({ node }: { node: XRayServiceNode }) {
  const errorRate = node.error_rate ?? null;
  const errorTone =
    errorRate === null ? 'text-slate-600' : errorRate >= 5 ? 'text-rose-600' : errorRate > 0 ? 'text-amber-600' : 'text-emerald-600';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Icon name="cpu-chip" className="w-4 h-4 text-slate-600" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate" title={node.name}>
              {node.name}
            </div>
            <div className="text-[10px] text-slate-400 truncate">{node.type || 'unknown'}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center rounded-lg bg-slate-50 py-2">
          <div className="text-sm font-bold text-slate-700">{formatMs(node.response_time_avg_ms)}</div>
          <div className="text-[9px] text-slate-400">Avg RT</div>
        </div>
        <div className="text-center rounded-lg bg-slate-50 py-2">
          <div className={`text-sm font-bold ${errorTone}`}>{formatErrorRate(errorRate)}</div>
          <div className="text-[9px] text-slate-400">Error Rate</div>
        </div>
        <div className="text-center rounded-lg bg-slate-50 py-2">
          <div className="text-sm font-bold text-slate-700">{formatCount(node.throughput)}</div>
          <div className="text-[9px] text-slate-400">Throughput</div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 mb-1.5">
          <Icon name="arrows-right-left" className="w-3.5 h-3.5" strokeWidth={2} />
          Downstream ({node.edges.length})
        </div>
        {node.edges.length === 0 ? (
          <div className="text-[10px] text-slate-400 italic">No downstream dependencies</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {node.edges.map((edge) => (
              <span
                key={edge}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100"
                title={edge}
              >
                <Icon name="arrow-right" className="w-3 h-3" strokeWidth={2} />
                <span className="max-w-[10rem] truncate">{edge}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Summary Tile ───────────────────────────

const TILE_TONES: Record<string, { bg: string; text: string }> = {
  slate: { bg: 'bg-slate-100', text: 'text-slate-600' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  rose: { bg: 'bg-rose-100', text: 'text-rose-600' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
};

function SummaryTile({ label, value, icon, tone }: { label: string; value: string; icon: IconName; tone: string }) {
  const t = TILE_TONES[tone] || TILE_TONES.slate;
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg ${t.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon name={icon} className={`w-4 h-4 ${t.text}`} strokeWidth={2} />
      </div>
      <div>
        <div className="text-lg font-bold text-slate-800 leading-tight">{value}</div>
        <div className="text-[10px] text-slate-500">{label}</div>
      </div>
    </div>
  );
}

// ─────────────────────────── Trace Detail Drawer ───────────────────────────

interface TraceDetailDrawerProps {
  trace: XRayTraceSummary;
  detail: XRayTraceDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function TraceDetailDrawer({ trace, detail, loading, error, onClose }: TraceDetailDrawerProps) {
  const flat = detail ? flattenSegments(detail.segments) : [];

  // Compute the trace window for the Gantt bars from real segment timings.
  let traceStart = Number.POSITIVE_INFINITY;
  let traceEnd = Number.NEGATIVE_INFINITY;
  for (const { seg } of flat) {
    traceStart = Math.min(traceStart, seg.start_time);
    traceEnd = Math.max(traceEnd, segmentEnd(seg));
  }
  const span = traceEnd - traceStart;
  const hasSpan = Number.isFinite(span) && span > 0;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px]" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-2xl h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Icon name="signal" className="w-4 h-4 text-indigo-500" strokeWidth={2} />
              <span className="text-sm font-semibold text-slate-900">Trace Detail</span>
              {detail?.live && <LiveDataBadge source="X-Ray BatchGetTraces" detail={detail?.note || undefined} />}
            </div>
            <div className="font-mono text-[11px] text-slate-500 break-all" title={trace.trace_id}>
              {trace.trace_id}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
            title="Close"
          >
            <Icon name="x-mark" className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        {/* Meta */}
        <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[10px] text-slate-400">Total Duration</div>
            <div className="font-medium text-slate-700">
              {detail?.duration_ms !== null && detail?.duration_ms !== undefined
                ? formatMs(detail.duration_ms)
                : formatSeconds(trace.duration)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">HTTP</div>
            <div className="font-medium text-slate-700">
              {[trace.http_method, trace.http_status].filter((v) => v !== null && v !== undefined && v !== '').join(' ') || '-'}
            </div>
          </div>
          {trace.http_url && (
            <div className="col-span-2">
              <div className="text-[10px] text-slate-400">URL</div>
              <div className="font-medium text-slate-700 break-all">{trace.http_url}</div>
            </div>
          )}
          {trace.users.length > 0 && (
            <div className="col-span-2">
              <div className="text-[10px] text-slate-400">Users</div>
              <div className="font-medium text-slate-700">{trace.users.join(', ')}</div>
            </div>
          )}
        </div>

        {/* Flags */}
        <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-2">
          {TRACE_FLAGS.filter((f) => trace[f.key]).map((f) => (
            <span key={f.key} className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium ${f.bg} ${f.color}`}>
              <Icon name={f.icon} className="w-3 h-3" strokeWidth={2} />
              {f.label}
            </span>
          ))}
          {!trace.has_fault && !trace.has_error && !trace.has_throttle && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700">
              <Icon name="check" className="w-3 h-3" strokeWidth={2} />
              OK
            </span>
          )}
          {trace.is_partial && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium bg-slate-100 text-slate-500">
              <Icon name="information-circle" className="w-3 h-3" strokeWidth={2} />
              Partial
            </span>
          )}
        </div>

        {/* Segments */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="text-xs font-semibold text-slate-700 mb-3">Segment Timeline</div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Icon name="spinner" className="w-4 h-4 animate-spin" strokeWidth={2} />
              Loading segments...
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 text-sm text-rose-600">
              <Icon name="exclamation-circle" className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={2} />
              {error}
            </div>
          ) : !detail || flat.length === 0 ? (
            <div className="text-sm text-slate-500">
              {detail?.note || 'No segment data available for this trace.'}
            </div>
          ) : (
            <div className="space-y-1.5">
              {flat.map(({ seg, depth }) => {
                const offsetPct = hasSpan ? ((seg.start_time - traceStart) / span) * 100 : 0;
                const widthPct = hasSpan ? Math.max((segmentEnd(seg) - seg.start_time) / span * 100, 0.5) : 100;
                const barColor = seg.fault ? 'bg-rose-500' : seg.error ? 'bg-amber-500' : 'bg-indigo-400';
                return (
                  <div key={seg.id} className="text-[11px]">
                    <div className="flex items-center justify-between mb-0.5" style={{ paddingLeft: `${depth * 14}px` }}>
                      <span className="flex items-center gap-1 text-slate-700 min-w-0">
                        {depth > 0 && <Icon name="arrow-right" className="w-3 h-3 text-slate-300 flex-shrink-0" strokeWidth={2} />}
                        <span className="truncate" title={seg.name}>{seg.name}</span>
                        {seg.fault && <Icon name="fire" className="w-3 h-3 text-rose-500 flex-shrink-0" strokeWidth={2} />}
                        {seg.error && !seg.fault && (
                          <Icon name="exclamation-triangle" className="w-3 h-3 text-amber-500 flex-shrink-0" strokeWidth={2} />
                        )}
                      </span>
                      <span className="text-slate-400 flex-shrink-0 ml-2">{formatMs(seg.duration_ms)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden" style={{ marginLeft: `${depth * 14}px` }}>
                      <div
                        className={`h-full ${barColor} rounded-full`}
                        style={{ marginLeft: `${offsetPct}%`, width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
