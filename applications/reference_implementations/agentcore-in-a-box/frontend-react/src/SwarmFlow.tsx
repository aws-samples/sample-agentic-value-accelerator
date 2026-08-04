// SwarmFlow.tsx — visualizes the autonomous multi-agent swarm: which specialist is
// active, the sequence of hand-offs, and the reason for each. Reads machine markers
// (__agent_active / __handoff / __agent) the agent smuggles through the tool-call
// args channel (see agent/main.py swarm loop). Pure presentation; never throws.

import { useState } from 'react';
import { Workflow, ArrowRight, Brain, ChevronDown } from 'lucide-react';
import type { TimelineItem } from './agentClient';
import { cn } from './lib/cn';
import { safeJson } from './toolViews';
import { FlowNode, FlowPanel, type NodeState } from './flowViz';
import { usePersona } from './personaContext';
import type { AgentIdentity } from './personas';

type Hop = { agent: string; reason?: string };

/** Derive the ordered hand-off path + reasons from a turn's timeline. `agents` is the ACTIVE
 * persona's identity map, so only known keys for that desk are surfaced. */
export function deriveSwarmPath(
  timeline: TimelineItem[],
  agents: Record<string, AgentIdentity>,
): { path: Hop[]; involved: Set<string> } {
  const path: Hop[] = [];
  const involved = new Set<string>();
  for (const item of timeline) {
    const parsed = safeJson(item.args);
    if (!parsed || typeof parsed !== 'object') continue;
    if (parsed.__agent_active) {
      const a = String(parsed.__agent_active.agent || parsed.__agent || '');
      if (a && agents[a]) {
        involved.add(a);
        if (!path.length || path[path.length - 1].agent !== a) path.push({ agent: a });
      }
    } else if (parsed.__handoff) {
      const to = String(parsed.__handoff.to || '');
      const reason = parsed.__handoff.reason ? String(parsed.__handoff.reason) : undefined;
      if (to && agents[to]) {
        involved.add(to);
        if (path.length) path[path.length - 1].reason = reason;
        if (!path.length || path[path.length - 1].agent !== to) path.push({ agent: to, reason });
      }
    } else if (parsed.__agent && agents[String(parsed.__agent)]) {
      involved.add(String(parsed.__agent));
    }
  }
  return { path, involved };
}

/** Does this timeline contain any swarm activity worth visualizing? */
export function hasSwarmActivity(timeline: TimelineItem[]): boolean {
  return timeline.some((i) => {
    const p = safeJson(i.args);
    return !!(p && typeof p === 'object' && (p.__agent_active || p.__handoff || p.__agent));
  });
}

/** The full swarm rail: roster of involved agents + the live, EMERGENT hand-off path the
 *  LLM actually chose. Shares FlowNode/FlowPanel with GraphFlow so the two views match in
 *  polish, while this one stays honest to how the swarm runs (a traversed chain, not a DAG). */
export function SwarmFlow({ timeline, busy }: { timeline: TimelineItem[]; busy?: boolean }) {
  const { persona } = usePersona();
  const AGENTS = persona.agents;
  const ORDER = persona.order;
  const { path, involved } = deriveSwarmPath(timeline, AGENTS);
  if (!involved.size) return null;

  const currentKey = path.length ? path[path.length - 1].agent : persona.order[0];
  const handoffs = Math.max(0, path.length - 1);

  // A hop's state: the last hop is running while busy (else done); everything before it is done.
  const hopState = (i: number): NodeState => {
    const isLast = i === path.length - 1;
    if (isLast) return busy ? 'running' : 'done';
    return 'done';
  };

  return (
    <FlowPanel
      title="Agent Swarm"
      Icon={Workflow}
      meta={`Emergent · ${involved.size} agent${involved.size > 1 ? 's' : ''} · ${handoffs} hand-off${handoffs === 1 ? '' : 's'}`}
    >
      {/* Roster: every agent that participated, the current one pulsing. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {ORDER.filter((k) => involved.has(k)).map((k) => (
          <span
            key={k}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
              k === currentKey && busy ? 'border-primary/40 bg-elevated' : 'border-border bg-elevated/60',
            )}
          >
            <span
              className={cn('size-1.5 rounded-full', k === currentKey && busy && 'animate-pulse-dot')}
              style={{ background: AGENTS[k].color }}
            />
            <span className="text-muted-foreground">{AGENTS[k].name}</span>
          </span>
        ))}
      </div>

      {/* Live hand-off path — the actual route the swarm chose, node → node. */}
      {path.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {path.map((hop, i) => {
            const isLast = i === path.length - 1;
            return (
              <div key={i} className="flex items-center gap-2">
                <FlowNode agentKey={hop.agent} state={hopState(i)} title={hop.reason} agents={AGENTS} />
                {!isLast && (
                  <span className="flex items-center" title={hop.reason}>
                    <ArrowRight size={15} className="text-muted-foreground" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Latest hand-off reason as a collapsible REASONING block — the orchestrator's
          task brief can be very long (full candidate universe + constraints), so it's
          clamped to a few lines by default and reads as a labeled reasoning trace
          rather than a wall of italic text. */}
      {(() => {
        const lastReason = [...path].reverse().find((h) => h.reason)?.reason;
        return lastReason ? <ReasoningBlock text={lastReason} /> : null;
      })()}
    </FlowPanel>
  );
}

/** Collapsible agent-reasoning trace. Short reasons render inline; long ones are
 *  clamped to ~3 lines with a "Show full reasoning" toggle. */
function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  // Only offer the toggle when there's meaningfully more than a clamp's worth.
  const long = text.length > 240;
  return (
    <div className="mt-3 rounded-lg border border-border bg-elevated px-2.5 py-2 shadow-sm">
      <div className="field-key mb-1 flex items-center gap-1.5 text-[9.5px]">
        <Brain size={11} />
        Reasoning
      </div>
      <p
        className={cn(
          'break-words text-[11px] italic leading-relaxed text-muted-foreground',
          long && !open && 'line-clamp-3',
        )}
      >
        “{text}”
      </p>
      {long && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-primary transition-colors hover:opacity-80"
        >
          <ChevronDown size={11} className={cn('transition-transform', open && 'rotate-180')} />
          {open ? 'Show less' : 'Show full reasoning'}
        </button>
      )}
    </div>
  );
}
