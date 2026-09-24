import { createContext, useContext, useState, type ReactNode } from 'react';

export type Persona = 'cro-fleet' | 'business-ops' | 'compliance' | 'engineering';

interface PersonaContextType {
  persona: Persona;
  setPersona: (p: Persona) => void;
  isFleetView: boolean;
  showCedarDSL: boolean;
  showEvidence: boolean;
}

const PersonaContext = createContext<PersonaContextType>({
  persona: 'business-ops',
  setPersona: () => {},
  isFleetView: false,
  showCedarDSL: false,
  showEvidence: false,
});

function getInitialPersona(): Persona {
  if (typeof window === 'undefined') return 'business-ops';
  const stored = localStorage.getItem('persona-mode');
  if (stored && ['cro-fleet', 'business-ops', 'compliance', 'engineering'].includes(stored)) {
    return stored as Persona;
  }
  return 'compliance';
}

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [persona, setPersonaState] = useState<Persona>(getInitialPersona);

  const setPersona = (p: Persona) => {
    setPersonaState(p);
    localStorage.setItem('persona-mode', p);
  };

  return (
    <PersonaContext.Provider value={{
      persona,
      setPersona,
      isFleetView: persona === 'cro-fleet',
      showCedarDSL: persona === 'engineering',
      showEvidence: persona === 'compliance',
    }}>
      {children}
    </PersonaContext.Provider>
  );
}

export function usePersona() {
  return useContext(PersonaContext);
}

// Backward compatibility: map persona to old audience mode for existing components
export type AudienceMode = 'Executive' | 'Compliance' | 'Engineering';
export function personaToAudienceMode(persona: Persona): AudienceMode {
  switch (persona) {
    case 'cro-fleet': return 'Executive';
    case 'business-ops': return 'Executive';
    case 'compliance': return 'Compliance';
    case 'engineering': return 'Engineering';
  }
}
