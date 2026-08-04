/**
 * usePersistedState — useState that transparently persists to localStorage.
 *
 * Govern is a demo surface with no write-back API for risk/compliance edits, so
 * user changes (status transitions, added items, checklist toggles) would be lost
 * on refresh. This hook keeps them across sessions under a namespaced key, while
 * behaving exactly like useState. Falls back to the initial value if storage is
 * unavailable or the stored payload is corrupt.
 */

import { useState, useEffect } from 'react';

export function usePersistedState<T>(
  key: string,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `ava_govern_${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored != null ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* storage full or unavailable — non-fatal, edits just won't persist */
    }
  }, [storageKey, value]);

  return [value, setValue];
}

export default usePersistedState;
