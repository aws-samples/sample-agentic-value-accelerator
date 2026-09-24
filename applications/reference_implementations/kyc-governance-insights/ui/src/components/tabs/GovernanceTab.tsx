import React, { useState, useEffect, useMemo } from 'react';
import { evalDimensions } from '../../data/governanceData';
import CollapsibleSection from '../shared/CollapsibleSection';
import BusinessMetricsPanel from '../metrics/BusinessMetricsPanel';
import type { JudgeScores } from '../../api/governanceControls';
import { fetchAgentRegistry, type RegistryAgent } from '../../api/registry';
import { hitlDecisions } from '../../data/hitlDecisionsData';
import Tooltip from '../shared/Tooltip';
import PendingDecisions from '../PendingDecisions';
import EvaluationsSection from './EvaluationsSection';
import AutonomyConfigSection from './AutonomyConfigSection';
import { useAudience } from '../../contexts/AudienceContext';
import ProfileSelector from '../config/ProfileSelector';
import PolicySliders from '../config/PolicySliders';
import InterventionLadder from '../config/InterventionLadder';
import EvalSummaryCard from '../evaluations/EvalSummaryCard';
import QAPanel from '../qa/QAPanel';
import SectionDescription from '../shared/SectionDescription';

interface GovernanceTabProps {
  judgeScores?: JudgeScores | null;
}

const evalColorMap: Record<string, string> = {
  'mv-green': '#36b37e',
  'mv-orange': '#ff991f',
  'mv-blue': '#0052CC',
  'mv-red': '#de350b',
};


/* --- Trend arrows --- */
const trendArrows: Record<string, { arrow: string; color: string }> = {
  '1. Task Completion': { arrow: '\u2191', color: '#10b981' },
  '2. Planning': { arrow: '\u2191', color: '#10b981' },
  '3. Tool Use': { arrow: '\u2192', color: '#f59e0b' },
  '4. Memory': { arrow: '\u2191', color: '#10b981' },
  '5. Ops & RAI': { arrow: '\u2191', color: '#10b981' },
  '6. KYC-Specific': { arrow: '\u2192', color: '#f59e0b' },
};

/* --- Metric descriptions for tooltips (R1) --- */
const metricDescriptions: Record<string, string> = {
  '1. Task Completion': 'Percentage of KYC assessments completed end-to-end without human intervention or failure.',
  '2. Planning': 'Quality of multi-step reasoning chains measured by faithfulness to source documents.',
  '3. Tool Use': 'How correctly the agent calls tools/APIs with valid parameters and interprets their results.',
  '4. Memory': "Agent's ability to maintain relevant context across multi-turn interactions and long documents.",
  '5. Ops & RAI': 'Adherence to responsible AI standards: bias detection, PII handling, tone appropriateness.',
  '6. KYC-Specific': 'Domain accuracy on sanctions matching, PEP screening, credit risk, and regulatory compliance checks.',
};

/* --- R6: Which controls produce each metric --- */
const metricControls: Record<string, string> = {
  '1. Task Completion': 'Measured by: LLM-as-Judge + Lambda Validators',
  '2. Planning': 'Measured by: LLM-as-Judge (reasoning trace evaluation)',
  '3. Tool Use': 'Measured by: Lambda Validators + Gateway Interceptors',
  '4. Memory': 'Measured by: LLM-as-Judge (context retention check)',
  '5. Ops & RAI': 'Measured by: RAI Evaluator + Guardrails (Output) + CloudWatch',
  '6. KYC-Specific': 'Measured by: Lambda Validators + Contextual Grounding',
};

/* --- Mini sparkline SVG --- */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const width = 120;
  const height = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block', marginTop: '4px' }}>
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

// Fake 8-week progression data (trending up)
const accuracyTrend = [88.2, 89.5, 90.1, 91.8, 92.4, 93.6, 94.1, 94.7];
const faithfulnessTrend = [85.0, 86.8, 88.2, 89.5, 91.0, 92.3, 93.1, 93.8];

/**
 * When real LLM-as-Judge scores are available, overlay them onto the eval dimensions.
 */
function getEvalDimensions(judgeScores?: JudgeScores | null) {
  if (!judgeScores) return evalDimensions;
  return evalDimensions.map((dim, i) => {
    const scoreMap = [
      judgeScores.correctness,
      judgeScores.faithfulness,
      judgeScores.completeness,
      judgeScores.helpfulness,
      judgeScores.tone,
      null,
    ];
    const liveScore = scoreMap[i];
    if (liveScore == null) return dim;
    const pct = Math.round(liveScore * 100 * 10) / 10;
    return {
      ...dim,
      value: `${pct}%`,
      numericValue: pct,
      colorClass: pct >= 90 ? 'mv-green' : pct >= 80 ? 'mv-orange' : 'mv-red',
    };
  });
}

export const GovernanceTab: React.FC<GovernanceTabProps> = ({ judgeScores }) => {
  const dimensions = getEvalDimensions(judgeScores);
  const isLive = !!judgeScores;
  const { mode } = useAudience();
  const [agents, setAgents] = useState<RegistryAgent[] | null>(null);
  const [registryLive, setRegistryLive] = useState(false);

  const hitlMetrics = useMemo(() => {
    const total = hitlDecisions.length;
    const overrideCount = hitlDecisions.filter(d => !d.agreedWithAgent).length;
    const nonAuto = hitlDecisions.filter(d => d.riskTier !== 'auto');
    const avgDecisionTime = nonAuto.length
      ? Math.round(nonAuto.reduce((s, d) => s + d.decisionTimeSeconds, 0) / nonAuto.length)
      : 0;
    const escalationCount = hitlDecisions.filter(d => d.escalatedTo !== null).length;
    const autoCount = hitlDecisions.filter(d => d.riskTier === 'auto').length;
    return {
      overrideRate: ((overrideCount / total) * 100).toFixed(1),
      avgDecisionTime,
      escalationRate: ((escalationCount / total) * 100).toFixed(1),
      autoApprovalRate: ((autoCount / total) * 100).toFixed(1),
    };
  }, []);

  useEffect(() => {
    fetchAgentRegistry().then(data => {
      if (data) { setAgents(data); setRegistryLive(true); }
    });
  }, []);

  return (
    <div data-testid="governance.container" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      <SectionDescription text="Active Cedar policies governing agent behaviour — with earned autonomy tiers and continuous evaluation." />
      {/* Policy Configuration (Profile + Sliders + Ladder) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <ProfileSelector />
          <PolicySliders />
          <EvalSummaryCard />
          <QAPanel />
        </div>
        <InterventionLadder />
      </div>

      {/* Domain-grouped metrics for Executive and Compliance modes */}
      {(mode === 'Executive' || mode === 'Compliance') && (
        <CollapsibleSection
          title="Governance by Outcome"
          defaultCollapsed
          info="Outcome-grouped roll-up of governance signals — decision quality (accuracy, grounding, hallucination), safety & compliance (policy enforcement, sanctions pass), speed & cost, and human oversight. Each figure aggregates the underlying per-decision controls."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {/* Decision Quality */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', borderLeft: '3px solid #10b981' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981', marginBottom: '4px' }}>Decision Quality</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '10px' }}>Accuracy, grounding, and confidence of AI outputs</div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Accuracy: <strong>94.7%</strong></span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Grounding: <strong>97.2%</strong></span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Hallucination: <strong>0.3%</strong></span>
              </div>
              {mode === 'Compliance' && <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '6px', fontStyle: 'italic' }}>(via Bedrock Guardrails + Lambda Validators)</div>}
            </div>
            {/* Safety & Compliance */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', borderLeft: '3px solid #3b82f6' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3b82f6', marginBottom: '4px' }}>Safety & Compliance</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '10px' }}>Policy enforcement, violations blocked, regulatory alignment</div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Policies enforced: <strong>96.8%</strong></span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Violations: <strong>0</strong></span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Sanctions pass: <strong>99.1%</strong></span>
              </div>
              {mode === 'Compliance' && <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '6px', fontStyle: 'italic' }}>(via Cedar Policy Engine + WAF)</div>}
            </div>
            {/* Speed & Cost */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', marginBottom: '4px' }}>Speed & Cost</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '10px' }}>Processing time, cost efficiency, straight-through rate</div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Avg time: <strong>38s</strong></span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Cost/decision: <strong>$0.42</strong></span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>STP rate: <strong>87%</strong></span>
              </div>
              {mode === 'Compliance' && <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '6px', fontStyle: 'italic' }}>(via AgentCore + CloudWatch)</div>}
            </div>
            {/* Human Oversight */}
            <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', borderLeft: '3px solid #8b5cf6' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#8b5cf6', marginBottom: '4px' }}>Human Oversight</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '10px' }}>Escalation rates, override frequency, pending queue</div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Escalation: <strong>13%</strong></span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Overrides: <strong>8.3%</strong></span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Pending: <strong>2</strong></span>
              </div>
              {mode === 'Compliance' && <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '6px', fontStyle: 'italic' }}>(via Step Functions + DynamoDB)</div>}
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Governance Metrics Panel */}
      <BusinessMetricsPanel />

      {/* Human Oversight Metrics (HITL) */}
      <CollapsibleSection
        title="Human Oversight Metrics"
        defaultCollapsed
        collapsedHint={`LIVE · ${hitlDecisions.length} decisions`}
        info="Human-in-the-loop oversight signals — override rate, average decision time, escalation rate, and auto-approval rate — plus the last five HITL decisions."
      >
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>{hitlMetrics.overrideRate}%</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Override Rate</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round(hitlMetrics.avgDecisionTime / 60)}m</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Avg Decision Time</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0052CC' }}>{hitlMetrics.escalationRate}%</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Escalation Rate</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>{hitlMetrics.autoApprovalRate}%</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Auto-Approval Rate</div>
              </div>
            </div>

            {/* Recent decisions table */}
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 600 }}>Last 5 HITL Decisions</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.65rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>Case</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>Customer</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>Tier</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>Decision</th>
                  <th style={{ textAlign: 'center', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>Agreed</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {hitlDecisions.slice(-5).reverse().map((d) => (
                  <tr key={d.caseId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 6px', color: 'var(--text-secondary)' }}>{d.caseId.replace('KYC-2026-', '')}</td>
                    <td style={{ padding: '4px 6px', color: 'var(--text-secondary)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.customerName}</td>
                    <td style={{ padding: '4px 6px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{d.riskTier}</td>
                    <td style={{ padding: '4px 6px', color: 'var(--text-secondary)' }}>{d.humanDecision.replace(/_/g, ' ')}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <span style={{ color: d.agreedWithAgent ? '#10b981' : '#ef4444' }}>{d.agreedWithAgent ? '✓' : '✗'}</span>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {d.decisionTimeSeconds < 60 ? `${d.decisionTimeSeconds}s` : `${Math.round(d.decisionTimeSeconds / 60)}m`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </CollapsibleSection>

      {/* Pending HITL Decisions (Step Functions) */}
      <CollapsibleSection title="Pending Decisions" defaultCollapsed info="Live human-in-the-loop review queue — agent actions awaiting approve/reject. The Review Queue tab carries the full workflow.">
        <PendingDecisions />
      </CollapsibleSection>

      {/* Earned Autonomy Model — Spectrum */}
      <CollapsibleSection title="Earned Autonomy Model" defaultCollapsed info="Progressive autonomy framework where agents earn greater independence through demonstrated control effectiveness and evaluation scores.">
        {/* Spectrum arrow */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem' }}>
          {/* Gradient bar */}
          <div style={{ position: 'relative', height: '40px', borderRadius: '20px', background: 'linear-gradient(to right, #64748b 0%, #f59e0b 33%, #10b981 66%, #059669 100%)', marginBottom: '12px' }}>
            {/* "You are here" marker — between Scope 2 and 3 (~45%) */}
            <div style={{ position: 'absolute', left: '45%', top: '-8px', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '0', height: '0', borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid var(--text-primary)' }} />
              <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '42px', whiteSpace: 'nowrap' }}>
                You are here
              </div>
            </div>
          </div>

          {/* Labels with hover descriptions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
            <Tooltip text="Read-only. Agent provides recommendations but takes no action. Human does all work.">
              <div style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>Scope 1</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>No Agency</div>
              </div>
            </Tooltip>
            <Tooltip text="Agent can propose changes but requires mandatory human approval before any action executes.">
              <div style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b' }}>Scope 2</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Prescribed</div>
              </div>
            </Tooltip>
            <Tooltip text="Agent operates autonomously within bounded parameters. No per-action HITL, but policy engine enforces limits.">
              <div style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981' }}>Scope 3</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Supervised</div>
              </div>
            </Tooltip>
            <Tooltip text="Self-initiating, continuous operation. Minimal oversight. Reserved for agents with extensive track record.">
              <div style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#059669' }}>Scope 4</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Full Agency</div>
              </div>
            </Tooltip>
          </div>
        </div>
      </CollapsibleSection>

      {/* Continuous Evaluation */}
      <CollapsibleSection
        title="Continuous Evaluation (6 Dimensions)"
        defaultCollapsed
        collapsedHint={isLive ? 'LIVE' : undefined}
        info="Ongoing evaluation framework measuring agent quality across 6 dimensions. Scores must remain above thresholds to maintain current autonomy scope."
      >
        {/* Summary box */}
        <div style={{
          background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px 16px',
          marginBottom: '1rem', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7,
        }}>
          Overall governance posture is improving. The system currently operates between Scope 2 (Prescribed Agency) and Scope 3 (Supervised Agency) on the AWS Agentic AI Scoping Matrix. To earn Scope 3 fully, implement Automated Reasoning checks and increase deterministic validation coverage.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {dimensions.map((dim) => {
            const trend = trendArrows[dim.label] || { arrow: '\u2192', color: '#888' };
            const showSparkline = dim.label === '1. Task Completion' || dim.label === '2. Planning';
            const measuredBy = metricControls[dim.label] || '';
            return (
              <div
                key={dim.label}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '0.25rem' }}>
                  <Tooltip text={metricDescriptions[dim.label] || dim.description}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                      {dim.label}
                    </span>
                  </Tooltip>
                  {!isLive && (
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', opacity: 0.7, fontStyle: 'italic' }}>(test data)</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 700, color: evalColorMap[dim.colorClass] || 'var(--text-primary)' }}>
                    {dim.value}
                  </span>
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: trend.color }}>
                    {trend.arrow}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  {dim.description}
                </div>
                {measuredBy && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontStyle: 'italic' }}>
                    {measuredBy}
                  </div>
                )}
                {showSparkline && (
                  <Sparkline
                    data={dim.label === '1. Task Completion' ? accuracyTrend : faithfulnessTrend}
                    color={evalColorMap[dim.colorClass] || '#36b37e'}
                  />
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      {/* Agent Registry */}
      <CollapsibleSection
        title="Agent Registry"
        defaultCollapsed
        collapsedHint={registryLive ? 'LIVE' : undefined}
        info="Centralized catalog of all registered AI agents, their tier level, permitted tools, and operational status. Enables governance teams to audit which agents exist and what they're allowed to do."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {(agents || [
            { agent_id: 'AGT-001', name: 'Credit Analyst', tier: 2, status: 'active', last_evaluation_score: 94.7, total_sessions: 12847, owner: 'Head of Credit Risk', escalation_to: 'Credit Committee' },
            { agent_id: 'AGT-002', name: 'Compliance Officer', tier: 2, status: 'active', last_evaluation_score: 96.1, total_sessions: 12847, owner: 'Head of Financial Crime', escalation_to: 'MLRO' },
            { agent_id: 'AGT-003', name: 'Document Verification', tier: 2, status: 'active', last_evaluation_score: 98.3, total_sessions: 8421, owner: 'Head of Operations', escalation_to: 'Compliance Officer' },
          ]).map((a) => (
            <div key={a.agent_id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{a.name}</span>
                <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: a.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: a.status === 'active' ? '#10b981' : '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>{a.status}</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Tier {a.tier} • {a.total_sessions?.toLocaleString()} sessions</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#36b37e' }}>{a.last_evaluation_score}%</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Escalates to: {a.escalation_to}</div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* AgentCore Evaluations */}
      <CollapsibleSection title="Evaluation Pipeline" defaultCollapsed info="AgentCore Evaluations — 10 domain evaluators (MLR 2017 / FCA FC Guide / JMLSG aligned), agent health score, the auto-tighten loop, and live contextual grounding.">
        <EvaluationsSection />
      </CollapsibleSection>

      {/* Autonomy Configuration */}
      <CollapsibleSection title="Autonomy Configuration" defaultCollapsed info="Current autonomy level, promotion criteria, business-configurable parameters, alarms & rate throttle, auto-tighten log, and the configuration audit trail.">
        <AutonomyConfigSection />
      </CollapsibleSection>
    </div>
  );
};

export default GovernanceTab;
