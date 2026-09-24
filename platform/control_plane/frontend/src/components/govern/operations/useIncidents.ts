/**
 * useIncidents - Hooks for incident management with live data
 *
 * Provides:
 * - useIncidents(filters) - List incidents with optional filters
 * - useIncidentDetail(id) - Get incident detail for drawer
 * - useIncidentMutations() - Create, update, and action mutations with optimistic updates
 * - useOpsMetrics() - MTTR, MTTA, and other operational KPIs
 *
 * All hooks gracefully fall back to mock data when the backend is unavailable.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  governOperationsApi,
  type Incident,
  type IncidentFilters,
  type IncidentSeverity,
  type IncidentStatus,
  type CreateIncidentRequest,
  type UpdateIncidentRequest,
  type AddTimelineEventRequest,
  type OperationsMetricsSummary,
} from '../../../api/client';

// Re-export types for convenience
export type { Incident, IncidentFilters, IncidentSeverity, IncidentStatus };

// ============================================================================
// Mock Data - Used as fallback when backend is unavailable
// ============================================================================

const RAW_MOCK_INCIDENTS: Incident[] = [
  {
    id: 'INC-2024-001',
    title: 'Critical latency spike in trading order execution',
    description: 'Trading order agent experiencing 5x latency increase. Orders taking 2.5s vs normal 500ms. Customer complaints increasing.',
    severity: 'Critical',
    status: 'Investigating',
    owner: 'John Smith',
    createdAt: '2024-08-11T08:15:00Z',
    updatedAt: '2024-08-11T09:30:00Z',
    acknowledgedAt: '2024-08-11T08:18:00Z',
    affectedAgents: ['trading-order-agent', 'market-data-agent'],
    relatedAlerts: ['ALT-4521', 'ALT-4523'],
    runbooksExecuted: ['RB-TRADING-001'],
    linkedAlertId: 'ALT-4521',
    timeline: [
      { id: 't1', timestamp: '2024-08-11T08:15:00Z', type: 'alert', actor: 'System', description: 'Alert triggered: Trading latency threshold exceeded' },
      { id: 't2', timestamp: '2024-08-11T08:16:00Z', type: 'status_change', actor: 'System', description: 'Incident auto-created from alert ALT-4521' },
      { id: 't3', timestamp: '2024-08-11T08:18:00Z', type: 'action', actor: 'John Smith', description: 'Incident acknowledged' },
      { id: 't4', timestamp: '2024-08-11T08:25:00Z', type: 'status_change', actor: 'John Smith', description: 'Status changed to Triaging' },
      { id: 't5', timestamp: '2024-08-11T08:45:00Z', type: 'action', actor: 'John Smith', description: 'Executed runbook RB-TRADING-001' },
      { id: 't6', timestamp: '2024-08-11T09:00:00Z', type: 'status_change', actor: 'John Smith', description: 'Status changed to Investigating' },
      { id: 't7', timestamp: '2024-08-11T09:15:00Z', type: 'comment', actor: 'Sarah Chen', description: 'Identified potential issue with market data feed connection pooling' },
    ],
    communicationLog: [
      { channel: 'pagerduty', timestamp: '2024-08-11T08:15:00Z', message: 'Page sent to on-call: Trading Operations' },
      { channel: 'slack', timestamp: '2024-08-11T08:20:00Z', message: 'Incident bridge opened in #trading-incidents' },
    ],
  },
  {
    id: 'INC-2024-002',
    title: 'KYC verification timeouts for new customer onboarding',
    description: 'KYC agent failing to complete verifications within SLA. 40% of requests timing out after 30s.',
    severity: 'High',
    status: 'Identified',
    owner: 'Sarah Chen',
    createdAt: '2024-08-11T07:00:00Z',
    updatedAt: '2024-08-11T10:00:00Z',
    acknowledgedAt: '2024-08-11T07:05:00Z',
    affectedAgents: ['kyc-verification-agent'],
    relatedAlerts: ['ALT-4518'],
    runbooksExecuted: ['RB-KYC-002', 'RB-KYC-003'],
    linkedAlertId: 'ALT-4518',
    timeline: [
      { id: 't1', timestamp: '2024-08-11T07:00:00Z', type: 'alert', actor: 'System', description: 'Alert triggered: KYC timeout rate exceeded 30%' },
      { id: 't2', timestamp: '2024-08-11T07:05:00Z', type: 'action', actor: 'Sarah Chen', description: 'Incident acknowledged' },
      { id: 't3', timestamp: '2024-08-11T08:00:00Z', type: 'status_change', actor: 'Sarah Chen', description: 'Status changed to Investigating' },
      { id: 't4', timestamp: '2024-08-11T09:30:00Z', type: 'comment', actor: 'Sarah Chen', description: 'Root cause identified: Third-party identity verification API rate limiting' },
      { id: 't5', timestamp: '2024-08-11T10:00:00Z', type: 'status_change', actor: 'Sarah Chen', description: 'Status changed to Identified' },
    ],
    communicationLog: [
      { channel: 'slack', timestamp: '2024-08-11T07:10:00Z', message: 'Customer ops team notified of potential delays' },
    ],
  },
  {
    id: 'INC-2024-003',
    title: 'Fraud detection false positive rate spike',
    description: 'Fraud agent blocking 15% of legitimate transactions vs baseline 2%. Customer complaints escalating.',
    severity: 'High',
    status: 'Monitoring',
    owner: 'Mike Johnson',
    createdAt: '2024-08-10T14:00:00Z',
    updatedAt: '2024-08-11T06:00:00Z',
    acknowledgedAt: '2024-08-10T14:10:00Z',
    affectedAgents: ['fraud-detection-agent', 'risk-assessment-agent'],
    relatedAlerts: ['ALT-4510', 'ALT-4512'],
    runbooksExecuted: ['RB-FRAUD-001'],
    timeline: [
      { id: 't1', timestamp: '2024-08-10T14:00:00Z', type: 'alert', actor: 'System', description: 'Alert triggered: Fraud false positive rate threshold exceeded' },
      { id: 't2', timestamp: '2024-08-10T14:10:00Z', type: 'action', actor: 'Mike Johnson', description: 'Incident acknowledged' },
      { id: 't3', timestamp: '2024-08-10T16:00:00Z', type: 'comment', actor: 'Mike Johnson', description: 'Model drift detected in fraud detection model' },
      { id: 't4', timestamp: '2024-08-10T18:00:00Z', type: 'action', actor: 'Mike Johnson', description: 'Rolled back to previous model version' },
      { id: 't5', timestamp: '2024-08-11T06:00:00Z', type: 'status_change', actor: 'Mike Johnson', description: 'Status changed to Monitoring - false positive rate normalizing' },
    ],
    communicationLog: [
      { channel: 'pagerduty', timestamp: '2024-08-10T14:00:00Z', message: 'Page sent to on-call: Fraud Operations' },
      { channel: 'slack', timestamp: '2024-08-10T14:15:00Z', message: 'Customer service team briefed on blocked transaction handling' },
      { channel: 'email', timestamp: '2024-08-10T15:00:00Z', message: 'Executive update sent on fraud detection issue' },
    ],
  },
  {
    id: 'INC-2024-004',
    title: 'AML screening backlog exceeding 4-hour SLA',
    description: 'AML agent processing queue backed up. 2,500 transactions pending review vs normal 200.',
    severity: 'Medium',
    status: 'Triaging',
    owner: 'Emily Davis',
    createdAt: '2024-08-11T10:00:00Z',
    updatedAt: '2024-08-11T10:30:00Z',
    acknowledgedAt: '2024-08-11T10:15:00Z',
    affectedAgents: ['aml-screening-agent'],
    relatedAlerts: ['ALT-4525'],
    runbooksExecuted: [],
    linkedAlertId: 'ALT-4525',
    timeline: [
      { id: 't1', timestamp: '2024-08-11T10:00:00Z', type: 'alert', actor: 'System', description: 'Alert triggered: AML queue depth exceeded threshold' },
      { id: 't2', timestamp: '2024-08-11T10:15:00Z', type: 'action', actor: 'Emily Davis', description: 'Incident acknowledged' },
      { id: 't3', timestamp: '2024-08-11T10:30:00Z', type: 'status_change', actor: 'Emily Davis', description: 'Status changed to Triaging' },
    ],
    communicationLog: [
      { channel: 'slack', timestamp: '2024-08-11T10:20:00Z', message: 'Compliance team notified of potential SLA breach' },
    ],
  },
  {
    id: 'INC-2024-005',
    title: 'Portfolio rebalancing agent making suboptimal allocations',
    description: 'Agent recommending allocations outside risk tolerance bands for 12% of portfolios.',
    severity: 'Medium',
    status: 'New',
    owner: 'Alex Kumar',
    createdAt: '2024-08-11T11:00:00Z',
    updatedAt: '2024-08-11T11:00:00Z',
    affectedAgents: ['portfolio-rebalance-agent', 'risk-assessment-agent'],
    relatedAlerts: ['ALT-4528'],
    runbooksExecuted: [],
    linkedAlertId: 'ALT-4528',
    timeline: [
      { id: 't1', timestamp: '2024-08-11T11:00:00Z', type: 'alert', actor: 'System', description: 'Alert triggered: Portfolio allocation drift detected' },
    ],
    communicationLog: [],
  },
  {
    id: 'INC-2024-006',
    title: 'Credit scoring model latency degradation',
    description: 'Credit scoring responses 3x slower than baseline. Impacting loan application processing.',
    severity: 'Medium',
    status: 'Investigating',
    owner: 'Rachel Wong',
    createdAt: '2024-08-11T09:00:00Z',
    updatedAt: '2024-08-11T10:45:00Z',
    acknowledgedAt: '2024-08-11T09:10:00Z',
    affectedAgents: ['credit-scoring-agent'],
    relatedAlerts: ['ALT-4520'],
    runbooksExecuted: ['RB-CREDIT-001'],
    timeline: [
      { id: 't1', timestamp: '2024-08-11T09:00:00Z', type: 'alert', actor: 'System', description: 'Alert triggered: Credit scoring latency threshold exceeded' },
      { id: 't2', timestamp: '2024-08-11T09:10:00Z', type: 'action', actor: 'Rachel Wong', description: 'Incident acknowledged' },
      { id: 't3', timestamp: '2024-08-11T09:30:00Z', type: 'status_change', actor: 'Rachel Wong', description: 'Status changed to Investigating' },
      { id: 't4', timestamp: '2024-08-11T10:00:00Z', type: 'action', actor: 'Rachel Wong', description: 'Executed runbook RB-CREDIT-001' },
    ],
    communicationLog: [
      { channel: 'slack', timestamp: '2024-08-11T09:15:00Z', message: 'Lending ops team notified of potential delays' },
    ],
  },
  {
    id: 'INC-2024-007',
    title: 'Customer service agent response quality degradation',
    description: 'Customer service agent showing 25% decrease in CSAT scores. Escalation rate up 40%.',
    severity: 'Low',
    status: 'Resolved',
    owner: 'John Smith',
    createdAt: '2024-08-09T14:00:00Z',
    updatedAt: '2024-08-10T10:00:00Z',
    acknowledgedAt: '2024-08-09T14:15:00Z',
    resolvedAt: '2024-08-10T10:00:00Z',
    affectedAgents: ['customer-service-agent'],
    relatedAlerts: ['ALT-4505'],
    runbooksExecuted: ['RB-CS-001'],
    postmortemId: 'PM-2024-003',
    timeline: [
      { id: 't1', timestamp: '2024-08-09T14:00:00Z', type: 'alert', actor: 'System', description: 'Alert triggered: CSAT score drop detected' },
      { id: 't2', timestamp: '2024-08-09T14:15:00Z', type: 'action', actor: 'John Smith', description: 'Incident acknowledged' },
      { id: 't3', timestamp: '2024-08-09T16:00:00Z', type: 'comment', actor: 'John Smith', description: 'Identified knowledge base update causing confusion' },
      { id: 't4', timestamp: '2024-08-09T18:00:00Z', type: 'action', actor: 'John Smith', description: 'Knowledge base rollback initiated' },
      { id: 't5', timestamp: '2024-08-10T10:00:00Z', type: 'status_change', actor: 'John Smith', description: 'Incident resolved - CSAT scores returning to normal' },
    ],
    communicationLog: [
      { channel: 'slack', timestamp: '2024-08-09T14:20:00Z', message: 'CS leadership briefed on quality issue' },
    ],
    resolutionNotes: 'Root cause was a recent knowledge base update that introduced conflicting information. Rolled back to previous version and scheduled review of update process.',
  },
  {
    id: 'INC-2024-008',
    title: 'Market data feed intermittent disconnections',
    description: 'Market data agent losing connection to primary feed every 5-10 minutes. Failover to backup working.',
    severity: 'Low',
    status: 'Resolved',
    owner: 'Sarah Chen',
    createdAt: '2024-08-08T09:00:00Z',
    updatedAt: '2024-08-08T15:00:00Z',
    acknowledgedAt: '2024-08-08T09:10:00Z',
    resolvedAt: '2024-08-08T15:00:00Z',
    affectedAgents: ['market-data-agent', 'trading-order-agent'],
    relatedAlerts: ['ALT-4490'],
    runbooksExecuted: ['RB-MARKET-001'],
    postmortemId: 'PM-2024-002',
    timeline: [
      { id: 't1', timestamp: '2024-08-08T09:00:00Z', type: 'alert', actor: 'System', description: 'Alert triggered: Market data feed disconnection' },
      { id: 't2', timestamp: '2024-08-08T09:10:00Z', type: 'action', actor: 'Sarah Chen', description: 'Incident acknowledged' },
      { id: 't3', timestamp: '2024-08-08T12:00:00Z', type: 'comment', actor: 'Sarah Chen', description: 'Network team identified firewall rule issue' },
      { id: 't4', timestamp: '2024-08-08T15:00:00Z', type: 'status_change', actor: 'Sarah Chen', description: 'Incident resolved - firewall rule corrected' },
    ],
    communicationLog: [
      { channel: 'slack', timestamp: '2024-08-08T09:15:00Z', message: 'Trading desk notified of potential data delays' },
    ],
    resolutionNotes: 'Firewall rule change during maintenance window caused intermittent drops. Rule reverted and change process updated.',
  },
  {
    id: 'INC-2024-009',
    title: 'Compliance monitor missing regulatory deadline alerts',
    description: 'Compliance agent failed to trigger alerts for 3 upcoming regulatory filing deadlines.',
    severity: 'High',
    status: 'New',
    owner: 'Emily Davis',
    createdAt: '2024-08-11T11:30:00Z',
    updatedAt: '2024-08-11T11:30:00Z',
    affectedAgents: ['compliance-monitor-agent'],
    relatedAlerts: ['ALT-4530'],
    runbooksExecuted: [],
    linkedAlertId: 'ALT-4530',
    timeline: [
      { id: 't1', timestamp: '2024-08-11T11:30:00Z', type: 'alert', actor: 'System', description: 'Alert triggered: Compliance deadline tracking gap detected' },
    ],
    communicationLog: [],
  },
  {
    id: 'INC-2024-010',
    title: 'Risk assessment model returning stale data',
    description: 'Risk agent using cached market data from 24 hours ago for VaR calculations.',
    severity: 'Critical',
    status: 'Triaging',
    owner: 'Alex Kumar',
    createdAt: '2024-08-11T11:45:00Z',
    updatedAt: '2024-08-11T12:00:00Z',
    acknowledgedAt: '2024-08-11T11:50:00Z',
    affectedAgents: ['risk-assessment-agent', 'portfolio-rebalance-agent'],
    relatedAlerts: ['ALT-4532'],
    runbooksExecuted: [],
    linkedAlertId: 'ALT-4532',
    timeline: [
      { id: 't1', timestamp: '2024-08-11T11:45:00Z', type: 'alert', actor: 'System', description: 'Alert triggered: Risk data staleness detected' },
      { id: 't2', timestamp: '2024-08-11T11:50:00Z', type: 'action', actor: 'Alex Kumar', description: 'Incident acknowledged' },
      { id: 't3', timestamp: '2024-08-11T12:00:00Z', type: 'status_change', actor: 'Alex Kumar', description: 'Status changed to Triaging' },
    ],
    communicationLog: [
      { channel: 'pagerduty', timestamp: '2024-08-11T11:45:00Z', message: 'Page sent to on-call: Risk Operations' },
      { channel: 'slack', timestamp: '2024-08-11T11:55:00Z', message: 'Trading halted for affected portfolios pending investigation' },
    ],
  },
];

/**
 * Reseed the mock incident timestamps relative to load time.
 *
 * The literals above use a fixed reference window (August 2024). Left as-is,
 * every "open" incident would render a ~2-year duration and the "This Month"
 * KPI would always be 0. We shift every timestamp forward by a fixed delta so
 * the most recent event lands a few minutes before "now", which keeps
 * durations and month-based counts plausible regardless of the current date.
 * The internal spacing between events (and therefore MTTR/MTTD) is preserved.
 */
function reseedIncidentDates(incidents: Incident[]): Incident[] {
  const timestamps: number[] = [];
  const collect = (iso?: string) => {
    if (!iso) return;
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) timestamps.push(t);
  };
  incidents.forEach(inc => {
    collect(inc.createdAt);
    collect(inc.updatedAt);
    collect(inc.acknowledgedAt);
    collect(inc.resolvedAt);
    inc.timeline.forEach(t => collect(t.timestamp));
    inc.communicationLog.forEach(c => collect(c.timestamp));
  });
  if (timestamps.length === 0) return incidents;

  // Anchor the newest event ~5 minutes in the past so nothing is future-dated.
  const shiftMs = Date.now() - Math.max(...timestamps) - 5 * 60_000;
  const shift = (iso: string): string => new Date(Date.parse(iso) + shiftMs).toISOString();
  const shiftOpt = (iso?: string): string | undefined => (iso ? shift(iso) : undefined);

  return incidents.map(inc => ({
    ...inc,
    createdAt: shift(inc.createdAt),
    updatedAt: shift(inc.updatedAt),
    acknowledgedAt: shiftOpt(inc.acknowledgedAt),
    resolvedAt: shiftOpt(inc.resolvedAt),
    timeline: inc.timeline.map(t => ({ ...t, timestamp: shift(t.timestamp) })),
    communicationLog: inc.communicationLog.map(c => ({ ...c, timestamp: shift(c.timestamp) })),
  }));
}

const MOCK_INCIDENTS: Incident[] = reseedIncidentDates(RAW_MOCK_INCIDENTS);

// ============================================================================
// useIncidents - List incidents with filters
// ============================================================================

export interface UseIncidentsResult {
  /** Loading state */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** List of incidents */
  incidents: Incident[];
  /** Total count (may differ from incidents.length if paginated) */
  total: number;
  /** Whether data is from live API */
  isLive: boolean;
  /** Data source description */
  source: string;
  /** Refresh data */
  refresh: () => void;
  /** Update incidents locally (for optimistic updates) */
  setIncidents: React.Dispatch<React.SetStateAction<Incident[]>>;
}

export function useIncidents(filters?: IncidentFilters, pollIntervalMs = 30_000): UseIncidentsResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Start empty: the operations incident store is real (and may be legitimately
  // empty), so we never seed with mock data that would render under a live badge.
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [source, setSource] = useState('operations');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    const fetchIncidents = async () => {
      // Don't show loading spinner on poll refresh
      if (refreshKey === 0) setLoading(true);

      // Adapt the component's IncidentFilters to the operations store's filter shape
      // (drop the 'all' sentinels; map affectedAgent → agentId).
      const opsFilters = filters
        ? {
            status: filters.status && filters.status !== 'all' ? filters.status : undefined,
            severity: filters.severity && filters.severity !== 'all' ? filters.severity : undefined,
            agentId: filters.affectedAgent,
          }
        : undefined;

      try {
        // Hit the REAL operations incident store (/govern/operations/incidents).
        // The store is empty-but-real, so a successful response may legitimately be
        // live + empty — that renders as an honest empty state, never mock.
        const response = await governOperationsApi.incidents(opsFilters);
        if (mounted) {
          setIncidents(response.incidents);
          setTotal(response.total);
          setIsLive(response.live);
          setSource(response.source);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          // Honest offline: the store is unreachable. Do NOT fall back to mock data
          // under a live-looking surface — surface an empty/offline state instead.
          console.warn('Failed to fetch incidents from operations store:', err);
          setIncidents([]);
          setTotal(0);
          setIsLive(false);
          setSource('offline (operations store unavailable)');
          setError(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchIncidents();

    // Set up polling
    const intervalId = setInterval(fetchIncidents, pollIntervalMs);
    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [filters, pollIntervalMs, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return {
    loading,
    error,
    incidents,
    total,
    isLive,
    source,
    refresh,
    setIncidents,
  };
}

// ============================================================================
// useIncidentDetail - Get single incident detail
// ============================================================================

export interface UseIncidentDetailResult {
  /** Loading state */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Incident detail (null if not found or loading) */
  incident: Incident | null;
  /** Whether data is from live API */
  isLive: boolean;
  /** Refresh data */
  refresh: () => void;
}

export function useIncidentDetail(id: string | null): UseIncidentDetailResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!id) {
      setIncident(null);
      setLoading(false);
      return;
    }

    let mounted = true;

    const fetchDetail = async () => {
      setLoading(true);

      try {
        const response = await governOperationsApi.incidentDetail(id);
        if (mounted) {
          setIncident(response.incident);
          setIsLive(response.live);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          // Honest failure — do not substitute a mock incident under a live surface.
          console.warn(`Failed to fetch incident ${id} from operations store:`, err);
          setIncident(null);
          setIsLive(false);
          setError(`Incident ${id} unavailable`);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchDetail();

    return () => { mounted = false; };
  }, [id, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return {
    loading,
    error,
    incident,
    isLive,
    refresh,
  };
}

// ============================================================================
// useIncidentMutations - Create, update, and action mutations
// ============================================================================

export interface UseIncidentMutationsResult {
  /** Creating incident in progress */
  creating: boolean;
  /** Updating incident in progress */
  updating: boolean;
  /** Error from last mutation */
  error: string | null;

  /** Create a new incident */
  createIncident: (req: CreateIncidentRequest) => Promise<Incident | null>;

  /** Update an existing incident */
  updateIncident: (id: string, req: UpdateIncidentRequest) => Promise<Incident | null>;

  /** Add a timeline event (comment, action) */
  addTimelineEvent: (id: string, req: AddTimelineEventRequest) => Promise<Incident | null>;

  /** Acknowledge an incident */
  acknowledge: (id: string) => Promise<Incident | null>;

  /** Escalate an incident */
  escalate: (id: string) => Promise<Incident | null>;

  /** Resolve an incident */
  resolve: (id: string, resolutionNotes?: string) => Promise<Incident | null>;

  /** Run a runbook */
  runRunbook: (id: string, runbookId: string) => Promise<Incident | null>;

  /** Create a postmortem */
  createPostmortem: (id: string) => Promise<Incident | null>;

  /** Clear error */
  clearError: () => void;
}

export function useIncidentMutations(
  /** Optional callback to update local incidents state for optimistic updates */
  onOptimisticUpdate?: (updater: (incidents: Incident[]) => Incident[]) => void
): UseIncidentMutationsResult {
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Counter for generating mock IDs
  const mockIdCounter = useRef(100);

  const clearError = useCallback(() => setError(null), []);

  // Helper to generate optimistic timeline entry
  const createTimelineEntry = (type: 'status_change' | 'comment' | 'action', description: string, actor = 'Current User') => ({
    id: `t${Date.now()}`,
    timestamp: new Date().toISOString(),
    type,
    actor,
    description,
  });

  const createIncident = useCallback(async (req: CreateIncidentRequest): Promise<Incident | null> => {
    setCreating(true);
    setError(null);

    // Optimistic update - create local incident immediately
    const optimisticIncident: Incident = {
      id: `INC-2024-${String(mockIdCounter.current++).padStart(3, '0')}`,
      title: req.title,
      description: req.description,
      severity: req.severity,
      status: 'New',
      owner: req.owner,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      affectedAgents: req.affectedAgents || [],
      relatedAlerts: req.linkedAlertId ? [req.linkedAlertId] : [],
      runbooksExecuted: [],
      linkedAlertId: req.linkedAlertId,
      timeline: [createTimelineEntry('status_change', 'Incident created')],
      communicationLog: [],
    };

    if (onOptimisticUpdate) {
      onOptimisticUpdate(incidents => [optimisticIncident, ...incidents]);
    }

    try {
      // camelCase CreateIncidentRequest → snake_case IncidentCreateRequest for the ops store.
      const response = await governOperationsApi.createIncident({
        title: req.title,
        description: req.description,
        severity: req.severity,
        owner: req.owner,
        affected_agents: req.affectedAgents,
        linked_alert_id: req.linkedAlertId,
      });
      if (response.success) {
        // Update with real incident data
        if (onOptimisticUpdate) {
          onOptimisticUpdate(incidents =>
            incidents.map(i => i.id === optimisticIncident.id ? response.incident : i)
          );
        }
        return response.incident;
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      // Keep the optimistic update since API failed - user can still work with it
      console.warn('Failed to create incident via API, keeping local version:', err);
      return optimisticIncident;
    } finally {
      setCreating(false);
    }
  }, [onOptimisticUpdate]);

  const updateIncident = useCallback(async (id: string, req: UpdateIncidentRequest): Promise<Incident | null> => {
    setUpdating(true);
    setError(null);

    // Optimistic update
    if (onOptimisticUpdate) {
      onOptimisticUpdate(incidents =>
        incidents.map(inc => {
          if (inc.id !== id) return inc;
          const now = new Date().toISOString();
          const updates: Partial<Incident> = {
            ...req,
            updatedAt: now,
          };
          if (req.status === 'Resolved') {
            updates.resolvedAt = now;
          }
          const newTimeline = [...inc.timeline];
          if (req.status) {
            newTimeline.push(createTimelineEntry('status_change', `Status changed to ${req.status}`));
          }
          return { ...inc, ...updates, timeline: newTimeline };
        })
      );
    }

    try {
      // camelCase UpdateIncidentRequest → snake_case IncidentUpdateRequest for the ops store.
      const response = await governOperationsApi.updateIncident(id, {
        status: req.status,
        severity: req.severity,
        owner: req.owner,
        resolution_notes: req.resolutionNotes,
      });
      if (response.success) {
        if (onOptimisticUpdate) {
          onOptimisticUpdate(incidents =>
            incidents.map(i => i.id === id ? response.incident : i)
          );
        }
        return response.incident;
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      console.warn('Failed to update incident via API, keeping local version:', err);
      return null;
    } finally {
      setUpdating(false);
    }
  }, [onOptimisticUpdate]);

  const addTimelineEvent = useCallback(async (id: string, req: AddTimelineEventRequest): Promise<Incident | null> => {
    setUpdating(true);
    setError(null);

    // Optimistic update
    if (onOptimisticUpdate) {
      onOptimisticUpdate(incidents =>
        incidents.map(inc => {
          if (inc.id !== id) return inc;
          const now = new Date().toISOString();
          return {
            ...inc,
            updatedAt: now,
            timeline: [...inc.timeline, createTimelineEntry(req.type, req.description, req.actor)],
          };
        })
      );
    }

    try {
      // AddTimelineEventRequest and the ops TimelineEventRequest are structurally identical.
      const response = await governOperationsApi.addTimelineEvent(id, req);
      if (response.success) {
        if (onOptimisticUpdate) {
          onOptimisticUpdate(incidents =>
            incidents.map(i => i.id === id ? response.incident : i)
          );
        }
        return response.incident;
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      console.warn('Failed to add timeline event via API, keeping local version:', err);
      return null;
    } finally {
      setUpdating(false);
    }
  }, [onOptimisticUpdate]);

  const acknowledge = useCallback(async (id: string): Promise<Incident | null> => {
    setUpdating(true);
    setError(null);

    const now = new Date().toISOString();

    // Optimistic update
    if (onOptimisticUpdate) {
      onOptimisticUpdate(incidents =>
        incidents.map(inc => {
          if (inc.id !== id) return inc;
          return {
            ...inc,
            acknowledgedAt: now,
            updatedAt: now,
            timeline: [...inc.timeline, createTimelineEntry('action', 'Incident acknowledged')],
          };
        })
      );
    }

    try {
      // No dedicated acknowledge route on the operations store — persist a real
      // timeline event. The store does not track acknowledgedAt, so keep the
      // optimistic local field rather than overwriting the incident with the response.
      const response = await governOperationsApi.addTimelineEvent(id, {
        type: 'action',
        description: 'Incident acknowledged',
      });
      return response.incident;
    } catch (err) {
      console.warn('Failed to persist acknowledge to operations store, keeping local version:', err);
      return null;
    } finally {
      setUpdating(false);
    }
  }, [onOptimisticUpdate]);

  const escalate = useCallback(async (id: string): Promise<Incident | null> => {
    setUpdating(true);
    setError(null);

    // Optimistic update - bump severity
    if (onOptimisticUpdate) {
      onOptimisticUpdate(incidents =>
        incidents.map(inc => {
          if (inc.id !== id) return inc;
          const now = new Date().toISOString();
          const newSeverity: IncidentSeverity =
            inc.severity === 'Low' ? 'Medium' :
            inc.severity === 'Medium' ? 'High' : 'Critical';
          return {
            ...inc,
            severity: newSeverity,
            updatedAt: now,
            timeline: [...inc.timeline, createTimelineEntry('status_change', `Incident escalated to ${newSeverity}`)],
          };
        })
      );
    }

    try {
      // No dedicated escalate route — persist a real timeline event and keep the
      // optimistic severity bump locally (the store's response won't carry it).
      const response = await governOperationsApi.addTimelineEvent(id, {
        type: 'action',
        description: 'Incident escalated',
      });
      return response.incident;
    } catch (err) {
      console.warn('Failed to persist escalation to operations store, keeping local version:', err);
      return null;
    } finally {
      setUpdating(false);
    }
  }, [onOptimisticUpdate]);

  const resolve = useCallback(async (id: string, resolutionNotes?: string): Promise<Incident | null> => {
    setUpdating(true);
    setError(null);

    const now = new Date().toISOString();

    // Optimistic update
    if (onOptimisticUpdate) {
      onOptimisticUpdate(incidents =>
        incidents.map(inc => {
          if (inc.id !== id) return inc;
          return {
            ...inc,
            status: 'Resolved' as IncidentStatus,
            resolvedAt: now,
            updatedAt: now,
            resolutionNotes,
            timeline: [...inc.timeline, createTimelineEntry('status_change', 'Incident resolved')],
          };
        })
      );
    }

    try {
      // Resolve maps cleanly to the ops update route (status + resolution notes),
      // which the store persists authoritatively — so overwrite local with response.
      const response = await governOperationsApi.updateIncident(id, {
        status: 'Resolved',
        resolution_notes: resolutionNotes,
      });
      if (response.success) {
        if (onOptimisticUpdate) {
          onOptimisticUpdate(incidents =>
            incidents.map(i => i.id === id ? response.incident : i)
          );
        }
        return response.incident;
      } else {
        throw new Error(response.message);
      }
    } catch (err) {
      console.warn('Failed to resolve incident via operations store, keeping local version:', err);
      return null;
    } finally {
      setUpdating(false);
    }
  }, [onOptimisticUpdate]);

  const runRunbook = useCallback(async (id: string, runbookId: string): Promise<Incident | null> => {
    setUpdating(true);
    setError(null);

    // Optimistic update
    if (onOptimisticUpdate) {
      onOptimisticUpdate(incidents =>
        incidents.map(inc => {
          if (inc.id !== id) return inc;
          const now = new Date().toISOString();
          return {
            ...inc,
            updatedAt: now,
            runbooksExecuted: [...inc.runbooksExecuted, runbookId],
            timeline: [...inc.timeline, createTimelineEntry('action', `Executed runbook ${runbookId}`)],
          };
        })
      );
    }

    try {
      // No dedicated runbook route — persist a real timeline event; keep the
      // optimistic runbooksExecuted entry locally.
      const response = await governOperationsApi.addTimelineEvent(id, {
        type: 'action',
        description: `Executed runbook ${runbookId}`,
      });
      return response.incident;
    } catch (err) {
      console.warn('Failed to persist runbook execution to operations store, keeping local version:', err);
      return null;
    } finally {
      setUpdating(false);
    }
  }, [onOptimisticUpdate]);

  const createPostmortem = useCallback(async (id: string): Promise<Incident | null> => {
    setUpdating(true);
    setError(null);

    // Optimistic update
    if (onOptimisticUpdate) {
      onOptimisticUpdate(incidents =>
        incidents.map(inc => {
          if (inc.id !== id) return inc;
          const now = new Date().toISOString();
          const pmId = `PM-2024-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
          return {
            ...inc,
            postmortemId: pmId,
            updatedAt: now,
            timeline: [...inc.timeline, createTimelineEntry('action', `Postmortem ${pmId} created`)],
          };
        })
      );
    }

    try {
      // No dedicated postmortem route — persist a real timeline event; keep the
      // optimistic postmortemId locally.
      const response = await governOperationsApi.addTimelineEvent(id, {
        type: 'action',
        description: 'Postmortem created',
      });
      return response.incident;
    } catch (err) {
      console.warn('Failed to persist postmortem to operations store, keeping local version:', err);
      return null;
    } finally {
      setUpdating(false);
    }
  }, [onOptimisticUpdate]);

  return {
    creating,
    updating,
    error,
    createIncident,
    updateIncident,
    addTimelineEvent,
    acknowledge,
    escalate,
    resolve,
    runRunbook,
    createPostmortem,
    clearError,
  };
}

// ============================================================================
// useOpsMetrics - MTTR, MTTA, and operational KPIs
// ============================================================================

export interface UseOpsMetricsResult {
  /** Loading state */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Operations metrics */
  metrics: {
    /** Formatted MTTR (e.g., "2.5h"). "—" when no incident has been resolved. */
    mttr: string;
    /**
     * Formatted MTTA - mean time to ACKNOWLEDGE (acknowledgedAt - createdAt).
     * This is not MTTD: nothing here measures detection latency. "—" when no
     * incident has been acknowledged.
     */
    mtta: string;
    openIncidents: number;
    bySeverity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    thisMonth: number;
    postmortemsPending: number;
  };
  /** True when MTTR came from the live operations metrics endpoint */
  isLive: boolean;
  /** Refresh data */
  refresh: () => void;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

export function useOpsMetrics(incidents?: Incident[], pollIntervalMs = 60_000): UseOpsMetricsResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiSummary, setApiSummary] = useState<OperationsMetricsSummary | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch from API. This targets the registered operations router
  // (/govern/operations/metrics/summary); the old /govern/incidents/metrics
  // path had no backend route, so this hook could never be live.
  useEffect(() => {
    let mounted = true;

    const fetchMetrics = async () => {
      if (refreshKey === 0) setLoading(true);

      try {
        const response = await governOperationsApi.opsMetrics();
        if (mounted) {
          // Only adopt the API summary when it says it is live; a non-live
          // (empty store) summary would otherwise overwrite the locally
          // computed values with zeros.
          const live = Boolean(response?.live);
          setApiSummary(live ? response.summary : null);
          setIsLive(live);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setApiSummary(null);
          setIsLive(false);
          // Don't set error - we'll compute from local incidents
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchMetrics();

    const intervalId = setInterval(fetchMetrics, pollIntervalMs);
    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [pollIntervalMs, refreshKey]);

  // Compute metrics. Open counts, severity split, this-month volume and
  // postmortems have no equivalent on the operations summary endpoint, so they
  // always come from the incident list; MTTR prefers the live summary.
  const metrics = useMemo(() => {
    const incidentsToUse = incidents || MOCK_INCIDENTS;
    const open = incidentsToUse.filter(i => i.status !== 'Resolved');
    const resolved = incidentsToUse.filter(i => i.status === 'Resolved');
    const thisMonth = incidentsToUse.filter(i => {
      const created = new Date(i.createdAt);
      const now = new Date();
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    });

    // MTTR - mean time to resolve. Null when nothing has been resolved.
    const resolvedWithTime = resolved.filter(i => i.resolvedAt);
    const localMttrMinutes = resolvedWithTime.length > 0
      ? resolvedWithTime.reduce(
          (acc, i) => acc + (new Date(i.resolvedAt as string).getTime() - new Date(i.createdAt).getTime()) / (1000 * 60),
          0,
        ) / resolvedWithTime.length
      : null;

    // MTTA - mean time to ACKNOWLEDGE (acknowledgedAt - createdAt). This is a
    // response-latency metric, not detection latency, so it must not be labelled
    // MTTD. Null when no incident has been acknowledged.
    const acknowledgedIncidents = incidentsToUse.filter(i => i.acknowledgedAt);
    const mttaMinutes = acknowledgedIncidents.length > 0
      ? acknowledgedIncidents.reduce(
          (acc, i) => acc + (new Date(i.acknowledgedAt as string).getTime() - new Date(i.createdAt).getTime()) / (1000 * 60),
          0,
        ) / acknowledgedIncidents.length
      : null;

    const postmortemsPending = resolved.filter(i => !i.postmortemId).length;

    // Prefer the live operations summary for MTTR; fall back to the local
    // computation when the summary is not live.
    const mttrMinutes = apiSummary ? apiSummary.mttr_minutes : localMttrMinutes;

    return {
      mttr: mttrMinutes === null ? '—' : formatMinutes(mttrMinutes),
      mtta: mttaMinutes === null ? '—' : formatMinutes(mttaMinutes),
      openIncidents: open.length,
      bySeverity: {
        critical: open.filter(i => i.severity === 'Critical').length,
        high: open.filter(i => i.severity === 'High').length,
        medium: open.filter(i => i.severity === 'Medium').length,
        low: open.filter(i => i.severity === 'Low').length,
      },
      thisMonth: thisMonth.length,
      postmortemsPending,
    };
  }, [apiSummary, incidents]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return {
    loading,
    error,
    metrics,
    isLive,
    refresh,
  };
}

export default {
  useIncidents,
  useIncidentDetail,
  useIncidentMutations,
  useOpsMetrics,
};
