import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

// /registry/skills — shows the AVA-curated skills catalog (no public
// well-known catalog exists yet). Each row previews what a `SKILL`
// record in AWS Agent Registry will hold once the backend wrappers land.

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const httpClient = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } });
httpClient.interceptors.request.use((c) => {
  const t = localStorage.getItem('auth_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  const e = localStorage.getItem('dev_user_email');
  if (e) c.headers['x-user-email'] = e;
  return c;
});

interface CuratedSkill {
  id: string;
  name: string;
  posture: 'official' | 'community' | string;
  kind: string;
  description: string;
  input_variables?: string[];
  output_schema?: unknown;
  tags?: string[];
  source?: string;
}

interface CuratedResponse {
  note?: string;
  skills: CuratedSkill[];
  warning?: string;
}

const KIND_TONE: Record<string, string> = {
  evaluation:  'text-violet-700 bg-violet-50',
  extraction:  'text-emerald-700 bg-emerald-50',
  workflow:    'text-indigo-700 bg-indigo-50',
  guardrail:   'text-amber-700 bg-amber-50',
};

const POSTURE_TONE: Record<string, string> = {
  official:  'text-blue-700 bg-blue-50 border-blue-100',
  community: 'text-slate-600 bg-slate-100 border-slate-200',
};

export default function RegistrySkills() {
  const [skills, setSkills] = useState<CuratedSkill[]>([]);
  const [note, setNote] = useState('');
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    httpClient.get<CuratedResponse>('/api/v1/skills/curated')
      .then((r) => {
        setSkills(r.data.skills || []);
        setNote(r.data.note || '');
        setWarning(r.data.warning || '');
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-6 py-8">
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
                Build · Registry
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full">
                AWS Agent Registry · SKILL
              </span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              <h1 className="text-3xl font-semibold tracking-tight">Skills</h1>
            </div>
            <p className="text-white/85 text-sm max-w-2xl leading-relaxed">
              Reusable agent procedures — evaluation rubrics, extraction schemas, multi-step workflows an agent
              can equip at plan time. Different from MCP tools (endpoint access) and A2A servers (peer
              delegation).
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 text-xs text-amber-900 mb-6 flex items-start gap-2">
        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <div>
          <strong>Preview.</strong> Curated catalog only in v1 — no public well-known skills catalog exists yet
          (unlike MCP with modelcontextprotocol.io). Registration into AWS Agent Registry as SKILL records lands
          when the backend wrappers ship. Publications will route through Operate → Approval Queue like MCP + A2A.
        </div>
      </div>

      {note && (
        <div className="rounded-lg border border-slate-200 bg-white/60 px-4 py-3 text-xs text-slate-600 mb-4">
          {note}
        </div>
      )}
      {warning && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 mb-3">
          {warning}
        </div>
      )}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-3">{err}</div>}
      {loading && <div className="text-sm text-slate-400 py-8 text-center">Loading curated skills…</div>}

      {!loading && skills.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {skills.map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white/85 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-slate-900 truncate">{s.name}</h2>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${POSTURE_TONE[s.posture] || 'text-slate-600 bg-slate-100 border-slate-200'}`}>
                      {s.posture}
                    </span>
                    <span className={`text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${KIND_TONE[s.kind] || 'text-slate-700 bg-slate-100'}`}>
                      {s.kind}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 mt-0.5">{s.id}</div>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-3">{s.description}</p>

              {s.input_variables && s.input_variables.length > 0 && (
                <div className="text-[11px] text-slate-500 mb-2">
                  <span className="font-semibold text-slate-600">Inputs:</span>{' '}
                  {s.input_variables.map((v) => <code key={v} className="font-mono bg-slate-100 px-1 rounded mr-1">{v}</code>)}
                </div>
              )}

              {s.tags && s.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {s.tags.map((t) => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-[10px] text-slate-400">{s.source || 'curated'}</span>
                <button
                  disabled
                  title="Publish flow lands with the SKILL record wrappers"
                  className="text-[11px] text-slate-400 bg-slate-100 px-2 py-1 rounded cursor-not-allowed"
                >
                  Publish to Registry (soon)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        <Link to="/registry" className="text-indigo-700 hover:underline">← Back to Registry</Link>
        <span className="text-slate-300">·</span>
        <Link to="/mcp" className="text-indigo-700 hover:underline">MCP Servers</Link>
        <span className="text-slate-300">·</span>
        <Link to="/a2a" className="text-indigo-700 hover:underline">A2A Agents</Link>
      </div>
    </div>
  );
}
