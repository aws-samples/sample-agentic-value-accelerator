/**
 * Drives one chat turn against the agent and surfaces the AgentCore tool-call timeline
 * + the 3LO consent (CUSTOM auth_required) to React via plain callbacks.
 *
 * Transport = WebSocket (API Gateway), NOT the Lambda Function URL: this account's org
 * guardrail blocks Function URL invocation for every principal except the admin role
 * (proven empirically — Identity Pool creds, plain IAM roles, and account-root grants
 * all get 403; only the admin SSO role gets 200). API Gateway WebSocket is a different
 * data plane and is not subject to that block.
 *
 * The WS Lambda forwards each AG-UI event from the runtime as its own WS frame
 * (`{type:'agui_event', event:{...}}`), so the live timeline is fully preserved. We
 * translate those frames into the same RunCallbacks the HttpAgent path used, so App.tsx
 * is unchanged.
 *
 * LONG-RUNNING (autonomous-for-hours) TRANSPORT — start/poll:
 * A single synchronous invoke is hard-capped at 15 min (AgentCore request timeout AND the
 * WS Lambda's own AWS-Lambda ceiling). To let a desk review run far longer, we use AgentCore's
 * background-task pattern: `phase:'start'` launches the run in the runtime and returns at once
 * (the agent keeps its microVM alive via /ping HealthyBusy for up to 8h); we then `phase:'poll'`
 * the SAME session ~every second, draining the AG-UI events the run has buffered since our
 * `cursor`, until the job reports done. Each phase is its own sub-second WS round-trip, so no
 * layer's 15-min wall is ever approached. Same session id on every phase → the runtime routes
 * to the same sticky microVM where the job buffer lives.
 *
 * Auth: connect with `?token=<accessToken>` (the runtime's customJWTAuthorizer validates
 * it per invoke); the access token is also replayed in-band as user_token for the 3LO stash.
 */
import type { Auth, AppConfig } from './auth';

export type TimelineItem = {
  id: string;
  tool: string; // human label (the agent sends TOOL_LABELS as toolCallName)
  args?: string;
  result?: string;
  status: 'running' | 'done';
};

export interface RunCallbacks {
  onToolStart?: (item: TimelineItem) => void;
  onToolEnd?: (id: string, args: string) => void;
  onToolResult?: (id: string, result: string) => void;
  onText?: (fullText: string) => void; // cumulative assistant text buffer
  onAuthRequired?: (authUrl: string, message: string) => void;
  onError?: (message: string) => void;
  onFinished?: () => void;
}

export class AgentClient {
  private auth: Auth;
  private wsUrl: string;

  constructor(auth: Auth, cfg: AppConfig) {
    this.auth = auth;
    this.wsUrl = cfg.WS_URL;
  }

  /** Run one user turn on the given thread. modelId/topology/forceReauth ride in the message.
   * Drives the long-running start→poll loop; the RunCallbacks contract is unchanged, so
   * App.tsx neither knows nor cares that the turn now runs as a background job. */
  async run(
    threadId: string,
    userText: string,
    opts: { modelId?: string; topology?: string; forceReauth?: boolean; persona?: string },
    cb: RunCallbacks,
  ): Promise<void> {
    const token = this.auth.getAccessToken() || '';
    if (!token) {
      cb.onError?.('Not authenticated.');
      return;
    }

    // Cumulative UI state carried across ALL polls of this turn. The text buffer must NOT
    // reset between polls — the frontend expects a monotonically growing full-text string.
    const state: RunState = { textBuf: '', authFired: false, terminated: false };

    try {
      // Phase 1 — launch the background run. Returns as soon as the job is registered.
      await this.phase(token, threadId, opts, cb, state, { phase: 'start', message: userText });
      if (state.terminated) return; // auth / error surfaced during start

      // Phase 2 — poll until the job reports done/error/unknown, or a no-progress guard trips.
      let cursor = state.cursor ?? 0;
      let idleMs = 0;
      const POLL_MS = 1000;
      // Rolling guard: reset on ANY new run event. Must exceed the engine's per-node ceiling
      // (LONG_NODE_TIMEOUT=20m in swarm_strands) so we never abandon a node the runtime would
      // still finish — a deep reasoning node can be silent between tool calls for a while.
      const NO_PROGRESS_LIMIT_MS = 25 * 60 * 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await sleep(POLL_MS);
        state.gotEvent = false;
        state.jobState = undefined;
        await this.phase(token, threadId, opts, cb, state, { phase: 'poll', cursor });
        if (state.terminated) return; // auth required, or a socket-level error already fired

        cursor = state.cursor ?? cursor;
        idleMs = state.gotEvent ? 0 : idleMs + POLL_MS;

        if (state.jobState === 'done' || state.jobState === 'error') break;
        if (state.jobState === 'unknown') {
          cb.onError?.('The run is no longer available (the session was recycled). Please try again.');
          break;
        }
        if (idleMs >= NO_PROGRESS_LIMIT_MS) {
          cb.onError?.('The run stalled (no progress for 15 minutes). Please try again.');
          break;
        }
      }
    } finally {
      if (!state.authFired) cb.onFinished?.();
    }
  }

  /** ONE start-or-poll WS round-trip: open, send the phase, translate every agui_event into
   * callbacks, resolve when the WS Lambda emits agui_done (or the socket closes/errors).
   * Mutates `state` (textBuf, cursor, jobState, gotEvent, authFired, terminated). */
  private phase(
    token: string,
    threadId: string,
    opts: { modelId?: string; topology?: string; forceReauth?: boolean; persona?: string },
    cb: RunCallbacks,
    state: RunState,
    msg: { phase: 'start' | 'poll'; message?: string; cursor?: number },
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve();
      };

      // Send the desk on connect so the WS Lambda can reject an un-entitled desk at the edge
      // (before any runtime invoke). The runtime's per-turn desk gate remains authoritative.
      const persona = opts.persona || '';
      const ws = new WebSocket(
        `${this.wsUrl}?token=${encodeURIComponent(token)}${persona ? `&persona=${encodeURIComponent(persona)}` : ''}`,
      );

      // Per-phase guard: a single start/poll round-trip is sub-second server-side. If the
      // socket dies without a terminal frame, unblock this phase (the poll loop continues;
      // a start failure terminates the turn).
      const guard = setTimeout(() => {
        if (!settled) {
          if (msg.phase === 'start') {
            cb.onError?.('Connection timed out.');
            state.terminated = true;
          }
          done();
        }
      }, 60_000);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            action: 'sendMessage',
            agui: true,
            phase: msg.phase,
            cursor: msg.cursor ?? 0,
            message: msg.message ?? '',
            session_id: threadId,
            model_id: opts.modelId || '',
            topology: opts.topology || '',
            persona: opts.persona || '',
            force_reauth: Boolean(opts.forceReauth),
          }),
        );
      };

      ws.onmessage = (evt) => {
        let frame: any;
        try {
          frame = JSON.parse(evt.data as string);
        } catch {
          return;
        }

        // Terminal marker emitted by the WS Lambda once this phase's SSE stream is flushed.
        if (frame?.type === 'agui_done') {
          done();
          return;
        }
        if (frame?.type === 'error') {
          cb.onError?.(frame.error || 'Agent error');
          state.terminated = true;
          done();
          return;
        }
        if (frame?.type !== 'agui_event' || !frame.event) return;

        const ev = frame.event;
        switch (ev.type) {
          case 'TOOL_CALL_START':
            state.gotEvent = true;
            cb.onToolStart?.({
              id: ev.toolCallId,
              tool: ev.toolCallName || 'tool',
              status: 'running',
            });
            break;
          case 'TOOL_CALL_ARGS':
            // delta is a JSON string of the tool args (agent sends it whole).
            state.gotEvent = true;
            cb.onToolEnd?.(ev.toolCallId, ev.delta || '');
            break;
          case 'TOOL_CALL_RESULT':
            state.gotEvent = true;
            cb.onToolResult?.(ev.toolCallId, String(ev.content ?? ''));
            break;
          case 'TEXT_MESSAGE_CONTENT':
            state.gotEvent = true;
            state.textBuf += ev.delta || '';
            cb.onText?.(state.textBuf);
            break;
          case 'CUSTOM':
            if (ev.name === 'auth_required') {
              state.authFired = true;
              state.terminated = true; // stop polling; the turn re-runs after consent
              const v = ev.value || {};
              cb.onAuthRequired?.(v.auth_url || '', v.message || 'Authorization required.');
            } else if (ev.name === 'poll_status' || ev.name === 'job_started') {
              // Async-protocol control frames: advance the cursor + record job state.
              const v = ev.value || {};
              if (typeof v.cursor === 'number') state.cursor = v.cursor;
              if (typeof v.state === 'string') state.jobState = v.state;
            }
            break;
          case 'RUN_ERROR':
            state.gotEvent = true;
            cb.onError?.(ev.message || 'Agent run error');
            break;
          // RUN_STARTED / RUN_FINISHED / TOOL_CALL_END / TEXT_MESSAGE_START|END:
          // no UI action needed (job state + agui_done drive completion).
        }
      };

      ws.onerror = () => {
        // A transient socket error on a POLL is non-fatal — the loop will poll again. On
        // START it means the run never launched, so terminate the turn.
        if (msg.phase === 'start') {
          // A $connect rejection (e.g. desk not entitled → 403 handshake) surfaces here as a
          // generic socket error in the browser; hint at the likely cause without asserting it.
          cb.onError?.('Could not open a session for this desk. If you recently lost access, request it again.');
          state.terminated = true;
        }
        done();
      };
      ws.onclose = () => {
        done();
      };
    });
  }
}

/** Mutable per-turn state threaded through every start/poll phase. */
interface RunState {
  textBuf: string;      // cumulative assistant text (grows across polls; never reset mid-turn)
  authFired: boolean;   // 3LO consent surfaced — suppress onFinished, turn re-runs after approval
  terminated: boolean;  // stop the poll loop now (auth, or a start-phase failure)
  cursor?: number;      // server event-buffer cursor (events consumed so far)
  jobState?: string;    // last poll_status: 'running' | 'done' | 'error' | 'unknown'
  gotEvent?: boolean;   // did THIS phase deliver any run event? (drives the no-progress guard)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
