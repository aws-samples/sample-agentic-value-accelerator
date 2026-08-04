/**
 * useAgentPolicies — Govern-side read model over the Secure AgentCore Cedar policies.
 *
 * The Secure module (/secure/policy) authors and deploys Cedar policies via
 * policiesApi. Govern does NOT author — it observes. This hook fetches the
 * agent-scoped policies and exposes a lookup keyed by an agent's id (which maps
 * to a policy's `resource_id`), so the Agent Registry can show real governance
 * posture: which agents have an active policy, how many rules enforce it, and
 * how often it has fired.
 *
 * Live data: GET /api/v1/policies?resource_type=agent (via policiesApi.list).
 * Degrades gracefully to an empty map when the backend is unavailable.
 */

import { useState, useEffect, useCallback } from 'react';
import { policiesApi } from '../../api/client';
import type { PolicyRecord } from '../../api/client';
import { DEMO_AGENT_POLICIES } from './mockData';

export interface AgentPolicySummary {
  policyId: string;
  name: string;
  status: PolicyRecord['status'];
  rulesCount: number;
  blockingRules: number;
  triggeredCount: number;
  lastTriggered: string | null;
}

/** Where the policy data came from: real backend, demo fallback, or nothing reachable. */
export type PolicySource = 'live' | 'demo' | 'none';

export interface AgentPoliciesResult {
  loading: boolean;
  /** true once a fetch has resolved (success or failure) — lets the UI distinguish "loading" from "backend offline". */
  loaded: boolean;
  error: string | null;
  /** 'live' = real Secure policies; 'demo' = illustrative fallback; 'none' = backend unreachable. */
  source: PolicySource;
  /** resource_id → best (active-preferred) policy summary for that agent. */
  byResourceId: Record<string, AgentPolicySummary>;
  /** Count of agent-scoped policies in the active data set. */
  total: number;
  refresh: () => void;
}

function demoMap(): Record<string, AgentPolicySummary> {
  const map: Record<string, AgentPolicySummary> = {};
  for (const p of DEMO_AGENT_POLICIES) {
    map[p.resourceId] = {
      policyId: p.policyId,
      name: p.name,
      status: p.status,
      rulesCount: p.rulesCount,
      blockingRules: p.blockingRules,
      triggeredCount: p.triggeredCount,
      lastTriggered: p.lastTriggered,
    };
  }
  return map;
}

export function useAgentPolicies(): AgentPoliciesResult {
  const [byResourceId, setByResourceId] = useState<Record<string, AgentPolicySummary>>({});
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<PolicySource>('none');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await policiesApi.list(undefined, 'agent');
      const map: Record<string, AgentPolicySummary> = {};
      for (const r of records) {
        if (!r.resource_id) continue; // unscoped policy applies to all — not an agent-specific binding
        const summary: AgentPolicySummary = {
          policyId: r.policy_id,
          name: r.name,
          status: r.status,
          rulesCount: r.rules_count,
          blockingRules: r.blocking_rules,
          triggeredCount: r.triggered_count,
          lastTriggered: r.last_triggered,
        };
        // Prefer an active policy if multiple target the same resource.
        const existing = map[r.resource_id];
        if (!existing || (existing.status !== 'active' && r.status === 'active')) {
          map[r.resource_id] = summary;
        }
      }
      if (Object.keys(map).length > 0) {
        // Real agent-scoped policies exist — use them.
        setByResourceId(map);
        setTotal(records.length);
        setSource('live');
      } else {
        // Backend reachable but no agent policies bound yet — fall back to demo data
        // so the oversight UI is demonstrable, clearly flagged as 'demo'.
        const demo = demoMap();
        setByResourceId(demo);
        setTotal(Object.keys(demo).length);
        setSource('demo');
      }
    } catch {
      // Backend unavailable — fall back to demo data, flagged as such, rather than
      // showing every agent as an (incorrect) governance gap.
      const demo = demoMap();
      setByResourceId(demo);
      setTotal(Object.keys(demo).length);
      setSource('demo');
      setError('Policy service unavailable — showing demo policies');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies, refreshKey]);

  return {
    loading,
    loaded,
    error,
    source,
    byResourceId,
    total,
    refresh: () => setRefreshKey(k => k + 1),
  };
}

export default useAgentPolicies;
