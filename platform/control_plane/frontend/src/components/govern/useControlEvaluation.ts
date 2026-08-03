/**
 * useControlEvaluation — Hook for live control evaluation from AWS sources.
 *
 * Takes framework controls with autoDetectSource, calls the backend evaluate
 * endpoint, and returns merged controls with live status. Controls without
 * autoDetectSource keep their mockData status.
 *
 * Features:
 * - Caches results by control ID set to avoid redundant API calls
 * - Returns whether evaluations came from live AWS data
 * - Provides source latency info for observability
 * - Gracefully degrades if the API is unavailable
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  governControlsApi,
  type ControlEvaluation,
  type EvaluateControlsResponse,
  type ControlEvaluationRequest,
} from '../../api/client';
import type { ComplianceControl, ControlStatus } from './mockData';

export interface UseControlEvaluationOptions {
  /** Controls to evaluate — only those with autoDetectSource will be sent to the API. */
  controls: ComplianceControl[];
  /** If true, skip evaluation (useful for conditional fetching). */
  skip?: boolean;
  /** Polling interval in ms. Set to 0 to disable polling. Default: 0 (no polling). */
  pollInterval?: number;
}

export interface UseControlEvaluationReturn {
  /** Map of controlId -> ControlEvaluation for controls with live data. */
  evaluations: Map<string, ControlEvaluation>;
  /** Whether any evaluations came from live AWS sources. */
  live: boolean;
  /** Loading state. */
  loading: boolean;
  /** Error message if API failed. */
  error: string | null;
  /** Source latency info from the last evaluation. */
  sources: Record<string, { live: boolean; latency_ms: number }>;
  /** Manually trigger a refresh. */
  refresh: () => Promise<void>;
  /** Merge live evaluations into a control, returning updated status. */
  mergeControl: (control: ComplianceControl) => ComplianceControl;
  /** Get merged controls array. */
  getMergedControls: (controls: ComplianceControl[]) => ComplianceControl[];
}

function mapEvaluationStatus(status: ControlEvaluation['status']): ControlStatus {
  switch (status) {
    case 'pass':
      return 'pass';
    case 'fail':
      return 'fail';
    case 'in-progress':
      return 'in-progress';
    case 'not-evaluated':
    default:
      return 'not-started';
  }
}

/**
 * Create a cache key from a set of control IDs and their sources.
 * Used to avoid redundant API calls when controls haven't changed.
 */
function createCacheKey(controls: ControlEvaluationRequest[]): string {
  return controls
    .map((c) => `${c.id}:${c.autoDetectSource}`)
    .sort()
    .join('|');
}

export function useControlEvaluation(
  options: UseControlEvaluationOptions
): UseControlEvaluationReturn {
  const { controls, skip = false, pollInterval = 0 } = options;

  const [evaluations, setEvaluations] = useState<Map<string, ControlEvaluation>>(new Map());
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<Record<string, { live: boolean; latency_ms: number }>>({});

  // Track the last cache key to avoid redundant fetches
  const lastCacheKeyRef = useRef<string>('');
  const mountedRef = useRef(true);

  // Extract controls with autoDetectSource
  const evaluatableControls = useMemo((): ControlEvaluationRequest[] => {
    return controls
      .filter((c) => c.autoDetectSource)
      .map((c) => ({
        id: c.id,
        autoDetectSource: c.autoDetectSource!,
      }));
  }, [controls]);

  const cacheKey = useMemo(() => createCacheKey(evaluatableControls), [evaluatableControls]);

  const fetchEvaluations = useCallback(async (force = false) => {
    // Skip if no controls to evaluate or if explicitly skipped
    if (skip || evaluatableControls.length === 0) {
      setEvaluations(new Map());
      setLive(false);
      setLoading(false);
      return;
    }

    // Skip if cache key hasn't changed (unless forced)
    if (!force && cacheKey === lastCacheKeyRef.current && evaluations.size > 0) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response: EvaluateControlsResponse = await governControlsApi.evaluate(evaluatableControls);

      if (!mountedRef.current) return;

      // Build evaluation map
      const evalMap = new Map<string, ControlEvaluation>();
      response.evaluations.forEach((ev) => {
        evalMap.set(ev.controlId, ev);
      });

      setEvaluations(evalMap);
      setLive(response.live);
      setSources(response.sources);
      lastCacheKeyRef.current = cacheKey;
    } catch (err) {
      if (!mountedRef.current) return;

      console.warn('Control evaluation API unavailable:', err);
      setError('Control evaluation unavailable');
      setLive(false);
      // Keep existing evaluations on error to avoid UI flicker
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [skip, evaluatableControls, cacheKey, evaluations.size]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    fetchEvaluations();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchEvaluations]);

  // Polling (if enabled)
  useEffect(() => {
    if (skip || pollInterval <= 0) return;

    const intervalId = setInterval(() => {
      fetchEvaluations(true);
    }, pollInterval);

    return () => clearInterval(intervalId);
  }, [skip, pollInterval, fetchEvaluations]);

  // Merge a single control with its live evaluation
  const mergeControl = useCallback(
    (control: ComplianceControl): ComplianceControl => {
      if (!control.autoDetectSource) {
        return control;
      }

      const evaluation = evaluations.get(control.id);
      if (!evaluation) {
        return control;
      }

      return {
        ...control,
        status: mapEvaluationStatus(evaluation.status),
        evidence: evaluation.evidence || control.evidence,
        lastReviewed: evaluation.lastEvaluated?.split('T')[0] || control.lastReviewed,
        // Add live metadata for UI display
        liveEvaluated: true,
        liveConfidence: evaluation.confidence,
      } as ComplianceControl & { liveEvaluated: boolean; liveConfidence: number };
    },
    [evaluations]
  );

  // Merge all controls
  const getMergedControls = useCallback(
    (controlsToMerge: ComplianceControl[]): ComplianceControl[] => {
      return controlsToMerge.map(mergeControl);
    },
    [mergeControl]
  );

  // Manual refresh
  const refresh = useCallback(async () => {
    await fetchEvaluations(true);
  }, [fetchEvaluations]);

  return {
    evaluations,
    live,
    loading,
    error,
    sources,
    refresh,
    mergeControl,
    getMergedControls,
  };
}
