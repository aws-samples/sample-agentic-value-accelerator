import React from 'react';
import { PRESENTATION_BEATS } from '../../data/presentationBeats';
import type { Persona } from '../../contexts/PersonaContext';

const personaColors: Record<Persona, string> = {
  'cro-fleet': '#3b82f6',
  'business-ops': '#10b981',
  'compliance': '#8b5cf6',
  'engineering': '#f59e0b',
};

interface BeatIndicatorProps {
  currentBeat: number;
  onBeatClick: (beatId: number) => void;
}

export default function BeatIndicator({ currentBeat, onBeatClick }: BeatIndicatorProps) {
  return (
    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'center', padding: '8px 0' }}>
      {PRESENTATION_BEATS.map(beat => {
        const isCurrent = beat.id === currentBeat;
        const color = personaColors[beat.persona];
        return (
          <button
            key={beat.id}
            onClick={() => onBeatClick(beat.id)}
            title={`Beat ${beat.id}: ${beat.title}`}
            style={{
              width: isCurrent ? '12px' : '8px',
              height: isCurrent ? '12px' : '8px',
              borderRadius: '50%',
              border: 'none',
              background: isCurrent ? color : `${color}40`,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              padding: 0,
            }}
          />
        );
      })}
    </div>
  );
}
