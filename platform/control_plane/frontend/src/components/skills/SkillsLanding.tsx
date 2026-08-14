import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { skillsApi, type CuratedSkill, type RegisteredSkill } from './api';

// Registry → Skills landing. Same MCP/A2A/Agents pattern:
//   * "My Skills" tab — records the user has published
//   * "Browse Curated" tab — 6 canonical skills (evaluation, extraction,
//     workflow, guardrail) with a Deploy button that publishes to the
//     registry. Same tab layout as MCP Servers / A2A Agents / Agents.

type Tab = 'my' | 'curated';

const POSTURE_TONE: Record<string, string> = {
  official:  'text-emerald-700 bg-emerald-50',
  community: 'text-slate-700 bg-slate-100',
};

const KIND_TONE: Record<string, string> = {
  evaluation: 'text-violet-700 bg-violet-50',
  extraction: 'text-emerald-700 bg-emerald-50',
  workflow:   'text-indigo-700 bg-indigo-50',
  guardrail:  'text-amber-700 bg-amber-50',
};

const STATUS_TONE: Record<string, string> = {
  active:     'text-emerald-700 bg-emerald-50',
  pending:    'text-amber-700 bg-amber-50',
  rejected:   'text-red-700 bg-red-50',
  deprecated: 'text-slate-500 bg-slate-100 line-through',
  failed:     'text-red-700 bg-red-50',
  unknown:    'text-slate-500 bg-slate-100',
};

export default function SkillsLanding() {
  const [tab, setTab] = useState<Tab>('my');
  const [mine, setMine] = useState<RegisteredSkill[]>([]);
  const [curated, setCurated] = useState<CuratedSkill[]>([]);
  const [curatedNote, setCuratedNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const curatedAvailableCount = useMemo(() => {
    const registeredIds = new Set(mine.map((s) => s.curated_id).filter(Boolean) as string[]);
    const registeredNames = new Set(mine.map((s) => (s.name || '').trim()).filter(Boolean));
    return curated.filter((c) => !registeredIds.has(c.id) && !registeredNames.has((c.name || '').trim())).length;
  }, [curated, mine]);

  const load = () => {
    setLoading(true);
    Promise.allSettled([skillsApi.list(), skillsApi.curated()])
      .then(([m, c]) => {
        if (m.status === 'fulfilled') setMine(m.value.skills || []);
        if (c.status === 'fulfilled') {
          setCurated(c.value.skills || []);
          setCuratedNote(c.value.note || '');
        }
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const deployCurated = async (c: CuratedSkill) => {
    setAdding(c.id);
    setErr('');
    try {
      await skillsApi.register({
        name: c.name,
        kind: c.kind,
        description: c.description,
        input_variables: c.input_variables || [],
        output_schema: c.output_schema,
        tags: c.tags || [],
        posture: c.posture,
        source: 'curated',
        curated_id: c.id,
      });
      load();
      setTab('my');
    } catch (e) {
      setErr(String(e));
    } finally {
      setAdding('');
    }
  };

  const deleteSkill = async (s: RegisteredSkill) => {
    if (!window.confirm(`Deprecate Skill "${s.name}"?\n\nThe record is soft-deleted (kept in the registry as DEPRECATED for audit); it stops appearing in discovery results.`))
      return;
    setErr('');
    setDeletingId(s.skill_id);
    try {
      await skillsApi.remove(s.skill_id);
      setMine((prev) => prev.filter((r) => r.skill_id !== s.skill_id));
      load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <Link to="/registry" className="hover:text-slate-700">Registry</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium">Skills</span>
      </div>

      <div className="rounded-2xl p-8 mb-6 text-white shadow-lg bg-gradient-to-br from-orange-500 to-amber-600">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full">
                Build · Registry · Skills
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full">
                AWS Agent Registry · SKILL
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Skills</h1>
            <p className="text-white/85 text-sm max-w-2xl leading-relaxed">
              Reusable agent procedures — evaluation rubrics, extraction schemas, multi-step workflows. Different
              from MCP tools (endpoint access) and A2A servers (peer delegation): skills carry procedural
              knowledge an agent equips at plan time.
            </p>
          </div>
        </div>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-3">{err}</div>}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        {(['my', 'curated'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'text-amber-700 border-amber-500' : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            {t === 'my' ? `My Skills (${mine.length})` : `Browse Curated (${curatedAvailableCount})`}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>}

      {!loading && tab === 'my' && (
        <>
          {mine.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center">
              <div className="text-slate-500 text-sm mb-4">No skills registered yet.</div>
              <button onClick={() => setTab('curated')} className="text-xs bg-amber-600 text-white hover:bg-amber-700 px-3 py-1.5 rounded-lg font-medium">
                Browse curated skills
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Name</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-28">Kind</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Inputs</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-24">Status</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-24">Source</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-28">Updated</th>
                    <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((s) => (
                    <tr key={s.skill_id} className="border-b border-slate-100 last:border-0 hover:bg-amber-50/40 transition-colors">
                      <td className="px-4 py-2.5 font-medium">
                        <div className="text-slate-800 truncate">{s.name}</div>
                        {s.description && <div className="text-[11px] text-slate-500 truncate max-w-md">{s.description}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${KIND_TONE[s.kind] || 'text-slate-700 bg-slate-100'}`}>
                          {s.kind}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {s.input_variables?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {s.input_variables.slice(0, 3).map((v) => (
                              <code key={v} className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{v}</code>
                            ))}
                            {s.input_variables.length > 3 && (
                              <span className="text-[10px] text-slate-400">+{s.input_variables.length - 3}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${STATUS_TONE[s.status] || STATUS_TONE.unknown}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${s.source === 'curated' ? 'text-violet-700 bg-violet-50' : 'text-slate-700 bg-slate-100'}`}>
                          {s.source}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{(s.updated_at || '').replace('T', ' ').slice(0, 19) || '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => deleteSkill(s)}
                          disabled={deletingId === s.skill_id}
                          className="text-xs text-red-600 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
                          title="Deprecate this Skill (soft-delete; kept in registry as DEPRECATED)"
                        >
                          {deletingId === s.skill_id ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!loading && tab === 'curated' && (
        <>
          {curatedNote && (
            <div className="rounded-lg border border-slate-200 bg-white/60 px-4 py-3 text-xs text-slate-600 mb-4">
              {curatedNote}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {curated
              .filter((c) => {
                const registeredIds = new Set(mine.map((s) => s.curated_id).filter(Boolean) as string[]);
                const registeredNames = new Set(mine.map((s) => (s.name || '').trim()).filter(Boolean));
                return !registeredIds.has(c.id) && !registeredNames.has((c.name || '').trim());
              })
              .map((c) => (
                <div key={c.id} className="rounded-2xl border border-slate-200 bg-white/85 shadow-sm p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-semibold text-slate-900 truncate">{c.name}</h2>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${POSTURE_TONE[c.posture] || 'text-slate-700 bg-slate-100'}`}>
                          {c.posture}
                        </span>
                        <span className={`text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${KIND_TONE[c.kind] || 'text-slate-700 bg-slate-100'}`}>
                          {c.kind}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-400 mt-0.5">{c.id}</div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed mb-3">{c.description}</p>

                  {c.input_variables && c.input_variables.length > 0 && (
                    <div className="text-[11px] text-slate-500 mb-2">
                      <span className="font-semibold text-slate-600">Inputs:</span>{' '}
                      {c.input_variables.map((v) => <code key={v} className="font-mono bg-slate-100 px-1 rounded mr-1">{v}</code>)}
                    </div>
                  )}

                  {c.tags && c.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {c.tags.map((t) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 bg-amber-50/60 text-amber-700 rounded-full">{t}</span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-end border-t border-slate-100 pt-3 mt-3">
                    <button
                      onClick={() => deployCurated(c)}
                      disabled={adding === c.id}
                      className="text-xs bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white px-3 py-1.5 rounded-lg font-medium"
                    >
                      {adding === c.id ? 'Deploying…' : 'Deploy to Registry'}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
