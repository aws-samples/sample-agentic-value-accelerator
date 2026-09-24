/**
 * OpsOverview.tsx - Executive Dashboard for Operations Hub
 *
 * A single pane of glass for Ops, SRE, and GRC leadership providing
 * real-time visibility into fleet health, incidents, alerts, and compliance.
 *
 * Uses live data hooks from useOperationsApi.ts with graceful fallback to mock data.
 */

import { useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Icon } from '../icons';
import StatCard from '../StatCard';
import { MockDataBadge, LiveDataBadge } from '../DataSourceIndicator';
import { tooltipStyle } from '../mockData';
import {
  useFleetStatus,
  useActiveAlerts,
  useIncidents,
  useSLAs,
  useOpsMetrics,
  useOnCall,
} from './useOperationsApi';

// ────────────────────────────────────────────────────────────────────────────────
// MOCK DATA - structured for easy replacement with hooks
// ────────────────────────────────────────────────────────────────────────────────

// Seed mock dates relative to "now" so demo data never looks stale.
const MOCK_NOW = new Date();
const relDate = (daysFromNow: number): string =>
  new Date(MOCK_NOW.getTime() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

// Hero KPIs
const MOCK_FLEET_HEALTH = {
  percentage: 94.2,
  status: 'healthy' as const,
  total: 127,
  healthy: 119,
  degraded: 5,
  down: 2,
  maintenance: 1,
};

const MOCK_ACTIVE_INCIDENTS = {
  total: 5,
  critical: 1,
  high: 2,
  medium: 2,
  low: 0,
};

const MOCK_SLA_COMPLIANCE = {
  percentage: 98.7,
  target: 99.5,
  trending: 'down' as const,
  breachesThisMonth: 3,
};

const MOCK_MTTR = {
  currentMinutes: 18,
  targetMinutes: 15,
  trend7d: -12, // negative = improving
};

const MOCK_OPEN_ALERTS = {
  total: 23,
  critical: 2,
  warning: 8,
  info: 13,
};

// MOCK_ON_CALL was deleted rather than left unused.
//
// It held { primary: 'Sarah Chen', secondary: 'Marcus Williams', team: 'Platform SRE',
// shiftEnd: '18:00 UTC' } and was substituted whenever the on-call source was not
// live. On the running stack the backend returns live:false with
// note:"Configure PAGERDUTY_API_KEY", so the hero strip printed those names beside a
// green page-level Live pill - telling a responder to page someone who is not on any
// rotation. There is no safe default for "who is on call": the honest values are null,
// which the card already renders as an explicit gap state.

// Fleet status breakdown
const MOCK_FLEET_STATUS = [
  { status: 'healthy', count: 119, color: '#10b981' },
  { status: 'degraded', count: 5, color: '#f59e0b' },
  { status: 'down', count: 2, color: '#ef4444' },
  { status: 'maintenance', count: 1, color: '#6366f1' },
];

// Top agents by risk
const MOCK_TOP_RISK_AGENTS = [
  { id: 'agent-042', name: 'Trading Assistant', riskScore: 78, status: 'degraded', trend: 'up', lastIncident: '2h ago' },
  { id: 'agent-019', name: 'Customer Service Bot', riskScore: 65, status: 'healthy', trend: 'stable', lastIncident: '3d ago' },
  { id: 'agent-088', name: 'Fraud Detection', riskScore: 58, status: 'healthy', trend: 'down', lastIncident: '1w ago' },
  { id: 'agent-103', name: 'Claims Processor', riskScore: 52, status: 'degraded', trend: 'up', lastIncident: '12h ago' },
  { id: 'agent-071', name: 'Market Analysis', riskScore: 45, status: 'healthy', trend: 'stable', lastIncident: '5d ago' },
];

// Recent status changes
const MOCK_RECENT_STATUS_CHANGES = [
  { agent: 'Trading Assistant', from: 'healthy', to: 'degraded', time: '14 min ago', reason: 'High latency detected' },
  { agent: 'Claims Processor', from: 'down', to: 'degraded', time: '47 min ago', reason: 'Partial recovery' },
  { agent: 'KYC Validator', from: 'maintenance', to: 'healthy', time: '2h ago', reason: 'Maintenance complete' },
  { agent: 'Credit Risk Engine', from: 'degraded', to: 'healthy', time: '4h ago', reason: 'Auto-remediation' },
];

// Combined incident & alert feed
type FeedItemType = 'incident' | 'alert';
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'warning' | 'info';

interface FeedItem {
  id: string;
  type: FeedItemType;
  title: string;
  severity: Severity;
  agent?: string;
  timeSince: string;
  acknowledged: boolean;
  assignee?: string;
}

const MOCK_INCIDENT_ALERT_FEED: FeedItem[] = [
  { id: 'INC-2024-0892', type: 'incident', title: 'Model timeout threshold breached', severity: 'critical', agent: 'Trading Assistant', timeSince: '14m', acknowledged: true, assignee: 'Sarah Chen' },
  { id: 'ALT-9284', type: 'alert', title: 'Token consumption spike detected', severity: 'warning', agent: 'Customer Service Bot', timeSince: '23m', acknowledged: false },
  { id: 'INC-2024-0891', type: 'incident', title: 'Guardrail bypass attempt blocked', severity: 'high', agent: 'Claims Processor', timeSince: '47m', acknowledged: true, assignee: 'Marcus Williams' },
  { id: 'ALT-9283', type: 'alert', title: 'Error rate above threshold', severity: 'warning', agent: 'Fraud Detection', timeSince: '1h 12m', acknowledged: true, assignee: 'Ops Team' },
  { id: 'INC-2024-0890', type: 'incident', title: 'Memory pressure causing restarts', severity: 'high', agent: 'Market Analysis', timeSince: '2h 5m', acknowledged: true, assignee: 'Alex Kumar' },
  { id: 'ALT-9281', type: 'alert', title: 'SLA breach warning - p99 latency', severity: 'info', timeSince: '3h 20m', acknowledged: false },
  { id: 'INC-2024-0889', type: 'incident', title: 'Data source connection failure', severity: 'medium', agent: 'KYC Validator', timeSince: '4h 45m', acknowledged: true, assignee: 'Sarah Chen' },
  { id: 'ALT-9280', type: 'alert', title: 'Certificate expiry in 7 days', severity: 'info', timeSince: '5h', acknowledged: true, assignee: 'Platform Team' },
];

// Compliance & Risk
const MOCK_FRAMEWORK_COMPLIANCE = [
  { framework: 'SOC 2 Type II', status: 'compliant', controlsPassed: 89, controlsTotal: 92, nextAudit: relDate(35) },
  { framework: 'ISO 27001', status: 'at-risk', controlsPassed: 108, controlsTotal: 114, nextAudit: relDate(19) },
  { framework: 'PCI DSS', status: 'compliant', controlsPassed: 78, controlsTotal: 78, nextAudit: relDate(51) },
  { framework: 'NIST AI RMF', status: 'in-progress', controlsPassed: 42, controlsTotal: 58, nextAudit: relDate(96) },
];

// 7-day risk score sparkline data
const MOCK_RISK_TREND_7D = [
  { day: 'Mon', score: 72 },
  { day: 'Tue', score: 68 },
  { day: 'Wed', score: 71 },
  { day: 'Thu', score: 75 },
  { day: 'Fri', score: 73 },
  { day: 'Sat', score: 70 },
  { day: 'Sun', score: 74 },
];

// Upcoming deadlines
const MOCK_UPCOMING_DEADLINES = [
  { title: 'SOC 2 evidence submission', dueDate: relDate(9), daysLeft: 9, priority: 'high' },
  { title: 'ISO 27001 audit prep', dueDate: relDate(14), daysLeft: 14, priority: 'high' },
  { title: 'Quarterly risk review', dueDate: relDate(20), daysLeft: 20, priority: 'medium' },
  { title: 'Model attestation renewal', dueDate: relDate(25), daysLeft: 25, priority: 'medium' },
];

// Policy violations from ops
const MOCK_POLICY_VIOLATIONS = [
  { policy: 'Max response latency', agent: 'Trading Assistant', count: 12, lastOccurrence: '14m ago' },
  { policy: 'Guardrail activation rate', agent: 'Customer Service Bot', count: 8, lastOccurrence: '2h ago' },
  { policy: 'Memory utilization limit', agent: 'Claims Processor', count: 5, lastOccurrence: '47m ago' },
];

// 24-hour trend data
const MOCK_24H_TREND = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i.toString().padStart(2, '0')}:00`,
  incidents: Math.max(0, Math.floor(Math.random() * 3) + (i > 8 && i < 18 ? 1 : 0)),
  alerts: Math.floor(Math.random() * 8) + 2 + (i > 9 && i < 17 ? 3 : 0),
  availability: 99.0 + Math.random() * 1.0 - (i === 14 ? 0.8 : 0),
}));

// ────────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ────────────────────────────────────────────────────────────────────────────────

const severityColors: Record<Severity, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  info: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
};

const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
  healthy: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  degraded: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  down: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  maintenance: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
};

function KPISkeleton() {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm animate-pulse">
      <div className="h-3 bg-slate-200 rounded w-20 mb-2" />
      <div className="h-6 bg-slate-200 rounded w-16 mb-2" />
      <div className="h-3 bg-slate-200 rounded w-24" />
    </div>
  );
}

/**
 * Sub-line for a hero KPI that states where the number came from.
 *
 * The hero strip previously carried NO per-card provenance while the page header
 * showed a single Live pill derived from `anyLive` - an OR across six independent
 * sources. Observed on the running stack: fleet status and alerts were live, while
 * incidents, SLA, MTTR and on-call were all live:false, so four of the six cards
 * rendered hardcoded constants (5 incidents, 98.7% SLA, 18m MTTR, "Sarah Chen")
 * under a green "Live (Operations APIs)" badge.
 */
function KpiSource({ live, sub, need }: { live: boolean; sub: string; need: string }) {
  if (live) return <>{sub}</>;
  return (
    <span className="flex flex-col gap-0.5">
      <span>{sub}</span>
      <span className="inline-flex"><MockDataBadge integration={need} /></span>
    </span>
  );
}

function HeroKPIs() {
  const { loading: fleetLoading, data: fleetData, live: fleetLive } = useFleetStatus();
  const { loading: alertsLoading, data: alertsData, live: alertsLive } = useActiveAlerts();
  const { loading: incidentsLoading, data: incidentsData, live: incidentsLive } = useIncidents();
  const { loading: slasLoading, data: slasData, live: slasLive } = useSLAs();
  const { loading: metricsLoading, data: metricsData, live: metricsLive } = useOpsMetrics();
  const { loading: onCallLoading, data: onCallData, live: onCallLive } = useOnCall();

  // Each block reads live data only when that source is genuinely live; otherwise
  // it falls back to the demo/mock KPI so empty (live:false) responses never
  // replace the mock values under a Live indicator.

  // Extract fleet health data (backend nests counts under `summary`).
  const fleetHealth = (fleetData && fleetLive) ? {
    percentage: fleetData.summary.pct_healthy ?? MOCK_FLEET_HEALTH.percentage,
    healthy: fleetData.summary.healthy ?? MOCK_FLEET_HEALTH.healthy,
    total: fleetData.summary.total ?? MOCK_FLEET_HEALTH.total,
  } : MOCK_FLEET_HEALTH;

  // Extract incidents data (operations incidents store is empty/live:false today)
  const activeIncidents = (incidentsData && incidentsLive) ? {
    total: incidentsData.total ?? MOCK_ACTIVE_INCIDENTS.total,
    critical: incidentsData.incidents?.filter(i => i.severity === 'Critical').length ?? MOCK_ACTIVE_INCIDENTS.critical,
    high: incidentsData.incidents?.filter(i => i.severity === 'High').length ?? MOCK_ACTIVE_INCIDENTS.high,
  } : MOCK_ACTIVE_INCIDENTS;

  // Extract SLA data (SLA compliance is synthetic → reports live:false → mock)
  const slaCompliance = (slasData && slasLive) ? {
    percentage: slasData.overall_compliance_pct ?? MOCK_SLA_COMPLIANCE.percentage,
    target: MOCK_SLA_COMPLIANCE.target, // Target comes from config
    breachesThisMonth: slasData.breached_count ?? MOCK_SLA_COMPLIANCE.breachesThisMonth,
    trending: (slasData.overall_compliance_pct ?? 0) >= MOCK_SLA_COMPLIANCE.target ? 'up' : 'down',
  } : MOCK_SLA_COMPLIANCE;

  // Extract MTTR data from the metrics summary. The payload carries no real 7d
  // MTTR history, so we only keep a trend for the pure-demo case; under live data
  // we hide the trend rather than show a fabricated delta.
  const mttr: { currentMinutes: number; targetMinutes: number; trend7d: number | null } = (metricsData && metricsLive) ? {
    currentMinutes: metricsData.summary.mttr_minutes ?? MOCK_MTTR.currentMinutes,
    targetMinutes: MOCK_MTTR.targetMinutes, // Target comes from config
    trend7d: null, // real 7d MTTR history not available yet
  } : {
    currentMinutes: MOCK_MTTR.currentMinutes,
    targetMinutes: MOCK_MTTR.targetMinutes,
    trend7d: MOCK_MTTR.trend7d,
  };

  // Extract alerts data. Backend aggregates critical_count and high_count from
  // CloudWatch alarms; the KPI's second bucket maps to the high-severity count.
  const openAlerts = (alertsData && alertsLive) ? {
    total: alertsData.total ?? MOCK_OPEN_ALERTS.total,
    critical: alertsData.critical_count ?? MOCK_OPEN_ALERTS.critical,
    warning: alertsData.high_count ?? MOCK_OPEN_ALERTS.warning,
  } : MOCK_OPEN_ALERTS;

  // A rotation gap is a live FACT, not missing data - so on the live path these fields must
  // not fall back to MOCK_ON_CALL. The backend returns live=true with primary=None in two
  // real states: PagerDuty reporting nobody on call
  // (govern_operations_service.py:1405 `CurrentOnCallResponse(live=True, source="pagerduty")`)
  // and stored shifts existing while none covers `now` (:1372-1381, where
  // `live=len(shifts) > 0` but primary/secondary/schedule_name/shift_ends_at are all None).
  // Substituting the mock there printed "Sarah Chen / Platform SRE / until 18:00 UTC /
  // Backup: Marcus Williams" beside the pulsing green Live dot, so an uncovered rotation
  // looked fully staffed and a responder would page someone who is not on it.
  const onCall: { primary: string | null; secondary: string | null; team: string | null; shiftEnd: string | null } =
    (onCallData && onCallLive)
      ? {
          primary: onCallData.primary?.name ?? null,
          secondary: onCallData.secondary?.name ?? null,
          team: onCallData.schedule_name ?? null,
          shiftEnd: onCallData.shift_ends_at
            ? new Date(onCallData.shift_ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
            : null,
        }
      // NOT live: null every field rather than substituting MOCK_ON_CALL. The mock
      // names "Sarah Chen" and "Backup: Marcus Williams"; printing those while the
      // backend says live:false / "Configure PAGERDUTY_API_KEY" tells a responder to
      // page someone who is not on the rotation - the same reasoning already applied
      // to the live rotation-gap case above, which this path had missed.
      : { primary: null, secondary: null, team: null, shiftEnd: null };

  // Live, and nobody is on call. This is the state worth shouting about, not hiding.
  const onCallGap = !!(onCallLive && !onCall.primary);

  const healthStatus = fleetHealth.percentage >= 95 ? 'success' :
                       fleetHealth.percentage >= 90 ? 'warning' : 'danger';
  const slaStatus = slaCompliance.percentage >= slaCompliance.target ? 'success' :
                    slaCompliance.percentage >= 98 ? 'warning' : 'danger';
  const mttrStatus = mttr.currentMinutes <= mttr.targetMinutes ? 'success' : 'warning';
  const alertStatus = openAlerts.critical > 0 ? 'danger' :
                      openAlerts.warning > 5 ? 'warning' : 'info';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      {/* Fleet Health */}
      {fleetLoading ? <KPISkeleton /> : (
        <StatCard
          label="Fleet Health"
          value={`${fleetHealth.percentage.toFixed(1)}%`}
          variant={healthStatus}
          sub={<KpiSource live={fleetLive} sub={`${fleetHealth.healthy}/${fleetHealth.total} healthy`} need="Fleet status from CloudWatch" />}
          icon={
            <div className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${healthStatus === 'success' ? 'bg-emerald-500' : healthStatus === 'warning' ? 'bg-amber-500' : 'bg-rose-500'} animate-pulse`} />
              {fleetLive && <span className="w-1 h-1 rounded-full bg-emerald-500" title="Live data" />}
            </div>
          }
        />
      )}

      {/* Active Incidents */}
      {incidentsLoading ? <KPISkeleton /> : (
        <StatCard
          label="Active Incidents"
          value={activeIncidents.total}
          variant={activeIncidents.critical > 0 ? 'danger' : activeIncidents.high > 0 ? 'warning' : 'info'}
          sub={<KpiSource live={incidentsLive} sub={`${activeIncidents.critical} crit / ${activeIncidents.high} high`} need="Incident store (empty today)" />}
          icon={<Icon name="exclamation-triangle" className="w-4 h-4 text-rose-500" />}
        />
      )}

      {/* SLA Compliance */}
      {slasLoading ? <KPISkeleton /> : (
        <StatCard
          label="SLA Compliance"
          value={`${slaCompliance.percentage.toFixed(1)}%`}
          variant={slaStatus}
          sub={<KpiSource live={slasLive} sub={`Target: ${slaCompliance.target}%`} need="SLA targets + measured compliance" />}
          trend={{
            value: `${slaCompliance.breachesThisMonth} breaches`,
            direction: slaCompliance.trending === 'up' ? 'up' : slaCompliance.trending === 'down' ? 'down' : 'flat',
            isPositive: slaCompliance.trending === 'up',
          }}
        />
      )}

      {/* MTTR */}
      {metricsLoading ? <KPISkeleton /> : (
        <StatCard
          label="MTTR"
          value={`${mttr.currentMinutes}m`}
          variant={mttrStatus}
          sub={<KpiSource live={metricsLive} sub={`Target: ${mttr.targetMinutes}m`} need="Resolved incidents for MTTR" />}
          trend={mttr.trend7d !== null ? {
            value: `${Math.abs(mttr.trend7d)}%`,
            direction: mttr.trend7d < 0 ? 'down' : 'up',
            isPositive: mttr.trend7d < 0,
          } : undefined}
        />
      )}

      {/* Open Alerts */}
      {alertsLoading ? <KPISkeleton /> : (
        <StatCard
          label="Open Alerts"
          value={openAlerts.total}
          variant={alertStatus}
          sub={<KpiSource live={alertsLive} sub={`${openAlerts.critical} crit / ${openAlerts.warning} warn`} need="CloudWatch alarms" />}
          icon={<Icon name="bell-alert" className="w-4 h-4 text-amber-500" />}
        />
      )}

      {/* On-Call */}
      {onCallLoading ? <KPISkeleton /> : (
        <div className={`bg-white/80 backdrop-blur-sm rounded-xl border p-4 shadow-sm ${onCallGap ? 'border-rose-300' : 'border-slate-200/60'}`}>
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">On-Call</div>
            {onCallLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Live data" />}
          </div>
          {onCallGap ? (
            <>
              <div
                className="text-sm font-semibold text-rose-600 mt-1"
                title="The on-call source responded, and it reports nobody currently on call. This is a real coverage gap, not missing data."
              >
                No one on call
              </div>
              <div className="text-[10px] text-rose-500 mt-1">
                Rotation reported no active shift
              </div>
            </>
          ) : !onCallLive ? (
            /* Third state, and it is NOT the same as a rotation gap. The source is not
               connected, so we know nothing about who is on call - as opposed to knowing
               that nobody is. Rendering bare dashes conflated the two; naming a mock
               person (the previous behaviour) was worse still. */
            <>
              <div className="text-sm font-semibold text-slate-400 mt-1" title="The on-call source is not connected, so coverage is unknown. This is different from a confirmed rotation gap.">
                Not connected
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Coverage unknown &mdash; not a confirmed gap
              </div>
              <div className="mt-1.5 inline-flex">
                <MockDataBadge integration="Set PAGERDUTY_API_KEY, or define on-call shifts, to show real coverage" />
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-slate-900 mt-1 truncate" title={onCall.primary ?? undefined}>
                {onCall.primary ?? '—'}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-slate-400">{onCall.team ?? '—'}</span>
                <span className="text-[10px] text-slate-300">|</span>
                <span className="text-[10px] text-slate-400">
                  {onCall.shiftEnd ? `until ${onCall.shiftEnd}` : 'shift end unknown'}
                </span>
              </div>
              <div className="text-[9px] text-slate-400 mt-1">
                Backup: {onCall.secondary ?? '—'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FleetStatusSection() {
  const { loading, data, live } = useFleetStatus();

  // Build fleet status breakdown from live data (nested under `summary`) or use
  // mock. The backend's fourth bucket is `unknown` (not `maintenance`).
  const fleetStatus = (data && live) ? [
    { status: 'healthy', count: data.summary.healthy ?? MOCK_FLEET_STATUS[0].count, color: '#10b981' },
    { status: 'degraded', count: data.summary.degraded ?? MOCK_FLEET_STATUS[1].count, color: '#f59e0b' },
    { status: 'down', count: data.summary.down ?? MOCK_FLEET_STATUS[2].count, color: '#ef4444' },
    { status: 'unknown', count: data.summary.unknown ?? MOCK_FLEET_STATUS[3].count, color: '#6366f1' },
  ] : MOCK_FLEET_STATUS;

  const totalAgents = (data && live) ? (data.summary.total ?? MOCK_FLEET_HEALTH.total) : MOCK_FLEET_HEALTH.total;

  // Skeleton loader
  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm h-full animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 bg-slate-200 rounded w-24" />
          <div className="h-4 bg-slate-200 rounded w-16" />
        </div>
        <div className="space-y-3 mb-5">
          {[...Array(4)].map((_, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <div className="h-3 bg-slate-200 rounded w-16" />
                <div className="h-3 bg-slate-200 rounded w-8" />
              </div>
              <div className="h-2 bg-slate-100 rounded-full" />
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-4">
          <div className="h-3 bg-slate-200 rounded w-20 mb-3" />
          <div className="space-y-2.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-4 bg-slate-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Fleet Status</h3>
        {live ? (
          <LiveDataBadge source="Fleet Monitor" />
        ) : (
          <MockDataBadge integration="Connect Fleet Monitor API" />
        )}
      </div>

      {/* Status breakdown bars */}
      <div className="space-y-3 mb-5">
        {fleetStatus.map(s => {
          const pct = totalAgents > 0 ? (s.count / totalAgents) * 100 : 0;
          return (
            <div key={s.status}>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="capitalize text-slate-600">{s.status}</span>
                <span className="font-semibold text-slate-700">{s.count}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: s.color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Top risk agents - risk scoring requires a separate endpoint (not yet wired) */}
      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Top 5 by Risk</h4>
          {!live && <MockDataBadge integration="Connect risk scoring endpoint" />}
        </div>
        {live ? (
          <div className="text-[11px] text-slate-400 py-2">Risk scoring is not yet available from the live fleet feed.</div>
        ) : (
        <div className="space-y-2.5">
          {MOCK_TOP_RISK_AGENTS.map(agent => (
            <div key={agent.id} className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full ${statusColors[agent.status]?.dot || 'bg-slate-400'}`} />
                <span className="text-slate-700 truncate" title={agent.name}>{agent.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`font-semibold tabular-nums ${agent.riskScore >= 70 ? 'text-rose-600' : agent.riskScore >= 50 ? 'text-amber-600' : 'text-slate-600'}`}>
                  {agent.riskScore}
                </span>
                <Icon
                  name={agent.trend === 'up' ? 'arrow-trending-up' : agent.trend === 'down' ? 'arrow-down' : 'arrow-right'}
                  className={`w-3 h-3 ${agent.trend === 'up' ? 'text-rose-500' : agent.trend === 'down' ? 'text-emerald-500' : 'text-slate-400'}`}
                />
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* Recent status changes - status-change stream not yet wired */}
      <div className="border-t border-slate-100 pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Recent Changes</h4>
          {!live && <MockDataBadge integration="Connect fleet status-change stream" />}
        </div>
        {live ? (
          <div className="text-[11px] text-slate-400 py-2">No recent status changes.</div>
        ) : (
        <div className="space-y-2">
          {MOCK_RECENT_STATUS_CHANGES.slice(0, 3).map((change, i) => (
            <div key={i} className="text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${statusColors[change.from]?.dot || 'bg-slate-400'}`} />
                <Icon name="arrow-right" className="w-2.5 h-2.5 text-slate-300" />
                <span className={`w-1.5 h-1.5 rounded-full ${statusColors[change.to]?.dot || 'bg-slate-400'}`} />
                <span className="text-slate-700 font-medium truncate">{change.agent}</span>
              </div>
              <div className="ml-6 text-slate-400">{change.time} - {change.reason}</div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

function IncidentAlertFeed() {
  const [filter, setFilter] = useState<'all' | 'incidents' | 'alerts'>('all');
  const { loading: incidentsLoading, data: incidentsData, live: incidentsLive } = useIncidents();
  const { loading: alertsLoading, data: alertsData, live: alertsLive } = useActiveAlerts();

  const loading = incidentsLoading || alertsLoading;
  const anyLive = incidentsLive || alertsLive;

  // Build combined feed from live data or use mock. Each source only contributes
  // when it is genuinely live, so an empty (live:false) response never produces
  // rows under a Live pill.
  const buildFeed = (): FeedItem[] => {
    const feed: FeedItem[] = [];

    // Add incidents (operations incidents store is empty/live:false today)
    if (incidentsLive && incidentsData?.incidents) {
      incidentsData.incidents.forEach(inc => {
        feed.push({
          id: inc.id,
          type: 'incident',
          title: inc.title,
          severity: inc.severity.toLowerCase() as Severity,
          agent: inc.affectedAgents?.[0],
          timeSince: formatTimeSince(inc.createdAt),
          acknowledged: !!inc.acknowledgedAt,
          assignee: inc.owner,
        });
      });
    }

    // Add alerts (live CloudWatch alarms). The alarm summary has no agent name;
    // use the alarm state reason as the title and the alarm name as a fallback.
    if (alertsLive && alertsData?.alerts) {
      alertsData.alerts.forEach(alert => {
        feed.push({
          id: alert.id,
          type: 'alert',
          title: alert.state_reason || alert.alarm_name,
          severity: alert.severity as Severity,
          agent: undefined,
          timeSince: formatTimeSince(alert.state_updated ?? ''),
          acknowledged: alert.acknowledged,
          assignee: alert.acknowledged_by ?? undefined,
        });
      });
    }

    // Sort by time (most recent first) - this is a simple approximation
    return feed;
  };

  // Only fall back to mock data when we are NOT live. When the feed is live but
  // empty we show an empty state rather than demo rows under a green Live pill.
  const realFeed = buildFeed();
  const usingMock = !anyLive && realFeed.length === 0;
  const feed = usingMock ? MOCK_INCIDENT_ALERT_FEED : realFeed;

  const filteredFeed = feed.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'incidents') return item.type === 'incident';
    return item.type === 'alert';
  });

  // Skeleton loader
  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm h-full flex flex-col animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 bg-slate-200 rounded w-32" />
          <div className="h-4 bg-slate-200 rounded w-16" />
        </div>
        <div className="h-8 bg-slate-100 rounded-lg w-40 mb-4" />
        <div className="space-y-2 flex-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Incident & Alert Feed</h3>
        {anyLive ? (
          <LiveDataBadge source={alertsLive ? 'CloudWatch Alarms' : 'PagerDuty'} />
        ) : (
          <MockDataBadge integration="Connect PagerDuty / OpsGenie" />
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-0.5 bg-slate-100/80 rounded-lg text-[10px] mb-4 w-fit">
        {(['all', 'incidents', 'alerts'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-md font-medium capitalize transition-all ${filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Feed list */}
      <div className="space-y-2 overflow-y-auto flex-1 min-h-0 max-h-[400px]">
        {filteredFeed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Icon name="check-circle" className="w-8 h-8 text-slate-300 mb-2" />
            <div className="text-[11px] font-medium text-slate-500">No active incidents or alerts</div>
            <div className="text-[10px] text-slate-400">
              {anyLive ? 'The live feed is connected and currently clear.' : 'Nothing to show.'}
            </div>
          </div>
        ) : filteredFeed.map(item => {
          const colors = severityColors[item.severity] ?? severityColors.info;
          return (
            <div
              key={item.id}
              className={`p-3 rounded-lg border ${colors.border} ${colors.bg} transition-all hover:shadow-sm`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${item.type === 'incident' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                      {item.type === 'incident' ? 'INC' : 'ALT'}
                    </span>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
                      {item.severity.toUpperCase()}
                    </span>
                    <span className="text-[9px] text-slate-400">{item.id}</span>
                  </div>
                  <div className="text-[11px] font-medium text-slate-800 truncate">{item.title}</div>
                  {item.agent && (
                    <div className="text-[10px] text-slate-500 mt-0.5">{item.agent}</div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] text-slate-400">{item.timeSince}</div>
                  {item.acknowledged ? (
                    <div className="text-[9px] text-emerald-600 mt-0.5">
                      <Icon name="check" className="w-3 h-3 inline mr-0.5" />
                      {item.assignee}
                    </div>
                  ) : (
                    <div className="text-[9px] text-amber-600 mt-0.5 animate-pulse">Unacknowledged</div>
                  )}
                </div>
              </div>
              {/* Quick actions — demo controls, not yet wired to a backend */}
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200/50">
                {!item.acknowledged && (
                  <button
                    type="button"
                    disabled
                    title="Demo — acknowledge is not yet wired to a backend"
                    className="text-[9px] font-medium text-blue-600 px-2 py-0.5 rounded bg-blue-50 opacity-50 cursor-not-allowed"
                  >
                    Acknowledge
                  </button>
                )}
                <button
                  type="button"
                  disabled
                  title="Demo — escalate is not yet wired to a backend"
                  className="text-[9px] font-medium text-slate-600 px-2 py-0.5 rounded bg-slate-100 opacity-50 cursor-not-allowed"
                >
                  Escalate
                </button>
                <button
                  type="button"
                  disabled
                  title="Demo — view is not yet wired to a backend"
                  className="text-[9px] font-medium text-slate-600 px-2 py-0.5 rounded bg-slate-100 opacity-50 cursor-not-allowed"
                >
                  View
                </button>
                <span className="text-[8px] text-slate-400 ml-auto italic">Demo</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Helper function to format time since a date string */
function formatTimeSince(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  } catch {
    return 'unknown';
  }
}

function ComplianceRiskSection() {
  const { loading, data } = useOpsMetrics();

  // Per-section liveness: a block is only "live" when the payload actually
  // carries that data. Otherwise we render the mock fallback badged as Demo so
  // it never appears under a green Live pill.
  // `Array.isArray` alone counted an EMPTY live array as live, and an empty array is also
  // truthy so the `|| MOCK_*` fallbacks below did not fire for it either. A payload carrying
  // `riskTrend7d: []` therefore suppressed the Demo badge (`!hasRiskTrend` was false) while
  // leaving the section with no data, at which point the `?? 74` / `?? 72` defaults rendered
  // a fabricated risk score of 74 - the top of the High band, painted rose - trending a
  // fabricated +2 worse, under no badge at all. Require content, not just a shape.
  const liveFramework = data?.frameworkCompliance?.length ? data.frameworkCompliance : null;
  const liveRiskTrend = data?.riskTrend7d?.length ? data.riskTrend7d : null;
  const liveDeadlines = data?.upcomingDeadlines?.length ? data.upcomingDeadlines : null;
  const liveViolations = data?.policyViolations?.length ? data.policyViolations : null;

  const hasFramework = liveFramework !== null;
  const hasRiskTrend = liveRiskTrend !== null;
  const hasDeadlines = liveDeadlines !== null;
  const hasViolations = liveViolations !== null;

  // Use live data or fallback to mock
  const frameworkCompliance = liveFramework ?? MOCK_FRAMEWORK_COMPLIANCE;
  const riskTrend7d = liveRiskTrend ?? MOCK_RISK_TREND_7D;
  const upcomingDeadlines = liveDeadlines ?? MOCK_UPCOMING_DEADLINES;
  const policyViolations = liveViolations ?? MOCK_POLICY_VIOLATIONS;

  // Both branches of riskTrend7d are now non-empty by construction, so there is nothing to
  // substitute a literal for. Kept null-safe rather than asserted: if it is ever empty the
  // score renders as unmeasured below, never as a number nobody computed.
  const lastPoint = riskTrend7d[riskTrend7d.length - 1];
  const firstPoint = riskTrend7d[0];
  const currentRiskScore = lastPoint?.score ?? null;
  const riskTrend =
    currentRiskScore !== null && firstPoint?.score !== undefined
      ? currentRiskScore - firstPoint.score
      : null;

  // Skeleton loader
  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm h-full animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 bg-slate-200 rounded w-28" />
          <div className="h-4 bg-slate-200 rounded w-16" />
        </div>
        <div className="space-y-2.5 mb-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-5 bg-slate-200 rounded" />
          ))}
        </div>
        <div className="border-t border-slate-100 pt-4">
          <div className="h-3 bg-slate-200 rounded w-24 mb-2" />
          <div className="h-16 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Compliance & Risk</h3>
        {hasFramework ? (
          <LiveDataBadge source="Audit Manager" />
        ) : (
          <MockDataBadge integration="Connect Audit Manager" />
        )}
      </div>

      {/* Framework compliance */}
      <div className="space-y-2.5 mb-5">
        {frameworkCompliance.map(fw => {
          const pct = Math.round((fw.controlsPassed / fw.controlsTotal) * 100);
          const statusColor = fw.status === 'compliant' ? 'text-emerald-600 bg-emerald-50' :
                              fw.status === 'at-risk' ? 'text-rose-600 bg-rose-50' :
                              'text-amber-600 bg-amber-50';
          return (
            <div key={fw.framework} className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-slate-700 truncate font-medium">{fw.framework}</span>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${statusColor}`}>
                  {fw.status.replace('-', ' ')}
                </span>
              </div>
              <span className="text-slate-500 tabular-nums flex-shrink-0">{pct}%</span>
            </div>
          );
        })}
      </div>

      {/* Risk score trend */}
      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Risk Score (7d)</h4>
            {!hasRiskTrend && <MockDataBadge integration="Connect risk score history" />}
          </div>
          <div className="flex items-center gap-1.5">
            {currentRiskScore === null ? (
              <span
                className="text-sm font-bold tabular-nums text-slate-400"
                title="No risk score history available, so there is no current score to report."
              >
                —
              </span>
            ) : (
              <>
                <span className={`text-sm font-bold tabular-nums ${currentRiskScore >= 70 ? 'text-rose-600' : currentRiskScore >= 50 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {currentRiskScore}
                </span>
                {riskTrend !== null && (
                  <span className={`text-[10px] ${riskTrend > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {riskTrend > 0 ? '+' : ''}{riskTrend}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={60}>
          <LineChart data={riskTrend7d} margin={{ left: 0, right: 0, top: 5, bottom: 0 }}>
            <Line
              type="monotone"
              dataKey="score"
              // null >= 70 is false in JS, so an unmeasured score would have fallen through
              // to the emerald "healthy" stroke. Slate when there is nothing to colour.
              stroke={currentRiskScore === null ? '#cbd5e1' : currentRiskScore >= 70 ? '#ef4444' : currentRiskScore >= 50 ? '#f59e0b' : '#10b981'}
              strokeWidth={2}
              dot={false}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => [`${value}`, 'Risk Score']}
              labelFormatter={(label) => label}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Upcoming deadlines */}
      <div className="border-t border-slate-100 pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Upcoming Deadlines</h4>
          {!hasDeadlines && <MockDataBadge integration="Connect audit calendar" />}
        </div>
        <div className="space-y-2">
          {upcomingDeadlines.slice(0, 3).map((deadline, i) => (
            <div key={i} className="flex items-center justify-between text-[10px]">
              <span className="text-slate-700 truncate pr-2">{deadline.title}</span>
              <span className={`font-semibold tabular-nums flex-shrink-0 ${deadline.daysLeft <= 7 ? 'text-rose-600' : deadline.daysLeft <= 14 ? 'text-amber-600' : 'text-slate-500'}`}>
                {deadline.daysLeft}d
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Policy violations */}
      <div className="border-t border-slate-100 pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Policy Violations</h4>
          {!hasViolations && <MockDataBadge integration="Connect policy engine" />}
        </div>
        <div className="space-y-2">
          {policyViolations.map((v, i) => (
            <div key={i} className="text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-700">{v.policy}</span>
                <span className="font-semibold text-rose-600 tabular-nums">{v.count}</span>
              </div>
              <div className="text-slate-400">{v.agent} - {v.lastOccurrence}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrendChart() {
  const { loading, data } = useOpsMetrics();

  // Use live data or fallback to mock. Only badge Live when the payload actually
  // carries the 24h trend series (otherwise this is random demo data).
  // Require CONTENT, not just an array shape — the same correction already applied to
  // ComplianceRiskSection's four gates above. `Array.isArray([])` is true and `[]` is truthy,
  // so a payload carrying `trend24h: []` rendered LiveDataBadge source="CloudWatch" over an
  // empty chart: a live claim with nothing behind it. This gate was missed in that pass
  // because it lives in a different component in the same file.
  const liveTrend = data?.trend24h?.length ? data.trend24h : null;
  const hasTrend = liveTrend !== null;
  const trendData = liveTrend ?? MOCK_24H_TREND;

  // Skeleton loader
  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-4 bg-slate-200 rounded w-28" />
            <div className="h-4 bg-slate-200 rounded w-16" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-3 bg-slate-200 rounded w-16" />
            <div className="h-3 bg-slate-200 rounded w-16" />
            <div className="h-3 bg-slate-200 rounded w-16" />
          </div>
        </div>
        <div className="h-[180px] bg-slate-100 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-slate-900">24-Hour Trend</h3>
          {hasTrend ? (
            <LiveDataBadge source="CloudWatch" />
          ) : (
            <MockDataBadge integration="Connect CloudWatch / Datadog" />
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="text-slate-500">Incidents</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-slate-500">Alerts</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-500">Availability</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={trendData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="incidentGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="alertGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 9 }} interval={3} />
          <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 9 }} width={30} />
          <YAxis yAxisId="right" orientation="right" domain={[98, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} width={40} tickFormatter={(v) => `${v}%`} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area yAxisId="left" type="monotone" dataKey="incidents" stroke="#ef4444" strokeWidth={2} fill="url(#incidentGrad)" name="Incidents" />
          <Area yAxisId="left" type="monotone" dataKey="alerts" stroke="#f59e0b" strokeWidth={2} fill="url(#alertGrad)" name="Alerts" />
          <Line yAxisId="right" type="monotone" dataKey="availability" stroke="#10b981" strokeWidth={2} dot={false} name="Availability %" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function QuickActions() {
  const actions = [
    { label: 'Create Incident', icon: 'plus' as const, color: 'bg-rose-500' },
    { label: 'Run Runbook', icon: 'play-circle' as const, color: 'bg-blue-500' },
    { label: 'Page On-Call', icon: 'bell-alert' as const, color: 'bg-amber-500' },
    { label: 'Emergency Stop', icon: 'stop-circle' as const, color: 'bg-slate-700' },
  ];

  // These actions are not yet wired to a backend. Render them disabled with a
  // demo label rather than firing a no-op (or faking success) on click.
  return (
    <div className="flex items-center gap-3 mt-4">
      {actions.map(action => (
        <button
          key={action.label}
          type="button"
          disabled
          title="Demo — action not yet wired to a backend"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[11px] font-semibold opacity-50 cursor-not-allowed ${action.color}`}
        >
          <Icon name={action.icon} className="w-4 h-4" />
          {action.label}
        </button>
      ))}
      <MockDataBadge integration="Wire Operations action APIs" />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────────────────────────

export default function OpsOverview() {
  // Use composite hook to determine overall live status
  const { live: fleetLive } = useFleetStatus();
  const { live: alertsLive } = useActiveAlerts();
  const { live: incidentsLive } = useIncidents();
  const { live: slasLive } = useSLAs();
  const { live: metricsLive } = useOpsMetrics();
  const { live: onCallLive } = useOnCall();

  // Count, do not OR. `anyLive` made ONE live source badge the whole page Live while
  // five others were serving constants. The header now states the split, and each card
  // carries its own provenance (see KpiSource).
  const liveSources = [fleetLive, alertsLive, incidentsLive, slasLive, metricsLive, onCallLive];
  const liveCount = liveSources.filter(Boolean).length;
  const allLive = liveCount === liveSources.length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Operations Overview</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Real-time visibility for Ops, SRE, and GRC leadership
          </p>
        </div>
        {/* States the split rather than claiming the page is Live because one of six
            sources is. Each hero card also carries its own provenance. */}
        {allLive ? (
          <LiveDataBadge source="Operations APIs" />
        ) : liveCount > 0 ? (
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-800"
            title={`${liveCount} of ${liveSources.length} operations sources are live. Cards fed by a non-live source are marked Demo individually.`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Mixed ({liveCount} of {liveSources.length} live)
          </span>
        ) : (
          <MockDataBadge integration="Connect Operations APIs" />
        )}
      </div>

      {/* Hero KPIs */}
      <HeroKPIs />

      {/* Three-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Real-time Status */}
        <FleetStatusSection />

        {/* Center: Incident & Alert Feed */}
        <IncidentAlertFeed />

        {/* Right: Compliance & Risk */}
        <ComplianceRiskSection />
      </div>

      {/* Bottom: 24-hour trend + quick actions */}
      <TrendChart />
      <QuickActions />
    </div>
  );
}
