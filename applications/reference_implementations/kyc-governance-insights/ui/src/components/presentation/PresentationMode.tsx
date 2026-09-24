import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PRESENTATION_BEATS } from '../../data/presentationBeats';
import { usePersona, type Persona } from '../../contexts/PersonaContext';
import NarrativeSidebar from './NarrativeSidebar';
import type { TabId } from '../../types/tabs';
import { TEST_IDS } from '../../test-ids';

interface PresentationModeProps {
  children: React.ReactNode;
  onTabChange: (tab: TabId) => void;
}

function getInitialBeat(): number {
  if (typeof window === 'undefined') return 1;
  const params = new URLSearchParams(window.location.search);
  const beat = parseInt(params.get('beat') || '1', 10);
  return beat >= 1 && beat <= PRESENTATION_BEATS.length ? beat : 1;
}

function isPresentMode(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'present';
}

export default function PresentationMode({ children, onTabChange }: PresentationModeProps) {
  const { setPersona } = usePersona();
  const [active, setActive] = useState(isPresentMode);
  const [currentBeat, setCurrentBeat] = useState(getInitialBeat);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const startTimeRef = useRef(Date.now());

  // Update URL when beat changes
  useEffect(() => {
    if (!active) return;
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'present');
    url.searchParams.set('beat', String(currentBeat));
    window.history.replaceState({}, '', url.toString());
  }, [currentBeat, active]);

  // Apply beat state (persona + tab)
  const applyBeat = useCallback((beatId: number) => {
    const beat = PRESENTATION_BEATS.find(b => b.id === beatId);
    if (!beat) return;
    setPersona(beat.persona);
    if (beat.tab) {
      onTabChange(beat.tab);
    }
    // Scroll to element if specified (after a brief delay for rendering)
    if (beat.scrollTo) {
      setTimeout(() => {
        const el = document.querySelector(beat.scrollTo!);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [setPersona, onTabChange]);

  // Apply beat on mount and when beat changes
  useEffect(() => {
    if (active) applyBeat(currentBeat);
  }, [currentBeat, active, applyBeat]);

  const goNext = useCallback(() => {
    setCurrentBeat(prev => {
      const next = Math.min(prev + 1, PRESENTATION_BEATS.length);
      return next;
    });
  }, []);

  const goPrev = useCallback(() => {
    setCurrentBeat(prev => Math.max(prev - 1, 1));
  }, []);

  const jumpToBeat = useCallback((beatId: number) => {
    setCurrentBeat(beatId);
  }, []);

  const exitPresentation = useCallback(() => {
    setActive(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('mode');
    url.searchParams.delete('beat');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const enterPresentation = useCallback(() => {
    setActive(true);
    startTimeRef.current = Date.now();
    setCurrentBeat(1);
  }, []);

  // Keyboard handlers
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goPrev();
          break;
        case 'Escape':
          e.preventDefault();
          exitPresentation();
          break;
        case '?':
          e.preventDefault();
          setShowShortcuts(s => !s);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          setSidebarVisible(v => !v);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, goNext, goPrev, exitPresentation]);

  // Not in presentation mode — render normally with the 🎬 button
  if (!active) {
    return (
      <div style={{ position: 'relative' }}>
        {children}
        {/* Subtle presentation mode button */}
        <button
          onClick={enterPresentation}
          title="Enter Presentation Mode"
          data-testid={TEST_IDS.presentation.trigger}
          style={{
            position: 'fixed', bottom: '16px', left: '16px', zIndex: 9999,
            width: '36px', height: '36px', borderRadius: '50%', border: 'none',
            background: 'rgba(30,41,59,0.8)', color: '#94a3b8', fontSize: '16px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)', transition: 'opacity 0.2s',
            opacity: 0.5,
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.5'; }}
        >
          🎬
        </button>
      </div>
    );
  }

  // Presentation mode active
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      {/* Sidebar */}
      {sidebarVisible && (
        <div style={{
          width: '30%', minWidth: '320px', maxWidth: '576px',
          height: '100%', flexShrink: 0,
          transition: 'width 0.3s ease, opacity 0.3s ease',
        }}>
          <NarrativeSidebar
            currentBeat={currentBeat}
            onNext={goNext}
            onPrev={goPrev}
            onJumpToBeat={jumpToBeat}
            onToggleSidebar={() => setSidebarVisible(false)}
            startTime={startTimeRef.current}
          />
        </div>
      )}

      {/* Demo viewport */}
      <div style={{ flex: 1, height: '100%', overflow: 'auto' }}>
        {children}
      </div>

      {/* Sidebar hidden — show small toggle */}
      {!sidebarVisible && (
        <button
          onClick={() => setSidebarVisible(true)}
          style={{
            position: 'fixed', top: '50%', left: '0', transform: 'translateY(-50%)',
            zIndex: 9999, padding: '12px 6px', borderRadius: '0 6px 6px 0',
            border: 'none', background: 'rgba(15,23,42,0.9)', color: '#60a5fa',
            cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600,
            writingMode: 'vertical-rl', textOrientation: 'mixed',
          }}
        >
          ◀ Show
        </button>
      )}

      {/* Keyboard shortcuts overlay */}
      {showShortcuts && (
        <div
          onClick={() => setShowShortcuts(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', maxWidth: '360px', color: '#e2e8f0' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px' }}>Keyboard Shortcuts</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
              {[
                ['→ or Space', 'Next beat'],
                ['←', 'Previous beat'],
                ['Escape', 'Exit presentation mode'],
                ['F', 'Toggle sidebar'],
                ['?', 'Show/hide shortcuts'],
              ].map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#60a5fa', fontSize: '0.72rem' }}>{key}</span>
                  <span style={{ color: '#94a3b8' }}>{desc}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '16px', fontSize: '0.65rem', color: '#64748b', textAlign: 'center' }}>
              Click anywhere to dismiss
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
