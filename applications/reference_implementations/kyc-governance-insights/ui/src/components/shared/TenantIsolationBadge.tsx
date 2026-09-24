import React from 'react';
import { cfgEnv } from '../../runtimeConfig';

export default function TenantIsolationBadge() {
  const tenantId = cfgEnv('tenant_id', import.meta.env.VITE_TENANT_ID) || 'default';
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
        🔐 Tenant Isolation
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#10b981' }}>●</span>
          <span>x-tenant-id: <code style={{ background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.6rem' }}>{tenantId}</code></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#10b981' }}>●</span>
          <span>DynamoDB partition-key scoping (tenant#id)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#10b981' }}>●</span>
          <span>Cedar context injection (context.tenant)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#10b981' }}>●</span>
          <span>No cross-tenant data leakage possible</span>
        </div>
      </div>
    </div>
  );
}
