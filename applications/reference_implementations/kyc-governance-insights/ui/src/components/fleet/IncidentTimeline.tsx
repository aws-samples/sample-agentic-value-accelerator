import React, { useState } from 'react';
import { incidents, nearMisses, getIncidentSummary, type Incident } from '../../data/incidentData';

const severityColors: Record<string, { color: string; bg: string }> = {
  HIGH: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  MEDIUM: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  LOW: { color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
};

const statusLabels: Record<string, string> = {
  under_investigation: 'Under investigation',
  contained: 'Contained',
  resolved: 'Resolved',
};

function IncidentCard({ incident }: { incident: Incident }) {
  const [expanded, setExpanded] = useState(false);
  const sev = severityColors[incident.severity];

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
      >
        <span style={{ fontSize: '0.9rem' }}>{incident.severity === 'HIGH' ? '🔴' : '🟡'}</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', minWidth: '50px' }}>{incident.date.slice(5)}</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{incident.title}</span>
        <span style={{ fontSize: '0.58rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: sev.bg, color: sev.color }}>
          {incident.severity}
        </span>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{statusLabels[incident.status]}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>▶</span>
      </div>
      {!expanded && (
        <div style={{ padding: '0 16px 10px', fontSize: '0.63rem', color: 'var(--text-muted)' }}>
          Impact: {incident.impact}
        </div>
      )}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingTop: '12px', fontSize: '0.63rem' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Impact</div>
              <div style={{ color: 'var(--text-secondary)' }}>{incident.impact}</div>
              <div style={{ color: 'var(--text-muted)', marginTop: '8px', marginBottom: '4px' }}>Root Cause</div>
              <div style={{ color: 'var(--text-secondary)' }}>{incident.rootCause}</div>
              <div style={{ color: 'var(--text-muted)', marginTop: '8px', marginBottom: '4px' }}>Containment</div>
              <div style={{ color: 'var(--text-secondary)' }}>{incident.containment}</div>
              {incident.eta && (
                <>
                  <div style={{ color: 'var(--text-muted)', marginTop: '8px', marginBottom: '4px' }}>ETA to Resolution</div>
                  <div style={{ color: '#f59e0b', fontWeight: 600 }}>{incident.eta}</div>
                </>
              )}
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: '6px' }}>Timeline</div>
              {incident.timeline.map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', minWidth: '38px' }}>{entry.time}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{entry.action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IncidentTimeline() {
  const summary = getIncidentSummary();

  return (
    <div data-testid="fleet.incident-log" style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Incidents & Near-Misses (Last 30 Days)
        </h3>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          {summary.totalIncidents} incident{summary.totalIncidents !== 1 ? 's' : ''} ({summary.contained} contained, {summary.underInvestigation} under investigation) • {summary.nearMissCount} near-misses blocked
        </div>
      </div>

      {/* Incidents */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '0.63rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
          Incidents
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {incidents.map(inc => <IncidentCard key={inc.id} incident={inc} />)}
        </div>
      </div>

      {/* Near-Misses */}
      <div>
        <div style={{ fontSize: '0.63rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
          Near-Misses (Governance Controls Prevented)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {nearMisses.map(nm => (
            <div key={nm.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
              <span style={{ fontSize: '0.75rem' }}>✅</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', minWidth: '50px' }}>{nm.date.slice(5)}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', flex: 1 }}>{nm.title}</span>
              <span style={{ fontSize: '0.55rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 600 }}>
                {nm.controlType}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
