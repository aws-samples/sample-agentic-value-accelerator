/**
 * useAssessmentState — Shared hook for accessing assessment results across Govern module
 *
 * Provides:
 * - Assessment completion status
 * - Overall maturity score
 * - Gap counts by domain and role
 * - Last assessment date
 *
 * Used by GovernLanding, ProgramProgress, and role cards to show contextual prompts.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { AssessmentResult, DomainAssessment } from './governanceAssessmentFramework';

const DRAFT_KEY = 'governance-assessment-draft';
const RESULT_KEY = 'governance-assessment-result';

export interface AssessmentState {
  hasAssessment: boolean;
  hasDraft: boolean;
  result: AssessmentResult | null;
  overallMaturity: number;
  totalGaps: number;
  criticalGaps: number;
  lastAssessedAt: string | null;
  gapsByRole: Record<string, number>;
  gapsByDomain: Record<string, number>;
}

const DOMAIN_TO_ROLE: Record<string, string[]> = {
  'inventory-registry': ['Executives', 'Risk Teams'],
  'model-governance': ['Risk Teams', 'Data Stewards'],
  'risk-management': ['Risk Teams', 'Compliance'],
  'human-oversight': ['Executives', 'Risk Teams'],
  'agentic-autonomy': ['Security', 'Risk Teams'],
  'multi-agent-governance': ['Security', 'Risk Teams'],
  'incident-management': ['Security', 'Risk Teams'],
  'shadow-ai': ['Security', 'Compliance'],
  'fairness-bias': ['Safety / RAI', 'Compliance'],
  'transparency-explainability': ['Safety / RAI', 'Compliance'],
  'data-governance': ['Data Stewards', 'Compliance'],
  'security-safety': ['Security'],
  'compliance-audit': ['Compliance'],
  'finops-cost': ['FinOps'],
};

function calculateGapsByRole(domainAssessments: DomainAssessment[]): Record<string, number> {
  const gapsByRole: Record<string, number> = {
    'Executives': 0,
    'Risk Teams': 0,
    'Compliance': 0,
    'Security': 0,
    'Data Stewards': 0,
    'Safety / RAI': 0,
    'FinOps': 0,
  };

  for (const domain of domainAssessments) {
    const roles = DOMAIN_TO_ROLE[domain.domainId] || [];
    const domainGaps = domain.gaps?.length || 0;

    for (const role of roles) {
      if (gapsByRole[role] !== undefined) {
        gapsByRole[role] += domainGaps;
      }
    }
  }

  return gapsByRole;
}

function calculateGapsByDomain(domainAssessments: DomainAssessment[]): Record<string, number> {
  const gapsByDomain: Record<string, number> = {};

  for (const domain of domainAssessments) {
    gapsByDomain[domain.domainId] = domain.gaps?.length || 0;
  }

  return gapsByDomain;
}

export function useAssessmentState(): AssessmentState {
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  const loadState = useCallback(() => {
    try {
      // Shape-validated, same as the synchronous reader below. This used to JSON.parse
      // straight into state, so a stored result missing domainAssessments reached
      // calculateGapsByRole's for..of and crashed every consumer of this hook - /govern's
      // banner and ProgramProgress - not just the assessment route.
      setResult(loadAssessmentResult());

      const savedDraft = localStorage.getItem(DRAFT_KEY);
      setHasDraft(!!savedDraft);
    } catch {
      setResult(null);
      setHasDraft(false);
    }
  }, []);

  useEffect(() => {
    loadState();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === RESULT_KEY || e.key === DRAFT_KEY) {
        loadState();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [loadState]);

  const state = useMemo((): AssessmentState => {
    if (!result) {
      return {
        hasAssessment: false,
        hasDraft,
        result: null,
        overallMaturity: 0,
        totalGaps: 0,
        criticalGaps: 0,
        lastAssessedAt: null,
        gapsByRole: {},
        gapsByDomain: {},
      };
    }

    return {
      hasAssessment: true,
      hasDraft,
      result,
      overallMaturity: result.overallMaturity,
      totalGaps: result.totalGaps,
      criticalGaps: result.criticalGaps,
      lastAssessedAt: result.updatedAt || result.createdAt,
      gapsByRole: calculateGapsByRole(result.domainAssessments),
      gapsByDomain: calculateGapsByDomain(result.domainAssessments),
    };
  }, [result, hasDraft]);

  return state;
}

/**
 * True only if `value` carries every field the results view dereferences without guarding.
 *
 * JSON.parse succeeding says nothing about shape. A stored result written by an older build
 * (or by one of the repo's console seeders) can parse cleanly and still be missing
 * domainAssessments, and the consumers reach straight into it: ResultsDashboard does
 * `result.domainAssessments.map(...)` and `result.overallMaturity.toFixed(1)`, and this
 * module's own calculateGapsBy* iterate the same array. That throws inside the render tree,
 * so the ErrorBoundary swallows the whole /govern/assessment route - and because its
 * "Try again" re-reads the very same localStorage, it crashes again immediately, leaving
 * no in-app way out. Treating a malformed result as absent degrades to the wizard instead.
 */
function isRenderableAssessmentResult(value: unknown): value is AssessmentResult {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<AssessmentResult>;
  return (
    Array.isArray(r.domainAssessments) &&
    r.domainAssessments.every((d) => d && Array.isArray(d.responses) && Array.isArray(d.gaps)) &&
    Array.isArray(r.recommendations) &&
    typeof r.overallMaturity === 'number' &&
    typeof r.overallCompliance === 'number' &&
    typeof r.totalGaps === 'number' &&
    typeof r.criticalGaps === 'number'
  );
}

/**
 * Reads the persisted assessment result synchronously, or null if absent or unusable.
 *
 * The counterpart to saveAssessmentResult, for callers that need the stored result during
 * their first render rather than after an effect. useAssessmentState() sets it via an
 * effect, which is one render too late to choose an initial view.
 */
export function loadAssessmentResult(): AssessmentResult | null {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRenderableAssessmentResult(parsed)) {
      console.warn('Discarding malformed persisted assessment result; starting a new assessment.');
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAssessmentResult(result: AssessmentResult): void {
  try {
    localStorage.setItem(RESULT_KEY, JSON.stringify(result));
    window.dispatchEvent(new StorageEvent('storage', { key: RESULT_KEY }));
  } catch {
    console.error('Failed to save assessment result');
  }
}

export function clearAssessmentResult(): void {
  try {
    localStorage.removeItem(RESULT_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: RESULT_KEY }));
  } catch {
    // Ignore
  }
}
