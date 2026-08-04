import { maturityApi } from '../../api/client';
import type { MaturityAssessment, MaturityAssessmentCreate } from '../../api/client';
import { DEFAULT_WEIGHTS } from './types';
import { computeMaturity } from './scoring';

const LS_KEY = 'ava.maturity.assessments';

function genId(): string { return 'as-' + Math.random().toString(36).slice(2, 12); }

function readLocal(): MaturityAssessment[] {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) as MaturityAssessment[] : []; }
  catch { return []; }
}
function writeLocal(items: MaturityAssessment[]) { localStorage.setItem(LS_KEY, JSON.stringify(items)); }

function hydrate(req: MaturityAssessmentCreate, base?: MaturityAssessment): MaturityAssessment {
  const now = new Date().toISOString();
  const scores = req.scores ?? base?.scores ?? {};
  const weights = req.weights ?? base?.weights ?? DEFAULT_WEIGHTS;
  return {
    assessment_id: base?.assessment_id ?? genId(),
    name: req.name,
    description: req.description ?? base?.description ?? '',
    organization: req.organization ?? base?.organization ?? '',
    assessor: req.assessor ?? base?.assessor ?? '',
    status: req.status ?? base?.status ?? 'Draft',
    created_at: base?.created_at ?? now,
    updated_at: now,
    created_by: base?.created_by ?? null,
    scores,
    weights,
    computed: computeMaturity(scores, weights),
  };
}

export type Source = 'api' | 'local';

export class NameTakenError extends Error {
  constructor(name: string) { super(`Assessment name "${name}" is already in use`); this.name = 'NameTakenError'; }
}

function nameMatches(items: MaturityAssessment[], name: string, exceptId?: string) {
  const lc = name.trim().toLowerCase();
  return items.some((a) => a.assessment_id !== exceptId && a.name.trim().toLowerCase() === lc);
}

export const assessmentStore = {
  async list(): Promise<{ items: MaturityAssessment[]; source: Source }> {
    try {
      const items = await maturityApi.list();
      writeLocal(items); // Sync API items to localStorage
      return { items, source: 'api' };
    } catch {
      return { items: readLocal(), source: 'local' };
    }
  },

  async create(req: MaturityAssessmentCreate): Promise<{ item: MaturityAssessment; source: Source }> {
    try {
      const item = await maturityApi.create(req);
      const items = readLocal();
      items.unshift(item);
      writeLocal(items); // Sync to localStorage
      return { item, source: 'api' };
    } catch (apiErr: any) {
      // 409 from backend = duplicate name; surface immediately.
      if (apiErr?.message?.toLowerCase?.().includes('already in use')) throw new NameTakenError(req.name);
      const items = readLocal();
      if (nameMatches(items, req.name)) throw new NameTakenError(req.name);
      const item = hydrate(req);
      items.unshift(item);
      writeLocal(items);
      return { item, source: 'local' };
    }
  },

  async update(id: string, req: Partial<MaturityAssessmentCreate>): Promise<{ item: MaturityAssessment; source: Source }> {
    try {
      const item = await maturityApi.update(id, req);
      const items = readLocal();
      const idx = items.findIndex((a) => a.assessment_id === id);
      if (idx !== -1) {
        items[idx] = item;
        writeLocal(items); // Sync to localStorage
      }
      return { item, source: 'api' };
    } catch (apiErr: any) {
      if (apiErr?.message?.toLowerCase?.().includes('already in use')) throw new NameTakenError(req.name ?? '');
      const items = readLocal();
      const idx = items.findIndex((a) => a.assessment_id === id);
      if (idx === -1) throw new Error('Assessment not found');
      if (req.name && nameMatches(items, req.name, id)) throw new NameTakenError(req.name);
      const updated = hydrate({ ...items[idx], ...req, name: req.name ?? items[idx].name }, items[idx]);
      items[idx] = updated;
      writeLocal(items);
      return { item: updated, source: 'local' };
    }
  },

  async delete(id: string): Promise<{ source: Source }> {
    try {
      await maturityApi.delete(id);
      const items = readLocal().filter((a) => a.assessment_id !== id);
      writeLocal(items); // Sync to localStorage
      return { source: 'api' };
    } catch {
      const items = readLocal().filter((a) => a.assessment_id !== id);
      writeLocal(items);
      return { source: 'local' };
    }
  },
};
