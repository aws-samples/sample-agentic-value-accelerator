import { useState } from 'react';
import {
  ShieldCheck, PlusCircle, ChevronRight, ChevronDown, ChevronUp,
  Workflow, GitBranch, KeyRound, ArrowUpRight,
} from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import { cn } from './lib/cn';
import { SessionHistory } from './SessionHistory';
import type { SessionRecord } from './lib/sessions';
import { usePersona } from './personaContext';

// Quick-prompt catalogs (SWARM_PROMPTS / GRAPH_PROMPTS) now live per-persona in
// personas.ts and are read via usePersona() below, so each vertical shows its own
// scenarios. The QuickPrompt shape is defined there too.

// Flagship, tool-safe model set — lockstep with agent/main.py MODELS + App.tsx default.
// 'auto' runs the per-agent TIER (reasoning agents → Opus 4.8, the rest → Sonnet 5);
// picking a specific model forces every agent onto it (the "swap the LLM" demo).
const MODELS = [
  { value: 'auto', label: 'Auto', vendor: 'Tiered per agent' },
  { value: 'opus-4-8', label: 'Claude Opus 4.8', vendor: 'Anthropic' },
  { value: 'sonnet-5', label: 'Claude Sonnet 5', vendor: 'Anthropic' },
  { value: 'nova-pro', label: 'Amazon Nova Pro', vendor: 'Amazon' },
  { value: 'llama4-maverick', label: 'Llama 4 Maverick', vendor: 'Meta' },
  { value: 'gpt-oss-120b', label: 'GPT-OSS 120B', vendor: 'OpenAI' },
];

// The two Strands multi-agent ARCHITECTURES the demo switches between (same 11 agents,
// same AgentCore tools). Swarm = emergent, the LLM routes each hand-off; Graph = a
// deterministic DAG (parallel fan-out/fan-in, converging on the Investment Committee).
const TOPOLOGIES: { value: 'swarm' | 'graph'; label: string; Icon: typeof Workflow; blurb: string }[] = [
  { value: 'swarm', label: 'Swarm', Icon: Workflow, blurb: 'Emergent — each agent picks the next hand-off.' },
  { value: 'graph', label: 'Graph', Icon: GitBranch, blurb: 'Deterministic DAG — branches fan in to a committee.' },
];

// Swarm mode carries ~14 focused prompts — too tall to show at once, so we lead with the
// most representative few and tuck the rest behind a "Show more" toggle (same pattern as
// SessionHistory). Graph mode has only ~4 full-desk mandates, so it always shows them all.
const SCENARIO_COLLAPSED_LIMIT = 6;

export function Sidebar(props: {
  cfg: AppConfig;
  auth: Auth;
  model: string;
  setModel: (m: string) => void;
  topology: 'swarm' | 'graph';
  setTopology: (t: 'swarm' | 'graph') => void;
  onNewSession: () => void;
  onQuickPrompt: (prompt: string) => void;
  busy: boolean;
  identityEmail: string;
  sessions: SessionRecord[];
  activeSessionId: string;
  onResumeSession: (rec: SessionRecord) => void;
  onDeleteSession: (id: string) => void;
  onClearSessions: () => void;
}) {
  const {
    cfg, auth, model, setModel, topology, setTopology, onNewSession, onQuickPrompt, busy,
    sessions, activeSessionId, onResumeSession, onDeleteSession, onClearSessions,
  } = props;
  const { persona } = usePersona();
  const SWARM_PROMPTS = persona.swarmPrompts;
  const GRAPH_PROMPTS = persona.graphPrompts;
  const [vaultEnabled, setVaultEnabled] = useState(true);
  const [policyMsg, setPolicyMsg] = useState('');
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [scenariosExpanded, setScenariosExpanded] = useState(false);

  // Cedar policy toggle — direct call to the JWT-authorized /policy/toggle HTTP
  // endpoint (NOT via AG-UI). Uses the ID token. FIXED contract — do not change.
  // The Lambda flips a FINE-GRAINED, tool-scoped Cedar policy: disabling forbids ONLY
  // the secure_vault tool (bond / positions / portfolio tools stay live), rather than
  // the whole gateway. NB: the Gateway caches its deny/allow decision per tool — turning
  // the vault OFF takes effect within seconds, but re-enabling can take a moment to
  // propagate, so we tell the user that on the ON path.
  async function togglePolicy(enabled: boolean) {
    setVaultEnabled(enabled);
    setPolicyMsg(enabled ? 're-enabling — may take a moment to propagate…' : '…');
    try {
      const resp = await fetch(`${cfg.API_URL}/policy/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.getIdToken()}`,
        },
        // The toggle Lambda expects {action:'enable'|'disable'}; it defaults to a
        // read-only 'status' for any other body, which is why sending {enabled} never
        // actually flipped the Cedar policy (the vault stayed permit). Send action.
        body: JSON.stringify({ action: enabled ? 'enable' : 'disable' }),
      });
      if (!resp.ok) {
        setPolicyMsg(`toggle failed (${resp.status})`);
        setVaultEnabled(!enabled);
      } else {
        // On OFF the deny is effective immediately; on ON the gateway may serve a
        // cached deny briefly, so keep a soft hint rather than claiming instant.
        setPolicyMsg(enabled ? 'Re-enabled — may take a moment to take effect.' : '');
      }
    } catch (e: any) {
      setPolicyMsg(e?.message || 'toggle failed');
      setVaultEnabled(!enabled);
    }
  }

  const allPrompts = topology === 'graph' ? GRAPH_PROMPTS : SWARM_PROMPTS;
  // Graph = show all (only ~4); Swarm = collapse the long tail behind a toggle.
  const collapsible = topology === 'swarm' && allPrompts.length > SCENARIO_COLLAPSED_LIMIT;
  const prompts = collapsible && !scenariosExpanded ? allPrompts.slice(0, SCENARIO_COLLAPSED_LIMIT) : allPrompts;
  const hiddenScenarios = collapsible && !scenariosExpanded ? allPrompts.length - SCENARIO_COLLAPSED_LIMIT : 0;
  const activeTopology = TOPOLOGIES.find((t) => t.value === topology);

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-border bg-card/70 backdrop-blur-sm lg:w-[300px] lg:border-r">
      {/* ═══ ZONE 1 · SET UP THE RUN ══════════════════════════════════════════════
          Architecture + model are ONE object — the shape of the run — so they share a
          single bordered card instead of two full sections with two paragraphs. The
          option labels self-describe (no explanatory gray blocks). */}
      <section className="px-4 pt-4">
        <RunSetupCard
          topology={topology}
          setTopology={setTopology}
          model={model}
          setModel={setModel}
          busy={busy}
          topologyBlurb={activeTopology?.blurb || ''}
        />
      </section>

      {/* ═══ ZONE 2 · RUN A SCENARIO ═══════════════════════════════════════════════
          The primary action of the whole rail and its tallest element: agent-colored
          launch tiles. Everything above is deliberately compact so these sit high. */}
      <section className="mt-5 px-4">
        <div className="mb-2 flex items-baseline justify-between">
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <h3 className="field-key text-foreground/80">Run a scenario</h3>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
            {topology === 'graph' ? 'Full desk' : 'Focused'}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {prompts.map((q) => {
            // Lead specialist's swarm-graph color (same token SwarmFlow/TraceView use),
            // so a scenario reads as "this lands on that agent" at a glance.
            const color = `var(--agent-${q.agent})`;
            return (
              <button
                key={q.label}
                disabled={busy}
                onClick={() => onQuickPrompt(q.prompt)}
                className="group tile-interactive relative overflow-hidden rounded-lg border border-border bg-elevated py-2 pl-4 pr-3 text-left shadow-sm disabled:opacity-50 disabled:hover:transform-none"
              >
                {/* Left accent bar in the lead specialist's color; brightens + widens on hover. */}
                <span
                  className="absolute inset-y-0 left-0 w-1 opacity-70 transition-all group-hover:w-1.5 group-hover:opacity-100"
                  style={{ background: color, boxShadow: `0 0 12px -2px ${color}` }}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium">{q.label}</span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">{q.hint}</span>
                </div>
              </button>
            );
          })}
        </div>
        {(collapsible || scenariosExpanded) && topology === 'swarm' && allPrompts.length > SCENARIO_COLLAPSED_LIMIT && (
          <button
            onClick={() => setScenariosExpanded((v) => !v)}
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {scenariosExpanded ? (
              /* nosemgrep: jsx-not-internationalized (single-locale demo) */
              <><ChevronUp className="size-3" /> Show fewer scenarios</>
            ) : (
              <><ChevronDown className="size-3" /> Show {hiddenScenarios} more</>
            )}
          </button>
        )}
      </section>

      {/* ═══ ZONE 3 · UTILITIES (quiet footer) ═════════════════════════════════════
          Session control + history and the governance story. Separated from the run
          controls by a full-width rule and pushed down so they never compete with the
          scenarios. New Session is the only affordance here that needs prominence. */}
      <div className="mt-5 rule" />
      <section className="px-4 pb-5 pt-4">
        <button
          className="group flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-[13px] font-semibold text-primary shadow-sm transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
          onClick={onNewSession}
          disabled={busy}
        >
          <PlusCircle className="size-3.5" />
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          New session
        </button>

        <div className="mt-3">
          <SessionHistory
            sessions={sessions}
            activeId={activeSessionId}
            onResume={onResumeSession}
            onDelete={onDeleteSession}
            onClear={onClearSessions}
            nowMs={Date.now()}
          />
        </div>

        {/* Governance — the Cedar kill-switch (a live control) sits inline; the deeper
            identity story (3LO / M2M / vault modes) tucks behind a disclosure so it's
            available to demo without standing between the operator and the scenarios.
            The signed-in identity is NOT repeated here — it already lives in the top bar. */}
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-1.5">
            <ShieldCheck className="size-3 text-muted-foreground" />
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <h3 className="field-key text-foreground/80">Governance</h3>
          </div>

          {/* Cedar fine-grained kill-switch — a real, one-tap control. */}
          <button
            onClick={() => togglePolicy(!vaultEnabled)}
            className={cn(
              'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-[13px] font-medium shadow-sm transition-colors',
              vaultEnabled
                ? 'border-border bg-elevated text-foreground hover:border-primary/40'
                : 'border-destructive/40 bg-destructive/10 text-destructive',
            )}
          >
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <span>Vault tool access</span>
            <span className="flex items-center gap-2">
              <span className={cn('font-mono text-[11px] uppercase tracking-wide', vaultEnabled ? 'text-ok' : 'text-destructive')}>
                {vaultEnabled ? 'Allowed' : 'Blocked'}
              </span>
              <span
                className={cn(
                  'relative inline-block h-4 w-7 rounded-full transition-colors',
                  vaultEnabled ? 'bg-ok/70' : 'bg-destructive/60',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-3 rounded-full bg-elevated shadow-sm transition-all',
                    vaultEnabled ? 'left-3.5' : 'left-0.5',
                  )}
                />
              </span>
            </span>
          </button>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            Block to watch Cedar deny just the vault tool — other tools keep working.
          </p>
          {policyMsg && <p className="mt-1 text-[11px] text-destructive">{policyMsg}</p>}

          {/* Identity-modes disclosure — the interesting part (how the agent is authorized),
              not the redundant "who's signed in". */}
          <button
            onClick={() => setGovernanceOpen((v) => !v)}
            aria-expanded={governanceOpen}
            className="mt-2.5 flex w-full items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <KeyRound className="size-3" />
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            How the agent is authorized
            <ChevronRight className={cn('ml-auto size-3 transition-transform', governanceOpen && 'rotate-90')} />
          </button>
          {governanceOpen && (
            <ul className="mt-2 space-y-2 border-l border-border pl-3 text-[11px] leading-snug text-muted-foreground">
              {persona.identityBullets.map((b) => (
                <li key={b.title} className="relative">
                  <ArrowUpRight className="absolute -left-[19px] top-0.5 size-3 text-primary/70" />
                  <span className="font-medium text-foreground">{b.title}</span> — {b.body}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </aside>
  );
}

// ── Run-setup card: architecture toggle + model select, unified as one "ticket header".
// The two knobs that shape a run share a single sheet so they read as one decision, not
// two competing sections. Kept intentionally terse — the controls self-label. ──────────
function RunSetupCard({
  topology, setTopology, model, setModel, busy, topologyBlurb,
}: {
  topology: 'swarm' | 'graph';
  setTopology: (t: 'swarm' | 'graph') => void;
  model: string;
  setModel: (m: string) => void;
  busy: boolean;
  topologyBlurb: string;
}) {
  return (
    <div className="panel-elevated overflow-hidden">
      {/* Header rule — the ticket's title bar. */}
      <div className="flex items-center gap-1.5 border-b border-border bg-secondary/40 px-3 py-2">
        <Workflow className="size-3 text-primary" />
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <span className="field-key text-foreground/80">Run setup</span>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {/* Architecture segmented control. */}
        <div>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-background/60 p-1">
            {TOPOLOGIES.map((t) => {
              const active = topology === t.value;
              const Icon = t.Icon;
              return (
                <button
                  key={t.value}
                  onClick={() => setTopology(t.value)}
                  disabled={busy}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                  aria-pressed={active}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{topologyBlurb}</p>
        </div>

        {/* Model select — sits under a hairline so it reads as the ticket's second field. */}
        <div>
          <div className="mb-1 flex items-center gap-2">
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80">Model</span>
            <span className="rule-fade flex-1" />
          </div>
          <div className="relative">
            <select
              className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-background/60 px-3 py-2 pr-8 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 focus:outline-none focus:ring-1 focus:ring-ring"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-label="Model"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label} · {m.vendor}
                </option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 rotate-90 text-muted-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
}
