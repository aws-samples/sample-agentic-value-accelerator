// View-model types + per-entity styling for the Relationship Map, plus pure
// transforms from the API graph payload to React Flow nodes/edges. Kept separate
// from the canvas so it is trivially unit-testable and free of React Flow render
// concerns. Node positions are assigned later by the (swappable) layout module.

import type { Node, Edge } from '@xyflow/react';
import type {
  CatalogEntityType, CatalogGraph, CatalogGraphNode, CatalogGraphEdge,
} from '../../../api/client';
import { ENTITY_TYPE_MAP } from '../types';

// Fixed node box used both for rendering and for layout sizing.
export const NODE_WIDTH = 232;
export const NODE_HEIGHT = 92;

export interface EntityStyle {
  label: string;
  icon: string;
  hex: string;        // solid accent — used for the node bar + minimap
  chipClass: string;  // Tailwind classes for the type pill (literal for JIT)
}

// One distinct hue per entity type. `label`/`icon` reuse the catalog registry so
// the map and the list view stay in visual sync.
export const ENTITY_STYLE: Record<CatalogEntityType, EntityStyle> = {
  'industries': { label: ENTITY_TYPE_MAP['industries'].label, icon: ENTITY_TYPE_MAP['industries'].icon, hex: '#475569', chipClass: 'bg-slate-100 text-slate-700' },
  'industry-segments': { label: ENTITY_TYPE_MAP['industry-segments'].label, icon: ENTITY_TYPE_MAP['industry-segments'].icon, hex: '#0d9488', chipClass: 'bg-teal-50 text-teal-700' },
  'business-domains': { label: ENTITY_TYPE_MAP['business-domains'].label, icon: ENTITY_TYPE_MAP['business-domains'].icon, hex: '#4f46e5', chipClass: 'bg-indigo-50 text-indigo-700' },
  'value-levers': { label: ENTITY_TYPE_MAP['value-levers'].label, icon: ENTITY_TYPE_MAP['value-levers'].icon, hex: '#059669', chipClass: 'bg-emerald-50 text-emerald-700' },
  'kpis': { label: ENTITY_TYPE_MAP['kpis'].label, icon: ENTITY_TYPE_MAP['kpis'].icon, hex: '#d97706', chipClass: 'bg-amber-50 text-amber-700' },
  'solutions': { label: ENTITY_TYPE_MAP['solutions'].label, icon: ENTITY_TYPE_MAP['solutions'].icon, hex: '#7c3aed', chipClass: 'bg-violet-50 text-violet-700' },
  'use-cases': { label: ENTITY_TYPE_MAP['use-cases'].label, icon: ENTITY_TYPE_MAP['use-cases'].icon, hex: '#2563eb', chipClass: 'bg-blue-50 text-blue-700' },
  'data-assets': { label: ENTITY_TYPE_MAP['data-assets'].label, icon: ENTITY_TYPE_MAP['data-assets'].icon, hex: '#0891b2', chipClass: 'bg-cyan-50 text-cyan-700' },
  'technology-components': { label: ENTITY_TYPE_MAP['technology-components'].label, icon: ENTITY_TYPE_MAP['technology-components'].icon, hex: '#e11d48', chipClass: 'bg-rose-50 text-rose-700' },
};

// Canonical left→right rank per entity type. Rendered edges keep their semantic
// direction (child→parent for FK, solution→X for junction), but the layout is
// oriented by this rank so the spine always reads industry → segment → domain →
// value lever → (kpi/solution) → use case → (data asset / technology component),
// regardless of which way any given edge points.
export const ENTITY_RANK: Record<CatalogEntityType, number> = {
  'industries': 0,
  'industry-segments': 1,
  'business-domains': 2,
  'value-levers': 3,
  'kpis': 4,
  'solutions': 4,
  'use-cases': 5,
  'data-assets': 6,
  'technology-components': 6,
};

// A couple of key attributes worth surfacing on the node card, per type.
export const NODE_CARD_ATTRS: Partial<Record<CatalogEntityType, string[]>> = {
  'business-domains': ['domain_category', 'overall_priority_score'],
  'value-levers': ['lever_type', 'financial_value_base'],
  'kpis': ['unit_of_measure', 'target_value'],
  'solutions': ['solution_type', 'benefit_base'],
  'use-cases': ['use_case_type', 'complexity'],
  'data-assets': ['data_asset_type', 'readiness_status'],
  'technology-components': ['technology_type', 'architecture_layer'],
};

export interface GraphNodeData {
  entityType: CatalogEntityType;
  name: string;
  status?: string | null;
  attrs: Record<string, unknown>;
  versionNo: number;
  [key: string]: unknown;
}

export type RFNode = Node<GraphNodeData, 'entity'>;
export type RFEdge = Edge;

export function toRFNodes(graph: CatalogGraph): RFNode[] {
  return graph.nodes.map((n: CatalogGraphNode) => ({
    id: n.id,
    type: 'entity',
    position: { x: 0, y: 0 }, // assigned by layout
    data: {
      entityType: n.entity_type,
      name: n.name,
      status: n.status,
      attrs: n.attrs ?? {},
      versionNo: n.version_no,
    },
  }));
}

export function toRFEdges(graph: CatalogGraph): RFEdge[] {
  // Orient each rendered edge along the left→right spine so its connector leaves
  // the higher-level (lower-rank) node's RIGHT handle and enters the lower-level
  // (higher-rank) node's LEFT handle — e.g. business domain → value lever. The
  // payload keeps edges in their semantic direction (child→parent for FK), which
  // would otherwise make React Flow curl the line back from the right-most node
  // to the left-most one. Downstream focus/hide logic treats both endpoints
  // symmetrically, so flipping source/target here is purely visual.
  const rankOf = new Map<string, number>();
  for (const n of graph.nodes) rankOf.set(n.id, ENTITY_RANK[n.entity_type] ?? 99);

  return graph.edges.map((e: CatalogGraphEdge) => {
    const forward = (rankOf.get(e.source) ?? 99) <= (rankOf.get(e.target) ?? 99);
    const [source, target] = forward ? [e.source, e.target] : [e.target, e.source];
    return {
      id: e.id,
      source,
      target,
      type: 'smoothstep',
      // FK (hierarchy) edges are dashed and lighter; junction edges are solid.
      style: e.rel_kind === 'fk'
        ? { stroke: '#94a3b8', strokeDasharray: '4 4', strokeWidth: 1.5 }
        : { stroke: '#cbd5e1', strokeWidth: 1.5 },
      data: { relKey: e.rel_key, relKind: e.rel_kind },
    };
  });
}

// Format a scalar attribute value compactly for a node card.
export function formatAttr(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    return Math.abs(value) >= 1000 ? value.toLocaleString() : String(value);
  }
  return String(value);
}
