import { useState, useEffect, useRef } from 'react';
import { usePersona, type Persona } from '../contexts/PersonaContext';
import { TEST_IDS } from '../test-ids';

interface PersonaOption {
  id: Persona;
  icon: string;
  label: string;
  description: string;
}

const personas: PersonaOption[] = [
  { id: 'cro-fleet', icon: '📊', label: 'CRO Fleet', description: 'Board-level risk oversight across all AI systems' },
  { id: 'business-ops', icon: '📈', label: 'Business Ops', description: 'Operational throughput, SLAs, and case management' },
  { id: 'compliance', icon: '✓', label: 'Compliance', description: 'Regulatory evidence, controls, and audit readiness' },
  { id: 'engineering', icon: '⚙️', label: 'Engineering', description: 'Architecture, traces, and policy implementation' },
];

export default function PersonaSelector() {
  const { persona, setPersona } = usePersona();
  // Expand on first visit (no stored persona) to show the audience the 4 lenses
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !localStorage.getItem('persona-mode');
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (id: Persona) => {
    setPersona(id);
    setOpen(false);
  };

  const current = personas.find(p => p.id === persona)!;

  return (
    <div ref={containerRef} style={{ position: 'relative' }} data-testid={TEST_IDS.persona.selector}>
      {/* Collapsed: shows selected persona */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          transition: 'all 0.2s',
        }}
      >
        <span>{current.icon}</span>
        <span>{current.label}</span>
        <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: '2px' }}>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {/* Expanded dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '6px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '6px',
          zIndex: 1000,
          minWidth: '280px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          animation: 'slideDown 0.2s ease',
        }}>
          {personas.map(p => {
            const isActive = p.id === persona;
            return (
              <button
                key={p.id}
                onClick={() => handleSelect(p.id)}
                data-testid={TEST_IDS.persona.option(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isActive ? 'rgba(59,130,246,0.12)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: '16px', flexShrink: 0 }}>{p.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {p.description}
                  </div>
                </div>
                {isActive && <span style={{ fontSize: '12px', color: 'var(--accent)' }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
