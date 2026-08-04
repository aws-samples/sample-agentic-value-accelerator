// personaContext.tsx — the active-persona provider. Holds which vertical desk is selected,
// persists it to localStorage, and toggles the persona accent-palette class on <html>
// (exactly how the dark/light theme class works). Everything downstream reads the active
// PersonaDef from here, so a persona switch reskins branding, roster colors, quick prompts,
// and the AWS-stack copy without prop-drilling.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_PERSONA, PERSONAS, getPersona, personaClass, type PersonaDef, type PersonaId,
} from './personas';

const STORAGE_KEY = 'meridian-persona';

/** Read the persisted persona id (validated against the registry), or null if none/invalid. */
export function readStoredPersona(): PersonaId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && PERSONAS[v] ? (v as PersonaId) : null;
  } catch {
    return null;
  }
}

/** Apply a persona's accent-palette class to <html>, clearing any other persona-* class.
 * capital_markets (the default) uses the base :root tokens, so it gets no class. Preserves
 * the independent `light` theme class. */
export function applyPersonaClass(id: string): void {
  try {
    const root = document.documentElement;
    root.classList.forEach((c) => {
      if (c.startsWith('persona-')) root.classList.remove(c);
    });
    const cls = personaClass(id);
    if (cls) root.classList.add(cls);
  } catch {
    /* DOM unavailable */
  }
}

type PersonaCtx = {
  personaId: PersonaId;
  persona: PersonaDef;
  setPersona: (id: PersonaId) => void;
};

const Ctx = createContext<PersonaCtx | null>(null);

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [personaId, setPersonaId] = useState<PersonaId>(() => readStoredPersona() || DEFAULT_PERSONA);

  // Keep the <html> class in sync with the active persona (and on first mount).
  useEffect(() => {
    applyPersonaClass(personaId);
  }, [personaId]);

  // Keep the browser-tab title in sync with the active desk. Just the firm name —
  // short so it never clips mid-word in a tab, and correct per persona (the tab said
  // "Meridian" even on the Ridgeline / Rampart / Kairo desks before this).
  useEffect(() => {
    try {
      document.title = getPersona(personaId).firmName;
    } catch {
      /* DOM unavailable */
    }
  }, [personaId]);

  const setPersona = useCallback((id: PersonaId) => {
    setPersonaId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* storage unavailable */
    }
    applyPersonaClass(id);
  }, []);

  const value = useMemo<PersonaCtx>(
    () => ({ personaId, persona: getPersona(personaId), setPersona }),
    [personaId, setPersona],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Access the active persona. Falls back to the default outside a provider (defensive). */
export function usePersona(): PersonaCtx {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return { personaId: DEFAULT_PERSONA, persona: getPersona(DEFAULT_PERSONA), setPersona: () => {} };
}
