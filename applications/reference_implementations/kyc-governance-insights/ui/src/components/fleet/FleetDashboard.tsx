import React, { useState } from 'react';
import { fleetUseCases, fleetAlerts, fleetKRIs, fleetAggregateScore } from '../../data/fleetData';
import { riskAppetiteConfig } from '../../data/riskAppetiteData';
import { usePersona } from '../../contexts/PersonaContext';
import { StatusBadge } from '../shared/StatusBadge';
import InfoTooltip from '../shared/InfoTooltip';
import CollapsibleSection from '../shared/CollapsibleSection';
import BoardAccountabilitySummary from '../accountability/BoardAccountabilitySummary';
import { getModelInventorySummary } from '../../data/modelInventoryData';
import { getControlTestingSummary } from '../../data/controlTestingData';
import { getIssuesSummary } from '../../data/issuesTrackerData';
import { getKpiSummary } from '../../data/operationalKpiData';
import { totalCostPerDecision, costChangePercent } from '../../data/costPerDecisionData';
import RiskAppetiteGauge from './RiskAppetiteGauge';
import KRITrends from './KRITrends';
import IncidentTimeline from './IncidentTimeline';
import BoardPackGenerator from './BoardPackGenerator';
import SimulationModal from './SimulationModal';
import CROArchitectureSimple from './CROArchitectureSimple';
import { TEST_IDS } from '../../test-ids';
import { useBackendStatus } from '../../hooks/useBackendStatus';
import SectionDescription from '../shared/SectionDescription';

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 90 ? '#10b981' : score >= 75 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
      <text x="50%" y="54%" textAnchor="middle" fontSize={size * 0.22} fontWeight="700" fill="var(--text-primary)">{score}</text>
    </svg>
  );
}

// Board-approved risk-appetite floor per use case (quarterly review cycle).
// Sourced from riskAppetiteData.ts, joined by id; falls back to sensible FSI
// floors if a use case has no configured threshold.
const FALLBACK_FLOORS: Record<string, number> = { kyc: 85, trade: 85, mortgage: 85, claims: 80 };
function floorFor(useCaseId: string): { floor: number; buffer: number } {
  const t = riskAppetiteConfig.thresholds.find(x => x.useCaseId === useCaseId);
  return { floor: t?.floor ?? FALLBACK_FLOORS[useCaseId] ?? 85, buffer: t?.amberBuffer ?? 5 };
}

function UseCaseCard({ uc }: { uc: typeof fleetUseCases[number] }) {
  const { setPersona } = usePersona();
  const statusColor = uc.status === 'healthy' ? '#10b981' : uc.status === 'warning' ? '#f59e0b' : '#ef4444';
  const { floor, buffer } = floorFor(uc.id);
  const gap = uc.healthScore - floor;
  const floorColor = gap < 0 ? '#ef4444' : gap < buffer ? '#f59e0b' : '#10b981';
  return (
    <div
      onClick={() => setPersona('business-ops')}
      style={{
        background: 'var(--bg-card)', borderRadius: '12px', padding: '20px',
        cursor: 'pointer', transition: 'all 0.2s ease', border: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{uc.label}</span>
        {uc.alertCount > 0 && (
          <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: '10px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
            {uc.alertCount} alert{uc.alertCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <ScoreRing score={uc.healthScore} size={56} />
        <div>
          <div style={{ fontSize: '0.75rem', color: statusColor, fontWeight: 600 }}>{uc.status.toUpperCase()}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{uc.decisionsToday.toLocaleString()} decisions today</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '3px' }}>
            {uc.healthScore} / floor: {floor}{' '}
            <span style={{ color: floorColor, fontWeight: 600 }}>({gap >= 0 ? '+' : ''}{gap})</span>
          </div>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', opacity: 0.75, marginTop: '1px' }}>board-approved floor</div>
        </div>
      </div>
    </div>
  );
}

export default function FleetDashboard() {
  const [showSimulation, setShowSimulation] = useState(false);
  const backendStatus = useBackendStatus();

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* === HERO: Agent Decision Card === */}
      <div
        onClick={() => setShowSimulation(true)}
        data-testid={TEST_IDS.fleet.heroCard}
        style={{
          background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
          borderRadius: '16px',
          padding: '28px 32px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          border: '1px solid rgba(100, 181, 246, 0.3)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(13, 71, 161, 0.4)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#90caf9', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🎬 See the Agent in Action
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
            Watch a KYC Decision — With Every Control Firing
          </div>
          <div style={{ fontSize: '14px', color: '#bbdefb', lineHeight: 1.5 }}>
            Step through a real agent decision. See guardrails, authorization checks, human review gates, and mathematical verification — all firing in real-time.
          </div>
        </div>
        <div style={{ fontSize: '48px', marginLeft: '24px' }}>▶️</div>
      </div>

      {/* Simulation Modal */}
      {showSimulation && <SimulationModal onClose={() => setShowSimulation(false)} />}
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center' }}>
            Fleet AI Governance
            <InfoTooltip text="A portfolio-level view across every AI use case in the fleet, not a single agent. Each card is one use case with its own health status; the aggregate score and KRIs roll up decision quality, risk posture, and operational health across all of them. This is where fleet-wide drift — or one use case breaching appetite — surfaces before it becomes an incident." />
          </h1>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Last 24h</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <BoardPackGenerator />
          <StatusBadge variant={backendStatus === 'live' ? 'live' : backendStatus === 'stale' ? 'cached' : 'simulated'} />
        </div>
      </div>

      <SectionDescription text="Portfolio-level view of your AI agent fleet — risk posture, decision quality, and operational health at a glance." />

      {/* Aggregate Score + Use Case Constellation */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Aggregate */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
          <ScoreRing score={fleetAggregateScore} size={100} />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>Aggregate Health (of 100)</div>
        </div>
        {/* 2x2 Constellation */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {fleetUseCases.map(uc => <UseCaseCard key={uc.id} uc={uc} />)}
        </div>
      </div>

      {/* KRIs */}
      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Key Risk Indicators</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
          {fleetKRIs.map(kri => (
            <div key={kri.label} style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: kri.color }}>{kri.value}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>{kri.label}</div>
              <span style={{ fontSize: '0.6rem', color: kri.trend === 'up' ? '#f59e0b' : kri.trend === 'down' ? '#10b981' : '#64748b' }}>
                {kri.trend === 'up' ? '\u2191' : kri.trend === 'down' ? '\u2193' : '\u2192'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CRO Architecture Simple — 3-box diagram */}
      <CollapsibleSection title="Reference Architecture" defaultCollapsed info="A simplified three-box view of how the governed agent fleet is wired — the platform, the governance layer, and the use-case applications. Expand for the high-level shape; the Engineering persona has the full architecture.">
        <CROArchitectureSimple />
      </CollapsibleSection>

      {/* Operational KPI Summary — Iteration 24 */}
      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Operational Performance</h2>
        {(() => {
          const kpiSummary = getKpiSummary();
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: kpiSummary.stpRate >= kpiSummary.stpTarget ? '#10b981' : '#f59e0b' }}>{kpiSummary.stpRate}%</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>Auto-Processed / STP (target: {kpiSummary.stpTarget}%)</div>
                <span style={{ fontSize: '0.6rem', color: kpiSummary.stpTrend === 'up' ? '#10b981' : '#f59e0b' }}>
                  {kpiSummary.stpTrend === 'up' ? '↑' : kpiSummary.stpTrend === 'down' ? '↓' : '→'}
                </span>
              </div>
              <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: kpiSummary.fpRate <= kpiSummary.fpTarget ? '#10b981' : '#ef4444' }}>{kpiSummary.fpRate}%</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>False Positive Rate (target: &lt;{kpiSummary.fpTarget}%)</div>
                <span style={{ fontSize: '0.6rem', color: kpiSummary.fpTrend === 'down' ? '#10b981' : '#f59e0b' }}>
                  {kpiSummary.fpTrend === 'up' ? '↑' : kpiSummary.fpTrend === 'down' ? '↓' : '→'}
                </span>
              </div>
              <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10b981' }}>£{totalCostPerDecision.toFixed(2)}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>Cost/Decision</div>
                <span style={{ fontSize: '0.6rem', color: '#10b981' }}>↓ {Math.abs(costChangePercent)}%</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Alerts */}
      <CollapsibleSection title="Recent Alerts" defaultCollapsed info="Fleet-wide governance alerts across use cases — the entry point for incident triage. Severity is colour-coded (critical / warning / info); expand to review individual events.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {fleetAlerts.map(alert => (
            <div key={alert.id} style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: alert.severity === 'critical' ? 'rgba(239,68,68,0.15)' : alert.severity === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.1)', color: alert.severity === 'critical' ? '#ef4444' : alert.severity === 'warning' ? '#f59e0b' : '#3b82f6' }}>
                {alert.useCase}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flex: 1 }}>{alert.description}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(alert.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Compliance Operational Summary — Iteration 23 */}
      <CollapsibleSection title="Compliance Operations" defaultCollapsed info="Depth view for compliance oversight — AI model inventory (validation status), control-testing results, and open findings. Summary counts shown here; the Compliance persona carries the full drill-downs.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {(() => {
            const modelSummary = getModelInventorySummary();
            const controlSummary = getControlTestingSummary();
            const issuesSummary = getIssuesSummary();
            return (
              <>
                <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '8px' }}>AI Model Inventory</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>{modelSummary.total} models</div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.6rem', color: '#10b981' }}>✅ {modelSummary.validated} validated</span>
                    {modelSummary.expiring > 0 && <span style={{ fontSize: '0.6rem', color: '#f59e0b' }}>⚠️ {modelSummary.expiring} expiring</span>}
                    {modelSummary.overdue > 0 && <span style={{ fontSize: '0.6rem', color: '#ef4444' }}>❌ {modelSummary.overdue} overdue</span>}
                  </div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: '4px' }}>{modelSummary.highRisk} high-risk</div>
                </div>
                <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Control Testing</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>{controlSummary.testedLast90Days} tested</div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.6rem', color: '#10b981' }}>✅ {controlSummary.passed} passed</span>
                    {controlSummary.partial > 0 && <span style={{ fontSize: '0.6rem', color: '#f59e0b' }}>⚠️ {controlSummary.partial} partial</span>}
                    {controlSummary.failed > 0 && <span style={{ fontSize: '0.6rem', color: '#ef4444' }}>❌ {controlSummary.failed} failed</span>}
                  </div>
                  {controlSummary.overdue > 0 && <div style={{ fontSize: '0.58rem', color: '#ef4444', marginTop: '4px' }}>{controlSummary.overdue} overdue</div>}
                </div>
                <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Open Findings</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: issuesSummary.critical > 0 ? '#ef4444' : 'var(--text-primary)' }}>{issuesSummary.totalOpen} open</div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    {issuesSummary.critical > 0 && <span style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 600 }}>🔴 {issuesSummary.critical} critical</span>}
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{issuesSummary.inProgress} in progress</span>
                  </div>
                  {issuesSummary.overdue > 0 && <div style={{ fontSize: '0.58rem', color: '#ef4444', marginTop: '4px' }}>{issuesSummary.overdue} overdue</div>}
                </div>
              </>
            );
          })()}
        </div>
      </CollapsibleSection>

      {/* Risk Appetite vs Actual — Iteration 25 */}
      <RiskAppetiteGauge />

      {/* KRI Trends (30/60/90 days) — Iteration 25 */}
      <CollapsibleSection title="KRI Trends (30 / 60 / 90 days)" defaultCollapsed info="How each key risk indicator has moved over 30, 60, and 90 days. The KRI snapshot above is the current value; this is the trajectory behind it — expand to see whether a metric is improving or drifting.">
        <KRITrends />
      </CollapsibleSection>

      {/* Incidents & Near-Misses — Iteration 25 */}
      <CollapsibleSection title="Incidents & Near-Misses" defaultCollapsed info="Timeline of governance incidents and near-misses across the fleet — what happened, severity, and how it was contained. The detail behind the alert counts; expand to drill into a specific event.">
        <IncidentTimeline />
      </CollapsibleSection>

      {/* SM&CR Accountability — Board Summary */}
      <BoardAccountabilitySummary />
    </div>
  );
}
