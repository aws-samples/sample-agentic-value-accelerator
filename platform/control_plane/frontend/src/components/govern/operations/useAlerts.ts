/**
 * useAlerts - Hooks for Alert Center live data from CloudWatch Alarms
 *
 * Provides three hooks:
 * - useActiveAlerts(): Fetches firing alerts from CloudWatch Alarms
 * - useAlertRules(): Fetches alert rule configurations
 * - useAlertMutations(): Provides acknowledge, silence, and createRule functions
 *
 * When AWS is connected, alerts map from CloudWatch Alarms:
 * - Alarm state (ALARM, OK, INSUFFICIENT_DATA) maps to alert status
 * - Alarm configuration determines severity
 * - Real metric values show what triggered the alarm
 *
 * Falls back to mock data when AWS is not connected or APIs unavailable.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAwsConnected } from '../useAwsConnected';
import {
  governOperationsApi,
  type Alert as OpsCloudWatchAlert,
  type AlertSilence as ApiAlertSilence,
  type AlertStoreSource,
} from '../../../api/client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'high' | 'warning' | 'info';
export type AlertStatus = 'firing' | 'acknowledged' | 'silenced' | 'resolved';
export type RuleStatus = 'enabled' | 'disabled';
export type MetricType = 'latency' | 'error_rate' | 'invocations' | 'cost' | 'token_usage' | 'queue_depth';
export type Operator = '>' | '>=' | '<' | '<=' | '==' | '!=';

export interface ActiveAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  agentId: string;
  agentName: string;
  severity: AlertSeverity;
  message: string;
  firedAt: string;
  status: AlertStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  // value/threshold are not exposed by the CloudWatch alarm summary, so they are
  // optional and rendered as "-" when a live alarm provides no numeric detail.
  value?: number;
  threshold?: number;
  metric: MetricType;
  // CloudWatch-specific fields when live
  alarmArn?: string;
  stateReason?: string;
  metricNamespace?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metric: MetricType;
  operator: Operator;
  threshold: number;
  durationMinutes: number;
  severity: AlertSeverity;
  status: RuleStatus;
  channels: string[];
  escalationPolicy?: string;
  runbookUrl?: string;
  lastFired?: string;
  fireCount: number;
  createdAt: string;
  createdBy: string;
  // CloudWatch-specific fields when live
  alarmArn?: string;
  metricNamespace?: string;
  statistic?: string;
}

/**
 * A stored alert silence.
 *
 * This used to carry a `matchers: { agent?, rule?, severity? }` object, which had no
 * counterpart on the backend - a silence is matched by ONE thing, a glob against the
 * CloudWatch alarm name. The matcher object could only ever have been decoration, so it is
 * replaced by the field the backend actually stores and applies.
 */
export interface Silence {
  id: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  /** Glob matched against alarm names, e.g. `ava-prod-*` or a single alarm name. */
  alarmNamePattern: string;
  status: 'active' | 'expired';
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_ALERT_RULES: AlertRule[] = [
  {
    id: 'rule-1',
    name: 'High Latency',
    description: 'Alert when p99 latency exceeds threshold for sustained period',
    metric: 'latency',
    operator: '>',
    threshold: 2000,
    durationMinutes: 5,
    severity: 'warning',
    status: 'enabled',
    channels: ['slack-ops', 'pagerduty'],
    escalationPolicy: 'standard',
    runbookUrl: 'https://runbooks.internal/high-latency',
    lastFired: '2026-08-11T10:15:00Z',
    fireCount: 12,
    createdAt: '2026-06-01T09:00:00Z',
    createdBy: 'sarah.chen@bank.com',
  },
  {
    id: 'rule-2',
    name: 'Critical Error Rate',
    description: 'Alert when error rate exceeds 5% for 3 minutes',
    metric: 'error_rate',
    operator: '>',
    threshold: 5,
    durationMinutes: 3,
    severity: 'critical',
    status: 'enabled',
    channels: ['slack-ops', 'pagerduty', 'email-oncall'],
    escalationPolicy: 'critical',
    runbookUrl: 'https://runbooks.internal/error-spike',
    lastFired: '2026-08-11T10:23:00Z',
    fireCount: 8,
    createdAt: '2026-05-15T14:00:00Z',
    createdBy: 'mike.torres@bank.com',
  },
  {
    id: 'rule-3',
    name: 'Invocation Drop',
    description: 'Alert when invocation rate drops more than 50% vs baseline',
    metric: 'invocations',
    operator: '<',
    threshold: 50,
    durationMinutes: 10,
    severity: 'high',
    status: 'enabled',
    channels: ['slack-ops'],
    lastFired: '2026-08-10T08:30:00Z',
    fireCount: 3,
    createdAt: '2026-06-20T11:00:00Z',
    createdBy: 'sarah.chen@bank.com',
  },
  {
    id: 'rule-4',
    name: 'Cost Overrun',
    description: 'Alert when hourly cost exceeds budget threshold',
    metric: 'cost',
    operator: '>',
    threshold: 500,
    durationMinutes: 15,
    severity: 'warning',
    status: 'enabled',
    channels: ['slack-finops', 'email-finance'],
    runbookUrl: 'https://runbooks.internal/cost-overrun',
    lastFired: '2026-08-09T16:00:00Z',
    fireCount: 5,
    createdAt: '2026-07-01T10:00:00Z',
    createdBy: 'finance.ops@bank.com',
  },
  {
    id: 'rule-5',
    name: 'Token Exhaustion',
    description: 'Alert when daily token usage exceeds 80% of allocation',
    metric: 'token_usage',
    operator: '>',
    threshold: 80,
    durationMinutes: 0,
    severity: 'warning',
    status: 'enabled',
    channels: ['slack-ops'],
    fireCount: 2,
    createdAt: '2026-07-10T09:00:00Z',
    createdBy: 'mike.torres@bank.com',
  },
  {
    id: 'rule-6',
    name: 'Queue Backup',
    description: 'Alert when task queue depth exceeds threshold',
    metric: 'queue_depth',
    operator: '>',
    threshold: 100,
    durationMinutes: 5,
    severity: 'high',
    status: 'enabled',
    channels: ['slack-ops', 'pagerduty'],
    lastFired: '2026-08-11T11:15:00Z',
    fireCount: 7,
    createdAt: '2026-06-15T13:00:00Z',
    createdBy: 'sarah.chen@bank.com',
  },
  {
    id: 'rule-7',
    name: 'Model Timeout',
    description: 'Alert when model inference timeout rate exceeds 1%',
    metric: 'error_rate',
    operator: '>',
    threshold: 1,
    durationMinutes: 5,
    severity: 'warning',
    status: 'enabled',
    channels: ['slack-ops'],
    fireCount: 4,
    createdAt: '2026-07-05T08:00:00Z',
    createdBy: 'ml.team@bank.com',
  },
  {
    id: 'rule-8',
    name: 'Guardrail Breach',
    description: 'Alert when guardrail intervention rate spikes',
    metric: 'error_rate',
    operator: '>',
    threshold: 10,
    durationMinutes: 2,
    severity: 'critical',
    status: 'enabled',
    channels: ['slack-security', 'pagerduty', 'email-oncall'],
    escalationPolicy: 'critical',
    lastFired: '2026-08-08T14:20:00Z',
    fireCount: 2,
    createdAt: '2026-05-20T10:00:00Z',
    createdBy: 'security.team@bank.com',
  },
  {
    id: 'rule-9',
    name: 'Memory Pressure',
    description: 'Alert when agent memory usage exceeds 85%',
    metric: 'token_usage',
    operator: '>',
    threshold: 85,
    durationMinutes: 10,
    severity: 'warning',
    status: 'enabled',
    channels: ['slack-ops'],
    fireCount: 6,
    createdAt: '2026-06-25T11:00:00Z',
    createdBy: 'platform.team@bank.com',
  },
  {
    id: 'rule-10',
    name: 'Cold Start Spike',
    description: 'Alert when cold start latency exceeds 5 seconds',
    metric: 'latency',
    operator: '>',
    threshold: 5000,
    durationMinutes: 3,
    severity: 'info',
    status: 'enabled',
    channels: ['slack-ops'],
    fireCount: 15,
    createdAt: '2026-07-15T09:00:00Z',
    createdBy: 'mike.torres@bank.com',
  },
  {
    id: 'rule-11',
    name: 'A2A Communication Failure',
    description: 'Alert when agent-to-agent communication fails repeatedly',
    metric: 'error_rate',
    operator: '>',
    threshold: 3,
    durationMinutes: 5,
    severity: 'high',
    status: 'enabled',
    channels: ['slack-ops', 'pagerduty'],
    fireCount: 1,
    createdAt: '2026-07-20T14:00:00Z',
    createdBy: 'sarah.chen@bank.com',
  },
  {
    id: 'rule-12',
    name: 'KYC Processing Delay',
    description: 'Alert when KYC agent processing time exceeds SLA',
    metric: 'latency',
    operator: '>',
    threshold: 30000,
    durationMinutes: 5,
    severity: 'high',
    status: 'enabled',
    channels: ['slack-compliance', 'email-compliance'],
    runbookUrl: 'https://runbooks.internal/kyc-delay',
    fireCount: 3,
    createdAt: '2026-06-10T10:00:00Z',
    createdBy: 'compliance.ops@bank.com',
  },
  {
    id: 'rule-13',
    name: 'Fraud Detection Slowdown',
    description: 'Alert when fraud detection latency impacts SLA',
    metric: 'latency',
    operator: '>',
    threshold: 500,
    durationMinutes: 2,
    severity: 'critical',
    status: 'enabled',
    channels: ['slack-security', 'pagerduty', 'email-oncall'],
    escalationPolicy: 'critical',
    fireCount: 4,
    createdAt: '2026-05-25T09:00:00Z',
    createdBy: 'fraud.team@bank.com',
  },
  {
    id: 'rule-14',
    name: 'Daily Cost Budget',
    description: 'Alert when daily spend exceeds budget allocation',
    metric: 'cost',
    operator: '>',
    threshold: 10000,
    durationMinutes: 0,
    severity: 'warning',
    status: 'disabled',
    channels: ['slack-finops'],
    fireCount: 0,
    createdAt: '2026-07-25T10:00:00Z',
    createdBy: 'finance.ops@bank.com',
  },
  {
    id: 'rule-15',
    name: 'Heartbeat Missing',
    description: 'Alert when agent heartbeat is not received',
    metric: 'invocations',
    operator: '<',
    threshold: 1,
    durationMinutes: 5,
    severity: 'critical',
    status: 'enabled',
    channels: ['slack-ops', 'pagerduty'],
    escalationPolicy: 'critical',
    lastFired: '2026-08-11T09:45:00Z',
    fireCount: 2,
    createdAt: '2026-05-10T08:00:00Z',
    createdBy: 'platform.team@bank.com',
  },
];

const MOCK_ACTIVE_ALERTS: ActiveAlert[] = [
  {
    id: 'alert-1',
    ruleId: 'rule-2',
    ruleName: 'Critical Error Rate',
    agentId: 'agent-trading',
    agentName: 'Trading Assistant',
    severity: 'critical',
    message: 'Error rate at 7.2% (threshold: 5%) for 8 minutes',
    firedAt: '2026-08-11T10:23:00Z',
    status: 'firing',
    value: 7.2,
    threshold: 5,
    metric: 'error_rate',
  },
  {
    id: 'alert-2',
    ruleId: 'rule-6',
    ruleName: 'Queue Backup',
    agentId: 'agent-doc',
    agentName: 'Document Processor',
    severity: 'high',
    message: 'Queue depth at 156 items (threshold: 100)',
    firedAt: '2026-08-11T11:15:00Z',
    status: 'firing',
    value: 156,
    threshold: 100,
    metric: 'queue_depth',
  },
  {
    id: 'alert-3',
    ruleId: 'rule-1',
    ruleName: 'High Latency',
    agentId: 'agent-kyc',
    agentName: 'KYC Verification',
    severity: 'warning',
    message: 'P99 latency at 2450ms (threshold: 2000ms)',
    firedAt: '2026-08-11T10:45:00Z',
    status: 'acknowledged',
    acknowledgedBy: 'mike.torres@bank.com',
    acknowledgedAt: '2026-08-11T10:52:00Z',
    value: 2450,
    threshold: 2000,
    metric: 'latency',
  },
  {
    id: 'alert-4',
    ruleId: 'rule-3',
    ruleName: 'Invocation Drop',
    agentId: 'agent-fraud',
    agentName: 'Fraud Detection',
    severity: 'high',
    message: 'Invocation rate dropped 62% below baseline',
    firedAt: '2026-08-11T11:02:00Z',
    status: 'firing',
    value: 38,
    threshold: 50,
    metric: 'invocations',
  },
  {
    id: 'alert-5',
    ruleId: 'rule-10',
    ruleName: 'Cold Start Spike',
    agentId: 'agent-support',
    agentName: 'Customer Support',
    severity: 'info',
    message: 'Cold start latency at 6.2s (threshold: 5s)',
    firedAt: '2026-08-11T11:20:00Z',
    status: 'silenced',
    value: 6200,
    threshold: 5000,
    metric: 'latency',
  },
  {
    id: 'alert-6',
    ruleId: 'rule-15',
    ruleName: 'Heartbeat Missing',
    agentId: 'agent-reporting',
    agentName: 'Reporting Agent',
    severity: 'critical',
    message: 'No heartbeat received for 7 minutes',
    firedAt: '2026-08-11T09:45:00Z',
    status: 'acknowledged',
    acknowledgedBy: 'sarah.chen@bank.com',
    acknowledgedAt: '2026-08-11T09:50:00Z',
    value: 0,
    threshold: 1,
    metric: 'invocations',
  },
];

/**
 * Demo silences, used only when the silence store is unreachable or unconfigured.
 *
 * These moved here from AlertCenter so the fallback sits next to the hook that serves it.
 * The alarm-name patterns are illustrative, not real alarm names.
 */
const MOCK_SILENCES: Silence[] = [
  {
    id: 'silence-1',
    reason: 'Scheduled maintenance window - Document Processor upgrade',
    createdBy: 'mike.torres@bank.com',
    createdAt: '2026-08-11T11:00:00Z',
    expiresAt: '2026-08-11T15:00:00Z',
    alarmNamePattern: 'agent-doc-*',
    status: 'active',
  },
  {
    id: 'silence-2',
    reason: 'Known cold start issue - investigating',
    createdBy: 'sarah.chen@bank.com',
    createdAt: '2026-08-11T10:30:00Z',
    expiresAt: '2026-08-11T14:30:00Z',
    alarmNamePattern: '*-cold-start-latency',
    status: 'active',
  },
];

// ─── Live mapping: CloudWatch alarm → ActiveAlert ──────────────────────────────

/**
 * Map a live CloudWatch alarm (backend `Alert`) to the AlertCenter `ActiveAlert`
 * shape. The alarm summary exposes real name/state/severity/reason but not the
 * numeric value/threshold or an agent id, so those are left undefined and shown
 * as "-" in the UI rather than fabricated.
 */
function mapCloudWatchAlert(a: OpsCloudWatchAlert): ActiveAlert {
  const severity: AlertSeverity =
    a.severity === 'critical' ? 'critical'
    : a.severity === 'high' ? 'high'
    : a.severity === 'info' ? 'info'
    : 'warning'; // medium/low collapse to warning
  const status: AlertStatus =
    a.silenced_until ? 'silenced'
    : a.acknowledged ? 'acknowledged'
    : a.state === 'ok' ? 'resolved'
    : 'firing';
  return {
    // The alarm name. `Alert.id` used to be the full alarm ARN, which leaked the account
    // id; it is now the name, and the name is also what the acknowledge endpoint expects.
    id: a.id,
    ruleId: a.alarm_name,
    ruleName: a.alarm_name,
    agentId: '',
    agentName: a.alarm_name,
    severity,
    message: a.state_reason || a.alarm_name,
    firedAt: a.state_updated ? asUtcIso(a.state_updated) : new Date().toISOString(),
    status,
    acknowledgedBy: a.acknowledged_by ?? undefined,
    acknowledgedAt: a.acknowledged_at ? asUtcIso(a.acknowledged_at) : undefined,
    metric: mapMetricType(a.metric_namespace, a.metric_name),
    alarmArn: a.alarm_arn ?? undefined,
    stateReason: a.state_reason,
    metricNamespace: a.metric_namespace,
  };
}

// ─── useActiveAlerts Hook ──────────────────────────────────────────────────────

export interface UseActiveAlertsResult {
  alerts: ActiveAlert[];
  loading: boolean;
  error: string | null;
  live: boolean;
  source: string;
  refresh: () => void;
}

/**
 * Hook to fetch active/firing alerts.
 * When AWS is connected, fetches from CloudWatch Alarms in ALARM state.
 * Falls back to mock data when disconnected.
 */
export function useActiveAlerts(pollIntervalMs = 30_000): UseActiveAlertsResult {
  const { awsConnected, loading: awsLoading } = useAwsConnected();
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (awsLoading) return;

    let cancelled = false;
    const fetchAlerts = async () => {
      if (refreshKey === 0) setLoading(true);

      try {
        // Fetch active CloudWatch alarms from the backend. The backend maps
        // cloudwatch.describe_alarms(StateValue='ALARM') to the Alert shape and
        // reports live:true when AWS is actually connected.
        const response = await governOperationsApi.activeAlerts();
        if (cancelled) return;

        if (response.live) {
          // Genuinely live: render mapped alarms (an empty-but-live set is honest).
          setAlerts(response.alerts.map(mapCloudWatchAlert));
          setLive(true);
          setError(null);
        } else {
          // Not live (AWS not connected / stub) → keep demo data, never badge Live.
          setAlerts(MOCK_ACTIVE_ALERTS);
          setLive(false);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to fetch alerts');
          setAlerts(MOCK_ACTIVE_ALERTS);
          setLive(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAlerts();
    const intervalId = setInterval(fetchAlerts, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [awsLoading, awsConnected, refreshKey, pollIntervalMs]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return {
    alerts,
    loading: loading || awsLoading,
    error,
    live,
    source: live ? 'CloudWatch Alarms' : 'Mock data',
    refresh,
  };
}

// ─── useAlertRules Hook ────────────────────────────────────────────────────────

export interface UseAlertRulesResult {
  rules: AlertRule[];
  loading: boolean;
  error: string | null;
  live: boolean;
  source: string;
  refresh: () => void;
}

/**
 * Hook to fetch alert rule configurations.
 * When AWS is connected, fetches from CloudWatch Alarms configuration.
 * Falls back to mock data when disconnected.
 */
export function useAlertRules(): UseAlertRulesResult {
  const { awsConnected, loading: awsLoading } = useAwsConnected();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (awsLoading) return;

    let cancelled = false;
    const fetchRules = async () => {
      if (refreshKey === 0) setLoading(true);

      try {
        // TODO: When backend API is available, fetch from:
        // const response = await governAlertsApi.rules();
        // if (response.live) { ... map CloudWatch alarm definitions to AlertRule[] }

        // CloudWatch describe_alarms returns alarm configurations including:
        // - AlarmName, AlarmDescription
        // - MetricName, Namespace, Statistic
        // - Threshold, ComparisonOperator, EvaluationPeriods
        // - AlarmActions (SNS topics for notifications)
        // - StateValue (for determining if currently firing)

        if (!cancelled) {
          setRules(MOCK_ALERT_RULES);
          setLive(false);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to fetch rules');
          setRules(MOCK_ALERT_RULES);
          setLive(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRules();
    return () => { cancelled = true; };
  }, [awsLoading, awsConnected, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return {
    rules,
    loading: loading || awsLoading,
    error,
    live,
    source: live ? 'CloudWatch Alarms' : 'Mock data',
    refresh,
  };
}

// ─── useSilences Hook ──────────────────────────────────────────────────────────

export interface UseSilencesResult {
  silences: Silence[];
  /** Count of silences still in force, as reported by the backend. */
  activeCount: number;
  loading: boolean;
  error: string | null;
  live: boolean;
  source: string;
  note: string | null;
  refresh: () => void;
}

/**
 * Hook to fetch stored alert silences.
 *
 * Silences live in the operations DynamoDB table, so a live-but-empty response is a
 * measured zero and renders as an honest empty state. When the read is not live (table
 * unreachable or unconfigured) this falls back to demo silences and reports live:false,
 * matching how useActiveAlerts degrades.
 */
export function useSilences(includeExpired = true): UseSilencesResult {
  const [silences, setSilences] = useState<Silence[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchSilences = async () => {
      try {
        const response = await governOperationsApi.silences(includeExpired);
        if (cancelled) return;

        if (response.live) {
          setSilences(response.silences.map(mapApiSilence));
          setActiveCount(response.active_count);
          setLive(true);
          setNote(response.note ?? null);
          setError(null);
        } else {
          // Store unreachable / unconfigured: show demo silences, never badge Live.
          setSilences(MOCK_SILENCES);
          setActiveCount(MOCK_SILENCES.filter(s => s.status === 'active').length);
          setLive(false);
          setNote(response.note ?? null);
          setError(null);
        }
      } catch (e) {
        if (cancelled) return;
        const { detail } = httpErrorInfo(e);
        setError(detail);
        setSilences(MOCK_SILENCES);
        setActiveCount(MOCK_SILENCES.filter(s => s.status === 'active').length);
        setLive(false);
        setNote(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSilences();
    return () => {
      cancelled = true;
    };
  }, [includeExpired, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return {
    silences,
    activeCount,
    loading,
    error,
    live,
    source: live ? 'Operations table (DynamoDB)' : 'Mock data',
    note,
    refresh,
  };
}

// ─── useAlertMutations Hook ────────────────────────────────────────────────────

export interface CreateRuleInput {
  name: string;
  description: string;
  metric: MetricType;
  operator: Operator;
  threshold: number;
  durationMinutes: number;
  severity: AlertSeverity;
  channels: string[];
  runbookUrl?: string;
}

/**
 * Payload for creating a silence. Mirrors the backend AlertSilenceCreate.
 *
 * There is deliberately no `createdBy`. The backend attributes the silence to the
 * `x-user-email` header the API client already attaches to every request - the same header
 * the RBAC layer reads to decide the role - and that header outranks any body field. This
 * hook used to send `created_by` sourced from `/users/me`, which is how that endpoint's
 * fabricated fallback address ended up written into silence records.
 *
 * A silence suppresses paging, so an unattributable one is still worse than none: callers
 * with no known signed-in user should withhold the action, not send it anonymously.
 */
export interface CreateSilenceInput {
  alarmNamePattern: string;
  reason: string;
  /** 1..10080 (7 days), matching the backend's own bounds. */
  durationMinutes: number;
}

/** The backend's cap on silence duration, in minutes (7 days). */
export const MAX_SILENCE_MINUTES = 10_080;

/**
 * The outcome of an alert write, carrying where the write actually landed.
 *
 * Modelled as a union so a caller cannot render success without having handled the case
 * where the record was not persisted. A resolved promise is NOT success here:
 *
 * - `persisted`   - durably written to the operations DynamoDB table.
 * - `unpersisted` - the write FAILED; the record is in memory and dies on restart.
 * - `unconfirmed` - the response carried no live/source, so provenance is unknown. Never
 *                   claim durability from this.
 * - `not-found`   - 404: nothing matched the id.
 * - `failed`      - the request did not complete (permissions, transport, server fault).
 */
export type AlertWriteResult<T> =
  | { kind: 'persisted'; value: T; source: 'dynamodb'; note: string | null }
  | { kind: 'unpersisted'; value: T; source: 'memory' | 'not-configured'; note: string | null }
  | { kind: 'unconfirmed'; value: T; note: string | null }
  | { kind: 'not-found'; message: string }
  | { kind: 'failed'; message: string };

export interface UseAlertMutationsResult {
  /** `alertId` is the alarm NAME (Alert.id), never an ARN. */
  acknowledgeAlert: (alertId: string) => Promise<AlertWriteResult<ActiveAlert>>;
  createSilence: (input: CreateSilenceInput) => Promise<AlertWriteResult<Silence>>;
  /** Ends a silence. The record survives with `ends_at` moved to now. */
  expireSilence: (silenceId: string) => Promise<AlertWriteResult<Silence>>;
  createRule: (input: CreateRuleInput) => Promise<AlertRule | null>;
  updateRule: (ruleId: string, updates: Partial<AlertRule>) => Promise<AlertRule | null>;
  deleteRule: (ruleId: string) => Promise<boolean>;
  toggleRule: (ruleId: string) => Promise<AlertRule | null>;
  mutating: boolean;
  error: string | null;
}

/**
 * Hook providing mutation functions for alert operations.
 *
 * acknowledgeAlert / createSilence / expireSilence hit the real, persisting endpoints and
 * return an AlertWriteResult describing where the record landed.
 *
 * What acknowledging and silencing do NOT do: they do not change the CloudWatch alarm.
 * The backend deliberately avoids SetAlarmState (which falsifies alarm history) and
 * DisableAlarmActions (untimed, and silently disarms production paging). Both are AVA-side
 * records - an acknowledgement is scoped to the alarm's current firing and clears if the
 * alarm changes state again; a silence is a stored, expiring name pattern applied when the
 * alert list is built. UI copy must not imply AWS was mutated.
 *
 * The rule mutations below remain unimplemented - see the note at their definitions.
 */
export function useAlertMutations(): UseAlertMutationsResult {
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acknowledgeAlert = useCallback(
    async (alertId: string): Promise<AlertWriteResult<ActiveAlert>> => {
      setMutating(true);
      setError(null);
      try {
        const result = await governOperationsApi.acknowledgeAlert(alertId);
        return classifyWrite(mapCloudWatchAlert(result), result);
      } catch (e) {
        const { status, detail } = httpErrorInfo(e);
        if (status === 404) {
          const message =
            'That alarm is no longer firing, so there is nothing to acknowledge.';
          setError(message);
          return { kind: 'not-found', message };
        }
        setError(detail);
        return { kind: 'failed', message: detail };
      } finally {
        setMutating(false);
      }
    },
    []
  );

  const createSilence = useCallback(
    async (input: CreateSilenceInput): Promise<AlertWriteResult<Silence>> => {
      setMutating(true);
      setError(null);
      try {
        // No created_by: the x-user-email header carries the identity and the backend
        // prefers it over any body field, so sending one could only ever disagree with it.
        const result = await governOperationsApi.createSilence({
          alarm_name_pattern: input.alarmNamePattern,
          reason: input.reason,
          duration_minutes: input.durationMinutes,
        });
        return classifyWrite(mapApiSilence(result), result);
      } catch (e) {
        const { detail } = httpErrorInfo(e);
        setError(detail);
        return { kind: 'failed', message: detail };
      } finally {
        setMutating(false);
      }
    },
    []
  );

  const expireSilence = useCallback(
    async (silenceId: string): Promise<AlertWriteResult<Silence>> => {
      setMutating(true);
      setError(null);
      try {
        const result = await governOperationsApi.expireSilence(silenceId);
        return classifyWrite(mapApiSilence(result), result);
      } catch (e) {
        const { status, detail } = httpErrorInfo(e);
        if (status === 404) {
          // Distinct from an already-ended silence: ending one twice succeeds and
          // returns the record, so a 404 means this id was never stored.
          const message = 'That silence no longer exists in the operations table.';
          setError(message);
          return { kind: 'not-found', message };
        }
        setError(detail);
        return { kind: 'failed', message: detail };
      } finally {
        setMutating(false);
      }
    },
    []
  );

  // Rule mutations have no endpoint to call, so they report failure rather than faking
  // success. This is narrower than it looks and was verified against the route table:
  // GET and POST /operations/alerts/rules exist, but there is no PATCH, DELETE or
  // enable/disable route for a rule, so update/delete/toggle have nowhere to go. Create is
  // reachable, but the client's createAlertRule payload still does not match the backend
  // AlertRuleCreate contract (metric_namespace / metric_name / comparison / period_seconds),
  // so calling it would 422. The AlertCenter rule controls stay disabled and labeled to
  // match. Do not implement these with a timer and a fabricated return.
  const createRule = useCallback(async (_input: CreateRuleInput): Promise<AlertRule | null> => null, []);
  const updateRule = useCallback(
    async (_ruleId: string, _updates: Partial<AlertRule>): Promise<AlertRule | null> => null,
    []
  );
  const deleteRule = useCallback(async (_ruleId: string): Promise<boolean> => false, []);
  const toggleRule = useCallback(async (_ruleId: string): Promise<AlertRule | null> => null, []);

  return {
    acknowledgeAlert,
    createSilence,
    expireSilence,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    mutating,
    error,
  };
}

// ─── Write-provenance helpers ──────────────────────────────────────────────────

function isAlertStoreSource(value: unknown): value is AlertStoreSource {
  return value === 'dynamodb' || value === 'memory' || value === 'not-configured';
}

/**
 * Turn a response's live/source/note triple into an AlertWriteResult.
 *
 * The triple is validated at runtime, not merely trusted from the type: a route whose
 * `response_model` is the parent class serializes the triple away, so `live` can genuinely
 * arrive undefined. Anything short of an explicit live+dynamodb is reported as
 * not-durable, which is the safe direction to be wrong in.
 */
function classifyWrite<T>(
  value: T,
  triple: { live?: boolean; source?: string; note?: string | null }
): AlertWriteResult<T> {
  const note = triple.note ?? null;
  if (typeof triple.live !== 'boolean' || !isAlertStoreSource(triple.source)) {
    return { kind: 'unconfirmed', value, note };
  }
  if (triple.source === 'dynamodb') {
    // live:false alongside source:'dynamodb' is self-contradictory. Report it as unknown
    // rather than inventing a durability claim in either direction.
    return triple.live
      ? { kind: 'persisted', value, source: 'dynamodb', note }
      : { kind: 'unconfirmed', value, note };
  }
  return { kind: 'unpersisted', value, source: triple.source, note };
}

/** Axios-shaped error, narrowed without `any`. */
function httpErrorInfo(e: unknown): { status: number | null; detail: string } {
  const err = e as { response?: { status?: number; data?: unknown }; message?: string };
  const status = err?.response?.status ?? null;
  const data = err?.response?.data;
  const detailField =
    typeof data === 'object' && data !== null
      ? (data as { detail?: unknown }).detail
      : undefined;
  const detail =
    typeof detailField === 'string'
      ? detailField
      : err?.message ?? 'Request failed';
  return { status, detail };
}

/**
 * Normalise a backend timestamp to an unambiguous UTC instant.
 *
 * The backend serialises `datetime.utcnow()`, which yields an ISO string with no timezone
 * designator. `new Date()` reads that as LOCAL time, shifting every value by the viewer's
 * UTC offset - enough to show a live silence as already expired, or an alarm as having
 * fired hours in the future.
 */
function asUtcIso(value: string): string {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
}

/** Map a stored backend silence into the shape the UI renders. */
function mapApiSilence(s: ApiAlertSilence): Silence {
  const endsAt = asUtcIso(s.ends_at);
  return {
    id: s.id,
    reason: s.reason,
    createdBy: s.created_by,
    createdAt: asUtcIso(s.created_at),
    expiresAt: endsAt,
    alarmNamePattern: s.alarm_name_pattern,
    status: new Date(endsAt).getTime() > Date.now() ? 'active' : 'expired',
  };
}

// ─── Utility: Map CloudWatch alarm state to severity ───────────────────────────

/**
 * Maps CloudWatch alarm configuration to our severity levels.
 * In a real implementation, this would examine:
 * - Alarm name patterns (e.g., "Critical-" prefix)
 * - Alarm description tags
 * - Associated SNS actions (PagerDuty = critical/high)
 * - TreatMissingData setting
 */
export function mapAlarmToSeverity(alarmName: string, alarmActions: string[]): AlertSeverity {
  const name = alarmName.toLowerCase();

  // Check name patterns
  if (name.includes('critical') || name.includes('heartbeat') || name.includes('fraud')) {
    return 'critical';
  }
  if (name.includes('high') || name.includes('queue') || name.includes('drop')) {
    return 'high';
  }
  if (name.includes('warning') || name.includes('cost') || name.includes('latency')) {
    return 'warning';
  }

  // Check if PagerDuty is in actions (indicates higher severity)
  if (alarmActions.some(a => a.includes('pagerduty'))) {
    return 'high';
  }

  return 'info';
}

/**
 * Maps CloudWatch ComparisonOperator to our Operator type.
 */
export function mapComparisonOperator(cwOperator: string): Operator {
  const mapping: Record<string, Operator> = {
    GreaterThanThreshold: '>',
    GreaterThanOrEqualToThreshold: '>=',
    LessThanThreshold: '<',
    LessThanOrEqualToThreshold: '<=',
  };
  return mapping[cwOperator] || '>';
}

/**
 * Maps CloudWatch metric namespace/name to our MetricType.
 */
export function mapMetricType(namespace: string, metricName: string): MetricType {
  const mn = metricName.toLowerCase();
  const ns = namespace.toLowerCase();

  if (mn.includes('latency') || mn.includes('duration')) return 'latency';
  if (mn.includes('error') || mn.includes('fault')) return 'error_rate';
  if (mn.includes('invocation') || mn.includes('count')) return 'invocations';
  if (ns.includes('cost') || mn.includes('cost') || mn.includes('spend')) return 'cost';
  if (mn.includes('token')) return 'token_usage';
  if (mn.includes('queue') || mn.includes('depth') || mn.includes('backlog')) return 'queue_depth';

  return 'invocations'; // default
}
