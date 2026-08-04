import { prioritizationApi } from '../../api/client';
import type { UseCase, UseCaseCreate } from '../../api/client';
import { DEFAULT_SCORES, DEFAULT_WEIGHTS } from './types';
import { computeLocal } from './scoring';

const LS_KEY = 'ava.prioritization.usecases';

function genId(): string {
  return 'uc-' + Math.random().toString(36).slice(2, 12);
}

function readLocal(): UseCase[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UseCase[];
  } catch {
    return [];
  }
}

function writeLocal(items: UseCase[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

function hydrate(req: UseCaseCreate, base?: UseCase): UseCase {
  const now = new Date().toISOString();
  const scores = req.scores ?? base?.scores ?? DEFAULT_SCORES;
  const weights = req.weights ?? base?.weights ?? DEFAULT_WEIGHTS;
  const computed = computeLocal(scores, weights);
  return {
    use_case_id: base?.use_case_id ?? genId(),
    name: req.name,
    description: req.description ?? base?.description ?? '',
    ai_type: req.ai_type ?? base?.ai_type ?? 'Generative AI',
    business_domain: req.business_domain ?? base?.business_domain ?? '',
    complexity: req.complexity ?? base?.complexity ?? 'Medium',
    automation_scope: req.automation_scope ?? base?.automation_scope ?? 'Co-pilot',
    integration_depth: req.integration_depth ?? base?.integration_depth ?? 'API-connected real-time',
    business_owner: req.business_owner ?? base?.business_owner ?? '',
    technical_owner: req.technical_owner ?? base?.technical_owner ?? '',
    target_go_live: req.target_go_live ?? base?.target_go_live ?? '',
    status: req.status ?? base?.status ?? 'Concept',
    created_at: base?.created_at ?? now,
    updated_at: now,
    created_by: base?.created_by ?? null,
    scores,
    weights,
    computed,
  };
}

/**
 * Tries the backend first; falls back to localStorage if the request fails.
 * Each method returns a `{ items, source }` tuple so the UI can show "offline" badges.
 */
export type Source = 'api' | 'local';

export const useCaseStore = {
  async list(): Promise<{ items: UseCase[]; source: Source }> {
    try {
      const items = await prioritizationApi.list();
      writeLocal(items); // Sync API items to localStorage
      return { items, source: 'api' };
    } catch {
      return { items: readLocal(), source: 'local' };
    }
  },

  async create(req: UseCaseCreate): Promise<{ item: UseCase; source: Source }> {
    try {
      const item = await prioritizationApi.create(req);
      const items = readLocal();
      items.unshift(item);
      writeLocal(items); // Sync to localStorage
      return { item, source: 'api' };
    } catch {
      const item = hydrate(req);
      const items = readLocal();
      items.unshift(item);
      writeLocal(items);
      return { item, source: 'local' };
    }
  },

  async update(id: string, req: Partial<UseCaseCreate>): Promise<{ item: UseCase; source: Source }> {
    try {
      const item = await prioritizationApi.update(id, req);
      const items = readLocal();
      const idx = items.findIndex((u) => u.use_case_id === id);
      if (idx !== -1) {
        items[idx] = item;
        writeLocal(items); // Sync to localStorage
      }
      return { item, source: 'api' };
    } catch {
      const items = readLocal();
      const idx = items.findIndex((u) => u.use_case_id === id);
      if (idx === -1) throw new Error('Use case not found');
      const updated = hydrate({ ...items[idx], ...req, name: req.name ?? items[idx].name }, items[idx]);
      items[idx] = updated;
      writeLocal(items);
      return { item: updated, source: 'local' };
    }
  },

  async delete(id: string): Promise<{ source: Source }> {
    try {
      await prioritizationApi.delete(id);
      const items = readLocal().filter((u) => u.use_case_id !== id);
      writeLocal(items); // Sync to localStorage
      return { source: 'api' };
    } catch {
      const items = readLocal().filter((u) => u.use_case_id !== id);
      writeLocal(items);
      return { source: 'local' };
    }
  },
};
