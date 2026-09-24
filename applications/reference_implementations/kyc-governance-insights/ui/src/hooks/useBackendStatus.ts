/**
 * Single source of truth for backend connectivity status.
 * Derives from: API last-success timestamp + offline mode.
 * 
 * Rules:
 * - ?offline=true → always 'simulated'
 * - API responded within last 2 min → 'live'
 * - API responded but >2 min ago → 'stale'
 * - API never responded → 'simulated'
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useOfflineMode } from './useOfflineMode';
import { API_BASE_URL } from '../api/client';

type BackendStatus = 'live' | 'stale' | 'simulated';

const STALE_THRESHOLD_MS = 120_000; // 2 minutes
const PROBE_INTERVAL_MS = 30_000; // 30 seconds

// Shared state — all consumers see the same status
let globalStatus: BackendStatus = 'simulated';
let lastSuccessTime: number | null = null;
const listeners = new Set<(s: BackendStatus) => void>();

function notifyAll(s: BackendStatus) {
  globalStatus = s;
  listeners.forEach(fn => fn(s));
}

function computeStatus(): BackendStatus {
  if (!lastSuccessTime) return 'simulated';
  const age = Date.now() - lastSuccessTime;
  if (age > STALE_THRESHOLD_MS) return 'stale';
  return 'live';
}

// Record a successful API response (called from anywhere)
export function recordApiSuccess() {
  lastSuccessTime = Date.now();
  notifyAll('live');
}

export function useBackendStatus(): BackendStatus {
  const offline = useOfflineMode();
  const [status, setStatus] = useState<BackendStatus>(offline ? 'simulated' : globalStatus);
  const probeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (offline) {
      setStatus('simulated');
      return;
    }

    // Register as listener
    const handler = (s: BackendStatus) => setStatus(s);
    listeners.add(handler);

    // Probe: lightweight connectivity check
    const probe = async () => {
      try {
        const url = API_BASE_URL;
        if (!url) { notifyAll('simulated'); return; }
        // HEAD request to check connectivity (fast, no payload)
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) }).catch(() => null);
        if (res && (res.status === 200 || res.status === 403 || res.status === 404 || res.status === 405)) {
          // Any response means the backend is reachable
          recordApiSuccess();
        } else {
          // No response — check staleness
          notifyAll(computeStatus());
        }
      } catch {
        notifyAll(computeStatus());
      }
    };

    // Initial probe
    probe();
    probeRef.current = setInterval(probe, PROBE_INTERVAL_MS);

    return () => {
      listeners.delete(handler);
      if (probeRef.current) clearInterval(probeRef.current);
    };
  }, [offline]);

  return offline ? 'simulated' : status;
}
