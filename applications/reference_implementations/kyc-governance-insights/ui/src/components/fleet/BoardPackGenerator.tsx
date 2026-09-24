import React, { useState } from 'react';
import { riskAppetiteConfig, computeRag, computeGap, type RagStatus } from '../../data/riskAppetiteData';
import { fleetKriTrends } from '../../data/kriTrendData';
import { getIncidentSummary, incidents, nearMisses } from '../../data/incidentData';
import { boardRecommendations, attestationSummary } from '../../data/boardPackData';

const ragIcons: Record<RagStatus, string> = { green: '🟢', amber: '🟡', red: '🔴' };

function formatToday(): string {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BoardPackGenerator() {
  const [showPack, setShowPack] = useState(false);
  const incidentSummary = getIncidentSummary();

  if (!showPack) {
    return (
      <div data-testid="fleet.board-pack">
        <button
          onClick={() => setShowPack(true)}
          style={{
            padding: '10px 20px', borderRadius: '8px', border: 'none',
            background: 'var(--accent)', color: '#fff', fontWeight: 700,
            fontSize: '0.8rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          📋 Generate Board Pack
        </button>
      </div>
    );
  }

  return (
    <div data-testid="fleet.board-pack" style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '2px solid var(--accent)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-secondary)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            FLEET AI GOVERNANCE — BOARD SUMMARY
          </h3>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{formatToday()}</span>
        </div>
        <button onClick={() => setShowPack(false)} style={{ fontSize: '0.7rem', padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
          ✕ Close
        </button>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Fleet Health */}
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Fleet Health (Risk Appetite Alignment)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {riskAppetiteConfig.thresholds.map(t => {
              const rag = computeRag(t);
              const gap = computeGap(t);
              return (
                <div key={t.useCaseId} style={{ background: 'var(--bg-secondary)', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t.label}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t.actual}</div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Floor: {t.floor}</div>
                  <div style={{ marginTop: '4px' }}>{ragIcons[rag]}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trend Direction */}
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Trend Direction (30 days)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.68rem' }}>
            {fleetKriTrends.map(kri => {
              const dirColor = kri.direction === 'improving' ? '#10b981' : kri.direction === 'degrading' ? '#ef4444' : '#64748b';
              const arrow = kri.direction === 'improving' ? '↑' : kri.direction === 'degrading' ? '↓' : '→';
              return (
                <span key={kri.label} style={{ color: 'var(--text-secondary)' }}>
                  {kri.label}: <strong style={{ color: dirColor }}>{arrow} {kri.direction.charAt(0).toUpperCase() + kri.direction.slice(1)}</strong>
                </span>
              );
            })}
          </div>
        </div>

        {/* Open Incidents */}
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Open Incidents
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {incidents.map(inc => (
              <div key={inc.id}>
                • {inc.status === 'under_investigation' ? '1 under investigation' : '1 contained'} ({inc.title}) {inc.eta ? `— ETA: ${inc.eta}` : '— root cause resolved'}
              </div>
            ))}
            <div>• {nearMisses.length} near-misses blocked by Cedar (governance working)</div>
          </div>
        </div>

        {/* Attestation Status */}
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Attestation Status
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.65rem' }}>
            {attestationSummary.map(a => (
              <span key={a.useCase} style={{ color: a.status === 'paused' ? '#f59e0b' : 'var(--text-secondary)' }}>
                {a.useCase}: {a.status === 'attested' ? '✓ Attested' : `⚠️ PAUSED (${a.note})`}
              </span>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '14px', borderLeft: '3px solid var(--accent)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Key Recommendation
          </div>
          {boardRecommendations.map((rec, i) => (
            <div key={i} style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: i < boardRecommendations.length - 1 ? '8px' : 0, fontStyle: 'italic' }}>
              "{rec.text}"
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
