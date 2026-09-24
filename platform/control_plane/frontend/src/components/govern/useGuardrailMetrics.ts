/**
 * useGuardrailMetrics — Shared hook for consistent guardrail data across all Govern pages
 *
 * This hook consolidates guardrail metric fetching into one reusable source of truth,
 * ensuring all pages (FleetOverview, ComplianceCenter, GovernanceCommandCenter, etc.)
 * show the same guardrail numbers.
 *
 * Features:
 * - Fetches guardrail templates (control plane) plus one live telemetry call
 * - Caches results to avoid redundant API calls
 * - Returns computed stats (active, draft, failed counts)
 * - Aggregates metrics (invocations, blocked, allowed, anonymized)
 * - Provides loading and error states
 *
 * Two requests total, regardless of fleet size: `guardrailsApi.list()` for the
 * templates and `governGuardrailsApi.telemetry()` for every guardrail's CloudWatch
 * rollup. Per-template metrics are derived from that one telemetry payload
 * (see guardrailTelemetryMetrics.ts), so the window is TELEMETRY_WINDOW_DAYS and is
 * reported back as `windowDays` — do not label these numbers with a fixed window.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { guardrailsApi, governGuardrailsApi } from '../../api/client';
import type { AwsGuardrailTelemetryResponse, AwsRegionProvenance } from '../../api/client';
import type { GuardrailTemplate, GuardrailMetrics } from '../../types';
import { metricsByTemplateId } from './guardrailTelemetryMetrics';
import { useDataSources } from './DataSourceContext';

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

  // Trailing window the metrics above cover, in days. Callers that label the numbers
  // must read this rather than hard-coding a window — it used to be 24h per template
  // and is now the single telemetry window (TELEMETRY_WINDOW_DAYS).
  windowDays: number;

  // Region coverage of the guardrail telemetry fan-out. A governed region that did not
  // answer is dropped rather than failing the request, so the aggregated invocation and
  // intervention counts can be a floor. Null when the response carried no provenance
  // block, i.e. single-region by construction.
  regions: AwsRegionProvenance | null;

  // Refresh function
  refresh: () => void;
}

// ─────────────────────────── Cache ───────────────────────────

// Module-level cache to share data across hook instances
interface CacheEntry {
  templates: GuardrailTemplate[];
  metricsMap: Map<string, GuardrailMetrics>;
  telemetry: AwsGuardrailTelemetryResponse | null;
  timestamp: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 30000; // 30 seconds cache TTL

/** Trailing window for both the fleet totals and the per-template metrics derived from them. */
export const TELEMETRY_WINDOW_DAYS = 30;

// Bedrock guardrail statuses treated as "in-progress" (analogous to template drafts)
const BEDROCK_DRAFT_STATES = ['CREATING', 'UPDATING', 'VERSIONING', 'DELETING'];

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
  const [guardrailTelemetry, setGuardrailTelemetry] = useState<AwsGuardrailTelemetryResponse | null>(null);

  // Data source context for health reporting
  const { updateSource } = useDataSources();

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
          setGuardrailTelemetry(cache.telemetry);
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
          setGuardrailTelemetry(cache.telemetry);
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
          // Fetch guardrail templates (control-plane) + live Bedrock guardrail telemetry in parallel.
          // The live telemetry drives the COUNTS; templates drive per-template metrics.
          const [guardrailsRes, telemetryRes] = await Promise.all([
            guardrailsApi.list(),
            governGuardrailsApi.telemetry(TELEMETRY_WINDOW_DAYS).catch(() => null),
          ]);
          const activeGuardrails = guardrailsRes.filter(t => t.status !== 'deleted');

          if (!isMounted.current) return;

          // Per-template metrics come out of the telemetry call already made above —
          // one request for the whole fleet instead of one per guardrail.
          const newMetricsMap = metricsByTemplateId(
            activeGuardrails.filter(g => g.status === 'active'),
            telemetryRes,
          );

          // Update cache
          cache = {
            templates: activeGuardrails,
            metricsMap: newMetricsMap,
            telemetry: telemetryRes,
            timestamp: Date.now(),
          };

          // Update local state
          if (isMounted.current) {
            setTemplates(activeGuardrails);
            setMetricsMap(newMetricsMap);
            setGuardrailTelemetry(telemetryRes);
            setError(null);
            // Only the AWS telemetry call can attest that AWS Bedrock is reachable.
            //
            // This used to also OR in `activeGuardrails.length > 0 || newMetricsMap.size > 0`.
            // Both of those are derived from guardrailsApi.list(), which reads guardrail
            // TEMPLATES out of the control-plane's own DynamoDB table (see the comment on the
            // fetch above, and /api/v1/guardrails). So rows in our own database flipped the
            // shared `aws-bedrock` source to live — a source marked `critical: true` in
            // DataSourceContext, feeding the platform-wide "N/M live sources" indicator and
            // the page badges that read from it. With Bedrock unreachable, 11 template rows
            // would still have asserted it was live.
            //
            // Every sibling call gates on the payload's own flag — AgentCorePostureCard
            // (`d?.live`), DevToolsGovernance (`harnesses?.live`), HallucinationDetection
            // (`d.live`), GovernanceCommandCenter (`data.eval_jobs.live`). This one was the
            // outlier.
            if (telemetryRes?.live) {
              updateSource('aws-bedrock', { status: 'live', lastFetch: Date.now() });
            }
          }
        } catch (err) {
          console.error('Failed to load guardrail metrics:', err);
          if (isMounted.current) {
            setError('Failed to load guardrail data');
            updateSource('aws-bedrock', { status: 'error', error: 'Guardrails API unavailable' });
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
  }, [refreshKey, updateSource]);

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

  // Compute status counts — prefer live Bedrock telemetry (bedrock:ListGuardrails) when it
  // returns data, otherwise fall back to the DynamoDB template counts so behavior is unchanged
  // when Bedrock is unreachable or the account has no deployed guardrails.
  const bedrockLive = !!(guardrailTelemetry?.live && guardrailTelemetry.total_guardrails > 0);
  const activeCount = useMemo(
    () => bedrockLive
      ? guardrailTelemetry!.guardrails.filter(g => g.status === 'READY').length
      : templates.filter(g => g.status === 'active').length,
    [bedrockLive, guardrailTelemetry, templates],
  );
  const draftCount = useMemo(
    () => bedrockLive
      ? guardrailTelemetry!.guardrails.filter(g => BEDROCK_DRAFT_STATES.includes(g.status)).length
      : templates.filter(g => g.status === 'draft').length,
    [bedrockLive, guardrailTelemetry, templates],
  );
  const failedCount = useMemo(
    () => bedrockLive
      ? guardrailTelemetry!.guardrails.filter(g => g.status === 'FAILED').length
      : templates.filter(g => g.status === 'failed').length,
    [bedrockLive, guardrailTelemetry, templates],
  );
  const totalCount = bedrockLive ? guardrailTelemetry!.total_guardrails : templates.length;

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
    windowDays: guardrailTelemetry?.window_days ?? TELEMETRY_WINDOW_DAYS,
    regions: guardrailTelemetry?.regions ?? null,
    refresh,
  };
}

export default useGuardrailMetrics;
