// flowViz.tsx — the SHARED visual language for both orchestration views. SwarmFlow (emergent
// hand-off chain) and GraphFlow (deterministic DAG) render with the SAME node/connector/panel
// components so they look equally polished — but each stays honest to how it actually runs:
// the swarm draws the path the LLM chose; the graph draws its fixed layered DAG. Pure
// presentation; never throws.

import type { ReactNode } from 'react';
import { CircleDot, Check, type LucideIcon } from 'lucide-react';
import { cn } from './lib/cn';
import type { AgentIdentity } from './personas';

export type NodeState = 'pending' | 'running' | 'done';

/** One agent node — the shared building block. Colored + lit when running/done, dashed +
 *  dimmed when it hasn't run yet. `title` overrides the hover tooltip (e.g. a hand-off reason).
 *  `agents` is the ACTIVE persona's identity map (key → name/color/icon). */
export function FlowNode({
  agentKey,
  state,
  title,
  agents,
}: {
  agentKey: string;
  state: NodeState;
  title?: string;
  agents: Record<string, AgentIdentity>;
}) {
  const a = agents[agentKey];
  if (!a) return null;
  const { Icon } = a;
  const running = state === 'running';
  const done = state === 'done';
  const pending = state === 'pending';
  return (
    <div
      className={cn(
        'relative flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-all animate-fade-rise',
        running && 'bg-elevated shadow-sm',
        done && 'bg-elevated',
        pending && 'border-dashed opacity-45',
      )}
      style={{
        borderColor: pending ? 'var(--border)' : a.color,
        // A soft color halo behind the currently-running node — the "alive" tell.
        boxShadow: running
          ? `0 0 0 1px ${a.color}, 0 0 16px -4px color-mix(in srgb, ${a.color} 55%, transparent)`
          : undefined,
      }}
      title={title || a.name}
    >
      <span
        className="flex size-6 items-center justify-center rounded-lg"
        style={{ background: `color-mix(in srgb, ${a.color} 16%, transparent)`, color: a.color }}
      >
        <Icon size={14} />
      </span>
      <span className="text-[12px] font-medium text-foreground whitespace-nowrap">{a.name}</span>
      {running && <CircleDot size={12} className="animate-pulse-dot" style={{ color: a.color }} />}
      {done && (
        <span
          className="flex size-3.5 items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${a.color} 20%, transparent)`, color: a.color }}
        >
          <Check size={9} strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

/** The panel chrome shared by both views: a titled, elevated card with a right-aligned
 *  meta line. `Icon` sits next to the title; `accent` optionally tints the title icon. */
export function FlowPanel({
  title,
  Icon,
  meta,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="panel-elevated mb-2 animate-fade-rise overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="field-key flex items-center gap-1.5 text-primary/90">
          <Icon size={12} />
          {title}
        </span>
        {meta != null && (
          <span className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground">
            {meta}
          </span>
        )}
      </div>
      <div className="px-3 py-2.5">{children}</div>
    </div>
  );
}
