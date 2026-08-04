/**
 * DataTaxonomy — Hierarchical classification management
 * Category schemas integrated with AVA platform and AWS services
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useDataGovernance } from './useDataGovernance';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import { tooltipStyle } from './dataGovernanceData';
import StatCard from '../StatCard';
import { Icon } from '../icons';

interface TaxonomyNode {
  id: string;
  name: string;
  count?: number;
  children?: TaxonomyNode[];
}

const SAMPLE_TAXONOMY: TaxonomyNode[] = [
  {
    id: '1',
    name: 'Business Domains',
    count: 0,
    children: [
      { id: '1.1', name: 'Financial Services', count: 0 },
      { id: '1.2', name: 'Healthcare', count: 0 },
      { id: '1.3', name: 'Retail', count: 0 },
      { id: '1.4', name: 'Manufacturing', count: 0 },
    ],
  },
  {
    id: '2',
    name: 'AI Use Case Types',
    count: 0,
    children: [
      { id: '2.1', name: 'Document Processing', count: 0 },
      { id: '2.2', name: 'Customer Service', count: 0 },
      { id: '2.3', name: 'Data Analysis', count: 0 },
      { id: '2.4', name: 'Code Generation', count: 0 },
    ],
  },
  {
    id: '3',
    name: 'Data Sensitivity',
    count: 0,
    children: [
      { id: '3.1', name: 'Public', count: 0 },
      { id: '3.2', name: 'Internal', count: 0 },
      { id: '3.3', name: 'Confidential', count: 0 },
      { id: '3.4', name: 'Restricted', count: 0 },
    ],
  },
];

function TaxonomyTree({ nodes, useCases, depth = 0 }: { nodes: TaxonomyNode[]; useCases: { businessDomain: string }[]; depth?: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['1', '2', '3']));

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Count use cases per domain
  const getCount = (nodeName: string): number => {
    return useCases.filter(uc =>
      uc.businessDomain?.toLowerCase().includes(nodeName.toLowerCase())
    ).length;
  };

  return (
    <div className="space-y-0.5">
      {nodes.map(node => {
        const count = node.children ? node.children.reduce((acc, c) => acc + getCount(c.name), 0) : getCount(node.name);
        return (
          <div key={node.id}>
            <div
              className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-100 cursor-pointer transition-colors ${
                depth === 0 ? 'font-medium' : ''
              }`}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => node.children && toggle(node.id)}
            >
              {node.children ? (
                <svg
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded.has(node.id) ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              ) : (
                <span className="w-3.5 h-3.5 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                </span>
              )}
              <span className={`text-sm ${depth === 0 ? 'text-slate-900' : 'text-slate-700'}`}>{node.name}</span>
              {count > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full ml-auto">{count}</span>
              )}
            </div>
            {node.children && expanded.has(node.id) && (
              <TaxonomyTree nodes={node.children} useCases={useCases} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const TAXONOMY_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#ef4444'];

export default function DataTaxonomy() {
  const dg = useDataGovernance();
  const [toast, setToast] = useState<string | null>(null);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  // Extract unique business domains from use cases
  const domains = [...new Set(dg.useCaseRequirements.map(uc => uc.businessDomain).filter(Boolean))];

  // Taxonomy structure metrics derived from SAMPLE_TAXONOMY
  const topCategories = SAMPLE_TAXONOMY.length;
  const totalSubcategories = SAMPLE_TAXONOMY.reduce((acc, n) => acc + (n.children?.length ?? 0), 0);
  const totalNodes = topCategories + totalSubcategories;
  const hierarchyDepth = SAMPLE_TAXONOMY.some(n => n.children?.length) ? 2 : 1;
  const categoryChartData = SAMPLE_TAXONOMY.map((n, i) => ({
    name: n.name,
    subcategories: n.children?.length ?? 0,
    color: TAXONOMY_COLORS[i % TAXONOMY_COLORS.length],
  }));

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern/data" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Data Governance
        </Link>

        <div className="flex items-end justify-between mt-3 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Data Taxonomy</h1>
              <span className="text-[9px] px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-medium">Classification</span>
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Hierarchical classification schemas for organizing content. Enable faceted navigation, consistent tagging, and category-aware retrieval.
            </p>
          </div>
        </div>

        {/* Live AVA Stats */}
        {!dg.loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Business Domains</div>
              <div className="text-2xl font-semibold mt-1 text-emerald-600">{domains.length}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">From use cases</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Use Cases</div>
              <div className="text-2xl font-semibold mt-1 text-blue-600">{dg.useCaseRequirements.length}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Categorized</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Agents</div>
              <div className="text-2xl font-semibold mt-1 text-violet-600">{dg.summary.totalAgents}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Using taxonomy</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Data Sources</div>
              <div className="text-2xl font-semibold mt-1 text-amber-600">{dg.agentProfiles.reduce((acc, p) => acc + p.dataSources.length, 0)}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Tagged</div>
            </div>
          </div>
        )}

        {/* Taxonomy Structure KPIs (from defined schema) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Categories" value={topCategories} variant="success" sub="top-level facets" />
          <StatCard label="Subcategories" value={totalSubcategories} variant="info" sub="child terms" />
          <StatCard label="Total Nodes" value={totalNodes} variant="default" sub="in classification tree" />
          <StatCard label="Hierarchy Depth" value={hierarchyDepth} variant="muted" sub="levels deep" />
        </div>

        {/* Taxonomy Distribution Chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Subcategories per Top-Level Facet</h3>
            <MockDataBadge />
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={categoryChartData} margin={{ left: 4, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="subcategories" name="Subcategories" radius={[4, 4, 0, 0]}>
                {categoryChartData.map(d => <Cell key={d.name} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Concept Explainer */}
        <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-emerald-200/60 p-6 mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-semibold text-emerald-900 mb-3">What is a Taxonomy?</h2>
              <p className="text-sm text-slate-700 mb-4">
                A taxonomy is a <strong>hierarchical classification system</strong> that organizes information into
                parent-child relationships. Unlike ontologies (which capture rich semantic relationships), taxonomies
                focus on categorization and navigation.
              </p>
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-500">+</span>
                  <span>Consistent categorization across teams and systems</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-500">+</span>
                  <span>Enables faceted navigation and drill-down interfaces</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-500">+</span>
                  <span>Improves RAG retrieval with category-aware chunking</span>
                </div>
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-emerald-900 mb-3">Best For</h2>
              <div className="space-y-2">
                <div className="p-3 bg-white rounded-lg border border-emerald-200">
                  <div className="text-xs font-semibold text-emerald-800 mb-1">Navigation</div>
                  <p className="text-[11px] text-slate-600">Help users browse and find content in a structured way</p>
                </div>
                <div className="p-3 bg-white rounded-lg border border-emerald-200">
                  <div className="text-xs font-semibold text-emerald-800 mb-1">Tagging</div>
                  <p className="text-[11px] text-slate-600">Consistent labeling across documents and data sources</p>
                </div>
                <div className="p-3 bg-white rounded-lg border border-emerald-200">
                  <div className="text-xs font-semibold text-emerald-800 mb-1">Filtering</div>
                  <p className="text-[11px] text-slate-600">Enable faceted search and drill-down interfaces</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Taxonomy Browser + Use Cases */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Taxonomy Browser</div>
              <MockDataBadge />
            </div>
            <div className="p-4 max-h-[350px] overflow-y-auto">
              <TaxonomyTree nodes={SAMPLE_TAXONOMY} useCases={dg.useCaseRequirements} />
            </div>
          </div>

          {/* Use Cases by Domain */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Use Cases by Domain</div>
              <LiveDataBadge />
            </div>
            <div className="p-4 max-h-[350px] overflow-y-auto">
              {dg.useCaseRequirements.length === 0 ? (
                <div className="text-center py-6">
                  <Icon name="clipboard-list" className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <div className="text-sm font-medium text-slate-600">No use cases registered</div>
                  <div className="text-xs text-slate-400 mb-3">Register use cases to see them categorized by domain</div>
                  <Link to="/use-cases" className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                    Create Use Case
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {domains.map(domain => {
                    const domainUseCases = dg.useCaseRequirements.filter(uc => uc.businessDomain === domain);
                    return (
                      <div key={domain} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-700">{domain}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">{domainUseCases.length}</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {domainUseCases.slice(0, 3).map(uc => (
                            <div key={uc.useCaseId} className="px-3 py-2 flex items-center justify-between">
                              <span className="text-xs text-slate-700">{uc.useCaseName}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                uc.status === 'Production' ? 'bg-emerald-100 text-emerald-700' :
                                uc.status === 'Pilot' ? 'bg-blue-100 text-blue-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>{uc.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* How AVA Uses Taxonomy */}
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl border border-violet-200/60 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-violet-900">How AVA Uses Your Taxonomy</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">AVA Platform</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-3 bg-white rounded-lg border border-violet-200">
              <div className="text-xs font-semibold text-violet-800 mb-1">Use Case Classification</div>
              <p className="text-[11px] text-slate-600">
                AVA uses taxonomy to categorize use cases by business domain, enabling portfolio views
                and governance policies scoped to specific categories.
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-violet-200">
              <div className="text-xs font-semibold text-violet-800 mb-1">Knowledge Base Chunking</div>
              <p className="text-[11px] text-slate-600">
                When ingesting documents, AVA applies taxonomy tags to chunks. Agents can filter
                retrieval by category for more relevant responses.
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-violet-200">
              <div className="text-xs font-semibold text-violet-800 mb-1">Guardrail Scoping</div>
              <p className="text-[11px] text-slate-600">
                Apply different guardrail policies based on content category. Finance content may require
                stricter controls than general documentation.
              </p>
            </div>
          </div>
        </div>

        {/* AWS Services */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-slate-900">AWS Services for Taxonomy</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">AWS</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-semibold text-slate-800 mb-1">Amazon Comprehend</div>
              <p className="text-[10px] text-slate-600 mb-2">Auto-classify documents using custom classifiers trained on your taxonomy categories.</p>
              <a href="https://aws.amazon.com/comprehend/" target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-600 hover:underline">Learn more →</a>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-semibold text-slate-800 mb-1">Amazon Kendra</div>
              <p className="text-[10px] text-slate-600 mb-2">Faceted search powered by taxonomy. Enable drill-down navigation in enterprise search.</p>
              <a href="https://aws.amazon.com/kendra/" target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-600 hover:underline">Learn more →</a>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-semibold text-slate-800 mb-1">Amazon Bedrock KB Metadata</div>
              <p className="text-[10px] text-slate-600 mb-2">Attach taxonomy tags as metadata filters for scoped RAG retrieval.</p>
              <a href="https://aws.amazon.com/bedrock/knowledge-bases/" target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-600 hover:underline">Learn more →</a>
            </div>
          </div>
        </div>

        {/* Get Started */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center text-white">
              <Icon name="folder" className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Build Your Taxonomy</div>
              <div className="text-xs text-slate-500">Create hierarchical classifications for your content</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => flashToast('Category creation wizard coming soon')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Create Category
            </button>
            <button
              onClick={() => flashToast('CSV import will allow bulk taxonomy upload')}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              Import from CSV
            </button>
            <Link
              to="/use-cases"
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              View Use Cases
            </Link>
            <Link
              to="/capabilities/knowledge"
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              Tag Knowledge Base
            </Link>
          </div>
        </div>

        {toast && (
          <div className="fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 bg-slate-800 text-white">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
