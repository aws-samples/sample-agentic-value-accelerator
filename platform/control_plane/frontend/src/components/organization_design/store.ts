import { organizationDesignApi } from '../../api/client';
import type { OrganizationDesign as ApiOrgDesign } from '../../api/client';
import type { OrganizationDesign, OrganizationDesignCreate } from './types';
import {
  DEFAULT_PROFILE,
  DEFAULT_STRATEGY,
  DEFAULT_OPERATING_MODEL,
  DEFAULT_SCORES,
  DEFAULT_AGENT_CONFIG,
} from './types';
import { compute } from './scoring';

const LS_KEY = 'ava.organizationDesigns';

function genId(): string { return 'od-' + Math.random().toString(36).slice(2, 12); }

function readLocal(): OrganizationDesign[] {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) as OrganizationDesign[] : []; }
  catch { return []; }
}
function writeLocal(items: OrganizationDesign[]) { localStorage.setItem(LS_KEY, JSON.stringify(items)); }

function hydrate(req: OrganizationDesignCreate, base?: OrganizationDesign): OrganizationDesign {
  const now = new Date().toISOString();
  const profile = req.profile ?? base?.profile ?? DEFAULT_PROFILE;
  const strategy = req.strategy ?? base?.strategy ?? DEFAULT_STRATEGY;
  const operatingModel = req.operating_model ?? base?.operating_model ?? DEFAULT_OPERATING_MODEL;
  const scores = req.scores ?? base?.scores ?? DEFAULT_SCORES;
  const weights = req.weights ?? base?.weights ?? null;
  const agentConfig = req.agent_config ?? base?.agent_config ?? DEFAULT_AGENT_CONFIG;
  const computed = compute(profile, strategy, operatingModel, scores, weights, agentConfig);
  return {
    organization_design_id: base?.organization_design_id ?? genId(),
    name: req.name,
    description: req.description ?? base?.description ?? '',
    organization: req.organization ?? base?.organization ?? '',
    designer: req.designer ?? base?.designer ?? '',
    status: req.status ?? base?.status ?? 'Draft',
    created_at: base?.created_at ?? now,
    updated_at: now,
    profile, strategy, operating_model: operatingModel,
    scores, weights, agent_config: agentConfig,
    computed,
  };
}

export type Source = 'api' | 'local';

export class NameTakenError extends Error {
  constructor(name: string) {
    super(`Organization design name "${name}" is already in use`);
    this.name = 'NameTakenError';
  }
}

function nameMatches(items: OrganizationDesign[], name: string, exceptId?: string) {
  const lc = name.trim().toLowerCase();
  return items.some((m) => m.organization_design_id !== exceptId && m.name.trim().toLowerCase() === lc);
}

function fromApi(item: ApiOrgDesign): OrganizationDesign { return item as unknown as OrganizationDesign; }

export const organizationDesignStore = {
  async list(): Promise<{ items: OrganizationDesign[]; source: Source }> {
    try {
      const items = (await organizationDesignApi.list()).map(fromApi);
      return { items, source: 'api' };
    } catch {
      return { items: readLocal(), source: 'local' };
    }
  },

  async create(req: OrganizationDesignCreate): Promise<{ item: OrganizationDesign; source: Source }> {
    try {
      const item = fromApi(await organizationDesignApi.create(req));
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

  async update(id: string, req: Partial<OrganizationDesignCreate>): Promise<{ item: OrganizationDesign; source: Source }> {
    try {
      const item = fromApi(await organizationDesignApi.update(id, req));
      return { item, source: 'api' };
    } catch (apiErr: any) {
      if (apiErr?.message?.toLowerCase?.().includes('already in use')) throw new NameTakenError(req.name ?? '');
      const items = readLocal();
      const idx = items.findIndex((m) => m.organization_design_id === id);
      if (idx === -1) throw new Error('Organization design not found');
      if (req.name && nameMatches(items, req.name, id)) throw new NameTakenError(req.name);
      const merged: OrganizationDesignCreate = { ...items[idx], ...req, name: req.name ?? items[idx].name };
      const updated = hydrate(merged, items[idx]);
      items[idx] = updated;
      writeLocal(items);
      return { item: updated, source: 'local' };
    }
  },

  async delete(id: string): Promise<{ source: Source }> {
    try {
      await organizationDesignApi.delete(id);
      return { source: 'api' };
    } catch {
      writeLocal(readLocal().filter((m) => m.organization_design_id !== id));
      return { source: 'local' };
    }
  },
};
