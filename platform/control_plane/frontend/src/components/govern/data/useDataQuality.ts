/**
 * useDataQuality — Compute data quality metrics from live AWS data
 *
 * Sources:
 * 1. Guardrail metrics (block/allow/anonymize rates)
 * 2. AWS Config compliance as infrastructure quality proxy
 * 3. Glue Data Quality (if available)
 *
 * No user deployment required for basic metrics.
 */

import { useState, useEffect, useMemo } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export interface QualityRule {
  id: string;
  name: string;
  source: string;
  dimension: string;
  dataset: string;
  threshold: string;
  actual: string;
  status: 'pass' | 'fail';
  lastRun: string;
  live: boolean;
}

export interface QualityMetric {
  label: string;
  value: number;
  total: number;
  unit: string;
  status: 'good' | 'warning' | 'critical';
  source: string;
  live: boolean;
}

export interface DataQualityResult {
  loading: boolean;
  error: string | null;
  rules: QualityRule[];
  metrics: QualityMetric[];
  passRate: number;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  liveSourcesCount: number;
  hasGlueQuality: boolean;
  refresh: () => void;
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useDataQuality(): DataQualityResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [rawData, setRawData] = useState<{
    guardrails: any[];
    configCompliance: { totalRules: number; compliantRules: number; live: boolean };
    glueQuality: { rules: any[]; live: boolean };
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchAll = async () => {
      try {
        const [guardrailsRes, configRes, glueRes] = await Promise.allSettled([
          fetchJson(`${API_BASE}/api/v1/guardrails`),
          fetchJson(`${API_BASE}/api/v1/govern/posture/config-compliance`),
          fetchJson(`${API_BASE}/api/v1/govern/data-catalog/quality`).catch(() => ({ rules: [], live: false })),
        ]);

        let guardrails: any[] = [];
        if (guardrailsRes.status === 'fulfilled' && Array.isArray(guardrailsRes.value)) {
          guardrails = guardrailsRes.value;
        }

        let configCompliance = { totalRules: 0, compliantRules: 0, live: false };
        if (configRes.status === 'fulfilled') {
          configCompliance = {
            totalRules: configRes.value.total_rules || 0,
            compliantRules: configRes.value.compliant_rules || 0,
            live: configRes.value.live ?? true,
          };
        }

        let glueQuality = { rules: [] as any[], live: false };
        if (glueRes.status === 'fulfilled') {
          glueQuality = {
            rules: glueRes.value.rules || [],
            live: glueRes.value.live ?? false,
          };
        }

        if (!cancelled) {
          setRawData({ guardrails, configCompliance, glueQuality });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load quality data');
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
        rules: [],
        metrics: [],
        passRate: 0,
        totalRules: 0,
        passedRules: 0,
        failedRules: 0,
        liveSourcesCount: 0,
        hasGlueQuality: false,
      };
    }

    const { guardrails, configCompliance, glueQuality } = rawData;
    const rules: QualityRule[] = [];
    const metrics: QualityMetric[] = [];
    let liveCount = 0;

    // Build quality rules from guardrails (as content quality proxy)
    guardrails.filter(g => g.status === 'active').forEach(g => {
      const piiCount = g.pii_entities?.length || 0;
      const filterCount = g.content_filters?.length || 0;

      if (piiCount > 0) {
        rules.push({
          id: `${g.template_id}-pii`,
          name: `PII Protection (${g.name})`,
          source: 'Bedrock Guardrails',
          dimension: 'Privacy',
          dataset: 'All AI inputs/outputs',
          threshold: '≥10 PII types',
          actual: `${piiCount} types`,
          status: piiCount >= 10 ? 'pass' : 'fail',
          lastRun: 'Real-time',
          live: true,
        });
      }

      if (filterCount > 0) {
        rules.push({
          id: `${g.template_id}-filter`,
          name: `Content Filters (${g.name})`,
          source: 'Bedrock Guardrails',
          dimension: 'Safety',
          dataset: 'All AI inputs/outputs',
          threshold: '≥3 filters',
          actual: `${filterCount} filters`,
          status: filterCount >= 3 ? 'pass' : 'fail',
          lastRun: 'Real-time',
          live: true,
        });
      }
    });

    // Add metrics from guardrails
    if (guardrails.length > 0) {
      liveCount++;
      const activeCount = guardrails.filter(g => g.status === 'active').length;
      metrics.push({
        label: 'Active Guardrails',
        value: activeCount,
        total: guardrails.length,
        unit: 'guardrails',
        status: activeCount >= 3 ? 'good' : activeCount >= 1 ? 'warning' : 'critical',
        source: 'Bedrock',
        live: true,
      });

      const totalPii = new Set(guardrails.flatMap(g => (g.pii_entities || []).map((p: any) => p.type))).size;
      metrics.push({
        label: 'PII Types Protected',
        value: totalPii,
        total: 25, // common standard
        unit: 'types',
        status: totalPii >= 15 ? 'good' : totalPii >= 8 ? 'warning' : 'critical',
        source: 'Guardrails',
        live: true,
      });
    }

    // Add config compliance as infrastructure quality
    if (configCompliance.totalRules > 0) {
      liveCount++;
      const complianceRate = Math.round((configCompliance.compliantRules / configCompliance.totalRules) * 100);
      rules.push({
        id: 'config-compliance',
        name: 'Infrastructure Compliance',
        source: 'AWS Config',
        dimension: 'Compliance',
        dataset: 'AWS Resources',
        threshold: '≥90%',
        actual: `${complianceRate}%`,
        status: complianceRate >= 90 ? 'pass' : 'fail',
        lastRun: 'Continuous',
        live: configCompliance.live,
      });

      metrics.push({
        label: 'Config Compliance',
        value: configCompliance.compliantRules,
        total: configCompliance.totalRules,
        unit: 'rules',
        status: complianceRate >= 90 ? 'good' : complianceRate >= 70 ? 'warning' : 'critical',
        source: 'AWS Config',
        live: configCompliance.live,
      });
    }

    // Add Glue Data Quality rules if available
    if (glueQuality.live && glueQuality.rules.length > 0) {
      liveCount++;
      glueQuality.rules.forEach((r: any) => {
        rules.push({
          id: `glue-${r.rule_name}`,
          name: r.rule_name,
          source: 'Glue Data Quality',
          dimension: r.dimension || 'Overall',
          dataset: r.dataset,
          threshold: '≥80%',
          actual: r.score ? `${Math.round(r.score * 100)}%` : '-',
          status: r.status === 'pass' ? 'pass' : 'fail',
          lastRun: r.last_run || '-',
          live: true,
        });
      });
    }

    // Calculate totals
    const passedRules = rules.filter(r => r.status === 'pass').length;
    const failedRules = rules.filter(r => r.status === 'fail').length;
    const passRate = rules.length > 0 ? Math.round((passedRules / rules.length) * 100) : 0;

    return {
      loading,
      error,
      rules,
      metrics,
      passRate,
      totalRules: rules.length,
      passedRules,
      failedRules,
      liveSourcesCount: liveCount,
      hasGlueQuality: glueQuality.live && glueQuality.rules.length > 0,
    };
  }, [rawData, loading, error]);

  return {
    ...result,
    refresh: () => setRefreshKey(k => k + 1),
  };
}
