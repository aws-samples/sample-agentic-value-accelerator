import { businessCasesApi } from '../../api/client';
import type { BusinessCase, BusinessCaseCreate } from '../../api/client';
import {
  DEFAULT_INPUTS, DEFAULT_COSTS, DEFAULT_BENEFITS,
  DEFAULT_RISK, DEFAULT_RISK_WEIGHTS,
} from './types';
import { computeBC } from './scoring';

const LS_KEY = 'ava.businessCases';

function genId(): string { return 'bc-' + Math.random().toString(36).slice(2, 12); }

function readLocal(): BusinessCase[] {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) as BusinessCase[] : []; }
  catch { return []; }
}
function writeLocal(items: BusinessCase[]) { localStorage.setItem(LS_KEY, JSON.stringify(items)); }

function hydrate(req: BusinessCaseCreate, base?: BusinessCase): BusinessCase {
  const now = new Date().toISOString();
  const inputs = req.inputs ?? base?.inputs ?? DEFAULT_INPUTS;
  const costs = req.costs ?? base?.costs ?? DEFAULT_COSTS;
  const benefits = req.benefits ?? base?.benefits ?? DEFAULT_BENEFITS;
  const riskScores = req.risk_scores ?? base?.risk_scores ?? DEFAULT_RISK;
  const riskWeights = req.risk_weights ?? base?.risk_weights ?? DEFAULT_RISK_WEIGHTS;
  return {
    business_case_id: base?.business_case_id ?? genId(),
    name: req.name,
    description: req.description ?? base?.description ?? '',
    status: req.status ?? base?.status ?? 'Draft',
    created_at: base?.created_at ?? now,
    updated_at: now,
    created_by: base?.created_by ?? null,
    inputs, costs, benefits,
    risk_scores: riskScores,
    risk_weights: riskWeights,
    computed: computeBC(inputs, costs, benefits, riskScores, riskWeights),
  };
}

export type Source = 'api' | 'local';
export class NameTakenError extends Error {
  constructor(name: string) { super(`Business case name "${name}" is already in use`); this.name = 'NameTakenError'; }
}

function nameMatches(items: BusinessCase[], name: string, exceptId?: string) {
  const lc = name.trim().toLowerCase();
  return items.some((b) => b.business_case_id !== exceptId && b.name.trim().toLowerCase() === lc);
}

export const businessCaseStore = {
  async list(): Promise<{ items: BusinessCase[]; source: Source }> {
    try {
      const items = await businessCasesApi.list();
      writeLocal(items); // Sync API items to localStorage
      return { items, source: 'api' };
    } catch { return { items: readLocal(), source: 'local' }; }
  },
  async create(req: BusinessCaseCreate): Promise<{ item: BusinessCase; source: Source }> {
    try {
      const item = await businessCasesApi.create(req);
      const items = readLocal();
      items.unshift(item);
      writeLocal(items); // Sync to localStorage
      return { item, source: 'api' };
    }
    catch (e: any) {
      if (e?.message?.toLowerCase?.().includes('already in use')) throw new NameTakenError(req.name);
      const items = readLocal();
      if (nameMatches(items, req.name)) throw new NameTakenError(req.name);
      const item = hydrate(req);
      items.unshift(item);
      writeLocal(items);
      return { item, source: 'local' };
    }
  },
  async update(id: string, req: Partial<BusinessCaseCreate>): Promise<{ item: BusinessCase; source: Source }> {
    try {
      const item = await businessCasesApi.update(id, req);
      const items = readLocal();
      const idx = items.findIndex((b) => b.business_case_id === id);
      if (idx !== -1) {
        items[idx] = item;
        writeLocal(items); // Sync to localStorage
      }
      return { item, source: 'api' };
    } catch (e: any) {
      if (e?.message?.toLowerCase?.().includes('already in use')) throw new NameTakenError(req.name ?? '');
      const items = readLocal();
      const idx = items.findIndex((b) => b.business_case_id === id);
      if (idx === -1) throw new Error('Business case not found');
      if (req.name && nameMatches(items, req.name, id)) throw new NameTakenError(req.name);
      const updated = hydrate({ ...items[idx], ...req, name: req.name ?? items[idx].name }, items[idx]);
      items[idx] = updated;
      writeLocal(items);
      return { item: updated, source: 'local' };
    }
  },
  async delete(id: string): Promise<{ source: Source }> {
    try {
      await businessCasesApi.delete(id);
      writeLocal(readLocal().filter((b) => b.business_case_id !== id)); // Sync to localStorage
      return { source: 'api' };
    } catch {
      writeLocal(readLocal().filter((b) => b.business_case_id !== id));
      return { source: 'local' };
    }
  },
};
