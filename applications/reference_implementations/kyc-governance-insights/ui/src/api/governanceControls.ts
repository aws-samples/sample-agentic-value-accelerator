/**
 * API client for the real governance control services.
 * Called post-agent to provide independent validation.
 *
 * URL resolution prefers the Foundry-injected runtime-config.json
 * (`governance_api_url`), falling back to the original VITE_GOVERNANCE_API_URL
 * build-time env for standalone runs. Both the original path convention
 * (`/evaluate`, `/validate`) and the Foundry governance-service convention
 * (`/llm-judge`, `/deterministic-check`) are attempted, so this works against
 * either backend. Every call degrades gracefully to `null` when no governance
 * URL is configured.
 */

import { getRuntimeConfig } from '../runtimeConfig';

export interface JudgeScores {
  correctness: number;
  faithfulness: number;
  completeness: number;
  helpfulness: number;
  tone: number;
}

export interface DeterministicResult {
  overall: 'PASS' | 'FAIL';
  checks: Record<string, { computed: number; agent_stated: number; result: 'PASS' | 'FAIL' }>;
}

function governanceApi(): string {
  const rc = getRuntimeConfig();
  const url = (rc.governance_api_url as string) || import.meta.env.VITE_GOVERNANCE_API_URL || '';
  return url.replace(/\/$/, '');
}

/** POST to the first path that responds OK; returns parsed JSON or null. */
async function postFirst(paths: string[], body: unknown): Promise<any | null> {
  const base = governanceApi();
  if (!base) return null;
  for (const path of paths) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return await res.json();
    } catch {
      // try next path
    }
  }
  return null;
}

/**
 * Call LLM-as-Judge to evaluate agent output quality.
 */
export async function callLLMJudge(agentOutput: string): Promise<JudgeScores | null> {
  const data = await postFirst(['/evaluate', '/llm-judge'], { agent_output: agentOutput });
  if (!data) return null;
  // Both conventions wrap the five scores under `scores`.
  const scores = (data.scores ?? data) as Partial<JudgeScores>;
  if (scores == null || typeof scores !== 'object') return null;
  return {
    correctness: Number(scores.correctness ?? 0),
    faithfulness: Number(scores.faithfulness ?? 0),
    completeness: Number(scores.completeness ?? 0),
    helpfulness: Number(scores.helpfulness ?? 0),
    tone: Number(scores.tone ?? 0),
  };
}

/**
 * Call the deterministic financial check to independently verify ratios.
 * Normalizes the Foundry service's list-shaped `checks` into the keyed Record
 * this UI consumes.
 */
export async function callDeterministicCheck(
  rawFinancials: Record<string, number>,
  agentClaims: Record<string, number>,
): Promise<DeterministicResult | null> {
  const data = await postFirst(['/validate', '/deterministic-check'], {
    raw_financials: rawFinancials,
    agent_claims: agentClaims,
  });
  if (!data) return null;

  const rawChecks = data.checks;
  let checks: DeterministicResult['checks'] = {};
  if (Array.isArray(rawChecks)) {
    // Foundry shape: [{ metric, computed, agent_stated, result }]
    for (const c of rawChecks) {
      if (c && c.metric) {
        checks[c.metric] = {
          computed: Number(c.computed ?? 0),
          agent_stated: Number(c.agent_stated ?? 0),
          result: c.result === 'FAIL' ? 'FAIL' : 'PASS',
        };
      }
    }
  } else if (rawChecks && typeof rawChecks === 'object') {
    // Original shape: already a keyed Record
    checks = rawChecks as DeterministicResult['checks'];
  }

  return {
    overall: data.overall === 'FAIL' ? 'FAIL' : 'PASS',
    checks,
  };
}
