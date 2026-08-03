/**
 * ChatWorkspace — the desk-chat experience, extracted whole from App.tsx.
 *
 * Owns ALL chat state (turns / thread / model / topology / consent / sessions) and the transient
 * per-turn chat WebSocket (via AgentClient). It renders the left Sidebar (model/topology/policy/
 * quick-prompts), the Observability + Evaluations strips, the connected assistant thread, the
 * consent block, the composer, and the right-hand StackRail.
 *
 * It is one of several sections the AppShell can show. Because a turn runs as a background
 * start→poll loop on a transient socket (AgentClient), this component MUST stay mounted (the shell
 * hides it with CSS rather than unmounting) when the operator navigates to another section — an
 * unmount mid-run would orphan the poll loop and setState after unmount.
 *
 * Contract with the shell:
 *   • busy is reported up via onBusyChange so the shell top-bar can disable the desk switcher.
 *   • the persona (desk) is global (usePersona); a desk switch STARTS A FRESH SESSION here, keyed
 *     off personaId via a last-seen-persona ref (StrictMode-safe; save-then-reset, guarded on busy).
 *   • freshLogin is captured in App BEFORE handleRedirect() strips ?code= and passed in, so a
 *     late mount (admin landing on Overview) still distinguishes fresh-login from a plain refresh.
 *   • extraActive threads the shell's "ops sections visited this session" set into the StackRail so
 *     its "exercised this session" signal stays honest for panels now reached from the nav.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { Send, X, ArrowRight, ArrowDown, Lock, ShieldAlert } from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import { AgentClient, TimelineItem } from './agentClient';
import { usePersona } from './personaContext';
import type { AgentIdentity, PersonaDef, QuickPrompt } from './personas';
import { allows, type Effective } from './entitlements';
import { Sidebar } from './Sidebar';
import { ToolResultView, safeJson } from './toolViews';
import { SwarmFlow, hasSwarmActivity } from './SwarmFlow';
import { GraphFlow, hasGraphActivity } from './GraphFlow';
import { StackRail } from './StackRail';
import { Observability } from './Observability';
import { Evaluations } from './Evaluations';
import { TraceView } from './TraceView';
import { cn } from './lib/cn';
import { renderMarkdown } from './lib/markdown';
import {
  listSessions,
  saveSession,
  deleteSession,
  clearSessions,
  titleFor,
  type SessionRecord,
} from './lib/sessions';

// Timeline items get wall-clock stamps as their WebSocket events arrive (startedAt on
// TOOL_CALL_START, endedAt on TOOL_CALL_RESULT) so the live thread can show an instant
// per-step duration. This is the client-observed time (includes a little transport); the
// authoritative per-agent / per-model timing comes from the CloudWatch trace panel.
type TimedItem = TimelineItem & { startedAt?: number; endedAt?: number };

type Turn = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timeline: TimedItem[];
  startedAt?: number; // assistant turn: when the run began
  endedAt?: number;   // assistant turn: when busy cleared
};

/** Human duration: 820ms / 4.2s / 1m 05s. */
function fmtDur(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
}

/** A clock that ticks every 500ms while `active`, so live durations count up. */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

type Consent = { authUrl: string; message: string; pendingText: string };

function newId() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
function newThreadId() {
  // AgentCore runtime session ids must be >= 33 chars.
  return (newId() + newId() + newId() + newId() + newId()).slice(0, 48);
}

/** Is this timeline item an orchestration marker (agent-active / hand-off / graph
 * topology) rather than a real domain tool? Those are rendered by SwarmFlow / GraphFlow,
 * not as tool cards. Covers both engines' smuggled __ keys. */
function isSwarmMarker(item: TimelineItem): boolean {
  const p = safeJson(item.args);
  if (!p || typeof p !== 'object') return false;
  if (p.__agent_active || p.__handoff || p.__graph) return true;
  return p.__tool === 'agent_active' || p.__tool === 'handoff' || p.__tool === 'graph';
}

export function ChatWorkspace({
  auth, cfg, freshLogin, onBusyChange, extraOpsActive, onNewThread, effective,
}: {
  auth: Auth;
  cfg: AppConfig;
  /** Captured in App before handleRedirect() cleans the URL — true iff this load was a fresh
   * Hosted-UI sign-in (?code=…), so we start a new session rather than restoring. */
  freshLogin: boolean;
  /** Report busy up so the shell top-bar can disable the desk switcher mid-run. */
  onBusyChange?: (busy: boolean) => void;
  /** Shell-tracked ops sections exercised this session (registry/express/optimize) → StackRail. */
  extraOpsActive?: string[];
  /** Fired when a NEW chat thread begins (new session / desk switch / resume-to-new), so the shell
   * can reset its per-session "visited ops" set — keeps the StackRail signal honest. */
  onNewThread?: () => void;
  /** The caller's live effective entitlements — the roster hero greys out specialists the user
   * isn't entitled to invoke (the per-AGENT access dimension). Null = not yet loaded (show all). */
  effective?: Effective | null;
}) {
  const client = useMemo(() => new AgentClient(auth, cfg), [auth, cfg]);
  const { personaId, persona } = usePersona();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState('auto');
  // Orchestration architecture: 'swarm' (emergent, LLM-routed hand-offs) vs 'graph'
  // (deterministic Strands Graph — parallel fan-out/fan-in DAG). Same 11 agents + tools.
  const [topology, setTopology] = useState<'swarm' | 'graph'>('swarm');
  const [threadId, setThreadId] = useState<string>(newThreadId());
  const [consent, setConsent] = useState<Consent | null>(null);
  // Gate "I've approved — continue" until the user has actually opened the Authorize
  // tab at least once, so they can't skip the consent step.
  const [authClicked, setAuthClicked] = useState(false);
  // Client-side conversation history (localStorage; see lib/sessions.ts).
  const [sessions, setSessions] = useState<SessionRecord[]>(() => listSessions());
  // Responsive drawers: below lg the two rails collapse to slide-in overlays.
  const [navOpen, setNavOpen] = useState(false);
  const [stackOpen, setStackOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Ops-plane primitives light up in the StackRail once the operator exercises them THIS session.
  // registry/harness/optimization now live as shell nav sections, so the shell reports them via
  // extraOpsActive; observability / evaluations are reported by their own strips below.
  const [obsActive, setObsActive] = useState(false);
  const [evalActive, setEvalActive] = useState(false);

  // Keep the shell's top-bar in step with an in-flight run.
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, consent]);

  // ---- Session history: restore most-recent on mount ----------------------------
  // A fresh Hosted-UI sign-in starts a clean slate; a plain refresh restores the in-progress
  // conversation. freshLogin is captured in App (before the URL is cleaned) and passed in.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (freshLogin) return; // fresh login → keep the new-session threadId
    const recent = listSessions()[0];
    if (recent && recent.turns.length) {
      setThreadId(recent.id);
      setTurns(recent.turns as Turn[]);
    }
  }, [freshLogin]);

  // ---- Desk switch → fresh session -----------------------------------------------
  // Persona is global; switching desks must start a fresh chat session so one desk's context
  // never bleeds into another's. We watch personaId with a LAST-SEEN ref (StrictMode-safe: a
  // naive first-render boolean can misfire under double-invoke). On a genuine change we
  // persist the current convo first (save-then-reset), then start a new thread — but never
  // mid-run (guarded on busy; the shell also disables the switcher while busy).
  const prevPersonaRef = useRef(personaId);
  useEffect(() => {
    if (prevPersonaRef.current === personaId) return;
    prevPersonaRef.current = personaId;
    if (busy) return; // a run is in flight — don't orphan the poll loop
    newSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  // Persist the active conversation (debounced) whenever it changes & is non-empty.
  useEffect(() => {
    if (!turns.length) return;
    const handle = setTimeout(() => {
      const now = Date.now();
      saveSession({ id: threadId, title: titleFor(turns, now), updatedAt: now, turns });
      setSessions(listSessions());
    }, 400);
    return () => clearTimeout(handle);
  }, [turns, threadId]);

  // ---- Derived telemetry for the observability strip + stack rail ----
  const allTimelines = useMemo(
    () => turns.filter((t) => t.role === 'assistant').map((t) => t.timeline),
    [turns],
  );
  const { handoffCount, toolCount } = useMemo(() => {
    let h = 0;
    let tools = 0;
    for (const tl of allTimelines) {
      for (const item of tl) {
        const p = safeJson(item.args);
        if (!p || typeof p !== 'object') continue;
        if (p.__handoff || p.__tool === 'handoff') h += 1;
        else if (
          p.__tool &&
          p.__tool !== 'agent_active' &&
          p.__tool !== 'graph' &&
          !p.__agent_active &&
          !p.__graph
        )
          tools += 1;
      }
    }
    return { handoffCount: h, toolCount: tools };
  }, [allTimelines]);

  // Re-hydrate CloudWatch metrics each time a turn finishes (busy → false).
  const [refreshKey, setRefreshKey] = useState(0);
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) setRefreshKey((k) => k + 1);
    wasBusy.current = busy;
  }, [busy]);

  // Which non-tool primitives to also light on the rail — each an HONEST "exercised this session"
  // signal: observability/evaluations from their strips; registry/harness/optimization from the
  // shell (extraOpsActive); memory best-effort from the latest recall-style prompt.
  const extraActive = useMemo(() => {
    const keys: string[] = [...(extraOpsActive || [])];
    if (obsActive) keys.push('observability');
    if (evalActive) keys.push('evaluations');
    const lastUser = [...turns].reverse().find((t) => t.role === 'user')?.text?.toLowerCase() || '';
    if (/remember|recall|mandate|benchmark|memory|funds i manage/.test(lastUser)) keys.push('memory');
    return keys;
  }, [turns, extraOpsActive, obsActive, evalActive]);

  // ---- Proactive token refresh ------------------------------------------------
  // Cognito access tokens default to a 60-min lifetime and auth.ts never refreshes them; once
  // stale, the runtime's customJWTAuthorizer 401s mid-session. Before each turn, if the access
  // token is within 5 min of expiry (or expired) and we hold a refresh token, exchange it at the
  // same /oauth2/token endpoint auth.handleRedirect uses. Uses only PUBLIC Auth members.
  async function ensureFreshToken() {
    try {
      const access = auth.getAccessToken();
      if (!access || !auth.refreshToken) return;
      let exp = 0;
      try {
        exp = (auth.parseToken(access)?.exp || 0) * 1000;
      } catch {
        return;
      }
      if (exp - Date.now() > 5 * 60 * 1000) return; // still fresh enough

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: auth.clientId,
        refresh_token: auth.refreshToken,
      });
      const resp = await fetch(`${auth.domain}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.access_token) {
        // refresh_token grant does NOT return a new refresh_token — keep the current one.
        auth.setTokens({
          IdToken: data.id_token || auth.getIdToken() || '',
          AccessToken: data.access_token,
          RefreshToken: auth.refreshToken || undefined,
        });
      }
    } catch {
      /* network/parse issue — fall through with the existing token */
    }
  }

  // ---- Run one turn through the agent, updating the assistant turn live ----
  async function runTurn(text: string) {
    if (!text.trim() || busy) return;
    setConsent(null);
    await ensureFreshToken();
    const userTurn: Turn = { id: newId(), role: 'user', text, timeline: [] };
    const asstId = newId();
    const asstTurn: Turn = { id: asstId, role: 'assistant', text: '', timeline: [], startedAt: Date.now() };
    setTurns((t) => [...t, userTurn, asstTurn]);
    setBusy(true);

    const patch = (fn: (t: Turn) => Turn) =>
      setTurns((all) => all.map((t) => (t.id === asstId ? fn(t) : t)));

    // One-time demo-reset flag: force a fresh 3LO consent after a logout.
    const forceReauth = localStorage.getItem('forceReauthGrades') === '1';
    if (forceReauth) localStorage.removeItem('forceReauthGrades');

    try {
      await client.run(threadId, text, { modelId: model, topology, forceReauth, persona: personaId }, {
        onToolStart: (item) =>
          patch((t) => ({ ...t, timeline: [...t.timeline, { ...item, startedAt: Date.now() }] })),
        onToolEnd: (id, args) =>
          patch((t) => ({
            ...t,
            timeline: t.timeline.map((x) => (x.id === id ? { ...x, args } : x)),
          })),
        onToolResult: (id, result) =>
          patch((t) => ({
            ...t,
            timeline: t.timeline.map((x) =>
              x.id === id ? { ...x, result, status: 'done', endedAt: Date.now() } : x,
            ),
          })),
        onText: (full) => patch((t) => ({ ...t, text: full })),
        onAuthRequired: (authUrl, message) => {
          setAuthClicked(false); // require an Authorize click before "continue" unlocks
          setConsent({ authUrl, message, pendingText: text });
          patch((t) => ({ ...t, text: t.text || message }));
        },
        onError: (message) => patch((t) => ({ ...t, text: `⚠️ ${message}` })),
        onFinished: () => {},
      });
    } catch (e: any) {
      patch((t) => ({ ...t, text: `⚠️ ${e?.message || 'Request failed'}` }));
    } finally {
      patch((t) => ({ ...t, endedAt: Date.now() }));
      setBusy(false);
    }
  }

  function send() {
    const text = input.trim();
    if (!text) return;
    setInput('');
    void runTurn(text);
  }

  // After the user approves in the Cognito tab, re-run the SAME turn on the SAME
  // thread — the token vault now has the grant, so the tool proceeds.
  function continueAfterConsent() {
    if (!consent) return;
    const text = consent.pendingText;
    setConsent(null);
    void runTurn(text);
  }

  function newSession() {
    // Persist the current convo (the debounced effect may not have flushed) before reset.
    if (turns.length) {
      const now = Date.now();
      saveSession({ id: threadId, title: titleFor(turns, now), updatedAt: now, turns });
      setSessions(listSessions());
    }
    setThreadId(newThreadId());
    setTurns([]);
    setConsent(null);
    onNewThread?.();
  }

  // ---- Session-history controls (client-side; see lib/sessions.ts) ----
  function resumeSession(rec: SessionRecord) {
    if (busy) return;
    // Save the current convo first so switching away doesn't lose it.
    if (turns.length && threadId !== rec.id) {
      const now = Date.now();
      saveSession({ id: threadId, title: titleFor(turns, now), updatedAt: now, turns });
    }
    setThreadId(rec.id);
    setTurns(rec.turns as Turn[]);
    setConsent(null);
    setSessions(listSessions());
    onNewThread?.();
  }

  function removeSession(id: string) {
    deleteSession(id);
    setSessions(listSessions());
    // If we deleted the active one, start fresh.
    if (id === threadId) {
      setThreadId(newThreadId());
      setTurns([]);
      setConsent(null);
      onNewThread?.();
    }
  }

  function clearAllSessions() {
    clearSessions();
    setSessions([]);
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left controls rail — inline at lg+, slide-in drawer below lg. */}
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}
      <div
        className={cn(
          'z-50 flex shrink-0 max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[85vw] max-lg:max-w-[320px] max-lg:shadow-2xl max-lg:transition-transform',
          navOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Drawer close affordance (mobile only). */}
        <button
          onClick={() => setNavOpen(false)}
          aria-label="Close controls"
          className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground lg:hidden"
        >
          <X size={14} />
        </button>
        <Sidebar
          cfg={cfg}
          auth={auth}
          model={model}
          setModel={setModel}
          topology={topology}
          setTopology={setTopology}
          onNewSession={newSession}
          onQuickPrompt={(p) => { setNavOpen(false); runTurn(p); }}
          busy={busy}
          identityEmail={auth.getUser()?.email || auth.getUser()?.['cognito:username'] || 'signed in'}
          sessions={sessions}
          activeSessionId={threadId}
          onResumeSession={(r) => { setNavOpen(false); resumeSession(r); }}
          onDeleteSession={removeSession}
          onClearSessions={clearAllSessions}
        />
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Mobile: buttons to open the two rails (the shell top-bar doesn't own these). */}
        <div className="flex items-center gap-2 border-b border-border bg-card/60 px-4 py-1.5 lg:hidden">
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <button
            onClick={() => setNavOpen(true)}
            className="rounded-md border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent"
          >
            Controls
          </button>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <button
            onClick={() => setStackOpen(true)}
            className="ml-auto rounded-md border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent xl:hidden"
          >
            AWS Stack
          </button>
        </div>

        {/* The two live-telemetry strips (Observability + Evaluations) only mean something once
            a turn has run — at rest they'd greet the operator with a wall of zeros, reading as
            "nothing works" rather than "watch this light up". So they mount on the FIRST turn and
            stay for the rest of the session. The DeskHero already advertises what they'll show. */}
        {turns.length > 0 && (
          <>
            {/* Live observability strip — real CloudWatch GenAI telemetry. */}
            <Observability
              auth={auth}
              cfg={cfg}
              model={model}
              sessionId={threadId}
              handoffCount={handoffCount}
              toolCount={toolCount}
              busy={busy}
              refreshKey={refreshKey}
              onActive={setObsActive}
            />

            {/* Live evaluations strip — real AgentCore Evaluations (built-ins + governance judge). */}
            <Evaluations auth={auth} cfg={cfg} sessionId={threadId} refreshKey={refreshKey} onActive={setEvalActive} />
          </>
        )}

        <div ref={messagesRef} className="dot-grid flex-1 overflow-x-hidden overflow-y-auto px-5 py-5">
          {/* Cold start: the hero centers in the canvas so there's no dead band above the
              composer. Once a turn exists, revert to top-aligned scroll for the thread. */}
          <div
            className={cn(
              'mx-auto flex min-w-0 max-w-3xl flex-col gap-4',
              turns.length === 0 && 'min-h-full justify-center',
            )}
          >
            {turns.length === 0 && <DeskHero persona={persona} personaId={personaId} effective={effective} busy={busy} onLaunch={runTurn} />}

            {turns.map((t) => {
              if (t.role === 'user') {
                return (
                  <div key={t.id} className="flex justify-end">
                    <div className="max-w-[80%] overflow-hidden whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-primary px-4 py-2.5 text-[14px] leading-relaxed text-primary-foreground">
                      {t.text}
                    </div>
                  </div>
                );
              }
              const isLast = turns[turns.length - 1]?.id === t.id;
              return (
                <AssistantThread
                  key={t.id}
                  turn={t}
                  busy={busy}
                  isLast={isLast}
                  auth={auth}
                  cfg={cfg}
                  threadId={threadId}
                />
              );
            })}

            {consent && (
              <div className="panel-elevated border-warn/40 bg-warn/5 p-4">
                <p className="text-[13px]">{consent.message}</p>
                <div className="mt-3 flex items-center gap-2.5">
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  <a
                    className="rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                    href={consent.authUrl}
                    target="_blank"
                    rel="noopener"
                    onClick={() => setAuthClicked(true)}
                  >
                    Authorize
                  </a>
                  <button
                    className="rounded-lg border border-border bg-secondary px-3.5 py-2 text-[13px] font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-secondary"
                    onClick={continueAfterConsent}
                    disabled={!authClicked}
                    title={authClicked ? undefined : 'Click Authorize first, approve in the new tab, then continue'}
                  >
                    I've approved — continue
                  </button>
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  {!authClicked && (
                    <span className="text-[11px] text-muted-foreground">
                      Click Authorize first →
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Composer — the desk's order line. */}
        <div className="shrink-0 border-t border-border bg-card/80 px-5 py-3.5 backdrop-blur-xl">
          <div className="mx-auto max-w-3xl">
            <div className="group flex items-end gap-2.5 rounded-lg border border-input bg-elevated p-2 pl-3.5 transition-colors focus-within:border-primary">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={persona.composerPlaceholder}
                rows={2}
                className="flex-1 resize-none self-center bg-transparent py-1.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button
                onClick={send}
                disabled={busy || !input.trim()}
                aria-label="Send message"
                className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-all hover:brightness-110 enabled:hover:-translate-y-px disabled:opacity-40"
              >
                {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                {busy ? (
                  <span className="size-2.5 rounded-sm bg-primary-foreground animate-pulse-dot" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
            <p className="mt-1.5 px-1 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
            </p>
          </div>
        </div>
      </main>

      {/* AWS Agent Stack rail — inline at xl+, slide-in drawer below xl. */}
      {stackOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm xl:hidden"
          onClick={() => setStackOpen(false)}
        />
      )}
      <div
        className={cn(
          'z-50 flex shrink-0 max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:shadow-2xl max-xl:transition-transform',
          stackOpen ? 'max-xl:translate-x-0' : 'max-xl:translate-x-full xl:translate-x-0',
        )}
      >
        <button
          onClick={() => setStackOpen(false)}
          aria-label="Close AWS stack"
          className="absolute left-2 top-2 z-10 flex size-7 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground xl:hidden"
        >
          <X size={14} />
        </button>
        <StackRail timelines={allTimelines} busy={busy} extraActive={extraActive} cfg={cfg} />
      </div>
    </div>
  );
}

// ── Desk hero (empty state) ───────────────────────────────────────────────────────────────────
// The most characteristic thing about this product isn't a paragraph describing the desk —
// it's the desk itself. Instead of a blurb floating in the void, the cold-start screen renders
// the actual roster the run will use: the Lead who routes the mandate, the specialists who do
// the work (each in its own ink), and the Committee that signs the verdict. Derived entirely
// from persona.agents + persona.order, so every vertical gets its own org for free.
const NUM_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function DeskHero({
  persona, personaId, effective, busy, onLaunch,
}: {
  persona: PersonaDef;
  personaId: string;
  effective?: Effective | null;
  busy: boolean;
  onLaunch: (prompt: string) => void;
}) {
  const { agents, order } = persona;
  const leadKey = order[0];
  const committeeKey = order[order.length - 1];
  const specialistKeys = order.slice(1, -1);
  const lead = agents[leadKey];
  const committee = agents[committeeKey];
  const n = specialistKeys.length;
  const countWord = NUM_WORD[n] ?? String(n);

  // Per-AGENT access: a specialist is WITHHELD when the caller isn't entitled to invoke it (the
  // compound `desk::rosterKey` grant). Structural nodes (lead/committee) are never gated. The
  // withheld ones render greyed + non-launchable so the roster-as-hero tells the access story too.
  const withheld = (key: string) => !allows(effective, 'agents', `${personaId}::${key}`);
  const withheldCount = specialistKeys.filter(withheld).length;

  // Resolve each roster member to a REAL scenario so the hover affordance isn't a lie:
  //  • a specialist → its own showcase swarm prompt (the one whose lead agent is this key);
  //  • the Lead / Committee (and any specialist without a dedicated prompt, e.g. execution-only
  //    desks) → the first full-desk graph review, which runs the whole roster start-to-verdict.
  const fullDesk: QuickPrompt | undefined = persona.graphPrompts[0];
  const promptForAgent = (key: string): QuickPrompt | undefined =>
    persona.swarmPrompts.find((p) => p.agent === key) ?? fullDesk;

  const launch = (p: QuickPrompt | undefined) => {
    if (p && !busy) onLaunch(p.prompt);
  };

  return (
    <div className="surface-hero relative overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <span className="field-key">{persona.tagline} · The desk</span>
        <span className="live-pill">
          <span className="dot" />
          {persona.livePillLabel}
        </span>
      </div>

      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <h2 className="text-[20px] font-extrabold tracking-[-0.015em] sm:text-[22px]">{persona.heroTitle}</h2>
        {/* One derived thesis line — the roster below does the rest of the explaining. */}
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <span className="font-medium text-foreground">{lead.name}</span> routes your mandate to{' '}
          {countWord} specialist agents; the <span className="font-medium text-foreground">{committee.name}</span>{' '}
          reconciles their work into a single verdict. Tap any agent to put it to work.
          {withheldCount > 0 && (
            // nosemgrep: jsx-not-internationalized (single-locale demo)
            <span className="mt-1.5 block text-[12px] text-warn">
              {withheldCount} specialist{withheldCount === 1 ? '' : 's'} withheld by access control — request access to invoke {withheldCount === 1 ? 'it' : 'them'}.
            </span>
          )}
        </p>

        {/* The roster, laid out as the run flows: entry → specialists → verdict. Each member is a
            live launcher — clicking runs a representative mandate that lands on that agent. */}
        <div className="mt-5">
          <RosterBand
            agent={lead}
            kicker="Routes"
            tail="run the full desk"
            delay={0}
            busy={busy}
            onClick={() => launch(fullDesk)}
          />
          <FlowArrow />
          <div
            className="grid animate-fade-rise grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
            style={{ animationDelay: '70ms' } as CSSProperties}
          >
            {specialistKeys.map((k) => (
              <SpecialistTile
                key={k}
                agent={agents[k]}
                prompt={promptForAgent(k)}
                busy={busy}
                withheld={withheld(k)}
                onClick={() => launch(promptForAgent(k))}
              />
            ))}
          </div>
          <FlowArrow />
          <RosterBand
            agent={committee}
            kicker="Verdict"
            tail="reconciles → one call"
            delay={140}
            verdict
            busy={busy}
            onClick={() => launch(fullDesk)}
          />
        </div>

        <div className="mt-6 flex items-center gap-1.5 border-t border-border pt-3.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
          <ArrowRight size={13} className="text-primary" />
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          Tap an agent above, pick a scenario at left, or ask below.
        </div>
      </div>
    </div>
  );
}

/** A specialist launcher: the agent's icon in its own ink, its name, and the concrete task the
 *  click will run (derived from the scenario's hint — teaches the desk, not just names it). A
 *  WITHHELD specialist (per-agent access revoked) renders greyed + locked and can't be launched. */
function SpecialistTile({
  agent, prompt, busy, withheld, onClick,
}: {
  agent: AgentIdentity;
  prompt: QuickPrompt | undefined;
  busy: boolean;
  withheld?: boolean;
  onClick: () => void;
}) {
  const { name, color, Icon } = agent;
  // The scenario hint reads like "Universe & Data · FRED" — the trailing clause is the concrete
  // capability, so we surface it as the tile's second line ("what tapping this does").
  const doing = prompt?.hint?.split('·').pop()?.trim();
  return (
    <button
      type="button"
      disabled={busy || !prompt || withheld}
      onClick={onClick}
      title={withheld ? `${name} — not granted; request access to invoke it` : prompt?.label}
      aria-disabled={withheld}
      className={cn(
        'group relative flex items-center gap-2.5 overflow-hidden rounded-lg border py-2.5 pl-3 pr-6 text-left transition-all sm:min-h-[62px]',
        withheld
          ? 'cursor-not-allowed border-dashed border-border bg-secondary/20 opacity-60'
          : 'border-border bg-card/50 hover:-translate-y-px hover:border-primary/40 hover:bg-card hover:shadow-sm disabled:pointer-events-none disabled:opacity-50',
      )}
    >
      <span
        className={cn('flex size-8 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-border/60 transition-transform', !withheld && 'group-hover:scale-105')}
        style={withheld ? undefined : { background: `color-mix(in srgb, ${color} 15%, transparent)`, color } as CSSProperties}
      >
        {withheld ? <Lock size={14} className="text-muted-foreground" /> : <Icon size={15} />}
      </span>
      <span className="min-w-0 flex-1">
        {/* Names run long ("Liquidity & Microstructure") — wrap to a second line rather than
            clip; the grid row auto-matches heights so the tiles stay aligned. */}
        <span className={cn('block text-[12.5px] font-semibold leading-tight [text-wrap:balance]', withheld ? 'text-muted-foreground' : 'text-foreground')}>{name}</span>
        {withheld ? (
          // nosemgrep: jsx-not-internationalized (single-locale demo)
          <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-wide text-warn">No access · request</span>
        ) : doing ? (
          <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {doing}
          </span>
        ) : null}
      </span>
      {/* Arrow is absolutely positioned so it never steals width from the name (which was
          clipping the longer specialists like "Performance Attribution"). */}
      {!withheld && (
        <ArrowRight
          size={13}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 translate-x-1 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
        />
      )}
    </button>
  );
}

/** The bracketing bands — Lead at the top of the funnel, Committee at the bottom. Both launch the
 *  full-desk review (the whole roster start-to-verdict). The verdict band gets a claret frame to
 *  mark it as the desk's signed call (matching the answer card). */
function RosterBand({
  agent, kicker, tail, delay, verdict, busy, onClick,
}: {
  agent: AgentIdentity;
  kicker: string;
  tail: string;
  delay: number;
  verdict?: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const { name, color, Icon } = agent;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={cn(
        'group flex w-full animate-fade-rise items-center gap-3 rounded-lg border bg-elevated px-3.5 py-3 text-left shadow-sm transition-all hover:-translate-y-px hover:shadow-md disabled:pointer-events-none disabled:opacity-50',
        verdict ? 'border-primary/40 hover:border-primary/60' : 'border-border hover:border-primary/40',
      )}
      style={{ animationDelay: `${delay}ms` } as CSSProperties}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ring-border/60 transition-transform group-hover:scale-105"
        style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color } as CSSProperties}
      >
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <div className="field-key text-[9px] leading-none">{kicker}</div>
        <div className="mt-1 truncate text-[13.5px] font-bold leading-tight">{name}</div>
      </div>
      {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
      <span className="ml-auto hidden shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground sm:flex">
        {tail}
        <ArrowRight size={12} className="text-primary" />
      </span>
    </button>
  );
}

/** A centered downward tick between the funnel tiers — the flow's direction, quietly. */
function FlowArrow() {
  return (
    <div className="flex justify-center py-1.5" aria-hidden>
      <ArrowDown size={14} className="text-muted-foreground/50" />
    </div>
  );
}

// ── Content-firewall block ─────────────────────────────────────────────────────────────────
// The runtime scans every prompt with the Bedrock guardrail BEFORE the model/tools run; a secret,
// SSN, or card number BLOCKS the turn and emits a sentinel-prefixed message (agent/main.py). We
// detect that sentinel here and render a clear firewall card. Defensive: any parse problem falls
// back to rendering the raw text as a normal answer (returns null), so a format change never breaks.
const GUARDRAIL_SENTINEL = '⟦AGENTCORE_GUARDRAIL_BLOCK⟧';
interface GuardrailBlock {
  message: string;
  reasons: string[];
  action: string;
}
function parseGuardrailBlock(text: string): GuardrailBlock | null {
  if (typeof text !== 'string' || !text.startsWith(GUARDRAIL_SENTINEL)) return null;
  const rest = text.slice(GUARDRAIL_SENTINEL.length).trim();
  const parsed = safeJson(rest);
  if (!parsed || typeof parsed !== 'object') {
    // Sentinel present but body unparseable — still show a firewall card with a generic message.
    return { message: 'Blocked by the content firewall.', reasons: [], action: 'GUARDRAIL_INTERVENED' };
  }
  return {
    message: typeof parsed.message === 'string' && parsed.message ? parsed.message : 'Blocked by the content firewall.',
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map((r: unknown) => String(r)) : [],
    action: typeof parsed.action === 'string' ? parsed.action : 'GUARDRAIL_INTERVENED',
  };
}

/** Turn a raw guardrail reason token (e.g. "regex:aws-secret-access-key:block", "pii:EMAIL:anonymize")
 * into a short human chip label. */
function reasonLabel(r: string): string {
  const parts = r.split(':');
  if (parts[0] === 'pii' && parts[1]) return parts[1].replace(/_/g, ' ');
  if (parts[0] === 'regex' && parts[1]) return parts[1].replace(/-/g, ' ');
  if (parts[0] === 'content' && parts[1]) return parts[1].replace(/_/g, ' ');
  return r;
}

function GuardrailBlockCard({ block }: { block: GuardrailBlock }): JSX.Element {
  return (
    <div className="surface-hero relative overflow-hidden">
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-destructive" />
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <ShieldAlert size={13} className="text-destructive" />
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <span className="field-key text-destructive">Content firewall · blocked</span>
        <span className="rule-fade ml-1 flex-1" />
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Bedrock Guardrails</span>
      </div>
      <div className="px-4 py-4">
        <p className="break-words text-[13.5px] leading-relaxed text-foreground">{block.message}</p>
        {block.reasons.length > 0 && (
          <div className="mt-3">
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="field-key mb-1.5 text-muted-foreground">Policies triggered</div>
            <div className="flex flex-wrap gap-1.5">
              {block.reasons.map((r, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded bg-destructive/12 px-2 py-0.5 text-[11px] font-medium text-destructive"
                  title={r}
                >
                  <Lock size={10} />
                  {reasonLabel(r)}
                </span>
              ))}
            </div>
          </div>
        )}
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          The prompt was scanned before any model or tool ran, so nothing sensitive reached the agent. Remove the flagged content and try again.
        </p>
      </div>
    </div>
  );
}

// ── Swarm-trace timeline: each assistant turn renders as a vertically connected thread. ───────
function ThreadStep({
  children,
  status,
  first,
  last,
}: {
  children: ReactNode;
  status: 'done' | 'running';
  first?: boolean;
  last?: boolean;
}) {
  return (
    <div className={cn('thread-step animate-fade-rise', first && 'is-first', last && 'is-last')}>
      <span className={cn('thread-node', status === 'running' ? 'is-running' : 'is-done')} />
      {children}
    </div>
  );
}

function AssistantThread({
  turn,
  busy,
  isLast,
  auth,
  cfg,
  threadId,
}: {
  turn: Turn;
  busy: boolean;
  isLast: boolean;
  auth: Auth;
  cfg: AppConfig;
  threadId: string;
}) {
  const { persona } = usePersona();
  const toolItems = turn.timeline.filter((x) => !isSwarmMarker(x));
  const showGraph = hasGraphActivity(turn.timeline);
  // A graph run also emits __agent_active + __handoff (edge) markers, which hasSwarmActivity
  // matches — so render the swarm rail ONLY when this wasn't a graph run.
  const showSwarm = !showGraph && hasSwarmActivity(turn.timeline);
  const live = busy && isLast;
  // Tick while this turn is live so running durations count up in real time.
  const now = useTicker(live);

  // Client-observed elapsed for one timeline item (or the live count-up while running).
  const stepDur = (x: TimedItem): number | null => {
    if (x.startedAt == null) return null;
    const end = x.endedAt ?? (live && x.status === 'running' ? now : null);
    return end == null ? null : end - x.startedAt;
  };

  // Build the ordered step list so we can mark first/last for spine head/tail and
  // know which node is the live one (the last incomplete step while busy).
  type Step = { key: string; node: ReactNode; running: boolean };
  const steps: Step[] = [];
  if (showGraph) {
    steps.push({
      key: 'graph',
      running: false,
      node: <GraphFlow timeline={turn.timeline} busy={live} />,
    });
  }
  if (showSwarm) {
    steps.push({
      key: 'swarm',
      running: false,
      node: <SwarmFlow timeline={turn.timeline} busy={live} />,
    });
  }
  for (const x of toolItems) {
    const running = x.status === 'running';
    const ms = stepDur(x);
    steps.push({
      key: x.id,
      running,
      node: (
        <div className="panel-elevated overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2">
            <span
              className={cn(
                'size-1.5 rounded-full',
                running ? 'bg-warn animate-pulse-dot' : 'bg-ok',
              )}
            />
            <span className="font-mono text-[12px] font-medium tracking-tight">{x.tool}</span>
            {ms != null && (
              <span
                className={cn(
                  'tabular rounded px-1.5 py-px font-mono text-[10px]',
                  running ? 'bg-warn/15 text-warn' : 'bg-secondary text-muted-foreground',
                )}
                title="Client-observed time for this step"
              >
                {fmtDur(ms)}
              </span>
            )}
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {running ? 'running' : 'done'}
            </span>
          </div>
          <div className="p-3">
            {x.result ? (
              <ToolResultView tool={x.tool} args={x.args} result={x.result} />
            ) : (
              // nosemgrep: jsx-not-internationalized (single-locale demo)
              <div className="text-[12px] text-muted-foreground">Calling tool…</div>
            )}
          </div>
        </div>
      ),
    });
  }
  if (turn.text) {
    // A content-firewall BLOCK arrives as a sentinel-prefixed message (see agent/main.py). Render it
    // as a distinct firewall card rather than the desk's signed verdict — the prompt never ran.
    const gb = parseGuardrailBlock(turn.text);
    steps.push({
      key: 'answer',
      running: false,
      node: gb ? (
        <GuardrailBlockCard block={gb} />
      ) : (
        <div className="surface-hero relative overflow-hidden">
          {/* Claret margin rule marks this as the desk's signed verdict — the trace's payoff. */}
          <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-primary" />
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <persona.Icon size={12} className="text-primary" />
            <span className="field-key text-primary">{persona.answerLabel}</span>
            <span className="rule-fade ml-1 flex-1" />
          </div>
          <div
            className="prose-exec break-words px-4 py-4 text-[14px] leading-relaxed"
            // nosemgrep: react-dangerouslysetinnerhtml -- renderMarkdown escapes HTML first (lib/markdown.ts), XSS-safe
            dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.text) }}
          />
        </div>
      ),
    });
  }

  // Nothing yet but we're working → a single live "coordinating" node.
  if (!steps.length && live) {
    return (
      <div className="flex flex-col">
        <ThreadStep status="running" first last>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <div className="flex items-center gap-2 px-1 py-1.5 text-[13px] text-muted-foreground">
            Coordinating swarm…
          </div>
        </ThreadStep>
      </div>
    );
  }
  if (!steps.length) return null;

  // While busy on the last turn, the final step is the in-flight one — pulse its node.
  const liveIdx = live ? steps.length - 1 : -1;

  // Once the turn has settled, offer the authoritative CloudWatch span trace.
  const showTrace = !live && (showSwarm || toolItems.length > 0) && !!turn.startedAt;

  return (
    <div className="flex flex-col gap-3">
      {steps.map((s, i) => (
        <ThreadStep
          key={s.key}
          status={s.running || i === liveIdx ? 'running' : 'done'}
          first={i === 0}
          last={i === steps.length - 1 && !showTrace}
        >
          {s.node}
        </ThreadStep>
      ))}
      {showTrace && (
        <div className="pl-[30px]">
          <TraceView
            auth={auth}
            cfg={cfg}
            sessionId={threadId}
            startMs={turn.startedAt}
            endMs={turn.endedAt}
            turnKey={`${turn.id}:${turn.endedAt ?? 0}`}
          />
        </div>
      )}
    </div>
  );
}
