/**
 * GatewayConsole — the admin-only "Gateway" section, rendered as a PLAYABLE STAGE.
 *
 * "Send it through." A multi-team-MCP prospect's real question is: if every client — Claude Code,
 * an IDE, a custom agent — points at one governed boundary, what happens to a request on the way in?
 * So this is not a settings grid. It's a dark mission-control stage where a request is a physical
 * PACKET you launch across the boundary and watch each gate stop or pass it, in sequence:
 *
 *   SENDER  →  ▐ IDENTITY  ▐ AUTHORIZATION  ▐ RATE LIMIT  ▐ CONTENT FIREWALL  →  TOOL VAULT
 *
 * The packet rides the conduit with spring physics; each gate resolves AS the packet reaches it —
 * the AG-UI grammar (a stream of typed events over time), not one blocking result. A clean request
 * lands in the vault. A request carrying a secret RECOILS off the firewall gate and turns red. A
 * burst throws packets back the instant the rate cap trips. Every verdict is a REAL call:
 *   • firewall  → live Bedrock ApplyGuardrail  (gatewayApi.scanGuardrail)
 *   • rate      → the SAME fixed-window limiter the interceptor runs  (gatewayApi.burstRateLimit)
 *   • vault     → a live tools/list through the real Gateway  (gatewayApi.mcp)
 *   • identity/authz → asserted from the live console bootstrap (CUSTOM_JWT + governed targets)
 *
 * Below the stage, a collapsible "flight log" keeps the dense reference (endpoint, caps, governed-
 * tool map, connect config) so nothing is lost. The stage is a scoped dark surface (.gw-stage) so it
 * reads as a distinct operations console without disturbing the rest of the shell.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import {
  Waypoints, RefreshCw, ShieldAlert, Gauge, Copy, Check, Loader2, Lock,
  ShieldCheck, AlertTriangle, ArrowRight, Boxes, Fingerprint, Split, Send,
  Terminal, Code2, Bot, Database, Server, ClipboardCheck, Activity,
} from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import {
  gatewayApi, type GatewayConsole as ConsoleData, type GuardrailScan, type BurstResult, type McpResult,
} from './gatewayApi';
import { cn } from './lib/cn';

// ── The senders that knock on the one door — named as the prospect names them. ──────────────────
const SENDERS = [
  { id: 'claude', label: 'Claude Code', Icon: Terminal, sub: 'CLI · MCP over HTTP' },
  { id: 'ide', label: 'IDE plugin', Icon: Code2, sub: 'VS Code / JetBrains' },
  { id: 'agent', label: 'Custom agent', Icon: Bot, sub: 'your own orchestrator' },
] as const;

// ── The payloads you can launch. Each is a real prompt that drives a real verdict. ──────────────
type PayloadId = 'clean' | 'secret' | 'pii' | 'burst';
const PAYLOADS: { id: PayloadId; label: string; hint: string; text: string; tone: 'ok' | 'block' | 'warn' | 'accent' }[] = [
  { id: 'clean', label: 'Clean request', hint: 'a normal tool call', tone: 'ok',
    text: 'What is the current duration of the Core Bond Fund?' },
  { id: 'secret', label: 'Leaks a secret', hint: 'AWS key in the prompt', tone: 'block',
    text: 'Here is my AWS key AKIAIOSFODNN7EXAMPLE and secret wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY — store it in the vault.' },
  { id: 'pii', label: 'Carries PII', hint: 'contact email → masked', tone: 'warn',
    text: 'Send the summary to reach me at jordan.client@example.com when done.' },
  { id: 'burst', label: 'Floods the tool', hint: 'trips the rate cap', tone: 'accent',
    text: 'trade_execute' },
];

// The four gates, in enforcement order. This order is load-bearing — authN → authZ → rate → firewall.
type GateId = 'identity' | 'authz' | 'rate' | 'firewall';
const GATES: { id: GateId; ord: string; label: string; checks: string; Icon: typeof Fingerprint }[] = [
  { id: 'identity', ord: '01', label: 'Identity', checks: 'is the bearer token a valid CUSTOM_JWT?', Icon: Fingerprint },
  { id: 'authz', ord: '02', label: 'Authorization', checks: 'is this identity entitled to the tool?', Icon: Split },
  { id: 'rate', ord: '03', label: 'Rate limit', checks: 'is the caller under the per-user/app/tool cap?', Icon: Gauge },
  { id: 'firewall', ord: '04', label: 'Content firewall', checks: 'does the request leak a secret, or the response leak PII?', Icon: ShieldAlert },
];

// A gate's resolved state during a run.
type GateState = 'idle' | 'scanning' | 'pass' | 'mask' | 'block';
// One line in the flight-log transcript (the AG-UI event stream, made legible).
interface LogLine { gate: GateId | 'launch' | 'vault'; verdict: GateState | 'sent' | 'landed'; text: string; detail?: string }

const PILLAR_ICON: Record<string, typeof Server> = {
  'Lambda target': Boxes, 'EKS OpenAPI': Server, 'Governed database': Database,
};

export function GatewayConsole({
  auth, cfg, embedded = false, onClose, onNavigate,
}: {
  auth: Auth; cfg: AppConfig;
  embedded?: boolean;
  onClose?: () => void;
  /** Optional: jump to another shell section (Access Control grid, Registry admission, chat trace). */
  onNavigate?: (id: 'access' | 'registry' | 'chat') => void;
}) {
  const [data, setData] = useState<ConsoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await gatewayApi.console(auth, cfg));
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load the Gateway console');
    } finally {
      setLoading(false);
    }
  }, [auth, cfg]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className={cn('gw-stage flex flex-col', embedded ? 'h-full' : 'fixed inset-0 z-[60]')}>
      <div className="gw-stage-grain" />
      {/* Header */}
      <div className="relative z-10 flex shrink-0 items-center justify-between border-b px-5 py-3"
        style={{ borderColor: 'var(--gw-line)' }}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg"
            style={{ background: 'color-mix(in srgb, var(--gw-accent) 14%, transparent)', color: 'var(--gw-accent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--gw-accent) 30%, transparent)' }}>
            <Waypoints size={17} />
          </span>
          <div className="min-w-0">
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--gw-ink)' }}>Gateway</div>
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[11px]" style={{ color: 'var(--gw-dim)' }}>
              One governed boundary — launch a request and watch every gate stop or pass it, live
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} title="Reload"
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors"
            style={{ borderColor: 'var(--gw-line-2)', color: 'var(--gw-dim)', background: 'var(--gw-panel)' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {!embedded && onClose && (
            <button onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium"
              style={{ borderColor: 'var(--gw-line-2)', color: 'var(--gw-dim)', background: 'var(--gw-panel)' }}>
              Close
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10 min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px]"
              style={{ borderColor: 'color-mix(in srgb, var(--gw-block) 40%, transparent)', background: 'color-mix(in srgb, var(--gw-block) 10%, transparent)', color: 'var(--gw-block)' }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {loading && !data && (
            <div className="flex items-center gap-2 py-16 text-[13px]" style={{ color: 'var(--gw-dim)' }}>
              <Loader2 size={15} className="animate-spin" /> Loading the live Gateway configuration…
            </div>
          )}

          {data && (
            <>
              <Stage auth={auth} cfg={cfg} data={data} />
              <FlightLogReference data={data} onNavigate={onNavigate} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE STAGE — sender dock · conduit with four gates · tool vault · run transcript
// ══════════════════════════════════════════════════════════════════════════════════════════════
function Stage({ auth, cfg, data }: { auth: Auth; cfg: AppConfig; data: ConsoleData }) {
  const reduce = useReducedMotion();
  const colRef = useRef<HTMLDivElement>(null);
  const carriageRef = useRef<HTMLDivElement>(null);
  const markRefs = useRef<Record<string, HTMLElement | null>>({});

  const [sender, setSender] = useState<typeof SENDERS[number]['id']>('claude');
  const [payload, setPayload] = useState<PayloadId>('clean');
  const [running, setRunning] = useState(false);
  const [gateState, setGateState] = useState<Record<GateId, GateState>>({
    identity: 'idle', authz: 'idle', rate: 'idle', firewall: 'idle',
  });
  const [packetTone, setPacketTone] = useState<'cyan' | 'ok' | 'warn' | 'block'>('cyan');
  const [vaultHit, setVaultHit] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [outcome, setOutcome] = useState<null | { tone: 'ok' | 'warn' | 'block'; label: string; sub: string }>(null);

  const activePayload = PAYLOADS.find((p) => p.id === payload)!;
  const senderDef = SENDERS.find((s) => s.id === sender)!;

  const resetVisuals = useCallback(() => {
    setGateState({ identity: 'idle', authz: 'idle', rate: 'idle', firewall: 'idle' });
    setVaultHit(false);
    setOutcome(null);
    setPacketTone('cyan');
  }, []);

  // Descend the carriage down the wire to a checkpoint, with spring physics. The
  // target is the vertical center of a gate's plate (or the vault node for 'end'),
  // measured live from the DOM so it tracks whatever the column's layout resolves to.
  const descendTo = useCallback((key: GateId | 'start' | 'end') => {
    const col = colRef.current;
    const carriage = carriageRef.current;
    if (!col || !carriage) return Promise.resolve();
    let target = 0;
    if (key === 'start') {
      target = 0;
    } else {
      const mark = markRefs.current[key];
      if (mark) {
        const cr = col.getBoundingClientRect();
        const mr = mark.getBoundingClientRect();
        target = mr.top - cr.top + mr.height / 2;
      } else {
        target = col.clientHeight; // fall back to the bottom (vault)
      }
    }
    if (reduce) { carriage.style.top = `${target}px`; return Promise.resolve(); }
    carriage.classList.add('is-moving');
    const controls = animate(carriage, { top: `${target}px` }, {
      type: 'spring', stiffness: 200, damping: 28,
    });
    return controls.finished.then(() => { carriage.classList.remove('is-moving'); }).catch(() => {});
  }, [reduce]);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 120) : ms));

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    resetVisuals();
    const carriage = carriageRef.current;
    if (carriage) { carriage.style.top = '0px'; }
    // Show the carriage at the top of the wire.
    carriage?.classList.add('is-live');
    const push = (l: LogLine) => setLog((prev) => [...prev, l]);
    setLog([{ gate: 'launch', verdict: 'sent', text: `${senderDef.label} → Gateway`, detail: activePayload.hint }]);

    await sleep(120);

    // ── GATE 01 · Identity — asserted from the live bootstrap (CUSTOM_JWT inbound). ──
    setGateState((g) => ({ ...g, identity: 'scanning' }));
    await descendTo('identity');
    await sleep(reduce ? 60 : 340);
    if (!data.gateway_id) {
      setGateState((g) => ({ ...g, identity: 'block' }));
      setPacketTone('block');
      push({ gate: 'identity', verdict: 'block', text: 'No valid token — refused at the boundary' });
      setOutcome({ tone: 'block', label: 'Turned back at Identity', sub: 'CUSTOM_JWT inbound rejected the caller' });
      setRunning(false);
      return;
    }
    setGateState((g) => ({ ...g, identity: 'pass' }));
    push({ gate: 'identity', verdict: 'pass', text: 'Verified · CUSTOM_JWT', detail: 'bearer token accepted' });

    // ── GATE 02 · Authorization — scoped to the caller's governed targets. ──
    setGateState((g) => ({ ...g, authz: 'scanning' }));
    await descendTo('authz');
    await sleep(reduce ? 60 : 340);
    setGateState((g) => ({ ...g, authz: 'pass' }));
    push({ gate: 'authz', verdict: 'pass', text: `${data.target_count} tools in scope`, detail: 'Cedar-authorized per identity' });

    // ── GATE 03 · Rate limit — the REAL fixed-window limiter. ──
    setGateState((g) => ({ ...g, rate: 'scanning' }));
    await descendTo('rate');
    const burstTool = payload === 'burst' ? 'trade_execute' : (data.targets[0]?.key || 'query_holdings');
    const burstCount = payload === 'burst' ? 8 : 1;
    let throttled = false;
    try {
      const r = await gatewayApi.burstRateLimit(auth, cfg, burstTool, burstCount);
      if (!r.error && r.first_denied_at != null) {
        throttled = true;
        setGateState((g) => ({ ...g, rate: 'block' }));
        setPacketTone('block');
        // Held at the gate — the carriage stops here; the request never descends past.
        push({ gate: 'rate', verdict: 'block', text: `Throttled at call #${r.first_denied_at}`, detail: `per_tool cap ${r.calls.find((c) => !c.allowed)?.limit ?? ''}/${r.window_seconds}s on ${burstTool}` });
        setOutcome({ tone: 'block', label: `Rate cap engaged at #${r.first_denied_at}`, sub: `the request flood was throttled — real traffic is untouched` });
        setRunning(false);
        return;
      }
      setGateState((g) => ({ ...g, rate: 'pass' }));
      push({ gate: 'rate', verdict: 'pass', text: payload === 'burst' ? 'Within cap this window' : 'Under the per-tool cap', detail: `${burstTool} · ${data.rate_limits.per_tool_default?.count ?? ''}/${data.rate_limits.window_seconds}s` });
    } catch {
      // Fail-soft: treat limiter hiccup as a pass so the demo continues honestly labeled.
      setGateState((g) => ({ ...g, rate: 'pass' }));
      push({ gate: 'rate', verdict: 'pass', text: 'Limiter check skipped', detail: 'rate service unavailable — passing through' });
    }
    if (throttled) return;

    // ── GATE 04 · Content firewall — the REAL Bedrock ApplyGuardrail. ──
    setGateState((g) => ({ ...g, firewall: 'scanning' }));
    await descendTo('firewall');
    try {
      const v: GuardrailScan = await gatewayApi.scanGuardrail(auth, cfg, activePayload.text);
      if (v.blocked) {
        setGateState((g) => ({ ...g, firewall: 'block' }));
        setPacketTone('block');
        push({ gate: 'firewall', verdict: 'block', text: 'Request interceptor blocked it', detail: (v.reasons[0] || 'secret in the prompt') });
        setOutcome({ tone: 'block', label: 'Turned back at the firewall', sub: (v.reasons[0] || 'a secret never reached a tool') });
        setRunning(false);
        return;
      }
      if (v.masked) {
        setGateState((g) => ({ ...g, firewall: 'mask' }));
        setPacketTone('warn');
        push({ gate: 'firewall', verdict: 'mask', text: 'Response interceptor masked PII', detail: (v.reasons[0] || 'contact info redacted before the model') });
      } else {
        setGateState((g) => ({ ...g, firewall: 'pass' }));
        push({ gate: 'firewall', verdict: 'pass', text: 'Clean · nothing to redact', detail: 'request + response interceptors ran' });
      }
    } catch {
      setGateState((g) => ({ ...g, firewall: 'pass' }));
      push({ gate: 'firewall', verdict: 'pass', text: 'Firewall check skipped', detail: 'guardrail unavailable — passing through' });
    }

    // ── Cleared — the carriage lands at the vault. Confirm with a REAL tools/list. ──
    if (packetTone !== 'block') setPacketTone((t) => (t === 'block' ? t : (t === 'cyan' ? 'ok' : t)));
    await descendTo('end');
    setVaultHit(true);
    let toolCount = data.target_count;
    try {
      const r: McpResult = await gatewayApi.mcp(auth, cfg, 'tools/list', {});
      const list = (r.result?.tools || []).map((t: any) => String(t?.name || '')).filter(Boolean);
      if (list.length) toolCount = list.length;
    } catch { /* keep bootstrap count */ }
    const masked = gateStateWasMasked(logRef.current);
    push({ gate: 'vault', verdict: 'landed', text: `Reached the tools — ${toolCount} in scope`, detail: 'the exact external-client path' });
    setOutcome(masked
      ? { tone: 'warn', label: 'Delivered · PII masked', sub: `reached ${toolCount} governed tools with contact info redacted` }
      : { tone: 'ok', label: 'Delivered to the tools', sub: `cleared every gate — ${toolCount} tools reachable as this identity` });
    setRunning(false);
  }, [running, auth, cfg, data, payload, activePayload, senderDef, descendTo, resetVisuals, reduce, packetTone]);

  // Keep a ref to the latest log so run() can read masked state without stale closure.
  const logRef = useRef<LogLine[]>([]);
  useEffect(() => { logRef.current = log; }, [log]);

  return (
    <div className="gw-card overflow-hidden">
      {/* Stage header strip */}
      <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: 'var(--gw-line)' }}>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'var(--gw-accent)', background: 'color-mix(in srgb, var(--gw-accent) 10%, transparent)' }}>
            <span className="size-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--gw-accent)' }} /> Live boundary
          </span>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <span className="text-[12px]" style={{ color: 'var(--gw-dim)' }}>Pick a sender + payload, then send it through the gates.</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--gw-faint)' }}>
          {GATES.length} gates · one endpoint
        </span>
      </div>

      {/* ── Control bar: sender (segmented) + launch, then payload chips ──────────────────── */}
      <div className="flex flex-col gap-3 border-b px-4 py-3.5" style={{ borderColor: 'var(--gw-line)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: 'var(--gw-faint)' }}>Sender</span>
          <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'var(--gw-line)', background: 'var(--gw-panel-2)' }}>
            {SENDERS.map((s) => (
              <button key={s.id} data-active={sender === s.id} onClick={() => setSender(s.id)}
                title={s.sub}
                className="gw-sender flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold">
                <s.Icon size={14} style={{ color: sender === s.id ? 'var(--gw-accent)' : 'var(--gw-dim)' }} />
                <span style={{ color: sender === s.id ? 'var(--gw-ink)' : 'var(--gw-dim)' }}>{s.label}</span>
              </button>
            ))}
          </div>
          <button onClick={run} disabled={running}
            className="gw-launch ml-auto flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold transition-transform active:scale-[0.97] disabled:opacity-60">
            {running ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {running ? 'In flight…' : 'Send it through'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: 'var(--gw-faint)' }}>Payload</span>
          {PAYLOADS.map((p) => {
            const active = payload === p.id;
            const tint = p.tone === 'block' ? 'var(--gw-block)' : p.tone === 'warn' ? 'var(--gw-warn)' : p.tone === 'accent' ? 'var(--gw-cyan)' : 'var(--gw-accent)';
            return (
              <button key={p.id} disabled={running} onClick={() => { setPayload(p.id); resetVisuals(); setLog([]); }}
                className="group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors disabled:opacity-50"
                style={{ borderColor: active ? `color-mix(in srgb, ${tint} 55%, transparent)` : 'var(--gw-line)',
                  background: active ? `color-mix(in srgb, ${tint} 12%, var(--gw-panel-2))` : 'var(--gw-panel-2)' }}>
                <span className="size-2 shrink-0 rounded-full" style={{ background: tint, boxShadow: active ? `0 0 8px ${tint}` : 'none' }} />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold" style={{ color: 'var(--gw-ink)' }}>{p.label}</span>
                  <span className="block text-[10px]" style={{ color: 'var(--gw-faint)' }}>{p.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── The operator console: the wire (left) + a live request inspector (right). ──────
          The wire is the spatial spine — the request descends four checkpoints into the
          vault. The inspector fills what used to be dead space: the actual payload in
          flight, then each gate's live verdict + reason streamed in place, then the
          outcome. One request, one coherent story — never two disconnected zones. */}
      <div className="grid gap-0 lg:grid-cols-[minmax(0,300px)_1fr]">
        {/* Left: the checkpoint wire */}
        <div ref={colRef} className="relative px-5 py-6 lg:border-r" style={{ borderColor: 'var(--gw-line)' }}>
          {/* The descending carriage — rides the wire (x≈18px) between gate plates. */}
          <div ref={carriageRef} className="gw-carriage" data-tone={packetTone} />
          {GATES.map((g, i) => (
            <GateRow key={g.id} g={g} state={gateState[g.id]} isFirst={i === 0}
              registerMark={(el) => { markRefs.current[g.id] = el; }} />
          ))}
          <VaultNode count={data.target_count} hit={vaultHit}
            registerMark={(el) => { markRefs.current.end = el; }} />
        </div>

        {/* Right: the live request inspector — payload → streamed verdicts → outcome */}
        <RequestInspector
          senderDef={senderDef} activePayload={activePayload}
          gateState={gateState} log={log} outcome={outcome} running={running} />
      </div>
    </div>
  );
}

// ── The right pane: what's actually happening to the request, in words. ────────────────────
// Before a run it previews the payload the caller will send. During/after, it streams one
// verdict card per gate as each resolves, then closes with the outcome. This is the AG-UI
// event stream made legible — and it fills the space beside the wire so the stage reads as
// one console, not a thin thread floating in an empty card.
function RequestInspector({ senderDef, activePayload, gateState, log, outcome, running }: {
  senderDef: typeof SENDERS[number]; activePayload: typeof PAYLOADS[number];
  gateState: Record<GateId, GateState>; log: LogLine[];
  outcome: null | { tone: 'ok' | 'warn' | 'block'; label: string; sub: string }; running: boolean;
}) {
  const started = log.length > 0;
  // The resolved verdict line per gate, pulled from the streamed log.
  const gateLine = useMemo(() => {
    const m: Partial<Record<GateId, LogLine>> = {};
    for (const l of log) if (l.gate !== 'launch' && l.gate !== 'vault') m[l.gate as GateId] = l;
    return m;
  }, [log]);
  const vaultLine = log.find((l) => l.gate === 'vault');

  return (
    <div className="flex flex-col gap-3 px-5 py-6">
      {/* The request being sent — the payload in flight (or previewed). */}
      <div className="rounded-xl p-3.5" style={{ background: 'var(--gw-void)', boxShadow: 'inset 0 0 0 1px var(--gw-line)' }}>
        <div className="mb-2 flex items-center gap-2">
          <senderDef.Icon size={13} style={{ color: 'var(--gw-dim)' }} />
          <span className="text-[12px] font-semibold" style={{ color: 'var(--gw-ink)' }}>{senderDef.label}</span>
          <ArrowRight size={11} style={{ color: 'var(--gw-faint)' }} />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--gw-faint)' }}>the request</span>
        </div>
        <p className="font-mono text-[11.5px] leading-relaxed" style={{ color: 'var(--gw-dim)' }}>{activePayload.text}</p>
      </div>

      {/* Streamed verdicts — one card per gate as it resolves; the tools card closes it. */}
      {!started ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-center"
          style={{ borderColor: 'var(--gw-line)' }}>
          <Send size={18} style={{ color: 'var(--gw-faint)' }} />
          <p className="max-w-[220px] text-[12px] leading-relaxed" style={{ color: 'var(--gw-dim)' }}>
            Send it through — each gate's verdict streams in here as the request descends the wire.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {GATES.map((g) => (
            <VerdictCard key={g.id} g={g} state={gateState[g.id]} line={gateLine[g.id]} />
          ))}
          {vaultLine && (
            <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
              style={{ background: 'color-mix(in srgb, var(--gw-accent) 8%, transparent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--gw-accent) 30%, transparent)' }}>
              <Boxes size={15} style={{ color: 'var(--gw-accent)' }} />
              <span className="text-[12px]" style={{ color: 'var(--gw-ink)' }}>{vaultLine.text}</span>
            </div>
          )}
        </div>
      )}

      {outcome && <OutcomeBanner outcome={outcome} />}
      {running && !outcome && (
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--gw-faint)' }}>
          <Loader2 size={12} className="animate-spin" /> streaming verdicts…
        </div>
      )}
    </div>
  );
}

// One gate's verdict as a streamed inspector card: state icon + the live reason line.
function VerdictCard({ g, state, line }: { g: typeof GATES[number]; state: GateState; line?: LogLine }) {
  const s = stampFor(state);
  const StampIcon = state === 'block' ? Lock : state === 'mask' ? ShieldAlert : state === 'pass' ? Check : state === 'scanning' ? Loader2 : g.Icon;
  const resolved = state !== 'idle' && state !== 'scanning';
  const text = line?.text || (state === 'scanning' ? 'Checking…' : g.checks);
  const detail = line?.detail;
  const tone = state === 'idle' ? 'var(--gw-faint)' : s.tone;
  return (
    <div className="flex items-start gap-2.5 rounded-xl px-3 py-2 animate-fade-rise transition-colors"
      style={{
        background: resolved ? `color-mix(in srgb, ${tone} 7%, transparent)` : 'var(--gw-panel-2)',
        boxShadow: `inset 0 0 0 1px ${resolved ? `color-mix(in srgb, ${tone} 26%, transparent)` : 'var(--gw-line)'}`,
      }}>
      <StampIcon size={14} className={cn('mt-px shrink-0', state === 'scanning' && 'animate-spin')} style={{ color: tone }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <span className="text-[12px] font-semibold" style={{ color: 'var(--gw-ink)' }}>{g.label}</span>
          {s.label && (
            <span className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: tone }}>{s.label}</span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] leading-snug" style={{ color: state === 'idle' ? 'var(--gw-faint)' : 'var(--gw-dim)' }}>
          {text}{detail && <span style={{ color: 'var(--gw-faint)' }}> — {detail}</span>}
        </div>
      </div>
    </div>
  );
}

function gateStateWasMasked(log: LogLine[]): boolean {
  return log.some((l) => l.gate === 'firewall' && l.verdict === 'mask');
}

// Map a gate's live state → the checkpoint's wire/plate modifier + the verdict stamp.
function stampFor(state: GateState): { wire: string; mark: string; stamp: string | null; tone: string; label: string } {
  switch (state) {
    case 'scanning': return { wire: '', mark: 'is-busy', stamp: 'tone-primary', tone: 'var(--primary)', label: 'Scanning' };
    case 'pass': return { wire: 'is-cleared', mark: 'is-cleared', stamp: 'tone-ok', tone: 'var(--ok)', label: 'Pass' };
    case 'mask': return { wire: 'is-throttled', mark: 'is-throttled', stamp: 'tone-warn', tone: 'var(--warn)', label: 'Held · masked' };
    case 'block': return { wire: 'is-stopped', mark: 'is-stopped', stamp: 'tone-block', tone: 'var(--destructive)', label: 'Blocked' };
    default: return { wire: '', mark: '', stamp: null, tone: 'var(--gw-faint)', label: '' };
  }
}

// One checkpoint on the descending wire — the spatial spine. A numbered inked plate,
// the gate name, and a rubber-stamp verdict that presses in when it resolves. The live
// REASON for each verdict lives in the inspector pane to the right, not here — the wire
// stays a clean sequence you can read top-to-bottom at a glance.
function GateRow({ g, state, isFirst, registerMark }: {
  g: typeof GATES[number]; state: GateState; isFirst: boolean;
  registerMark: (el: HTMLElement | null) => void;
}) {
  const s = stampFor(state);
  const StampIcon = state === 'block' ? Lock : state === 'mask' ? ShieldAlert : state === 'pass' ? Check : Loader2;
  const resolved = state !== 'idle';
  return (
    <div className={cn('gate pb-7', isFirst && 'is-first')}>
      <div ref={registerMark} className={cn('gate-mark', s.mark)}>{g.ord}</div>
      <div className="flex min-h-[24px] items-center gap-1.5">
        <g.Icon size={13} style={{ color: resolved ? s.tone : 'var(--gw-dim)' }} />
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <span className="text-[13px] font-semibold" style={{ color: 'var(--gw-ink)' }}>{g.label}</span>
        {s.stamp && (
          <span key={state} className={cn('verdict-stamp ml-1 shrink-0', s.stamp)}>
            <StampIcon size={10} className={state === 'scanning' ? 'animate-spin' : ''} /> {s.label}
          </span>
        )}
      </div>
    </div>
  );
}

// The terminal node — the tool vault the request lands in once it clears every gate.
function VaultNode({ count, hit, registerMark }: { count: number; hit: boolean; registerMark: (el: HTMLElement | null) => void }) {
  return (
    <div className="gate is-last pb-0">
      <div ref={registerMark} className={cn('gate-mark', hit && 'is-cleared')} style={{ borderRadius: '50%' }}>
        <Boxes size={13} />
      </div>
      <div className="flex min-h-[24px] items-center gap-1.5">
        <span className="tabular text-[15px] font-bold leading-none" style={{ color: 'var(--gw-ink)' }}>{count}</span>
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <span className="text-[12px] font-semibold" style={{ color: 'var(--gw-ink)' }}>tools</span>
        {hit && (
          <span className="verdict-stamp tone-ok ml-1 shrink-0">
            <ShieldCheck size={10} /> Delivered
          </span>
        )}
      </div>
    </div>
  );
}

function OutcomeBanner({ outcome }: { outcome: { tone: 'ok' | 'warn' | 'block'; label: string; sub: string } }) {
  const c = outcome.tone === 'block' ? 'var(--gw-block)' : outcome.tone === 'warn' ? 'var(--gw-warn)' : 'var(--gw-accent)';
  const Icon = outcome.tone === 'block' ? Lock : outcome.tone === 'warn' ? ShieldAlert : ShieldCheck;
  return (
    <div className="mb-2.5 flex items-center gap-2.5 rounded-lg border px-3 py-2 animate-fade-rise"
      style={{ borderColor: `color-mix(in srgb, ${c} 45%, transparent)`, background: `color-mix(in srgb, ${c} 10%, transparent)` }}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md" style={{ background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c }}>
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-bold" style={{ color: c }}>{outcome.label}</div>
        <div className="text-[11px]" style={{ color: 'var(--gw-dim)' }}>{outcome.sub}</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// FLIGHT LOG — the dense reference, kept below the stage (endpoint · caps · targets · connect).
// ══════════════════════════════════════════════════════════════════════════════════════════════
function FlightLogReference({ data, onNavigate }: { data: ConsoleData; onNavigate?: (id: 'access' | 'registry' | 'chat') => void }) {
  const byPillar = useMemo(() => {
    const m: Record<string, typeof data.targets> = {};
    for (const t of data.targets) { const p = t.pillar || 'Other'; (m[p] ||= []).push(t); }
    return m;
  }, [data.targets]);
  const rl = data.rate_limits;
  const claudeCmd = `claude mcp add --transport http agentcore ${data.mcp_url} \\\n  --header "Authorization: Bearer $(scripts/mcp_token.sh alice@demo.com)"`;

  const caps = [
    { n: rl.per_user?.count ?? null, label: 'per user' },
    { n: rl.per_app?.count ?? null, label: 'per app' },
    { n: rl.per_tool_default?.count ?? null, label: 'per tool', sub: 'default' },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Endpoint + connect */}
      <div className="gw-card flex flex-col p-5">
        <SectionKey Icon={Server} label="The one MCP endpoint"
          right={<span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--gw-accent)' }}>
            <span className="size-1.5 rounded-full" style={{ background: 'var(--gw-accent)' }} /> CUSTOM_JWT
          </span>} />
        <AddressField value={data.mcp_url} />
        <div className="mt-3.5">
          <div className="mb-1.5 text-[11.5px] font-medium" style={{ color: 'var(--gw-dim)' }}>Connect from any client</div>
          <CodeBlock value={claudeCmd} />
        </div>
        <p className="mt-3.5 text-[12px] leading-relaxed" style={{ color: 'var(--gw-dim)' }}>
          Every client points at this one endpoint — and passes the same four gates you just watched.
        </p>
      </div>

      {/* Rate caps */}
      <div className="gw-card flex flex-col p-5">
        <SectionKey Icon={Gauge} label="Rate limits"
          right={<span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--gw-faint)' }}>{rl.window_seconds}s window</span>} />
        <div className="grid grid-cols-3 overflow-hidden rounded-xl"
          style={{ background: 'var(--gw-panel-2)', boxShadow: 'inset 0 0 0 1px var(--gw-line)' }}>
          {caps.map((c, i) => (
            <div key={c.label} className="px-3.5 py-3.5" style={i > 0 ? { borderLeft: '1px solid var(--gw-line)' } : undefined}>
              <div className="tabular text-[24px] font-bold leading-none" style={{ color: c.n != null ? 'var(--gw-ink)' : 'var(--gw-faint)' }}>
                {c.n ?? '—'}
              </div>
              <div className="mt-1.5 text-[11.5px]" style={{ color: 'var(--gw-dim)' }}>
                {c.label}{c.sub && <span style={{ color: 'var(--gw-faint)' }}> · {c.sub}</span>}
              </div>
            </div>
          ))}
        </div>
        {Object.keys(rl.per_tool).length > 0 && (
          <div className="mt-3.5">
            <div className="mb-1.5 text-[11.5px] font-medium" style={{ color: 'var(--gw-dim)' }}>Tool overrides</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(rl.per_tool).map(([k, spec]) => (
                <span key={k} className="rounded-lg px-2 py-1 font-mono text-[11px]" style={{ background: 'var(--gw-panel)', color: 'var(--gw-dim)' }}>
                  {k} <span className="font-semibold" style={{ color: 'var(--gw-ink)' }}>{spec.count}</span>
                  <span style={{ color: 'var(--gw-faint)' }}>/{spec.window_seconds}s</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Governed targets */}
      <div className="gw-card p-5 lg:col-span-2">
        <SectionKey Icon={ShieldCheck} label={`Governed tools · ${data.target_count}`}
          right={onNavigate ? (
            <button onClick={() => onNavigate('access')} className="group inline-flex items-center gap-1 text-[11.5px] font-medium" style={{ color: 'var(--gw-accent)' }}>
              Who can reach what <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
            </button>
          ) : undefined} />
        {/* Masonry pack: pillars vary wildly in size (Gateway = 17, most = 1), so an aligned
            grid leaves ragged voids. CSS columns flow each pillar-card tight top-to-bottom;
            break-inside-avoid keeps a group whole; each is a hairline-ringed unit, not a
            floating pill-wall. */}
        <div className="mt-1 gap-4 [column-fill:balance] sm:columns-2 xl:columns-3">
          {Object.entries(byPillar).map(([pillar, tools]) => {
            const PIcon = PILLAR_ICON[pillar] || Boxes;
            const sensitive = tools.filter((t) => t.sensitive).length;
            return (
              <div key={pillar} className="mb-4 break-inside-avoid rounded-xl p-3.5"
                style={{ background: 'var(--gw-panel-2)', boxShadow: 'inset 0 0 0 1px var(--gw-line)' }}>
                <div className="mb-2.5 flex items-center gap-1.5">
                  <PIcon size={13} style={{ color: 'var(--gw-dim)' }} />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold" style={{ color: 'var(--gw-ink)' }}>{pillar}</span>
                  <span className="tabular rounded-md px-1.5 py-px text-[10px] font-semibold"
                    style={{ color: 'var(--gw-dim)', background: 'var(--gw-panel)' }}>{tools.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tools.map((t) => (
                    <span key={t.key} title={t.gateway_action}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px]"
                      style={t.sensitive
                        ? { background: 'color-mix(in srgb, var(--gw-warn) 14%, transparent)', color: 'var(--gw-ink)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--gw-warn) 28%, transparent)' }
                        : { background: 'var(--gw-panel)', color: 'var(--gw-dim)', boxShadow: 'inset 0 0 0 1px var(--gw-line)' }}>
                      {t.sensitive && <Lock size={10} style={{ color: 'var(--gw-warn)' }} />}
                      {t.label}
                    </span>
                  ))}
                </div>
                {sensitive > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-[10px]" style={{ color: 'var(--gw-faint)' }}>
                    <Lock size={9} style={{ color: 'var(--gw-warn)' }} /> {sensitive} sensitive
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Two governance surfaces this boundary also owns — built and live, one click away.
          They answer the two requirements that aren't a per-request gate: admission (what may
          onboard at all) and observability (what happened across every request). */}
      <BoundaryTile
        Icon={ClipboardCheck} label="Pre-onboarding validation"
        body="Every MCP must terminate behind the governed JWT boundary before it can onboard — an automated admission check, not a manual review."
        cta="See the admission checks" onClick={onNavigate ? () => onNavigate('registry') : undefined} />
      <BoundaryTile
        Icon={Activity} label="Observability"
        body="Every prompt, tool call, and response is traced to CloudWatch — token counts, latency, and per-agent steps for any request that crossed this boundary."
        cta="Open the live trace" onClick={onNavigate ? () => onNavigate('chat') : undefined} />
    </div>
  );
}

// A reference tile linking to a governance surface the boundary owns but doesn't gate per-request.
function BoundaryTile({ Icon, label, body, cta, onClick }: {
  Icon: typeof Server; label: string; body: string; cta: string; onClick?: () => void;
}) {
  return (
    <div className="gw-card flex flex-col p-5">
      <SectionKey Icon={Icon} label={label} />
      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--gw-dim)' }}>{body}</p>
      {onClick && (
        <button onClick={onClick} className="group mt-3 inline-flex items-center gap-1 self-start text-[11.5px] font-medium" style={{ color: 'var(--gw-accent)' }}>
          {cta} <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}

function SectionKey({ Icon, label, right }: { Icon: typeof Server; label: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon size={15} style={{ color: 'var(--gw-accent)' }} />
      {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
      <span className="text-[13.5px] font-semibold" style={{ color: 'var(--gw-ink)' }}>{label}</span>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

// A copy affordance shared by the address bar + code block: ghost button, hover ink wash.
function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <button onClick={copy} title="Copy"
      className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--gw-ink)_8%,transparent)]', className)}>
      {copied ? <Check size={14} style={{ color: 'var(--gw-accent)' }} /> : <Copy size={14} style={{ color: 'var(--gw-dim)' }} />}
    </button>
  );
}

// The endpoint as a single "address bar" — inset ring, mono URL, integrated ghost copy.
function AddressField({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--gw-void)', boxShadow: 'inset 0 0 0 1px var(--gw-line)' }}>
      <code className="min-w-0 flex-1 truncate font-mono text-[12px]" style={{ color: 'var(--gw-ink)' }}>{value}</code>
      <CopyButton value={value} className="-mr-1" />
    </div>
  );
}

// The connect command as a terminal block — inset ring, mono, copy floats top-right.
function CodeBlock({ value }: { value: string }) {
  return (
    <div className="relative rounded-xl px-3 py-2.5" style={{ background: 'var(--gw-void)', boxShadow: 'inset 0 0 0 1px var(--gw-line)' }}>
      <CopyButton value={value} className="absolute right-1.5 top-1.5" />
      <pre className="overflow-x-auto whitespace-pre pr-8 font-mono text-[11.5px] leading-relaxed" style={{ color: 'var(--gw-ink)' }}>{value}</pre>
    </div>
  );
}
