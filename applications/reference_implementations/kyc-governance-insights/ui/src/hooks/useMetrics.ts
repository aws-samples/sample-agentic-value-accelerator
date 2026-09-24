import { useState, useEffect, useRef, useCallback } from 'react';
import type { MetricsState, LiveMetrics } from '../types/metrics';
import { fetchMetrics } from '../api/metrics';
import { generateMockMetrics } from '../api/mockMetricsServer';
import { FALLBACK_METRICS } from '../data/fallbackMetrics';
import { recordApiSuccess } from './useBackendStatus';

const POLL_INTERVAL_MS = 30_000;
const STALE_THRESHOLD_MS = 120_000;
const HISTORY_BUFFER_SIZE = 10;

export function useMetrics(): MetricsState & { refresh: () => void } {
  const [state, setState] = useState<MetricsState>({
    current: FALLBACK_METRICS,
    history: [FALLBACK_METRICS],
    status: 'connecting',
    lastUpdated: null,
    error: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addToHistory = useCallback((m: LiveMetrics, history: LiveMetrics[]) => {
    const next = [...history, m];
    if (next.length > HISTORY_BUFFER_SIZE) next.shift();
    return next;
  }, []);

  const poll = useCallback(async () => {
    try {
      const resp = await fetchMetrics();
      recordApiSuccess(); // Signal live connectivity
      setState(prev => ({
        current: resp.metrics,
        history: addToHistory(resp.metrics, prev.history),
        status: 'live',
        lastUpdated: new Date(),
        error: null,
      }));
    } catch {
      // Fall back to mock metrics
      const mock = generateMockMetrics();
      setState(prev => ({
        current: mock.metrics,
        history: addToHistory(mock.metrics, prev.history),
        status: 'simulated',
        lastUpdated: new Date(),
        error: null,
      }));
    }
  }, [addToHistory]);

  const refresh = useCallback(() => { poll(); }, [poll]);

  // Initial fetch + polling
  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [poll]);

  // Stale detection
  useEffect(() => {
    staleCheckRef.current = setInterval(() => {
      setState(prev => {
        if (!prev.lastUpdated) return prev;
        const age = Date.now() - prev.lastUpdated.getTime();
        if (age > STALE_THRESHOLD_MS && prev.status === 'live') {
          return { ...prev, status: 'stale' };
        }
        return prev;
      });
    }, 15_000);
    return () => { if (staleCheckRef.current) clearInterval(staleCheckRef.current); };
  }, []);

  return { ...state, refresh };
}
