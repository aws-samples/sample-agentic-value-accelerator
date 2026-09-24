import React, { useState } from 'react';
import {
  modelInventory,
  computeValidationStatus,
  getNextValidationDate,
  getDaysUntilValidation,
  type ModelEntry,
  type ValidationStatus,
  type RiskTier,
} from '../../data/modelInventoryData';

const statusConfig: Record<ValidationStatus, { icon: string; color: string; bg: string; label: string }> = {
  validated: { icon: '✅', color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Validated' },
  expiring: { icon: '⚠️', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Expiring' },
  overdue: { icon: '❌', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Overdue' },
};

const tierConfig: Record<RiskTier, { color: string; bg: string }> = {
  High: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  Limited: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  Minimal: { color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
};

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function MetricBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= 95 ? '#10b981' : value >= 85 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.63rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600, color }}>{value}%</span>
      </div>
      <div style={{ height: '4px', borderRadius: '2px', background: 'var(--border)' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '2px', background: color, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

function ModelRow({ model, expanded, onToggle, readOnly = false }: {
  model: ModelEntry;
  expanded: boolean;
  onToggle: () => void;
  readOnly?: boolean;
}) {
  const status = computeValidationStatus(model);
  const cfg = statusConfig[status];
  const tier = tierConfig[model.riskTier];
  const nextDue = getNextValidationDate(model);
  const daysLeft = getDaysUntilValidation(model);

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      {/* Main row */}
      <div
        onClick={onToggle}
        style={{ display: 'grid', gridTemplateColumns: '140px 60px 90px 80px 110px 130px 1fr', alignItems: 'center', padding: '14px 16px', cursor: 'pointer', transition: 'background 0.15s', gap: '8px' }}
      >
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{model.name}</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{model.version}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{model.provider}</span>
        <span style={{ fontSize: '0.63rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: tier.bg, color: tier.color, textAlign: 'center' }}>
          {model.riskTier}
        </span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{formatDate(model.lastValidated)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.63rem', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: cfg.bg, color: cfg.color }}>
          {cfg.icon} {cfg.label}
          {status === 'expiring' && <span style={{ fontSize: '0.58rem', fontWeight: 400 }}>(due {formatDate(nextDue)})</span>}
        </span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{model.purpose}</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 20px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', paddingTop: '16px' }}>
            {/* Left: Model Card */}
            <div>
              <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>Model Card</h4>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <strong>Capabilities:</strong> {model.capabilities}
              </div>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <strong>Limitations:</strong> {model.limitations}
              </div>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <strong>Training Data:</strong> {model.trainingDataDescription}
              </div>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <strong>Bias Assessment ({formatDate(model.biasAssessmentDate)}):</strong> {model.biasAssessmentResult}
              </div>

              {/* Data Inputs & Outputs */}
              <h4 style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', margin: '12px 0 6px' }}>Data Flow</h4>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Inputs:</div>
              {model.dataInputs.map((d, i) => (
                <div key={i} style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', paddingLeft: '8px' }}>• {d}</div>
              ))}
              <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', marginTop: '8px', marginBottom: '4px' }}>Output:</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', paddingLeft: '8px' }}>{model.outputType}</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', marginTop: '8px', marginBottom: '4px' }}>Downstream:</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', paddingLeft: '8px' }}>{model.downstreamConsumers.join(', ')}</div>
            </div>

            {/* Right: Performance Metrics + Regulatory */}
            <div>
              <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>Performance Metrics</h4>
              {model.performanceMetrics.accuracy !== undefined && <MetricBar label="Accuracy" value={model.performanceMetrics.accuracy} />}
              {model.performanceMetrics.precision !== undefined && <MetricBar label="Precision" value={model.performanceMetrics.precision} />}
              {model.performanceMetrics.recall !== undefined && <MetricBar label="Recall" value={model.performanceMetrics.recall} />}
              {model.performanceMetrics.f1 !== undefined && <MetricBar label="F1 Score" value={model.performanceMetrics.f1} />}
              {model.performanceMetrics.reasoningQuality !== undefined && <MetricBar label="Reasoning Quality" value={model.performanceMetrics.reasoningQuality} />}
              {model.performanceMetrics.latencyP50Ms !== undefined && (
                <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Latency: P50 {model.performanceMetrics.latencyP50Ms}ms | P99 {model.performanceMetrics.latencyP99Ms}ms
                </div>
              )}

              {/* Validation Info */}
              <h4 style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', margin: '16px 0 6px' }}>Validation</h4>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-secondary)' }}>
                Last validated: {formatDate(model.lastValidated)}<br />
                Next due: {formatDate(nextDue)} ({daysLeft > 0 ? `${daysLeft} days` : `${Math.abs(daysLeft)} days overdue`})<br />
                Cadence: {model.validationCadence} days
              </div>

              {/* Regulatory References */}
              <h4 style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', margin: '16px 0 6px' }}>Regulatory References</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {model.regulatoryReferences.map((r, i) => (
                  <span key={i} style={{ fontSize: '0.58rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ModelInventoryProps {
  readOnly?: boolean; // Engineering persona: expanded tech details, no actions
}

export default function ModelInventory({ readOnly = false }: ModelInventoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(readOnly ? modelInventory[0]?.id ?? null : null);
  const activeCount = modelInventory.length;

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            AI Model Inventory
          </h3>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            EU AI Act Annex VIII–compliant registry • PRA SS1/23 Principle 1
          </p>
        </div>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: '6px', background: 'var(--bg-card)' }}>
          {activeCount} Models Active
        </span>
      </div>

      {/* Column Headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '140px 60px 90px 80px 110px 130px 1fr', padding: '8px 16px', borderBottom: '2px solid var(--border)', gap: '8px' }}>
        {['Model', 'Ver', 'Provider', 'Risk Tier', 'Last Valid.', 'Status', 'Purpose'].map(h => (
          <span key={h} style={{ fontSize: '0.63rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      {modelInventory.map(model => (
        <ModelRow
          key={model.id}
          model={model}
          expanded={expandedId === model.id}
          onToggle={() => setExpandedId(expandedId === model.id ? null : model.id)}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}
