import type { RuntimeConfig } from '../config';
import type { AgentResponse } from '../types';

interface InvokeResponse {
  session_id: string;
  status: string;
}

interface StatusResponse {
  session_id: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
  result?: AgentResponse;
  error?: string;
}

export async function invokeAgent(
  config: RuntimeConfig,
  payload: Record<string, string>,
): Promise<AgentResponse> {
  // Step 1: Start async invocation
  const invokeRes = await fetch(config.api_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!invokeRes.ok) {
    const text = await invokeRes.text();
    throw new Error(text || `Request failed with status ${invokeRes.status}`);
  }

  const { session_id } = (await invokeRes.json()) as InvokeResponse;

  // Step 2: Poll for result
  const baseUrl = config.api_endpoint.replace(/\/invoke$/, '');
  const statusUrl = `${baseUrl}/status/${session_id}`;

  while (true) {
    await sleep(2000);

    const statusRes = await fetch(statusUrl);
    if (!statusRes.ok) {
      throw new Error(`Status check failed with ${statusRes.status}`);
    }

    const data = (await statusRes.json()) as StatusResponse;

    if (data.status === 'COMPLETE' && data.result) {
      return normalizeResponse(data.result);
    }

    if (data.status === 'ERROR') {
      throw new Error(data.error || 'Agent invocation failed');
    }

    // Still PENDING — keep polling
  }
}

function normalizeResponse(raw: AgentResponse): AgentResponse {
  const r = { ...raw };
  if (r.credit_risk_score) {
    r.credit_risk_score = {
      ...r.credit_risk_score,
      score: Number(r.credit_risk_score.score),
      probability_of_default: Number(r.credit_risk_score.probability_of_default),
      loss_given_default: Number(r.credit_risk_score.loss_given_default),
    };
  }
  if (r.portfolio_impact) {
    r.portfolio_impact = {
      ...r.portfolio_impact,
      concentration_change: Number(r.portfolio_impact.concentration_change),
      diversification_score: Number(r.portfolio_impact.diversification_score),
      risk_adjusted_return: Number(r.portfolio_impact.risk_adjusted_return),
    };
  }
  if (r.risk_assessment) {
    r.risk_assessment = {
      ...r.risk_assessment,
      score: Number(r.risk_assessment.score),
    };
  }
  return r;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
