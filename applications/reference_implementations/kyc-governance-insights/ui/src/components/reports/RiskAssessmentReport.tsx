import React, { useState } from 'react';
import { defaultConfig, sectionLabels, frameworkOptions, sampleRecommendations, reportMetadata, type ReportConfig } from '../../data/reportTemplateData';
import { controlMappingData } from '../../data/controlMappingData';
import { traceSummary } from '../../data/decisionTraceData';
import { sampleEvidencePack } from '../../data/evidencePackData';

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2rem', pageBreakInside: 'avoid' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '2px solid var(--accent)', paddingBottom: '6px', marginBottom: '12px' }}>{title}</h2>
      {children}
    </div>
  );
}

interface Props {
  config: ReportConfig;
  onClose: () => void;
}

export default function RiskAssessmentReport({ config, onClose }: Props) {
  const totalControls = controlMappingData.length;
  const passingControls = controlMappingData.filter(c => c.status === 'pass').length;
  const coveragePct = Math.round((passingControls / totalControls) * 100);
  const gaps = controlMappingData.filter(c => c.status === 'fail' || c.status === 'not_assessed');

  return (
    <div className="risk-report" style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', position: 'sticky', top: 0, background: 'var(--bg-primary)', padding: '8px 0', zIndex: 5 }} className="no-print">
        <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.75rem' }}>{'\u2190'} Back</button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => window.print()} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>{'\uD83D\uDDA8\uFE0F'} Print</button>
          <button onClick={() => window.print()} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.75rem' }}>{'\uD83D\uDCE5'} PDF</button>
        </div>
      </div>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 8px' }}>AI Governance Risk Assessment Report</h1>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>KYC Banking Use Case | Generated: {new Date().toLocaleString()}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Frameworks: {config.frameworks.map(f => frameworkOptions.find(fo => fo.id === f)?.label || f).join(', ')}</div>
      </div>

      {/* A: Executive Summary */}
      {config.sections.includes('executive-summary') && (
        <ReportSection title="A. Executive Summary">
          <p style={{ fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            Overall governance posture: <strong style={{ color: '#f59e0b' }}>MODERATE</strong> — {gaps.length} control gaps identified across assessed frameworks,
            with {coveragePct}% control coverage ({passingControls}/{totalControls} controls passing). Evidence completeness at {sampleEvidencePack.completenessScore}%.
            The system currently operates at Autonomy Level 2 (Supervised) with earned autonomy progression tracking 847/1000 clean decisions toward Level 3.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '12px' }}>
            <MetricBox label="Total Controls" value={String(totalControls)} color="#3b82f6" />
            <MetricBox label="Coverage" value={`${coveragePct}%`} color="#10b981" />
            <MetricBox label="Open Gaps" value={String(gaps.length)} color="#ef4444" />
            <MetricBox label="Evidence Score" value={`${sampleEvidencePack.completenessScore}%`} color="#f59e0b" />
          </div>
        </ReportSection>
      )}

      {/* C: Control Mapping Coverage */}
      {config.sections.includes('control-mapping') && (
        <ReportSection title="C. Control Mapping Coverage">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {config.frameworks.map(fw => {
              const fwControls = controlMappingData.filter(c => c.framework_mappings[fw as keyof typeof c.framework_mappings]);
              const fwPass = fwControls.filter(c => c.status === 'pass').length;
              const fwPct = fwControls.length ? Math.round((fwPass / fwControls.length) * 100) : 0;
              return (
                <div key={fw} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '100px' }}>{frameworkOptions.find(f => f.id === fw)?.label}</span>
                  <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                    <div style={{ width: `${fwPct}%`, height: '100%', borderRadius: '4px', background: fwPct >= 90 ? '#10b981' : '#f59e0b' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '40px' }}>{fwPct}%</span>
                </div>
              );
            })}
          </div>
        </ReportSection>
      )}

      {/* D: Gap Analysis */}
      {config.sections.includes('gap-analysis') && gaps.length > 0 && (
        <ReportSection title="D. Gap Analysis">
          <div style={{ fontSize: '0.75rem' }}>
            {gaps.map(g => (
              <div key={g.id} style={{ display: 'flex', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', minWidth: '80px' }}>{g.id}</span>
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{g.name}</span>
                <span style={{ color: g.status === 'fail' ? '#ef4444' : '#f59e0b', fontWeight: 600, minWidth: '60px' }}>{g.status === 'fail' ? 'FAIL' : 'N/A'}</span>
              </div>
            ))}
          </div>
        </ReportSection>
      )}

      {/* F: Decision Trace Summary */}
      {config.sections.includes('decision-traces') && (
        <ReportSection title="F. Decision Trace Summary">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            <MetricBox label="Avg Latency" value={`${traceSummary.avgLatencyMs}ms`} color="#3b82f6" />
            <MetricBox label="Avg Tokens" value={traceSummary.avgTokens.toLocaleString()} color="#8b5cf6" />
            <MetricBox label="Cost/Decision" value={`$${traceSummary.costPerDecision}`} color="#10b981" />
            <MetricBox label="Guardrail Triggers" value={`${traceSummary.guardrailTriggerRate}%`} color="#f59e0b" />
          </div>
        </ReportSection>
      )}

      {/* H: Recommendations */}
      {config.sections.includes('recommendations') && (
        <ReportSection title="H. Recommendations">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sampleRecommendations.map((r, i) => (
              <div key={i} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-card)', borderLeft: `3px solid ${r.priority === 'P1' ? '#ef4444' : r.priority === 'P2' ? '#f59e0b' : '#3b82f6'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{r.description}</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: r.priority === 'P1' ? '#ef4444' : r.priority === 'P2' ? '#f59e0b' : '#3b82f6' }}>{r.priority}</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{r.rationale}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>Owner: {r.owner}</div>
              </div>
            ))}
          </div>
        </ReportSection>
      )}

      {/* Footer */}
      <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
        <div>Report Generated: {new Date().toISOString()}</div>
        <div>Frameworks: {config.frameworks.join(', ')} | Period: {config.dateRange}</div>
        <div>Generated by: {reportMetadata.generatedBy} {reportMetadata.version}</div>
        <div style={{ fontWeight: 600, marginTop: '4px' }}>{reportMetadata.classification}</div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}
