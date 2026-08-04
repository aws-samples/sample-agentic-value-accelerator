// StackRail.tsx — the "AWS Agent Stack" rail that reframes the demo from a chatbot into
// a platform proof. Each AgentCore primitive is a row that LIGHTS UP as it's exercised in
// the current turn (derived from the timeline's smuggled __tool / __handoff / __agent_active
// keys), labeled with the concrete business value it proves. This is the hero surface: a
// technical buyer sees Runtime / Gateway+Cedar / Identity / Memory / Code Interpreter /
// Browser / Observability all firing live against real AWS services.

import {
  Cpu, Network, KeyRound, Brain, TerminalSquare, Globe, Activity, Workflow, CheckCircle2,
  ClipboardCheck, BookMarked, Boxes, TrendingUp, ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import type { TimelineItem } from './agentClient';
import type { AppConfig } from './auth';
import { cn } from './lib/cn';
import { safeJson } from './toolViews';
import { usePersona } from './personaContext';
import type { StackPrimitive } from './personas';
import { primitiveLink } from './lib/consoleLinks';

// Stable icon per primitive key — shared across all personas (the platform is the same).
const PRIMITIVE_ICON: Record<string, LucideIcon> = {
  runtime: Cpu, swarm: Workflow, gateway: Network, identity: KeyRound,
  memory: Brain, code: TerminalSquare, browser: Globe, observability: Activity,
  evaluations: ClipboardCheck, registry: BookMarked, harness: Boxes, optimization: TrendingUp,
};

/** Which primitive keys have fired across the given timelines (all turns). Reads the
 * smuggled __tool key from each tool-call's args; handoffs/agent-active mark the swarm.
 * `primitives` is the ACTIVE persona's primitive list (trigger tool-names differ per desk). */
export function firedPrimitives(timelines: TimelineItem[][], primitives: StackPrimitive[]): Set<string> {
  const fired = new Set<string>();
  // Runtime is the substrate every turn runs on — so it counts as exercised the moment the
  // session has actually run a turn (an assistant timeline exists), and stays dark at rest.
  if (timelines.length) fired.add('runtime');
  const toolToPrim = new Map<string, string>();
  for (const p of primitives) for (const t of p.triggers) toolToPrim.set(t, p.key);

  for (const tl of timelines) {
    for (const item of tl) {
      const p = safeJson(item.args);
      if (!p || typeof p !== 'object') continue;
      const tool = String(p.__tool || '');
      if (p.__handoff || p.__agent_active || tool === 'handoff' || tool === 'agent_active') {
        fired.add('swarm');
      }
      const prim = toolToPrim.get(tool);
      if (prim) fired.add(prim);
    }
  }
  return fired;
}

/** Mark observability as active once we've successfully hydrated real metrics, and memory
 * when the agent reports a recall (best-effort: the rail also lights memory if the user ran
 * a recall scenario — surfaced by the caller via extraActive). */
export function StackRail({
  timelines,
  busy,
  extraActive,
  cfg,
}: {
  timelines: TimelineItem[][];
  busy?: boolean;
  extraActive?: string[];
  /** App config carries the resolved AgentCore resource ids → console deep-links per primitive. */
  cfg?: AppConfig;
}) {
  const { persona } = usePersona();
  const PRIMITIVES = persona.primitives;
  const fired = firedPrimitives(timelines, PRIMITIVES);
  for (const k of extraActive || []) fired.add(k);

  // Progress meter: how many of the non-substrate primitives have fired. Runtime is the
  // substrate (not a "capability you exercise"), so it's excluded from the count explicitly —
  // now that it only fires once a turn has run, a fresh 0-turn session honestly reads 0/N.
  const exercisable = PRIMITIVES.length - 1;
  const exercised = Array.from(fired).filter((k) => k !== 'runtime').length;
  const pct = exercisable > 0 ? Math.round((exercised / exercisable) * 100) : 0;

  return (
    <aside className="w-[260px] shrink-0 overflow-y-auto border-l border-border bg-card/60 backdrop-blur-sm px-3.5 py-4">
      <div className="mb-2 flex items-center gap-2">
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <span className="field-key text-muted-foreground/90">AWS Agent Stack</span>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>
      {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
      <p className="mb-4 text-[11px] leading-relaxed text-muted-foreground">
        Live primitives exercised this session — each is a real AWS service, not a mock.
      </p>

      {/* Vertical pipeline: a spine threads every service; active ones light up. */}
      <div className="flex flex-col">
        {PRIMITIVES.map((p, i) => {
          const active = fired.has(p.key);
          const Icon = PRIMITIVE_ICON[p.key] || Cpu;
          const first = i === 0;
          const last = i === PRIMITIVES.length - 1;
          const link = cfg ? primitiveLink(p.key, cfg) : null;
          const cardCls = cn(
            'group/card block rounded-lg border px-2.5 py-2 transition-all duration-300',
            active
              ? 'border-primary/40 bg-elevated shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_15%,transparent),0_8px_20px_-14px_color-mix(in_srgb,var(--primary)_50%,transparent)]'
              : 'border-dashed border-border bg-secondary/20 opacity-55',
            link && 'cursor-pointer hover:border-primary/60 hover:opacity-100 hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_25%,transparent)]',
          );
          const inner = (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-md',
                    active ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground',
                  )}
                >
                  <Icon size={13} />
                </span>
                <span
                  className={cn(
                    'text-[12.5px] font-semibold',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {p.name}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  {link && (
                    <ExternalLink
                      size={12}
                      className="text-muted-foreground/50 transition-colors group-hover/card:text-primary"
                    />
                  )}
                  {active && (busy ? (
                    <span className="inline-block size-1.5 animate-pulse-dot rounded-full bg-ok" />
                  ) : (
                    <CheckCircle2 size={13} className="text-ok" />
                  ))}
                </span>
              </div>
              <p className="mt-1 pl-8 text-[10.5px] leading-snug text-muted-foreground">{p.value}</p>
              {link?.resourceId && (
                // The real resource id, so the link never dead-ends: even if the console route
                // shifts, the operator can confirm/copy the exact id the console lists.
                <p className="mt-1 truncate pl-8 font-mono text-[9.5px] text-muted-foreground/70" title={link.resourceId}>
                  {link.resourceId}
                </p>
              )}
            </>
          );
          return (
            <div
              key={p.key}
              className={cn(
                'pipe-row pb-2.5 animate-fade-rise',
                first && 'is-first',
                last && 'is-last',
                active && 'is-active',
              )}
            >
              <span className={cn('pipe-node', active ? 'active' : 'idle', active && busy && 'busy')} />
              {link ? (
                <a href={link.href} target="_blank" rel="noopener noreferrer" title={`Open in AWS console — ${link.service}`} className={cardCls}>
                  {inner}
                </a>
              ) : (
                <div className={cardCls}>{inner}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress meter footer. */}
      <div className="mt-3 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <span className="field-key text-[9.5px]">Capabilities exercised</span>
          <span className="tabular text-[11px] font-semibold text-foreground">
            {exercised} / {exercisable}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </aside>
  );
}
