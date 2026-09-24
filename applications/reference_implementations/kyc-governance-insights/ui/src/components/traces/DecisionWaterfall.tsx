import React, { useState } from 'react';
import { decisionTraces, traceSummary, type DecisionTrace, type TraceStep } from '../../data/decisionTraceData';

const componentColors: Record<string, string> = {
  cedar: '#8b5cf6', guardrail: '#f59e0b', model: '#3b82f6', tool: '#06b6d4', decision: '#10b981', request: '#64748b',
};
const statusColors: Record<string, string> = { pass: '#10b981', fail: '#ef4444', warn: '#f59e0b', info: '#64748b' };

function StepRow({ step, maxMs }: { step: TraceStep; maxMs: number }) {
  const [open, setOpen] = useState(false);
  const barWidth = Math.max(4, (step.latencyMs / maxMs) * 100);
  return (
    <>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', minWidth: '40px', fontFamily: 'var(--font-mono)' }}>{step.offsetMs}ms</span>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColors[step.status] }} />
        <span style={{ fontSize: '0.55rem', fontWeight: 600, color: componentColors[step.component], minWidth: '55px' }}>{step.component.toUpperCase()}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)', flex: 1 }}>{step.label}</span>
        <div style={{ width: '60px', height: '4px', borderRadius: '2px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
          <div style={{ width: `${barWidth}%`, height: '100%', background: componentColors[step.component], borderRadius: '2px' }} />
        </div>
        <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', minWidth: '30px', textAlign: 'right' }}>{step.latencyMs}ms</span>
      </div>
      {open && (
        <div style={{ padding: '4px 8px 4px 56px', fontSize: '0.6rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
          {step.detail}
        </div>
      )}
      {step.children?.map(child => (
        <div key={child.id} style={{ paddingLeft: '20px' }}>
          <StepRow step={child} maxMs={maxMs} />
        </div>
      ))}
    </>
  );
}

export default function DecisionWaterfall() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const trace = decisionTraces[selectedIdx];
  const maxMs = Math.max(...trace.steps.map(s => s.latencyMs), 1);

  return (
    <div data-testid="observability.waterfall" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        <SummaryCard label="Avg Latency" value={`${traceSummary.avgLatencyMs}ms`} color="#3b82f6" />
        <SummaryCard label="Avg Tokens" value={traceSummary.avgTokens.toLocaleString()} color="#8b5cf6" />
        <SummaryCard label="Cost/Decision" value={`$${traceSummary.costPerDecision}`} color="#10b981" />
        <SummaryCard label="Guardrail Triggers" value={`${traceSummary.guardrailTriggerRate}%`} color={traceSummary.guardrailTriggerRate > 5 ? '#ef4444' : '#10b981'} />
      </div>

      {/* Trace selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <select value={selectedIdx} onChange={e => setSelectedIdx(Number(e.target.value))}
          style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
          {decisionTraces.map((t, i) => (
            <option key={t.id} value={i}>{t.customerName} ({t.decision}) — {t.totalLatencyMs}ms</option>
          ))}
        </select>
        <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 600 }}>
          OpenTelemetry {'\u2713'} | CloudTrail {'\u2713'} | Immutable
        </span>
      </div>

      {/* Waterfall */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{trace.customerName} — {trace.decision}</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{trace.totalLatencyMs}ms | {trace.totalTokens} tokens | ${trace.costUsd}</span>
        </div>
        {trace.steps.map(step => <StepRow key={step.id} step={step} maxMs={maxMs} />)}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}
