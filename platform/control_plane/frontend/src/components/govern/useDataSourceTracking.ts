/**
 * useDataSourceTracking — Hooks to integrate API calls with DataSourceContext.
 *
 * Wraps fetch operations to automatically update data source status based on
 * success/failure. Provides graceful degradation with cached data support.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useDataSource } from './DataSourceContext';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/** In-memory cache for graceful degradation */
const cache = new Map<string, CacheEntry<unknown>>();

interface UseTrackedFetchOptions<T> {
  /** Data source ID to track */
  sourceId: string;
  /** Fetch function that returns the data */
  fetchFn: () => Promise<T>;
  /** Function to check if response indicates live data (default: check .live property) */
  isLive?: (data: T) => boolean;
  /** Cache TTL in ms (default: 5 minutes) */
  cacheTtl?: number;
  /** Demo/fallback data to use when fetch fails and no cache exists */
  fallback?: T;
  /** Whether to auto-fetch on mount */
  autoFetch?: boolean;
  /** Polling interval in ms (0 = no polling) */
  pollInterval?: number;
}

/**
 * Hook that wraps a fetch operation with automatic data source tracking.
 * Handles live/cached/demo status transitions and caching.
 */
export function useTrackedFetch<T>({
  sourceId,
  fetchFn,
  isLive = (d: T) => typeof d === 'object' && d !== null && 'live' in d && (d as { live: boolean }).live,
  cacheTtl = 5 * 60 * 1000,
  fallback,
  autoFetch = true,
  pollInterval = 0,
}: UseTrackedFetchOptions<T>) {
  const {
    status,
    isLive: sourceLive,
    needsRefresh,
    setLive,
    setCached,
    setDemo,
    setError,
    ackRefresh,
  } = useDataSource(sourceId);

  const dataRef = useRef<T | null>(null);
  const loadingRef = useRef(false);

  const execute = useCallback(async (): Promise<T | null> => {
    if (loadingRef.current) return dataRef.current;
    loadingRef.current = true;

    try {
      const data = await fetchFn();
      dataRef.current = data;

      // Update cache
      cache.set(sourceId, { data, timestamp: Date.now() });

      // Determine if data is live or demo
      if (isLive(data)) {
        setLive();
      } else {
        setDemo();
      }

      return data;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Connection failed';

      // Try to use cached data
      const cached = cache.get(sourceId) as CacheEntry<T> | undefined;
      if (cached && Date.now() - cached.timestamp < cacheTtl) {
        dataRef.current = cached.data;
        setCached(Math.floor((Date.now() - cached.timestamp) / 1000));
        return cached.data;
      }

      // Fall back to demo data
      if (fallback !== undefined) {
        dataRef.current = fallback;
        setDemo();
        return fallback;
      }

      // No fallback available — error state
      setError(errorMsg);
      return null;
    } finally {
      loadingRef.current = false;
    }
  }, [sourceId, fetchFn, isLive, cacheTtl, fallback, setLive, setCached, setDemo, setError]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      execute();
    }
  }, [autoFetch, execute]);

  // Handle refresh requests
  useEffect(() => {
    if (needsRefresh) {
      ackRefresh();
      execute();
    }
  }, [needsRefresh, ackRefresh, execute]);

  // Polling
  useEffect(() => {
    if (pollInterval > 0) {
      const interval = setInterval(execute, pollInterval);
      return () => clearInterval(interval);
    }
  }, [pollInterval, execute]);

  return {
    data: dataRef.current,
    status,
    isLive: sourceLive,
    refetch: execute,
  };
}

/**
 * Simple hook to mark a data source status based on an API response.
 * Use when you have existing fetch logic and just want to track status.
 */
export function useSourceStatus(sourceId: string) {
  const { setLive, setCached, setDemo, setError, status, needsRefresh, ackRefresh } = useDataSource(sourceId);

  const markLive = useCallback(() => setLive(), [setLive]);
  const markCached = useCallback((ageSeconds: number) => setCached(ageSeconds), [setCached]);
  const markDemo = useCallback(() => setDemo(), [setDemo]);
  const markError = useCallback((msg: string) => setError(msg), [setError]);

  /** Call after a successful fetch — auto-detects live vs demo from response */
  const markFromResponse = useCallback(<T,>(response: T) => {
    if (typeof response === 'object' && response !== null && 'live' in response) {
      if ((response as { live: boolean }).live) {
        setLive();
      } else {
        setDemo();
      }
    } else {
      // Assume live if we got a response without .live property
      setLive();
    }
  }, [setLive, setDemo]);

  return {
    status,
    needsRefresh,
    ackRefresh,
    markLive,
    markCached,
    markDemo,
    markError,
    markFromResponse,
  };
}

/**
 * Clears the in-memory cache (useful for testing or manual reset).
 */
export function clearDataSourceCache() {
  cache.clear();
}
