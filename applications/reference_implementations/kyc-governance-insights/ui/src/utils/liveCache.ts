import type { SimStep } from '../types/simulation';
import type { KYCResponse } from '../types/index';

const CACHE_KEY = 'kyc-live-response-cache';

function scenarioKey(scenario?: string): string {
  if (!scenario) return CACHE_KEY;
  return `${CACHE_KEY}-${scenario}`;
}

export interface CachedLiveData {
  steps: SimStep[];
  response: KYCResponse;
  timestamp: string; // ISO string
}

/**
 * Cache live API response (steps + full response + timestamp) to localStorage.
 * Optionally pass scenario ('approve'|'block') to store per-scenario caches.
 */
export function cacheLiveResponse(steps: SimStep[], response: KYCResponse, scenario?: string): void {
  try {
    const data: CachedLiveData = {
      steps,
      response,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(scenarioKey(scenario), JSON.stringify(data));
    // Also write to legacy key for backwards compat with existing tests
    if (scenario) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    }
  } catch {
    // Silently ignore quota/serialization errors
  }
}

/**
 * Retrieve full cached live data from localStorage.
 * Optionally pass scenario to retrieve scenario-specific cache.
 * Returns null if no cache exists or parsing fails.
 */
export function getCachedResponse(scenario?: string): CachedLiveData | null {
  try {
    const raw = localStorage.getItem(scenarioKey(scenario));
    if (!raw) {
      // Fall back to legacy key if scenario-specific not found
      if (scenario) {
        const legacy = localStorage.getItem(CACHE_KEY);
        if (!legacy) return null;
        return JSON.parse(legacy) as CachedLiveData;
      }
      return null;
    }
    return JSON.parse(raw) as CachedLiveData;
  } catch {
    return null;
  }
}

/**
 * Get a human-readable relative timestamp for the cached data.
 * Returns strings like "2 min ago", "today at 14:22", "yesterday at 09:15"
 */
export function getCachedTimestamp(scenario?: string): string | null {
  const cached = getCachedResponse(scenario);
  if (!cached?.timestamp) return null;

  const cachedDate = new Date(cached.timestamp);
  const now = new Date();
  const diffMs = now.getTime() - cachedDate.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;

  const isToday = cachedDate.toDateString() === now.toDateString();
  const timeStr = cachedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `today at ${timeStr}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (cachedDate.toDateString() === yesterday.toDateString()) {
    return `yesterday at ${timeStr}`;
  }

  if (diffHours < 168) return `${Math.floor(diffHours / 24)}d ago`;

  return cachedDate.toLocaleDateString();
}
