'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Domain } from '@/types/domain';

const STORAGE_KEY = 'selected-domain';

interface DomainContextValue {
  selectedDomain: Domain | null;
  setSelectedDomain: (domain: Domain) => void;
  clearDomain: () => void;
}

const DomainContext = createContext<DomainContextValue | undefined>(undefined);

export function DomainProvider({ children }: { children: React.ReactNode }) {
  const [selectedDomain, setSelectedDomainState] = useState<Domain | null>(null);

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored === 'market-surveillance' || stored === 'msp') {
        setSelectedDomainState(stored);
      }
    } catch {
      // sessionStorage unavailable — fall back to in-memory only
    }
  }, []);

  const setSelectedDomain = useCallback((domain: Domain) => {
    setSelectedDomainState(domain);
    try {
      sessionStorage.setItem(STORAGE_KEY, domain);
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  const clearDomain = useCallback(() => {
    setSelectedDomainState(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  return (
    <DomainContext.Provider value={{ selectedDomain, setSelectedDomain, clearDomain }}>
      {children}
    </DomainContext.Provider>
  );
}

export function useDomain(): DomainContextValue {
  const context = useContext(DomainContext);
  if (!context) {
    throw new Error('useDomain must be used within a DomainProvider');
  }
  return context;
}
