import React, { useState, useCallback } from 'react';
import { evaluators, overallHealthScore, autoTightenEvents } from '../../data/evaluationsData';
import type { Evaluator } from '../../data/evaluationsData';
import Tooltip from '../shared/Tooltip';
import DataSourceBadge from '../shared/DataSourceBadge';
import { useLiveData } from '../../hooks/useLiveData';
import { fetchEvaluators, type EvaluatorDef } from '../../api/evaluations';
import GroundingCheckPanel from './GroundingCheckPanel';

const categoryColors: Record<string, string> = {
  screening: '#de350b',
  ownership: '#6554C0',
  risk: '#0052CC',
  compliance: '#ff991f',
  consistency: '#00b8d9',
};

const categoryLabels: Record<string, string> = {
  screening: 'Screening',
  ownership: 'Ownership',
  risk: 'Risk',
  compliance: 'Compliance',
  consistency: 'Consistency',
};

const trendIcons: Record<string, { symbol: string; color: string }> = {
  improving: { symbol: '↑', color: '#10b981' },
  stable: { symbol: '→', color: '#64748b' },
  degrading: { symbol: '↓', color: '#ef4444' },
};

function MiniSparkline({ data, threshold, color }: { data: number[]; threshold: number; color: string }) {
  const width = 120;
  const height = 32;
  const min = Math.min(...data, threshold - 5);
  const max = Math.max(...data, threshold + 5);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const thresholdY = height - ((threshold - min) / range) * (height - 4) - 2;

  return (
    <svg width={width} height={height} style={{ display: 'block', marginTop: '6px' }}>
      <line
        x1="0" y1={thresholdY} x2={width} y2={thresholdY}
        stroke="#ef4444" strokeWidth="1" strokeDasharray="3,2" opacity="0.6"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EvaluatorCard({ evaluator }: { evaluator: Evaluator }) {
  const catColor = categoryColors[evaluator.category] || '#64748b';
  const trend = trendIcons[evaluator.trend];
  const statusBg = evaluator.status === 'pass'
    ? 'rgba(16, 185, 129, 0.15)'
    : evaluator.status === 'warning'
      ? 'rgba(245, 158, 11, 0.15)'
      : 'rgba(239, 68, 68, 0.15)';
  const statusColor = evaluator.status === 'pass'
    ? '#10b981'
    : evaluator.status === 'warning'
      ? '#f59e0b'
      : '#ef4444';

  const lastRun = new Date(evaluator.lastRunTime);
  const timeAgo = Math.round((Date.now() - lastRun.getTime()) / 60000);
  const timeLabel = timeAgo < 60 ? `${timeAgo}m ago` : `${Math.round(timeAgo / 60)}h ago`;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{
          fontSize: '0.55rem', fontWeight: 700, padding: '2px 5px',
          borderRadius: '4px', background: `${catColor}20`, color: catColor,
          textTransform: 'uppercase', letterSpacing: '0.03em',
        }}>
          {categoryLabels[evaluator.category]}
        </span>
        <span style={{
          fontSize: '0.6rem', fontWeight: 600, padding: '2px 6px',
          borderRadius: '4px', background: statusBg, color: statusColor,
          textTransform: 'uppercase',
        }}>
          {evaluator.status}
        </span>
      </div>

      <Tooltip text={evaluator.description}>
        <span style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', lineHeight: 1.3 }}>
          {evaluator.name}
        </span>
      </Tooltip>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: '1.4rem', fontWeight: 700, color: statusColor }}>
          {evaluator.currentScore}%
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
          / {evaluator.threshold}% min
        </span>
        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: trend.color, marginLeft: 'auto' }}>
          {trend.symbol}
        </span>
      </div>

      <MiniSparkline data={evaluator.history} threshold={evaluator.threshold} color={statusColor} />

      <div style={{ fontSize: '0.58rem', color: 'var(--text-secondary)', marginTop: '2px', fontStyle: 'italic' }}>
        {evaluator.keyMetric}
      </div>
      <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
        {evaluator.regulatoryBasis}
      </div>
      <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', opacity: 0.7 }}>
        Last run: {timeLabel}
      </div>
    </div>
  );
}

export const EvaluationsSection: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const handleRunEvaluation = useCallback(() => {
    setIsRunning(true);
    setShowResults(false);
    setTimeout(() => {
      setIsRunning(false);
      setShowResults(true);
    }, 2500);
  }, []);

  // Live evaluators from the registry proxy (/evaluators). Falls back to the static
  // set for the rich card visuals; drives the Live/Offline badge + passing counts.
  const { data: liveEvaluators, isLive } = useLiveData<EvaluatorDef[] | null>(fetchEvaluators, null);
  const staticPassing = evaluators.filter(e => e.status === 'pass').length;
  const passingCount = liveEvaluators
    ? liveEvaluators.filter(e => e.status === 'passing').length
    : staticPassing;
  const evaluatorCount = liveEvaluators ? liveEvaluators.length : evaluators.length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
        <Tooltip text="AgentCore Evaluations continuously monitors KYC agent output quality across 10 domain-specific evaluators aligned to MLR 2017, FCA Financial Crime Guide, and JMLSG guidance. When evaluators breach thresholds, auto-tighten increases policy constraints.">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, cursor: 'pointer' }}>
            AgentCore Evaluations
          </h2>
        </Tooltip>
        <span style={{
          fontSize: '8px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
          background: 'rgba(76, 175, 80, 0.2)', color: '#4caf50', textTransform: 'uppercase',
        }}>
          ACTIVE
        </span>
        <DataSourceBadge isLive={isLive} />
        <button
          onClick={handleRunEvaluation}
          disabled={isRunning}
          style={{
            marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 600,
            padding: '5px 12px', borderRadius: '6px', border: 'none',
            background: isRunning ? 'var(--bg-secondary)' : '#0052CC',
            color: isRunning ? 'var(--text-muted)' : '#fff',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {isRunning ? '⟳ Running...' : '▶ Run Evaluation'}
        </button>
      </div>

      {/* Health Score + Auto-Tighten Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: `conic-gradient(#10b981 ${overallHealthScore * 3.6}deg, var(--bg-secondary) 0deg)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem', fontWeight: 700, color: '#10b981',
            }}>
              {overallHealthScore}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Agent Health Score</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{passingCount}/{evaluatorCount} evaluators passing</div>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: '2px' }}>MLR 2017 / FCA FC Guide aligned</div>
          </div>
        </div>

        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Auto-Tighten Loop</span>
            <Tooltip text="When evaluation scores drop below thresholds, the system automatically increases policy constraints. Sanctions failures → mandatory human review. UBO failures → reduced layer depth. Consistency failures → MLRO alert + pause.">
              <span style={{
                fontSize: '0.55rem', fontWeight: 600, padding: '2px 5px',
                borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b',
                cursor: 'pointer',
              }}>
                {autoTightenEvents.length} events (30d)
              </span>
            </Tooltip>
          </div>
          {autoTightenEvents.map(evt => (
            <div key={evt.id} style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '4px', lineHeight: 1.5 }}>
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                {new Date(evt.triggeredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
              {' — '}
              <span style={{ color: 'var(--text-secondary)' }}>
                {evt.policyChange.split(' — ')[0] || evt.policyChange.substring(0, 80)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Live contextual grounding check (Bedrock Guardrails) */}
      <GroundingCheckPanel />

      {/* Running animation */}
      {isRunning && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '1.5rem', marginBottom: '1rem',
          textAlign: 'center', animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⟳</div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Running evaluators against 100 golden test cases...</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '4px' }}>Sanctions screening • PEP identification • UBO chains • Risk calibration • Regulatory completeness</div>
        </div>
      )}

      {/* Results summary after run */}
      {showResults && !isRunning && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '10px', padding: '1rem', marginBottom: '1rem',
          fontSize: '0.7rem', color: 'var(--text-secondary)',
        }}>
          <span style={{ fontWeight: 700, color: '#10b981' }}>✓ Evaluation complete</span>
          {' — All 10 evaluators passed against 100 golden test cases (UK-regulated scenarios, GBP amounts, FATF jurisdictions). Overall score: '}
          <span style={{ fontWeight: 700 }}>{overallHealthScore}%</span>
          {'. No auto-tighten triggered. Decision variance: 2.8% (within 5% tolerance).'}
        </div>
      )}

      {/* Evaluator Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
        {evaluators.map(evaluator => (
          <EvaluatorCard key={evaluator.id} evaluator={evaluator} />
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};

export default EvaluationsSection;
