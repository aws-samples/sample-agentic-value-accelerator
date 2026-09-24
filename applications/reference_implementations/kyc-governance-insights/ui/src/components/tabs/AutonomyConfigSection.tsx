import React, { useState } from 'react';
import {
  currentAutonomyLevel,
  autonomyLevels,
  autonomyConfig,
  promotionCriteria,
  alarms,
  configAuditLog,
  autoTightenEvents,
} from '../../data/autonomyConfigData';
import type { AutonomyParameter } from '../../data/autonomyConfigData';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function ParameterSlider({ param }: { param: AutonomyParameter }) {
  const [val, setVal] = useState(typeof param.value === 'number' ? param.value : param.envelope.min);
  const { min, max } = param.envelope;
  const range = max - min;
  const pct = ((val - min) / range) * 100;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)' }}>{param.label}</span>
        {param.requiresApproval && (
          <span style={{ fontSize: '0.5rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 600 }}>APPROVAL REQ</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{min}</span>
        <div style={{ flex: 1, position: 'relative', height: '6px', borderRadius: '3px', background: '#2a3548' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, borderRadius: '3px', background: pct > 80 ? '#f59e0b' : '#10b981', transition: 'width 0.2s' }} />
          <div style={{ position: 'absolute', top: '-3px', left: `${pct}%`, transform: 'translateX(-50%)', width: '12px', height: '12px', borderRadius: '50%', background: pct > 80 ? '#f59e0b' : '#10b981', border: '2px solid var(--bg-card)' }} />
        </div>
        <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{max}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={range > 10 ? 1 : 0.01}
        value={val}
        onChange={(e) => setVal(Number(e.target.value))}
        style={{ width: '100%', height: '4px', opacity: 0, position: 'relative', marginTop: '-10px', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {param.unit === '£' || param.unit === '£ threshold' ? `£${val.toLocaleString()}` : `${typeof val === 'number' && val % 1 !== 0 ? val.toFixed(2) : val} ${param.unit}`}
        </span>
        <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>{param.owner}</span>
      </div>
      <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginTop: '2px' }}>
        Last changed: {formatDate(param.lastChanged)} by {param.changedBy.split('@')[0]}
      </div>
    </div>
  );
}

export const AutonomyConfigSection: React.FC = () => {
  const [auditFilter, setAuditFilter] = useState('');
  const level = autonomyLevels[currentAutonomyLevel];
  const metCriteria = promotionCriteria.filter(c => c.met).length;
  const totalCriteria = promotionCriteria.length;
  const promotionPct = Math.round((metCriteria / totalCriteria) * 100);
  const rateThrottleParam = autonomyConfig.find(p => p.id === 'rate_throttle');
  const throttleUsage = 72;

  const filteredAudit = auditFilter
    ? configAuditLog.filter(e =>
        e.parameter.toLowerCase().includes(auditFilter.toLowerCase()) ||
        e.who.toLowerCase().includes(auditFilter.toLowerCase())
      )
    : configAuditLog;

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1rem 0' }}>
        Autonomy Configuration
      </h2>

      {/* Autonomy Level Card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '12px',
            background: `${level.color}22`, border: `2px solid ${level.color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem', fontWeight: 800, color: level.color,
          }}>
            L{currentAutonomyLevel}
          </div>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{level.name}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{level.description}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px' }}>Human role: <strong>{level.humanRole}</strong></div>
          </div>
        </div>

        {/* Level pills */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '1rem' }}>
          {autonomyLevels.map(l => (
            <div key={l.level} style={{
              flex: 1, height: '6px', borderRadius: '3px',
              background: l.level <= currentAutonomyLevel ? l.color : '#2a3548',
              opacity: l.level <= currentAutonomyLevel ? 1 : 0.4,
            }} />
          ))}
        </div>

        {/* Promotion progress */}
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Promotion to L{currentAutonomyLevel + 1} Progress
            </span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: promotionPct >= 80 ? '#10b981' : '#f59e0b' }}>
              {metCriteria}/{totalCriteria} criteria met ({promotionPct}%)
            </span>
          </div>
          <div style={{ height: '8px', borderRadius: '4px', background: '#2a3548', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${promotionPct}%`, borderRadius: '4px', background: promotionPct >= 80 ? '#10b981' : '#f59e0b', transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* Criteria list */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '4px' }}>
          {promotionCriteria.map(c => (
            <div key={c.metric} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
              <span style={{ color: c.met ? '#10b981' : '#ef4444', fontWeight: 700 }}>{c.met ? '✓' : '✗'}</span>
              <span>{c.metric}: {c.currentValue} / {c.requiredValue} required</span>
            </div>
          ))}
        </div>
      </div>

      {/* Parameter Grid */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.5rem' }}>
          Business-Configurable Parameters
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
          {autonomyConfig.map(param => (
            <ParameterSlider key={param.id} param={param} />
          ))}
        </div>
      </div>

      {/* Alarms Panel */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.75rem' }}>
          Alarms & Rate Throttle
        </div>

        {/* Alarm list */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
          {alarms.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: a.status === 'firing' ? '#ef4444' : '#10b981',
                boxShadow: a.status === 'firing' ? '0 0 6px #ef4444' : 'none',
                animation: a.status === 'firing' ? 'pulse 1.5s infinite' : 'none',
              }} />
              <div>
                <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-primary)' }}>{a.name}</div>
                <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>
                  {a.status === 'firing' ? 'FIRING' : 'OK'} {'•'} {a.threshold}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Rate throttle bar */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Rate Throttle Utilisation</span>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: throttleUsage > 80 ? '#f59e0b' : '#10b981' }}>{throttleUsage}% ({Math.round(throttleUsage * (rateThrottleParam?.value as number || 100) / 100)}/{rateThrottleParam?.value as number || 100} decisions/hr)</span>
          </div>
          <div style={{ height: '6px', borderRadius: '3px', background: '#2a3548' }}>
            <div style={{ height: '100%', width: `${throttleUsage}%`, borderRadius: '3px', background: throttleUsage > 80 ? '#f59e0b' : '#10b981' }} />
          </div>
        </div>

        {/* Auto-tighten events */}
        <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Auto-Tighten Event Log (last 30 days)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {autoTightenEvents.map(evt => (
            <div key={evt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '0.4rem 0.6rem', background: 'var(--bg-primary)', borderRadius: '4px', borderLeft: '3px solid #ef4444' }}>
              <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingTop: '1px' }}>{formatDate(evt.triggeredAt)}</span>
              <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)' }}>{evt.policyChange}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Config Audit Trail */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Configuration Audit Trail
          </span>
          <input
            type="text"
            placeholder="Filter by parameter or user..."
            value={auditFilter}
            onChange={(e) => setAuditFilter(e.target.value)}
            style={{
              fontSize: '0.6rem', padding: '4px 8px', borderRadius: '4px',
              border: '1px solid var(--border)', background: 'var(--bg-secondary)',
              color: 'var(--text-primary)', width: '180px', outline: 'none',
            }}
          />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.6rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px', color: 'var(--text-muted)', fontWeight: 600 }}>When</th>
              <th style={{ textAlign: 'left', padding: '6px', color: 'var(--text-muted)', fontWeight: 600 }}>Who</th>
              <th style={{ textAlign: 'left', padding: '6px', color: 'var(--text-muted)', fontWeight: 600 }}>Parameter</th>
              <th style={{ textAlign: 'left', padding: '6px', color: 'var(--text-muted)', fontWeight: 600 }}>Change</th>
              <th style={{ textAlign: 'left', padding: '6px', color: 'var(--text-muted)', fontWeight: 600 }}>Reason</th>
              <th style={{ textAlign: 'left', padding: '6px', color: 'var(--text-muted)', fontWeight: 600 }}>Approved By</th>
            </tr>
          </thead>
          <tbody>
            {filteredAudit.map((entry, i) => (
              <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}>
                <td style={{ padding: '6px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(entry.timestamp)}</td>
                <td style={{ padding: '6px', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{
                      width: '16px', height: '16px', borderRadius: '50%', fontSize: '0.45rem', fontWeight: 700,
                      background: entry.who === 'SYSTEM' ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)',
                      color: entry.who === 'SYSTEM' ? '#ef4444' : '#3b82f6',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {entry.who === 'SYSTEM' ? 'S' : entry.who.charAt(0).toUpperCase()}
                    </span>
                    {entry.who === 'SYSTEM' ? 'SYSTEM' : entry.who.split('@')[0]}
                  </span>
                </td>
                <td style={{ padding: '6px', color: 'var(--text-primary)', fontWeight: 500 }}>{entry.parameter}</td>
                <td style={{ padding: '6px', color: 'var(--text-secondary)' }}>
                  <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{entry.oldValue}</span>
                  {' \u2192 '}
                  <span style={{ color: '#10b981', fontWeight: 600 }}>{entry.newValue}</span>
                </td>
                <td style={{ padding: '6px', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.reason}</td>
                <td style={{ padding: '6px', color: 'var(--text-muted)' }}>{entry.approvedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

export default AutonomyConfigSection;
