/**
 * Live-verification diagnostics.
 *
 * Every console API helper returns null (or false) when a call does not succeed, so that a
 * failing control can never break the page. That part is deliberate. On its own, though, it
 * makes a broken call indistinguishable from a successful one that had nothing to show: the
 * view quietly falls back to scripted content and still presents itself as live. This module
 * carries the REASON alongside that null so the UI can state it plainly — the "fail loudly,
 * never mask missing infrastructure" invariant applies to the console, not just the backend.
 *
 * Deliberately NOT a React store. The reason is recorded synchronously at the point of
 * failure and read by the caller in the same `.then()` that receives the null, so there is no
 * subscription or re-render plumbing to get wrong. Callers own the rendering.
 */

export type LiveService =
  | 'validator'
  | 'cedar'
  | 'automated-reasoning'
  | 'grounding'
  | 'registry'
  | 'evaluations'
  | 'hitl';

/** Labels used when telling the operator which control fell back. */
export const LIVE_SERVICE_LABELS: Record<LiveService, string> = {
  validator: 'Deterministic recompute',
  cedar: 'Cedar authorization',
  'automated-reasoning': 'Automated Reasoning',
  grounding: 'Contextual grounding',
  registry: 'Agent registry',
  evaluations: 'Evaluation store',
  hitl: 'Human-in-the-loop store',
};

const lastFailure = new Map<LiveService, string>();

/** Record why a call failed. Returns null so helpers can `return recordLiveFailure(...)`. */
export function recordLiveFailure(service: LiveService, reason: string): null {
  lastFailure.set(service, reason);
  return null;
}

/** Called on a successful response so a stale reason is not reported later. */
export function clearLiveFailure(service: LiveService): void {
  lastFailure.delete(service);
}

export function getLiveFailure(service: LiveService): string | undefined {
  return lastFailure.get(service);
}

/**
 * The runtime-config key is absent, so no request was even attempted. Worth distinguishing:
 * this is a deployment/config gap, not a failing backend.
 */
export function notConfigured(service: LiveService, configKey: string): null {
  return recordLiveFailure(
    service,
    `not configured — "${configKey}" is missing from runtime-config.json, so no call was made`,
  );
}

/**
 * Pull the service's own message out of an error body. The console handlers answer
 * `{"error": "..."}`, which is far more useful than the status alone — "guardrail does not
 * exist" rather than "HTTP 500" — so it is worth surfacing verbatim (truncated).
 */
function detailFromBody(body?: string): string {
  if (!body) return '';
  let msg = '';
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const first = parsed.error ?? parsed.message ?? parsed.detail ?? parsed.Message;
    if (typeof first === 'string') msg = first;
  } catch {
    msg = body;
  }
  msg = msg.replace(/\s+/g, ' ').trim();
  if (!msg) return '';
  return msg.length > 180 ? `${msg.slice(0, 180)}...` : msg;
}

/** Turn a non-2xx response into something an operator can act on. */
export function httpFailure(
  service: LiveService,
  res: { status: number; statusText?: string },
  body?: string,
): null {
  const hint =
    res.status === 401 || res.status === 403
      ? ' — rejected before reaching the service (gateway authorizer or missing session)'
      : res.status === 404
        ? ' — route not found, check the console gateway mapping'
        : res.status === 429
          ? ' — throttled'
          : res.status >= 500
            ? ' — the service failed or is unavailable'
            : '';
  const text = res.statusText ? ` ${res.statusText}` : '';
  const detail = detailFromBody(body);
  return recordLiveFailure(
    service,
    `HTTP ${res.status}${text}${detail ? ` — ${detail}` : hint}`,
  );
}

/** Turn a thrown error into a reason. AbortSignal.timeout rejects with a TimeoutError. */
export function errorFailure(service: LiveService, err: unknown): null {
  const name = (err as { name?: string } | null | undefined)?.name;
  if (name === 'TimeoutError') return recordLiveFailure(service, 'timed out waiting for the service');
  if (name === 'AbortError') return recordLiveFailure(service, 'request aborted');
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return recordLiveFailure(service, msg ? `could not reach the service — ${msg}` : 'could not reach the service');
}
