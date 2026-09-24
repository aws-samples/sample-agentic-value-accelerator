// Entity detail + relational context. Renders attributes and directly related
// entities (navigable). For use cases it renders the traceability spine
// (Domain → Value Lever → Solution → Use Case → Data / Tech) and offers the
// "Instantiate as prioritization" (Req 7) and "Build business case" (Req 11)
// actions. For solutions it also offers "Build business case".

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { prioritizationApi, businessCasesApi } from '../../api/client';
import type { BusinessCaseCreate } from '../../api/client';
import { DEFAULT_INPUTS, DEFAULT_COSTS, DEFAULT_BENEFITS, DEFAULT_RISK, DEFAULT_RISK_WEIGHTS } from '../business_cases/types';
import { catalogStore } from './store';
import { specFor, humanize, type CatalogEntity, type CatalogEntityType, type EntityTypeSpec } from './types';

interface Props {
  type: CatalogEntityType;
  entityId: string;
  onNavigate: (type: CatalogEntityType, id: string) => void;
  onEdit: (entity: CatalogEntity) => void;
  onHistory: (entity: CatalogEntity) => void;
  // Called after a successful delete so the parent can clear selection/reload.
  onDeleted?: (id: string) => void;
  // Read-only inspector mode (e.g. the Relationship Map side panel): hides the
  // edit/history controls and the mutating "instantiate"/"build" actions. The
  // v2 editing surface flips this off. Defaults to false to preserve the
  // catalog view's existing behavior.
  readOnly?: boolean;
}

function errStatus(e: unknown): number | undefined {
  return (e as { response?: { status?: number } })?.response?.status;
}

function errDetail(e: unknown): string {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof d === 'string') return d;
  return e instanceof Error ? e.message : 'Request failed';
}

const HIDDEN_ATTRS = new Set([
  'id', 'source_ref', 'version_no', 'created_at', 'updated_at',
  'created_by', 'updated_by', 'relationships', 'name',
]);

export default function EntityDetail({ type, entityId, onNavigate, onEdit, onHistory, onDeleted, readOnly = false }: Props) {
  const spec: EntityTypeSpec = specFor(type);
  const navigate = useNavigate();
  const [entity, setEntity] = useState<CatalogEntity | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!entity) return;
    const label = spec.label.toLowerCase();
    if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) return;
    setDeleting(true);
    setNotice(null);
    try {
      await catalogStore.remove(type, entity.id);
      onDeleted?.(entity.id);
    } catch (e) {
      if (errStatus(e) === 409 &&
          window.confirm(`${errDetail(e)}\n\nDelete it together with the dependent records?`)) {
        try {
          await catalogStore.remove(type, entity.id, true);
          onDeleted?.(entity.id);
          return;
        } catch (e2) {
          setNotice(errDetail(e2));
        }
      } else {
        setNotice(errDetail(e));
      }
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotice(null);
      try {
        const res = await catalogStore.get(type, entityId, true);
        if (!cancelled) setEntity(res.item);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [type, entityId]);

  const attrs = useMemo(() => {
    if (!entity) return [];
    return Object.entries(entity)
      .filter(([k, v]) => !HIDDEN_ATTRS.has(k) && v !== null && v !== undefined && v !== '')
      .map(([k, v]) => [k, v] as [string, unknown]);
  }, [entity]);

  const instantiatePrioritization = async () => {
    if (!entity) return;
    setAction('prioritization');
    setNotice(null);
    try {
      const preseed = await prioritizationApi.preseedFromCatalog(entity.id);
      const created = await prioritizationApi.create(preseed);
      navigate(`/use-cases?record=${created.use_case_id}`);
    } catch (e) {
      setNotice(e instanceof Error ? `Could not add: ${e.message}` : 'Could not add');
    } finally {
      setAction(null);
    }
  };

  const buildBusinessCase = async () => {
    if (!entity) return;
    setAction('business-case');
    setNotice(null);
    try {
      const missing = missingFinancials(entity);
      const created = await businessCasesApi.create(mapToBusinessCase(entity));
      const id = (created as { business_case_id?: string; id?: string }).business_case_id
        ?? (created as { id?: string }).id;
      if (missing.length) {
        setNotice(`Business case created; missing financial inputs: ${missing.join(', ')}`);
      }
      if (id) navigate(`/business-cases?record=${id}`);
    } catch (e) {
      setNotice(e instanceof Error ? `Could not build business case: ${e.message}` : 'Could not build business case');
    } finally {
      setAction(null);
    }
  };

  if (loading) return <div className="p-8 text-sm text-slate-400">Loading…</div>;
  if (!entity) return <div className="p-8 text-sm text-slate-400">Not found.</div>;

  const isUseCase = type === 'use-cases';
  const isSolution = type === 'solutions';

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <span className="text-[9px] font-bold text-indigo-600/80 bg-indigo-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider">{spec.label}</span>
          {entity.source_ref ? (
            <span className="ml-2 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Example</span>
          ) : (
            <span className="ml-2 text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Yours</span>
          )}
          <h2 className="text-2xl font-semibold text-slate-900 mt-1.5 tracking-tight">{entity.name}</h2>
          {typeof entity.description === 'string' && entity.description && (
            <p className="text-slate-500 mt-2 text-sm max-w-2xl">{entity.description}</p>
          )}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => onHistory(entity)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 rounded-lg border border-slate-200 hover:border-violet-300 hover:text-violet-600">
              History · v{entity.version_no}
            </button>
            <button onClick={() => onEdit(entity)} className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-md">
              Edit
            </button>
            <button onClick={handleDelete} disabled={deleting} className="px-3 py-1.5 text-xs font-semibold text-red-600 rounded-lg border border-red-200 hover:bg-red-50 disabled:opacity-50">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
        {readOnly && (
          <span className="flex-shrink-0 text-[10px] font-semibold text-slate-400 border border-slate-200 rounded-full px-2 py-0.5">v{entity.version_no}</span>
        )}
      </div>

      {/* Unification actions (mutating — hidden in read-only inspector mode) */}
      {!readOnly && (isUseCase || isSolution) && (
        <div className="flex flex-wrap gap-2 mb-5">
          {isUseCase && (
            <button
              onClick={instantiatePrioritization}
              disabled={action === 'prioritization'}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {action === 'prioritization' ? 'Adding…' : 'Add to prioritization →'}
            </button>
          )}
          {(isUseCase || isSolution) && (
            <button
              onClick={buildBusinessCase}
              disabled={action === 'business-case'}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-slate-700 border border-slate-200 hover:border-emerald-300 hover:text-emerald-700 transition-all disabled:opacity-50"
            >
              {action === 'business-case' ? 'Building…' : 'Build business case'}
            </button>
          )}
        </div>
      )}
      {notice && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5">{notice}</div>
      )}

      {/* Traceability spine for use cases */}
      {isUseCase && <Traceability entity={entity} onNavigate={onNavigate} />}

      {/* Attributes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Attributes</h3>
        {attrs.length === 0 ? (
          <p className="text-sm text-slate-400">No additional attributes.</p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {attrs.map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{humanize(k)}</dt>
                <dd className="text-sm text-slate-800">{renderValue(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* Related entities */}
      <div className="space-y-4">
        {spec.relationships.map((rel) => {
          const related = entity.relationships?.[rel.key] ?? [];
          return (
            <div key={rel.key} className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">{rel.label}</h3>
              {related.length === 0 ? (
                <p className="text-sm text-slate-400">No related {rel.label.toLowerCase()}.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {related.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => onNavigate(rel.targetType, r.id)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderValue(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

// Compact horizontal spine: Domain → Value Levers → Solutions → (this UC) → Data / Tech.
function Traceability({ entity, onNavigate }: { entity: CatalogEntity; onNavigate: (t: CatalogEntityType, id: string) => void }) {
  const rels = entity.relationships ?? {};
  const groups: { label: string; type: CatalogEntityType; items: { id: string; name: string }[] }[] = [
    { label: 'Solutions', type: 'solutions', items: rels.solutions ?? [] },
    { label: 'Data Assets', type: 'data-assets', items: rels.data_assets ?? [] },
    { label: 'Technology', type: 'technology-components', items: rels.technology_components ?? [] },
  ];
  return (
    <div className="bg-gradient-to-br from-indigo-50/60 to-violet-50/40 rounded-2xl border border-indigo-100 p-5 mb-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-500 mb-3">Traceability</h3>
      <div className="flex flex-col sm:flex-row gap-3">
        {groups.map((g) => (
          <div key={g.type} className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{g.label}</div>
            {g.items.length === 0 ? (
              <div className="text-xs text-slate-400">None linked</div>
            ) : (
              <div className="space-y-1">
                {g.items.map((it) => (
                  <button key={it.id} onClick={() => onNavigate(g.type, it.id)}
                    className="block w-full text-left px-2.5 py-1.5 text-xs rounded-lg bg-white/80 border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-700 truncate">
                    {it.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Business case mapping (Req 11) ---------------------------------------

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

// Financial inputs a Solution/Use Case ideally carries. Reported to the user
// when absent so they can proceed and fill them in (Req 11.3).
const FINANCIAL_KEYS = ['benefit_base', 'investment_base', 'run_cost_annual', 'expected_payback_months'];

function missingFinancials(entity: CatalogEntity): string[] {
  return FINANCIAL_KEYS.filter((k) => num(entity[k]) === undefined);
}

// Build a valid BusinessCaseCreate seeded from catalog financials. Costs and
// benefits derive from the solution's investment/run-cost/benefit where present;
// everything else falls back to the Business Cases tool's own defaults so the
// DCF model still computes.
function mapToBusinessCase(entity: CatalogEntity): BusinessCaseCreate {
  const investment = num(entity.investment_base);   // one-time (currency units)
  const runCost = num(entity.run_cost_annual);       // annual operating
  const benefit = num(entity.benefit_base);          // annual benefit

  // Amounts in the source are absolute currency; the business-case line items
  // are in thousands. Scale down so magnitudes line up with the tool's model.
  const k = (n?: number) => (n === undefined ? undefined : Math.round(n / 1000));

  const costs = (investment !== undefined || runCost !== undefined)
    ? {
        initial: [{ label: 'Initial Investment (from catalog)', year_0: k(investment) ?? 0, year_1: 0, year_2: 0, year_3: 0 }],
        operating: [{
          label: 'Annual Run Cost (from catalog)',
          year_0: 0, year_1: k(runCost) ?? 0, year_2: k(runCost) ?? 0, year_3: k(runCost) ?? 0,
        }],
        staffing: DEFAULT_COSTS.staffing,
      }
    : DEFAULT_COSTS;

  const benefits = benefit !== undefined
    ? {
        tangible: [{
          label: 'Annual Benefit (from catalog)',
          year_1: k(benefit) ?? 0, year_2: k(benefit) ?? 0, year_3: k(benefit) ?? 0,
        }],
        intangible: DEFAULT_BENEFITS.intangible,
      }
    : DEFAULT_BENEFITS;

  return {
    name: `${entity.name}`.slice(0, 120),
    description: typeof entity.description === 'string' ? entity.description : '',
    inputs: DEFAULT_INPUTS,
    costs,
    benefits,
    risk_scores: DEFAULT_RISK,
    risk_weights: DEFAULT_RISK_WEIGHTS,
  };
}
