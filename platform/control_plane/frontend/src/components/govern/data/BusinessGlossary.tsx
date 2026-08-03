/**
 * BusinessGlossary — Standardized terminology management
 * Authoritative definitions integrated with AVA platform and AWS services
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useDataGovernance } from './useDataGovernance';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import { tooltipStyle } from './dataGovernanceData';
import StatCard from '../StatCard';
import { Icon } from '../icons';

interface GlossaryTerm {
  term: string;
  definition: string;
  synonyms: string[];
  domain: string;
  owner: string;
  examples?: string[];
}

const SAMPLE_TERMS: GlossaryTerm[] = [
  {
    term: 'Customer',
    definition: 'An individual or organization that has purchased or is actively evaluating our products or services. Distinct from Prospect (no purchase history) and Lead (initial contact only).',
    synonyms: ['Client', 'Account', 'Buyer'],
    domain: 'Sales',
    owner: 'Sales Operations',
    examples: ['Active customer with subscription', 'Customer with open support ticket'],
  },
  {
    term: 'Churn',
    definition: 'The rate at which customers stop doing business with an entity. Calculated as (Customers Lost / Total Customers) over a specific period. Does not include downgrades.',
    synonyms: ['Attrition', 'Customer Loss'],
    domain: 'Finance',
    owner: 'Revenue Analytics',
    examples: ['Monthly churn rate of 2.5%', 'Churn due to contract non-renewal'],
  },
  {
    term: 'ARR',
    definition: 'Annual Recurring Revenue. The value of contracted recurring revenue normalized to a one-year period. Excludes one-time fees, professional services, and variable usage charges.',
    synonyms: ['Annual Recurring Revenue', 'Annualized Revenue'],
    domain: 'Finance',
    owner: 'FP&A',
  },
  {
    term: 'Use Case',
    definition: 'A specific AI/ML application with defined business objectives, data requirements, and success metrics. Must be registered in AVA before development begins.',
    synonyms: ['AI Initiative', 'ML Project'],
    domain: 'AI Governance',
    owner: 'AI Center of Excellence',
    examples: ['Document classification use case', 'Customer sentiment analysis'],
  },
  {
    term: 'Guardrail',
    definition: 'A policy-based control that filters, blocks, or modifies AI model inputs/outputs. Implemented via Amazon Bedrock Guardrails. Distinct from general policies which govern access.',
    synonyms: ['Content Filter', 'Safety Control'],
    domain: 'AI Governance',
    owner: 'Security',
  },
];

const DOMAINS = ['All', 'Sales', 'Finance', 'AI Governance', 'Security', 'Operations'];

const GLOSSARY_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#ef4444'];

export default function BusinessGlossary() {
  const [search, setSearch] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('All');
  const [selectedTerm, setSelectedTerm] = useState<GlossaryTerm | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const dg = useDataGovernance();

  // Glossary structure metrics derived from SAMPLE_TERMS
  const totalTerms = SAMPLE_TERMS.length;
  const totalSynonyms = SAMPLE_TERMS.reduce((acc, t) => acc + t.synonyms.length, 0);
  const uniqueDomains = new Set(SAMPLE_TERMS.map(t => t.domain)).size;
  const uniqueOwners = new Set(SAMPLE_TERMS.map(t => t.owner)).size;
  const termsByDomain = Object.values(
    SAMPLE_TERMS.reduce<Record<string, { name: string; value: number }>>((acc, t) => {
      acc[t.domain] = acc[t.domain] ?? { name: t.domain, value: 0 };
      acc[t.domain].value += 1;
      return acc;
    }, {}),
  );

  const filteredTerms = SAMPLE_TERMS.filter(t => {
    const matchesSearch = search === '' ||
      t.term.toLowerCase().includes(search.toLowerCase()) ||
      t.definition.toLowerCase().includes(search.toLowerCase()) ||
      t.synonyms.some(s => s.toLowerCase().includes(search.toLowerCase()));
    const matchesDomain = selectedDomain === 'All' || t.domain === selectedDomain;
    return matchesSearch && matchesDomain;
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern/data" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Data Governance
        </Link>

        <div className="flex items-end justify-between mt-3 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Business Glossary</h1>
              <span className="text-[9px] px-2 py-1 rounded bg-blue-100 text-blue-700 font-medium">Terminology</span>
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Authoritative definitions for business terms. Ensures agents and humans use consistent terminology and understand domain-specific language.
            </p>
          </div>
        </div>

        {/* Live AVA Stats */}
        {!dg.loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Terms Defined</div>
              <div className="text-2xl font-semibold mt-1 text-blue-600">{SAMPLE_TERMS.length}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">In glossary</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Use Cases</div>
              <div className="text-2xl font-semibold mt-1 text-emerald-600">{dg.useCaseRequirements.length}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Using terminology</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Agents</div>
              <div className="text-2xl font-semibold mt-1 text-violet-600">{dg.summary.totalAgents}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">With context</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Guardrails</div>
              <div className="text-2xl font-semibold mt-1 text-amber-600">{dg.summary.activeGuardrails}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Using terms</div>
            </div>
          </div>
        )}

        {/* Glossary Structure KPIs (from defined terms) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Terms Defined" value={totalTerms} variant="info" sub="authoritative definitions" />
          <StatCard label="Synonyms & Aliases" value={totalSynonyms} variant="success" sub="term relationships" />
          <StatCard label="Domains Covered" value={uniqueDomains} variant="default" sub="business areas" />
          <StatCard label="Term Owners" value={uniqueOwners} variant="muted" sub="accountable teams" />
        </div>

        {/* Terms by Domain Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Terms by Business Domain</h3>
            <MockDataBadge />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={termsByDomain} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                {termsByDomain.map((d, i) => <Cell key={d.name} fill={GLOSSARY_COLORS[i % GLOSSARY_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
            {termsByDomain.map((d, i) => (
              <span key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: GLOSSARY_COLORS[i % GLOSSARY_COLORS.length] }} />{d.name} ({d.value})
              </span>
            ))}
          </div>
        </div>

        {/* Why It Matters */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200/60 p-6 mb-6">
          <h2 className="text-sm font-semibold text-blue-900 mb-3">Why a Business Glossary Matters for AI</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-3 bg-white rounded-lg border border-blue-200">
              <div className="text-xs font-semibold text-blue-800 mb-1">Disambiguation</div>
              <p className="text-[11px] text-slate-600">
                "Customer" means different things in Sales vs Support vs Finance. The glossary provides context-aware definitions.
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-blue-200">
              <div className="text-xs font-semibold text-blue-800 mb-1">Consistency</div>
              <p className="text-[11px] text-slate-600">
                Agents use the same terms the business uses. No more confusion between "churn" and "attrition."
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-blue-200">
              <div className="text-xs font-semibold text-blue-800 mb-1">Grounding</div>
              <p className="text-[11px] text-slate-600">
                Definitions anchor RAG responses to authoritative sources. Reduces hallucination by providing verified context.
              </p>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search terms, definitions, or synonyms..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search glossary terms"
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {DOMAINS.map(domain => (
              <button
                key={domain}
                onClick={() => setSelectedDomain(domain)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  selectedDomain === domain ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {domain}
              </button>
            ))}
          </div>
        </div>

        {/* Terms List + Detail + Connected Use Cases */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Terms List */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Terms ({filteredTerms.length})</div>
              <MockDataBadge />
            </div>
            <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
              {filteredTerms.map(term => (
                <button
                  key={term.term}
                  onClick={() => setSelectedTerm(term)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                    selectedTerm?.term === term.term ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-slate-900">{term.term}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{term.domain}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 line-clamp-2">{term.definition}</p>
                  {term.synonyms.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="text-[9px] text-slate-400">Also:</span>
                      {term.synonyms.slice(0, 2).map(syn => (
                        <span key={syn} className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{syn}</span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Detail Panel */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            {selectedTerm ? (
              <>
                <div className="px-4 py-3 border-b border-slate-100 bg-blue-50">
                  <div className="text-lg font-semibold text-slate-900">{selectedTerm.term}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">{selectedTerm.domain}</span>
                    <span className="text-[10px] text-slate-500">Owner: {selectedTerm.owner}</span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="mb-4">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Definition</div>
                    <p className="text-sm text-slate-700">{selectedTerm.definition}</p>
                  </div>

                  {selectedTerm.synonyms.length > 0 && (
                    <div className="mb-4">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Synonyms & Aliases</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTerm.synonyms.map(syn => (
                          <span key={syn} className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded">{syn}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedTerm.examples && (
                    <div className="mb-4">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Usage Examples</div>
                      <ul className="space-y-1">
                        {selectedTerm.examples.map((ex, i) => (
                          <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                            <span className="text-slate-400">•</span>
                            {ex}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <div className="text-[10px] font-semibold text-emerald-800 mb-1">AI Agent Usage</div>
                    <p className="text-[11px] text-slate-600">
                      When an agent encounters "{selectedTerm.term}" in a query, it uses this definition to understand context
                      and can expand searches to include synonyms: {selectedTerm.synonyms.join(', ')}.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full p-8 text-center">
                <div>
                  <Icon name="book-open" className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <div className="text-sm font-medium text-slate-600">Select a term</div>
                  <div className="text-xs text-slate-400">Click a term to view its full definition</div>
                </div>
              </div>
            )}
          </div>

          {/* Connected Use Cases & Agents */}
          <div className="space-y-4">
            {/* Connected Use Cases */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Connected Use Cases</div>
                <LiveDataBadge />
              </div>
              <div className="p-4 max-h-[180px] overflow-y-auto">
                {dg.useCaseRequirements.length === 0 ? (
                  <div className="text-center py-4">
                    <Icon name="clipboard-list" className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                    <div className="text-xs text-slate-500">No use cases yet</div>
                    <Link to="/use-cases" className="text-[10px] text-blue-600 hover:underline">Create one</Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dg.useCaseRequirements.slice(0, 4).map(uc => (
                      <div key={uc.useCaseId} className="p-2 bg-slate-50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-700">{uc.useCaseName}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                            uc.status === 'Production' ? 'bg-emerald-100 text-emerald-700' :
                            uc.status === 'Pilot' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>{uc.status}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{uc.businessDomain}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Agents Using Glossary */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Agents with Context</div>
                <LiveDataBadge />
              </div>
              <div className="p-4 max-h-[180px] overflow-y-auto">
                {dg.agentProfiles.length === 0 ? (
                  <div className="text-center py-4">
                    <Icon name="cpu-chip" className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                    <div className="text-xs text-slate-500">No agents deployed</div>
                    <Link to="/aaas" className="text-[10px] text-blue-600 hover:underline">Deploy one</Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dg.agentProfiles.slice(0, 4).map(agent => (
                      <div key={agent.deploymentId} className="p-2 bg-slate-50 rounded-lg flex items-center justify-between">
                        <div>
                          <span className="text-xs font-medium text-slate-700">{agent.deploymentName}</span>
                          <div className="text-[10px] text-slate-500">{agent.dataSources.length} data sources</div>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          agent.status === 'deployed' ? 'bg-emerald-100 text-emerald-700' :
                          agent.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>{agent.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* AVA Integration */}
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl border border-violet-200/60 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-violet-900">How AVA Uses Your Glossary</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">AVA Platform</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-3 bg-white rounded-lg border border-violet-200">
              <div className="text-xs font-semibold text-violet-800 mb-1">Query Understanding</div>
              <p className="text-[11px] text-slate-600">
                When users ask agents about "ARR" or "churn", AVA uses glossary definitions to understand
                intent and expand queries to include synonyms.
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-violet-200">
              <div className="text-xs font-semibold text-violet-800 mb-1">Response Grounding</div>
              <p className="text-[11px] text-slate-600">
                Agents cite glossary definitions when explaining terms, reducing hallucination and ensuring
                responses align with official business terminology.
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-violet-200">
              <div className="text-xs font-semibold text-violet-800 mb-1">Prompt Engineering</div>
              <p className="text-[11px] text-slate-600">
                AVA automatically injects relevant definitions into system prompts, giving agents
                domain context without manual prompt tuning.
              </p>
            </div>
          </div>
        </div>

        {/* AWS Services */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-slate-900">AWS Services for Business Glossary</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">AWS</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-semibold text-slate-800 mb-1">Amazon DataZone</div>
              <p className="text-[10px] text-slate-600 mb-2">Native business glossary capabilities. Sync terms between DataZone and AVA for consistency.</p>
              <a href="https://aws.amazon.com/datazone/" target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-600 hover:underline">Learn more →</a>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-semibold text-slate-800 mb-1">AWS Glue Data Catalog</div>
              <p className="text-[10px] text-slate-600 mb-2">Attach glossary terms to table and column metadata. Bridge technical and business terminology.</p>
              <a href="https://aws.amazon.com/glue/" target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-600 hover:underline">Learn more →</a>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-semibold text-slate-800 mb-1">Amazon Bedrock Guardrails</div>
              <p className="text-[10px] text-slate-600 mb-2">Use glossary terms in word filters to ensure consistent terminology in agent responses.</p>
              <a href="https://aws.amazon.com/bedrock/guardrails/" target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-600 hover:underline">Learn more →</a>
            </div>
          </div>
        </div>

        {/* Get Started */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center text-white">
              <Icon name="book-open" className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Build Your Glossary</div>
              <div className="text-xs text-slate-500">Define authoritative terms for your AI agents</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                if (!showAddForm) flashToast('Add Term form opened — feature coming soon');
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Add Term
            </button>
            <button
              onClick={() => flashToast('DataZone import will connect to your AWS environment')}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              Import from DataZone
            </button>
            <Link
              to="/use-cases"
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              View Use Cases
            </Link>
            <Link
              to="/secure/guardrails"
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              Configure Guardrails
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
