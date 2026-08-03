/**
 * DataSourceContext — Provider-agnostic data source health tracking.
 *
 * Tracks connection status across multiple data providers (AWS, Azure, GCP,
 * Datadog, custom APIs). Components register their data sources and the context
 * maintains overall health with graceful degradation: Live → Cached → Demo.
 *
 * Usage:
 *   // Wrap your app
 *   <DataSourceProvider>
 *     <App />
 *   </DataSourceProvider>
 *
 *   // In a component that fetches data
 *   const { updateSource, getSource } = useDataSources();
 *   useEffect(() => {
 *     fetchAwsData()
 *       .then(data => updateSource('aws-cloudtrail', { status: 'live', lastFetch: Date.now() }))
 *       .catch(() => updateSource('aws-cloudtrail', { status: 'error', error: 'Connection failed' }));
 *   }, []);
 *
 *   // In a status bar
 *   const { sources, health } = useDataSources();
 */
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

/** Data source status levels (in order of degradation) */
export type DataSourceStatus = 'live' | 'cached' | 'demo' | 'error' | 'unknown';

/** Provider categories for grouping */
export type ProviderCategory = 'aws' | 'azure' | 'gcp' | 'datadog' | 'custom' | 'internal';

/** Individual data source definition */
export interface DataSource {
  /** Unique identifier (e.g., 'aws-cloudtrail', 'azure-monitor') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Provider category */
  provider: ProviderCategory;
  /** Current status */
  status: DataSourceStatus;
  /** Last successful fetch timestamp */
  lastFetch?: number;
  /** Cache age in seconds (if cached) */
  cacheAge?: number;
  /** Max cache TTL before considered stale */
  cacheTtl?: number;
  /** Error message if status is 'error' */
  error?: string;
  /** Description of what this source provides */
  description?: string;
  /** Whether this source is required for core functionality */
  critical?: boolean;
}

/** Provider metadata */
export interface ProviderInfo {
  id: ProviderCategory;
  name: string;
  icon: string;
  color: string;
}

export const PROVIDERS: Record<ProviderCategory, ProviderInfo> = {
  aws: { id: 'aws', name: 'AWS', icon: '☁️', color: '#ff9900' },
  azure: { id: 'azure', name: 'Azure', icon: '⬡', color: '#0078d4' },
  gcp: { id: 'gcp', name: 'Google Cloud', icon: '◈', color: '#4285f4' },
  datadog: { id: 'datadog', name: 'Datadog', icon: '🐕', color: '#632ca6' },
  custom: { id: 'custom', name: 'Custom', icon: '⚙️', color: '#6b7280' },
  internal: { id: 'internal', name: 'AVA Platform', icon: '◉', color: '#6366f1' },
};

/** Overall health summary */
export interface DataSourceHealth {
  /** Overall status based on critical sources */
  overall: 'healthy' | 'degraded' | 'offline';
  /** Count by status */
  counts: Record<DataSourceStatus, number>;
  /** Sources with errors */
  errors: DataSource[];
  /** Sources using cached data */
  cached: DataSource[];
  /** All sources currently live */
  live: DataSource[];
}

interface DataSourceContextValue {
  /** All registered data sources */
  sources: Map<string, DataSource>;
  /** Overall health summary */
  health: DataSourceHealth;
  /** Register or update a data source */
  updateSource: (id: string, updates: Partial<DataSource> & { name?: string; provider?: ProviderCategory }) => void;
  /** Remove a data source */
  removeSource: (id: string) => void;
  /** Get a specific source */
  getSource: (id: string) => DataSource | undefined;
  /** Get all sources for a provider */
  getProviderSources: (provider: ProviderCategory) => DataSource[];
  /** Trigger a refresh for a source (components should listen and refetch) */
  requestRefresh: (id: string) => void;
  /** Pending refresh requests */
  refreshRequests: Set<string>;
  /** Clear a refresh request after handling */
  clearRefreshRequest: (id: string) => void;
}

const DataSourceContext = createContext<DataSourceContextValue | null>(null);

/** Default sources that are always present */
const DEFAULT_SOURCES: DataSource[] = [
  // AWS sources
  { id: 'aws-cloudtrail', name: 'CloudTrail', provider: 'aws', status: 'unknown', description: 'AI service activity logs', critical: true },
  { id: 'aws-cloudwatch', name: 'CloudWatch', provider: 'aws', status: 'unknown', description: 'Model runtime metrics', critical: true },
  { id: 'aws-cost-explorer', name: 'Cost Explorer', provider: 'aws', status: 'unknown', description: 'Spend and forecasts' },
  { id: 'aws-security-hub', name: 'Security Hub', provider: 'aws', status: 'unknown', description: 'Security findings' },
  { id: 'aws-config', name: 'AWS Config', provider: 'aws', status: 'unknown', description: 'Compliance rules' },
  { id: 'aws-bedrock', name: 'Bedrock', provider: 'aws', status: 'unknown', description: 'Model catalog and guardrails', critical: true },
  { id: 'aws-agentcore', name: 'AgentCore', provider: 'aws', status: 'unknown', description: 'Agent runtimes and posture' },
  // Internal AVA sources
  { id: 'ava-plan', name: 'Plan Module', provider: 'internal', status: 'unknown', description: 'Use cases and business cases', critical: true },
  { id: 'ava-build', name: 'Build Module', provider: 'internal', status: 'unknown', description: 'Deployments' },
  { id: 'ava-secure', name: 'Secure Module', provider: 'internal', status: 'unknown', description: 'Guardrails and policies' },
];

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<Map<string, DataSource>>(() => {
    const map = new Map<string, DataSource>();
    DEFAULT_SOURCES.forEach(s => map.set(s.id, s));
    return map;
  });
  const [refreshRequests, setRefreshRequests] = useState<Set<string>>(new Set());

  const updateSource = useCallback((id: string, updates: Partial<DataSource> & { name?: string; provider?: ProviderCategory }) => {
    setSources(prev => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) {
        next.set(id, { ...existing, ...updates });
      } else if (updates.name && updates.provider) {
        next.set(id, {
          id,
          name: updates.name,
          provider: updates.provider,
          status: updates.status ?? 'unknown',
          ...updates,
        });
      }
      return next;
    });
  }, []);

  const removeSource = useCallback((id: string) => {
    setSources(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const getSource = useCallback((id: string) => sources.get(id), [sources]);

  const getProviderSources = useCallback((provider: ProviderCategory) => {
    return Array.from(sources.values()).filter(s => s.provider === provider);
  }, [sources]);

  const requestRefresh = useCallback((id: string) => {
    setRefreshRequests(prev => new Set(prev).add(id));
  }, []);

  const clearRefreshRequest = useCallback((id: string) => {
    setRefreshRequests(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const health = useMemo<DataSourceHealth>(() => {
    const all = Array.from(sources.values());
    const counts: Record<DataSourceStatus, number> = { live: 0, cached: 0, demo: 0, error: 0, unknown: 0 };
    const errors: DataSource[] = [];
    const cached: DataSource[] = [];
    const live: DataSource[] = [];

    all.forEach(s => {
      counts[s.status]++;
      if (s.status === 'error') errors.push(s);
      if (s.status === 'cached') cached.push(s);
      if (s.status === 'live') live.push(s);
    });

    // Determine overall health based on critical sources
    const critical = all.filter(s => s.critical);
    const criticalErrors = critical.filter(s => s.status === 'error').length;
    const criticalLive = critical.filter(s => s.status === 'live').length;

    let overall: 'healthy' | 'degraded' | 'offline' = 'healthy';
    if (criticalErrors > 0 || criticalLive === 0) {
      overall = critical.length > 0 && criticalErrors === critical.length ? 'offline' : 'degraded';
    } else if (errors.length > 0 || cached.length > 0) {
      overall = 'degraded';
    }

    return { overall, counts, errors, cached, live };
  }, [sources]);

  const value = useMemo<DataSourceContextValue>(() => ({
    sources,
    health,
    updateSource,
    removeSource,
    getSource,
    getProviderSources,
    requestRefresh,
    refreshRequests,
    clearRefreshRequest,
  }), [sources, health, updateSource, removeSource, getSource, getProviderSources, requestRefresh, refreshRequests, clearRefreshRequest]);

  return (
    <DataSourceContext.Provider value={value}>
      {children}
    </DataSourceContext.Provider>
  );
}

/** Hook to access data source context */
export function useDataSources() {
  const ctx = useContext(DataSourceContext);
  if (!ctx) {
    throw new Error('useDataSources must be used within DataSourceProvider');
  }
  return ctx;
}

/** Hook for a component that consumes a specific data source */
export function useDataSource(id: string) {
  const { getSource, updateSource, requestRefresh, refreshRequests, clearRefreshRequest } = useDataSources();
  const source = getSource(id);
  const needsRefresh = refreshRequests.has(id);

  const setStatus = useCallback((status: DataSourceStatus, extra?: Partial<DataSource>) => {
    updateSource(id, { status, lastFetch: status === 'live' ? Date.now() : undefined, ...extra });
  }, [id, updateSource]);

  const setLive = useCallback(() => setStatus('live'), [setStatus]);
  const setCached = useCallback((cacheAge: number) => setStatus('cached', { cacheAge }), [setStatus]);
  const setDemo = useCallback(() => setStatus('demo'), [setStatus]);
  const setError = useCallback((error: string) => setStatus('error', { error }), [setStatus]);

  const refresh = useCallback(() => requestRefresh(id), [id, requestRefresh]);
  const ackRefresh = useCallback(() => clearRefreshRequest(id), [id, clearRefreshRequest]);

  return {
    source,
    status: source?.status ?? 'unknown',
    isLive: source?.status === 'live',
    isCached: source?.status === 'cached',
    isDemo: source?.status === 'demo',
    isError: source?.status === 'error',
    error: source?.error,
    lastFetch: source?.lastFetch,
    needsRefresh,
    setLive,
    setCached,
    setDemo,
    setError,
    refresh,
    ackRefresh,
  };
}
