import type { RuntimeConfig } from '../config';
import type { PaymentResponse } from '../types';

interface InvokeResponse {
  session_id: string;
  status: string;
}

interface StatusResponse {
  session_id: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
  result?: PaymentResponse;
  error?: string;
}

export async function invokeAgent(
  config: RuntimeConfig,
  payload: Record<string, string>,
): Promise<PaymentResponse> {
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
  }
}

function normalizeResponse(raw: PaymentResponse): PaymentResponse {
  const r = { ...raw };
  if (r.validation_result) {
    r.validation_result = {
      ...r.validation_result,
      risk_score: Number(r.validation_result.risk_score),
    };
  }
  if (r.routing_decision) {
    r.routing_decision = {
      ...r.routing_decision,
      routing_cost: Number(r.routing_decision.routing_cost),
    };
  }
  return r;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
