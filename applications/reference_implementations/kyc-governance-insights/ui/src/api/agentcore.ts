import type { KYCResponse } from '../types';

// --- AgentCore native response types ---

export interface AgentCoreStep {
  step_id: string;
  step_name: string;
  step_type: 'tool_call' | 'reasoning' | 'retrieval' | 'validation' | 'decision';
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  duration_ms: number;
  model_id: string;
  confidence: number;
  sources: string[];
  guardrail_result?: {
    action: 'PASS' | 'INTERVENE' | 'BLOCK';
    policy_ids: string[];
    details: string;
  };
}

export interface AgentCoreResponse {
  session_id: string;
  customer_id: string;
  assessment_type: string;
  steps: AgentCoreStep[];
  summary: string;
  risk_rating: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'BLOCKED';
  confidence: number;
  sources: string[];
  decision: 'APPROVE' | 'REJECT' | 'ESCALATE' | 'BLOCKED';
  metadata: {
    model_id: string;
    latency_ms: number;
    tokens_used: number;
    gateway_policies_evaluated: number;
    gateway_policies_triggered: number;
  };
}

export interface AgentCoreInvokeRequest {
  customer_id: string;
  assessment_type: 'full' | 'refresh' | 'enhanced_due_diligence';
}

export interface AgentCoreError {
  error_code: string;
  message: string;
  request_id: string;
}

// --- Client implementation ---

const AGENTCORE_BASE = import.meta.env.VITE_API_URL_SCENARIO_B || '/api-b';
const TIMEOUT_MS = 30_000;

/**
 * Invokes AgentCore KYC agent. Uses the existing poll-based pattern:
 * POST /invoke → get session_id → poll /status/{session_id} until COMPLETE.
 */
export async function invokeAgentCore(
  request: AgentCoreInvokeRequest,
): Promise<KYCResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Step 1: Invoke
    const invokeResp = await fetch(`${AGENTCORE_BASE}/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!invokeResp.ok) {
      const errorBody = await invokeResp.json().catch(() => null);
      throw new AgentCoreTimeoutError(
        (errorBody as AgentCoreError | null)?.message || `HTTP ${invokeResp.status}`,
      );
    }

    const { session_id } = (await invokeResp.json()) as { session_id: string; status: string };

    // Step 2: Poll for completion
    const pollStart = Date.now();
    while (Date.now() - pollStart < TIMEOUT_MS - 2000) {
      await sleep(3000);
      if (controller.signal.aborted) throw new AgentCoreTimeoutError('Aborted');

      const statusResp = await fetch(`${AGENTCORE_BASE}/status/${session_id}`, {
        signal: controller.signal,
      });
      if (!statusResp.ok) continue;

      const statusData = await statusResp.json();
      if (statusData.status === 'COMPLETE' && statusData.result) {
        clearTimeout(timeoutId);
        return statusData.result as KYCResponse;
      }
      if (statusData.status === 'FAILED') {
        throw new AgentCoreTimeoutError('AgentCore processing failed');
      }
    }

    throw new AgentCoreTimeoutError('AgentCore request timed out (>30s)');
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AgentCoreTimeoutError('AgentCore request timed out (>30s)');
    }
    throw err;
  }
}

export class AgentCoreTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentCoreTimeoutError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
