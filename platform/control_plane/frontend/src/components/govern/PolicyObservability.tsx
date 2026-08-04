/**
 * PolicyObservability — Cedar policy enforcement decisions and audit trail for Govern.
 *
 * Integrates the Secure module's Cedar policy engine observability into Govern views:
 * - Recent policy decisions (ALLOW/DENY with context)
 * - Policy audit events (changes, who made them)
 * - Metrics summary (allow/deny/invocation counts)
 *
 * Data source: policiesApi.getObservability() + policiesApi.getAllAudit()
 * Uses LiveDataBadge when showing real data; graceful fallback when offline.
 */
import { useEffect, useState } from 'react';
import { policiesApi, type PolicyObservabilityResponse, type PolicyAuditEvent } from '../../api/client';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import LiveHeader from './LiveHeader';
import { Icon } from './icons';
import { usePollingKey } from './usePollingKey';

type DataSource = 'loading' | 'live' | 'demo';

const decisionMeta: Record<string, { label: string; color: string; bgColor: string; dot: string }> = {
  ALLOW: { label: 'Allow', color: '#10b981', bgColor: 'bg-emerald-50 text-emerald-700', dot: '#10b981' },
  DENY: { label: 'Deny', color: '#ef4444', bgColor: 'bg-rose-50 text-rose-700', dot: '#ef4444' },
  UNKNOWN: { label: 'Unknown', color: '#6b7280', bgColor: 'bg-slate-100 text-slate-600', dot: '#6b7280' },
};

const fmtTime = (iso?: string | null) => {
  if (!iso) return '--';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
};

const fmtTimeShort = (iso?: string | null) => {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

interface PolicyObservabilityProps {
  /** If true, display in a compact card format suitable for embedding */
  compact?: boolean;
  /** Number of hours to query */
  hours?: number;
  /** Maximum events to display */
  maxEvents?: number;
}

export default function PolicyObservability({ compact = false, hours = 24, maxEvents = 10 }: PolicyObservabilityProps) {
  const [source, setSource] = useState<DataSource>('loading');
  const [observability, setObservability] = useState<PolicyObservabilityResponse | null>(null);
  const [auditEvents, setAuditEvents] = useState<PolicyAuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'decisions' | 'audit'>('decisions');

  const pollKey = usePollingKey(60_000);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const [obsData, auditData] = await Promise.all([
          policiesApi.getObservability(hours, maxEvents * 2),
          policiesApi.getAllAudit(undefined, maxEvents),
        ]);
        if (!cancelled) {
          setObservability(obsData);
          setAuditEvents(auditData);
          setSource('live');
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setSource('demo');
          setError('Policy observability unavailable');
          // Keep any existing data for display
        }
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [pollKey, hours, maxEvents]);

  const live = source === 'live';
  const events = observability?.events ?? [];
  const metrics = observability?.metrics ?? { deny_count: 0, allow_count: 0, invocations: 0, errors: 0 };

  if (compact) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <Icon name="shield-check" className="w-4 h-4 text-blue-600" strokeWidth={2} />
          <h3 className="text-sm font-semibold text-slate-900">Cedar Policy Decisions</h3>
          {live && <LiveDataBadge source="Cedar" />}
          {source === 'demo' && <MockDataBadge integration="Policy Engine" />}
        </div>

        {source === 'loading' ? (
          <div className="h-16 flex items-center justify-center text-xs text-slate-400">Loading...</div>
        ) : events.length > 0 ? (
          <div className="space-y-2">
            {events.slice(0, 5).map((evt, i) => {
              const meta = decisionMeta[evt.decision] || decisionMeta.UNKNOWN;
              return (
                <div key={evt.id || i} className="flex items-center gap-2 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.dot }} />
                  <span className={`px-1.5 py-0.5 rounded font-semibold ${meta.bgColor}`}>{meta.label}</span>
                  <span className="text-slate-600 truncate flex-1">{evt.span_name || evt.reason}</span>
                  <span className="text-slate-400 whitespace-nowrap">{fmtTimeShort(evt.timestamp)}</span>
                </div>
              );
            })}
            <div className="pt-2 border-t border-slate-100 flex justify-between text-[10px]">
              <span className="text-emerald-600">{metrics.allow_count} allowed</span>
              <span className="text-rose-600">{metrics.deny_count} denied</span>
              <span className="text-slate-400">{metrics.invocations} total</span>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            {live ? 'No recent policy decisions' : (error || 'Policy engine unavailable')}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50/50 via-white to-white p-4 shadow-sm">
      <LiveHeader
        live={live}
        label="Cedar Policy Observability"
        caption={`policy enforcement decisions from AgentCore · last ${hours}h`}
        autoRefresh
        right={live && metrics ? (
          <span className="flex items-center gap-3 text-[11px]">
            <span className="text-emerald-600"><span className="font-semibold tabular-nums">{metrics.allow_count}</span> allowed</span>
            <span className="text-rose-600"><span className="font-semibold tabular-nums">{metrics.deny_count}</span> denied</span>
            <span className="text-slate-500"><span className="font-semibold tabular-nums">{metrics.invocations}</span> invocations</span>
            {metrics.errors > 0 && <span className="text-amber-600 font-medium">{metrics.errors} errors</span>}
          </span>
        ) : undefined}
      />

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-4 w-fit" role="tablist">
        {(['decisions', 'audit'] as const).map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            {tab === 'decisions' ? 'Enforcement Decisions' : 'Audit Trail'}
          </button>
        ))}
      </div>

      {/* Decisions panel */}
      {activeTab === 'decisions' && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <h4 className="text-sm font-semibold text-slate-900">Recent Policy Decisions</h4>
            {live && <LiveDataBadge source="Cedar Policy Engine" />}
            {source === 'demo' && <MockDataBadge integration="AgentCore Policy Engine" />}
          </div>

          {source === 'loading' ? (
            <div className="h-24 flex items-center justify-center text-xs text-slate-400">Loading...</div>
          ) : events.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                    <th scope="col" className="font-medium pb-2 w-20">Decision</th>
                    <th scope="col" className="font-medium pb-2">Reason</th>
                    <th scope="col" className="font-medium pb-2">Policy</th>
                    <th scope="col" className="font-medium pb-2">Gateway</th>
                    <th scope="col" className="font-medium pb-2">When</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, maxEvents).map((evt, i) => {
                    const meta = decisionMeta[evt.decision] || decisionMeta.UNKNOWN;
                    return (
                      <tr key={evt.id || i} className={i > 0 ? 'border-t border-slate-100' : ''}>
                        <td className="py-2 pr-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${meta.bgColor}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-2 pr-2 text-slate-700 max-w-[300px] truncate" title={evt.reason}>
                          {evt.reason || evt.span_name || '--'}
                        </td>
                        <td className="py-2 pr-2 text-slate-500 font-mono text-[10px] max-w-[150px] truncate">
                          {evt.determining_policies || '--'}
                        </td>
                        <td className="py-2 pr-2 text-slate-500">
                          {evt.gateway_id || '--'}
                        </td>
                        <td className="py-2 text-slate-500 whitespace-nowrap">
                          {fmtTime(evt.timestamp)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
              <span className="text-amber-500 mt-0.5"><Icon name="exclamation-triangle" className="w-4 h-4" /></span>
              <div>
                <div className="font-medium text-slate-600">{live ? 'No recent policy decisions' : 'Policy engine unavailable'}</div>
                <div className="text-[11px] mt-0.5">
                  {live
                    ? 'Cedar policy enforcement decisions will appear here when agents make tool/resource requests.'
                    : (error || 'Connect the AgentCore policy engine to see live enforcement data.')}
                </div>
              </div>
            </div>
          )}

          {/* Tools summary */}
          {live && events.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">Tool Access Summary</div>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const allowedTools = new Set<string>();
                  const deniedTools = new Set<string>();
                  events.forEach(evt => {
                    if (evt.allowed_tools) evt.allowed_tools.split(',').forEach(t => allowedTools.add(t.trim()));
                    if (evt.denied_tools) evt.denied_tools.split(',').forEach(t => deniedTools.add(t.trim()));
                  });
                  return (
                    <>
                      {Array.from(allowedTools).slice(0, 5).map(tool => (
                        <span key={`allow-${tool}`} className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Icon name="check" className="w-3 h-3 inline mr-1" />{tool}
                        </span>
                      ))}
                      {Array.from(deniedTools).slice(0, 5).map(tool => (
                        <span key={`deny-${tool}`} className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                          <Icon name="no-symbol" className="w-3 h-3 inline mr-1" />{tool}
                        </span>
                      ))}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audit trail panel */}
      {activeTab === 'audit' && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <h4 className="text-sm font-semibold text-slate-900">Policy Change Audit Trail</h4>
            {live && <LiveDataBadge source="Policy API" />}
            {source === 'demo' && <MockDataBadge integration="AgentCore Policy API" />}
          </div>

          {source === 'loading' ? (
            <div className="h-24 flex items-center justify-center text-xs text-slate-400">Loading...</div>
          ) : auditEvents.length > 0 ? (
            <div className="space-y-2">
              {auditEvents.slice(0, maxEvents).map((evt, i) => {
                const actionColor = evt.action_taken === 'enforced' ? 'text-rose-600 bg-rose-50 border-rose-200' : 'text-amber-600 bg-amber-50 border-amber-200';
                return (
                  <div
                    key={evt.event_id || i}
                    className="flex items-start gap-3 p-3 rounded-lg bg-slate-50/80 border border-slate-100 hover:bg-slate-50 transition"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <Icon name="document-check" className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">{evt.policy_name}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase ${actionColor}`}>
                          {evt.action_taken}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {evt.rule_type}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1 truncate" title={evt.details}>
                        {evt.details || evt.target}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                        <span><Icon name="user" className="w-3 h-3 inline mr-1" />{evt.caller || 'system'}</span>
                        <span><Icon name="calendar" className="w-3 h-3 inline mr-1" />{fmtTime(evt.timestamp)}</span>
                        <span className="font-mono">{evt.resource_id}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
              <span className="text-blue-500 mt-0.5"><Icon name="information-circle" className="w-4 h-4" /></span>
              <div>
                <div className="font-medium text-slate-600">{live ? 'No recent policy changes' : 'Policy audit unavailable'}</div>
                <div className="text-[11px] mt-0.5">
                  {live
                    ? 'Policy creation, activation, and enforcement events will appear here.'
                    : (error || 'Connect the AgentCore policy engine to see audit data.')}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Metrics summary card */}
      {live && (
        <div className="mt-4 grid grid-cols-4 gap-3">
          <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60 p-3 text-center">
            <div className="text-2xl font-bold text-emerald-600 tabular-nums">{metrics.allow_count}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Allowed</div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60 p-3 text-center">
            <div className="text-2xl font-bold text-rose-600 tabular-nums">{metrics.deny_count}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Denied</div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60 p-3 text-center">
            <div className="text-2xl font-bold text-slate-700 tabular-nums">{metrics.invocations}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Invocations</div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60 p-3 text-center">
            <div className="text-2xl font-bold text-amber-600 tabular-nums">{metrics.errors}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Errors</div>
          </div>
        </div>
      )}
    </div>
  );
}
