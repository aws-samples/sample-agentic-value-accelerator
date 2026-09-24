// Resume-where-you-left-off persistence for the Relationship Map. Stores the
// meaningful view (scope + included optional types + expanded node ids) in
// localStorage so reopening the tab restores the last exploration. Node
// positions are intentionally not persisted: the dagre layout is deterministic,
// so the same scope/include/expand reproduces the same arrangement.

export type ScopeType = 'segment' | 'domain';

export interface GraphViewState {
  scopeType: ScopeType;
  scopeId: string;
  include: string[];     // optional entity-type slugs (fetched)
  expanded: string[];    // node ids the user expanded
  hidden: string[];      // entity-type slugs hidden from view (client-side)
  hiddenLinks: string[]; // edge kinds hidden from view: 'fk' and/or 'junction'
}

const KEY = 'ava.catalog.graph.view';

export function loadViewState(): GraphViewState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<GraphViewState>;
    if (!v || (v.scopeType !== 'segment' && v.scopeType !== 'domain') || typeof v.scopeId !== 'string') {
      return null;
    }
    return {
      scopeType: v.scopeType,
      scopeId: v.scopeId,
      include: Array.isArray(v.include) ? v.include.filter((s) => typeof s === 'string') : [],
      expanded: Array.isArray(v.expanded) ? v.expanded.filter((s) => typeof s === 'string') : [],
      hidden: Array.isArray(v.hidden) ? v.hidden.filter((s) => typeof s === 'string') : [],
      hiddenLinks: Array.isArray(v.hiddenLinks) ? v.hiddenLinks.filter((s) => typeof s === 'string') : [],
    };
  } catch {
    return null;
  }
}

export function saveViewState(state: GraphViewState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota / unavailable — ignore */
  }
}
