import React from 'react';
import { PROFILES } from '../../data/autonomyProfiles';
import { usePolicyConfig } from '../../contexts/PolicyConfigContext';

export default function ProfileSelector() {
  const { activeProfile, isCustom, applying, applyProfile } = usePolicyConfig();

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Autonomy Profile</div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {PROFILES.map(p => (
          <button
            key={p.id}
            onClick={() => applyProfile(p.id)}
            disabled={applying}
            style={{
              padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: activeProfile.id === p.id && !isCustom ? 'rgba(59,130,246,0.2)' : 'var(--bg-secondary)',
              color: activeProfile.id === p.id && !isCustom ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: 600, fontSize: '0.75rem', transition: 'all 0.2s',
            }}
          >
            {p.name} ({p.level})
          </button>
        ))}
        {isCustom && (
          <span style={{ padding: '8px 14px', borderRadius: '8px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 600, fontSize: '0.75rem' }}>
            Custom
          </span>
        )}
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px' }}>
        {isCustom ? 'Parameters manually adjusted' : activeProfile.description}
      </div>
      {applying && <div style={{ fontSize: '0.65rem', color: '#10b981', marginTop: '4px' }}>Applying policy...</div>}
    </div>
  );
}
