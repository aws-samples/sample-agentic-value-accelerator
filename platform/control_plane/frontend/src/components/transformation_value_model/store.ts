// Reference Catalog store — API-first with a localStorage fallback, mirroring
// the operating_model store convention. Every read/write tries the backend; on
// failure it serves browser-stored data and flags `source: 'local'`. A
// successful API read re-syncs the local mirror so it stays warm for offline use.

import { catalogApi } from '../../api/client';
import type {
  CatalogEntity, CatalogEntityType, CatalogVersionRecord, CatalogVersionDiff,
  CatalogLibrary, CatalogImportReport, CatalogLifecycleMode, CatalogLifecycleResult,
  CatalogSeedStatus, CatalogDeleteResult,
} from '../../api/client';
import { specFor, type Source } from './types';

const LS_PREFIX = 'ava.catalog.';
const lsKey = (type: CatalogEntityType) => `${LS_PREFIX}${type}`;

function readLocal(type: CatalogEntityType): CatalogEntity[] {
  try {
    const raw = localStorage.getItem(lsKey(type));
    return raw ? (JSON.parse(raw) as CatalogEntity[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(type: CatalogEntityType, items: CatalogEntity[]) {
  try { localStorage.setItem(lsKey(type), JSON.stringify(items)); } catch { /* quota — ignore */ }
}

// Drop every cached list so the next read re-syncs from the API. Used after a
// bulk lifecycle/import that changes many types at once.
function clearAllLocal() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

function upsertLocal(type: CatalogEntityType, entity: CatalogEntity) {
  const items = readLocal(type);
  const idx = items.findIndex((i) => i.id === entity.id);
  if (idx === -1) items.unshift(entity);
  else items[idx] = entity;
  writeLocal(type, items);
}

function genId(type: CatalogEntityType): string {
  return `${specFor(type).idPrefix}-${Math.random().toString(36).slice(2, 12)}`;
}

// Local mirror stores scalar attributes only; the `relationships` write payload
// (a map of rel-key -> ids) is dropped since the offline mirror can't resolve
// related entity names. The API mirror re-syncs full data on the next success.
function omitRelationships(data: Record<string, unknown>): Record<string, unknown> {
  const { relationships: _rel, ...attrs } = data as { relationships?: unknown };
  void _rel;
  return attrs;
}

// Case-insensitive local text/attribute/relationship filtering to mirror the API
// so offline results are consistent with online ones.
function filterLocal(
  items: CatalogEntity[],
  params: { q?: string; filters?: Record<string, string>; },
): CatalogEntity[] {
  let out = items;
  if (params.q) {
    const q = params.q.toLowerCase();
    out = out.filter((i) =>
      String(i.name ?? '').toLowerCase().includes(q) ||
      String(i.description ?? '').toLowerCase().includes(q)
    );
  }
  if (params.filters) {
    for (const [k, v] of Object.entries(params.filters)) {
      if (v === undefined || v === '') continue;
      out = out.filter((i) => String(i[k] ?? '') === String(v));
    }
  }
  return out;
}

export interface ListResult { items: CatalogEntity[]; source: Source; }
export interface OneResult { item: CatalogEntity; source: Source; }

export const catalogStore = {
  async list(
    type: CatalogEntityType,
    opts: { q?: string; filters?: Record<string, string>; relatedKey?: string; relatedId?: string; limit?: number; offset?: number } = {},
  ): Promise<ListResult> {
    const params: Record<string, string | number | undefined> = {
      q: opts.q, limit: opts.limit ?? 200, offset: opts.offset,
      related_key: opts.relatedKey, related_id: opts.relatedId,
      ...(opts.filters ?? {}),
    };
    try {
      const items = await catalogApi.list(type, params);
      writeLocal(type, items); // re-sync mirror on success (Req 9.4)
      return { items, source: 'api' };
    } catch {
      const items = filterLocal(readLocal(type), { q: opts.q, filters: opts.filters });
      return { items, source: 'local' };
    }
  },

  async get(type: CatalogEntityType, id: string, withRelationships = false): Promise<OneResult> {
    try {
      const item = await catalogApi.get(type, id, withRelationships);
      upsertLocal(type, item);
      return { item, source: 'api' };
    } catch {
      const item = readLocal(type).find((i) => i.id === id);
      if (!item) throw new Error(`${type} '${id}' not found`);
      return { item, source: 'local' };
    }
  },

  async create(type: CatalogEntityType, data: Record<string, unknown>): Promise<OneResult> {
    try {
      const item = await catalogApi.create(type, data);
      upsertLocal(type, item);
      return { item, source: 'api' };
    } catch {
      const now = new Date().toISOString();
      const attrs = omitRelationships(data);
      const item: CatalogEntity = {
        id: genId(type),
        source_ref: null,
        version_no: 1,
        created_at: now,
        updated_at: now,
        created_by: 'local',
        updated_by: 'local',
        name: String(attrs.name ?? 'Untitled'),
        ...attrs,
      } as CatalogEntity;
      upsertLocal(type, item);
      return { item, source: 'local' };
    }
  },

  async update(type: CatalogEntityType, id: string, data: Record<string, unknown>): Promise<OneResult> {
    try {
      const item = await catalogApi.update(type, id, data);
      upsertLocal(type, item);
      return { item, source: 'api' };
    } catch {
      const items = readLocal(type);
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) throw new Error(`${type} '${id}' not found`);
      const attrs = omitRelationships(data);
      const updated: CatalogEntity = {
        ...items[idx],
        ...attrs,
        version_no: (items[idx].version_no ?? 1) + 1,
        updated_at: new Date().toISOString(),
        updated_by: 'local',
      } as CatalogEntity;
      items[idx] = updated;
      writeLocal(type, items);
      return { item: updated, source: 'local' };
    }
  },

  async versions(type: CatalogEntityType, id: string): Promise<{ items: CatalogVersionRecord[]; source: Source }> {
    try {
      return { items: await catalogApi.versions(type, id), source: 'api' };
    } catch {
      return { items: [], source: 'local' };
    }
  },

  async diff(type: CatalogEntityType, id: string, from: number, to: number): Promise<CatalogVersionDiff> {
    return catalogApi.diff(type, id, from, to);
  },

  // Delete one entity. Server rejections (e.g. 409 blocked-by-children) are
  // surfaced; only a genuine offline failure falls back to local removal.
  async remove(type: CatalogEntityType, id: string, cascade = false): Promise<{ result: CatalogDeleteResult; source: Source }> {
    try {
      const result = await catalogApi.remove(type, id, cascade);
      const removed = new Set(result.deleted);
      writeLocal(type, readLocal(type).filter((i) => !removed.has(i.id)));
      return { result, source: 'api' };
    } catch (e) {
      const err = e as { response?: unknown };
      if (err.response) throw e; // server said no (409/404/…): surface it
      writeLocal(type, readLocal(type).filter((i) => i.id !== id));
      return { result: { deleted: [id], counts: { [type]: 1 } }, source: 'local' };
    }
  },

  async seedStatus(): Promise<CatalogSeedStatus | null> {
    try {
      return await catalogApi.seedStatus();
    } catch {
      return null;
    }
  },

  async seedLibrary(): Promise<CatalogLibrary> {
    try {
      return await catalogApi.seedLibrary();
    } catch {
      return {};
    }
  },

  // Selective (or full) import of shipped examples. Clears the local mirror so
  // subsequent reads reflect the new server state.
  async importSeed(body: { source_refs?: string[]; include_dependencies?: boolean } = {}): Promise<CatalogImportReport> {
    const report = await catalogApi.importSeed(body);
    clearAllLocal();
    return report;
  },

  async lifecycle(mode: CatalogLifecycleMode): Promise<CatalogLifecycleResult> {
    const result = await catalogApi.lifecycle(mode);
    clearAllLocal();
    return result;
  },

  async searchVersions(params: { type?: string; actor?: string; from?: string; to?: string; field?: string }): Promise<CatalogVersionRecord[]> {
    try {
      return await catalogApi.searchVersions(params);
    } catch {
      return [];
    }
  },
};
