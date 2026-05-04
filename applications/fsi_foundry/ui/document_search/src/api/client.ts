import type { RuntimeConfig } from '../config';
import type { SearchResponse } from '../types';

interface InvokeResponse {
  session_id: string;
  status: string;
}

interface StatusResponse {
  session_id: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
  result?: SearchResponse;
  error?: string;
}

export async function invokeAgent(
  config: RuntimeConfig,
  payload: Record<string, string>,
): Promise<SearchResponse> {
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
      let parsed = data.result;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed) as SearchResponse; } catch { /* use as-is */ }
      }
      const raw = parsed as unknown as Record<string, unknown>;
      if (!raw.documents && typeof raw.summary === 'string' && raw.summary.startsWith('{')) {
        try { parsed = JSON.parse(raw.summary as string) as SearchResponse; } catch { /* fall through */ }
      }
      return normalizeResponse(parsed);
    }

    if (data.status === 'ERROR') {
      throw new Error(data.error || 'Agent invocation failed');
    }
  }
}

function normalizeResponse(raw: SearchResponse): SearchResponse {
  return {
    ...raw,
    relevance_scores: (raw.relevance_scores ?? []).map(Number),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
