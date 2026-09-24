import React from 'react';

export default function CROArchitectureSimple() {
  return (
    <div data-testid="fleet.architecture-simple" style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
        How the system works — from request to audited decision in 40 seconds.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '12px 0' }}>
        {/* Box 1: Input */}
        <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', textAlign: 'center', width: '180px', background: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>📥</div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Input</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>KYC requests from business lines (100s/day)</div>
        </div>

        {/* Arrow */}
        <div style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>→</div>

        {/* Box 2: AI Engine */}
        <div style={{ border: '2px solid var(--accent)', borderRadius: '10px', padding: '16px', textAlign: 'center', width: '240px', background: 'rgba(59,130,246,0.05)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>🤖</div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>AI Decision Engine</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>6 agents · Cedar policies · Human oversight · Full audit</div>
        </div>

        {/* Arrow */}
        <div style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>→</div>

        {/* Box 3: Output */}
        <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', textAlign: 'center', width: '180px', background: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>📤</div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Output</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>Audited decisions + evidence packs (40 sec avg)</div>
        </div>
      </div>
    </div>
  );
}
