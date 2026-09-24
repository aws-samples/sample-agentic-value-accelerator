/**
 * useFleetScale — Adapts real agent registry data to the fleet-scale view.
 *
 * Bridges useAgentRegistry → fleetScaleData aggregation functions, allowing
 * FleetScaleView to render real data with the same summary-first, bounded-queue
 * pattern designed for 10k+ agents.
 *
 * Usage:
 *   const { fleet, summary, segments, queue, loading } = useFleetScale();
 *   // Pass to FleetScaleView or render directly
 */

import { useMemo, useCallback, useEffect, useState } from 'react';
import { useAgentRegistry } from './useAgentRegistry';
import type { AgentRegistryEntry, GovernanceStatus, AgentProvider } from './mockData';
import type { AgentScopeLevel } from './autonomyLadder';
import {
  governFleetApi,
  type FleetSummaryResponse,
  type FleetSegmentsResponse,
  type FleetExceptionsResponse,
  type FleetInventoryResponse,
  type AwsRegionProvenance,
} from '../../api/client';
import {
  type ScaleAgent,
  type FleetSummary,
  type SegmentRow,
  summarize,
  segmentBy,
  exceptionQueue,
  inventoryBy,
  type InventoryRow,
} from './fleetScaleData';

/**
 * Convert an AgentRegistryEntry to a ScaleAgent for aggregation.
 * ScaleAgent is the minimal shape needed by the scale-view aggregation functions.
 */
function toScaleAgent(agent: AgentRegistryEntry): ScaleAgent {
  const governanceStatus: GovernanceStatus = agent.governanceStatus ?? deriveGovernanceStatus(agent);
  const riskScore = agent.riskScore ?? deriveRiskScore(agent);

  return {
    id: agent.id,
    name: agent.name,
    businessUnit: agent.owner,
    environment: statusToEnvironment(agent.status),
    provider: agent.provider ?? 'aws',
    scopeLevel: agent.scopeLevel,
    status: agent.status,
    governanceStatus,
    riskScore,
    openIncidents: agent.incidents.openCount,
    hasPolicy: !!agent.guardrailId,
    model: agent.model,
  };
}

function statusToEnvironment(status: AgentRegistryEntry['status']): 'prod' | 'pilot' | 'dev' {
  switch (status) {
    case 'production': return 'prod';
    case 'pilot': return 'pilot';
    default: return 'dev';
  }
}

function deriveGovernanceStatus(agent: AgentRegistryEntry): GovernanceStatus {
  if (agent.approvalState === 'pending') return 'review_needed';
  if (agent.incidents.openCount > 0) return 'review_needed';
  if (!agent.guardrailId && agent.scopeLevel >= 3) return 'review_needed';
  return 'compliant';
}

function deriveRiskScore(agent: AgentRegistryEntry): number {
  let score = 0;
  score += (agent.scopeLevel - 1) * 16;
  score += agent.status === 'production' ? 18 : agent.status === 'pilot' ? 8 : 0;
  score += agent.incidents.openCount * 14;
  score += agent.guardrailId ? 0 : 16;
  score += agent.securityClassification === 'restricted' ? 12 : agent.securityClassification === 'confidential' ? 6 : 0;
  return Math.min(100, score);
}

export interface UseFleetScaleResult {
  loading: boolean;
  error: string | null;
  source: 'live' | 'demo' | 'mixed';
  fleet: ScaleAgent[];
  summary: FleetSummary;
  /**
   * Live-only fleet (registry `liveAgents`, i.e. no demo agents) and its rollup.
   * A view badged "Live" must aggregate over these, otherwise demo agents inflate
   * the heatmap / % compliant under a Live badge.
   */
  liveFleet: ScaleAgent[];
  liveSummary: FleetSummary;
  refresh: () => void;
}

export function useFleetScale(): UseFleetScaleResult {
  const registry = useAgentRegistry();

  const fleet = useMemo<ScaleAgent[]>(
    () => registry.agents.map(toScaleAgent),
    [registry.agents],
  );

  const summary = useMemo<FleetSummary>(
    () => summarize(fleet),
    [fleet],
  );

  const liveFleet = useMemo<ScaleAgent[]>(
    () => registry.liveAgents.map(toScaleAgent),
    [registry.liveAgents],
  );

  const liveSummary = useMemo<FleetSummary>(
    () => summarize(liveFleet),
    [liveFleet],
  );

  return {
    loading: registry.loading,
    error: registry.error,
    source: registry.source,
    fleet,
    summary,
    liveFleet,
    liveSummary,
    refresh: registry.refresh,
  };
}

export interface UseFleetScaleAggregatedResult extends UseFleetScaleResult {
  groupBy: 'businessUnit' | 'provider' | 'environment';
  setGroupBy: (g: 'businessUnit' | 'provider' | 'environment') => void;
  segments: SegmentRow[];
  queue: ScaleAgent[];
  filterKey: string | null;
  setFilterKey: (k: string | null) => void;
  byModel: InventoryRow[];
  byProvider: InventoryRow[];
}

export function useFleetScaleAggregated(queueLimit = 100): UseFleetScaleAggregatedResult {
  const base = useFleetScale();
  const [groupBy, setGroupBy] = useState<'businessUnit' | 'provider' | 'environment'>('businessUnit');
  const [filterKey, setFilterKey] = useState<string | null>(null);

  const keyOf = useCallback(
    (a: ScaleAgent) =>
      groupBy === 'businessUnit' ? a.businessUnit : groupBy === 'provider' ? a.provider : a.environment,
    [groupBy],
  );

  const segments = useMemo(() => segmentBy(base.fleet, keyOf), [base.fleet, keyOf]);

  const queue = useMemo(() => {
    const pool = filterKey ? base.fleet.filter(a => keyOf(a) === filterKey) : base.fleet;
    return exceptionQueue(pool, queueLimit);
  }, [base.fleet, filterKey, keyOf, queueLimit]);

  const byModel = useMemo(() => inventoryBy(base.fleet, a => a.model), [base.fleet]);
  const byProvider = useMemo(() => inventoryBy(base.fleet, a => a.provider), [base.fleet]);

  return {
    ...base,
    groupBy,
    setGroupBy: (g) => { setGroupBy(g); setFilterKey(null); },
    segments,
    queue,
    filterKey,
    setFilterKey,
    byModel,
    byProvider,
  };
}

export { toScaleAgent };

// ─────────────────────── Server-side fleet-scale aggregation ───────────────────────
// The purpose-built /api/v1/govern/fleet/{summary,segments,exceptions,inventory}
// endpoints pre-compute the same rollups client-side aggregation produces, but on
// the server for 10k+ agents. Each block is gated on its response `.live`; when a
// block is not live it is returned null so the caller falls back to client-side
// aggregation (graceful mock fallback, never a crash).

/** Map the server FleetSummary response to the client-side FleetSummary shape. */
function toClientSummary(r: FleetSummaryResponse): FleetSummary {
  const s = r.summary;
  return {
    total: s.total,
    governance: {
      compliant: s.governance.compliant,
      review_needed: s.governance.review_needed,
      blocked: s.governance.blocked,
      unknown: s.governance.unknown,
    },
    risk: { critical: s.risk.critical, high: s.risk.high, medium: s.risk.medium, low: s.risk.low },
    scope: { 1: s.scope['1'], 2: s.scope['2'], 3: s.scope['3'], 4: s.scope['4'] },
    prodFullAgency: s.prod_full_agency,
    openIncidents: s.open_incidents,
    unprotected: s.unprotected,
    needsAttention: s.needs_attention,
    monthlyCostEstimate: 0,
    pctCompliant: s.pct_compliant,
  };
}

/** Map the server segments response to client-side SegmentRow[]. */
function toClientSegments(r: FleetSegmentsResponse): SegmentRow[] {
  return r.segments.map((s): SegmentRow => ({
    key: s.key,
    total: s.total,
    compliant: s.compliant,
    reviewNeeded: s.review_needed,
    blocked: s.blocked,
    critical: s.critical,
    high: s.high,
    pctCompliant: s.pct_compliant,
  }));
}

/** Map the server exception queue to client-side ScaleAgent[]. */
function toClientQueue(r: FleetExceptionsResponse): ScaleAgent[] {
  return r.queue.map((e): ScaleAgent => ({
    id: e.id,
    name: e.name,
    businessUnit: e.business_unit,
    environment: e.environment,
    provider: e.provider as AgentProvider,
    scopeLevel: e.scope_level as AgentScopeLevel,
    status: e.environment === 'prod' ? 'production' : e.environment === 'pilot' ? 'pilot' : 'development',
    governanceStatus: e.governance_status as GovernanceStatus,
    riskScore: e.risk_score,
    openIncidents: e.open_incidents,
    hasPolicy: e.has_policy,
    // The exceptions endpoint does not carry model; it is unused in the queue view.
    model: '',
  }));
}

/** Map a server inventory rows array to client-side InventoryRow[]. */
function toClientInventory(rows: FleetInventoryResponse['by_model']): InventoryRow[] {
  return rows.map(r => ({ key: r.key, count: r.count, pctOfFleet: r.pct_of_fleet }));
}

export interface UseFleetScaleServerOptions {
  enabled: boolean;
  groupBy: 'businessUnit' | 'provider' | 'environment';
  filterKey: string | null;
}

export interface UseFleetScaleServerResult {
  loading: boolean;
  live: boolean;
  note: string | null;
  /**
   * Which governed regions the summary rollup actually covers. A region that did not
   * answer is dropped from the fan-out rather than failing the request, so `total`
   * can be a floor; this is what says so. Null means the response carried no
   * provenance block, i.e. single-region by construction.
   */
  regions: AwsRegionProvenance | null;
  summary: FleetSummary | null;
  segments: SegmentRow[] | null;
  queue: ScaleAgent[] | null;
  byModel: InventoryRow[] | null;
  byProvider: InventoryRow[] | null;
  refresh: () => void;
  /**
   * Provenance for the other three rollups, kept separate from `regions` on purpose.
   * These are four independent fan-outs issued concurrently, so they can disagree: a
   * region can answer the summary call and fail the segments call. Sharing one
   * provenance block would put the summary's coverage on the segment table, which is
   * exactly the kind of borrowed-provenance claim these badges exist to prevent.
   *
   * `segmentRegions` has no badge mounted yet, and that is not an oversight:
   * FleetScaleView derives its segment heatmap client-side from `fleet` and ignores
   * this hook's `segments`. Badging the heatmap with server-segment coverage would
   * describe a fan-out the rendered cells did not come from. It is here so a caller
   * that does render `segments` has the provenance to go with it.
   */
  segmentRegions: AwsRegionProvenance | null;
  queueRegions: AwsRegionProvenance | null;
  inventoryRegions: AwsRegionProvenance | null;
}

/**
 * useFleetScaleServer — fetches the purpose-built server-side fleet-scale
 * aggregations (summary / segments / exceptions / inventory), each gated on its
 * response `.live`. When `enabled` is false (synthetic mode) no request is made.
 */
export function useFleetScaleServer(
  { enabled, groupBy, filterKey }: UseFleetScaleServerOptions,
): UseFleetScaleServerResult {
  const [loading, setLoading] = useState(enabled);
  const [live, setLive] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [regions, setRegions] = useState<AwsRegionProvenance | null>(null);
  const [segmentRegions, setSegmentRegions] = useState<AwsRegionProvenance | null>(null);
  const [queueRegions, setQueueRegions] = useState<AwsRegionProvenance | null>(null);
  const [inventoryRegions, setInventoryRegions] = useState<AwsRegionProvenance | null>(null);
  const [summary, setSummary] = useState<FleetSummary | null>(null);
  const [segments, setSegments] = useState<SegmentRow[] | null>(null);
  const [queue, setQueue] = useState<ScaleAgent[] | null>(null);
  const [byModel, setByModel] = useState<InventoryRow[] | null>(null);
  const [byProvider, setByProvider] = useState<InventoryRow[] | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setLive(false);
      setNote(null);
      setRegions(null);
      setSegmentRegions(null);
      setQueueRegions(null);
      setInventoryRegions(null);
      setSummary(null);
      setSegments(null);
      setQueue(null);
      setByModel(null);
      setByProvider(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [summaryRes, segmentsRes, exceptionsRes, inventoryRes] = await Promise.all([
        governFleetApi.summary().catch(() => null),
        governFleetApi.segments(groupBy).catch(() => null),
        governFleetApi.exceptions(100, filterKey ?? undefined).catch(() => null),
        governFleetApi.inventory().catch(() => null),
      ]);
      if (cancelled) return;
      setSummary(summaryRes?.live ? toClientSummary(summaryRes) : null);
      setSegments(segmentsRes?.live ? toClientSegments(segmentsRes) : null);
      setQueue(exceptionsRes?.live ? toClientQueue(exceptionsRes) : null);
      if (inventoryRes?.live) {
        setByModel(toClientInventory(inventoryRes.by_model));
        setByProvider(toClientInventory(inventoryRes.by_provider));
      } else {
        setByModel(null);
        setByProvider(null);
      }
      setLive(!!summaryRes?.live);
      setNote(summaryRes?.note ?? null);
      setRegions(summaryRes?.regions ?? null);
      // Each rollup carries its own provenance; a rollup that did not come back live
      // has no coverage to claim, so it reads null rather than borrowing the summary's.
      setSegmentRegions(segmentsRes?.live ? segmentsRes.regions ?? null : null);
      setQueueRegions(exceptionsRes?.live ? exceptionsRes.regions ?? null : null);
      setInventoryRegions(inventoryRes?.live ? inventoryRes.regions ?? null : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [enabled, groupBy, filterKey, nonce]);

  const refresh = useCallback(() => setNonce(n => n + 1), []);

  return {
    loading, live, note, regions, summary, segments, queue, byModel, byProvider, refresh,
    segmentRegions, queueRegions, inventoryRegions,
  };
}
