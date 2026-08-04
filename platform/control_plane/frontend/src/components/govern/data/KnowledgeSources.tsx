/**
 * KnowledgeSources — Shows knowledge sources from Operate module in Data Governance
 *
 * Displays:
 * - Knowledge base registrations (Data Lakes, Bedrock KBs)
 * - Glue databases discovered
 * - Bedrock knowledge bases
 * - Which agents use which knowledge sources
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { knowledgeApi, deploymentsApi } from '../../../api/client';
import type { KnowledgeRegistration, GlueDatabase, Deployment } from '../../../types';
import { LiveDataBadge } from '../DataSourceIndicator';
import { Icon } from '../icons';

interface BedrockKB {
  id: string;
  name: string;
  description: string;
  status: string;
  updated_at: string;
}

interface AthenaWorkgroup {
  name: string;
  state: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  PROVISIONING: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  FAILED: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  DELETING: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  DELETED: { bg: 'bg-slate-50', text: 'text-slate-500', dot: 'bg-slate-400' },
};

export default function KnowledgeSources() {
  const [registrations, setRegistrations] = useState<KnowledgeRegistration[]>([]);
  const [databases, setDatabases] = useState<GlueDatabase[]>([]);
  const [workgroups, setWorkgroups] = useState<AthenaWorkgroup[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<BedrockKB[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const [regsData, dbData, wgData, kbData, depsData] = await Promise.all([
          knowledgeApi.list().catch(() => ({ registrations: [], total: 0 })),
          knowledgeApi.listDatabases().catch(() => ({ databases: [] })),
          knowledgeApi.listWorkgroups().catch(() => ({ workgroups: [] })),
          knowledgeApi.listKnowledgeBases().catch(() => ({ knowledge_bases: [] })),
          deploymentsApi.list().catch(() => []),
        ]);

        setRegistrations(regsData.registrations.filter(r => r.status !== 'DELETED'));
        setDatabases(dbData.databases);
        setWorkgroups(wgData.workgroups.filter(w => w.state === 'ENABLED'));
        setKnowledgeBases(kbData.knowledge_bases);
        setDeployments(depsData.filter(d => d.status === 'deployed'));
      } catch (e: any) {
        setError(e?.message || 'Failed to load knowledge sources');
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  // Compute agent linkages for knowledge sources
  const agentKnowledgeLinks = useMemo(() => {
    const links: Record<string, string[]> = {};
    deployments.forEach(dep => {
      // Check if deployment has knowledge-related parameters
      const params = dep.parameters || {};
      const kbId = params.knowledge_base_id;
      const databases = params.databases;

      if (kbId) {
        if (!links[kbId]) links[kbId] = [];
        links[kbId].push(dep.deployment_name);
      }
      if (databases) {
        const dbList = typeof databases === 'string' ? databases.split(',') : databases;
        dbList.forEach((db: string) => {
          const key = `db:${db.trim()}`;
          if (!links[key]) links[key] = [];
          links[key].push(dep.deployment_name);
        });
      }
    });
    return links;
  }, [deployments]);

  const hasLiveData = registrations.length > 0 || databases.length > 0 || knowledgeBases.length > 0;

  const totalTables = useMemo(() => {
    return databases.reduce((sum, db) => sum + db.tables.length, 0);
  }, [databases]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Registrations</div>
            {registrations.length > 0 && <LiveDataBadge source="Operate" />}
          </div>
          <div className="text-2xl font-semibold text-indigo-600">{registrations.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {registrations.filter(r => r.status === 'ACTIVE').length} active
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Glue Databases</div>
            {databases.length > 0 && <LiveDataBadge source="Glue" />}
          </div>
          <div className="text-2xl font-semibold text-violet-600">{databases.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{totalTables} tables</div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Bedrock KBs</div>
            {knowledgeBases.length > 0 && <LiveDataBadge source="Bedrock" />}
          </div>
          <div className="text-2xl font-semibold text-blue-600">{knowledgeBases.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {knowledgeBases.filter(kb => kb.status === 'ACTIVE').length} active
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Athena Workgroups</div>
            {workgroups.length > 0 && <LiveDataBadge source="Athena" />}
          </div>
          <div className="text-2xl font-semibold text-emerald-600">{workgroups.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">query endpoints</div>
        </div>
      </div>

      {/* Registered Knowledge Sources */}
      {registrations.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Registered Knowledge Sources</h3>
              <LiveDataBadge source="Operate" />
            </div>
            <Link
              to="/capabilities/knowledge"
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Manage in Operate →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {registrations.map(reg => {
              const statusStyle = STATUS_STYLES[reg.status] || STATUS_STYLES.ACTIVE;
              const isDataLake = reg.type === 'data_lake';
              const linkedAgents: string[] = [];

              // Check for linked agents
              if (isDataLake && reg.config.databases) {
                reg.config.databases.forEach((db: string) => {
                  const key = `db:${db}`;
                  if (agentKnowledgeLinks[key]) {
                    linkedAgents.push(...agentKnowledgeLinks[key]);
                  }
                });
              } else if (reg.config.knowledge_base_id) {
                const kbAgents = agentKnowledgeLinks[reg.config.knowledge_base_id];
                if (kbAgents) linkedAgents.push(...kbAgents);
              }

              return (
                <div
                  key={reg.registration_id}
                  className="border border-slate-200 rounded-lg p-4 hover:border-indigo-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          isDataLake ? 'bg-violet-100' : 'bg-blue-100'
                        }`}
                      >
                        <Icon
                          name={isDataLake ? 'circle-stack' : 'book-open'}
                          className={`w-4 h-4 ${isDataLake ? 'text-violet-600' : 'text-blue-600'}`}
                        />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{reg.name}</div>
                        <div className="text-[10px] text-slate-500 capitalize">
                          {reg.type.replace('_', ' ')}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${statusStyle.bg} ${statusStyle.text}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot} ${
                          reg.status === 'PROVISIONING' ? 'animate-pulse' : ''
                        }`}
                      />
                      {reg.status}
                    </span>
                  </div>

                  {/* Config details */}
                  <div className="text-[11px] text-slate-600 space-y-1 mb-3">
                    {isDataLake && (
                      <>
                        {reg.config.databases?.length > 0 && (
                          <div>
                            <span className="text-slate-400">Databases:</span>{' '}
                            {reg.config.databases.join(', ')}
                          </div>
                        )}
                        {reg.config.athena_workgroup && (
                          <div>
                            <span className="text-slate-400">Workgroup:</span>{' '}
                            {reg.config.athena_workgroup}
                          </div>
                        )}
                      </>
                    )}
                    {!isDataLake && (
                      <>
                        {reg.config.knowledge_base_id && (
                          <div>
                            <span className="text-slate-400">KB ID:</span>{' '}
                            {reg.config.knowledge_base_id}
                          </div>
                        )}
                        {reg.config.model_id && (
                          <div>
                            <span className="text-slate-400">Model:</span>{' '}
                            {reg.config.model_id.split('/').pop()}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Tools */}
                  {reg.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {reg.tools.map(tool => (
                        <span
                          key={tool}
                          className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Linked Agents */}
                  {linkedAgents.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-[10px] text-slate-400 mb-1">Used by:</div>
                      <div className="flex flex-wrap gap-1">
                        {[...new Set(linkedAgents)].slice(0, 3).map(agent => (
                          <span
                            key={agent}
                            className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded"
                          >
                            {agent}
                          </span>
                        ))}
                        {linkedAgents.length > 3 && (
                          <span className="text-[9px] text-slate-400">
                            +{linkedAgents.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Discovered Glue Databases */}
      {databases.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Glue Data Catalog</h3>
            <LiveDataBadge source="Glue" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {databases.slice(0, 6).map(db => {
              const linkedAgents = agentKnowledgeLinks[`db:${db.name}`] || [];
              return (
                <div
                  key={db.name}
                  className="border border-slate-200 rounded-lg p-3 hover:border-violet-200 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="circle-stack" className="w-4 h-4 text-violet-500" />
                    <span className="text-sm font-medium text-slate-900">{db.name}</span>
                  </div>
                  {db.description && (
                    <p className="text-[11px] text-slate-500 mb-2 line-clamp-2">{db.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      {db.tables.length} table{db.tables.length !== 1 ? 's' : ''}
                    </span>
                    {linkedAgents.length > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">
                        {linkedAgents.length} agent{linkedAgents.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {databases.length > 6 && (
            <div className="mt-3 text-center">
              <span className="text-xs text-slate-500">
                +{databases.length - 6} more databases
              </span>
            </div>
          )}
        </div>
      )}

      {/* Bedrock Knowledge Bases */}
      {knowledgeBases.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Bedrock Knowledge Bases</h3>
            <LiveDataBadge source="Bedrock" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {knowledgeBases.slice(0, 6).map(kb => {
              const linkedAgents = agentKnowledgeLinks[kb.id] || [];
              return (
                <div
                  key={kb.id}
                  className="border border-slate-200 rounded-lg p-3 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="book-open" className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium text-slate-900">{kb.name}</span>
                  </div>
                  {kb.description && (
                    <p className="text-[11px] text-slate-500 mb-2 line-clamp-2">{kb.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded ${
                        kb.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {kb.status}
                    </span>
                    {linkedAgents.length > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">
                        {linkedAgents.length} agent{linkedAgents.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {knowledgeBases.length > 6 && (
            <div className="mt-3 text-center">
              <span className="text-xs text-slate-500">
                +{knowledgeBases.length - 6} more knowledge bases
              </span>
            </div>
          )}
        </div>
      )}

      {/* No Data State */}
      {!hasLiveData && (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-white/60">
          <Icon name="circle-stack" className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <h3 className="text-lg font-semibold text-slate-700 mb-1">No knowledge sources discovered</h3>
          <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
            Register data lakes or knowledge bases to expose them as MCP servers for your AI agents.
          </p>
          <div className="flex flex-col items-center gap-2">
            <Link
              to="/capabilities/knowledge"
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700"
            >
              Register Knowledge Source
            </Link>
            <a
              href="https://docs.aws.amazon.com/glue/latest/dg/catalog-and-crawler.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              Learn about Glue Data Catalog →
            </a>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
        <p className="text-xs text-indigo-800">
          <strong>Knowledge Sources</strong> are data assets that AI agents can query. Register data lakes
          (Glue + Athena) or Bedrock Knowledge Bases in the{' '}
          <Link to="/capabilities/knowledge" className="underline hover:text-indigo-900">
            Operate module
          </Link>{' '}
          to expose them as MCP servers. Agents discover schemas and run queries automatically at runtime.
        </p>
      </div>
    </div>
  );
}
