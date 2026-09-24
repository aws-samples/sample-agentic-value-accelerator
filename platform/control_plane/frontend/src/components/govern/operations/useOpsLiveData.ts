/**
 * useOpsLiveData - Live data hooks for Operations module components.
 *
 * Provides hooks for:
 * - On-call management (PagerDuty/OpsGenie integration)
 * - Change management (ServiceNow/ITIL integration)
 * - Capacity planning (AWS Service Quotas integration)
 * - Runbook management (Systems Manager integration)
 * - Compliance mapping (GRC systems integration)
 * - Audit evidence (Evidence collection integration)
 * - DORA metrics (CloudWatch/monitoring integration)
 *
 * Each hook gracefully degrades to mock data when live APIs unavailable.
 */

import { useState, useEffect, useCallback } from 'react';
import { useDataSources } from '../DataSourceContext';
import {
  governOperationsApi,
  type SsmManagedInstance,
  type SsmRunbookDoc,
  type SsmCommandRecord,
} from '../../../api/client';

// Re-export the read-only SSM shapes so operations components can consume
// them without reaching into the API client directly.
export type { SsmManagedInstance, SsmRunbookDoc, SsmCommandRecord };

// ============================================================================
// Types
// ============================================================================

// On-Call types
export interface OnCallPerson {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  slack: string;
  photoPlaceholder: string;
  team: string;
}

export interface OnCallShift {
  id: string;
  personId: string;
  type: 'primary' | 'secondary';
  startTime: Date;
  endTime: Date;
}

export interface EscalationPolicy {
  id: string;
  name: string;
  description: string;
  triggerConditions: string[];
  tiers: { tier: number; name: string; contactMethod: string; delayMinutes: number }[];
  notificationChannels: string[];
  enabled: boolean;
}

export interface OnCallData {
  team: OnCallPerson[];
  currentShift: OnCallShift[];
  weeklySchedule: OnCallShift[];
  escalationPolicies: EscalationPolicy[];
  notificationChannels: NotificationChannel[];
  history: OnCallHistoryEntry[];
}

export interface NotificationChannel {
  id: string;
  type: 'pagerduty' | 'opsgenie' | 'slack' | 'sms' | 'email';
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  config: string;
  lastTest?: Date;
}

export interface OnCallHistoryEntry {
  id: string;
  personId: string;
  shiftStart: Date;
  shiftEnd: Date;
  pagesReceived: number;
  avgResponseTime: number;
  escalations: number;
  incidents: number;
}

// Change Management types
export type ChangeType = 'deployment' | 'config-change' | 'policy-update' | 'model-update' | 'rollback' | 'scale-event';
export type ChangeStatus = 'pending-approval' | 'approved' | 'in-progress' | 'completed' | 'failed' | 'rolled-back';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type Outcome = 'success' | 'partial' | 'failed' | 'pending';

export interface Change {
  id: string;
  type: 'deployment' | 'config-change' | 'policy-update' | 'model-update' | 'rollback' | 'scale-event';
  title: string;
  description: string;
  agentOrResource: string;
  requester: string;
  approver: string | null;
  status: 'pending-approval' | 'approved' | 'in-progress' | 'completed' | 'failed' | 'rolled-back';
  scheduledTime: string;
  completedTime: string | null;
  outcome: 'success' | 'partial' | 'failed' | 'pending';
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  complianceImpact: string;
  approvalChain: { role: string; approver: string; status: string; timestamp: string | null; comment?: string }[];
  executionLog: { timestamp: string; action: string; status: string; detail?: string }[];
  relatedIncidents: { id: string; title: string; severity: string }[];
  rollbackAvailable: boolean;
  testingRequired: boolean;
  testingCompleted: boolean;
}

export interface ChangeFilters {
  type?: string;
  status?: string;
  requester?: string;
  dateRange?: string;
}

// Capacity types
export interface QuotaMetric {
  id: string;
  service: string;
  name: string;
  current: number;
  limit: number;
  unit: string;
  trend: number[];
  /**
   * Percent growth per week. `null` when no growth history is available, which is the case
   * for every quota mapped from live AWS Service Quotas - that API returns a current value
   * and a limit, not a usage series. It used to be hardcoded to 0, which rendered as a
   * measured "+0%/wk" and, worse, made every runway calculation unbounded (see
   * daysUntilHit in CapacityPlanning.tsx) so the "Projected Runway" KPI fell through to a
   * literal 90 days for every live account.
   */
  growthRate: number | null;
  adjustable: boolean;
  /**
   * The AWS Service Quotas identifiers, present only on quotas mapped from a live
   * Service Quotas response.
   *
   * `id` is a display key built as `${service_code}-${quota_code}` and must NOT be split
   * back apart to recover these - quota codes themselves contain hyphens (`L-1234ABCD`), so
   * there is no safe split point. A quota-increase request needs both codes exactly as AWS
   * gave them, so they are carried explicitly. Seeded quotas have neither, which is what
   * makes them non-submittable.
   */
  serviceCode?: string;
  quotaCode?: string;
}

export interface CapacityAlert {
  id: string;
  type: 'threshold' | 'projected' | 'anomaly';
  service: string;
  quota: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  triggeredAt: string;
  acknowledged: boolean;
}

export interface ScalingPolicy {
  id: string;
  name: string;
  service: string;
  minCapacity: number;
  maxCapacity: number;
  desiredCapacity: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  cooldownSec: number;
  enabled: boolean;
}

// Runbook types
export interface RunbookStep {
  id: string;
  name: string;
  type: 'check' | 'action' | 'decision' | 'notify' | 'wait' | 'escalate';
  description: string;
  command?: string;
  expectedOutcome: string;
  rollback?: string;
  timeout?: number;
  retries?: number;
  approvalRequired?: boolean;
  nextOnSuccess?: string;
  nextOnFailure?: string;
}

export interface Runbook {
  id: string;
  name: string;
  description: string;
  category: 'incident-response' | 'scaling' | 'recovery' | 'maintenance' | 'diagnostics' | 'security';
  steps: RunbookStep[];
  lastRun?: string;
  successRate: number;
  totalRuns: number;
  avgDuration: number;
  autoTriggerRules?: string[];
  variables?: { name: string; description: string; default?: string }[];
  createdBy: string;
  createdDate: string;
  updatedDate: string;
}

export interface RunbookExecution {
  id: string;
  runbookId: string;
  runbookName: string;
  trigger: 'manual' | 'auto' | 'incident';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted' | 'waiting-approval';
  duration: number;
  executor: string;
  startTime: string;
  endTime?: string;
  currentStep?: number;
  totalSteps: number;
  logs: { timestamp: string; step: string; message: string; level: 'info' | 'warn' | 'error' | 'success' }[];
  linkedIncident?: string;
}

// Compliance Mapping types
export type ViolationType = 'change-no-approval' | 'sla-breach' | 'runbook-skip' | 'escalation-bypass' | 'evidence-gap';
export type RemediationStatus = 'open' | 'in-progress' | 'resolved' | 'accepted-risk';
export type AuditPrepStatus = 'not-started' | 'in-progress' | 'ready' | 'overdue';

export interface FrameworkOpsImpact {
  id: string;
  name: string;
  shortName: string;
  opsRelatedControls: number;
  compliant: number;
  atRisk: number;
  nonCompliant: number;
  lastAssessed: string;
  criticalControls: string[];
}

export interface IncidentComplianceImpact {
  id: string;
  incidentId: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  occurredAt: string;
  frameworksAffected: { framework: string; controls: string[] }[];
  complianceImpactSeverity: 'critical' | 'high' | 'medium' | 'low';
  remediationStatus: RemediationStatus;
  evidenceGenerated: string[];
  rootCauseDocumented: boolean;
}

export interface PolicyViolation {
  id: string;
  type: ViolationType;
  description: string;
  timestamp: string;
  owner: string;
  agentOrSystem: string;
  remediationStatus: RemediationStatus;
  frameworksImpacted: string[];
  daysOpen: number;
}

export interface ChangeComplianceRecord {
  id: string;
  changeId: string;
  title: string;
  requestedBy: string;
  reviewRequired: boolean;
  preDeploymentCheck: 'pass' | 'fail' | 'waived' | 'pending';
  postDeploymentVerification: 'pass' | 'fail' | 'pending' | 'not-required';
  exceptionGranted: boolean;
  exceptionReason?: string;
  approvedBy?: string;
  timestamp: string;
  frameworksRelevant: string[];
}

export interface UpcomingAudit {
  id: string;
  name: string;
  framework: string;
  scheduledDate: string;
  daysUntil: number;
  prepStatus: AuditPrepStatus;
  requiredEvidence: { item: string; status: 'ready' | 'in-progress' | 'missing' }[];
  owner: string;
  scope: string[];
}

// Audit Evidence types
export interface EvidenceItem {
  id: string;
  type: string;
  category: 'incident' | 'change' | 'access' | 'availability' | 'capacity' | 'oncall';
  description: string;
  source: string;
  sourceSystem: string;
  timestamp: string;
  framework: string[];
  controlId: string;
  status: 'collected' | 'pending' | 'missing' | 'expired' | 'attested';
  autoCollected: boolean;
  attachments: string[];
  relatedItems: string[];
  attestation?: {
    status: 'pending' | 'approved' | 'rejected' | 'delegated';
    attestedBy?: string;
    attestedAt?: string;
    delegatedTo?: string;
    comments?: string;
  };
}

export interface EvidenceGap {
  framework: string;
  controlId: string;
  controlName: string;
  requiredEvidence: string;
  status: 'collected' | 'partial' | 'missing';
  priority: 'critical' | 'high' | 'medium' | 'low';
  remediation: string;
}

export interface AuditPackage {
  id: string;
  name: string;
  framework: string;
  description: string;
  itemCount: number;
  lastGenerated: string;
  generatedBy: string;
  exportFormats: string[];
  status: 'ready' | 'generating' | 'incomplete';
}

// DORA Metrics types
export interface DORAMetric {
  name: string;
  shortName: string;
  current: number;
  target: number;
  unit: string;
  trend: number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  sparkline: number[];
}

export interface OpsMetricsTrend {
  week: string;
  incidents: number;
  mttr: number;
  repeatRate: number;
  availability?: number;
  changes?: number;
  alertNoise?: number;
}

// ============================================================================
// On-Call Hooks
// ============================================================================

export interface UseOnCallResult {
  loading: boolean;
  error: string | null;
  data: OnCallData | null;
  live: boolean;
  refresh: () => void;
}

export function useOnCall(): UseOnCallResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OnCallData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // In production, this would call the PagerDuty/OpsGenie API
    // For now, return mock data after a simulated delay
    const fetchData = async () => {
      try {
        // Simulated API call - would be replaced with actual API
        // const response = await governOpsApi.onCall();
        await new Promise(resolve => setTimeout(resolve, 500));

        if (cancelled) return;

        // Mock data - would be replaced with API response
        setData(null); // Will use mock fallback in component
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError('Unable to fetch on-call data');
          updateSource('pagerduty', { status: 'error', error: 'API unavailable' });
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [refreshKey, updateSource]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { loading, error, data, live: !!data, refresh };
}

export interface UseEscalationPoliciesResult {
  loading: boolean;
  policies: EscalationPolicy[];
  live: boolean;
  createPolicy: (policy: Partial<EscalationPolicy>) => Promise<void>;
  updatePolicy: (id: string, updates: Partial<EscalationPolicy>) => Promise<void>;
  testPolicy: (id: string) => Promise<void>;
}

export function useEscalationPolicies(): UseEscalationPoliciesResult {
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<EscalationPolicy[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchPolicies = async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!cancelled) {
        setPolicies([]); // Will use mock fallback
        setLoading(false);
      }
    };

    fetchPolicies();
    return () => { cancelled = true; };
  }, []);

  const createPolicy = useCallback(async (_policy: Partial<EscalationPolicy>) => {
    // Would call API to create policy
    console.log('Create policy:', _policy);
  }, []);

  const updatePolicy = useCallback(async (_id: string, _updates: Partial<EscalationPolicy>) => {
    // Would call API to update policy
    console.log('Update policy:', _id, _updates);
  }, []);

  const testPolicy = useCallback(async (_id: string) => {
    // Would call API to test escalation
    console.log('Test policy:', _id);
  }, []);

  return { loading, policies, live: policies.length > 0, createPolicy, updatePolicy, testPolicy };
}

// ============================================================================
// Change Management Hooks
// ============================================================================

export interface UseChangesResult {
  loading: boolean;
  error: string | null;
  changes: Change[];
  live: boolean;
  refresh: () => void;
}

export function useChanges(filters?: ChangeFilters): UseChangesResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchChanges = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 400));
        if (!cancelled) {
          setChanges([]); // Will use mock fallback
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Unable to fetch changes');
          updateSource('servicenow', { status: 'error', error: 'API unavailable' });
          setLoading(false);
        }
      }
    };

    fetchChanges();
    return () => { cancelled = true; };
  }, [refreshKey, filters, updateSource]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { loading, error, changes, live: changes.length > 0, refresh };
}

export interface UsePendingApprovalsResult {
  loading: boolean;
  pendingApprovals: Change[];
  live: boolean;
  refresh: () => void;
}

export function usePendingApprovals(): UsePendingApprovalsResult {
  const [loading, setLoading] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState<Change[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchPending = async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!cancelled) {
        setPendingApprovals([]); // Will use mock fallback
        setLoading(false);
      }
    };

    fetchPending();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { loading, pendingApprovals, live: pendingApprovals.length > 0, refresh };
}

export interface UseChangeMutationsResult {
  approving: boolean;
  rejecting: boolean;
  approve: (id: string, comment?: string) => Promise<boolean>;
  reject: (id: string, reason: string) => Promise<boolean>;
  rollback: (id: string) => Promise<boolean>;
}

export function useChangeMutations(): UseChangeMutationsResult {
  // Change-management writes (ServiceNow/ITIL) are not yet wired to a backend.
  // Return false instead of faking success so callers never render a
  // change as approved/rejected/rolled-back when nothing actually happened.
  const [approving] = useState(false);
  const [rejecting] = useState(false);

  const approve = useCallback(async (_id: string, _comment?: string) => false, []);
  const reject = useCallback(async (_id: string, _reason: string) => false, []);
  const rollback = useCallback(async (_id: string) => false, []);

  return { approving, rejecting, approve, reject, rollback };
}

// ============================================================================
// Capacity Planning Hooks
// ============================================================================

export interface UseCapacityQuotasResult {
  loading: boolean;
  quotas: QuotaMetric[];
  scalingPolicies: ScalingPolicy[];
  live: boolean;
  refresh: () => void;
}

export function useCapacityQuotas(): UseCapacityQuotasResult {
  const [loading, setLoading] = useState(true);
  const [quotas, setQuotas] = useState<QuotaMetric[]>([]);
  const [scalingPolicies, setScalingPolicies] = useState<ScalingPolicy[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchQuotas = async () => {
      try {
        // In production, would call AWS Service Quotas API
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!cancelled) {
          setQuotas([]); // Will use mock fallback
          setScalingPolicies([]);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          updateSource('aws-service-quotas', { status: 'error', error: 'API unavailable' });
          setLoading(false);
        }
      }
    };

    fetchQuotas();
    return () => { cancelled = true; };
  }, [refreshKey, updateSource]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { loading, quotas, scalingPolicies, live: quotas.length > 0, refresh };
}

export interface UseCapacityAlertsResult {
  loading: boolean;
  alerts: CapacityAlert[];
  live: boolean;
  acknowledge: (id: string) => Promise<void>;
  refresh: () => void;
}

export function useCapacityAlerts(): UseCapacityAlertsResult {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<CapacityAlert[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchAlerts = async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!cancelled) {
        setAlerts([]); // Will use mock fallback
        setLoading(false);
      }
    };

    fetchAlerts();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const acknowledge = useCallback(async (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
  }, []);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { loading, alerts, live: alerts.length > 0, acknowledge, refresh };
}

// ============================================================================
// Runbook Hooks
// ============================================================================

/**
 * SSM Fleet Manager (read-only) hooks.
 *
 * `useRunbooks`, `useManagedInstances`, and `useCommandHistory` surface the
 * real Systems Manager document catalog, managed-instance fleet, and Run
 * Command history from the backend. They are read-only: no hook here issues
 * SendCommand / StartAutomationExecution or any other mutation. Execution
 * remains an honest no-op in `useRunbookMutations` below.
 */

export interface UseRunbooksResult {
  loading: boolean;
  /** SSM Command/Automation documents (read-only catalog). */
  runbooks: SsmRunbookDoc[];
  total: number;
  commandCount: number;
  automationCount: number;
  live: boolean;
  source: string;
  note?: string | null;
  refresh: () => void;
}

export function useRunbooks(): UseRunbooksResult {
  const [loading, setLoading] = useState(true);
  const [runbooks, setRunbooks] = useState<SsmRunbookDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [commandCount, setCommandCount] = useState(0);
  const [automationCount, setAutomationCount] = useState(0);
  const [live, setLive] = useState(false);
  const [source, setSource] = useState('ssm');
  const [note, setNote] = useState<string | null | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchRunbooks = async () => {
      try {
        const resp = await governOperationsApi.ssmRunbooks();
        if (cancelled) return;
        setRunbooks(resp.runbooks || []);
        setTotal(resp.total || 0);
        setCommandCount(resp.command_count || 0);
        setAutomationCount(resp.automation_count || 0);
        setLive(!!resp.live);
        setSource(resp.source || 'ssm');
        setNote(resp.note ?? null);
        updateSource('aws-ssm', {
          name: 'Systems Manager',
          provider: 'aws',
          status: resp.live ? 'live' : 'error',
          error: resp.live ? undefined : (resp.note || 'SSM document catalog unavailable'),
        });
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setRunbooks([]);
          setLive(false);
          setSource('ssm-unavailable');
          setNote('SSM document catalog unavailable');
          updateSource('aws-ssm', {
            name: 'Systems Manager',
            provider: 'aws',
            status: 'error',
            error: 'API unavailable',
          });
          setLoading(false);
        }
      }
    };

    fetchRunbooks();
    return () => { cancelled = true; };
  }, [refreshKey, updateSource]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { loading, runbooks, total, commandCount, automationCount, live, source, note, refresh };
}

export interface UseManagedInstancesResult {
  loading: boolean;
  instances: SsmManagedInstance[];
  total: number;
  onlineCount: number;
  live: boolean;
  source: string;
  note?: string | null;
  refresh: () => void;
}

export function useManagedInstances(): UseManagedInstancesResult {
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<SsmManagedInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [live, setLive] = useState(false);
  const [source, setSource] = useState('ssm');
  const [note, setNote] = useState<string | null | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchInstances = async () => {
      try {
        const resp = await governOperationsApi.ssmManagedInstances();
        if (cancelled) return;
        setInstances(resp.instances || []);
        setTotal(resp.total || 0);
        setOnlineCount(resp.online_count || 0);
        setLive(!!resp.live);
        setSource(resp.source || 'ssm');
        setNote(resp.note ?? null);
        updateSource('aws-ssm', {
          name: 'Systems Manager',
          provider: 'aws',
          status: resp.live ? 'live' : 'error',
          error: resp.live ? undefined : (resp.note || 'SSM managed instances unavailable'),
        });
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setInstances([]);
          setLive(false);
          setSource('ssm-unavailable');
          setNote('SSM managed instances unavailable');
          updateSource('aws-ssm', {
            name: 'Systems Manager',
            provider: 'aws',
            status: 'error',
            error: 'API unavailable',
          });
          setLoading(false);
        }
      }
    };

    fetchInstances();
    return () => { cancelled = true; };
  }, [refreshKey, updateSource]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { loading, instances, total, onlineCount, live, source, note, refresh };
}

export interface UseCommandHistoryResult {
  loading: boolean;
  commands: SsmCommandRecord[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
  refresh: () => void;
}

export function useCommandHistory(days = 7): UseCommandHistoryResult {
  const [loading, setLoading] = useState(true);
  const [commands, setCommands] = useState<SsmCommandRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [live, setLive] = useState(false);
  const [source, setSource] = useState('ssm');
  const [note, setNote] = useState<string | null | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchCommands = async () => {
      try {
        const resp = await governOperationsApi.ssmCommandHistory(days);
        if (cancelled) return;
        setCommands(resp.commands || []);
        setTotal(resp.total || 0);
        setLive(!!resp.live);
        setSource(resp.source || 'ssm');
        setNote(resp.note ?? null);
        updateSource('aws-ssm', {
          name: 'Systems Manager',
          provider: 'aws',
          status: resp.live ? 'live' : 'error',
          error: resp.live ? undefined : (resp.note || 'SSM command history unavailable'),
        });
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setCommands([]);
          setLive(false);
          setSource('ssm-unavailable');
          setNote('SSM command history unavailable');
          updateSource('aws-ssm', {
            name: 'Systems Manager',
            provider: 'aws',
            status: 'error',
            error: 'API unavailable',
          });
          setLoading(false);
        }
      }
    };

    fetchCommands();
    return () => { cancelled = true; };
  }, [refreshKey, updateSource, days]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { loading, commands, total, live, source, note, refresh };
}

export interface UseRunbookExecutionsResult {
  loading: boolean;
  executions: RunbookExecution[];
  live: boolean;
  refresh: () => void;
}

export function useRunbookExecutions(runbookId?: string): UseRunbookExecutionsResult {
  const [loading, setLoading] = useState(true);
  const [executions, setExecutions] = useState<RunbookExecution[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchExecutions = async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!cancelled) {
        setExecutions([]); // Will use mock fallback
        setLoading(false);
      }
    };

    fetchExecutions();
    return () => { cancelled = true; };
  }, [refreshKey, runbookId]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { loading, executions, live: executions.length > 0, refresh };
}

export interface UseRunbookMutationsResult {
  executing: boolean;
  run: (runbookId: string, variables?: Record<string, string>) => Promise<string | null>;
  abort: (executionId: string) => Promise<boolean>;
  create: (runbook: Partial<Runbook>) => Promise<string | null>;
  update: (id: string, updates: Partial<Runbook>) => Promise<boolean>;
}

export function useRunbookMutations(): UseRunbookMutationsResult {
  // Runbook execution (Systems Manager) is not yet wired to a backend.
  // Return null/false rather than a fabricated execution id or success flag,
  // so callers do not render a run/abort/create/update as having happened.
  const [executing] = useState(false);

  const run = useCallback(async (_runbookId: string, _variables?: Record<string, string>) => null, []);
  const abort = useCallback(async (_executionId: string) => false, []);
  const create = useCallback(async (_runbook: Partial<Runbook>) => null, []);
  const update = useCallback(async (_id: string, _updates: Partial<Runbook>) => false, []);

  return { executing, run, abort, create, update };
}

// ============================================================================
// Compliance Mapping Hooks
// ============================================================================

export interface ComplianceMappingData {
  frameworkImpacts: FrameworkOpsImpact[];
  incidentImpacts: IncidentComplianceImpact[];
  policyViolations: PolicyViolation[];
  changeCompliance: ChangeComplianceRecord[];
  evidence: EvidenceItem[];
  kpis: {
    complianceScore: number;
    complianceScoreTrend: number;
    policyViolationsFromOps: number;
    incidentsWithComplianceImpact: number;
    auditFindingsOpen: number;
    changeCompliancePct: number;
    evidenceGaps: number;
  };
  audits: UpcomingAudit[];
}

export interface UseComplianceMappingResult {
  loading: boolean;
  mapping: ComplianceMappingData | null;
  live: boolean;
  refresh: () => void;
}

export function useComplianceMapping(): UseComplianceMappingResult {
  const [loading, setLoading] = useState(true);
  const [mapping, setMapping] = useState<ComplianceMappingData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchMapping = async () => {
      await new Promise(resolve => setTimeout(resolve, 400));
      if (!cancelled) {
        setMapping(null); // Will use mock fallback in component
        setLoading(false);
      }
    };

    fetchMapping();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { loading, mapping, live: mapping !== null, refresh };
}

// ============================================================================
// Audit Evidence Hooks
// ============================================================================

export interface UseAuditEvidenceResult {
  loading: boolean;
  evidence: EvidenceItem[];
  live: boolean;
  refresh: () => void;
}

export function useAuditEvidence(category?: string): UseAuditEvidenceResult {
  const [loading, setLoading] = useState(true);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchEvidence = async () => {
      await new Promise(resolve => setTimeout(resolve, 400));
      if (!cancelled) {
        setEvidence([]); // Will use mock fallback
        setLoading(false);
      }
    };

    fetchEvidence();
    return () => { cancelled = true; };
  }, [refreshKey, category]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { loading, evidence, live: evidence.length > 0, refresh };
}

export interface UseEvidenceGapsResult {
  loading: boolean;
  gaps: EvidenceGap[];
  live: boolean;
}

export function useEvidenceGaps(): UseEvidenceGapsResult {
  const [loading, setLoading] = useState(true);
  const [gaps, setGaps] = useState<EvidenceGap[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchGaps = async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!cancelled) {
        setGaps([]); // Will use mock fallback
        setLoading(false);
      }
    };

    fetchGaps();
    return () => { cancelled = true; };
  }, []);

  return { loading, gaps, live: gaps.length > 0 };
}

export interface UseAuditPackagesResult {
  loading: boolean;
  packages: AuditPackage[];
  live: boolean;
  generate: (packageId: string) => Promise<void>;
}

export function useAuditPackages(): UseAuditPackagesResult {
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<AuditPackage[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchPackages = async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!cancelled) {
        setPackages([]); // Will use mock fallback
        setLoading(false);
      }
    };

    fetchPackages();
    return () => { cancelled = true; };
  }, []);

  // Evidence-package generation is not yet wired to a backend. This is a no-op
  // (rather than a simulated delay) so callers do not render a package as
  // generated when nothing was produced.
  const generate = useCallback(async (_packageId: string) => {
    /* not implemented — evidence export pipeline not yet connected */
  }, []);

  return { loading, packages, live: packages.length > 0, generate };
}

// ============================================================================
// Ops Metrics Hooks
// ============================================================================

export interface UseOpsMetricsResult {
  loading: boolean;
  doraMetrics: DORAMetric[];
  live: boolean;
  refresh: () => void;
}

export function useOpsMetrics(): UseOpsMetricsResult {
  const [loading, setLoading] = useState(true);
  const [doraMetrics, setDoraMetrics] = useState<DORAMetric[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const { updateSource } = useDataSources();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchMetrics = async () => {
      try {
        // In production, would call CloudWatch/monitoring APIs
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!cancelled) {
          setDoraMetrics([]); // Will use mock fallback
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          updateSource('aws-cloudwatch', { status: 'error', error: 'API unavailable' });
          setLoading(false);
        }
      }
    };

    fetchMetrics();
    return () => { cancelled = true; };
  }, [refreshKey, updateSource]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { loading, doraMetrics, live: doraMetrics.length > 0, refresh };
}

export interface UseOpsTrendsResult {
  loading: boolean;
  trends: OpsMetricsTrend[];
  live: boolean;
}

export function useOpsTrends(period: '7d' | '30d' | '90d' | '1y' = '30d'): UseOpsTrendsResult {
  const [loading, setLoading] = useState(true);
  const [trends, setTrends] = useState<OpsMetricsTrend[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchTrends = async () => {
      await new Promise(resolve => setTimeout(resolve, 400));
      if (!cancelled) {
        setTrends([]); // Will use mock fallback
        setLoading(false);
      }
    };

    fetchTrends();
    return () => { cancelled = true; };
  }, [period]);

  return { loading, trends, live: trends.length > 0 };
}

export default {
  useOnCall,
  useEscalationPolicies,
  useChanges,
  usePendingApprovals,
  useChangeMutations,
  useCapacityQuotas,
  useCapacityAlerts,
  useRunbooks,
  useManagedInstances,
  useCommandHistory,
  useRunbookExecutions,
  useRunbookMutations,
  useComplianceMapping,
  useAuditEvidence,
  useEvidenceGaps,
  useAuditPackages,
  useOpsMetrics,
  useOpsTrends,
};
