/**
 * useDataLineage — Build data lineage from live AWS data
 *
 * Sources:
 * 1. CloudTrail AI callers (who initiated)
 * 2. Invocation logs (what was called, input→output flow)
 * 3. Guardrails (protection stage)
 * 4. Deployments/templates (agent config)
 *
 * Constructs lineage flows showing: Caller → Agent → Guardrail → Model → Response
 */

import { useState, useEffect, useMemo } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export interface LineageNode {
  id: string;
  type: 'caller' | 'agent' | 'guardrail' | 'model' | 'output';
  label: string;
  detail: string;
  status: 'active' | 'warning' | 'error';
  live: boolean;
}

export interface LineageFlow {
  id: string;
  name: string;
  description: string;
  nodes: LineageNode[];
  totalInvocations: number;
  lastActivity: string;
  hasGuardrail: boolean;
}

export interface LineageStats {
  totalFlows: number;
  totalInvocations: number;
  protectedFlows: number;
  unprotectedFlows: number;
  callers: number;
  models: number;
}

export interface DataLineageResult {
  loading: boolean;
  error: string | null;
  flows: LineageFlow[];
  stats: LineageStats;
  liveSourcesCount: number;
  refresh: () => void;
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useDataLineage(): DataLineageResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [rawData, setRawData] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchAll = async () => {
      try {
        const [callersRes, invocationsRes, guardrailsRes, deploymentsRes] = await Promise.allSettled([
          fetchJson(`${API_BASE}/api/v1/govern/trail/ai-callers`),
          fetchJson(`${API_BASE}/api/v1/govern/invocation-safety/telemetry`),
          fetchJson(`${API_BASE}/api/v1/guardrails`),
          fetchJson(`${API_BASE}/api/v1/deployments`),
        ]);

        if (!cancelled) {
          setRawData({
            callers: callersRes.status === 'fulfilled' ? callersRes.value : null,
            invocations: invocationsRes.status === 'fulfilled' ? invocationsRes.value : null,
            guardrails: guardrailsRes.status === 'fulfilled' ? guardrailsRes.value : [],
            deployments: deploymentsRes.status === 'fulfilled' ? deploymentsRes.value : [],
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load lineage data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const result = useMemo(() => {
    if (!rawData) {
      return {
        loading,
        error,
        flows: [],
        stats: { totalFlows: 0, totalInvocations: 0, protectedFlows: 0, unprotectedFlows: 0, callers: 0, models: 0 },
        liveSourcesCount: 0,
      };
    }

    const { callers, invocations, guardrails, deployments } = rawData;
    const flows: LineageFlow[] = [];
    let liveCount = 0;

    // Get active guardrails
    const activeGuardrails = (guardrails || []).filter((g: any) => g.status === 'active');
    const hasGuardrails = activeGuardrails.length > 0;

    // Get caller list from CloudTrail
    const callerList = callers?.callers || [];
    const callerCount = callerList.length;
    if (callerCount > 0) liveCount++;

    // Get invocation data
    const totalInvocations = invocations?.total_calls || 0;
    const modelBreakdown = invocations?.by_model || {};
    const modelList = Object.keys(modelBreakdown);
    if (totalInvocations > 0) liveCount++;

    // Build flows from callers → models
    if (callerList.length > 0) {
      callerList.forEach((caller: any, idx: number) => {
        const callerName = caller.principal || caller.caller_id || `Caller ${idx + 1}`;
        const callerService = caller.service || 'AWS Service';
        const callCount = caller.call_count || Math.floor(totalInvocations / Math.max(1, callerList.length));

        // Build nodes for this flow
        const nodes: LineageNode[] = [
          {
            id: `caller-${idx}`,
            type: 'caller',
            label: callerName.split(':').pop() || callerName,
            detail: callerService,
            status: 'active',
            live: true,
          },
        ];

        // Add deployment/agent node if we have deployments
        if (deployments.length > 0) {
          const deployment = deployments[idx % deployments.length];
          nodes.push({
            id: `agent-${idx}`,
            type: 'agent',
            label: deployment.deployment_name || 'Agent',
            detail: `Template: ${deployment.template_id}`,
            status: deployment.status === 'deployed' ? 'active' : 'warning',
            live: true,
          });
        }

        // Add guardrail node
        if (hasGuardrails) {
          const guardrail = activeGuardrails[idx % activeGuardrails.length];
          nodes.push({
            id: `guardrail-${idx}`,
            type: 'guardrail',
            label: guardrail.name,
            detail: `${guardrail.pii_entities?.length || 0} PII types protected`,
            status: 'active',
            live: true,
          });
        }

        // Add model node
        const modelName = modelList[idx % Math.max(1, modelList.length)] || 'Bedrock Model';
        nodes.push({
          id: `model-${idx}`,
          type: 'model',
          label: modelName.split('.').pop() || modelName,
          detail: `${(modelBreakdown[modelName] || callCount).toLocaleString()} invocations`,
          status: 'active',
          live: true,
        });

        // Add output node
        nodes.push({
          id: `output-${idx}`,
          type: 'output',
          label: 'Response',
          detail: hasGuardrails ? 'Protected output' : 'Unprotected output',
          status: hasGuardrails ? 'active' : 'warning',
          live: true,
        });

        flows.push({
          id: `flow-${idx}`,
          name: `${callerName.split(':').pop()} → AI Flow`,
          description: `Data flow from ${callerService} through ${hasGuardrails ? 'protected' : 'unprotected'} AI inference`,
          nodes,
          totalInvocations: callCount,
          lastActivity: caller.last_seen || 'Recent',
          hasGuardrail: hasGuardrails,
        });
      });
    }

    // If no callers but we have invocations, create a generic flow
    if (flows.length === 0 && totalInvocations > 0) {
      const nodes: LineageNode[] = [
        {
          id: 'caller-generic',
          type: 'caller',
          label: 'API Callers',
          detail: 'Bedrock API',
          status: 'active',
          live: true,
        },
      ];

      if (hasGuardrails) {
        nodes.push({
          id: 'guardrail-generic',
          type: 'guardrail',
          label: activeGuardrails[0]?.name || 'Guardrail',
          detail: `${activeGuardrails.length} active`,
          status: 'active',
          live: true,
        });
      }

      modelList.slice(0, 3).forEach((model, i) => {
        nodes.push({
          id: `model-${i}`,
          type: 'model',
          label: model.split('.').pop() || model,
          detail: `${(modelBreakdown[model] || 0).toLocaleString()} calls`,
          status: 'active',
          live: true,
        });
      });

      flows.push({
        id: 'flow-generic',
        name: 'Bedrock Inference Flow',
        description: 'Aggregate data flow through Bedrock models',
        nodes,
        totalInvocations,
        lastActivity: 'Recent',
        hasGuardrail: hasGuardrails,
      });
    }

    // Calculate stats
    const stats: LineageStats = {
      totalFlows: flows.length,
      totalInvocations,
      protectedFlows: flows.filter(f => f.hasGuardrail).length,
      unprotectedFlows: flows.filter(f => !f.hasGuardrail).length,
      callers: callerCount,
      models: modelList.length,
    };

    if (activeGuardrails.length > 0) liveCount++;

    return {
      loading,
      error,
      flows,
      stats,
      liveSourcesCount: liveCount,
    };
  }, [rawData, loading, error]);

  return {
    ...result,
    refresh: () => setRefreshKey(k => k + 1),
  };
}
