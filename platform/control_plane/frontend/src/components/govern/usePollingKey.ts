/**
 * usePollingKey — a refresh nonce that ticks on an interval so live surfaces can
 * silently refetch without a manual reload.
 *
 * Add the returned key to a fetch effect's dependency array; each tick re-runs it.
 * Polling PAUSES while the tab is hidden (no background API churn) and fires once
 * immediately on becoming visible again, so a surface is fresh when you return to it.
 *
 * Keep the "silent" contract at the call site: on a poll-triggered refetch, update
 * state in place — do NOT reset to a loading spinner — so the UI doesn't flicker.
 */
import { useEffect, useRef, useState } from 'react';

export function usePollingKey(intervalMs = 60_000): number {
  const [key, setKey] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = () => {
      if (timer.current) return;
      timer.current = setInterval(() => {
        // Only tick when visible; hidden tabs stay quiet.
        if (document.visibilityState === 'visible') setKey(k => k + 1);
      }, intervalMs);
    };
    const stop = () => {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { setKey(k => k + 1); start(); }
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [intervalMs]);

  return key;
}

export default usePollingKey;
