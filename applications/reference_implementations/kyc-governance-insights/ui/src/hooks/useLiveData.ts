import { useState, useEffect, useRef, useCallback } from 'react';
import { useOfflineMode } from './useOfflineMode';

/**
 * Generic hook: tries live fetch first, falls back to static data.
 * If ?offline=true, always uses fallback without fetching.
 */
export function useLiveData<T>(
  fetcher: () => Promise<T | null>,
  fallback: T,
  refreshInterval?: number
): { data: T; isLive: boolean; isLoading: boolean; error: string | null; refresh: () => void } {
  const offline = useOfflineMode();
  const [data, setData] = useState<T>(fallback);
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(!offline);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doFetch = useCallback(async () => {
    if (offline) {
      setData(fallback);
      setIsLive(false);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const result = await fetcher();
      if (result !== null) {
        setData(result);
        setIsLive(true);
        setError(null);
      } else {
        setData(fallback);
        setIsLive(false);
      }
    } catch (e: any) {
      setData(fallback);
      setIsLive(false);
      setError(e?.message || 'Fetch failed');
    } finally {
      setIsLoading(false);
    }
  }, [fetcher, fallback, offline]);

  useEffect(() => {
    doFetch();
    if (refreshInterval && !offline) {
      intervalRef.current = setInterval(doFetch, refreshInterval);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [doFetch, refreshInterval, offline]);

  return { data, isLive, isLoading, error, refresh: doFetch };
}
