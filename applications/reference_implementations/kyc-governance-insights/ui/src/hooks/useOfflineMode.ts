/**
 * Returns true when ?offline=true is in the URL.
 * When active, all API calls should be skipped and fallback data used.
 */
export function useOfflineMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('offline');
}
