// Relationship Map — scoped, interactive graph of the catalog rendered with
// React Flow.
//
//   Phase 2: scope picker, dagre layout, custom nodes, legend/minimap/controls.
//   Phase 3 (this file): entity-type toggles (KPIs / data / tech), click-to-
//   focus (highlight 1-hop neighborhood + read-only detail panel), double-click
//   to expand a node's neighbors, search-to-locate, and resume (persisted view).
//
// Editing stays out (read-only inspector) — that is the Phase-2-answer v2 seam.

import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  Panel, useNodesState, useEdgesState, useReactFlow,
  getNodesBounds, getViewportForBounds,
  type NodeMouseHandler,
} from '@xyflow/react';
import { toPng } from 'html-to-image';

import { catalogStore } from '../store';
import type { CatalogEntity, CatalogEntityType } from '../types';
import EntityDetail from '../EntityDetail';
import { graphStore, type GraphSource } from './graphStore';
import { layoutGraph } from './layout';
import {
  ENTITY_STYLE, NODE_WIDTH, NODE_HEIGHT,
  toRFNodes, toRFEdges, type RFNode, type RFEdge, type GraphNodeData,
} from './graphTypes';
import EntityNode from './nodes/EntityNode';
import { loadViewState, saveViewState, type ScopeType } from './viewState';

// Stable references (must not be re-created per render).
const nodeTypes = { entity: EntityNode };
const fitViewOptions = { padding: 0.2, maxZoom: 1.1 };
const proOptions = { hideAttribution: true };
const defaultEdgeOptions = { type: 'smoothstep' as const };

// Minimap node color, hoisted so its identity is stable across renders.
function miniMapNodeColor(n: { data?: unknown }): string {
  const d = n.data as GraphNodeData | undefined;
  return (d && ENTITY_STYLE[d.entityType]?.hex) || '#94a3b8';
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.setAttribute('download', filename);
  a.setAttribute('href', dataUrl);
  a.click();
}

// Optional entity types, off by default, toggled into the `include` param.
const OPTIONAL_TYPES: { type: CatalogEntityType; label: string }[] = [
  { type: 'kpis', label: 'KPIs' },
  { type: 'data-assets', label: 'Data Assets' },
  { type: 'technology-components', label: 'Technology' },
];
const OPTIONAL_SET = new Set(OPTIONAL_TYPES.map((o) => o.type));

interface ScopeOption { id: string; name: string; }

export default function CatalogGraphView() {
  return (
    <ReactFlowProvider>
      <GraphExplorer />
    </ReactFlowProvider>
  );
}

function GraphExplorer() {
  // Scope option lists for the pickers.
  const [segments, setSegments] = useState<ScopeOption[]>([]);
  const [domains, setDomains] = useState<ScopeOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [scopeType, setScopeType] = useState<ScopeType>('domain');
  const [scopeId, setScopeId] = useState<string>('');
  const [include, setInclude] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [hiddenTypes, setHiddenTypes] = useState<CatalogEntityType[]>([]);
  const [hiddenLinks, setHiddenLinks] = useState<string[]>([]); // 'fk' | 'junction'
  const [fullscreen, setFullscreen] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<GraphSource>('api');
  const [scopeName, setScopeName] = useState<string>('');
  const [truncated, setTruncated] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchMiss, setSearchMiss] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const { fitView, setCenter, getNodes } = useReactFlow();
  const fitNextRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Load scope option lists once, and restore the last view (or default to the
  // first domain) so the user resumes where they left off.
  useEffect(() => {
    let cancelled = false;
    const saved = loadViewState();
    if (saved) {
      setScopeType(saved.scopeType);
      setScopeId(saved.scopeId);
      setInclude(saved.include.filter((s) => OPTIONAL_SET.has(s as CatalogEntityType)));
      setExpanded(saved.expanded);
      setHiddenTypes((saved.hidden ?? []).filter((s) => s in ENTITY_STYLE) as CatalogEntityType[]);
      setHiddenLinks((saved.hiddenLinks ?? []).filter((s) => s === 'fk' || s === 'junction'));
      fitNextRef.current = true;
    }
    (async () => {
      setOptionsLoading(true);
      const [segRes, domRes] = await Promise.all([
        catalogStore.list('industry-segments', { limit: 500 }),
        catalogStore.list('business-domains', { limit: 500 }),
      ]);
      if (cancelled) return;
      const toOpt = (items: CatalogEntity[]) =>
        items.map((i) => ({ id: i.id, name: i.name })).sort((a, b) => a.name.localeCompare(b.name));
      const doms = toOpt(domRes.items);
      setSegments(toOpt(segRes.items));
      setDomains(doms);
      setOptionsLoading(false);
      if (!saved && doms.length > 0) {
        setScopeType('domain');
        setScopeId(doms[0].id);
        fitNextRef.current = true;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch + lay out whenever scope / includes / expansions change.
  useEffect(() => {
    if (!scopeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { graph, source: src } = await graphStore.fetch({
          scope_type: scopeType,
          scope_id: scopeId,
          include: include.length ? include.join(',') : undefined,
          expand: expanded.length ? expanded.join(',') : undefined,
        });
        if (cancelled) return;
        const rfEdges = toRFEdges(graph);
        const laidOut = layoutGraph(toRFNodes(graph), rfEdges, { direction: 'LR' });
        setNodes(laidOut);
        setEdges(rfEdges);
        setSource(src);
        setScopeName(graph.scope.name);
        setTruncated(graph.truncated);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load graph');
        setNodes([]);
        setEdges([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scopeType, scopeId, include, expanded, reloadKey, setNodes, setEdges]);

  // Fit the view only after a scope change / first load (not on expand/toggle,
  // so the viewport stays put while the user drills in).
  useEffect(() => {
    if (fitNextRef.current && nodes.length > 0) {
      fitNextRef.current = false;
      requestAnimationFrame(() => fitView(fitViewOptions));
    }
  }, [nodes, fitView]);

  // Persist the whole view (scope, includes, expansions, hidden types) so the
  // next open resumes here. Single source of truth for persistence.
  useEffect(() => {
    if (scopeId) saveViewState({ scopeType, scopeId, include, expanded, hidden: hiddenTypes, hiddenLinks });
  }, [scopeType, scopeId, include, expanded, hiddenTypes, hiddenLinks]);

  // Re-fit when entering/leaving full screen so the graph fills the new area.
  useEffect(() => {
    const id = requestAnimationFrame(() => fitView(fitViewOptions));
    return () => cancelAnimationFrame(id);
  }, [fullscreen, fitView]);

  // Escape exits full screen.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const scopeOptions = scopeType === 'segment' ? segments : domains;

  // 1-hop neighborhood of the selected node, for focus dimming.
  const focusSet = useMemo<Set<string> | null>(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    for (const e of edges) {
      if (e.source === selectedId) set.add(e.target);
      else if (e.target === selectedId) set.add(e.source);
    }
    return set;
  }, [selectedId, edges]);

  const hiddenSet = useMemo(() => new Set(hiddenTypes), [hiddenTypes]);

  // Map node id -> entity type, for hiding edges whose endpoints are hidden.
  const typeById = useMemo(() => {
    const m = new Map<string, CatalogEntityType>();
    for (const n of nodes) m.set(n.id, (n.data as GraphNodeData).entityType);
    return m;
  }, [nodes]);

  // Derived render arrays: apply hide (React Flow `hidden`) + selection + focus
  // dimming without mutating the base node/edge state React Flow manages for
  // drag/position changes.
  const displayNodes = useMemo<RFNode[]>(() => nodes.map((n) => ({
    ...n,
    hidden: hiddenSet.has((n.data as GraphNodeData).entityType),
    selected: n.id === selectedId,
    style: { ...n.style, opacity: focusSet && !focusSet.has(n.id) ? 0.2 : 1, transition: 'opacity 150ms ease' },
  })), [nodes, selectedId, focusSet, hiddenSet]);

  const hiddenLinkSet = useMemo(() => new Set(hiddenLinks), [hiddenLinks]);

  const displayEdges = useMemo<RFEdge[]>(() => edges.map((e) => {
    const relKind = (e.data as { relKind?: string } | undefined)?.relKind;
    const edgeHidden =
      hiddenSet.has(typeById.get(e.source)!) ||
      hiddenSet.has(typeById.get(e.target)!) ||
      (relKind ? hiddenLinkSet.has(relKind) : false);
    if (!focusSet) return { ...e, hidden: edgeHidden, animated: false };
    const inFocus = e.source === selectedId || e.target === selectedId;
    return {
      ...e,
      hidden: edgeHidden,
      animated: inFocus,
      style: {
        ...e.style,
        opacity: inFocus ? 1 : 0.1,
        stroke: inFocus ? '#6366f1' : (e.style?.stroke as string),
        strokeWidth: inFocus ? 2 : (e.style?.strokeWidth as number),
      },
    };
  }), [edges, focusSet, selectedId, hiddenSet, hiddenLinkSet, typeById]);

  const presentTypes = useMemo(() => {
    const set = new Set<CatalogEntityType>();
    for (const n of nodes) set.add((n.data as GraphNodeData).entityType);
    return Array.from(set);
  }, [nodes]);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);
  const selectedType = selectedNode ? (selectedNode.data as GraphNodeData).entityType : null;

  // --- interactions --------------------------------------------------------

  const switchScopeType = (t: ScopeType) => {
    const opts = t === 'segment' ? segments : domains;
    setScopeType(t);
    setScopeId(opts.length > 0 ? opts[0].id : '');
    setExpanded([]);
    setSelectedId(null);
    fitNextRef.current = true;
  };

  const onScopeChange = (id: string) => {
    setScopeId(id);
    setExpanded([]);
    setSelectedId(null);
    fitNextRef.current = true;
  };

  const toggleInclude = (t: CatalogEntityType) => {
    setInclude((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const toggleHiddenType = (t: CatalogEntityType) => {
    setHiddenTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const toggleHiddenLink = (kind: 'fk' | 'junction') => {
    setHiddenLinks((prev) => (prev.includes(kind) ? prev.filter((x) => x !== kind) : [...prev, kind]));
  };

  // Single click: select + focus (and open the read-only detail panel).
  const onNodeClick = useCallback<NodeMouseHandler>((_e, node) => {
    setSelectedId(node.id);
  }, []);

  // Double click: expand this node's neighbors into the graph.
  const onNodeDoubleClick = useCallback<NodeMouseHandler>((_e, node) => {
    setExpanded((prev) => (prev.includes(node.id) ? prev : [...prev, node.id]));
    setSelectedId(node.id);
  }, []);

  const onPaneClick = useCallback(() => setSelectedId(null), []);

  const runSearch = () => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    const hit = nodes.find((n) => (n.data as GraphNodeData).name.toLowerCase().includes(q));
    if (!hit) { setSearchMiss(true); return; }
    setSearchMiss(false);
    setSelectedId(hit.id);
    setCenter(hit.position.x + NODE_WIDTH / 2, hit.position.y + NODE_HEIGHT / 2, { zoom: 1.2, duration: 500 });
  };

  // Navigate within the panel: re-focus a related node if it's on the canvas.
  const handlePanelNavigate = useCallback((_t: CatalogEntityType, id: string) => {
    const hit = nodes.find((n) => n.id === id);
    if (hit) {
      setSelectedId(id);
      setCenter(hit.position.x + NODE_WIDTH / 2, hit.position.y + NODE_HEIGHT / 2, { zoom: 1.2, duration: 500 });
    }
  }, [nodes, setCenter]);

  const noop = useCallback(() => {}, []);

  const retry = () => setReloadKey((k) => k + 1);

  // Export the whole graph (not just the visible viewport) to a PNG. Frames the
  // full node bounds, renders the React Flow viewport element via html-to-image.
  const onExport = useCallback(async () => {
    const el = canvasRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
    const allNodes = getNodes();
    if (!el || allNodes.length === 0) return;
    setExporting(true);
    try {
      const bounds = getNodesBounds(allNodes);
      const pad = 80;
      const width = Math.min(Math.max(Math.ceil(bounds.width) + pad * 2, 800), 4096);
      const height = Math.min(Math.max(Math.ceil(bounds.height) + pad * 2, 600), 4096);
      const vp = getViewportForBounds(bounds, width, height, 0.2, 2, 0.12);
      const dataUrl = await toPng(el, {
        backgroundColor: '#f8fafc',
        width,
        height,
        pixelRatio: 2,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
        },
      });
      const safe = (scopeName || 'catalog').replace(/[^\w.-]+/g, '-').toLowerCase();
      downloadDataUrl(dataUrl, `relationship-map-${safe}.png`);
    } catch {
      /* export is best-effort; ignore rendering failures */
    } finally {
      setExporting(false);
    }
  }, [getNodes, scopeName]);

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 bg-white p-4 flex flex-col gap-3 overflow-auto' : 'flex flex-col gap-4'}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1">
          {(['domain', 'segment'] as ScopeType[]).map((t) => (
            <button
              key={t}
              onClick={() => switchScopeType(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
                scopeType === t ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <select
          value={scopeId}
          onChange={(e) => onScopeChange(e.target.value)}
          disabled={optionsLoading || scopeOptions.length === 0}
          className="min-w-[240px] max-w-[380px] px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none disabled:opacity-60"
        >
          {optionsLoading ? (
            <option>Loading…</option>
          ) : scopeOptions.length === 0 ? (
            <option>No {scopeType}s available</option>
          ) : (
            scopeOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)
          )}
        </select>

        {/* Optional-type toggles */}
        <div className="flex items-center gap-1.5">
          {OPTIONAL_TYPES.map((o) => {
            const on = include.includes(o.type);
            return (
              <button
                key={o.type}
                onClick={() => toggleInclude(o.type)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  on ? 'border-transparent text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
                style={on ? { backgroundColor: ENTITY_STYLE[o.type].hex } : undefined}
              >
                <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: on ? 'rgba(255,255,255,0.9)' : ENTITY_STYLE[o.type].hex }} />
                {o.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSearchMiss(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
            placeholder="Find a node…"
            className={`w-44 px-3 py-2 text-sm rounded-lg border bg-white outline-none focus:ring-2 focus:ring-indigo-100 ${searchMiss ? 'border-rose-300' : 'border-slate-200 focus:border-indigo-400'}`}
          />
          <button onClick={runSearch} className="px-3 py-2 text-xs font-semibold text-slate-600 rounded-lg border border-slate-200 bg-white hover:border-indigo-300 hover:text-indigo-600">
            Find
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setFullscreen((v) => !v)}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 rounded-lg border border-slate-200 bg-white hover:border-indigo-300 hover:text-indigo-600 inline-flex items-center gap-1.5"
            title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
          >
            {fullscreen ? '⤢ Exit full screen' : '⤢ Full screen'}
          </button>
          <button
            onClick={onExport}
            disabled={exporting || nodes.length === 0}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 rounded-lg border border-slate-200 bg-white hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {exporting ? 'Exporting…' : '⬇ PNG'}
          </button>
          {expanded.length > 0 && (
            <button
              onClick={() => { setExpanded([]); setSelectedId(null); fitNextRef.current = true; }}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-500 rounded-lg border border-slate-200 bg-white hover:text-slate-700"
            >
              Reset expansions ({expanded.length})
            </button>
          )}
          {source === 'local' && (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Offline</span>
          )}
          {!loading && !error && nodes.length > 0 && (
            <span className="text-xs text-slate-400">{nodes.length} nodes · {edges.length} links</span>
          )}
        </div>
      </div>

      {truncated && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          This scope is large and was truncated for display. Narrow the scope for a complete view.
        </div>
      )}

      {/* Canvas + detail panel */}
      <div ref={canvasRef} className="relative rounded-2xl border border-slate-200 bg-slate-50/40 overflow-hidden" style={{ height: fullscreen ? 'calc(100vh - 9rem)' : 'calc(100vh - 20rem)', minHeight: 520 }}>
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm">
            <div className="text-sm text-slate-500">Loading map…</div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-8">
            <span className="text-3xl mb-2" aria-hidden>⚠️</span>
            <p className="text-sm text-slate-600 max-w-sm mb-3">{error}</p>
            <button onClick={retry} className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-md">
              Retry
            </button>
          </div>
        )}
        {!loading && !error && !scopeId && !optionsLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-8">
            <span className="text-3xl mb-2" aria-hidden>🧭</span>
            <p className="text-sm text-slate-500 max-w-sm">Pick a {scopeType} above to explore its relationships.</p>
          </div>
        )}
        {!loading && !error && nodes.length === 0 && scopeId && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-8">
            <span className="text-3xl mb-2" aria-hidden>🕸️</span>
            <p className="text-sm text-slate-500 max-w-sm">No related records in this {scopeType}. Try another scope.</p>
          </div>
        )}

        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
          fitView
          fitViewOptions={fitViewOptions}
          minZoom={0.15}
          maxZoom={1.8}
          proOptions={proOptions}
          defaultEdgeOptions={defaultEdgeOptions}
          onlyRenderVisibleElements
          nodesDraggable
          // v2 editing seam: enable connecting + wire onConnect to persist a new
          // junction relationship. Kept off for the read-only v1 map.
          nodesConnectable={false}
          elementsSelectable
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeStrokeWidth={2} nodeColor={miniMapNodeColor} />
          {presentTypes.length > 0 && (
            <Panel position="top-left">
              <div className="rounded-xl border border-slate-200 bg-white/90 backdrop-blur px-3 py-2 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Node types</div>
                  <span className="text-[9px] text-slate-400">click to show/hide</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {presentTypes.map((t) => {
                    const isHidden = hiddenSet.has(t);
                    return (
                      <button
                        key={t}
                        onClick={() => toggleHiddenType(t)}
                        aria-pressed={!isHidden}
                        title={isHidden ? `Show ${ENTITY_STYLE[t].label}` : `Hide ${ENTITY_STYLE[t].label}`}
                        className={`flex items-center gap-2 text-[11px] rounded px-1 py-0.5 hover:bg-slate-100 transition-colors ${isHidden ? 'text-slate-300' : 'text-slate-600'}`}
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0"
                          style={isHidden
                            ? { backgroundColor: 'transparent', border: `1.5px solid ${ENTITY_STYLE[t].hex}`, opacity: 0.5 }
                            : { backgroundColor: ENTITY_STYLE[t].hex }}
                        />
                        <span className={isHidden ? 'line-through' : ''}>{ENTITY_STYLE[t].label}</span>
                        <span className="ml-auto text-[10px]" aria-hidden>{isHidden ? '🚫' : ''}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Link (edge) key — clickable to show/hide each link class */}
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Links</div>
                    <span className="text-[9px] text-slate-400">click to show/hide</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {([['fk', 'Hierarchy', '4 4'], ['junction', 'Relationship', undefined]] as [('fk' | 'junction'), string, string | undefined][]).map(([kind, label, dash]) => {
                      const isHidden = hiddenLinkSet.has(kind);
                      return (
                        <button
                          key={kind}
                          onClick={() => toggleHiddenLink(kind)}
                          aria-pressed={!isHidden}
                          title={isHidden ? `Show ${label} links` : `Hide ${label} links`}
                          className={`flex items-center gap-2 text-[11px] rounded px-1 py-0.5 hover:bg-slate-100 transition-colors ${isHidden ? 'text-slate-300' : 'text-slate-600'}`}
                        >
                          <svg width="22" height="8" aria-hidden>
                            <line x1="0" y1="4" x2="22" y2="4" stroke={isHidden ? '#cbd5e1' : '#94a3b8'} strokeWidth="2" strokeDasharray={dash} />
                          </svg>
                          <span className={isHidden ? 'line-through' : ''}>{label}</span>
                          <span className="ml-auto text-[10px]" aria-hidden>{isHidden ? '🚫' : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Panel>
          )}
        </ReactFlow>

        {/* Read-only detail panel */}
        {selectedId && selectedType && (
          <aside className="absolute inset-y-0 right-0 z-20 w-[380px] max-w-[86%] bg-white border-l border-slate-200 shadow-xl overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 bg-white/85 backdrop-blur border-b border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Details · read-only</span>
              <button
                onClick={() => setSelectedId(null)}
                className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="Close details"
              >
                ✕
              </button>
            </div>
            <EntityDetail
              key={`${selectedType}:${selectedId}`}
              type={selectedType}
              entityId={selectedId}
              onNavigate={handlePanelNavigate}
              onEdit={noop}
              onHistory={noop}
              readOnly
            />
          </aside>
        )}
      </div>

      <p className="text-xs text-slate-400">
        <span className="font-medium text-slate-500">{scopeName || '…'}</span> · click a node to focus and inspect,
        double-click to expand its connections, toggle KPIs / data / technology above, click a type in the legend to
        show/hide it, or search to locate a node. Dashed links are hierarchy; solid links are relationships.
      </p>
    </div>
  );
}
