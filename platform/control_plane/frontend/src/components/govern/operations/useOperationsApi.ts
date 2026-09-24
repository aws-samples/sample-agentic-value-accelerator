/**
 * useOperationsApi.ts - React hooks for Operations module live data
 *
 * Provides hooks for fetching live data from backend APIs with loading/error states
 * and graceful fallback to mock data. Follows the pattern from useAwsCost.ts.
 *
 * Each hook returns: { loading, data, error, live, refetch }
 * - loading: boolean indicating fetch in progress
 * - data: the fetched data or null
 * - error: error message if fetch failed
 * - live: boolean indicating if data is from real API (not mock fallback)
 * - refetch: function to manually trigger a refetch
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  governOperationsApi,
  type FleetStatusResponse,
  type FleetAgentResponse,
  type AgentDetailResponse,
  type IncidentListResponse,
  type IncidentDetailResponse,
  type AlertListResponse,
  type AlertRulesResponse,
  type SLAListResponse,
  type SLABreachResponse,
  type SLAComplianceResponse,
  type OnCallResponse,
  type EscalationPoliciesResponse,
  type ChangeListResponse,
  type PendingApprovalsResponse,
  type OpsMetricsSummaryResponse,
  type OpsTrendsResponse,
  type CapacityQuotasResponse,
  type CapacityAlertsResponse,
  type IncidentCreateRequest,
  type IncidentUpdateRequest,
  type AddTimelineEventRequest,
  type ChangeCreateRequest,
  type AlertAckResult,
  type AlertSilenceCreate,
  type AlertSilenceResult,
} from '../../../api/client';
import { useDataSources } from '../DataSourceContext';

// ============================================================================
// Types
// ============================================================================

export interface UseApiResult<T> {
  loading: boolean;
  data: T | null;
  error: string | null;
  live: boolean;
  refetch: () => void;
}

export interface UseApiResultWithMutations<T, M> extends UseApiResult<T> {
  mutations: M;
}

// Filter types
export interface FleetAgentFilters {
  status?: 'healthy' | 'degraded' | 'down' | 'maintenance';
  provider?: 'AWS' | 'Azure' | 'GCP';
  search?: string;
  sortBy?: 'name' | 'status' | 'latency' | 'errorRate' | 'invocations';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface IncidentFilters {
  status?: 'New' | 'Triaging' | 'Investigating' | 'Identified' | 'Monitoring' | 'Resolved';
  severity?: 'Critical' | 'High' | 'Medium' | 'Low';
  agentId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface AlertFilters {
  severity?: 'critical' | 'warning' | 'info';
  acknowledged?: boolean;
  agentId?: string;
  limit?: number;
}

export interface ChangeFilters {
  status?: 'Pending' | 'Approved' | 'Rejected' | 'Deployed' | 'Rolled Back';
  type?: 'model' | 'config' | 'policy' | 'infrastructure';
  agentId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Generic Hook Factory
// ============================================================================

function useApiHook<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options?: {
    dataSourceId?: string;
    refreshInterval?: number;
  }
): UseApiResult<T> {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const mountedRef = useRef(true);
  const { updateSource } = useDataSources();

  const refetch = useCallback(() => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (!mountedRef.current) return;
        setData(result);
        // Only treat data as live when the payload explicitly says so. A missing
        // 'live' key must NOT be assumed live (otherwise mock/stub responses would
        // render under a green Live pill).
        const isLive = result && typeof result === 'object' && 'live' in result
          ? Boolean((result as Record<string, unknown>).live)
          : false;
        setLive(isLive);
        if (options?.dataSourceId) {
          updateSource(options.dataSourceId, {
            status: isLive ? 'live' : 'cached',
            lastFetch: Date.now(),
          });
        }
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        setLive(false);
        if (options?.dataSourceId) {
          updateSource(options.dataSourceId, {
            status: 'error',
            error: errorMessage,
          });
        }
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [fetcher, options?.dataSourceId, updateSource]);

  useEffect(() => {
    mountedRef.current = true;
    refetch();

    // Auto-refresh interval
    let intervalId: ReturnType<typeof setInterval> | null = null;
    if (options?.refreshInterval && options.refreshInterval > 0) {
      intervalId = setInterval(refetch, options.refreshInterval);
    }

    return () => {
      mountedRef.current = false;
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { loading, data, error, live, refetch };
}

// ============================================================================
// Fleet Health Hooks
// ============================================================================

/**
 * Fetch overall fleet status summary (healthy/degraded/down counts, availability %).
 */
export function useFleetStatus(refreshInterval?: number): UseApiResult<FleetStatusResponse> {
  const fetcher = useCallback(() => governOperationsApi.fleetStatus(), []);
  return useApiHook(fetcher, [], {
    dataSourceId: 'ops-fleet-health',
    refreshInterval,
  });
}

/**
 * Fetch fleet agents list with optional filters.
 */
export function useFleetAgents(
  filters?: FleetAgentFilters,
  refreshInterval?: number
): UseApiResult<FleetAgentResponse> {
  const fetcher = useCallback(
    () => governOperationsApi.fleetAgents(filters),
    [filters]
  );
  return useApiHook(fetcher, [JSON.stringify(filters)], {
    dataSourceId: 'ops-fleet-agents',
    refreshInterval,
  });
}

/**
 * Fetch single agent detail with full metrics, incidents, SLAs.
 */
export function useAgentDetail(
  agentId: string,
  refreshInterval?: number
): UseApiResult<AgentDetailResponse> {
  const fetcher = useCallback(
    () => governOperationsApi.agentDetail(agentId),
    [agentId]
  );
  return useApiHook(fetcher, [agentId], {
    dataSourceId: 'ops-agent-detail',
    refreshInterval,
  });
}

// ============================================================================
// Incident Hooks
// ============================================================================

/**
 * Fetch incidents list with optional filters.
 */
export function useIncidents(
  filters?: IncidentFilters,
  refreshInterval?: number
): UseApiResult<IncidentListResponse> {
  const fetcher = useCallback(
    () => governOperationsApi.incidents(filters),
    [filters]
  );
  return useApiHook(fetcher, [JSON.stringify(filters)], {
    dataSourceId: 'ops-incidents',
    refreshInterval,
  });
}

/**
 * Fetch single incident detail with timeline.
 */
export function useIncidentDetail(
  incidentId: string,
  refreshInterval?: number
): UseApiResult<IncidentDetailResponse> {
  const fetcher = useCallback(
    () => governOperationsApi.incidentDetail(incidentId),
    [incidentId]
  );
  return useApiHook(fetcher, [incidentId], {
    dataSourceId: 'ops-incident-detail',
    refreshInterval,
  });
}

/**
 * Incident mutations (create, update, add timeline event).
 */
export function useIncidentMutations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createIncident = useCallback(async (data: IncidentCreateRequest) => {
    setLoading(true);
    setError(null);
    try {
      const result = await governOperationsApi.createIncident(data);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create incident';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateIncident = useCallback(async (id: string, data: IncidentUpdateRequest) => {
    setLoading(true);
    setError(null);
    try {
      const result = await governOperationsApi.updateIncident(id, data);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update incident';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const addTimelineEvent = useCallback(async (incidentId: string, event: AddTimelineEventRequest) => {
    setLoading(true);
    setError(null);
    try {
      const result = await governOperationsApi.addTimelineEvent(incidentId, event);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add timeline event';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    createIncident,
    updateIncident,
    addTimelineEvent,
  };
}

// ============================================================================
// Alert Hooks
// ============================================================================

/**
 * Fetch currently firing alerts.
 */
export function useActiveAlerts(
  filters?: AlertFilters,
  refreshInterval?: number
): UseApiResult<AlertListResponse> {
  const fetcher = useCallback(
    () => governOperationsApi.activeAlerts(filters),
    [filters]
  );
  return useApiHook(fetcher, [JSON.stringify(filters)], {
    dataSourceId: 'ops-alerts',
    refreshInterval,
  });
}

/**
 * Fetch alert rules configuration.
 */
export function useAlertRules(refreshInterval?: number): UseApiResult<AlertRulesResponse> {
  const fetcher = useCallback(() => governOperationsApi.alertRules(), []);
  return useApiHook(fetcher, [], {
    dataSourceId: 'ops-alert-rules',
    refreshInterval,
  });
}

/**
 * Alert mutations (acknowledge, create silence, create rule).
 */
export function useAlertMutations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `alertId` is the alarm NAME (Alert.id), and the backend infers the actor, so there is
  // no acknowledgedBy parameter. The result carries live/source/note describing where the
  // acknowledgement was stored - callers must not treat a resolved promise as "persisted".
  const acknowledgeAlert = useCallback(async (alertId: string): Promise<AlertAckResult> => {
    setLoading(true);
    setError(null);
    try {
      const result = await governOperationsApi.acknowledgeAlert(alertId);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to acknowledge alert';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createSilence = useCallback(async (
    data: AlertSilenceCreate
  ): Promise<AlertSilenceResult> => {
    setLoading(true);
    setError(null);
    try {
      const result = await governOperationsApi.createSilence(data);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create silence';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createRule = useCallback(async (data: {
    name: string;
    description?: string;
    condition: string;
    threshold: number;
    severity: 'critical' | 'warning' | 'info';
    agentPatterns?: string[];
    enabled?: boolean;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await governOperationsApi.createAlertRule(data);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create alert rule';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    acknowledgeAlert,
    createSilence,
    createRule,
  };
}

// ============================================================================
// SLA Hooks
// ============================================================================

/**
 * Fetch SLAs with compliance status.
 */
export function useSLAs(refreshInterval?: number): UseApiResult<SLAListResponse> {
  const fetcher = useCallback(() => governOperationsApi.slas(), []);
  return useApiHook(fetcher, [], {
    dataSourceId: 'ops-slas',
    refreshInterval,
  });
}

/**
 * Fetch active SLA breaches.
 */
export function useSLABreaches(refreshInterval?: number): UseApiResult<SLABreachResponse> {
  const fetcher = useCallback(() => governOperationsApi.slaBreaches(), []);
  return useApiHook(fetcher, [], {
    dataSourceId: 'ops-sla-breaches',
    refreshInterval,
  });
}

/**
 * Fetch SLA compliance report for a period.
 */
export function useSLACompliance(
  period: '7d' | '30d' | '90d' = '30d',
  refreshInterval?: number
): UseApiResult<SLAComplianceResponse> {
  const fetcher = useCallback(
    () => governOperationsApi.slaCompliance(period),
    [period]
  );
  return useApiHook(fetcher, [period], {
    dataSourceId: 'ops-sla-compliance',
    refreshInterval,
  });
}

// ============================================================================
// On-Call Hooks
// ============================================================================

/**
 * Fetch current on-call schedule.
 */
export function useOnCall(refreshInterval?: number): UseApiResult<OnCallResponse> {
  const fetcher = useCallback(() => governOperationsApi.onCall(), []);
  return useApiHook(fetcher, [], {
    dataSourceId: 'ops-oncall',
    refreshInterval,
  });
}

/**
 * Fetch escalation policies.
 */
export function useEscalationPolicies(
  refreshInterval?: number
): UseApiResult<EscalationPoliciesResponse> {
  const fetcher = useCallback(() => governOperationsApi.escalationPolicies(), []);
  return useApiHook(fetcher, [], {
    dataSourceId: 'ops-escalation-policies',
    refreshInterval,
  });
}

// ============================================================================
// Change Management Hooks
// ============================================================================

/**
 * Fetch change log with optional filters.
 */
export function useChanges(
  filters?: ChangeFilters,
  refreshInterval?: number
): UseApiResult<ChangeListResponse> {
  const fetcher = useCallback(
    () => governOperationsApi.changes(filters),
    [filters]
  );
  return useApiHook(fetcher, [JSON.stringify(filters)], {
    dataSourceId: 'ops-changes',
    refreshInterval,
  });
}

/**
 * Fetch pending change approvals.
 */
export function usePendingApprovals(
  refreshInterval?: number
): UseApiResult<PendingApprovalsResponse> {
  const fetcher = useCallback(() => governOperationsApi.pendingApprovals(), []);
  return useApiHook(fetcher, [], {
    dataSourceId: 'ops-pending-approvals',
    refreshInterval,
  });
}

/**
 * Change mutations (create, approve, reject).
 */
export function useChangeMutations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createChange = useCallback(async (data: ChangeCreateRequest) => {
    setLoading(true);
    setError(null);
    try {
      const result = await governOperationsApi.createChange(data);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create change';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const approveChange = useCallback(async (changeId: string, approvedBy: string, comment?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await governOperationsApi.approveChange(changeId, approvedBy, comment);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to approve change';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const rejectChange = useCallback(async (changeId: string, rejectedBy: string, reason: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await governOperationsApi.rejectChange(changeId, rejectedBy, reason);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reject change';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    createChange,
    approveChange,
    rejectChange,
  };
}

// ============================================================================
// Metrics Hooks
// ============================================================================

/**
 * Fetch operational metrics (MTTR, MTTD, CFR, availability).
 */
export function useOpsMetrics(refreshInterval?: number): UseApiResult<OpsMetricsSummaryResponse> {
  const fetcher = useCallback(() => governOperationsApi.opsMetrics(), []);
  return useApiHook(fetcher, [], {
    dataSourceId: 'ops-metrics',
    refreshInterval,
  });
}

/**
 * Fetch historical ops trends.
 */
export function useOpsTrends(
  period: '7d' | '30d' | '90d' = '30d',
  refreshInterval?: number
): UseApiResult<OpsTrendsResponse> {
  const fetcher = useCallback(
    () => governOperationsApi.opsTrends(period),
    [period]
  );
  return useApiHook(fetcher, [period], {
    dataSourceId: 'ops-trends',
    refreshInterval,
  });
}

// ============================================================================
// Capacity Hooks
// ============================================================================

/**
 * Fetch capacity quotas with current usage.
 */
export function useCapacityQuotas(
  refreshInterval?: number
): UseApiResult<CapacityQuotasResponse> {
  const fetcher = useCallback(() => governOperationsApi.capacityQuotas(), []);
  return useApiHook(fetcher, [], {
    dataSourceId: 'ops-capacity-quotas',
    refreshInterval,
  });
}

/**
 * Fetch capacity-related alerts (quotas approaching limits).
 */
export function useCapacityAlerts(
  refreshInterval?: number
): UseApiResult<CapacityAlertsResponse> {
  const fetcher = useCallback(() => governOperationsApi.capacityAlerts(), []);
  return useApiHook(fetcher, [], {
    dataSourceId: 'ops-capacity-alerts',
    refreshInterval,
  });
}

// ============================================================================
// Composite Hooks (fetch multiple related datasets)
// ============================================================================

/**
 * Fetch overview data for the Operations dashboard hero section.
 * Combines fleet status, active incidents, open alerts, SLA compliance.
 */
export function useOpsOverview(refreshInterval?: number) {
  const fleetStatus = useFleetStatus(refreshInterval);
  const incidents = useIncidents({ status: 'Investigating' }, refreshInterval);
  const alerts = useActiveAlerts(undefined, refreshInterval);
  const slas = useSLAs(refreshInterval);
  const onCall = useOnCall(refreshInterval);
  const metrics = useOpsMetrics(refreshInterval);

  return {
    loading:
      fleetStatus.loading ||
      incidents.loading ||
      alerts.loading ||
      slas.loading ||
      onCall.loading ||
      metrics.loading,
    fleetStatus: fleetStatus.data,
    incidents: incidents.data,
    alerts: alerts.data,
    slas: slas.data,
    onCall: onCall.data,
    metrics: metrics.data,
    live:
      fleetStatus.live &&
      incidents.live &&
      alerts.live &&
      slas.live &&
      onCall.live &&
      metrics.live,
    errors: [
      fleetStatus.error,
      incidents.error,
      alerts.error,
      slas.error,
      onCall.error,
      metrics.error,
    ].filter(Boolean) as string[],
    refetch: () => {
      fleetStatus.refetch();
      incidents.refetch();
      alerts.refetch();
      slas.refetch();
      onCall.refetch();
      metrics.refetch();
    },
  };
}

// Re-export types from client for convenience
export type {
  // Response types
  FleetStatusResponse,
  FleetAgentResponse,
  AgentDetailResponse,
  IncidentListResponse,
  IncidentDetailResponse,
  AlertListResponse,
  AlertRulesResponse,
  SLAListResponse,
  SLABreachResponse,
  SLAComplianceResponse,
  OnCallResponse,
  EscalationPoliciesResponse,
  ChangeListResponse,
  PendingApprovalsResponse,
  OpsMetricsSummaryResponse,
  OpsTrendsResponse,
  CapacityQuotasResponse,
  CapacityAlertsResponse,
  // Request types
  IncidentCreateRequest,
  IncidentUpdateRequest,
  AddTimelineEventRequest,
  ChangeCreateRequest,
  // Entity types
  FleetAgent,
  FleetAgentStatus,
  Alert,
  AlertRule,
  AlertSeverity,
  SLA,
  SLABreach,
  EscalationPolicy,
  Change,
  ChangeStatus,
  ChangeType,
  CapacityAlert,
  // Incident types
  Incident,
  IncidentSeverity,
  IncidentStatus,
  IncidentMutationResponse,
} from '../../../api/client';

export default {
  useFleetStatus,
  useFleetAgents,
  useAgentDetail,
  useIncidents,
  useIncidentDetail,
  useIncidentMutations,
  useActiveAlerts,
  useAlertRules,
  useAlertMutations,
  useSLAs,
  useSLABreaches,
  useSLACompliance,
  useOnCall,
  useEscalationPolicies,
  useChanges,
  usePendingApprovals,
  useChangeMutations,
  useOpsMetrics,
  useOpsTrends,
  useCapacityQuotas,
  useCapacityAlerts,
  useOpsOverview,
};
