/**
 * DataSourceStatus — Global indicator showing data source health across providers.
 *
 * Shows a compact status bar that expands to show detailed provider-by-provider
 * breakdown with refresh controls. Designed for the Govern module header.
 */
import { useState, useMemo } from 'react';
import { useDataSources, PROVIDERS, type DataSource, type ProviderCategory, type DataSourceStatus as Status } from './DataSourceContext';

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string; dot: string }> = {
  live: { label: 'Live', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  cached: { label: 'Cached', color: 'text-sky-700', bg: 'bg-sky-50', dot: 'bg-sky-400' },
  demo: { label: 'Demo', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-400' },
  error: { label: 'Error', color: 'text-rose-700', bg: 'bg-rose-50', dot: 'bg-rose-500' },
  unknown: { label: 'Unknown', color: 'text-slate-500', bg: 'bg-slate-50', dot: 'bg-slate-300' },
};

const HEALTH_CONFIG = {
  healthy: { label: 'All Systems Live', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: '✓' },
  degraded: { label: 'Degraded Mode', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: '⚠' },
  offline: { label: 'Offline Mode', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200', icon: '✕' },
};

function formatAge(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function SourceRow({ source, onRefresh }: { source: DataSource; onRefresh: () => void }) {
  const cfg = STATUS_CONFIG[source.status];
  const age = useMemo(() => {
    return source.lastFetch ? formatAge(Date.now() - source.lastFetch) : null;
  }, [source.lastFetch]);

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        <span className="text-[11px] font-medium text-slate-700">{source.name}</span>
        {source.description && (
          <span className="text-[10px] text-slate-400 hidden sm:inline">— {source.description}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {age && <span className="text-[9px] text-slate-400">{age}</span>}
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
        {source.status === 'error' && (
          <button
            onClick={onRefresh}
            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            title="Retry connection"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

function ProviderSection({ provider, sources, onRefresh }: { provider: ProviderCategory; sources: DataSource[]; onRefresh: (id: string) => void }) {
  const info = PROVIDERS[provider];
  const liveCount = sources.filter(s => s.status === 'live').length;
  const errorCount = sources.filter(s => s.status === 'error').length;

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1 px-2">
        <span style={{ color: info.color }}>{info.icon}</span>
        <span className="text-[11px] font-semibold text-slate-800">{info.name}</span>
        <span className="text-[10px] text-slate-400">
          {liveCount}/{sources.length} live
          {errorCount > 0 && <span className="text-rose-500 ml-1">· {errorCount} error</span>}
        </span>
      </div>
      <div className="space-y-0.5">
        {sources.map(s => (
          <SourceRow key={s.id} source={s} onRefresh={() => onRefresh(s.id)} />
        ))}
      </div>
    </div>
  );
}

interface Props {
  /** Compact mode shows just the summary badge */
  compact?: boolean;
}

export default function DataSourceStatus({ compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { sources, health, requestRefresh } = useDataSources();

  const byProvider = useMemo(() => {
    const grouped = new Map<ProviderCategory, DataSource[]>();
    sources.forEach(s => {
      const list = grouped.get(s.provider) ?? [];
      list.push(s);
      grouped.set(s.provider, list);
    });
    return grouped;
  }, [sources]);

  const cfg = HEALTH_CONFIG[health.overall];

  if (compact) {
    return (
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-lg border transition-colors ${cfg.bg} ${cfg.color}`}
        title={`${health.counts.live} live, ${health.counts.cached} cached, ${health.counts.demo} demo, ${health.counts.error} errors`}
      >
        <span>{cfg.icon}</span>
        <span>{cfg.label}</span>
        <span className="text-[9px] opacity-70">
          ({health.counts.live}/{sources.size})
        </span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${cfg.bg} ${cfg.color}`}
      >
        <span className="text-sm">{cfg.icon}</span>
        <div className="text-left">
          <div className="text-[11px] font-semibold">{cfg.label}</div>
          <div className="text-[9px] opacity-80">
            {health.counts.live} live · {health.counts.cached} cached · {health.counts.demo} demo
            {health.counts.error > 0 && <span className="text-rose-600"> · {health.counts.error} errors</span>}
          </div>
        </div>
        <svg
          className={`w-4 h-4 ml-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="absolute top-full right-0 mt-2 w-96 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-800">Data Source Status</div>
                <div className="text-[10px] text-slate-500">
                  Connection health across all providers
                </div>
              </div>
              <button
                onClick={() => sources.forEach((_, id) => requestRefresh(id))}
                className="text-[10px] px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
              >
                Refresh All
              </button>
            </div>
          </div>

          <div className="p-3 max-h-80 overflow-y-auto">
            {/* Show providers that have sources */}
            {(['aws', 'internal', 'azure', 'gcp', 'datadog', 'custom'] as ProviderCategory[])
              .filter(p => byProvider.has(p))
              .map(p => (
                <ProviderSection
                  key={p}
                  provider={p}
                  sources={byProvider.get(p) ?? []}
                  onRefresh={requestRefresh}
                />
              ))}
          </div>

          {health.errors.length > 0 && (
            <div className="px-4 py-2 bg-rose-50 border-t border-rose-100">
              <div className="text-[10px] font-semibold text-rose-700 mb-1">Connection Errors</div>
              {health.errors.map(s => (
                <div key={s.id} className="text-[10px] text-rose-600">
                  {s.name}: {s.error || 'Connection failed'}
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
            <div className="text-[9px] text-slate-500">
              {health.overall === 'offline' && 'All data is illustrative. Connect to AWS or other providers to see live data.'}
              {health.overall === 'degraded' && 'Some data sources unavailable. Using cached or demo data where needed.'}
              {health.overall === 'healthy' && 'All data sources connected and returning live data.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small inline badge for individual components to show their data source status */
export function SourceBadge({ sourceId }: { sourceId: string }) {
  const { getSource } = useDataSources();
  const source = getSource(sourceId);

  if (!source) return null;

  const cfg = STATUS_CONFIG[source.status];

  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}
      title={source.error || `${source.name}: ${cfg.label}`}
    >
      <span className={`w-1 h-1 rounded-full ${cfg.dot} ${source.status === 'live' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}
