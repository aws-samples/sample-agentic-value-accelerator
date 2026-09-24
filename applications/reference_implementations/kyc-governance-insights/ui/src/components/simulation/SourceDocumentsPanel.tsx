import { useState } from 'react';
import type { SourceDocument } from '../../data/sourceDocumentsData';

interface SourceDocumentsPanelProps {
  documents: SourceDocument[];
}

export default function SourceDocumentsPanel({ documents }: SourceDocumentsPanelProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <div style={{ marginBottom: '12px' }}>
      <div
        style={{
          fontSize: '9px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--text-muted)',
          marginBottom: '6px',
        }}
      >
        📁 Source Documents Ingested
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {documents.map((doc, i) => (
          <div
            key={i}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{
              position: 'relative',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '6px 10px',
              cursor: 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
              borderColor: hoveredIdx === i ? 'var(--accent)' : 'var(--border)',
            }}
          >
            <span style={{ fontSize: '14px' }}>{doc.icon}</span>
            <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-secondary)' }}>
              {doc.type}
            </span>
            {doc.confidence && (
              <span
                style={{
                  fontSize: '8px',
                  fontWeight: 600,
                  padding: '1px 4px',
                  borderRadius: '3px',
                  background: 'rgba(76, 175, 80, 0.12)',
                  color: '#4caf50',
                }}
              >
                {doc.confidence}
              </span>
            )}

            {/* Expanded tooltip on hover */}
            {hoveredIdx === i && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '6px',
                  background: '#1e293b',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  zIndex: 50,
                  width: '280px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
                  {doc.title}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {doc.details.map((detail, j) => (
                    <div
                      key={j}
                      style={{
                        fontSize: '10px',
                        color: detail.includes('⚠') ? '#ffd54f' : '#94a3b8',
                        fontWeight: detail.includes('⚠') ? 600 : 400,
                        lineHeight: 1.4,
                      }}
                    >
                      {detail}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
