/**
 * GovernanceGraph — the who-can-reach-what READ model of the RBAC layer, drawn live.
 *
 * The AdminConsole shows the same grant data as flat grids; this panel renders it as a
 * node-link graph so the "who can reach what, and where is the kill-switch engaged" story is
 * legible at a glance. It's a pure visualization — every edge is computed client-side from the
 * same data the grids use (allows()), plus the GLOBAL block overlay (Cedar-forbidden tools /
 * IAM-denied creds) the grids never surfaced.
 *
 * Two lanes on one dagre canvas (left→right = principal → capability):
 *   Lane A — user access:     user → desk → tool-group → (expand) tool
 *   Lane B — agent outbound:  agent → cred → (expand) tool
 *
 * Readability is the design problem (30 tools × N users). Mitigations: collapse to groups by
 * default, expand a group/cred on click, focus a user to spotlight their reach, and filter by
 * desk / sensitive / denied / globally-blocked.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position,
  type Node, type Edge, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import {
  Network, X, RefreshCw, AlertTriangle, User, ShieldCheck, Building2, Layers, Wrench, Bot, KeyRound, Ban, Filter,
} from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import { governanceApi, type GraphResponse } from './governanceApi';
import { allows } from './entitlements';
import { cn } from './lib/cn';

type NodeKind = 'user' | 'desk' | 'group' | 'tool' | 'agent' | 'cred';
interface GNodeData {
  kind: NodeKind;
  label: string;
  sublabel?: string;
  blocked?: boolean;     // globally Cedar/IAM blocked → red kill-switch badge
  sensitive?: boolean;   // amber ring
  managed?: boolean;
  isAdmin?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  dimmed?: boolean;      // focus mode: not on the focused user's reach
  runtimeOnly?: boolean; // tool has no gateway_action → not Gateway-blockable
  [key: string]: unknown;
}

// Fixed node sizes so dagre lays out deterministically.
const NODE_W = 190;
const NODE_H = 52;

// ── Custom node ───────────────────────────────────────────────────────────────
const KIND_META: Record<NodeKind, { Icon: any; tint: string }> = {
  user:  { Icon: User,       tint: 'var(--muted-foreground)' },
  desk:  { Icon: Building2,  tint: 'var(--primary)' },
  group: { Icon: Layers,     tint: 'var(--muted-foreground)' },
  tool:  { Icon: Wrench,     tint: 'var(--muted-foreground)' },
  agent: { Icon: Bot,        tint: 'var(--primary)' },
  cred:  { Icon: KeyRound,   tint: 'var(--warn)' },
};

function GovNode({ data }: NodeProps) {
  const d = data as GNodeData;
  const meta = KIND_META[d.kind];
  const Icon = d.kind === 'user' && d.isAdmin ? ShieldCheck : meta.Icon;
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 shadow-sm transition-opacity',
        d.blocked ? 'border-destructive/60 bg-destructive/10' : 'border-border',
        d.sensitive && !d.blocked && 'ring-1 ring-warn/50',
        d.dimmed && 'opacity-25',
      )}
      style={{ width: NODE_W, height: NODE_H }}
      title={d.expandable ? (d.expanded ? 'Click to collapse' : 'Click to expand') : d.label}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-md"
        style={{ color: d.blocked ? 'var(--destructive)' : meta.tint, background: 'color-mix(in oklab, currentColor 14%, transparent)' }}
      >
        <Icon size={14} />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[11.5px] font-semibold">{d.label}</div>
        {d.sublabel && <div className="truncate text-[9.5px] text-muted-foreground">{d.sublabel}</div>}
      </div>
      {d.blocked && (
        <span className="ml-auto flex items-center gap-0.5 rounded bg-destructive/20 px-1 py-0.5 text-[8px] font-bold uppercase text-destructive">
          <Ban size={9} /> blocked
        </span>
      )}
      {d.expandable && !d.blocked && (
        <span className="ml-auto text-[13px] font-bold text-muted-foreground">{d.expanded ? '−' : '+'}</span>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { gov: GovNode };

// ── dagre layout ────────────────────────────────────────────────────────────
function layout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 22, ranksep: 96, ranker: 'tight-tree', marginx: 24, marginy: 24 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } };
  });
}

// ── graph builder ─────────────────────────────────────────────────────────────
interface Filters {
  desks: Set<string>;      // empty = all desks
  sensitiveOnly: boolean;
  showDenied: boolean;
  blockedOnly: boolean;
}

function edgeStyle(kind: 'granted' | 'denied' | 'structural' | 'cred' | 'blocked') {
  switch (kind) {
    case 'granted':    return { stroke: 'var(--ok)', strokeWidth: 1.6 };
    case 'denied':     return { stroke: 'var(--muted-foreground)', strokeWidth: 1.2, strokeDasharray: '4 4', opacity: 0.6 };
    case 'cred':       return { stroke: 'var(--warn)', strokeWidth: 1.4 };
    case 'blocked':    return { stroke: 'var(--destructive)', strokeWidth: 1.8 };
    default:           return { stroke: 'var(--border)', strokeWidth: 1 };
  }
}

function buildGraph(
  resp: GraphResponse,
  filters: Filters,
  expanded: Set<string>,
  focusUser: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const { catalog, users, agents, global_blocks } = resp;
  const blockedTools = new Set(global_blocks.tools);
  const blockedCreds = new Set(global_blocks.creds);
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeIds = new Set<string>();
  const addNode = (id: string, data: GNodeData) => {
    if (nodeIds.has(id)) return;
    nodeIds.add(id);
    nodes.push({ id, type: 'gov', position: { x: 0, y: 0 }, data });
  };
  const addEdge = (source: string, target: string, kind: 'granted' | 'denied' | 'structural' | 'cred' | 'blocked') => {
    edges.push({ id: `${source}->${target}:${kind}`, source, target, style: edgeStyle(kind), animated: kind === 'blocked' });
  };

  const deskKeys = Object.keys(catalog.desks).filter((d) => filters.desks.size === 0 || filters.desks.has(d));
  const deskSet = new Set(deskKeys);

  // Which groups are visible given the desk filter (a desk's reachable groups).
  const visibleGroups = new Set<string>();
  deskKeys.forEach((d) => (catalog.desk_groups[d] || []).forEach((g) => visibleGroups.add(g)));

  const toolBlocked = (t: string) => blockedTools.has(t);
  const toolSensitive = (t: string) => !!catalog.tools[t]?.sensitive;
  const passesToolFilter = (t: string) =>
    (!filters.sensitiveOnly || toolSensitive(t)) && (!filters.blockedOnly || toolBlocked(t));

  // reachability set for focus dimming (ids connected to the focused user).
  const reach = new Set<string>();
  if (focusUser) {
    const u = users.find((x) => x.sub === focusUser);
    reach.add(`u:${focusUser}`);
    if (u) {
      deskKeys.forEach((d) => {
        if (allows(u.entitlements, 'desks', d) || (u.entitlements.managed && filters.showDenied)) {
          reach.add(`d:${d}`);
          (catalog.desk_groups[d] || []).forEach((g) => { reach.add(`g:${g}`); });
        }
      });
      // expanded groups' tools stay in reach
      expanded.forEach((eid) => {
        if (eid.startsWith('g:') && reach.has(eid)) {
          const grp = eid.slice(2);
          Object.entries(catalog.tools).forEach(([t, spec]) => { if (spec.group === grp) reach.add(`t:${t}`); });
        }
      });
    }
  }
  const dim = (id: string): boolean => !!focusUser && !reach.has(id);

  // ── Lane A: users → desks → groups → (tools) ──
  users.forEach((u) => {
    if (focusUser && u.sub !== focusUser && !filters.blockedOnly) {
      // In focus mode, keep other users present but dimmed for context (unless blocked-only).
    }
    addNode(`u:${u.sub}`, {
      kind: 'user', label: u.email, isAdmin: u.is_admin, managed: u.entitlements.managed,
      sublabel: u.is_admin ? 'admin — bypasses gating' : u.entitlements.managed ? 'managed' : 'unmanaged (all allowed)',
      dimmed: dim(`u:${u.sub}`),
    });
    deskKeys.forEach((d) => {
      const granted = allows(u.entitlements, 'desks', d);
      if (!granted && !(u.entitlements.managed && filters.showDenied)) return;
      addEdge(`u:${u.sub}`, `d:${d}`, granted ? 'granted' : 'denied');
    });
  });

  deskKeys.forEach((d) => {
    addNode(`d:${d}`, {
      kind: 'desk', label: catalog.desks[d]?.label || d, sublabel: catalog.desks[d]?.firm, dimmed: dim(`d:${d}`),
    });
    (catalog.desk_groups[d] || []).forEach((grp) => {
      if (!visibleGroups.has(grp)) return;
      addEdge(`d:${d}`, `g:${grp}`, 'structural');
    });
  });

  // Group nodes (only those reachable under the desk filter).
  catalog.groups.filter((g) => visibleGroups.has(g)).forEach((grp) => {
    const toolsInGroup = Object.keys(catalog.tools).filter((t) => catalog.tools[t].group === grp);
    const nSens = toolsInGroup.filter(toolSensitive).length;
    const nBlk = toolsInGroup.filter(toolBlocked).length;
    const gid = `g:${grp}`;
    const isExpanded = expanded.has(gid);
    addNode(gid, {
      kind: 'group', label: grp, expandable: true, expanded: isExpanded,
      sublabel: `${toolsInGroup.length} tool${toolsInGroup.length === 1 ? '' : 's'}${nSens ? ` · ${nSens} sensitive` : ''}`,
      blocked: nBlk > 0 && nBlk === toolsInGroup.length, // whole group blocked
      dimmed: dim(gid),
    });
    if (isExpanded) {
      toolsInGroup.filter(passesToolFilter).forEach((t) => {
        const spec = catalog.tools[t];
        const tid = `t:${t}`;
        addNode(tid, {
          kind: 'tool', label: spec.label, sublabel: spec.pillar,
          blocked: toolBlocked(t), sensitive: toolSensitive(t),
          runtimeOnly: !spec.gateway_action, dimmed: dim(tid),
        });
        addEdge(gid, tid, toolBlocked(t) ? 'blocked' : 'structural');
        // Focus mode: draw the focused user's per-tool grant into expanded tools.
        if (focusUser) {
          const u = users.find((x) => x.sub === focusUser);
          if (u && reach.has(gid)) {
            const g2 = allows(u.entitlements, 'tools', t);
            if (g2 || (u.entitlements.managed && filters.showDenied)) {
              addEdge(`u:${u.sub}`, tid, g2 ? 'granted' : 'denied');
            }
          }
        }
      });
    }
  });

  // ── Lane B: agents → creds → (tools) ──
  agents.forEach((a) => {
    addNode(`a:${a.name}`, {
      kind: 'agent', label: a.name, sublabel: a.entitlements.managed ? 'managed' : 'unmanaged (all allowed)',
    });
    Object.keys(catalog.creds).forEach((c) => {
      const granted = allows(a.entitlements, 'creds', c);
      if (!granted && !(a.entitlements.managed && filters.showDenied)) return;
      addEdge(`a:${a.name}`, `c:${c}`, granted ? 'granted' : 'denied');
    });
  });
  Object.keys(catalog.creds).forEach((c) => {
    const cid = `c:${c}`;
    const isExpanded = expanded.has(cid);
    const credTools: string[] = catalog.creds[c]?.tools || [];
    if (filters.blockedOnly && !blockedCreds.has(c)) return;
    addNode(cid, {
      kind: 'cred', label: catalog.creds[c]?.label || c, sublabel: catalog.creds[c]?.flow,
      blocked: blockedCreds.has(c), expandable: credTools.length > 0, expanded: isExpanded,
    });
    if (isExpanded) {
      credTools.filter(passesToolFilter).forEach((t) => {
        const spec = catalog.tools[t];
        if (!spec) return;
        const tid = `t:${t}`;
        addNode(tid, {
          kind: 'tool', label: spec.label, sublabel: spec.pillar,
          blocked: toolBlocked(t), sensitive: toolSensitive(t), runtimeOnly: !spec.gateway_action,
        });
        addEdge(cid, tid, 'cred');
      });
    }
  });

  return { nodes: layout(nodes, edges), edges };
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function Toggle({ on, onClick, Icon, label }: { on: boolean; onClick: () => void; Icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors',
        on ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

function GovernanceGraphInner({ auth, cfg, onClose, embedded }: { auth: Auth; cfg: AppConfig; onClose?: () => void; embedded?: boolean }) {
  const [resp, setResp] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusUser, setFocusUser] = useState<string | null>(null);
  const [deskFilter, setDeskFilter] = useState<Set<string>>(new Set());
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [showDenied, setShowDenied] = useState(true);
  const [blockedOnly, setBlockedOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResp(await governanceApi.graph(auth, cfg));
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load governance graph');
    } finally {
      setLoading(false);
    }
  }, [auth, cfg]);

  useEffect(() => { load(); }, [load]);

  const filters = useMemo<Filters>(
    () => ({ desks: deskFilter, sensitiveOnly, showDenied, blockedOnly }),
    [deskFilter, sensitiveOnly, showDenied, blockedOnly],
  );

  const { nodes, edges } = useMemo(
    () => (resp ? buildGraph(resp, filters, expanded, focusUser) : { nodes: [], edges: [] }),
    [resp, filters, expanded, focusUser],
  );

  const onNodeClick = useCallback((_e: any, node: Node) => {
    const d = node.data as GNodeData;
    if (d.expandable) {
      setExpanded((s) => { const n = new Set(s); n.has(node.id) ? n.delete(node.id) : n.add(node.id); return n; });
    } else if (d.kind === 'user') {
      const sub = node.id.slice(2);
      setFocusUser((f) => (f === sub ? null : sub));
    }
  }, []);

  const anyManaged = !!resp && [...resp.users, ...resp.agents].some((p) => p.entitlements.managed);
  const blocks = resp?.global_blocks;
  const nBlocked = (blocks?.tools.length || 0) + (blocks?.creds.length || 0);

  return (
    <div className={cn(
      'flex flex-col',
      embedded ? 'h-full' : 'fixed inset-0 z-[60] bg-background/95 backdrop-blur-md',
    )}>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
            <Network size={17} />
          </span>
          <div className="min-w-0">
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[15px] font-bold tracking-tight">Governance Graph</div>
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[11px] text-muted-foreground">
              Who can reach what — users → desks → tools &amp; agents → credentials, live from the entitlements store
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {nBlocked > 0 && (
            <span className="flex items-center gap-1 rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive">
              <Ban size={12} /> {nBlocked} kill-switch{nBlocked === 1 ? '' : 'es'} engaged
            </span>
          )}
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[12px] font-medium text-secondary-foreground transition-colors hover:bg-accent"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {!embedded && (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[13px] font-medium text-secondary-foreground transition-colors hover:bg-accent"
            >
              <X size={14} /> Close
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-2">
        <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"><Filter size={12} /> Desks:</span>
        {resp && Object.keys(resp.catalog.desks).map((d) => (
          <Toggle
            key={d}
            on={deskFilter.has(d)}
            Icon={Building2}
            label={resp.catalog.desks[d]?.label?.split(' ')[0] || d}
            onClick={() => setDeskFilter((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; })}
          />
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <Toggle on={sensitiveOnly} onClick={() => setSensitiveOnly((v) => !v)} Icon={AlertTriangle} label="Sensitive only" />
        <Toggle on={showDenied} onClick={() => setShowDenied((v) => !v)} Icon={X} label="Denied edges" />
        <Toggle on={blockedOnly} onClick={() => setBlockedOnly((v) => !v)} Icon={Ban} label="Blocked only" />
        {focusUser && (
          <button
            onClick={() => setFocusUser(null)}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[11.5px] font-medium text-primary"
          >
            <User size={12} /> Focus: {resp?.users.find((u) => u.sub === focusUser)?.email || focusUser} · clear
          </button>
        )}
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Canvas */}
      <div className="min-h-0 flex-1">
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        {loading && !resp ? (
          <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">Loading governance graph…</div>
        ) : !resp ? null : !anyManaged ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ShieldCheck size={28} className="text-ok" />
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[14px] font-semibold text-foreground">No managed principals yet</div>
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="max-w-md text-[12px]">
              Every principal is currently <span className="font-medium text-foreground">unmanaged (fail-open)</span> — all
              tools, desks and credentials are allowed until an admin makes a first grant in Access Control. The graph will
              populate its allow/deny edges once a principal is managed.
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            fitView
            minZoom={0.15}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={22} color="var(--border)" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => ((n.data as GNodeData).blocked ? 'var(--destructive)' : 'var(--muted-foreground)')} />
          </ReactFlow>
        )}
      </div>

      {/* Legend */}
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-t border-border px-5 py-2 text-[10.5px] text-muted-foreground">
        <LegendLine color="var(--ok)" label="granted" />
        <LegendLine color="var(--muted-foreground)" label="denied (per-user)" dashed />
        <LegendLine color="var(--warn)" label="credential-gated" />
        <LegendLine color="var(--destructive)" label="kill-switch engaged (Cedar/IAM)" />
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <span className="ml-auto">Click a group/credential to expand · click a user to focus their reach</span>
      </div>
    </div>
  );
}

function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 3' : undefined} /></svg>
      {label}
    </span>
  );
}

export function GovernanceGraph(props: { auth: Auth; cfg: AppConfig; isAdmin?: boolean; onClose?: () => void; embedded?: boolean }) {
  // ReactFlowProvider isolates the flow instance so multiple mounts don't collide.
  return (
    <ReactFlowProvider>
      <GovernanceGraphInner auth={props.auth} cfg={props.cfg} onClose={props.onClose} embedded={props.embedded} />
    </ReactFlowProvider>
  );
}
