/**
 * AlertCenter - Comprehensive Alerting System for Agentic AI Platform
 *
 * Features:
 * - KPI row: Active alerts by severity, firing rules, noise ratio, MTTA, channels
 * - Active alerts list grouped by severity (Critical at top)
 * - Alert rules management with CRUD, templates, enable/disable
 * - Notification routing visualization
 * - Alert history with resolution and frequency analysis
 * - Silence management for maintenance windows
 *
 * Live data integration:
 * - Alerts come from CloudWatch Alarms when connected
 * - Alarm state (ALARM, OK, INSUFFICIENT_DATA) maps to status
 * - Severity based on alarm configuration
 * - Real metric values that triggered the alarm
 *
 * FSI-appropriate thresholds and realistic mock data for AI agent workloads.
 */

import { useState, useMemo, useCallback } from 'react';
import { Icon, type IconName } from '../icons';
import StatCard from '../StatCard';
import { MockDataBadge, LiveDataBadge } from '../DataSourceIndicator';
import { useUser } from '../../../contexts/UserContext';
import {
  useActiveAlerts,
  useAlertRules,
  useAlertMutations,
  useSilences,
  MAX_SILENCE_MINUTES,
  type ActiveAlert,
  type AlertRule,
  type AlertSeverity,
  type AlertStatus,
  type AlertWriteResult,
  type RuleStatus,
  type MetricType,
  type Operator,
  type Silence,
} from './useAlerts';

// Types are now imported from useAlerts.ts

// Silence type is now imported from useAlerts.ts

interface NotificationChannel {
  id: string;
  name: string;
  type: 'slack' | 'pagerduty' | 'email' | 'sns' | 'webhook';
  config: Record<string, string>;
  severities: AlertSeverity[];
  businessHoursOnly: boolean;
}

interface RoutingRule {
  id: string;
  name: string;
  conditions: {
    severity?: AlertSeverity[];
    agents?: string[];
    rules?: string[];
  };
  channels: string[];
  businessHoursStart?: string;
  businessHoursEnd?: string;
}

interface AlertHistoryEntry {
  id: string;
  ruleId: string;
  ruleName: string;
  agentName: string;
  severity: AlertSeverity;
  firedAt: string;
  resolvedAt: string;
  durationMinutes: number;
  resolution: 'auto_resolved' | 'manual' | 'silenced';
}

// ─── Mock Data for static items (channels, routing, history) ───────────────────
// Alert rules and active alerts now come from useAlerts hooks

const MOCK_CHANNELS: NotificationChannel[] = [
  { id: 'slack-ops', name: 'Slack - #ops-alerts', type: 'slack', config: { channel: '#ops-alerts' }, severities: ['critical', 'high', 'warning', 'info'], businessHoursOnly: false },
  { id: 'slack-security', name: 'Slack - #security-alerts', type: 'slack', config: { channel: '#security-alerts' }, severities: ['critical', 'high'], businessHoursOnly: false },
  { id: 'slack-finops', name: 'Slack - #finops-alerts', type: 'slack', config: { channel: '#finops-alerts' }, severities: ['warning', 'info'], businessHoursOnly: true },
  { id: 'slack-compliance', name: 'Slack - #compliance', type: 'slack', config: { channel: '#compliance' }, severities: ['high', 'warning'], businessHoursOnly: false },
  { id: 'pagerduty', name: 'PagerDuty - Platform', type: 'pagerduty', config: { service: 'platform' }, severities: ['critical', 'high'], businessHoursOnly: false },
  { id: 'email-oncall', name: 'Email - On-Call Team', type: 'email', config: { to: 'oncall@bank.com' }, severities: ['critical'], businessHoursOnly: false },
  { id: 'email-finance', name: 'Email - Finance Ops', type: 'email', config: { to: 'finance.ops@bank.com' }, severities: ['warning'], businessHoursOnly: true },
  { id: 'email-compliance', name: 'Email - Compliance', type: 'email', config: { to: 'compliance@bank.com' }, severities: ['high', 'warning'], businessHoursOnly: false },
];

const MOCK_ROUTING_RULES: RoutingRule[] = [
  { id: 'route-1', name: 'Critical to All', conditions: { severity: ['critical'] }, channels: ['slack-ops', 'pagerduty', 'email-oncall'] },
  { id: 'route-2', name: 'Security Alerts', conditions: { rules: ['rule-8'] }, channels: ['slack-security', 'pagerduty'] },
  { id: 'route-3', name: 'Cost Alerts', conditions: { rules: ['rule-4', 'rule-14'] }, channels: ['slack-finops', 'email-finance'], businessHoursStart: '09:00', businessHoursEnd: '17:00' },
  { id: 'route-4', name: 'Compliance Agents', conditions: { agents: ['agent-kyc'] }, channels: ['slack-compliance', 'email-compliance'] },
];

// Demo silences moved to useAlerts.ts, next to the useSilences hook that serves them as a
// fallback when the silence store is unreachable.

const MOCK_ALERT_HISTORY: AlertHistoryEntry[] = [
  { id: 'hist-1', ruleId: 'rule-1', ruleName: 'High Latency', agentName: 'Trading Assistant', severity: 'warning', firedAt: '2026-08-10T14:20:00Z', resolvedAt: '2026-08-10T14:45:00Z', durationMinutes: 25, resolution: 'auto_resolved' },
  { id: 'hist-2', ruleId: 'rule-2', ruleName: 'Critical Error Rate', agentName: 'KYC Verification', severity: 'critical', firedAt: '2026-08-10T09:15:00Z', resolvedAt: '2026-08-10T09:35:00Z', durationMinutes: 20, resolution: 'manual' },
  { id: 'hist-3', ruleId: 'rule-6', ruleName: 'Queue Backup', agentName: 'Document Processor', severity: 'high', firedAt: '2026-08-09T16:30:00Z', resolvedAt: '2026-08-09T17:00:00Z', durationMinutes: 30, resolution: 'auto_resolved' },
  { id: 'hist-4', ruleId: 'rule-4', ruleName: 'Cost Overrun', agentName: 'Customer Support', severity: 'warning', firedAt: '2026-08-09T15:00:00Z', resolvedAt: '2026-08-09T15:30:00Z', durationMinutes: 30, resolution: 'silenced' },
  { id: 'hist-5', ruleId: 'rule-8', ruleName: 'Guardrail Breach', agentName: 'Trading Assistant', severity: 'critical', firedAt: '2026-08-08T14:20:00Z', resolvedAt: '2026-08-08T14:35:00Z', durationMinutes: 15, resolution: 'manual' },
  { id: 'hist-6', ruleId: 'rule-3', ruleName: 'Invocation Drop', agentName: 'Fraud Detection', severity: 'high', firedAt: '2026-08-08T08:30:00Z', resolvedAt: '2026-08-08T09:00:00Z', durationMinutes: 30, resolution: 'auto_resolved' },
  { id: 'hist-7', ruleId: 'rule-1', ruleName: 'High Latency', agentName: 'KYC Verification', severity: 'warning', firedAt: '2026-08-07T11:45:00Z', resolvedAt: '2026-08-07T12:10:00Z', durationMinutes: 25, resolution: 'manual' },
  { id: 'hist-8', ruleId: 'rule-10', ruleName: 'Cold Start Spike', agentName: 'Customer Support', severity: 'info', firedAt: '2026-08-07T08:00:00Z', resolvedAt: '2026-08-07T08:15:00Z', durationMinutes: 15, resolution: 'auto_resolved' },
];

// ─── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<AlertSeverity, { color: string; bg: string; border: string; icon: IconName }> = {
  critical: { color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', icon: 'exclamation-circle' },
  high: { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: 'exclamation-triangle' },
  warning: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: 'bell-alert' },
  info: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: 'information-circle' },
};

const STATUS_CONFIG: Record<AlertStatus, { color: string; bg: string; label: string }> = {
  firing: { color: 'text-rose-700', bg: 'bg-rose-100', label: 'FIRING' },
  acknowledged: { color: 'text-amber-700', bg: 'bg-amber-100', label: 'ACK' },
  silenced: { color: 'text-slate-600', bg: 'bg-slate-100', label: 'SILENCED' },
  resolved: { color: 'text-emerald-700', bg: 'bg-emerald-100', label: 'RESOLVED' },
};

const CHANNEL_ICONS: Record<NotificationChannel['type'], IconName> = {
  slack: 'chat-bubble',
  pagerduty: 'bell-alert',
  email: 'envelope',
  sns: 'megaphone',
  webhook: 'plug',
};

const METRIC_LABELS: Record<MetricType, string> = {
  latency: 'Latency (ms)',
  error_rate: 'Error Rate (%)',
  invocations: 'Invocations',
  cost: 'Cost ($)',
  token_usage: 'Token Usage (%)',
  queue_depth: 'Queue Depth',
};

const RULE_TEMPLATES = [
  { name: 'High Latency', metric: 'latency' as MetricType, operator: '>' as Operator, threshold: 2000, duration: 5, severity: 'warning' as AlertSeverity },
  { name: 'Error Spike', metric: 'error_rate' as MetricType, operator: '>' as Operator, threshold: 5, duration: 3, severity: 'critical' as AlertSeverity },
  { name: 'Cost Overrun', metric: 'cost' as MetricType, operator: '>' as Operator, threshold: 500, duration: 15, severity: 'warning' as AlertSeverity },
  { name: 'Traffic Drop', metric: 'invocations' as MetricType, operator: '<' as Operator, threshold: 50, duration: 10, severity: 'high' as AlertSeverity },
  { name: 'Queue Backup', metric: 'queue_depth' as MetricType, operator: '>' as Operator, threshold: 100, duration: 5, severity: 'high' as AlertSeverity },
  { name: 'Token Exhaustion', metric: 'token_usage' as MetricType, operator: '>' as Operator, threshold: 80, duration: 0, severity: 'warning' as AlertSeverity },
];

type Tab = 'active' | 'rules' | 'routing' | 'history' | 'silences';

// ─── Utility Functions ─────────────────────────────────────────────────────────

function timeSince(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

function timeUntil(iso: string): string {
  const mins = Math.floor((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins < 0) return 'expired';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// ─── Action feedback ───────────────────────────────────────────────────────────

type NoticeTone = 'success' | 'caution' | 'error' | 'info';

interface ActionNotice {
  tone: NoticeTone;
  title: string;
  detail?: string | null;
}

const NOTICE_TONES: Record<
  NoticeTone,
  { bg: string; border: string; text: string; icon: IconName; iconColor: string }
> = {
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', icon: 'check-circle', iconColor: 'text-emerald-500' },
  caution: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: 'exclamation-triangle', iconColor: 'text-amber-500' },
  error: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-800', icon: 'x-circle', iconColor: 'text-rose-500' },
  info: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', icon: 'information-circle', iconColor: 'text-slate-400' },
};

function ActionNoticeStrip({ notice, onDismiss }: { notice: ActionNotice; onDismiss?: () => void }) {
  const tone = NOTICE_TONES[notice.tone];
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${tone.bg} ${tone.border}`}>
      <Icon name={tone.icon} className={`w-4 h-4 flex-shrink-0 mt-0.5 ${tone.iconColor}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-medium ${tone.text}`}>{notice.title}</div>
        {notice.detail && <p className="text-[11px] text-slate-600 mt-0.5">{notice.detail}</p>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 text-slate-400 hover:text-slate-600"
        >
          <Icon name="x-mark" className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * What a silence does and does not do.
 *
 * A silence is applied by AVA when it builds the alert list. The backend deliberately does
 * NOT call DisableAlarmActions, because that is untimed and would silently disarm
 * production paging, so every notification action on the alarm stays armed. Saying this
 * plainly is the difference between a useful control and a dangerous one.
 */
const SILENCE_SCOPE_CAVEAT =
  'Suppression applies to this dashboard only. The CloudWatch alarms keep evaluating and their notification actions stay armed, so anything wired to SNS or a pager still fires.';

/** The acknowledgement is an AVA record; CloudWatch has no acknowledgement API. */
const ACK_SCOPE_CAVEAT =
  "Recorded in AVA against this alarm's current firing. The CloudWatch alarm is unchanged, and the acknowledgement clears if the alarm changes state again.";

function notSavedTitle(source: 'memory' | 'not-configured', subject: string): string {
  return source === 'not-configured'
    ? `${subject} was not saved — no operations table is configured.`
    : `${subject} was not saved — it will be lost on restart.`;
}

function noticeForAck(result: AlertWriteResult<ActiveAlert>): ActionNotice {
  switch (result.kind) {
    case 'persisted':
      return { tone: 'success', title: 'Acknowledged, and saved durably.', detail: result.note ?? ACK_SCOPE_CAVEAT };
    case 'unpersisted':
      return {
        tone: 'caution',
        title: notSavedTitle(result.source, 'The acknowledgement'),
        detail: result.note ?? `The acknowledgement is held in memory only. ${ACK_SCOPE_CAVEAT}`,
      };
    case 'unconfirmed':
      return {
        tone: 'caution',
        title: 'Acknowledged, but AVA could not confirm it was saved.',
        detail:
          result.note ??
          'The server did not report where the acknowledgement was stored, so it may not survive a restart. Refresh to check whether it held.',
      };
    case 'not-found':
      return { tone: 'info', title: 'Nothing to acknowledge.', detail: result.message };
    case 'failed':
      return { tone: 'error', title: 'Could not acknowledge — nothing was recorded.', detail: result.message };
  }
}

function noticeForSilenceCreate(
  result: AlertWriteResult<Silence>,
  durationMinutes: number
): ActionNotice {
  switch (result.kind) {
    case 'persisted':
      return {
        tone: 'success',
        title: `Silence created for ${formatDuration(durationMinutes)}, and saved durably.`,
        detail: [result.note, SILENCE_SCOPE_CAVEAT].filter(Boolean).join(' '),
      };
    case 'unpersisted':
      return {
        tone: 'caution',
        title: notSavedTitle(result.source, 'The silence'),
        detail: [result.note ?? 'The silence is held in memory only.', SILENCE_SCOPE_CAVEAT].join(' '),
      };
    case 'unconfirmed':
      return {
        tone: 'caution',
        title: 'Silence created, but AVA could not confirm it was saved.',
        detail: [
          result.note ??
            'The server did not report where the silence was stored, so it may not survive a restart.',
          SILENCE_SCOPE_CAVEAT,
        ].join(' '),
      };
    case 'not-found':
    case 'failed':
      return { tone: 'error', title: 'Could not create the silence — nothing was stored.', detail: result.message };
  }
}

function noticeForSilenceExpire(result: AlertWriteResult<Silence>): ActionNotice {
  switch (result.kind) {
    case 'persisted':
      return {
        tone: 'success',
        title: 'Silence ended, and saved durably.',
        detail:
          result.note ??
          'The record is kept with its end time set to now, so it stays visible under expired silences.',
      };
    case 'unpersisted':
      return {
        tone: 'caution',
        title: notSavedTitle(result.source, 'The change'),
        detail:
          result.note ??
          'The expiry was applied in memory only, so the silence returns on restart if its stored row is still in force.',
      };
    case 'unconfirmed':
      return {
        tone: 'caution',
        title: 'Silence ended, but AVA could not confirm the change was saved.',
        detail:
          result.note ??
          'The server did not report where the change was stored, so the silence may return on restart.',
      };
    case 'not-found':
      // Distinct from ending an already-ended silence, which succeeds and returns the row.
      return { tone: 'info', title: 'That silence is no longer stored.', detail: result.message };
    case 'failed':
      return { tone: 'error', title: 'Could not end the silence — nothing changed.', detail: result.message };
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AlertCenter() {
  const [activeTab, setActiveTab] = useState<Tab>('active');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [showCreateSilence, setShowCreateSilence] = useState(false);
  const [selectedRule, setSelectedRule] = useState<AlertRule | null>(null);

  // ─── Live Data Hooks ───────────────────────────────────────────────────────────

  const {
    alerts: liveAlerts,
    loading: alertsLoading,
    error: alertsError,
    live: alertsLive,
    source: alertsSource,
    refresh: refreshAlerts,
  } = useActiveAlerts(30_000); // Poll every 30 seconds

  const {
    rules: liveRules,
    loading: rulesLoading,
    error: rulesError,
    live: rulesLive,
    source: rulesSource,
    refresh: refreshRules,
  } = useAlertRules();

  // Silences come from the operations DynamoDB table. Expired ones are included so the
  // "Recently Expired" panel has something real to show.
  const {
    silences,
    activeCount: liveActiveSilenceCount,
    live: silencesLive,
    source: silencesSource,
    note: silencesNote,
    error: silencesError,
    refresh: refreshSilences,
  } = useSilences(true);

  const { acknowledgeAlert, createSilence, expireSilence, mutating } = useAlertMutations();

  // Acknowledgements and silences are attributed to the signed-in user. With no known
  // identity we withhold the controls rather than attributing a paging-suppression action
  // to a placeholder actor.
  //
  // `actor` is used ONLY to decide whether the controls are offered and to show whose name
  // will be on the record - it is never sent. The backend attributes every write from the
  // `x-user-email` header that the API client already attaches. "unknown" is what
  // /users/me returns when it could not establish an identity at all (it used to return a
  // plausible-looking address instead), and it is treated here as no actor, which is what
  // the withholding copy below already promises.
  const { user } = useUser();
  const actor = user?.email && user.email !== 'unknown' ? user.email : null;

  // Live alerts render as-is. There is deliberately no optimistic overlay: a write is
  // reflected only by refetching, so what is on screen is what the backend reports.
  const alerts = liveAlerts;

  // Use live rules
  const rules = liveRules;

  // Combined loading state
  const loading = alertsLoading || rulesLoading;

  // ─── Computed Stats ────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const activeAlerts = alerts.filter(a => a.status === 'firing' || a.status === 'acknowledged');
    const bySeverity = {
      critical: activeAlerts.filter(a => a.severity === 'critical').length,
      high: activeAlerts.filter(a => a.severity === 'high').length,
      warning: activeAlerts.filter(a => a.severity === 'warning').length,
      info: activeAlerts.filter(a => a.severity === 'info').length,
    };
    const firingRules = new Set(alerts.filter(a => a.status === 'firing').map(a => a.ruleId)).size;
    const enabledRules = rules.filter(r => r.status === 'enabled').length;

    // MTTR: mean time to resolve. The active alert feed has no acknowledged/
    // resolved timestamps, so we derive from the (demo) resolved history using
    // its fire->resolve duration. Silenced entries are excluded since silencing
    // is not a resolution. Labeled MTTR (not MTTA) to reflect what we measure.
    const resolvedHistory = MOCK_ALERT_HISTORY.filter(h => h.resolution === 'auto_resolved' || h.resolution === 'manual');
    const mttrMinutes = resolvedHistory.length > 0
      ? Math.round(resolvedHistory.reduce((sum, h) => sum + h.durationMinutes, 0) / resolvedHistory.length)
      : 0;

    return {
      total: activeAlerts.length,
      bySeverity,
      firingRules,
      totalRules: rules.length,
      enabledRules,
      mttr: mttrMinutes,
      channels: MOCK_CHANNELS.length,
      // The backend reports active_count over the whole store, which is authoritative even
      // when the list is filtered; fall back to counting the demo rows when not live.
      activeSilences: silencesLive
        ? liveActiveSilenceCount
        : silences.filter(s => s.status === 'active').length,
    };
  }, [alerts, rules, silences, silencesLive, liveActiveSilenceCount]);

  // ─── Filtered Alerts ───────────────────────────────────────────────────────────

  const filteredAlerts = useMemo(() => {
    let filtered = alerts;
    if (severityFilter !== 'all') {
      filtered = filtered.filter(a => a.severity === severityFilter);
    }
    // Sort by severity: critical > high > warning > info
    const severityOrder: Record<AlertSeverity, number> = { critical: 0, high: 1, warning: 2, info: 3 };
    return [...filtered].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }, [alerts, severityFilter]);

  // ─── Noisy Rules Detection ─────────────────────────────────────────────────────

  const noisyRules = useMemo(() => {
    return rules
      .filter(r => r.fireCount > 10)
      .sort((a, b) => b.fireCount - a.fireCount)
      .slice(0, 5);
  }, [rules]);

  // ─── Handlers ──────────────────────────────────────────────────────────────────

  // ─── Action feedback ───────────────────────────────────────────────────────────
  //
  // Every write reports what actually happened, keyed so the notice renders next to the
  // control that caused it. Nothing here fabricates success: the notice is derived from the
  // AlertWriteResult, and the affected list is refetched rather than patched locally.
  const [notices, setNotices] = useState<Record<string, ActionNotice>>({});

  const putNotice = useCallback((key: string, notice: ActionNotice | null) => {
    setNotices(prev => {
      const next = { ...prev };
      if (notice) next[key] = notice;
      else delete next[key];
      return next;
    });
  }, []);

  const handleAcknowledge = useCallback(
    async (alert: ActiveAlert) => {
      const key = `alert:${alert.id}`;
      putNotice(key, null);
      // alert.id is the alarm NAME — the endpoint keys on the name, not an ARN.
      const result = await acknowledgeAlert(alert.id);
      putNotice(key, noticeForAck(result));
      // Refetch either way: on success to pick up the stored acknowledgement, on 404
      // because the alarm's state has moved on and the list is stale.
      if (result.kind !== 'failed') refreshAlerts();
    },
    [acknowledgeAlert, putNotice, refreshAlerts]
  );

  // Silencing needs a reason and a duration, both audit-relevant, so the alert-row action
  // opens the silence form pre-filled with the alarm name instead of inventing them.
  const [silencePrefill, setSilencePrefill] = useState('');

  const handleSilenceFromAlert = useCallback((alert: ActiveAlert) => {
    setSilencePrefill(alert.ruleName);
    setShowCreateSilence(true);
    setActiveTab('silences');
  }, []);

  const handleCreateSilence = useCallback(
    async (input: { alarmNamePattern: string; reason: string; durationMinutes: number }) => {
      // Withhold rather than create an unattributable silence. The actor itself is not
      // sent - the backend reads it from the x-user-email header on this same request.
      if (!actor) return;
      putNotice('silence:new', null);
      const result = await createSilence(input);
      putNotice('silence:new', noticeForSilenceCreate(result, input.durationMinutes));
      if (result.kind !== 'failed') {
        setShowCreateSilence(false);
        setSilencePrefill('');
        refreshSilences();
        // A new silence suppresses matching alarms in the alert list, so that list changes.
        refreshAlerts();
      }
    },
    [actor, createSilence, putNotice, refreshSilences, refreshAlerts]
  );

  const handleExpireSilence = useCallback(
    async (silenceId: string) => {
      const key = `silence:${silenceId}`;
      putNotice(key, null);
      const result = await expireSilence(silenceId);
      putNotice(key, noticeForSilenceExpire(result));
      if (result.kind !== 'failed') {
        refreshSilences();
        refreshAlerts();
      }
    },
    [expireSilence, putNotice, refreshSilences, refreshAlerts]
  );

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Data Source Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${alertsLive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-xs text-slate-500">
              Alerts: {alertsSource}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${rulesLive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-xs text-slate-500">
              Rules: {rulesSource}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(alertsError || rulesError) && (
            <span className="text-xs text-rose-600">
              {alertsError || rulesError}
            </span>
          )}
          <button
            onClick={() => { refreshAlerts(); refreshRules(); }}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
          >
            <Icon name="arrow-path" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Icon name="arrow-path" className="w-6 h-6 text-indigo-500 animate-spin" />
          <span className="ml-2 text-sm text-slate-600">Loading alert data...</span>
        </div>
      )}

      {/* KPI Row */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            label="Active Alerts"
            value={stats.total.toString()}
            sub={`${stats.bySeverity.critical} critical, ${stats.bySeverity.high} high`}
            variant={stats.bySeverity.critical > 0 ? 'danger' : stats.bySeverity.high > 0 ? 'warning' : 'success'}
          />
          <StatCard
            label="Firing Rules"
            value={stats.firingRules.toString()}
            sub={`of ${stats.enabledRules} enabled`}
            variant={stats.firingRules > 3 ? 'warning' : 'info'}
          />
          <StatCard
            label="Alert Rules"
            value={stats.totalRules.toString()}
            sub={`${stats.enabledRules} enabled`}
            variant="info"
          />
          <StatCard
            label="MTTR"
            value={`${stats.mttr}m`}
            sub="mean time to resolve"
            variant={stats.mttr > 30 ? 'warning' : 'success'}
            icon={<MockDataBadge integration="Resolved alert history (DescribeAlarmHistory / PagerDuty)" />}
          />
          <StatCard
            label="Channels"
            value={stats.channels.toString()}
            sub={`${stats.activeSilences} silences active`}
            variant="info"
            icon={<MockDataBadge integration="Notification channels & silence store" />}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {([
          { id: 'active', label: 'Active Alerts', icon: 'bell-alert' },
          { id: 'rules', label: 'Alert Rules', icon: 'cog' },
          { id: 'routing', label: 'Routing', icon: 'arrows-right-left' },
          { id: 'history', label: 'History', icon: 'clock' },
          { id: 'silences', label: 'Silences', icon: 'pause-circle' },
        ] as { id: Tab; label: string; icon: IconName }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
            {tab.id === 'active' && stats.total > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                stats.bySeverity.critical > 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {stats.total}
              </span>
            )}
            {tab.id === 'silences' && stats.activeSilences > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                {stats.activeSilences}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {!loading && activeTab === 'active' && (
        <ActiveAlertsTab
          alerts={filteredAlerts}
          severityFilter={severityFilter}
          onSeverityFilterChange={setSeverityFilter}
          loading={alertsLoading}
          live={alertsLive}
          notices={notices}
          onDismissNotice={key => putNotice(key, null)}
          onAcknowledge={handleAcknowledge}
          onSilence={handleSilenceFromAlert}
          mutating={mutating}
          actor={actor}
        />
      )}

      {!loading && activeTab === 'rules' && (
        <AlertRulesTab
          rules={rules}
          showCreate={showCreateRule}
          onShowCreate={setShowCreateRule}
          selectedRule={selectedRule}
          onSelectRule={setSelectedRule}
          loading={rulesLoading}
          live={rulesLive}
        />
      )}

      {!loading && activeTab === 'routing' && (
        <RoutingTab
          channels={MOCK_CHANNELS}
          routingRules={MOCK_ROUTING_RULES}
        />
      )}

      {!loading && activeTab === 'history' && (
        <HistoryTab
          history={MOCK_ALERT_HISTORY}
          noisyRules={noisyRules}
        />
      )}

      {!loading && activeTab === 'silences' && (
        <SilencesTab
          silences={silences}
          showCreate={showCreateSilence}
          onShowCreate={setShowCreateSilence}
          onExpire={handleExpireSilence}
          onCreate={handleCreateSilence}
          prefillPattern={silencePrefill}
          notices={notices}
          onDismissNotice={key => putNotice(key, null)}
          mutating={mutating}
          actor={actor}
          live={silencesLive}
          source={silencesSource}
          note={silencesNote}
          error={silencesError}
        />
      )}
    </div>
  );
}

// ─── Active Alerts Tab ─────────────────────────────────────────────────────────

interface ActiveAlertsTabProps {
  alerts: ActiveAlert[];
  severityFilter: AlertSeverity | 'all';
  onSeverityFilterChange: (filter: AlertSeverity | 'all') => void;
  loading?: boolean;
  live?: boolean;
  notices: Record<string, ActionNotice>;
  onDismissNotice: (key: string) => void;
  onAcknowledge: (alert: ActiveAlert) => void;
  onSilence: (alert: ActiveAlert) => void;
  mutating: boolean;
  /** Signed-in user, or null when unknown. Actions are withheld while null. */
  actor: string | null;
}

function ActiveAlertsTab({
  alerts,
  severityFilter,
  onSeverityFilterChange,
  live,
  notices,
  onDismissNotice,
  onAcknowledge,
  onSilence,
  mutating,
  actor,
}: ActiveAlertsTabProps) {
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Severity:</span>
          <div className="flex gap-1">
            {(['all', 'critical', 'high', 'warning', 'info'] as const).map(sev => (
              <button
                key={sev}
                onClick={() => onSeverityFilterChange(sev)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors capitalize ${
                  severityFilter === sev
                    ? sev === 'all' ? 'bg-slate-900 text-white' : `${SEVERITY_CONFIG[sev as AlertSeverity].bg} ${SEVERITY_CONFIG[sev as AlertSeverity].color}`
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
        <span className="text-xs text-slate-500">{alerts.length} alerts</span>
      </div>

      {/* What acknowledging and silencing actually change. Both are AVA-side records: the
          backend does not call SetAlarmState (which would falsify alarm history) or
          DisableAlarmActions (untimed, and it silently disarms paging). */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
        <Icon name="information-circle" className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500">
          Acknowledge and Silence are recorded in AVA; each action reports whether it was saved
          durably or only held in memory. Neither changes the CloudWatch alarm: it keeps evaluating
          and its notification actions stay armed, so anything wired to SNS or a pager still fires.
          An acknowledgement applies to the alarm&apos;s current firing and clears if the alarm
          changes state again.
        </p>
      </div>

      {!actor && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
          <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800">
            Acknowledge and Silence are unavailable because AVA cannot identify you. Both are
            attributed to a named user in the audit record, so they are withheld rather than
            recorded against a placeholder.
          </p>
        </div>
      )}

      {/* Alert List */}
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="text-center py-12 bg-white/80 rounded-xl border border-slate-200/60">
            <Icon name="check-circle" className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
            <div className="text-sm font-medium text-slate-600">No active alerts</div>
            <div className="text-xs text-slate-400 mt-1">All systems operating normally</div>
          </div>
        ) : (
          alerts.map(alert => {
            const sevConfig = SEVERITY_CONFIG[alert.severity];
            const statusConfig = STATUS_CONFIG[alert.status];
            const isExpanded = expandedAlert === alert.id;

            return (
              <div
                key={alert.id}
                className={`bg-white/80 backdrop-blur-sm rounded-xl border ${sevConfig.border} shadow-sm overflow-hidden`}
              >
                <div
                  className={`p-4 cursor-pointer hover:bg-slate-50/50 transition-colors ${sevConfig.bg}`}
                  onClick={() => setExpandedAlert(isExpanded ? null : alert.id)}
                >
                  <div className="flex items-start gap-4">
                    {/* Severity Icon */}
                    <div className={`p-2 rounded-lg bg-white/60 ${sevConfig.color}`}>
                      <Icon name={sevConfig.icon} className="w-5 h-5" />
                    </div>

                    {/* Alert Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-900">{alert.agentName}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase ${sevConfig.bg} ${sevConfig.color}`}>
                          {alert.severity}
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusConfig.bg} ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700">{alert.message}</p>
                      <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
                        <span>Rule: {alert.ruleName}</span>
                        <span>Fired: {timeSince(alert.firedAt)}</span>
                        {alert.acknowledgedBy && (
                          <span>Ack by: {alert.acknowledgedBy.split('@')[0]}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions. Both write to the operations table; neither touches AWS. */}
                    <div className="flex items-center gap-2">
                      {alert.status === 'firing' && (
                        <>
                          <button
                            type="button"
                            disabled={mutating || !actor}
                            title={
                              !actor
                                ? 'Unavailable: AVA cannot identify you, and an acknowledgement is attributed to a named user'
                                : 'Record an acknowledgement in AVA. The CloudWatch alarm is not changed.'
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              onAcknowledge(alert);
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Acknowledge
                          </button>
                          <button
                            type="button"
                            disabled={mutating || !actor}
                            title={
                              !actor
                                ? 'Unavailable: AVA cannot identify you, and a silence is attributed to a named user'
                                : 'Open the silence form pre-filled with this alarm name'
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              onSilence(alert);
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Silence
                          </button>
                        </>
                      )}
                      <Icon
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        className="w-4 h-4 text-slate-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Outcome of the last write against this alert. Derived from the
                    response, never assumed from the click. */}
                {notices[`alert:${alert.id}`] && (
                  <div className="px-4 pb-3">
                    <ActionNoticeStrip
                      notice={notices[`alert:${alert.id}`]}
                      onDismiss={() => onDismissNotice(`alert:${alert.id}`)}
                    />
                  </div>
                )}

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 py-3 border-t border-slate-200/60 bg-white">
                    <div className="grid grid-cols-4 gap-4 text-xs">
                      <div>
                        <div className="text-slate-400 mb-1">Metric</div>
                        <div className="font-medium text-slate-700">{METRIC_LABELS[alert.metric]}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 mb-1">Current Value</div>
                        <div className="font-medium text-slate-700">{alert.value ?? '-'}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 mb-1">Threshold</div>
                        <div className="font-medium text-slate-700">{alert.threshold ?? '-'}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 mb-1">Duration</div>
                        <div className="font-medium text-slate-700">{timeSince(alert.firedAt)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                      <button
                        disabled
                        title="Demo — not wired"
                        className="text-xs text-slate-400 font-medium cursor-not-allowed"
                      >
                        View Rule
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        disabled
                        title="Demo — not wired"
                        className="text-xs text-slate-400 font-medium cursor-not-allowed"
                      >
                        Create Incident
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        disabled
                        title="Demo — not wired"
                        className="text-xs text-slate-400 font-medium cursor-not-allowed"
                      >
                        View Agent Metrics
                      </button>
                      {/* Scoped to the three cross-links above, which have no destination
                          yet. The alarm data itself is badged separately. */}
                      <MockDataBadge integration="Alert cross-links (rule, incident, agent metrics)" />
                      <LiveDataBadge live={live} source="CloudWatch Alarms" detail="Alarm name, state and reason from cloudwatch:DescribeAlarms" />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Alert Rules Tab ───────────────────────────────────────────────────────────

interface AlertRulesTabProps {
  rules: AlertRule[];
  showCreate: boolean;
  onShowCreate: (show: boolean) => void;
  selectedRule: AlertRule | null;
  onSelectRule: (rule: AlertRule | null) => void;
  loading?: boolean;
  live?: boolean;
}

function AlertRulesTab({ rules, showCreate, onShowCreate, selectedRule, onSelectRule }: AlertRulesTabProps) {
  const [statusFilter, setStatusFilter] = useState<RuleStatus | 'all'>('all');

  const filteredRules = useMemo(() => {
    if (statusFilter === 'all') return rules;
    return rules.filter(r => r.status === statusFilter);
  }, [rules, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Status:</span>
          <div className="flex gap-1">
            {(['all', 'enabled', 'disabled'] as const).map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors capitalize ${
                  statusFilter === status
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => onShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Icon name="plus" className="w-3.5 h-3.5" />
          Create Rule
        </button>
      </div>

      {/* Create Rule Wizard */}
      {showCreate && (
        <CreateRuleWizard
          onClose={() => onShowCreate(false)}
        />
      )}

      {/* Rule Templates */}
      {!showCreate && !selectedRule && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-sm font-semibold text-slate-900">Quick Templates</div>
            <MockDataBadge />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {RULE_TEMPLATES.map(template => (
              <button
                key={template.name}
                disabled
                title="Demo — template quick-fill not wired"
                className="p-3 rounded-lg border border-slate-200 text-left opacity-60 cursor-not-allowed"
              >
                <div className="text-xs font-medium text-slate-700">{template.name}</div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {template.metric} {template.operator} {template.threshold}
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded mt-1 inline-block ${SEVERITY_CONFIG[template.severity].bg} ${SEVERITY_CONFIG[template.severity].color}`}>
                  {template.severity}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rules Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th className="text-left py-2.5 px-4 font-medium">Rule Name</th>
              <th className="text-left py-2.5 px-4 font-medium">Condition</th>
              <th className="text-center py-2.5 px-4 font-medium">Severity</th>
              <th className="text-center py-2.5 px-4 font-medium">Status</th>
              <th className="text-center py-2.5 px-4 font-medium">Last Fired</th>
              <th className="text-center py-2.5 px-4 font-medium">Fire Count</th>
              <th className="text-right py-2.5 px-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.map(rule => {
              const sevConfig = SEVERITY_CONFIG[rule.severity];
              return (
                <tr
                  key={rule.id}
                  className="border-t border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                  onClick={() => onSelectRule(rule)}
                >
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-900">{rule.name}</div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{rule.description}</div>
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">
                    <code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                      {rule.metric} {rule.operator} {rule.threshold}
                    </code>
                    {rule.durationMinutes > 0 && (
                      <span className="text-[10px] text-slate-400 ml-2">for {rule.durationMinutes}m</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded uppercase ${sevConfig.bg} ${sevConfig.color}`}>
                      {rule.severity}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                      rule.status === 'enabled' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {rule.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-center text-slate-500 text-xs">
                    {rule.lastFired ? timeSince(rule.lastFired) : '-'}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`font-medium ${rule.fireCount > 10 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {rule.fireCount}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      disabled
                      title="Demo — not wired"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-slate-400 font-medium mr-2 cursor-not-allowed"
                    >
                      Edit
                    </button>
                    <button
                      disabled
                      title="Demo — not wired"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-slate-400 font-medium cursor-not-allowed"
                    >
                      {rule.status === 'enabled' ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Rule Detail Panel */}
      {selectedRule && (
        <RuleDetailPanel rule={selectedRule} onClose={() => onSelectRule(null)} />
      )}
    </div>
  );
}

// ─── Create Rule Wizard ────────────────────────────────────────────────────────

interface CreateRuleWizardProps {
  onClose: () => void;
}

// Read-only preview: the final "Create Rule" action is disabled because alert-rule
// creation is not wired to AWS in this build (the client createAlertRule payload
// does not match the backend AlertRuleCreate contract, so no CloudWatch alarm is
// created). The form is kept visible so the intended workflow is still legible.
function CreateRuleWizard({ onClose }: CreateRuleWizardProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    metric: 'latency' as MetricType,
    operator: '>' as Operator,
    threshold: 2000,
    durationMinutes: 5,
    severity: 'warning' as AlertSeverity,
    channels: [] as string[],
    runbookUrl: '',
  });

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-indigo-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Create Alert Rule</h3>
          <p className="text-xs text-slate-500 mt-0.5">Step {step} of 3</p>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
          <Icon name="x-mark" className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map(s => (
          <div key={s} className={`flex-1 h-1 rounded-full ${s <= step ? 'bg-indigo-500' : 'bg-slate-200'}`} />
        ))}
      </div>

      {/* Step 1: Condition */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Rule Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., High Latency Alert"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Metric</label>
              <select
                value={formData.metric}
                onChange={(e) => setFormData({ ...formData, metric: e.target.value as MetricType })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Object.entries(METRIC_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Operator</label>
              <select
                value={formData.operator}
                onChange={(e) => setFormData({ ...formData, operator: e.target.value as Operator })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value=">">Greater than</option>
                <option value=">=">Greater or equal</option>
                <option value="<">Less than</option>
                <option value="<=">Less or equal</option>
                <option value="==">Equal to</option>
                <option value="!=">Not equal to</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Threshold</label>
              <input
                type="number"
                value={formData.threshold}
                onChange={(e) => setFormData({ ...formData, threshold: parseInt(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Duration (minutes)</label>
            <input
              type="number"
              value={formData.durationMinutes}
              onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) })}
              className="w-48 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="0 = instant"
            />
            <p className="text-[10px] text-slate-400 mt-1">Condition must be true for this duration before firing</p>
          </div>
        </div>
      )}

      {/* Step 2: Severity & Channels */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Severity</label>
            <div className="flex gap-2">
              {(['critical', 'high', 'warning', 'info'] as AlertSeverity[]).map(sev => {
                const config = SEVERITY_CONFIG[sev];
                return (
                  <button
                    key={sev}
                    onClick={() => setFormData({ ...formData, severity: sev })}
                    className={`px-4 py-2 text-xs font-medium rounded-lg border-2 transition-colors capitalize ${
                      formData.severity === sev
                        ? `${config.bg} ${config.color} ${config.border}`
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {sev}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Notification Channels</label>
            <div className="space-y-2">
              {MOCK_CHANNELS.map(channel => (
                <label key={channel.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.channels.includes(channel.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, channels: [...formData.channels, channel.id] });
                      } else {
                        setFormData({ ...formData, channels: formData.channels.filter(c => c !== channel.id) });
                      }
                    }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <Icon name={CHANNEL_ICONS[channel.type]} className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700">{channel.name}</span>
                  {channel.businessHoursOnly && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Business hours only</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="text-xs font-medium text-slate-700 mb-2">Review Configuration</div>
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Rule Name</span>
              <span className="font-medium text-slate-900">{formData.name || 'Untitled'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Condition</span>
              <code className="text-xs bg-white px-2 py-1 rounded border border-slate-200">
                {formData.metric} {formData.operator} {formData.threshold}
              </code>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Duration</span>
              <span className="font-medium text-slate-900">{formData.durationMinutes > 0 ? `${formData.durationMinutes} minutes` : 'Instant'}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-slate-500">Severity</span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded uppercase ${SEVERITY_CONFIG[formData.severity].bg} ${SEVERITY_CONFIG[formData.severity].color}`}>
                {formData.severity}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Channels</span>
              <span className="font-medium text-slate-900">{formData.channels.length} selected</span>
            </div>
          </div>
        </div>
      )}

      {/* Honest disclosure on the final step */}
      {step === 3 && (
        <div className="mt-6 flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <Icon name="information-circle" className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-500">
            Demo — alert-rule creation is not wired to AWS in this build. Submitting is disabled;
            no CloudWatch alarm is created.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
        <button
          onClick={() => step === 1 ? onClose() : setStep(step - 1)}
          className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        {step === 3 ? (
          <button
            type="button"
            disabled
            title="Demo — alert-rule creation is not wired to AWS in this build"
            className="px-4 py-2 text-xs font-medium bg-slate-100 text-slate-400 rounded-lg cursor-not-allowed"
          >
            Create Rule
          </button>
        ) : (
          <button
            onClick={() => setStep(step + 1)}
            className="px-4 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Rule Detail Panel ─────────────────────────────────────────────────────────

function RuleDetailPanel({ rule, onClose }: { rule: AlertRule; onClose: () => void }) {
  const sevConfig = SEVERITY_CONFIG[rule.severity];

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{rule.name}</h3>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded uppercase ${sevConfig.bg} ${sevConfig.color}`}>
              {rule.severity}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
              rule.status === 'enabled' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {rule.status}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{rule.description}</p>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
          <Icon name="x-mark" className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-[10px] text-slate-400 uppercase mb-1">Condition</div>
          <code className="text-sm bg-slate-100 px-2 py-1 rounded">
            {rule.metric} {rule.operator} {rule.threshold}
          </code>
          {rule.durationMinutes > 0 && (
            <span className="text-xs text-slate-500 ml-2">for {rule.durationMinutes}m</span>
          )}
        </div>
        <div>
          <div className="text-[10px] text-slate-400 uppercase mb-1">Statistics</div>
          <div className="text-sm text-slate-700">
            Fired <span className="font-medium">{rule.fireCount}</span> times
            {rule.lastFired && <span className="text-slate-400"> (last: {timeSince(rule.lastFired)})</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-[10px] text-slate-400 uppercase mb-1">Channels</div>
          <div className="flex flex-wrap gap-1">
            {rule.channels.map(channelId => {
              const channel = MOCK_CHANNELS.find(c => c.id === channelId);
              return channel ? (
                <span key={channelId} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 flex items-center gap-1">
                  <Icon name={CHANNEL_ICONS[channel.type]} className="w-3 h-3" />
                  {channel.name.split(' - ')[1] || channel.name}
                </span>
              ) : null;
            })}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 uppercase mb-1">Created</div>
          <div className="text-xs text-slate-700">
            {new Date(rule.createdAt).toLocaleDateString()} by {rule.createdBy.split('@')[0]}
          </div>
        </div>
      </div>

      {rule.runbookUrl && (
        <div className="mb-4">
          <div className="text-[10px] text-slate-400 uppercase mb-1">Runbook</div>
          <a href={rule.runbookUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800">
            {rule.runbookUrl}
          </a>
        </div>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-slate-200">
        <button
          disabled
          title="Demo — not wired"
          className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-400 rounded-lg cursor-not-allowed"
        >
          Edit Rule
        </button>
        <button
          disabled
          title="Demo — not wired"
          className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-400 rounded-lg cursor-not-allowed"
        >
          {rule.status === 'enabled' ? 'Disable' : 'Enable'}
        </button>
        <button
          disabled
          title="Demo — not wired"
          className="px-3 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed"
        >
          Delete
        </button>
        <MockDataBadge />
      </div>
    </div>
  );
}

// ─── Routing Tab ───────────────────────────────────────────────────────────────

interface RoutingTabProps {
  channels: NotificationChannel[];
  routingRules: RoutingRule[];
}

function RoutingTab({ channels, routingRules }: RoutingTabProps) {
  return (
    <div className="space-y-6">
      {/* Routing Diagram */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
        <div className="text-sm font-semibold text-slate-900 mb-4">Alert Routing Flow</div>
        <div className="flex items-start gap-8">
          {/* Source: Alerts */}
          <div className="flex-shrink-0">
            <div className="text-[10px] text-slate-400 uppercase mb-2">Alerts</div>
            <div className="space-y-2">
              {(['critical', 'high', 'warning', 'info'] as AlertSeverity[]).map(sev => {
                const config = SEVERITY_CONFIG[sev];
                return (
                  <div key={sev} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${config.bg} ${config.border} border`}>
                    <Icon name={config.icon} className={`w-4 h-4 ${config.color}`} />
                    <span className={`text-xs font-medium capitalize ${config.color}`}>{sev}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Arrows */}
          <div className="flex-shrink-0 pt-16">
            <Icon name="arrow-right" className="w-8 h-8 text-slate-300" />
          </div>

          {/* Routing Rules */}
          <div className="flex-1">
            <div className="text-[10px] text-slate-400 uppercase mb-2">Routing Rules</div>
            <div className="space-y-2">
              {routingRules.map(rule => (
                <div key={rule.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-xs font-medium text-slate-700 mb-1">{rule.name}</div>
                  <div className="text-[10px] text-slate-500">
                    {rule.conditions.severity && `Severity: ${rule.conditions.severity.join(', ')}`}
                    {rule.conditions.rules && `Rules: ${rule.conditions.rules.length} specific`}
                    {rule.conditions.agents && `Agents: ${rule.conditions.agents.length} specific`}
                  </div>
                  {rule.businessHoursStart && (
                    <div className="text-[10px] text-amber-600 mt-1">
                      Business hours: {rule.businessHoursStart} - {rule.businessHoursEnd}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Arrows */}
          <div className="flex-shrink-0 pt-16">
            <Icon name="arrow-right" className="w-8 h-8 text-slate-300" />
          </div>

          {/* Channels */}
          <div className="flex-shrink-0">
            <div className="text-[10px] text-slate-400 uppercase mb-2">Channels</div>
            <div className="space-y-2">
              {channels.map(channel => (
                <div key={channel.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                  <Icon name={CHANNEL_ICONS[channel.type]} className="w-4 h-4 text-slate-500" />
                  <span className="text-xs text-slate-700">{channel.name.split(' - ')[1] || channel.name}</span>
                  {channel.businessHoursOnly && (
                    <Icon name="clock" className="w-3 h-3 text-amber-500" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Channels Configuration */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Notification Channels</h3>
            <MockDataBadge />
          </div>
          <button
            disabled
            title="Demo — not wired"
            className="text-xs font-medium text-slate-400 cursor-not-allowed"
          >
            + Add Channel
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th className="text-left py-2.5 px-4 font-medium">Channel</th>
              <th className="text-left py-2.5 px-4 font-medium">Type</th>
              <th className="text-left py-2.5 px-4 font-medium">Severities</th>
              <th className="text-center py-2.5 px-4 font-medium">Hours</th>
              <th className="text-right py-2.5 px-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {channels.map(channel => (
              <tr key={channel.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <Icon name={CHANNEL_ICONS[channel.type]} className="w-4 h-4 text-slate-400" />
                    <span className="font-medium text-slate-900">{channel.name}</span>
                  </div>
                </td>
                <td className="py-2.5 px-4 text-slate-600 capitalize">{channel.type}</td>
                <td className="py-2.5 px-4">
                  <div className="flex gap-1">
                    {channel.severities.map(sev => (
                      <span key={sev} className={`text-[9px] px-1.5 py-0.5 rounded uppercase ${SEVERITY_CONFIG[sev].bg} ${SEVERITY_CONFIG[sev].color}`}>
                        {sev}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-2.5 px-4 text-center">
                  {channel.businessHoursOnly ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700">Business</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">24/7</span>
                  )}
                </td>
                <td className="py-2.5 px-4 text-right">
                  <button disabled title="Demo — not wired" className="text-xs text-slate-400 font-medium mr-2 cursor-not-allowed">Edit</button>
                  <button disabled title="Demo — not wired" className="text-xs text-slate-400 font-medium cursor-not-allowed">Test</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── History Tab ───────────────────────────────────────────────────────────────

interface HistoryTabProps {
  history: AlertHistoryEntry[];
  noisyRules: AlertRule[];
}

function HistoryTab({ history, noisyRules }: HistoryTabProps) {
  // Period filter is display-only in demo mode (filtering not wired), so the
  // setter is intentionally omitted — the buttons are disabled below.
  const [dateFilter] = useState<'7d' | '30d' | '90d'>('7d');

  const resolutionColors = {
    auto_resolved: { bg: 'bg-emerald-100', color: 'text-emerald-700', label: 'Auto' },
    manual: { bg: 'bg-blue-100', color: 'text-blue-700', label: 'Manual' },
    silenced: { bg: 'bg-slate-100', color: 'text-slate-600', label: 'Silenced' },
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Period:</span>
          <div className="flex gap-1">
            {(['7d', '30d', '90d'] as const).map(period => (
              <button
                key={period}
                disabled
                title="Demo — period filtering not wired"
                className={`px-2.5 py-1 text-xs font-medium rounded-lg cursor-not-allowed ${
                  dateFilter === period
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {period}
              </button>
            ))}
          </div>
          <MockDataBadge />
        </div>
        <span className="text-xs text-slate-500">{history.length} alerts in period</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* History Table */}
        <div className="lg:col-span-2 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Alert History</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                <th className="text-left py-2.5 px-4 font-medium">Rule</th>
                <th className="text-left py-2.5 px-4 font-medium">Agent</th>
                <th className="text-center py-2.5 px-4 font-medium">Severity</th>
                <th className="text-center py-2.5 px-4 font-medium">Duration</th>
                <th className="text-center py-2.5 px-4 font-medium">Resolution</th>
                <th className="text-right py-2.5 px-4 font-medium">Fired</th>
              </tr>
            </thead>
            <tbody>
              {history.map(entry => {
                const sevConfig = SEVERITY_CONFIG[entry.severity];
                const resConfig = resolutionColors[entry.resolution];
                return (
                  <tr key={entry.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="py-2.5 px-4 font-medium text-slate-900">{entry.ruleName}</td>
                    <td className="py-2.5 px-4 text-slate-600">{entry.agentName}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded uppercase ${sevConfig.bg} ${sevConfig.color}`}>
                        {entry.severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center text-slate-600">{formatDuration(entry.durationMinutes)}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${resConfig.bg} ${resConfig.color}`}>
                        {resConfig.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-500 text-xs">{timeSince(entry.firedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Noisy Rules Analysis */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-900">Noisy Rules</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">Rules with high fire counts may need tuning</p>
          <div className="space-y-3">
            {noisyRules.map(rule => (
              <div key={rule.id} className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-700">{rule.name}</span>
                  <span className="text-xs font-bold text-amber-700">{rule.fireCount} fires</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  {rule.metric} {rule.operator} {rule.threshold}
                </div>
                <button
                  disabled
                  title="Demo — not wired"
                  className="text-[10px] text-slate-400 mt-2 cursor-not-allowed"
                >
                  Review and tune
                </button>
              </div>
            ))}
            {noisyRules.length === 0 && (
              <div className="text-center py-4 text-sm text-slate-400">
                No noisy rules detected
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Silences Tab ──────────────────────────────────────────────────────────────

interface SilencesTabProps {
  silences: Silence[];
  showCreate: boolean;
  onShowCreate: (show: boolean) => void;
  onExpire: (silenceId: string) => void;
  onCreate: (input: { alarmNamePattern: string; reason: string; durationMinutes: number }) => void;
  /** Alarm name carried over from the Silence action on an alert row. */
  prefillPattern: string;
  notices: Record<string, ActionNotice>;
  onDismissNotice: (key: string) => void;
  mutating: boolean;
  actor: string | null;
  live: boolean;
  source: string;
  note: string | null;
  error: string | null;
}

/** Duration choices, in minutes. Capped at the backend's own 7-day maximum. */
const SILENCE_DURATIONS: { minutes: number; label: string }[] = [
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
  { minutes: 480, label: '8 hours' },
  { minutes: 1440, label: '24 hours' },
  { minutes: 2880, label: '2 days' },
  { minutes: MAX_SILENCE_MINUTES, label: '7 days (maximum)' },
];

interface CreateSilenceFormProps {
  initialPattern: string;
  onCancel: () => void;
  onSubmit: (input: { alarmNamePattern: string; reason: string; durationMinutes: number }) => void;
  mutating: boolean;
  actor: string | null;
  notice?: ActionNotice;
  onDismissNotice: () => void;
}

function CreateSilenceForm({
  initialPattern,
  onCancel,
  onSubmit,
  mutating,
  actor,
  notice,
  onDismissNotice,
}: CreateSilenceFormProps) {
  const [pattern, setPattern] = useState(initialPattern);
  const [reason, setReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);

  const canSubmit = pattern.trim().length > 0 && reason.trim().length > 0 && !!actor && !mutating;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-indigo-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Create Silence</h3>
        <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded">
          <Icon name="x-mark" className="w-4 h-4 text-slate-400" />
        </button>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Alarm name pattern</label>
          <input
            type="text"
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            placeholder="e.g., ava-prod-* or a single alarm name"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            A glob matched against CloudWatch alarm names. <code>*</code> matches any run of
            characters, so <code>ava-prod-*</code> covers every alarm with that prefix.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Reason</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g., Scheduled maintenance window"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Duration</label>
            <select
              value={durationMinutes}
              onChange={e => setDurationMinutes(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SILENCE_DURATIONS.map(d => (
                <option key={d.minutes} value={d.minutes}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Created by</label>
            <div className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-600 truncate">
              {actor ?? 'Unknown — cannot create a silence'}
            </div>
          </div>
        </div>

        {/* The single most important thing to say about a silence. */}
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
          <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800">{SILENCE_SCOPE_CAVEAT}</p>
        </div>

        {notice && <ActionNoticeStrip notice={notice} onDismiss={onDismissNotice} />}

        <div className="flex items-center justify-end gap-2 pt-2">
          {!canSubmit && !mutating && (
            <span className="text-[10px] text-slate-400 mr-auto">
              {!actor
                ? 'AVA cannot identify you, so a silence cannot be attributed.'
                : 'An alarm name pattern and a reason are both required.'}
            </span>
          )}
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                alarmNamePattern: pattern.trim(),
                reason: reason.trim(),
                durationMinutes,
              })
            }
            className="px-4 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {mutating ? 'Creating…' : 'Create Silence'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SilencesTab({
  silences,
  showCreate,
  onShowCreate,
  onExpire,
  onCreate,
  prefillPattern,
  notices,
  onDismissNotice,
  mutating,
  actor,
  live,
  source,
  note,
  error,
}: SilencesTabProps) {
  const activeSilences = silences.filter(s => s.status === 'active');
  const expiredSilences = silences.filter(s => s.status === 'expired');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-sm text-slate-500">
            {activeSilences.length} active silence{activeSilences.length !== 1 ? 's' : ''}
          </div>
          {/* A live-but-empty store is a measured zero, so this stays Live at zero. */}
          <LiveDataBadge live={live} source={source} detail={`Silences read from ${source}`} />
        </div>
        <button
          onClick={() => onShowCreate(true)}
          disabled={!actor}
          title={actor ? undefined : 'Unavailable: a silence is attributed to a named user'}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
        >
          <Icon name="plus" className="w-3.5 h-3.5" />
          Create Silence
        </button>
      </div>

      {(note || error) && (
        <ActionNoticeStrip
          notice={{
            tone: error ? 'error' : 'caution',
            title: error ? 'Could not read the silence store.' : 'Silence list is degraded.',
            detail: error ?? note,
          }}
        />
      )}

      {!live && !error && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
          <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800">
            Showing demo silences: the operations table is unreachable or not configured, so the
            silences below are illustrative and are not what the backend is applying.
          </p>
        </div>
      )}

      {/* Create Silence Form. Keyed on the prefill so arriving from an alert row's Silence
          action re-seeds the alarm name rather than leaving a stale one. */}
      {showCreate && (
        <CreateSilenceForm
          key={prefillPattern}
          initialPattern={prefillPattern}
          onCancel={() => onShowCreate(false)}
          onSubmit={onCreate}
          mutating={mutating}
          actor={actor}
          notice={notices['silence:new']}
          onDismissNotice={() => onDismissNotice('silence:new')}
        />
      )}

      {/* Active Silences */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Active Silences</h3>
        </div>
        {activeSilences.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No active silences
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeSilences.map(silence => (
              <div key={silence.id} className="p-4 hover:bg-slate-50/50">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">{silence.reason}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Created by {silence.createdBy.split('@')[0]} - {timeSince(silence.createdAt)}
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      {/* The one thing a silence actually matches on. */}
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                        Alarms: {silence.alarmNamePattern}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-slate-500">Expires in</div>
                      <div className="text-sm font-medium text-slate-700">{timeUntil(silence.expiresAt)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onExpire(silence.id)}
                      disabled={mutating || !actor}
                      title={
                        !actor
                          ? 'Unavailable: AVA cannot identify you'
                          : 'End this silence now. The record is kept with its end time set to now.'
                      }
                      className="px-3 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-800 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      End Now
                    </button>
                  </div>
                </div>
                {notices[`silence:${silence.id}`] && (
                  <div className="mt-3">
                    <ActionNoticeStrip
                      notice={notices[`silence:${silence.id}`]}
                      onDismiss={() => onDismissNotice(`silence:${silence.id}`)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recently Expired */}
      {expiredSilences.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Recently Expired</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {expiredSilences.slice(0, 5).map(silence => (
              <div key={silence.id} className="p-4">
                <div className="flex items-center justify-between opacity-60">
                  <div>
                    <div className="text-sm text-slate-700">{silence.reason}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      Ended {timeSince(silence.expiresAt)} - alarms: {silence.alarmNamePattern}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">Ended</span>
                </div>
                {/* Ending a silence moves its row here, so the confirmation has to follow it. */}
                {notices[`silence:${silence.id}`] && (
                  <div className="mt-3">
                    <ActionNoticeStrip
                      notice={notices[`silence:${silence.id}`]}
                      onDismiss={() => onDismissNotice(`silence:${silence.id}`)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
