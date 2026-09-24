import { useEffect, useCallback } from 'react';
import type { InfoItem } from '../../data/infoContent';

interface InfoPanelProps {
  item: InfoItem;
  onClose: () => void;
}

export default function InfoPanel({ item, onClose }: InfoPanelProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 900, animation: 'fadeIn 0.2s ease',
        }}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.panelTitle}
        style={{
          position: 'fixed', top: '80px', right: '24px', width: '360px', maxWidth: '90vw',
          maxHeight: 'calc(100vh - 104px)',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          zIndex: 901, padding: '24px', overflowY: 'auto',
          animation: 'slideInRight 0.25s ease',
          display: 'flex', flexDirection: 'column', gap: '16px',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close panel"
          style={{
            position: 'absolute', top: '12px', right: '12px',
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: '18px', cursor: 'pointer',
          }}
        >
          ✕
        </button>

        {/* Title */}
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, paddingRight: '24px' }}>
          {item.panelTitle}
        </h2>

        {/* Description */}
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          {item.panelDescription}
        </p>

        {/* What feeds this (composite contributors) */}
        {item.contributors && item.contributors.length > 0 && (
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
              What feeds this
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {item.contributors.map((c, i) => (
                <li key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Why it matters */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px 14px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Why this matters
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.6 }}>
            {item.whyItMatters}
          </p>
        </div>

        {/* AWS Docs link */}
        {item.awsDocsUrl && (
          <a
            href={item.awsDocsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '0.75rem', color: 'var(--accent)',
              textDecoration: 'none', borderBottom: '1px dotted var(--accent)',
            }}
          >
            View AWS Documentation →
          </a>
        )}

        {/* Learn more (research corpus reference) */}
        {item.learnMore && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            📄 See: <span style={{ color: 'var(--text-secondary)' }}>{item.learnMore}</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
