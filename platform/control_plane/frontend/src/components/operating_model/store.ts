import { operatingModelApi } from '../../api/client';
import type { OperatingModel as ApiOperatingModel } from '../../api/client';
import type { OperatingModel, OperatingModelCreate } from './types';
import {
  DEFAULT_WEIGHTS, DEFAULT_INVESTMENT, DEFAULT_ROADMAP,
  CAPABILITIES,
} from './types';
import { compute, recommendPattern, recommendGovernance } from './scoring';

const LS_KEY = 'ava.operatingModels';

function genId(): string { return 'om-' + Math.random().toString(36).slice(2, 12); }

function readLocal(): OperatingModel[] {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) as OperatingModel[] : []; }
  catch { return []; }
}
function writeLocal(items: OperatingModel[]) { localStorage.setItem(LS_KEY, JSON.stringify(items)); }

function defaultCapabilityChoices() {
  return CAPABILITIES.map((c) => ({
    capability_id: c.id,
    placement: c.defaultPlacement,
    ownership: c.defaultOwnership,
  }));
}

function hydrate(req: OperatingModelCreate, base?: OperatingModel): OperatingModel {
  const now = new Date().toISOString();
  const scores = req.scores ?? base?.scores ?? {};
  const weights = req.weights ?? base?.weights ?? DEFAULT_WEIGHTS;
  const investment = req.investment ?? base?.investment ?? DEFAULT_INVESTMENT;
  const roadmap = req.roadmap ?? base?.roadmap ?? DEFAULT_ROADMAP;
  const capabilityChoices = req.capability_choices ?? base?.capability_choices ?? defaultCapabilityChoices();
  const computed = compute(scores, weights, roadmap, investment);

  const pattern = req.pattern ?? base?.pattern ?? recommendPattern(computed.composite);
  const governance = req.governance ?? base?.governance ?? recommendGovernance(computed.composite);

  return {
    operating_model_id: base?.operating_model_id ?? genId(),
    name: req.name,
    description: req.description ?? base?.description ?? '',
    organization: req.organization ?? base?.organization ?? '',
    designer: req.designer ?? base?.designer ?? '',
    status: req.status ?? base?.status ?? 'Draft',
    created_at: base?.created_at ?? now,
    updated_at: now,
    scores,
    weights,
    pattern,
    governance,
    capability_choices: capabilityChoices,
    investment,
    roadmap,
    computed,
  };
}

export type Source = 'api' | 'local';

export class NameTakenError extends Error {
  constructor(name: string) {
    super(`Operating model name "${name}" is already in use`);
    this.name = 'NameTakenError';
  }
}

function nameMatches(items: OperatingModel[], name: string, exceptId?: string) {
  const lc = name.trim().toLowerCase();
  return items.some((m) => m.operating_model_id !== exceptId && m.name.trim().toLowerCase() === lc);
}

function fromApi(item: ApiOperatingModel): OperatingModel {
  return item as unknown as OperatingModel;
}

export const operatingModelStore = {
  async list(): Promise<{ items: OperatingModel[]; source: Source }> {
    try {
      const items = (await operatingModelApi.list()).map(fromApi);
      return { items, source: 'api' };
    } catch {
      return { items: readLocal(), source: 'local' };
    }
  },

  async create(req: OperatingModelCreate): Promise<{ item: OperatingModel; source: Source }> {
    try {
      const item = fromApi(await operatingModelApi.create(req));
      return { item, source: 'api' };
    } catch (apiErr: any) {
      if (apiErr?.message?.toLowerCase?.().includes('already in use')) throw new NameTakenError(req.name);
      const items = readLocal();
      if (nameMatches(items, req.name)) throw new NameTakenError(req.name);
      const item = hydrate(req);
      items.unshift(item);
      writeLocal(items);
      return { item, source: 'local' };
    }
  },

  async update(id: string, req: Partial<OperatingModelCreate>): Promise<{ item: OperatingModel; source: Source }> {
    try {
      const item = fromApi(await operatingModelApi.update(id, req));
      return { item, source: 'api' };
    } catch (apiErr: any) {
      if (apiErr?.message?.toLowerCase?.().includes('already in use')) throw new NameTakenError(req.name ?? '');
      const items = readLocal();
      const idx = items.findIndex((m) => m.operating_model_id === id);
      if (idx === -1) throw new Error('Operating model not found');
      if (req.name && nameMatches(items, req.name, id)) throw new NameTakenError(req.name);
      const updated = hydrate({ ...items[idx], ...req, name: req.name ?? items[idx].name }, items[idx]);
      items[idx] = updated;
      writeLocal(items);
      return { item: updated, source: 'local' };
    }
  },

  async delete(id: string): Promise<{ source: Source }> {
    try {
      await operatingModelApi.delete(id);
      return { source: 'api' };
    } catch {
      writeLocal(readLocal().filter((m) => m.operating_model_id !== id));
      return { source: 'local' };
    }
  },
};
