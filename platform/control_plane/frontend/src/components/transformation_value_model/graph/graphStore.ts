// Relationship-graph store — API-first with a localStorage fallback, mirroring
// the catalog store convention. A successful fetch warms the local mirror so the
// map still renders (flagged `source: 'local'`) when the backend is unreachable.

import { catalogApi } from '../../../api/client';
import type { CatalogGraph, CatalogGraphParams } from '../../../api/client';

const LS_PREFIX = 'ava.catalog.graph.';

function keyFor(p: CatalogGraphParams): string {
  return `${LS_PREFIX}${p.scope_type}:${p.scope_id}:${p.include ?? ''}:${p.expand ?? ''}`;
}

export type GraphSource = 'api' | 'local';
export interface GraphResult { graph: CatalogGraph; source: GraphSource; }

export const graphStore = {
  async fetch(params: CatalogGraphParams): Promise<GraphResult> {
    try {
      const graph = await catalogApi.graph(params);
      try { localStorage.setItem(keyFor(params), JSON.stringify(graph)); } catch { /* quota — ignore */ }
      return { graph, source: 'api' };
    } catch (err) {
      try {
        const raw = localStorage.getItem(keyFor(params));
        if (raw) return { graph: JSON.parse(raw) as CatalogGraph, source: 'local' };
      } catch { /* parse/storage error — fall through */ }
      throw err instanceof Error ? err : new Error('Graph unavailable');
    }
  },
};
