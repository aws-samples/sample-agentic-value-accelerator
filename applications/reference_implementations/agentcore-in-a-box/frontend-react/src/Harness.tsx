/**
 * Harness — "AgentCore Express", the config-only AgentCore Harness companion (production shape).
 *
 * DESIGN INTENT (the whole app already speaks AG-UI — this screen now does too):
 *   Every other agent surface in this app (ChatWorkspace) renders a turn as a LIVE AG-UI run — a
 *   connected thread with a working node, tool-call steps that appear as the loop invokes them, and
 *   the answer as the desk's signed verdict. AgentCore Express used to be a dead POST that dumped one
 *   static bubble beside a wall of config; that's why it read as flat. It is now a first-class
 *   AG-UI conversation, using the SAME thread/node/tool-card/answer language as ChatWorkspace so it
 *   feels native and premium — chat-first and full-width.
 *
 *   The "agent is configuration, not code" story is the point of the primitive, but it does NOT
 *   need to shout from four places at once. It lives in ONE spot: a Configuration slide-over
 *   (the ⚙ button in the header), which holds the full declared spec sheet — model, managed
 *   building blocks attached by reference, identity, execution-limit caps, the versions/endpoints
 *   rollout rail with admin rollback, and the system prompt. The header keeps only a compact,
 *   glanceable fact chip-row so the config is always one glance / one click away.
 *
 * Data:
 *   • GET  /harness            → the declared config (model, prompt, tools, limits, inbound auth).
 *   • GET  /harness/versions   → immutable versions + named endpoints (prod rollout surface).
 *   • POST /harness/endpoint   → admin repoint (rollback / promote); server re-checks admin.
 *   • POST /harness/invoke     → invoke AS THE SIGNED-IN USER (Cognito JWT inbound). Returns the
 *     assembled answer + stop reason + usage + `tool_uses` (real tools the managed loop ran) +
 *     `memory_recalled`. We stage that into an AG-UI-style run so the conversation feels live.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Boxes, X, Send, Loader2, Cpu, Brain, KeyRound, ArrowRight, SlidersHorizontal,
  GitBranch, ShieldCheck, Terminal, Globe, RotateCcw, Lock, Check, type LucideIcon,
} from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import { renderMarkdown } from './lib/markdown';
import { cn } from './lib/cn';

type Component = { kind: string; label: string; value: string; detail: string };
type Limits = {
  max_iterations?: number;
  max_tokens?: number;
  timeout_seconds?: number;
  truncation?: string;
  invoke_timeout_seconds?: number;
};
type HarnessInfo = {
  configured: boolean;
  name?: string;
  model?: string;
  model_id?: string;
  status?: string;
  version?: string;
  endpoint?: string;
  inbound_auth?: string;
  system_prompt?: string;
  components?: Component[];
  limits?: Limits;
  contrast?: string;
  tool_count?: number;
  note?: string;
};

type HVersion = { version: string; status: string; created_at: string; model_id?: string };
type HEndpoint = { name: string; target_version: string; status: string; description?: string };
type VersionsInfo = {
  configured: boolean;
  endpoint?: string;
  versions: HVersion[];
  endpoints: HEndpoint[];
  note?: string;
};

// One assistant turn, staged as a small AG-UI run: the tools the loop ran (honest, from the
// backend's `tool_uses`), then the streamed-in answer text.
type Step = { kind: 'tool'; name: string } | { kind: 'answer' };
type ChatTurn = {
  role: 'user' | 'assistant';
  text: string;
  meta?: string;
  error?: boolean;
  memory?: boolean;
  tools?: string[];
};

const COMPONENT_ICON: Record<string, LucideIcon> = {
  model: Cpu, code: Terminal, browser: Globe, memory: Brain, identity: KeyRound,
};

// Map a raw tool name from the managed loop to a friendly label + icon for the AG-UI step card.
function toolPresentation(name: string): { label: string; Icon: LucideIcon } {
  const n = (name || '').toLowerCase();
  if (n.includes('code') || n.includes('python') || n.includes('interpreter') || n.includes('repl'))
    return { label: 'Code Interpreter', Icon: Terminal };
  if (n.includes('browser') || n.includes('web') || n.includes('fetch') || n.includes('search'))
    return { label: 'Web Browser', Icon: Globe };
  if (n.includes('memory') || n.includes('recall'))
    return { label: 'Memory recall', Icon: Brain };
  return { label: name || 'tool', Icon: Boxes };
}

const SUGGESTIONS = [
  { label: 'Summarize my mandate from memory', hint: 'recalls your saved desk mandate', Icon: Brain },
  { label: 'Price a 10-year 5% annual-coupon bond at a 4.5% yield', hint: 'runs the code interpreter', Icon: Terminal },
  { label: 'What can a config-only harness do — and what needs the desk swarm?', hint: 'config vs. code', Icon: Boxes },
];

// Session id must be >= 33 chars; keep it stable across sends so the harness continues the
// conversation in the same microVM (and exercises AgentCore Memory).
function makeSessionId(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return 'harness-web-' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function Harness({
  auth, cfg, onClose, isAdmin = false, embedded = false,
}: {
  auth: Auth; cfg: AppConfig;
  /** Overlay-only: omitted when embedded as a control-panel section. */
  onClose?: () => void;
  /** Gate the version-rollback control (a governance action); server also enforces. */
  isAdmin?: boolean;
  /** Render inline inside the shell (drop the fixed overlay chrome + Close button). */
  embedded?: boolean;
}) {
  const [info, setInfo] = useState<HarnessInfo | null>(null);
  const [versions, setVersions] = useState<VersionsInfo | null>(null);
  const [prompt, setPrompt] = useState('');
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [rollbackMsg, setRollbackMsg] = useState<string | null>(null);
  const [sessionId] = useState(makeSessionId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the declared config + version history once on open.
  const loadVersions = useCallback(async () => {
    try {
      const resp = await fetch(`${cfg.API_URL}/harness/versions`, {
        headers: { Authorization: `Bearer ${auth.getIdToken()}` },
      });
      if (resp.ok) setVersions(await resp.json());
    } catch {
      /* versions rail is optional; the panel still works without it */
    }
  }, [auth, cfg]);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${cfg.API_URL}/harness`, {
          headers: { Authorization: `Bearer ${auth.getIdToken()}` },
        });
        if (resp.ok) setInfo(await resp.json());
      } catch {
        /* panel still works for invoke even if describe fails */
      }
    })();
    loadVersions();
  }, [auth, cfg, loadVersions]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat, busy]);

  const send = useCallback(async (text?: string) => {
    const m = (text ?? prompt).trim();
    if (!m || busy) return;
    setPrompt('');
    setChat((c) => [...c, { role: 'user', text: m }]);
    setBusy(true);
    try {
      const resp = await fetch(`${cfg.API_URL}/harness/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.getIdToken()}` },
        // The harness's JWT authorizer validates the `client_id` claim, which lives only on the
        // ACCESS token (the ID token used for the API-Gateway authorizer has `aud` instead). So we
        // forward the access token in the body for the harness to authenticate the real user.
        body: JSON.stringify({ message: m, session_id: sessionId, access_token: auth.getAccessToken() }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        setChat((c) => [...c, { role: 'assistant', text: body?.error || `Invoke failed (${resp.status})`, error: true }]);
      } else if (body.configured === false) {
        setChat((c) => [...c, { role: 'assistant', text: body.note || 'Harness not provisioned yet.', error: true }]);
      } else if (body.error && !body.text) {
        setChat((c) => [...c, { role: 'assistant', text: body.error, error: true }]);
      } else {
        const u = body.usage || {};
        const toks = u.totalTokens ?? u.total_tokens;
        const meta = [body.stop_reason && `stop: ${body.stop_reason}`, toks != null && `${toks} tokens`]
          .filter(Boolean).join(' · ');
        setChat((c) => [...c, {
          role: 'assistant',
          text: body.text || '(no text)',
          meta,
          memory: !!body.memory_recalled,
          tools: Array.isArray(body.tool_uses) ? body.tool_uses : [],
        }]);
      }
    } catch (e: any) {
      setChat((c) => [...c, { role: 'assistant', text: e?.message || 'Invoke failed', error: true }]);
    } finally {
      setBusy(false);
    }
  }, [auth, cfg, prompt, busy, sessionId]);

  // Admin-only: repoint the endpoint at a target version (rollback / promote). Server re-checks admin.
  const rollback = useCallback(async (targetVersion: string) => {
    if (!isAdmin || rollingBack) return;
    setRollingBack(targetVersion);
    setRollbackMsg(null);
    try {
      const resp = await fetch(`${cfg.API_URL}/harness/endpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.getIdToken()}` },
        body: JSON.stringify({ endpoint_name: versions?.endpoint || info?.endpoint || 'demo_endpoint', target_version: targetVersion }),
      });
      const body = await resp.json();
      if (!resp.ok || body.error) {
        setRollbackMsg(body?.error || `Rollback failed (${resp.status})`);
      } else {
        setRollbackMsg(`Endpoint ${body.action === 'created' ? 'created' : 'repointed'} → version ${targetVersion}`);
        await loadVersions();
      }
    } catch (e: any) {
      setRollbackMsg(e?.message || 'Rollback failed');
    } finally {
      setRollingBack(null);
    }
  }, [auth, cfg, isAdmin, rollingBack, versions, info, loadVersions]);

  const components = info?.components?.length ? info.components : FALLBACK_COMPONENTS;
  const limits = info?.limits;
  // The version the invoke endpoint currently serves (the endpoint's target).
  const activeEndpoint = (versions?.endpoints || []).find(
    (e) => e.name === (versions?.endpoint || info?.endpoint || 'demo_endpoint'),
  );
  // Compact glance chips for the header — the config is one look away, one click for the rest.
  const chips: string[] = [
    info?.model || 'Claude Sonnet 4.6',
    'Code Interpreter', 'Browser', 'Memory',
    info?.inbound_auth ? 'Per-user JWT' : 'JWT inbound',
  ];

  return (
    <div className={cn(
      'relative flex flex-col',
      embedded ? 'h-full' : 'fixed inset-0 z-[60] bg-background/95 backdrop-blur-md',
    )}>
      {/* ── Masthead: identity + compact fact chips + Config / status / Close ─────────────── */}
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-border bg-card/60 px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
              <Boxes size={18} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold tracking-tight">{info?.name || 'AgentCore Express'}</div>
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <div className="truncate text-[11.5px] text-muted-foreground">
                A managed AgentCore Harness — invoked as the signed-in user
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {info?.status && (
              <span className="hidden items-center gap-1.5 rounded-full bg-ok/12 px-2.5 py-1 text-[10.5px] font-semibold text-ok sm:flex">
                <span className="size-1.5 rounded-full bg-ok animate-pulse-dot" />{info.status}
              </span>
            )}
            {info?.version && (
              <span className="hidden rounded-full bg-secondary px-2.5 py-1 font-mono text-[10.5px] font-semibold text-muted-foreground sm:inline">v{info.version}</span>
            )}
            {/* The single home for the full spec sheet — dedup'd out of the conversation entirely. */}
            <button onClick={() => setConfigOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[12.5px] font-medium text-secondary-foreground transition-colors hover:bg-accent">
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <SlidersHorizontal size={14} /> Configuration
            </button>
            {!embedded && (
              <button onClick={onClose}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-lg border border-border bg-secondary text-secondary-foreground transition-colors hover:bg-accent">
                <X size={15} />
              </button>
            )}
          </div>
        </div>
        {/* Fact chip-row — glanceable config without a wall of text. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c, idx) => (
            <span key={c}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium',
                idx === 0
                  ? 'border-primary/25 bg-primary/[0.06] text-primary'
                  : 'border-border bg-secondary/50 text-muted-foreground',
              )}>
              {idx === 0 && <Cpu size={11} />}{c}
            </span>
          ))}
          {activeEndpoint && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2 py-1 font-mono text-[11px] text-muted-foreground">
              <GitBranch size={11} />{activeEndpoint.name} → v{activeEndpoint.target_version}
            </span>
          )}
        </div>
      </div>

      {/* ── Conversation — the hero, full-width. Renders each turn as an AG-UI run. ───────── */}
      <div ref={scrollRef} className="dot-grid min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className={cn('mx-auto flex min-h-full max-w-3xl flex-col gap-5',
          chat.length === 0 && 'justify-center')}>
          {chat.length === 0 && <EmptyState busy={busy} onPick={send} />}

          {chat.map((t, i) =>
            t.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] overflow-hidden whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-primary px-4 py-2.5 text-[14px] leading-relaxed text-primary-foreground">
                  {t.text}
                </div>
              </div>
            ) : t.error ? (
              <div key={i} className="panel-elevated overflow-hidden border-destructive/40">
                <div className="flex items-center gap-2 border-b border-border/70 bg-destructive/[0.06] px-4 py-2">
                  <Boxes size={12} className="text-destructive" />
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  <span className="field-key text-destructive">Harness error</span>
                </div>
                <div className="px-4 py-3 text-[13px] text-destructive">{t.text}</div>
              </div>
            ) : (
              <AssistantRun key={i} turn={t} />
            ),
          )}

          {busy && <WorkingNode />}
        </div>
      </div>

      {/* ── Composer ─────────────────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border bg-card/70 px-5 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-end gap-2.5 rounded-xl border border-input bg-elevated p-2 pl-3.5 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder="Ask AgentCore Express…"
            className="flex-1 resize-none self-center bg-transparent py-1 text-[13.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          {chat.length > 0 && (
            <button onClick={() => setChat([])} disabled={busy}
              title="New conversation"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40">
              <RotateCcw size={15} />
            </button>
          )}
          <button onClick={() => send()} disabled={busy || !prompt.trim()}
            aria-label="Send"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:brightness-110 enabled:hover:-translate-y-px disabled:opacity-40">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <p className="mx-auto mt-2 flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-1 text-center font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
          <span>Managed harness</span><span className="text-border">·</span>
          <span>invoked as signed-in user</span><span className="text-border">·</span>
          <span>memory across sessions</span>
        </p>
      </div>

      {/* ── Configuration slide-over — the ONE home for the full declared spec sheet ──────── */}
      {configOpen && (
        <ConfigDrawer
          info={info} components={components} limits={limits} versions={versions}
          activeEndpoint={activeEndpoint} isAdmin={isAdmin} rollingBack={rollingBack}
          rollbackMsg={rollbackMsg} onRollback={rollback} onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Empty state: a centered hero with suggestion tiles (chat-first, not a config dump). ── */
function EmptyState({ busy, onPick }: { busy: boolean; onPick: (t: string) => void }) {
  return (
    <div className="surface-hero relative mx-auto w-full max-w-xl overflow-hidden">
      <div className="flex items-center gap-3.5 border-b border-border px-6 pt-5 pb-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Boxes size={21} />
        </span>
        <div className="min-w-0">
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <h2 className="text-[18px] font-extrabold tracking-[-0.015em]">Talk to AgentCore Express</h2>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
            A managed harness loop — code interpreter, browser &amp; memory, invoked as you.
          </p>
        </div>
      </div>
      <div className="p-4">
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <div className="px-1 pb-2 field-key">Try asking</div>
        <div className="flex flex-col gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s.label} onClick={() => onPick(s.label)} disabled={busy}
              className="tile-interactive group flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 text-left disabled:opacity-50">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.Icon size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold leading-tight tracking-tight">{s.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{s.hint}</span>
              </span>
              <ArrowRight size={15} className="shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── A settled assistant turn, staged as an AG-UI run: real tool steps + the signed answer,
      on the app's connected-thread spine (same language as ChatWorkspace's AssistantThread). ── */
function AssistantRun({ turn }: { turn: ChatTurn }) {
  const steps: Step[] = [
    ...(turn.tools || []).map((name) => ({ kind: 'tool', name } as Step)),
    { kind: 'answer' },
  ];
  return (
    <div className="flex flex-col gap-3">
      {steps.map((s, i) => {
        const first = i === 0;
        const last = i === steps.length - 1;
        if (s.kind === 'tool') {
          const { label, Icon } = toolPresentation(s.name);
          return (
            <ThreadStep key={`t${i}`} first={first} last={last}>
              <div className="panel-elevated flex items-center gap-2.5 overflow-hidden px-3.5 py-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold leading-tight tracking-tight">{label}</div>
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Managed tool · invoked by the loop</div>
                </div>
                <Check size={13} className="shrink-0 text-ok" />
              </div>
            </ThreadStep>
          );
        }
        return (
          <ThreadStep key="ans" first={first} last={last}>
            <div className="surface-hero relative overflow-hidden">
              <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-primary" />
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <Boxes size={13} className="text-primary" />
                {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                <span className="field-key text-primary">AgentCore Express</span>
                {turn.memory && (
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-primary" title="Grounded in your saved mandate (AgentCore Memory)">
                    <Brain size={9} /> from memory
                  </span>
                )}
                {turn.meta && <span className="ml-auto font-mono text-[10px] text-muted-foreground">{turn.meta}</span>}
              </div>
              <div
                className="prose-exec break-words px-5 py-4 text-[14px] leading-relaxed"
                // nosemgrep: react-dangerouslysetinnerhtml -- renderMarkdown escapes HTML first (lib/markdown.ts), XSS-safe
                dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.text) }}
              />
            </div>
          </ThreadStep>
        );
      })}
    </div>
  );
}

/* ── Live "working" node while the turn runs — the AG-UI in-flight state, matching
      ChatWorkspace's "Coordinating…" node so the wait reads as an agent loop, not a spinner. ── */
function WorkingNode() {
  return (
    <ThreadStep first last status="running">
      {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
      <div className="flex items-center gap-2 px-1 py-1.5 text-[13px] text-muted-foreground">
        <Loader2 size={14} className="animate-spin text-primary" />
        AgentCore Express is working…
      </div>
    </ThreadStep>
  );
}

/* ── The connected-thread spine primitive, identical language to ChatWorkspace's ThreadStep. ── */
function ThreadStep({
  children, first, last, status = 'done',
}: {
  children: ReactNode; first?: boolean; last?: boolean; status?: 'done' | 'running';
}) {
  return (
    <div className={cn('thread-step animate-fade-rise', first && 'is-first', last && 'is-last')}>
      <span className={cn('thread-node', status === 'running' ? 'is-running' : 'is-done')} />
      {children}
    </div>
  );
}

/* ── Configuration slide-over: the single, complete home for the declared spec sheet. ─────── */
function ConfigDrawer({
  info, components, limits, versions, activeEndpoint,
  isAdmin, rollingBack, rollbackMsg, onRollback, onClose,
}: {
  info: HarnessInfo | null;
  components: Component[];
  limits?: Limits;
  versions: VersionsInfo | null;
  activeEndpoint?: HEndpoint;
  isAdmin: boolean;
  rollingBack: string | null;
  rollbackMsg: string | null;
  onRollback: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex justify-end">
      {/* Scrim */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-rise" onClick={onClose} />
      {/* Panel */}
      <aside className="relative flex h-full w-full max-w-[420px] flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-primary" />
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <span className="text-[14px] font-bold tracking-tight">Configuration</span>
          </div>
          <button onClick={onClose} aria-label="Close configuration"
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent">
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="panel-elevated overflow-hidden">
            {/* Model head */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
                <Cpu size={18} />
              </span>
              <div className="min-w-0 flex-1">
                {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                <div className="field-key">Foundation model</div>
                <div className="truncate text-[15px] font-bold tracking-tight">{info?.model || 'Claude Sonnet 4.6'}</div>
              </div>
            </div>

            {/* The ONE statement of the config-not-code story (dedup'd from the old 4 places). */}
            <div className="border-t border-border bg-primary/[0.04] px-4 py-3">
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary">Configuration, not code</div>
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                {info?.contrast
                  || 'Declared entirely as config — model, system prompt, tool & memory references, and limits — and authenticated as the signed-in user. No container, no orchestration code, versus the desks’ hand-built Strands swarm on AgentCore Runtime.'}
              </p>
            </div>

            {/* Attached by reference */}
            <RowGroup icon={Boxes} label="Attached by reference">
              {components.filter((c) => c.kind !== 'model').map((c) => {
                const Icon = COMPONENT_ICON[c.kind] || Cpu;
                return (
                  <div key={c.kind} className="flex gap-3 px-4 py-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold leading-tight tracking-tight">{c.value}</div>
                      <div className="mt-0.5 text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{c.label}</div>
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground/85">{c.detail}</p>
                    </div>
                  </div>
                );
              })}
            </RowGroup>

            {/* Identity */}
            {info?.inbound_auth && (
              <div className="flex items-start gap-2.5 border-t border-border bg-ok/[0.05] px-4 py-3">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-ok" />
                <div className="min-w-0">
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  <div className="text-[12px] font-semibold text-foreground">Runs as you, not a shared role</div>
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {info.inbound_auth}. Long-term memory is recalled from the same AgentCore Memory the desks write.
                  </p>
                </div>
              </div>
            )}

            {/* Execution limits */}
            {limits && (
              <RowGroup label="Execution limits">
                <dl className="divide-y divide-border/60">
                  {limits.max_iterations != null && <LimitRow label="Max iterations" value={String(limits.max_iterations)} />}
                  {limits.max_tokens != null && <LimitRow label="Max tokens" value={limits.max_tokens.toLocaleString()} />}
                  {limits.timeout_seconds != null && <LimitRow label="Turn timeout" value={`${limits.timeout_seconds}s`} />}
                  {limits.truncation && <LimitRow label="Truncation" value={limits.truncation.replace(/_/g, ' ')} />}
                </dl>
              </RowGroup>
            )}

            {/* Versions & endpoints */}
            <RowGroup icon={GitBranch} label="Versions & endpoints">
              <div className="px-4 py-3">
                {activeEndpoint && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="font-mono text-muted-foreground">{activeEndpoint.name}</span>
                    <ArrowRight size={11} className="text-muted-foreground" />
                    <span className="font-mono font-semibold text-foreground">v{activeEndpoint.target_version}</span>
                    <span className="ml-auto rounded-full bg-ok/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ok">{activeEndpoint.status}</span>
                  </div>
                )}
                <div className={cn('flex flex-col gap-1.5', activeEndpoint && 'mt-2.5')}>
                  {(versions?.versions || []).length === 0 && (
                    /* nosemgrep: jsx-not-internationalized (single-locale demo) */
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {versions?.note || 'One immutable version so far — each config change adds another; endpoints pin a version.'}
                    </p>
                  )}
                  {(versions?.versions || []).map((v) => {
                    const isActive = activeEndpoint?.target_version === v.version;
                    return (
                      <div key={v.version}
                        className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11.5px]',
                          isActive ? 'border-primary/30 bg-primary/[0.05]' : 'border-border/70 bg-elevated/40')}>
                        <span className="font-mono font-semibold">v{v.version}</span>
                        {isActive && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">live</span>}
                        <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">{v.model_id || v.status}</span>
                        {isAdmin && !isActive && (
                          <button
                            onClick={() => onRollback(v.version)}
                            disabled={rollingBack != null}
                            title={`Repoint the endpoint to version ${v.version}`}
                            className="flex items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-accent disabled:opacity-50">
                            {rollingBack === v.version ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                            Use
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {rollbackMsg && (
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-ok"><Check size={11} /> {rollbackMsg}</p>
                )}
                {!isAdmin && (versions?.versions || []).length > 1 && (
                  /* nosemgrep: jsx-not-internationalized (single-locale demo) */
                  <p className="mt-2 flex items-center gap-1 text-[10.5px] text-muted-foreground">
                    <Lock size={10} /> Repointing an endpoint is a governance action — admin only.
                  </p>
                )}
              </div>
            </RowGroup>

            {/* System prompt */}
            {info?.system_prompt && (
              <RowGroup label="System prompt">
                <p className="max-h-40 overflow-y-auto px-4 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
                  {info.system_prompt}
                </p>
              </RowGroup>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

/** A titled section inside the spec sheet: a hairline-topped label bar + its rows. */
function RowGroup({ icon: Icon, label, children }: { icon?: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border">
      <div className="flex items-center gap-2 bg-secondary/25 px-4 py-2">
        {Icon && <Icon size={12} className="text-primary" />}
        <span className="field-key">{label}</span>
      </div>
      <div className="divide-y divide-border/60">{children}</div>
    </section>
  );
}

/** A key/value ledger row: mono value right-aligned against a quiet label. */
function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2">
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className="tabular text-[12.5px] font-semibold">{value}</dd>
    </div>
  );
}

// Shown if GET /harness hasn't returned yet — matches the deploy.sh-declared shape.
const FALLBACK_COMPONENTS: Component[] = [
  { kind: 'model', label: 'Foundation model', value: 'Claude Sonnet 4.6', detail: 'Managed ConverseStream loop (Strands) — no container, no orchestration code.' },
  { kind: 'code', label: 'Code interpreter', value: 'AgentCore Code Interpreter', detail: 'A managed Python/JS sandbox — declared as a tool, no sandbox code to run.' },
  { kind: 'browser', label: 'Web browser', value: 'AgentCore Browser', detail: 'A managed headless browser for live lookups — declared, not built.' },
  { kind: 'memory', label: 'Long-term memory', value: 'AgentCore Memory', detail: 'The same memory store the desks use — recalls the user mandate across sessions.' },
  { kind: 'identity', label: 'Inbound auth', value: 'Cognito JWT (per-user)', detail: 'The caller signs in with their own Cognito token — the harness runs as the signed-in user, not a shared service role.' },
];
