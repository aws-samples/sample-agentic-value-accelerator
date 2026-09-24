/**
 * BACKWARD COMPATIBILITY LAYER
 * Components that import useAudience() still work — it delegates to PersonaContext.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { usePersona, personaToAudienceMode } from './PersonaContext';
import type { TabId } from '../types/tabs';

export type AudienceMode = 'Executive' | 'Compliance' | 'Engineering';

interface AudienceContextValue {
  mode: AudienceMode;
  setMode: (mode: AudienceMode) => void;
  isTabVisible: (tabId: TabId) => boolean;
}

const AudienceContext = createContext<AudienceContextValue>({
  mode: 'Compliance',
  setMode: () => {},
  isTabVisible: () => true,
});

export function AudienceProvider({ children }: { children: ReactNode }) {
  // Delegates to PersonaContext — this wrapper keeps old components working
  return <>{children}</>;
}

export function useAudience(): AudienceContextValue {
  const { persona } = usePersona();
  const mode = personaToAudienceMode(persona);
  return {
    mode,
    setMode: () => {}, // No-op — use PersonaSelector instead
    isTabVisible: () => true, // Tab filtering now handled by personaTabs config
  };
}

export default AudienceContext;
