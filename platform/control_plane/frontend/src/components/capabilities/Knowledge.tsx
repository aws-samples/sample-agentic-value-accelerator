import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { knowledgeApi } from '../../api/client';
import type { KnowledgeRegistration } from '../../types';
import RegisterKnowledgeModal from './RegisterKnowledgeModal';
import { Icon } from '../govern/icons';

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE:       { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  PROVISIONING: { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  FAILED:       { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
  DELETING:     { bg: 'bg-orange-50',  text: 'text-orange-700',  dot: 'bg-orange-500' },
  DELETED:      { bg: 'bg-slate-50',   text: 'text-slate-500',   dot: 'bg-slate-400' },
};

interface TypeTheme {
  id: string;
  label: string;
  pill: string;
  accentFrom: string;
  accentTo: string;
  hoverBorder: string;
  hoverTitle: string;
  chipBg: string;
  chipText: string;
  filterText: string;
}

const TYPE_THEMES: Record<string, TypeTheme> = {
  data_lake: {
    id: 'data_lake',
    label: 'Data Lake',
    pill: 'bg-violet-50 text-violet-700 border-violet-200',
    accentFrom: 'from-violet-500',
    accentTo: 'to-purple-600',
    hoverBorder: 'hover:border-violet-200',
    hoverTitle: 'group-hover:text-violet-700',
    chipBg: 'bg-violet-50',
    chipText: 'text-violet-700',
    filterText: 'text-violet-700',
  },
  knowledge_base: {
    id: 'knowledge_base',
    label: 'Knowledge Base',
    pill: 'bg-blue-50 text-blue-700 border-blue-200',
    accentFrom: 'from-blue-500',
    accentTo: 'to-indigo-600',
    hoverBorder: 'hover:border-blue-200',
    hoverTitle: 'group-hover:text-blue-700',
    chipBg: 'bg-blue-50',
    chipText: 'text-blue-600',
    filterText: 'text-blue-700',
  },
};

const DEFAULT_THEME: TypeTheme = {
  id: 'other',
  label: 'Other',
  pill: 'bg-slate-50 text-slate-700 border-slate-200',
  accentFrom: 'from-slate-400',
  accentTo: 'to-slate-500',
  hoverBorder: 'hover:border-slate-300',
  hoverTitle: 'group-hover:text-slate-700',
  chipBg: 'bg-slate-50',
  chipText: 'text-slate-600',
  filterText: 'text-slate-700',
};

function getTheme(type: string): TypeTheme {
  return TYPE_THEMES[type] ?? DEFAULT_THEME;
}

export default function Knowledge() {
  const [registrations, setRegistrations] = useState<KnowledgeRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeRegistration | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all');

  const fetchRegistrations = useCallback(async () => {
    try {
      const data = await knowledgeApi.list();
      setRegistrations(data.registrations.filter(r => r.status !== 'DELETED'));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  // Poll for in-progress items
  useEffect(() => {
    const hasInProgress = registrations.some(
      r => r.status === 'PROVISIONING' || r.status === 'DELETING',
    );
    if (!hasInProgress) return;
    const interval = setInterval(fetchRegistrations, 5000);
    return () => clearInterval(interval);
  }, [registrations, fetchRegistrations]);

  const handleRetry = async (id: string) => {
    await knowledgeApi.retry(id);
    fetchRegistrations();
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await knowledgeApi.delete(id);
      fetchRegistrations();
      setDeleteTarget(null);
    } catch (e: any) {
      setDeleteError(e?.response?.data?.detail || e?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const copyEndpoint = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  // Derive unique types present in the current list
  const presentTypes = Array.from(new Set(registrations.map(r => r.type)));

  const filtered = registrations.filter(reg => {
    const matchesType = typeFilter === 'all' || reg.type === typeFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      reg.name.toLowerCase().includes(q) ||
      reg.type.toLowerCase().includes(q) ||
      (reg.description || '').toLowerCase().includes(q) ||
      reg.tools.some(t => t.toLowerCase().includes(q));
    return matchesType && matchesSearch;
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      {/* Ombre gradient background — violet/purple/pink accent */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(237,233,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
          animation: 'gradientDrift 20s ease-in-out infinite',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="mb-8 animate-fade-in">
          <Link
            to="/capabilities"
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium"
          >
            ← Back to Capabilities
          </Link>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">Knowledge</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Register data lakes and knowledge bases as MCP servers. Agents discover and query your data automatically at runtime — no manual wiring required.
          </p>
        </div>

        {/* How Knowledge works — violet tone */}
        <div className="card bg-violet-50/50 border-violet-200/60 mb-6 animate-fade-in stagger-1">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon name="circle-stack" className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="text-sm text-violet-900 font-semibold">How Knowledge works</p>
              <p className="text-sm text-violet-700/80 mt-1">
                Each registered source spins up a dedicated <strong>MCP server</strong> backed by AgentCore Gateway. Agents receive the endpoint at deploy time and call it to discover schemas and run queries — Glue Catalogs, Bedrock Knowledge Bases, and S3 + Athena workgroups are all supported.
              </p>
            </div>
          </div>
        </div>

        {/* Register Knowledge CTA */}
        <div className="mb-6 animate-fade-in stagger-1">
          <div
            className="group relative bg-white rounded-xl border-2 border-dashed border-slate-300 overflow-hidden hover:border-violet-400 transition-all cursor-pointer"
            onClick={() => setShowDrawer(true)}
          >
            <div className="relative p-6 flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-violet-600 flex items-center justify-center shadow-md ring-1 ring-slate-900/5 group-hover:scale-105 group-hover:shadow-lg transition-all flex-shrink-0">
                <svg
                  className="w-7 h-7 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-semibold text-slate-900 group-hover:text-violet-700 transition-colors">
                    Register Knowledge Source
                  </h3>
                </div>
                <p className="text-sm text-slate-500">
                  Connect a data lake or knowledge base and expose it as an MCP server for your agents.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {['Glue Catalog', 'Bedrock KB', 'S3 + Athena', 'OpenSearch'].map(t => (
                    <span
                      key={t}
                      className="text-[10px] px-2 py-0.5 bg-slate-50 text-slate-600 rounded-md border border-slate-200"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="hidden sm:flex w-10 h-10 items-center justify-center rounded-full bg-slate-100 group-hover:bg-violet-100 transition-colors flex-shrink-0">
                <svg
                  className="w-4 h-4 text-slate-500 group-hover:text-violet-700 group-hover:translate-x-0.5 transition-all"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6 animate-fade-in stagger-1">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search by name, type, or tool..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full py-3 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm outline-none transition-all duration-150 focus:border-violet-400 pr-4"
            style={{ paddingLeft: '2.75rem' }}
          />
        </div>

        {/* Type filter */}
        <div className="flex flex-wrap gap-2 mb-8 animate-fade-in stagger-2">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              typeFilter === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            All ({registrations.length})
          </button>
          {presentTypes.map(type => {
            const theme = getTheme(type);
            const count = registrations.filter(r => r.type === type).length;
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  typeFilter === type
                    ? 'bg-slate-800 text-white'
                    : `bg-white ${theme.filterText} border border-slate-200 hover:border-slate-300`
                }`}
              >
                {theme.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Content area */}
        {loading ? (
          <div className="text-center py-20 text-slate-400">Loading...</div>
        ) : registrations.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl bg-white/60">
            <Icon name="circle-stack" className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <h3 className="text-lg font-semibold text-slate-700 mb-1">No knowledge sources registered</h3>
            <p className="text-sm text-slate-500 mb-4">
              Register a data lake or knowledge base to expose it as an MCP server for your agents.
            </p>
            <button
              onClick={() => setShowDrawer(true)}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700"
            >
              Register Knowledge
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in stagger-3">
              {filtered.map(reg => {
                const theme = getTheme(reg.type);
                const statusStyle = STATUS_STYLES[reg.status] || STATUS_STYLES.ACTIVE;
                return (
                  <div
                    key={reg.registration_id}
                    className={`group relative bg-white rounded-xl border border-slate-200 overflow-hidden ${theme.hoverBorder} hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col`}
                  >
                    {/* Top accent bar */}
                    <div className={`h-1 bg-gradient-to-r ${theme.accentFrom} ${theme.accentTo}`} />

                    <div className="relative p-6 flex flex-col flex-1">
                      {/* Type pill + status pill */}
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className={`inline-block text-xs font-semibold px-3 py-1 rounded-lg border ${theme.pill}`}
                        >
                          {theme.label}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusStyle.bg} ${statusStyle.text}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot} ${
                              reg.status === 'PROVISIONING' ? 'animate-pulse' : ''
                            }`}
                          />
                          {reg.status}
                        </span>
                      </div>

                      {/* Name */}
                      <h3
                        className={`text-xl font-bold text-slate-900 mb-2 ${theme.hoverTitle} transition-colors`}
                      >
                        {reg.name}
                      </h3>

                      {/* Key config fields */}
                      <div className="text-sm text-slate-500 mb-4 flex-1 space-y-1">
                        {reg.type === 'data_lake' && (
                          <>
                            {reg.config.databases?.length > 0 && (
                              <p>
                                <span className="font-medium text-slate-600">Databases: </span>
                                {reg.config.databases.join(', ')}
                              </p>
                            )}
                            {reg.config.athena_workgroup && (
                              <p>
                                <span className="font-medium text-slate-600">Workgroup: </span>
                                {reg.config.athena_workgroup}
                              </p>
                            )}
                          </>
                        )}
                        {reg.type === 'knowledge_base' && (
                          <>
                            {reg.config.knowledge_base_id && (
                              <p>
                                <span className="font-medium text-slate-600">KB ID: </span>
                                {reg.config.knowledge_base_id}
                              </p>
                            )}
                            {reg.config.model_id && (
                              <p>
                                <span className="font-medium text-slate-600">Model: </span>
                                {reg.config.model_id}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Tools chips */}
                      {reg.tools.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                            Tools
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {reg.tools.map(t => (
                              <span
                                key={t}
                                className={`text-xs px-2.5 py-1 ${theme.chipBg} ${theme.chipText} rounded-lg font-medium`}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Endpoint — only when ACTIVE */}
                      {reg.status === 'ACTIVE' && reg.gateway_endpoint && (
                        <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 mb-3">
                          <span className="text-xs text-slate-500">Endpoint:</span>
                          <code className="text-xs text-slate-700 font-mono flex-1 truncate">
                            {reg.gateway_endpoint}
                          </code>
                          <button
                            onClick={() => copyEndpoint(reg.gateway_endpoint)}
                            className="text-xs text-violet-600 hover:text-violet-800 font-medium"
                          >
                            Copy
                          </button>
                        </div>
                      )}

                      {/* Error notification */}
                      {reg.status === 'FAILED' && reg.error_message && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
                          <p className="text-xs text-red-700">{reg.error_message}</p>
                        </div>
                      )}

                      {/* Provisioning notification */}
                      {reg.status === 'PROVISIONING' && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-3">
                          <p className="text-xs text-blue-700">
                            Provisioning resources… This takes about 30 seconds.
                          </p>
                        </div>
                      )}

                      {/* Footer actions */}
                      <div className="pt-4 border-t border-slate-100 flex justify-end gap-2 mt-auto">
                        {reg.status === 'FAILED' && (
                          <button
                            onClick={() => handleRetry(reg.registration_id)}
                            className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                          >
                            Retry
                          </button>
                        )}
                        {(reg.status === 'ACTIVE' || reg.status === 'FAILED') && (
                          <button
                            onClick={() => setDeleteTarget(reg)}
                            className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-20 text-slate-400">
                {search
                  ? `No knowledge sources matching "${search}"`
                  : 'No knowledge sources in this category'}
              </div>
            )}
          </>
        )}
      </div>

      {/* Registration Modal */}
      <RegisterKnowledgeModal
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        onCreated={fetchRegistrations}
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(null); } }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Knowledge Source</h3>
            <p className="text-sm text-slate-600 mb-1">
              Are you sure you want to delete{' '}
              <span className="font-semibold">{deleteTarget.name}</span>?
            </p>
            <p className="text-xs text-slate-500 mb-5">
              This will tear down the MCP server, AgentCore Gateway, Runtime, and IAM role. This
              action cannot be undone.
            </p>
            {deleteError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                disabled={deleting}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget.registration_id)}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
