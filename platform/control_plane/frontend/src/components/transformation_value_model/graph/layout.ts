// Graph layout — the ONLY module that knows which layout engine is in use.
// Today it is dagre (synchronous, layered, great for our domain→lever→solution→
// use-case spine). The signature is engine-agnostic: swapping in elkjs-in-a-
// worker or server-supplied coordinates later is a change confined to this file.

import Dagre from '@dagrejs/dagre';
import {
  NODE_WIDTH, NODE_HEIGHT, ENTITY_RANK, type RFNode, type RFEdge, type GraphNodeData,
} from './graphTypes';

export type LayoutDirection = 'LR' | 'TB';

export interface LayoutOptions {
  direction?: LayoutDirection;
  nodeSep?: number;
  rankSep?: number;
}

/**
 * Returns a new array of nodes with computed positions. Pure — does not mutate
 * its inputs and performs no I/O.
 */
export function layoutGraph(
  nodes: RFNode[],
  edges: RFEdge[],
  opts: LayoutOptions = {},
): RFNode[] {
  if (nodes.length === 0) return [];

  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: opts.direction ?? 'LR',
    nodesep: opts.nodeSep ?? 44,
    ranksep: opts.rankSep ?? 110,
    marginx: 24,
    marginy: 24,
  });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));

  // Rank each node by entity type so we can orient layout edges parent→child
  // (low rank → high rank) even when the rendered edge points the other way.
  const rankOf = new Map<string, number>();
  nodes.forEach((n) => rankOf.set(n.id, ENTITY_RANK[(n.data as GraphNodeData).entityType] ?? 99));

  // Only lay out edges whose endpoints are in the node set (defensive; the API
  // already guarantees this).
  const ids = new Set(nodes.map((n) => n.id));
  edges.forEach((e) => {
    if (!ids.has(e.source) || !ids.has(e.target)) return;
    // Feed dagre the lower-ranked endpoint as the layout source so ranks flow
    // left→right along the intended spine.
    const [from, to] = (rankOf.get(e.source)! <= rankOf.get(e.target)!)
      ? [e.source, e.target]
      : [e.target, e.source];
    g.setEdge(from, to);
  });

  Dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    // dagre reports node centers; React Flow positions are top-left.
    return { ...n, position: { x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2 } };
  });
}
