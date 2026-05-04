import { useState } from 'react';
import { Link } from 'react-router-dom';

interface Tool {
  id: string;
  name: string;
  description: string;
  category: 'Integration' | 'Data' | 'Compute' | 'Action';
  status: 'available' | 'coming_soon';
  icon: string;
  capabilities: string[];
  integrations: string[];
}

const TOOLS: Tool[] = [
  {
    id: 'mcp-gateway',
    name: 'MCP Gateway',
    description: 'Expose any API as an MCP tool for agents via Bedrock AgentCore Gateway.',
    category: 'Integration',
    status: 'coming_soon',
    icon: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244',
    capabilities: ['API-to-MCP translation', 'OAuth & IAM auth', 'Rate limiting'],
    integrations: ['AgentCore Gateway', 'REST', 'GraphQL'],
  },
  {
    id: 'knowledge-base',
    name: 'Knowledge Base',
    description: 'Connect agents to Amazon Bedrock Knowledge Bases for RAG-powered retrieval.',
    category: 'Data',
    status: 'coming_soon',
    icon: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
    capabilities: ['Semantic search', 'Hybrid retrieval', 'Citations'],
    integrations: ['Bedrock KB', 'OpenSearch', 'S3'],
  },
  {
    id: 'code-interpreter',
    name: 'Code Interpreter',
    description: 'Give agents the ability to write and execute Python code in a sandboxed environment.',
    category: 'Compute',
    status: 'coming_soon',
    icon: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5',
    capabilities: ['Python execution', 'Data analysis', 'File I/O'],
    integrations: ['AgentCore Runtime', 'Pandas', 'NumPy'],
  },
  {
    id: 'web-browser',
    name: 'Web Browser',
    description: 'Enable agents to browse the web, extract content, and interact with pages.',
    category: 'Integration',
    status: 'coming_soon',
    icon: 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418',
    capabilities: ['Page navigation', 'Content extraction', 'Form interaction'],
    integrations: ['Playwright', 'Chromium', 'HTTP'],
  },
  {
    id: 'database-query',
    name: 'Database Query',
    description: 'Allow agents to query structured data from RDS, DynamoDB, or Redshift.',
    category: 'Data',
    status: 'coming_soon',
    icon: 'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125',
    capabilities: ['SQL generation', 'Schema awareness', 'Result summarization'],
    integrations: ['RDS', 'DynamoDB', 'Redshift', 'Aurora'],
  },
  {
    id: 'api-connector',
    name: 'API Connector',
    description: 'Connect agents to external REST/GraphQL APIs with authentication and rate limiting.',
    category: 'Integration',
    status: 'coming_soon',
    icon: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
    capabilities: ['OpenAPI import', 'Auth management', 'Response parsing'],
    integrations: ['REST', 'GraphQL', 'Secrets Manager'],
  },
  {
    id: 'document-parser',
    name: 'Document Parser',
    description: 'Extract structured data from PDFs, images, and scanned documents using Textract.',
    category: 'Data',
    status: 'coming_soon',
    icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
    capabilities: ['PDF parsing', 'OCR', 'Form extraction'],
    integrations: ['Textract', 'S3', 'Comprehend'],
  },
  {
    id: 'notification',
    name: 'Notifications',
    description: 'Send alerts via SNS, SES, Slack, or Teams when agents complete tasks or need attention.',
    category: 'Action',
    status: 'coming_soon',
    icon: 'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0',
    capabilities: ['Multi-channel delivery', 'Templating', 'Escalation'],
    integrations: ['SNS', 'SES', 'Slack', 'Teams'],
  },
];

type CategoryId = 'Integration' | 'Data' | 'Compute' | 'Action';

interface CategoryTheme {
  id: CategoryId;
  label: string;
  pill: string;
  iconGradient: string;
  accentFrom: string;
  accentTo: string;
  hoverBorder: string;
  hoverTitle: string;
  chipBg: string;
  chipText: string;
  filterText: string;
}

const CATEGORIES: CategoryTheme[] = [
  {
    id: 'Integration',
    label: 'Integration',
    pill: 'bg-blue-50 text-blue-700 border-blue-200',
    iconGradient: 'from-blue-500 to-indigo-600',
    accentFrom: 'from-blue-500',
    accentTo: 'to-indigo-600',
    hoverBorder: 'hover:border-blue-200',
    hoverTitle: 'group-hover:text-blue-700',
    chipBg: 'bg-blue-50',
    chipText: 'text-blue-600',
    filterText: 'text-blue-700',
  },
  {
    id: 'Data',
    label: 'Data',
    pill: 'bg-violet-50 text-violet-700 border-violet-200',
    iconGradient: 'from-violet-500 to-purple-600',
    accentFrom: 'from-violet-500',
    accentTo: 'to-purple-600',
    hoverBorder: 'hover:border-violet-200',
    hoverTitle: 'group-hover:text-violet-700',
    chipBg: 'bg-violet-50',
    chipText: 'text-violet-700',
    filterText: 'text-violet-700',
  },
  {
    id: 'Compute',
    label: 'Compute',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconGradient: 'from-emerald-500 to-teal-600',
    accentFrom: 'from-emerald-500',
    accentTo: 'to-teal-600',
    hoverBorder: 'hover:border-emerald-200',
    hoverTitle: 'group-hover:text-emerald-700',
    chipBg: 'bg-emerald-50',
    chipText: 'text-emerald-700',
    filterText: 'text-emerald-700',
  },
  {
    id: 'Action',
    label: 'Action',
    pill: 'bg-amber-50 text-amber-700 border-amber-200',
    iconGradient: 'from-amber-500 to-orange-600',
    accentFrom: 'from-amber-500',
    accentTo: 'to-orange-600',
    hoverBorder: 'hover:border-amber-200',
    hoverTitle: 'group-hover:text-amber-700',
    chipBg: 'bg-amber-50',
    chipText: 'text-amber-700',
    filterText: 'text-amber-700',
  },
];

const CATEGORY_MAP: Record<CategoryId, CategoryTheme> = CATEGORIES.reduce((acc, c) => {
  acc[c.id] = c;
  return acc;
}, {} as Record<CategoryId, CategoryTheme>);

export default function ToolsFactory() {
  const [filter, setFilter] = useState<'all' | CategoryId>('all');
  const [search, setSearch] = useState('');

  const filtered = TOOLS.filter(t => {
    const matchesFilter = filter === 'all' || t.category === filter;
    const matchesSearch = !search
      || t.name.toLowerCase().includes(search.toLowerCase())
      || t.description.toLowerCase().includes(search.toLowerCase())
      || t.category.toLowerCase().includes(search.toLowerCase())
      || t.capabilities.some(c => c.toLowerCase().includes(search.toLowerCase()))
      || t.integrations.some(i => i.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      {/* Ombre gradient background — blue/violet/pink, aligned with FSI Foundry */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8 animate-fade-in">
          <Link to="/aaas" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Agent-as-a-Service</Link>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">Tools Factory</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Equip your agents with pre-built tools or create custom ones. Tools connect agents to data sources, APIs, compute environments, and external services.
          </p>
        </div>

        {/* How it works — amber, distinct from Custom Agents (blue) */}
        <div className="card bg-amber-50/50 border-amber-200/60 mb-6 animate-fade-in stagger-1">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-amber-900 font-semibold">How Tools Factory works</p>
              <p className="text-sm text-amber-700/80 mt-1">
                Browse the pre-built catalog or <strong>create a custom tool</strong> from a Lambda function, API endpoint, or MCP server. Tools are scoped per agent at deploy time — attach them to Custom Agents on AgentCore and they&apos;re invoked automatically based on the agent&apos;s reasoning.
              </p>
            </div>
          </div>
        </div>

        {/* Create Custom Tool CTA — featured builder card with gradient wash */}
        <div className="mb-6 animate-fade-in stagger-1">
          <div className="group relative bg-white rounded-xl border-2 border-dashed border-slate-300 overflow-hidden hover:border-blue-400 transition-all cursor-pointer">
            <div className="relative p-6 flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-md ring-1 ring-slate-900/5 group-hover:scale-105 group-hover:shadow-lg transition-all flex-shrink-0">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">Create Custom Tool</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    Coming Soon
                  </span>
                </div>
                <p className="text-sm text-slate-500">Define a new tool from a Lambda function, API endpoint, or MCP server — attach it to any Custom Agent.</p>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {['Lambda', 'REST API', 'MCP server', 'OpenAPI import'].map(t => (
                    <span key={t} className="text-[10px] px-2 py-0.5 bg-slate-50 text-slate-600 rounded-md border border-slate-200">{t}</span>
                  ))}
                </div>
              </div>
              <div className="hidden sm:flex w-10 h-10 items-center justify-center rounded-full bg-slate-100 group-hover:bg-blue-100 transition-colors flex-shrink-0">
                <svg className="w-4 h-4 text-slate-500 group-hover:text-blue-700 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6 animate-fade-in stagger-1">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search tools, capabilities, or integrations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full py-3 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm outline-none transition-all duration-150 focus:border-amber-400 pr-4"
            style={{ paddingLeft: '2.75rem' }}
          />
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-8 animate-fade-in stagger-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              filter === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            All ({TOOLS.length})
          </button>
          {CATEGORIES.map(cat => {
            const count = TOOLS.filter(t => t.category === cat.id).length;
            if (!count) return null;
            return (
              <button
                key={cat.id}
                onClick={() => setFilter(filter === cat.id ? 'all' : cat.id)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  filter === cat.id
                    ? 'bg-slate-800 text-white'
                    : `bg-white ${cat.filterText} border border-slate-200 hover:border-slate-300`
                }`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Tools grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in stagger-3">
          {filtered.map(tool => {
            const theme = CATEGORY_MAP[tool.category];
            return (
              <div
                key={tool.id}
                className={`group relative bg-white rounded-xl border border-slate-200 overflow-hidden ${theme.hoverBorder} hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col`}
              >
                {/* Top accent bar — category-colored gradient */}
                <div className={`h-1 bg-gradient-to-r ${theme.accentFrom} ${theme.accentTo}`} />

                <div className="relative p-6 flex flex-col flex-1">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-lg border ${theme.pill}`}>
                      {tool.category}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200">
                      Coming Soon
                    </span>
                  </div>

                  <h3 className={`text-xl font-bold text-slate-900 mb-2 ${theme.hoverTitle} transition-colors`}>{tool.name}</h3>
                  <p className="text-sm text-slate-500 mb-5 flex-1 leading-relaxed">{tool.description}</p>

                  <div className="mb-4">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Capabilities</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {tool.capabilities.map(c => (
                        <span key={c} className={`text-xs px-2.5 py-1 ${theme.chipBg} ${theme.chipText} rounded-lg font-medium`}>{c}</span>
                      ))}
                    </div>
                  </div>

                  <div className="mb-5">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Integrations</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {tool.integrations.map(i => (
                        <span key={i} className="text-xs px-2.5 py-1 bg-slate-50 text-slate-600 rounded-lg border border-slate-200">{i}</span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <button
                      disabled
                      className="w-full text-sm py-2 rounded-lg font-medium bg-slate-100 text-slate-400 cursor-not-allowed"
                    >
                      Coming Soon
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            {search ? `No tools matching "${search}"` : 'No tools in this category'}
          </div>
        )}
      </div>
    </div>
  );
}
