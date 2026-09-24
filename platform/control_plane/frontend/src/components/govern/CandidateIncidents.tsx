/**
 * CandidateIncidents — surfaces CloudTrail AI-service errors as candidate incidents.
 *
 * Errored Bedrock + SageMaker API calls (AccessDenied, Throttling, ValidationException, etc.)
 * are candidate incidents requiring review. Not confirmed incidents — honest framing:
 * errors != incidents, but errors warrant investigation.
 */
import { useEffect, useState } from 'react';
import { governTrailApi, type AwsTrailResponse } from '../../api/client';
import { LiveDataBadge } from './DataSourceIndicator';
import LiveHeader from './LiveHeader';
import { usePollingKey } from './usePollingKey';
import MaskedIdentity from './MaskedIdentity';
import { Icon } from './icons';
import { useDataSources } from './DataSourceContext';

type ErrorCategory = 'access' | 'throttle' | 'validation' | 'notfound' | 'service' | 'other';
type IncidentStatus = 'pending' | 'acknowledged' | 'escalated' | 'dismissed';

interface CategorizedError {
  category: ErrorCategory;
  label: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  color: string;
  bgColor: string;
}

const categorizeError = (errorCode: string): CategorizedError => {
  const code = errorCode.toLowerCase();

  if (code.includes('accessdenied') || code.includes('unauthorized') || code.includes('forbidden')) {
    return { category: 'access', label: 'Access Denied', severity: 'high', color: 'text-rose-700', bgColor: 'bg-rose-100' };
  }
  if (code.includes('throttl') || code.includes('ratelimit') || code.includes('toomanyrequests')) {
    return { category: 'throttle', label: 'Throttled', severity: 'medium', color: 'text-amber-700', bgColor: 'bg-amber-100' };
  }
  if (code.includes('validation') || code.includes('invalid') || code.includes('malformed')) {
    return { category: 'validation', label: 'Validation Error', severity: 'low', color: 'text-slate-700', bgColor: 'bg-slate-100' };
  }
  if (code.includes('notfound') || code.includes('doesnotexist') || code.includes('nosuch')) {
    return { category: 'notfound', label: 'Not Found', severity: 'low', color: 'text-slate-700', bgColor: 'bg-slate-100' };
  }
  if (code.includes('service') || code.includes('internal') || code.includes('unavailable')) {
    return { category: 'service', label: 'Service Error', severity: 'medium', color: 'text-orange-700', bgColor: 'bg-orange-100' };
  }
  return { category: 'other', label: 'Error', severity: 'medium', color: 'text-slate-700', bgColor: 'bg-slate-100' };
};

const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const severityBg: Record<string, string> = {
  critical: 'bg-rose-200 text-rose-900',
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

export default function CandidateIncidents() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsTrailResponse | null>(null);
  const [incidentStatus, setIncidentStatus] = useState<Record<string, IncidentStatus>>({});
  const [showDismissed, setShowDismissed] = useState(false);
  const pollKey = usePollingKey(60_000);
  const { updateSource } = useDataSources();

  const setStatus = (eventId: string, status: IncidentStatus) => {
    setIncidentStatus(prev => ({ ...prev, [eventId]: status }));
  };

  const getStatus = (eventId: string): IncidentStatus => incidentStatus[eventId] ?? 'pending';

  useEffect(() => {
    let cancelled = false;
    governTrailApi.aiActivity(72) // 72h window for incidents — longer lookback
      .then(d => {
        if (!cancelled) {
          setData(d);
          if (d?.live) {
            updateSource('aws-cloudtrail', { status: 'live', lastFetch: Date.now() });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          updateSource('aws-cloudtrail', { status: 'error', error: 'API unavailable' });
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey, updateSource]);

  const live = !!data?.live;
  const erroredEvents = (data?.events ?? []).filter(e => e.error_code);

  // Enrich with category and sort by severity then time
  const enriched = erroredEvents.map(e => ({
    ...e,
    ...categorizeError(e.error_code!),
  })).sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (b.event_time ?? '').localeCompare(a.event_time ?? '');
  });

  // Aggregate by category
  const byCategory = enriched.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1;
    return acc;
  }, {} as Record<ErrorCategory, number>);

  const fmtTime = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  const sourceLabel = (s: string) => s.replace('.amazonaws.com', '');

  // Count by severity
  const bySeverity = enriched.reduce((acc, e) => {
    acc[e.severity] = (acc[e.severity] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Count by workflow status
  const statusCounts = enriched.reduce((acc, e) => {
    const status = getStatus(e.event_id);
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {} as Record<IncidentStatus, number>);

  // Filter dismissed if not showing
  const filteredEnriched = showDismissed
    ? enriched
    : enriched.filter(e => getStatus(e.event_id) !== 'dismissed');

  // Row styling based on status
  const getRowClasses = (eventId: string, baseClasses: string): string => {
    const status = getStatus(eventId);
    switch (status) {
      case 'acknowledged':
        return `${baseClasses} bg-emerald-50/60`;
      case 'escalated':
        return `${baseClasses} bg-amber-50/60`;
      case 'dismissed':
        return `${baseClasses} bg-slate-100/60 opacity-60`;
      default:
        return baseClasses;
    }
  };

  if (loading) {
    return (
      <div className="mb-6 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/50 via-white to-white p-4 shadow-sm">
        <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading candidate incidents...</div>
      </div>
    );
  }

  if (!live || enriched.length === 0) {
    return null; // Don't render if no errors or not live
  }

  return (
    <div className="mb-6 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/50 via-white to-white p-4 shadow-sm">
      <LiveHeader
        live={live}
        label="Candidate Incidents"
        caption="AI-service errors from CloudTrail requiring review"
        autoRefresh
        right={
          <span className="flex items-center gap-3 text-[11px]">
            {bySeverity.high > 0 && <span className="text-rose-600 font-semibold">{bySeverity.high} high</span>}
            {bySeverity.medium > 0 && <span className="text-amber-600 font-semibold">{bySeverity.medium} medium</span>}
            {bySeverity.low > 0 && <span className="text-slate-500">{bySeverity.low} low</span>}
            <span className="border-l border-slate-300 pl-3 flex items-center gap-2">
              {(statusCounts.acknowledged ?? 0) > 0 && (
                <span className="text-emerald-600 font-semibold">{statusCounts.acknowledged} acknowledged</span>
              )}
              {(statusCounts.escalated ?? 0) > 0 && (
                <span className="text-amber-600 font-semibold">{statusCounts.escalated} escalated</span>
              )}
              {(statusCounts.dismissed ?? 0) > 0 && (
                <span className="text-slate-500">{statusCounts.dismissed} dismissed</span>
              )}
            </span>
          </span>
        }
      />

      {/* Honest framing banner */}
      <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3 border border-amber-200/60">
        <Icon name="exclamation-triangle" className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-medium">Signal, not verdict</span> — errored API calls warrant investigation but are not confirmed incidents.
          Access denied may be expected (least privilege), throttling may be transient, validation errors may be client bugs.
        </div>
      </div>

      {/* Category breakdown pills */}
      <div className="flex flex-wrap gap-2 mb-3">
        {byCategory.access > 0 && (
          <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-rose-100 text-rose-700">
            {byCategory.access} Access Denied
          </span>
        )}
        {byCategory.throttle > 0 && (
          <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">
            {byCategory.throttle} Throttled
          </span>
        )}
        {byCategory.service > 0 && (
          <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-orange-100 text-orange-700">
            {byCategory.service} Service Error
          </span>
        )}
        {byCategory.validation > 0 && (
          <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-700">
            {byCategory.validation} Validation
          </span>
        )}
        {byCategory.notfound > 0 && (
          <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-700">
            {byCategory.notfound} Not Found
          </span>
        )}
        {byCategory.other > 0 && (
          <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-700">
            {byCategory.other} Other
          </span>
        )}
      </div>

      {/* Error events table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-slate-900">Errored AI Calls</h3>
            {live && <LiveDataBadge />}
            <span className="text-[10px] text-slate-400">last 72h</span>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDismissed}
              onChange={e => setShowDismissed(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-slate-600 focus:ring-slate-500"
            />
            Show dismissed
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                <th scope="col" className="font-medium pb-2">Severity</th>
                <th scope="col" className="font-medium pb-2">Event</th>
                <th scope="col" className="font-medium pb-2">Error</th>
                <th scope="col" className="font-medium pb-2">Identity</th>
                <th scope="col" className="font-medium pb-2">Source</th>
                <th scope="col" className="font-medium pb-2">When</th>
                <th scope="col" className="font-medium pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEnriched.slice(0, 15).map((e, i) => {
                const eventId = e.event_id || `idx-${i}`;
                const status = getStatus(eventId);
                return (
                  <tr key={eventId} className={getRowClasses(eventId, i > 0 ? 'border-t border-slate-100' : '')}>
                    <td className="py-2 pr-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${severityBg[e.severity]}`}>
                        {e.severity}
                      </span>
                    </td>
                    <td className="py-2 pr-2 font-medium text-slate-800">{e.event_name}</td>
                    <td className="py-2 pr-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${e.bgColor} ${e.color}`}>
                        {e.error_code}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-slate-500 max-w-[180px]">
                      {e.username ? <MaskedIdentity identity={e.username} /> : '—'}
                    </td>
                    <td className="py-2 pr-2 text-slate-500">{sourceLabel(e.event_source)}</td>
                    <td className="py-2 pr-2 text-slate-500 whitespace-nowrap">{fmtTime(e.event_time)}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setStatus(eventId, status === 'acknowledged' ? 'pending' : 'acknowledged')}
                          title="Acknowledge"
                          className={`p-1 rounded transition-colors ${
                            status === 'acknowledged'
                              ? 'bg-emerald-200 text-emerald-700'
                              : 'hover:bg-emerald-100 text-slate-400 hover:text-emerald-600'
                          }`}
                        >
                          <Icon name="check" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setStatus(eventId, status === 'escalated' ? 'pending' : 'escalated')}
                          title="Escalate"
                          className={`p-1 rounded transition-colors ${
                            status === 'escalated'
                              ? 'bg-amber-200 text-amber-700'
                              : 'hover:bg-amber-100 text-slate-400 hover:text-amber-600'
                          }`}
                        >
                          <Icon name="arrow-up" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setStatus(eventId, status === 'dismissed' ? 'pending' : 'dismissed')}
                          title="Dismiss"
                          className={`p-1 rounded transition-colors ${
                            status === 'dismissed'
                              ? 'bg-slate-300 text-slate-600'
                              : 'hover:bg-slate-200 text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          <Icon name="x-mark" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredEnriched.length > 15 && (
          <div className="text-center text-[11px] text-slate-400 pt-3 border-t border-slate-100 mt-2">
            Showing 15 of {filteredEnriched.length} candidate incidents
            {!showDismissed && (statusCounts.dismissed ?? 0) > 0 && (
              <span className="ml-1">({statusCounts.dismissed} dismissed hidden)</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
