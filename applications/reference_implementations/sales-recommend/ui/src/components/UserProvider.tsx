"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_EMAIL,
  readStoredEmail,
  writeStoredEmail,
} from "@/lib/userIdentity";

interface UserContextValue {
  /** The email the visitor shared, or null if they haven't. */
  email: string | null;
  /** What to render in the UI — the shared email or the demo fallback. */
  displayEmail: string;
  /** True once we've read persisted state on the client (avoids SSR flash). */
  hydrated: boolean;
  /** Persist a shared email and update the UI everywhere. */
  setEmail: (email: string) => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [email, setEmailState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Read persisted email on mount only — keeps server and first client render
  // identical (both null), then hydrates from localStorage.
  useEffect(() => {
    setEmailState(readStoredEmail());
    setHydrated(true);
  }, []);

  const setEmail = useCallback((next: string) => {
    const trimmed = next.trim();
    writeStoredEmail(trimmed);
    setEmailState(trimmed);
  }, []);

  const value = useMemo<UserContextValue>(
    () => ({
      email,
      displayEmail: email ?? DEFAULT_EMAIL,
      hydrated,
      setEmail,
    }),
    [email, hydrated, setEmail]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used within a <UserProvider>.");
  }
  return ctx;
}
