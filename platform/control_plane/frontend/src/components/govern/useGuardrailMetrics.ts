/**
 * useGuardrailMetrics — Shared hook for consistent guardrail data across all Govern pages
 *
 * This hook consolidates guardrail metric fetching into one reusable source of truth,
 * ensuring all pages (FleetOverview, ComplianceCenter, GovernanceCommandCenter, etc.)
 * show the same guardrail numbers.
 *
 * Features:
 * - Fetches guardrail templates and metrics from guardrailsApi
 * - Caches results to avoid redundant API calls
 * - Returns computed stats (active, draft, failed counts)
 * - Aggregates metrics (invocations, blocked, allowed, anonymized)
 * - Provides loading and error states
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { guardrailsApi } from '../../api/client';
import type { GuardrailTemplate, GuardrailMetrics } from '../../types';

// ─────────────────────────── Types ───────────────────────────

export interface GuardrailSummary {
  template_id: string;
  name: string;
  status: string;
  features: string[];
  guardrail_id?: string;
  created_at: string;
  metrics?: GuardrailMetrics;
}

export interface AggregatedGuardrailMetrics {
  totalInvocations: number;
  blockedCount: number;
  allowedCount: number;
  anonymizedCount: number;
  blockRate: number;
}

export interface GuardrailMetricsResult {
  // Loading & error states
  loading: boolean;
  error: string | null;

  // Raw template data
  templates: GuardrailTemplate[];

  // Transformed summary data with metrics
  guardrails: GuardrailSummary[];

  // Aggregated metrics (sum of all active guardrails)
  metrics: AggregatedGuardrailMetrics;

  // Status counts
  activeCount: number;
  draftCount: number;
  failedCount: number;

  // Total count (excludes deleted)
  totalCount: number;

  // Refresh function
  refresh: () => void;
}

// ─────────────────────────── Cache ───────────────────────────

// Module-level cache to share data across hook instances
interface CacheEntry {
  templates: GuardrailTemplate[];
  metricsMap: Map<string, GuardrailMetrics>;
  timestamp: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 30000; // 30 seconds cache TTL

// Track in-flight requests to prevent duplicate calls
let pendingRequest: Promise<void> | null = null;

// ─────────────────────────── Helper ───────────────────────────

function featureSummary(t: GuardrailTemplate): string[] {
  const features: string[] = [];
  if (t.content_filters?.length > 0) features.push('Content');
  if (t.pii_entities?.length > 0) features.push('PII');
  if (t.denied_topics?.length > 0) features.push('Topics');
  if (t.word_filter?.enable_profanity || (t.word_filter?.blocked_words?.length ?? 0) > 0) features.push('Words');
  if (t.contextual_grounding?.enabled) features.push('Grounding');
  return features;
}

// ─────────────────────────── Hook ───────────────────────────

export function useGuardrailMetrics(): GuardrailMetricsResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Local state from cache
  const [templates, setTemplates] = useState<GuardrailTemplate[]>([]);
  const [metricsMap, setMetricsMap] = useState<Map<string, GuardrailMetrics>>(new Map());

  // Track if component is mounted
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Load data from API or cache
  useEffect(() => {
    const loadData = async () => {
      // Check cache first
      const now = Date.now();
      if (cache && (now - cache.timestamp) < CACHE_TTL_MS && refreshKey === 0) {
        // Use cached data
        if (isMounted.current) {
          setTemplates(cache.templates);
          setMetricsMap(cache.metricsMap);
          setLoading(false);
          setError(null);
        }
        return;
      }

      // If there's already a pending request, wait for it
      if (pendingRequest && refreshKey === 0) {
        await pendingRequest;
        if (cache && isMounted.current) {
          setTemplates(cache.templates);
          setMetricsMap(cache.metricsMap);
          setLoading(false);
          setError(null);
        }
        return;
      }

      setLoading(true);
      setError(null);

      // Create the fetch promise
      const fetchPromise = (async () => {
        try {
          // Fetch all guardrail templates
          const guardrailsRes = await guardrailsApi.list();
          const activeGuardrails = guardrailsRes.filter(t => t.status !== 'deleted');

          if (!isMounted.current) return;

          // Fetch metrics for active guardrails (in parallel)
          const guardrailsWithIds = activeGuardrails.filter(g => g.guardrail_id && g.status === 'active');
          const newMetricsMap = new Map<string, GuardrailMetrics>();

          if (guardrailsWithIds.length > 0) {
            const metricsPromises = guardrailsWithIds.map(g =>
              guardrailsApi.getMetrics(g.template_id, 24).catch(() => null)
            );
            const metricsResults = await Promise.all(metricsPromises);

            if (!isMounted.current) return;

            metricsResults.forEach((m, i) => {
              if (m) newMetricsMap.set(guardrailsWithIds[i].template_id, m);
            });
          }

          // Update cache
          cache = {
            templates: activeGuardrails,
            metricsMap: newMetricsMap,
            timestamp: Date.now(),
          };

          // Update local state
          if (isMounted.current) {
            setTemplates(activeGuardrails);
            setMetricsMap(newMetricsMap);
            setError(null);
          }
        } catch (err) {
          console.error('Failed to load guardrail metrics:', err);
          if (isMounted.current) {
            setError('Failed to load guardrail data');
          }
        } finally {
          if (isMounted.current) {
            setLoading(false);
          }
          pendingRequest = null;
        }
      })();

      pendingRequest = fetchPromise;
      await fetchPromise;
    };

    loadData();
  }, [refreshKey]);

  // Transform templates for display (with metrics)
  const guardrails = useMemo<GuardrailSummary[]>(() => {
    return templates.map(t => ({
      template_id: t.template_id,
      name: t.name,
      status: t.status,
      features: featureSummary(t),
      guardrail_id: t.guardrail_id,
      created_at: t.created_at,
      metrics: metricsMap.get(t.template_id),
    }));
  }, [templates, metricsMap]);

  // Aggregate guardrail metrics
  const metrics = useMemo<AggregatedGuardrailMetrics>(() => {
    let totalInvocations = 0;
    let blockedCount = 0;
    let allowedCount = 0;
    let anonymizedCount = 0;

    metricsMap.forEach(m => {
      totalInvocations += m.total_invocations;
      blockedCount += m.blocked_count;
      allowedCount += m.allowed_count;
      anonymizedCount += m.anonymized_count;
    });

    return {
      totalInvocations,
      blockedCount,
      allowedCount,
      anonymizedCount,
      blockRate: totalInvocations > 0 ? (blockedCount / totalInvocations) * 100 : 0,
    };
  }, [metricsMap]);

  // Compute status counts
  const activeCount = useMemo(() => templates.filter(g => g.status === 'active').length, [templates]);
  const draftCount = useMemo(() => templates.filter(g => g.status === 'draft').length, [templates]);
  const failedCount = useMemo(() => templates.filter(g => g.status === 'failed').length, [templates]);
  const totalCount = templates.length;

  // Refresh function - invalidates cache and refetches
  const refresh = useCallback(() => {
    cache = null; // Invalidate cache
    setRefreshKey(k => k + 1);
  }, []);

  return {
    loading,
    error,
    templates,
    guardrails,
    metrics,
    activeCount,
    draftCount,
    failedCount,
    totalCount,
    refresh,
  };
}

export default useGuardrailMetrics;
