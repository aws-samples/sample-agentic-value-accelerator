/**
 * ModelLineageViewer — SageMaker Model Lineage Visualization
 *
 * Shows model provenance for supply chain governance:
 * - Visual graph: Training Data -> Model -> Endpoint
 * - Click to expand node details
 * - Base model identification (for fine-tuned models)
 * - Export as ML-SBOM (JSON format)
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useModelLineage, type LineageNode, type LineageNodeType } from './useModelLineage';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import { Icon, type IconName } from './icons';
import { rowButtonProps } from './a11y';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// ─────────────────────────── Node Styling ───────────────────────────

const NODE_STYLES: Record<LineageNodeType, { bg: string; border: string; text: string; icon: IconName; glyph: string }> = {
  dataset: { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-700', icon: 'circle-stack', glyph: 'D' },
  model: { bg: 'bg-violet-50', border: 'border-violet-400', text: 'text-violet-700', icon: 'cpu-chip', glyph: 'M' },
  endpoint: { bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700', icon: 'plug', glyph: 'E' },
  artifact: { bg: 'bg-slate-50', border: 'border-slate-400', text: 'text-slate-700', icon: 'cube', glyph: 'A' },
  context: { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-700', icon: 'folder', glyph: 'C' },
  action: { bg: 'bg-rose-50', border: 'border-rose-400', text: 'text-rose-700', icon: 'bolt', glyph: 'X' },
};

const MODEL_TYPE_STYLES = {
  base: { label: 'Base Model', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  'fine-tuned': { label: 'Fine-Tuned', bg: 'bg-purple-100', text: 'text-purple-700' },
  custom: { label: 'Custom', bg: 'bg-slate-100', text: 'text-slate-700' },
};

// ─────────────────────────── Graph Layout ───────────────────────────

interface PositionedNode extends LineageNode {
  x: number;
  y: number;
  col: number;
  row: number;
}

function layoutGraph(nodes: LineageNode[], edges: { sourceId: string; targetId: string }[]): PositionedNode[] {
  // Group nodes by type for column layout
  const datasets = nodes.filter(n => n.type === 'dataset');
  const models = nodes.filter(n => n.type === 'model');
  const endpoints = nodes.filter(n => n.type === 'endpoint');
  const others = nodes.filter(n => !['dataset', 'model', 'endpoint'].includes(n.type));

  // Sort models: base models first, then fine-tuned
  const sortedModels = [...models].sort((a, b) => {
    if (a.modelType === 'base' && b.modelType !== 'base') return -1;
    if (a.modelType !== 'base' && b.modelType === 'base') return 1;
    return 0;
  });

  const columns: LineageNode[][] = [datasets, sortedModels, endpoints];
  if (others.length > 0) columns.push(others);

  const colWidth = 200;
  const rowHeight = 90;
  const startX = 60;
  const startY = 60;

  const positioned: PositionedNode[] = [];

  columns.forEach((col, colIdx) => {
    const colStartY = startY + (colIdx === 1 ? 0 : 20); // Offset models slightly
    col.forEach((node, rowIdx) => {
      positioned.push({
        ...node,
        x: startX + colIdx * colWidth,
        y: colStartY + rowIdx * rowHeight,
        col: colIdx,
        row: rowIdx,
      });
    });
  });

  return positioned;
}

// ─────────────────────────── Component ───────────────────────────

export default function ModelLineageViewer({ isOpen, onClose }: Props) {
  const lineage = useModelLineage();
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [filterType, setFilterType] = useState<LineageNodeType | 'all'>('all');

  // Layout the graph
  const positionedNodes = useMemo(() => {
    const filtered = filterType === 'all'
      ? lineage.graph.nodes
      : lineage.graph.nodes.filter(n => n.type === filterType);
    return layoutGraph(filtered, lineage.graph.edges);
  }, [lineage.graph, filterType]);

  // Filter edges to only include visible nodes
  const visibleEdges = useMemo(() => {
    const nodeIds = new Set(positionedNodes.map(n => n.id));
    return lineage.graph.edges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));
  }, [lineage.graph.edges, positionedNodes]);

  // Calculate SVG viewBox
  const viewBox = useMemo(() => {
    if (positionedNodes.length === 0) return '0 0 800 400';
    const padding = 40;
    const minX = Math.min(...positionedNodes.map(n => n.x)) - padding;
    const maxX = Math.max(...positionedNodes.map(n => n.x)) + 180 + padding;
    const minY = Math.min(...positionedNodes.map(n => n.y)) - padding;
    const maxY = Math.max(...positionedNodes.map(n => n.y)) + 70 + padding;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [positionedNodes]);

  // Export ML-SBOM
  const handleExportSBOM = useCallback(() => {
    const sbom = lineage.exportMLSBOM();
    const blob = new Blob([JSON.stringify(sbom, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ml-sbom-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [lineage]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-6xl h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-violet-50 to-purple-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
              <Icon name="link" className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Model Lineage</h2>
              <p className="text-sm text-slate-500">Model provenance and supply chain governance</p>
            </div>
            {lineage.live ? (
              <LiveDataBadge source="SageMaker" detail="QueryLineage API" />
            ) : (
              <MockDataBadge integration="SageMaker QueryLineage API" />
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportSBOM}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              <Icon name="document-arrow-down" className="w-4 h-4" />
              Export ML-SBOM
            </button>
            <button
              onClick={lineage.refresh}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Icon name="arrow-path" className="w-4 h-4" />
              Refresh
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Close">
              <Icon name="x-mark" className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-700">View:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode('graph')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'graph'
                    ? 'bg-violet-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Graph View
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'list'
                    ? 'bg-violet-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                List View
              </button>
            </div>

            <div className="h-4 border-l border-slate-200" />

            <span className="text-sm font-medium text-slate-700">Filter:</span>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as LineageNodeType | 'all')}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
              aria-label="Filter node type"
            >
              <option value="all">All Types</option>
              <option value="dataset">Datasets</option>
              <option value="model">Models</option>
              <option value="endpoint">Endpoints</option>
            </select>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 text-xs">
            {Object.entries(NODE_STYLES).slice(0, 3).map(([type, style]) => (
              <span key={type} className="flex items-center gap-1">
                <span className={`w-3 h-3 rounded ${style.bg} border ${style.border}`} />
                <span className="text-slate-600 capitalize">{type}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {lineage.loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-slate-200 border-t-violet-600 rounded-full animate-spin" />
                <span className="text-sm text-slate-500">Loading lineage data...</span>
              </div>
            </div>
          ) : lineage.error ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 max-w-md text-center">
                <Icon name="exclamation-triangle" className="w-8 h-8 text-rose-500 mx-auto mb-2" />
                <p className="text-sm text-rose-700">{lineage.error}</p>
                <p className="text-xs text-rose-500 mt-1">Showing mock data instead</p>
              </div>
            </div>
          ) : viewMode === 'graph' ? (
            <GraphView
              nodes={positionedNodes}
              edges={visibleEdges}
              viewBox={viewBox}
              selectedNode={lineage.selectedNode}
              onSelectNode={lineage.selectNode}
              stats={lineage.stats}
            />
          ) : (
            <ListView
              nodes={lineage.graph.nodes}
              edges={lineage.graph.edges}
              selectedNode={lineage.selectedNode}
              onSelectNode={lineage.selectNode}
            />
          )}

          {/* Details Panel */}
          <div className="w-80 border-l border-slate-200 bg-white overflow-y-auto">
            {lineage.selectedNode ? (
              <NodeDetails
                node={lineage.selectedNode}
                edges={lineage.graph.edges}
                allNodes={lineage.graph.nodes}
                onSelectNode={lineage.selectNode}
              />
            ) : (
              <div className="p-6 text-center text-slate-500">
                <Icon name="cursor-arrow-rays" className="w-10 h-10 mx-auto mb-3 text-slate-400" />
                <p className="text-sm">Click a node to see its details and lineage</p>
              </div>
            )}

            {/* Stats */}
            <div className="border-t border-slate-200 p-4 bg-slate-50">
              <h4 className="text-xs font-semibold text-slate-700 mb-3">Lineage Summary</h4>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2 bg-white rounded-lg">
                  <div className="text-lg font-bold text-amber-600">{lineage.stats.datasets}</div>
                  <div className="text-[10px] text-slate-500">Datasets</div>
                </div>
                <div className="p-2 bg-white rounded-lg">
                  <div className="text-lg font-bold text-violet-600">{lineage.stats.models}</div>
                  <div className="text-[10px] text-slate-500">Models</div>
                </div>
                <div className="p-2 bg-white rounded-lg">
                  <div className="text-lg font-bold text-emerald-600">{lineage.stats.endpoints}</div>
                  <div className="text-[10px] text-slate-500">Endpoints</div>
                </div>
                <div className="p-2 bg-white rounded-lg">
                  <div className="text-lg font-bold text-purple-600">{lineage.stats.fineTunedModels}</div>
                  <div className="text-[10px] text-slate-500">Fine-Tuned</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Graph View ───────────────────────────

interface GraphViewProps {
  nodes: PositionedNode[];
  edges: { sourceId: string; targetId: string; associationType: string }[];
  viewBox: string;
  selectedNode: LineageNode | null;
  onSelectNode: (id: string | null) => void;
  stats: { totalNodes: number };
}

function GraphView({ nodes, edges, viewBox, selectedNode, onSelectNode, stats }: GraphViewProps) {
  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-slate-500">
          <Icon name="link" className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-sm">No lineage data available</p>
        </div>
      </div>
    );
  }

  // Map node IDs to positions for edge drawing
  const nodePositions = new Map(nodes.map(n => [n.id, { x: n.x, y: n.y }]));

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      {/* Column headers */}
      <div className="flex items-center justify-around px-6 py-2 bg-white border-b border-slate-100">
        <div className="flex items-center gap-2 text-xs font-medium text-amber-700">
          <Icon name="circle-stack" className="w-4 h-4" />
          Training Data
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-violet-700">
          <Icon name="cpu-chip" className="w-4 h-4" />
          Models
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
          <Icon name="plug" className="w-4 h-4" />
          Endpoints
        </div>
      </div>

      {/* Graph canvas */}
      <div className="flex-1 overflow-auto p-4">
        <svg viewBox={viewBox} className="w-full h-full min-h-[400px]" preserveAspectRatio="xMidYMid meet">
          {/* Arrow marker definitions */}
          <defs>
            <marker id="lineage-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
            </marker>
            <marker id="lineage-arrow-highlight" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#8b5cf6" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge, i) => {
            const source = nodePositions.get(edge.sourceId);
            const target = nodePositions.get(edge.targetId);
            if (!source || !target) return null;

            const isHighlighted = selectedNode?.id === edge.sourceId || selectedNode?.id === edge.targetId;
            const sourceX = source.x + 160;
            const sourceY = source.y + 30;
            const targetX = target.x;
            const targetY = target.y + 30;

            // Curved path for better visibility
            const midX = (sourceX + targetX) / 2;
            const path = `M ${sourceX} ${sourceY} Q ${midX} ${sourceY}, ${midX} ${(sourceY + targetY) / 2} T ${targetX} ${targetY}`;

            return (
              <g key={i}>
                <path
                  d={path}
                  fill="none"
                  stroke={isHighlighted ? '#8b5cf6' : '#cbd5e1'}
                  strokeWidth={isHighlighted ? 2.5 : 1.5}
                  strokeDasharray={edge.associationType === 'DerivedFrom' ? '6 3' : undefined}
                  markerEnd={isHighlighted ? 'url(#lineage-arrow-highlight)' : 'url(#lineage-arrow)'}
                  opacity={isHighlighted ? 1 : 0.6}
                />
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const style = NODE_STYLES[node.type];
            const isSelected = selectedNode?.id === node.id;
            const modelStyle = node.type === 'model' && node.modelType ? MODEL_TYPE_STYLES[node.modelType] : null;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => onSelectNode(isSelected ? null : node.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* Node background */}
                <rect
                  x="0"
                  y="0"
                  width="160"
                  height="60"
                  rx="8"
                  fill="white"
                  stroke={isSelected ? '#8b5cf6' : '#e2e8f0'}
                  strokeWidth={isSelected ? 3 : 1}
                  filter={isSelected ? 'drop-shadow(0 4px 6px rgba(139, 92, 246, 0.2))' : undefined}
                />

                {/* Node type indicator */}
                <rect
                  x="0"
                  y="0"
                  width="28"
                  height="60"
                  rx="8"
                  fill={style.bg.replace('bg-', '')}
                  className={style.bg}
                />

                {/* Type icon */}
                <text x="14" y="35" fontSize="16" textAnchor="middle" fill="#475569">
                  {style.glyph}
                </text>

                {/* Node name */}
                <text x="38" y="22" fontSize="11" fontWeight="600" fill="#1e293b">
                  {node.displayName.length > 16 ? node.displayName.substring(0, 16) + '...' : node.displayName}
                </text>

                {/* Node type label */}
                <text x="38" y="38" fontSize="9" fill="#64748b" className="capitalize">
                  {node.type}
                </text>

                {/* Model type badge */}
                {modelStyle && (
                  <g transform="translate(38, 44)">
                    <rect width="55" height="14" rx="3" fill={modelStyle.bg.replace('bg-', '')} className={modelStyle.bg} />
                    <text x="27.5" y="10" fontSize="8" fontWeight="500" textAnchor="middle" fill="#475569">
                      {modelStyle.label}
                    </text>
                  </g>
                )}

                {/* Live indicator */}
                {node.source === 'live' && (
                  <circle cx="150" cy="10" r="4" fill="#10b981" />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────── List View ───────────────────────────

interface ListViewProps {
  nodes: LineageNode[];
  edges: { sourceId: string; targetId: string; associationType: string }[];
  selectedNode: LineageNode | null;
  onSelectNode: (id: string | null) => void;
}

function ListView({ nodes, edges, selectedNode, onSelectNode }: ListViewProps) {
  // Group by type
  const grouped = useMemo(() => {
    const groups: Record<string, LineageNode[]> = {};
    nodes.forEach(node => {
      if (!groups[node.type]) groups[node.type] = [];
      groups[node.type].push(node);
    });
    return groups;
  }, [nodes]);

  const typeOrder: LineageNodeType[] = ['dataset', 'model', 'endpoint', 'context', 'artifact', 'action'];

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
      {typeOrder.map(type => {
        const items = grouped[type];
        if (!items || items.length === 0) return null;
        const style = NODE_STYLES[type];

        return (
          <div key={type} className="mb-6">
            <h3 className={`flex items-center gap-2 text-sm font-semibold mb-2 ${style.text}`}>
              <Icon name={style.icon} className="w-4 h-4" />
              <span className="capitalize">{type}s</span>
              <span className="text-slate-400 font-normal">({items.length})</span>
            </h3>
            <div className="space-y-2">
              {items.map(node => {
                const isSelected = selectedNode?.id === node.id;
                return (
                  <div
                    key={node.id}
                    {...rowButtonProps(() => onSelectNode(isSelected ? null : node.id), `View ${node.displayName}`)}
                    aria-pressed={isSelected}
                    className={`bg-white rounded-lg border p-3 cursor-pointer transition-all hover:shadow-sm focus-visible:ring-2 focus-visible:ring-violet-400 focus:outline-none ${
                      isSelected ? 'border-violet-400 shadow-md' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${style.bg}`}>
                          <Icon name={style.icon} className={`w-4 h-4 ${style.text}`} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">{node.displayName}</div>
                          <div className="text-xs text-slate-500">{node.name}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {node.type === 'model' && node.modelType && (
                          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${MODEL_TYPE_STYLES[node.modelType].bg} ${MODEL_TYPE_STYLES[node.modelType].text}`}>
                            {MODEL_TYPE_STYLES[node.modelType].label}
                          </span>
                        )}
                        {node.source === 'live' && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Live data" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────── Node Details ───────────────────────────

interface NodeDetailsProps {
  node: LineageNode;
  edges: { sourceId: string; targetId: string; associationType: string }[];
  allNodes: LineageNode[];
  onSelectNode: (id: string | null) => void;
}

function NodeDetails({ node, edges, allNodes, onSelectNode }: NodeDetailsProps) {
  const style = NODE_STYLES[node.type];

  // Find upstream and downstream nodes
  const upstream = useMemo(() => {
    const sourceIds = edges.filter(e => e.targetId === node.id).map(e => e.sourceId);
    return allNodes.filter(n => sourceIds.includes(n.id));
  }, [node, edges, allNodes]);

  const downstream = useMemo(() => {
    const targetIds = edges.filter(e => e.sourceId === node.id).map(e => e.targetId);
    return allNodes.filter(n => targetIds.includes(n.id));
  }, [node, edges, allNodes]);

  // Find base model if this is fine-tuned
  const baseModel = useMemo(() => {
    if (node.baseModelId) {
      return allNodes.find(n => n.id === node.baseModelId);
    }
    return null;
  }, [node, allNodes]);

  return (
    <div className="p-4 space-y-4">
      {/* Node header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${style.bg}`}>
            <Icon name={style.icon} className={`w-5 h-5 ${style.text}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{node.displayName}</h3>
            <p className="text-xs text-slate-500 capitalize">{node.type}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-2">
          <span className={`text-[10px] px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
            {node.type}
          </span>
          {node.type === 'model' && node.modelType && (
            <span className={`text-[10px] px-2 py-0.5 rounded ${MODEL_TYPE_STYLES[node.modelType].bg} ${MODEL_TYPE_STYLES[node.modelType].text}`}>
              {MODEL_TYPE_STYLES[node.modelType].label}
            </span>
          )}
          {node.source === 'live' && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
              Live
            </span>
          )}
        </div>
      </div>

      {/* Properties */}
      {node.properties && Object.keys(node.properties).length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-700 mb-2">Properties</h4>
          <div className="space-y-1">
            {Object.entries(node.properties).map(([key, value]) => (
              <div key={key} className="flex justify-between text-xs">
                <span className="text-slate-500">{key}</span>
                <span className="text-slate-900 font-medium truncate max-w-[140px]" title={value}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Base model (for fine-tuned) */}
      {baseModel && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-indigo-700 mb-2">Base Model</h4>
          <div
            {...rowButtonProps(() => onSelectNode(baseModel.id), `View ${baseModel.displayName}`)}
            className="flex items-center gap-2 p-2 bg-white rounded-lg cursor-pointer hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-400 focus:outline-none"
          >
            <Icon name="cpu-chip" className="w-4 h-4 text-indigo-600" />
            <div>
              <div className="text-xs font-medium text-slate-900">{baseModel.displayName}</div>
              <div className="text-[10px] text-slate-500">{baseModel.name}</div>
            </div>
          </div>
        </div>
      )}

      {/* Upstream (sources) */}
      {upstream.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-700 mb-2">
            Upstream ({upstream.length})
          </h4>
          <div className="space-y-1">
            {upstream.map(n => {
              const upStyle = NODE_STYLES[n.type];
              return (
                <div
                  key={n.id}
                  {...rowButtonProps(() => onSelectNode(n.id), `View ${n.displayName}`)}
                  className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-violet-400 focus:outline-none"
                >
                  <Icon name={upStyle.icon} className={`w-4 h-4 ${upStyle.text}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-900 truncate">{n.displayName}</div>
                    <div className="text-[10px] text-slate-500 capitalize">{n.type}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Downstream (dependents) */}
      {downstream.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-700 mb-2">
            Downstream ({downstream.length})
          </h4>
          <div className="space-y-1">
            {downstream.map(n => {
              const downStyle = NODE_STYLES[n.type];
              return (
                <div
                  key={n.id}
                  {...rowButtonProps(() => onSelectNode(n.id), `View ${n.displayName}`)}
                  className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-violet-400 focus:outline-none"
                >
                  <Icon name={downStyle.icon} className={`w-4 h-4 ${downStyle.text}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-900 truncate">{n.displayName}</div>
                    <div className="text-[10px] text-slate-500 capitalize">{n.type}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timestamps */}
      <div className="text-[10px] text-slate-400 space-y-0.5">
        {node.createdAt && <div>Created: {new Date(node.createdAt).toLocaleString()}</div>}
        {node.lastModifiedAt && <div>Modified: {new Date(node.lastModifiedAt).toLocaleString()}</div>}
      </div>

      <button
        onClick={() => onSelectNode(null)}
        className="w-full py-2 text-xs text-slate-500 hover:text-slate-700"
      >
        Clear selection
      </button>
    </div>
  );
}
