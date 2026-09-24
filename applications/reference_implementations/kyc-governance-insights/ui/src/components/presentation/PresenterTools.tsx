import React, { useState, useEffect } from 'react';
import { PRESENTATION_BEATS } from '../../data/presentationBeats';

interface PresenterToolsProps {
  currentBeat: number;
  onJumpToBeat: (beatId: number) => void;
  onToggleSidebar: () => void;
  startTime: number;
}

export default function PresenterTools({ currentBeat, onJumpToBeat, onToggleSidebar, startTime }: PresenterToolsProps) {
  const [elapsed, setElapsed] = useState('00:00');
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime) / 1000);
      const min = Math.floor(diff / 60).toString().padStart(2, '0');
      const sec = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${min}:${sec}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '0.7rem' }}>
      {/* Timer */}
      <span style={{ fontFamily: 'var(--font-mono)', color: '#94a3b8' }}>⏱ {elapsed}</span>

      {/* Beat counter */}
      <span style={{ color: '#e2e8f0', fontWeight: 600 }}>📊 {currentBeat}/{PRESENTATION_BEATS.length}</span>

      {/* Skip to dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowSkip(!showSkip)}
          style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#e2e8f0', cursor: 'pointer' }}
        >
          ⏩ Skip ▾
        </button>
        {showSkip && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px',
            maxHeight: '300px', overflowY: 'auto', zIndex: 1000, minWidth: '220px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            {PRESENTATION_BEATS.map(beat => (
              <button
                key={beat.id}
                onClick={() => { onJumpToBeat(beat.id); setShowSkip(false); }}
                style={{
                  display: 'block', width: '100%', padding: '4px 8px', borderRadius: '4px',
                  border: 'none', background: beat.id === currentBeat ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: beat.id === currentBeat ? '#60a5fa' : '#cbd5e1',
                  cursor: 'pointer', textAlign: 'left', fontSize: '0.6rem', marginBottom: '2px',
                }}
              >
                {beat.id}. {beat.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Toggle sidebar */}
      <button
        onClick={onToggleSidebar}
        title="Toggle sidebar (F)"
        style={{ marginLeft: 'auto', fontSize: '0.65rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
      >
        👁️
      </button>
    </div>
  );
}
