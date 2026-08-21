import type { RuntimeConfig } from '../config';
import type { SubmissionResponse } from '../types';

interface InvokeResponse {
  session_id: string;
  status: string;
}

interface StatusResponse {
  session_id: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
  result?: SubmissionResponse;
  error?: string;
}

export async function invokeAgent(
  config: RuntimeConfig,
  payload: Record<string, string>,
): Promise<SubmissionResponse> {
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

  // A full triage runs three agents in parallel plus a synthesis call, so
  // polling can continue for several minutes.
  for (;;) {
    await sleep(2000);

    const statusRes = await fetch(statusUrl);
    if (!statusRes.ok) {
      throw new Error(`Status check failed with ${statusRes.status}`);
    }

    const data = (await statusRes.json()) as StatusResponse;

    if (data.status === 'COMPLETE' && data.result) {
      let parsed: SubmissionResponse = data.result;

      // The worker stores the result as a JSON string; some paths hand it back
      // already parsed.
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed) as SubmissionResponse;
        } catch {
          /* use as-is */
        }
      }

      // Defensive: if synthesis JSON extraction failed server-side the whole
      // structured payload can arrive nested inside `summary`.
      const raw = parsed as unknown as Record<string, unknown>;
      if (
        !raw.appetite_review &&
        !raw.exposure_assessment &&
        !raw.pricing_indication &&
        typeof raw.summary === 'string' &&
        raw.summary.trimStart().startsWith('{')
      ) {
        try {
          parsed = JSON.parse(raw.summary as string) as SubmissionResponse;
        } catch {
          /* fall through and render the raw summary text */
        }
      }

      return parsed;
    }

    if (data.status === 'ERROR') {
      throw new Error(data.error || 'Agent invocation failed');
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
