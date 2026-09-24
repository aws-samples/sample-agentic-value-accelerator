import React, { useState } from 'react';
import { PRESENTATION_BEATS, type StoryBeat } from '../../data/presentationBeats';
import PresenterTools from './PresenterTools';
import BeatIndicator from './BeatIndicator';

interface NarrativeSidebarProps {
  currentBeat: number;
  onNext: () => void;
  onPrev: () => void;
  onJumpToBeat: (beatId: number) => void;
  onToggleSidebar: () => void;
  startTime: number;
}

export default function NarrativeSidebar({ currentBeat, onNext, onPrev, onJumpToBeat, onToggleSidebar, startTime }: NarrativeSidebarProps) {
  const [showNotes, setShowNotes] = useState(false);
  const beat = PRESENTATION_BEATS.find(b => b.id === currentBeat) || PRESENTATION_BEATS[0];

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: '#0f172a', color: '#e2e8f0', overflow: 'hidden',
    }}>
      {/* Presenter Tools */}
      <PresenterTools
        currentBeat={currentBeat}
        onJumpToBeat={onJumpToBeat}
        onToggleSidebar={onToggleSidebar}
        startTime={startTime}
      />

      {/* Main content — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Beat indicator dots */}
        <BeatIndicator currentBeat={currentBeat} onBeatClick={onJumpToBeat} />

        {/* Beat number */}
        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
          Beat {beat.id} of {PRESENTATION_BEATS.length}
        </div>

        {/* Title */}
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9', margin: 0, lineHeight: 1.2 }}>
          {beat.title}
        </h2>

        {/* Talking Points */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {beat.talkingPoints.map((point, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ color: '#60a5fa', fontSize: '0.7rem', marginTop: '2px' }}>•</span>
              <span style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.5 }}>{point}</span>
            </div>
          ))}
        </div>

        {/* What to Notice */}
        {beat.whatToNotice && (
          <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', padding: '10px 14px' }}>
            <div style={{ fontSize: '0.6rem', color: '#60a5fa', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase' }}>
              What to notice
            </div>
            <div style={{ fontSize: '0.75rem', color: '#93c5fd' }}>
              {beat.whatToNotice}
            </div>
          </div>
        )}

        {/* Speaker Notes (collapsible) */}
        {beat.notes && (
          <div>
            <button
              onClick={() => setShowNotes(!showNotes)}
              style={{ fontSize: '0.6rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}
            >
              {showNotes ? '▼' : '▶'} Speaker Notes
            </button>
            {showNotes && (
              <div style={{ marginTop: '8px', padding: '10px 12px', background: 'rgba(100,116,139,0.1)', borderRadius: '6px', fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.5 }}>
                {beat.notes}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={onPrev}
          disabled={currentBeat <= 1}
          style={{
            fontSize: '0.72rem', padding: '6px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent', color: currentBeat <= 1 ? '#475569' : '#e2e8f0',
            cursor: currentBeat <= 1 ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          ◀ PREV
        </button>
        <button
          onClick={onNext}
          disabled={currentBeat >= PRESENTATION_BEATS.length}
          style={{
            fontSize: '0.72rem', padding: '6px 14px', borderRadius: '6px', border: 'none',
            background: currentBeat >= PRESENTATION_BEATS.length ? '#334155' : '#3b82f6',
            color: '#fff', cursor: currentBeat >= PRESENTATION_BEATS.length ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          NEXT ▶
        </button>
      </div>
    </div>
  );
}
