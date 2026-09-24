import type { KYCResponse } from '../types';
import { getRuntimeConfig } from '../runtimeConfig';

// Resolve API URL. Prefers the Foundry-injected runtime-config.json
// (api_endpoint), then falls back to the original VITE_* build-time env so the
// app still runs standalone via `npm run dev`.
function resolveApiUrl(): string {
  const rc = getRuntimeConfig();
  if (rc.api_endpoint) return rc.api_endpoint;

  const backend = import.meta.env.VITE_BACKEND || 'pace';
  const ownUrl = import.meta.env.VITE_OWN_API_URL || '';
  const paceUrl = import.meta.env.VITE_PACE_API_URL || '';
  const explicit = import.meta.env.VITE_API_URL || '';

  // If explicit URL is a relative path (/api), resolve from toggle for production
  if (!explicit || explicit === '/api') {
    if (backend === 'own' && ownUrl) return ownUrl;
    if (paceUrl) return paceUrl;
  }
  return explicit || '/api';
}

// runtime-config.json is loaded before render (main.tsx), so this is populated.
export const API_BASE_URL = resolveApiUrl();

interface InvokeResponse {
  session_id: string;
  status: string;
}

interface StatusResponse {
  session_id: string;
  status: 'PENDING' | 'COMPLETE' | 'ERROR';
  result?: KYCResponse;
  error?: string;
}

/**
 * Thrown when the agent does not reach COMPLETE within the poll window.
 * Typed (name === 'PollTimeoutError') so the UI can catch it specifically and
 * degrade gracefully instead of hanging forever (REL-HRI-1).
 */
export class PollTimeoutError extends Error {
  constructor(message = 'Agent did not complete within the timeout window') {
    super(message);
    this.name = 'PollTimeoutError';
  }
}

const POLL_TIMEOUT_MS = 90_000;      // hard ceiling — never poll indefinitely
const POLL_BACKOFF_START_MS = 1_000; // first wait
const POLL_BACKOFF_CAP_MS = 8_000;   // max wait between polls

/**
 * Poll /status/:session_id until COMPLETE or ERROR, bounded by a 90s deadline
 * with exponential backoff (1s → doubling → cap 8s). Throws PollTimeoutError on
 * deadline, or Error on a non-2xx status check / reported ERROR.
 */
async function pollStatus(statusUrl: string): Promise<KYCResponse> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let delay = POLL_BACKOFF_START_MS;
  while (Date.now() < deadline) {
    await sleep(delay);
    delay = Math.min(delay * 2, POLL_BACKOFF_CAP_MS);

    const statusRes = await fetch(statusUrl);
    if (!statusRes.ok) {
      throw new Error(`Status check failed with ${statusRes.status}`);
    }

    const data = (await statusRes.json()) as StatusResponse;
    if (data.status === 'COMPLETE' && data.result) return data.result;
    if (data.status === 'ERROR') throw new Error(data.error || 'Agent invocation failed');
  }
  throw new PollTimeoutError('Agent did not complete within 90 seconds');
}

export async function invokeAgent(
  payload: Record<string, string>,
  apiUrl: string = API_BASE_URL,
): Promise<KYCResponse> {
  const endpoint = `${apiUrl}/invoke`;
  const invokeRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!invokeRes.ok) {
    const text = await invokeRes.text();
    throw new Error(text || `Request failed with status ${invokeRes.status}`);
  }

  const { session_id } = (await invokeRes.json()) as InvokeResponse;

  return pollStatus(`${apiUrl}/status/${session_id}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Invoke the KYC agent using an explicit API URL.
 * Polls /status/:session_id until COMPLETE or ERROR, bounded by a 90s deadline
 * with exponential backoff. Throws PollTimeoutError on timeout.
 */
export async function invokeLive(
  apiUrl: string,
  payload: Record<string, string>,
): Promise<KYCResponse> {
  const invokeUrl = apiUrl.endsWith('/invoke') ? apiUrl : `${apiUrl}/invoke`;

  const invokeRes = await fetch(invokeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!invokeRes.ok) {
    const text = await invokeRes.text();
    throw new Error(text || `Request failed with status ${invokeRes.status}`);
  }

  const { session_id } = (await invokeRes.json()) as InvokeResponse;

  const baseUrl = invokeUrl.replace(/\/invoke$/, '');
  return pollStatus(`${baseUrl}/status/${session_id}`);
}
