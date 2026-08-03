import { useState, useEffect } from 'react';
import { policiesApi } from '../../api/client';
import type { PolicyObservabilityEvent } from '../../api/client';

export default function PolicyAuditLog() {
  const [events, setEvents] = useState<PolicyObservabilityEvent[]>([]);
  const [metrics, setMetrics] = useState({ deny_count: 0, allow_count: 0, invocations: 0, errors: 0 });
  const [loading, setLoading] = useState(true);
  const [filterDecision, setFilterDecision] = useState<'all' | 'ALLOW' | 'DENY'>('all');
  const [hours, setHours] = useState(24);

  useEffect(() => {
    fetchObservability();
  }, [hours]);

  const fetchObservability = async () => {
    setLoading(true);
    try {
      const data = await policiesApi.getObservability(hours, 100);
      setEvents(data.events);
      setMetrics(data.metrics);
    } catch (e) {
      console.error('Failed to fetch observability data:', e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filterDecision === 'all' ? events : events.filter(e => e.decision === filterDecision);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200">
          <p className="text-2xl font-bold text-slate-900">{metrics.invocations}</p>
          <p className="text-xs text-slate-500 font-medium mt-1">Gateway Invocations</p>
        </div>
        <div className="card bg-gradient-to-br from-green-50 to-green-100/50 border-green-200/60">
          <p className="text-2xl font-bold text-green-700">{metrics.allow_count}</p>
          <p className="text-xs text-green-600 font-medium mt-1">Allow Decisions</p>
        </div>
        <div className="card bg-gradient-to-br from-red-50 to-red-100/50 border-red-200/60">
          <p className="text-2xl font-bold text-red-700">{metrics.deny_count}</p>
          <p className="text-xs text-red-600 font-medium mt-1">Deny Decisions</p>
          {metrics.deny_count > 0 && (
            <p className="text-[10px] text-red-400 mt-0.5">LOG_ONLY — not blocking</p>
          )}
        </div>
        <div className="card bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200/60">
          <p className="text-2xl font-bold text-amber-700">{metrics.errors}</p>
          <p className="text-xs text-amber-600 font-medium mt-1">Errors</p>
        </div>
      </div>

      {/* Filter + Time range */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
          {(['all', 'ALLOW', 'DENY'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterDecision(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filterDecision === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f === 'all' ? 'All' : f === 'ALLOW' ? 'Allowed' : 'Denied'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-md px-2 py-1.5 text-slate-600 bg-white"
          >
            <option value={1}>Last 1 hour</option>
            <option value={6}>Last 6 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={72}>Last 3 days</option>
            <option value={168}>Last 7 days</option>
          </select>
          <button
            onClick={fetchObservability}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        </div>
      </div>

      {/* Event timeline or empty state */}
      {filtered.length === 0 && metrics.invocations === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <svg className="w-12 h-12 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">No policy events yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Policy evaluation events will appear here once agents make tool calls through the gateway.
            Spans are streamed from AgentCore via CloudWatch Transaction Search.
          </p>
        </div>
      ) : filtered.length === 0 && metrics.invocations > 0 ? (
        <div className="text-center py-10 border border-slate-200 rounded-xl bg-slate-50/50">
          <p className="text-sm text-slate-600">
            <span className="font-semibold">{metrics.invocations}</span> gateway invocations recorded.
            Per-request spans will appear once Transaction Search finishes activating.
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Aggregate metrics (allow/deny counts) are shown above from CloudWatch.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((event, idx) => (
            <div key={event.id || idx} className={`card p-4 border-l-4 ${
              event.decision === 'DENY' ? 'border-l-red-400' :
              event.decision === 'ALLOW' ? 'border-l-green-400' :
              'border-l-slate-300'
            } hover:shadow-sm transition-all`}>
              <div className="flex items-start gap-3">
                {/* Decision icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {event.decision === 'DENY' ? (
                    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                      event.decision === 'DENY' ? 'bg-red-100 text-red-700 border-red-200' :
                      event.decision === 'ALLOW' ? 'bg-green-100 text-green-700 border-green-200' :
                      'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {event.decision}
                    </span>
                    {event.span_name && (
                      <span className="text-xs font-medium text-slate-700">{event.span_name}</span>
                    )}
                    {event.determining_policies && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs text-indigo-500 font-mono">{event.determining_policies}</span>
                      </>
                    )}
                    {event.mode && (
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                        event.mode === 'ENFORCE' ? 'bg-red-500 text-white' : 'bg-slate-400 text-white'
                      }`}>{event.mode}</span>
                    )}
                    {event.count && event.count > 1 && (
                      <span className="ml-auto text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">×{event.count}</span>
                    )}
                  </div>
                  {event.reason && (
                    <p className="text-xs text-slate-600 leading-relaxed">{event.reason}</p>
                  )}
                  {event.denied_tools && (
                    <p className="text-xs text-red-600 mt-1">Denied tools: <span className="font-mono">{event.denied_tools}</span></p>
                  )}
                  {event.allowed_tools && (
                    <p className="text-xs text-green-600 mt-1">Allowed tools: <span className="font-mono">{event.allowed_tools}</span></p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                    <span>{formatDate(event.timestamp)} at {formatTime(event.timestamp)}</span>
                    {event.gateway_id && (
                      <>
                        <span>·</span>
                        <span>Gateway: <span className="font-mono text-slate-500">{event.gateway_id}</span></span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
