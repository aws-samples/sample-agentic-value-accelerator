// GraphFlow.tsx — visualizes the DETERMINISTIC Strands Graph orchestration: a fixed DAG of
// specialists laid out in stages, with parallel branches side-by-side and a fan-in to the
// Investment Committee sink. Reads the __graph topology marker + the __agent_active markers
// the agent smuggles through the tool-call args channel (see agent/graph_strands.py). Shares
// its node/panel look with SwarmFlow via flowViz — the counterpart to the emergent swarm rail,
// drawn as the declared, reproducible pipeline it actually is. Pure presentation; never throws.

import { GitBranch } from 'lucide-react';
import type { TimelineItem } from './agentClient';
import { cn } from './lib/cn';
import { safeJson } from './toolViews';
import { FlowNode, FlowPanel, type NodeState } from './flowViz';
import { usePersona } from './personaContext';

type GraphTopology = {
  entry: string;
  edges: [string, string][];
  layers: string[][];
  nodes: Record<string, string>;
};

/** Pull the __graph topology marker (emitted once, up front) out of a turn's timeline. */
function findTopology(timeline: TimelineItem[]): GraphTopology | null {
  for (const item of timeline) {
    const p = safeJson(item.args);
    if (p && typeof p === 'object' && p.__graph && Array.isArray(p.__graph.layers)) {
      return p.__graph as GraphTopology;
    }
  }
  return null;
}

/** Does this timeline contain a deterministic-graph run worth visualizing? */
export function hasGraphActivity(timeline: TimelineItem[]): boolean {
  return timeline.some((i) => {
    const p = safeJson(i.args);
    return !!(p && typeof p === 'object' && p.__graph);
  });
}

/** The set of node keys that have entered execution (announced via __agent_active). */
function reachedNodes(timeline: TimelineItem[]): Set<string> {
  const reached = new Set<string>();
  for (const item of timeline) {
    const p = safeJson(item.args);
    if (!p || typeof p !== 'object') continue;
    if (p.__agent_active) {
      const a = String(p.__agent_active.agent || p.__agent || '');
      if (a) reached.add(a);
    }
  }
  return reached;
}

/**
 * The full deterministic-graph rail: the declared DAG rendered as ordered stages, each node
 * lit by its live execution state. Because the graph runs layer-by-layer, a node's state
 * follows from the deepest stage reached: earlier stages are done, the frontier stage is
 * running (while busy), later stages are pending.
 */
export function GraphFlow({ timeline, busy }: { timeline: TimelineItem[]; busy?: boolean }) {
  const { persona } = usePersona();
  const topo = findTopology(timeline);
  if (!topo) return null;
  const { layers } = topo;
  const reached = reachedNodes(timeline);

  // Deepest stage index that has any reached node → the execution frontier.
  let frontier = -1;
  layers.forEach((layer, i) => {
    if (layer.some((k) => reached.has(k))) frontier = i;
  });

  const nodeCount = layers.reduce((n, l) => n + l.length, 0);

  const stateFor = (layerIdx: number, key: string): NodeState => {
    if (!reached.has(key)) return 'pending';
    if (layerIdx < frontier) return 'done';
    // Frontier stage: still running while the turn is live; done once it settles.
    return busy ? 'running' : 'done';
  };

  return (
    <FlowPanel
      title="Orchestration Graph"
      Icon={GitBranch}
      meta={`Deterministic · ${nodeCount} agents · ${layers.length} stages`}
    >
      {/* Stages, top-to-bottom. Each stage is a row of one-or-more nodes that run
          concurrently; a connector sits between stages to signal fan-out / fan-in. */}
      <div className="flex flex-col items-stretch gap-0">
        {layers.map((layer, i) => (
          <div key={i}>
            <div className="flex flex-wrap items-stretch justify-center gap-2">
              {layer.map((key) => (
                <FlowNode key={key} agentKey={key} state={stateFor(i, key)} agents={persona.agents} />
              ))}
            </div>
            {i < layers.length - 1 && (
              <StageConnector parallel={layers[i + 1].length > 1} active={frontier > i} />
            )}
          </div>
        ))}
      </div>
    </FlowPanel>
  );
}

/** Vertical connector between two stages. Widens into a labelled fork when the next stage
 *  fans out to multiple parallel nodes; tinted once the upstream stage has fired. */
function StageConnector({ parallel, active }: { parallel: boolean; active: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-1" aria-hidden>
      <span
        className={cn('block w-px transition-colors', active ? 'bg-primary' : 'bg-border')}
        style={{ height: 14 }}
      />
      {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
      {parallel && (
        <span
          className={cn(
            'my-0.5 rounded-full border px-1.5 py-px text-[8.5px] font-mono uppercase tracking-wider transition-colors',
            active ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground',
          )}
        >
          parallel
        </span>
      )}
      <span
        className={cn('block w-px transition-colors', active ? 'bg-primary' : 'bg-border')}
        style={{ height: 14 }}
      />
    </div>
  );
}
