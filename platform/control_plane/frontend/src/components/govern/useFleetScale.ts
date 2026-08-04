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

import { useMemo, useCallback } from 'react';
import { useAgentRegistry } from './useAgentRegistry';
import type { AgentRegistryEntry, GovernanceStatus, AgentProvider } from './mockData';
import type { AgentScopeLevel } from './autonomyLadder';
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
  if (agent.approvalState === 'rejected' || agent.approvalState === 'revoked') return 'blocked';
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

  return {
    loading: registry.loading,
    error: registry.error,
    source: registry.source,
    fleet,
    summary,
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

import { useState } from 'react';

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
