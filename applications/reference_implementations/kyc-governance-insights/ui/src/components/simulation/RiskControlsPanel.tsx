import React from 'react';
import { usePersona } from '../../contexts/PersonaContext';
import { getPlainLabel } from '../../data/plainEnglishLabels';

interface RiskControlsPanelProps {
  risks: string[];
  controls: string[];
}

const RiskControlsPanel: React.FC<RiskControlsPanelProps> = ({ risks, controls }) => {
  const { persona } = usePersona();
  const isPlainEnglish = persona === 'cro-fleet' || persona === 'compliance';
  const showRegulation = persona === 'compliance';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
      {/* Risks Column */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: '8px',
          padding: '10px 12px',
        }}
      >
        <div
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--text-muted)',
            marginBottom: '8px',
          }}
        >
          ⚠️ Risks
        </div>
        {risks.map((risk, index) => {
          const label = isPlainEnglish ? (getPlainLabel(risk, 'risk')?.plain || risk) : risk;
          const description = isPlainEnglish ? getPlainLabel(risk, 'risk')?.description : undefined;
          const regulation = showRegulation ? getPlainLabel(risk, 'risk')?.regulation : undefined;

          return (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                padding: '5px 0',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  marginTop: '3px',
                  flexShrink: 0,
                }}
              />
              <div>
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.4',
                    fontWeight: isPlainEnglish ? 600 : 400,
                  }}
                >
                  {label}
                </span>
                {description && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                    {description}
                  </div>
                )}
                {regulation && (
                  <div style={{ fontSize: '9px', color: '#81c784', marginTop: '2px', fontStyle: 'italic' }}>
                    📋 {regulation}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls Column */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: '8px',
          padding: '10px 12px',
        }}
      >
        <div
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--text-muted)',
            marginBottom: '8px',
          }}
        >
          🛡️ Controls
        </div>
        {controls.map((control, index) => {
          const label = isPlainEnglish ? (getPlainLabel(control, 'control')?.plain || control) : control;
          const description = isPlainEnglish ? getPlainLabel(control, 'control')?.description : undefined;
          const regulation = showRegulation ? getPlainLabel(control, 'control')?.regulation : undefined;

          return (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                padding: '5px 0',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#ff9900',
                  marginTop: '3px',
                  flexShrink: 0,
                }}
              />
              <div>
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.4',
                    fontWeight: isPlainEnglish ? 600 : 400,
                  }}
                >
                  {label}
                </span>
                {description && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                    {description}
                  </div>
                )}
                {regulation && (
                  <div style={{ fontSize: '9px', color: '#81c784', marginTop: '2px', fontStyle: 'italic' }}>
                    📋 {regulation}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RiskControlsPanel;
