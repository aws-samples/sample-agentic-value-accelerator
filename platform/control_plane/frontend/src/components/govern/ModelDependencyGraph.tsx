/**
 * ModelDependencyGraph — Visual graph showing model relationships
 *
 * Shows:
 * - Which use cases depend on which models
 * - Model-to-guardrail relationships
 * - Data source dependencies
 * - Impact analysis for model changes
 */

import { useState, useMemo, useEffect } from 'react';
import { MODELS, MODEL_DETAILS } from './mockData';
import { useGovernanceAggregator } from './useGovernanceAggregator';
import { Icon, type IconName } from './icons';
import { rowButtonProps } from './a11y';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type NodeType = 'model' | 'use-case' | 'guardrail' | 'data-source' | 'deployment';

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  sublabel?: string;
  tier?: string;
  status?: string;
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  type: 'depends' | 'protects' | 'feeds' | 'uses';
}

const nodeColors: Record<NodeType, { bg: string; border: string; text: string }> = {
  model: { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-700' },
  'use-case': { bg: 'bg-violet-50', border: 'border-violet-400', text: 'text-violet-700' },
  guardrail: { bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700' },
  'data-source': { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-700' },
  deployment: { bg: 'bg-rose-50', border: 'border-rose-400', text: 'text-rose-700' },
};

const nodeIcons: Record<NodeType, IconName> = {
  model: 'cpu-chip',
  'use-case': 'clipboard-list',
  guardrail: 'shield-check',
  'data-source': 'circle-stack',
  deployment: 'rocket-launch',
};

// Text glyphs for use inside SVG <text> elements (no JSX components allowed there)
const nodeGlyphs: Record<NodeType, string> = {
  model: '⊙',
  'use-case': '☰',
  guardrail: '⛨',
  'data-source': '⊗',
  deployment: '▶',
};

export default function ModelDependencyGraph({ isOpen, onClose }: Props) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'model' | 'use-case'>('all');
  const [highlightedModel, setHighlightedModel] = useState<string | null>(null);

  const { guardrails } = useGovernanceAggregator();

  // Build graph data from mock data and real AVA data
  const { nodes, edges } = useMemo(() => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Compact layout - centered around origin
    const dataSourceY = 20;
    const modelY = 120;
    const useCaseY = 220;
    const guardrailY = 320;
    const spacing = 130;

    // Only show first 5 models to keep graph manageable
    const modelsToShow = MODELS.slice(0, 5);
    const startX = 50;

    // Add models
    modelsToShow.forEach((model, i) => {
      const detail = MODEL_DETAILS[model.id];
      nodes.push({
        id: `model-${model.id}`,
        type: 'model',
        label: model.name,
        sublabel: model.provider,
        tier: model.tier,
        status: model.status,
        x: startX + i * spacing,
        y: modelY,
      });

      // Add one data source per model (simplified)
      if (detail?.osfiInventory?.dataInputs?.[0]) {
        const input = detail.osfiInventory.dataInputs[0];
        const dsId = `ds-${model.id}`;
        nodes.push({
          id: dsId,
          type: 'data-source',
          label: input.split(' ')[0],
          sublabel: input.length > 20 ? input.substring(0, 20) + '...' : input,
          x: startX + i * spacing,
          y: dataSourceY,
        });
        edges.push({ from: dsId, to: `model-${model.id}`, type: 'feeds' });
      }
    });

    // Add use cases from model details (limit to 5 for visibility)
    const useCasesFromModels: { name: string; owner: string; modelId: string }[] = [];
    modelsToShow.forEach(model => {
      const detail = MODEL_DETAILS[model.id];
      detail?.useCasesList?.slice(0, 2).forEach(uc => {
        useCasesFromModels.push({ name: uc.name, owner: uc.owner, modelId: model.id });
      });
    });

    // Dedupe and position use cases (max 5)
    const uniqueUseCases = Array.from(new Map(useCasesFromModels.map(uc => [uc.name, uc])).values()).slice(0, 5);
    uniqueUseCases.forEach((uc, i) => {
      const ucId = `uc-${uc.name.replace(/\s+/g, '-').toLowerCase()}`;
      nodes.push({
        id: ucId,
        type: 'use-case',
        label: uc.name.length > 18 ? uc.name.substring(0, 18) + '...' : uc.name,
        sublabel: uc.owner,
        x: startX + i * spacing,
        y: useCaseY,
      });

      // Find which models this use case uses
      useCasesFromModels.filter(u => u.name === uc.name).forEach(u => {
        if (modelsToShow.find(m => m.id === u.modelId)) {
          edges.push({ from: `model-${u.modelId}`, to: ucId, type: 'uses' });
        }
      });
    });

    // Add guardrails (max 4)
    const guardrailsToShow = guardrails.length > 0 ? guardrails.slice(0, 4) : [
      { template_id: 'g1', name: 'PII Filter', status: 'active' },
      { template_id: 'g2', name: 'Toxicity Filter', status: 'active' },
      { template_id: 'g3', name: 'Prompt Shield', status: 'active' },
    ];

    guardrailsToShow.forEach((g, i) => {
      const gId = `guardrail-${g.template_id}`;
      nodes.push({
        id: gId,
        type: 'guardrail',
        label: g.name,
        sublabel: g.status,
        status: g.status,
        x: startX + 30 + i * spacing,
        y: guardrailY,
      });

      // Connect guardrails to first 3 models
      modelsToShow.slice(0, 3).forEach(model => {
        edges.push({ from: gId, to: `model-${model.id}`, type: 'protects' });
      });
    });

    return { nodes, edges };
  }, [guardrails]);

  // Filter nodes based on view mode and highlight
  const filteredNodes = useMemo(() => {
    if (viewMode === 'all' && !highlightedModel) return nodes;

    if (highlightedModel) {
      const connectedIds = new Set<string>([`model-${highlightedModel}`]);
      edges.forEach(edge => {
        if (edge.from === `model-${highlightedModel}`) connectedIds.add(edge.to);
        if (edge.to === `model-${highlightedModel}`) connectedIds.add(edge.from);
      });
      return nodes.filter(n => connectedIds.has(n.id));
    }

    if (viewMode === 'model') return nodes.filter(n => n.type === 'model' || n.type === 'data-source');
    if (viewMode === 'use-case') return nodes.filter(n => n.type === 'use-case' || n.type === 'model');

    return nodes;
  }, [nodes, edges, viewMode, highlightedModel]);

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    return edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));
  }, [edges, filteredNodes]);

  // Impact analysis for selected node
  const impactAnalysis = useMemo(() => {
    if (!selectedNode) return null;

    const node = nodes.find(n => n.id === selectedNode);
    if (!node) return null;

    const upstream: GraphNode[] = [];
    const downstream: GraphNode[] = [];

    edges.forEach(edge => {
      if (edge.to === selectedNode) {
        const fromNode = nodes.find(n => n.id === edge.from);
        if (fromNode) upstream.push(fromNode);
      }
      if (edge.from === selectedNode) {
        const toNode = nodes.find(n => n.id === edge.to);
        if (toNode) downstream.push(toNode);
      }
    });

    return { node, upstream, downstream };
  }, [selectedNode, nodes, edges]);

  // Close the modal on Escape while it is open
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Calculate SVG viewBox based on filtered nodes to fit content
  const displayNodes = filteredNodes.length > 0 ? filteredNodes : nodes;
  const padding = 40;
  const minX = Math.min(...displayNodes.map(n => n.x)) - padding;
  const maxX = Math.max(...displayNodes.map(n => n.x)) + 140 + padding;
  const minY = Math.min(...displayNodes.map(n => n.y)) - padding;
  const maxY = Math.max(...displayNodes.map(n => n.y)) + 60 + padding;
  const viewWidth = maxX - minX;
  const viewHeight = maxY - minY;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-6xl h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-blue-50">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Model Dependency Graph</h2>
            <p className="text-sm text-slate-500">Visualize relationships between models, use cases, guardrails, and data</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Close">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-700">View:</span>
            <div className="flex gap-1">
              {[
                { id: 'all', label: 'All Relationships' },
                { id: 'model', label: 'Models & Data' },
                { id: 'use-case', label: 'Use Cases' },
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => { setViewMode(v.id as typeof viewMode); setHighlightedModel(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    viewMode === v.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className="h-4 border-l border-slate-200" />

            <span className="text-sm font-medium text-slate-700">Highlight Model:</span>
            <select
              value={highlightedModel || ''}
              onChange={e => setHighlightedModel(e.target.value || null)}
              aria-label="Highlight model"
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
            >
              <option value="">All models</option>
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 text-xs">
            {Object.entries(nodeColors).map(([type, colors]) => (
              <span key={type} className="flex items-center gap-1">
                <span className={`w-3 h-3 rounded ${colors.bg} border ${colors.border}`} />
                <span className="text-slate-600 capitalize">{type.replace('-', ' ')}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Graph + Details */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Graph Canvas */}
          <div className="flex-1 flex items-center justify-center bg-slate-50 p-4 overflow-auto">
            <svg
              viewBox={`${minX} ${minY} ${viewWidth} ${viewHeight}`}
              className="w-full h-full"
              style={{ maxWidth: '100%', maxHeight: '100%' }}
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Edges */}
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                </marker>
              </defs>

              {filteredEdges.map((edge, i) => {
                const fromNode = filteredNodes.find(n => n.id === edge.from);
                const toNode = filteredNodes.find(n => n.id === edge.to);
                if (!fromNode || !toNode) return null;

                const isHighlighted = selectedNode === edge.from || selectedNode === edge.to;
                const edgeColors = {
                  depends: '#8b5cf6',
                  protects: '#10b981',
                  feeds: '#f59e0b',
                  uses: '#3b82f6',
                };

                return (
                  <g key={i}>
                    <line
                      x1={fromNode.x + 60}
                      y1={fromNode.y + 20}
                      x2={toNode.x + 60}
                      y2={toNode.y + 20}
                      stroke={isHighlighted ? edgeColors[edge.type] : '#cbd5e1'}
                      strokeWidth={isHighlighted ? 2 : 1}
                      strokeDasharray={edge.type === 'protects' ? '4 2' : undefined}
                      markerEnd="url(#arrowhead)"
                      opacity={isHighlighted ? 1 : 0.5}
                    />
                  </g>
                );
              })}

              {/* Nodes */}
              {filteredNodes.map(node => {
                const colors = nodeColors[node.type];
                const isSelected = selectedNode === node.id;
                const isHighlighted = highlightedModel && node.id === `model-${highlightedModel}`;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={() => setSelectedNode(isSelected ? null : node.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x="0"
                      y="0"
                      width="120"
                      height="40"
                      rx="8"
                      className={`${colors.bg} ${colors.border}`}
                      fill="white"
                      stroke={isSelected || isHighlighted ? colors.border.replace('border-', '') : '#e2e8f0'}
                      strokeWidth={isSelected || isHighlighted ? 3 : 1}
                    />
                    <text x="30" y="18" fontSize="11" fontWeight="600" fill="#1e293b">
                      {node.label.length > 14 ? node.label.substring(0, 14) + '...' : node.label}
                    </text>
                    <text x="30" y="32" fontSize="9" fill="#64748b">
                      {node.sublabel?.substring(0, 16) || ''}
                    </text>
                    <text x="10" y="26" fontSize="14">
                      {nodeGlyphs[node.type]}
                    </text>
                    {node.tier && (
                      <rect x="95" y="5" width="20" height="12" rx="3" fill={
                        node.tier === 'Tier 1' ? '#fecaca' : node.tier === 'Tier 2' ? '#fef3c7' : '#d1fae5'
                      } />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Details Panel */}
          <div className="w-80 border-l border-slate-200 bg-white overflow-y-auto">
            {impactAnalysis ? (
              <div className="p-4 space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name={nodeIcons[impactAnalysis.node.type]} className="w-5 h-5" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{impactAnalysis.node.label}</h3>
                      <p className="text-xs text-slate-500">{impactAnalysis.node.sublabel}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded ${nodeColors[impactAnalysis.node.type].bg} ${nodeColors[impactAnalysis.node.type].text}`}>
                      {impactAnalysis.node.type.replace('-', ' ')}
                    </span>
                    {impactAnalysis.node.tier && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {impactAnalysis.node.tier}
                      </span>
                    )}
                    {impactAnalysis.node.status && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        {impactAnalysis.node.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Impact Analysis */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-amber-800 mb-2">Impact Analysis</h4>
                  <p className="text-[11px] text-amber-700">
                    Changes to this {impactAnalysis.node.type.replace('-', ' ')} would affect{' '}
                    <strong>{impactAnalysis.downstream.length}</strong> downstream dependencies
                    {impactAnalysis.upstream.length > 0 && (
                      <> and relies on <strong>{impactAnalysis.upstream.length}</strong> upstream sources</>
                    )}.
                  </p>
                </div>

                {/* Upstream */}
                {impactAnalysis.upstream.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-700 mb-2">Upstream Dependencies ({impactAnalysis.upstream.length})</h4>
                    <div className="space-y-1">
                      {impactAnalysis.upstream.map(n => (
                        <div
                          key={n.id}
                          {...rowButtonProps(() => setSelectedNode(n.id), `Select upstream dependency ${n.label}`)}
                          aria-pressed={selectedNode === n.id}
                          className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400 focus:outline-none"
                        >
                          <Icon name={nodeIcons[n.type]} className="w-4 h-4 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-slate-900 truncate">{n.label}</div>
                            <div className="text-[10px] text-slate-500 truncate">{n.sublabel}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Downstream */}
                {impactAnalysis.downstream.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-700 mb-2">Downstream Impact ({impactAnalysis.downstream.length})</h4>
                    <div className="space-y-1">
                      {impactAnalysis.downstream.map(n => (
                        <div
                          key={n.id}
                          {...rowButtonProps(() => setSelectedNode(n.id), `Select downstream dependency ${n.label}`)}
                          aria-pressed={selectedNode === n.id}
                          className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400 focus:outline-none"
                        >
                          <Icon name={nodeIcons[n.type]} className="w-4 h-4 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-slate-900 truncate">{n.label}</div>
                            <div className="text-[10px] text-slate-500 truncate">{n.sublabel}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setSelectedNode(null)}
                  className="w-full py-2 text-xs text-slate-500 hover:text-slate-700"
                >
                  Clear selection
                </button>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500">
                <Icon name="cursor-arrow-rays" className="w-10 h-10 mx-auto mb-3 text-slate-400" />
                <p className="text-sm">Click a node to see its dependencies and impact analysis</p>
              </div>
            )}

            {/* Edge Type Legend */}
            <div className="border-t border-slate-200 p-4">
              <h4 className="text-xs font-semibold text-slate-700 mb-2">Relationship Types</h4>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-0.5 bg-blue-500" />
                  <span className="text-slate-600">uses (model → use case)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-0.5 bg-emerald-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #10b981 0px, #10b981 4px, transparent 4px, transparent 6px)' }} />
                  <span className="text-slate-600">protects (guardrail → model)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-0.5 bg-amber-500" />
                  <span className="text-slate-600">feeds (data → model)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-0.5 bg-violet-500" />
                  <span className="text-slate-600">depends (use case → deploy)</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="border-t border-slate-200 p-4 bg-slate-50">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2 bg-white rounded-lg">
                  <div className="text-lg font-bold text-slate-900">{nodes.filter(n => n.type === 'model').length}</div>
                  <div className="text-[10px] text-slate-500">Models</div>
                </div>
                <div className="p-2 bg-white rounded-lg">
                  <div className="text-lg font-bold text-slate-900">{nodes.filter(n => n.type === 'use-case').length}</div>
                  <div className="text-[10px] text-slate-500">Use Cases</div>
                </div>
                <div className="p-2 bg-white rounded-lg">
                  <div className="text-lg font-bold text-slate-900">{nodes.filter(n => n.type === 'guardrail').length}</div>
                  <div className="text-[10px] text-slate-500">Guardrails</div>
                </div>
                <div className="p-2 bg-white rounded-lg">
                  <div className="text-lg font-bold text-slate-900">{edges.length}</div>
                  <div className="text-[10px] text-slate-500">Connections</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
