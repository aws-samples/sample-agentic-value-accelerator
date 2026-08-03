import { useState } from 'react';
import { Link } from 'react-router-dom';

type CategoryId = 'system' | 'response' | 'evaluation' | 'guardrail';

interface Category {
  id: CategoryId;
  label: string;
  color: string;
  bg: string;
  border: string;
}

const CATEGORIES: Category[] = [
  { id: 'system',     label: 'System Prompts',       color: 'text-pink-700',    bg: 'bg-pink-50',    border: 'border-pink-200' },
  { id: 'response',   label: 'Response Templates',   color: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200' },
  { id: 'evaluation', label: 'Evaluation Prompts',   color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-200' },
  { id: 'guardrail',  label: 'Guardrail Prompts',    color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200' },
];

const CATEGORY_LOOKUP = CATEGORIES.reduce((acc, c) => { acc[c.id] = c; return acc; }, {} as Record<CategoryId, Category>);

interface PromptItem {
  id: string;
  name: string;
  description: string;
  category: CategoryId;
  status: 'production' | 'draft' | 'coming_soon';
  icon: string;
  version: string;
  attachedAgents: number;
  lastModified: string;
  owner: string;
  variables: string[];
}

const ITEMS: PromptItem[] = [
  {
    id: 'kyc-officer-system',
    name: 'KYC Officer — System',
    description: 'Grounding prompt for the KYC compliance officer agent. Sets tone, cites regulation inline, refuses speculation outside the KB.',
    category: 'system',
    status: 'production',
    icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    version: 'v4.2',
    attachedAgents: 3,
    lastModified: '3 days ago',
    owner: 'Compliance',
    variables: ['customer_id', 'jurisdiction', 'risk_tier'],
  },
  {
    id: 'fraud-analyst-system',
    name: 'Fraud Analyst — System',
    description: 'Anti-hallucination grounding for fraud pattern analysts. Enforces evidence-only reasoning and explicit confidence scoring.',
    category: 'system',
    status: 'production',
    icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    version: 'v2.8',
    attachedAgents: 5,
    lastModified: '1 week ago',
    owner: 'Risk & Fraud',
    variables: ['account_id', 'time_window', 'threshold'],
  },
  {
    id: 'customer-service-system',
    name: 'Customer Service — System',
    description: 'Friendly, empathetic tone with strict PII handling, escalation triggers, and explicit refusal patterns for financial advice.',
    category: 'system',
    status: 'production',
    icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    version: 'v6.0',
    attachedAgents: 4,
    lastModified: '2 days ago',
    owner: 'Contact Center',
    variables: ['customer_name', 'tier', 'sentiment'],
  },
  {
    id: 'denial-letter',
    name: 'Adverse Action Denial Letter',
    description: 'Templated response for credit denials, compliant with Reg B — captures reason codes and human review handoff path.',
    category: 'response',
    status: 'production',
    icon: 'M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z',
    version: 'v3.1',
    attachedAgents: 2,
    lastModified: '5 days ago',
    owner: 'Legal',
    variables: ['applicant_name', 'reason_codes', 'appeal_url'],
  },
  {
    id: 'sar-narrative',
    name: 'SAR Narrative Template',
    description: 'Suspicious Activity Report narrative scaffold with the 5-W template, evidence slots, and auto-FinCEN-formatted output.',
    category: 'response',
    status: 'production',
    icon: 'M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z',
    version: 'v1.4',
    attachedAgents: 1,
    lastModified: '2 weeks ago',
    owner: 'Compliance',
    variables: ['case_id', 'subjects', 'indicators'],
  },
  {
    id: 'eval-factual',
    name: 'Factual-Accuracy Eval',
    description: 'Prompt-based evaluation that grades a response for faithfulness to retrieved context. Returns score + grounded citations.',
    category: 'evaluation',
    status: 'production',
    icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    version: 'v2.2',
    attachedAgents: 0,
    lastModified: '1 day ago',
    owner: 'Platform',
    variables: ['question', 'response', 'context'],
  },
  {
    id: 'eval-tone',
    name: 'Tone & Empathy Eval',
    description: 'Rubric-based grader for customer-facing responses, scoring tone, clarity, and empathy on a 1-5 scale with qualitative feedback.',
    category: 'evaluation',
    status: 'production',
    icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    version: 'v1.0',
    attachedAgents: 0,
    lastModified: '3 weeks ago',
    owner: 'Contact Center',
    variables: ['customer_msg', 'agent_reply'],
  },
  {
    id: 'pii-refusal',
    name: 'PII Refusal Pattern',
    description: 'Reusable refusal clause that agents splice into system prompts — enforces exactly what gets redacted vs. blocked.',
    category: 'guardrail',
    status: 'production',
    icon: 'M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    version: 'v1.8',
    attachedAgents: 11,
    lastModified: '4 days ago',
    owner: 'InfoSec',
    variables: [],
  },
  {
    id: 'prompt-injection-defense',
    name: 'Prompt Injection Defense',
    description: 'Input-preamble hardening against injection: instruction-override, tool-abuse, and role-play bypass patterns.',
    category: 'guardrail',
    status: 'production',
    icon: 'M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    version: 'v2.5',
    attachedAgents: 18,
    lastModified: '1 week ago',
    owner: 'InfoSec',
    variables: [],
  },
  {
    id: 'disclaimer-legal',
    name: 'Legal Disclaimer Clause',
    description: 'Canonical non-advice disclaimer appended to consumer-facing responses, reviewed quarterly by Legal.',
    category: 'guardrail',
    status: 'draft',
    icon: 'M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    version: 'v0.3',
    attachedAgents: 0,
    lastModified: '6 hours ago',
    owner: 'Legal',
    variables: ['jurisdiction'],
  },
];

const STATUS_BG: Record<PromptItem['status'], string> = {
  production:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft:        'bg-amber-50 text-amber-700 border-amber-200',
  coming_soon:  'bg-slate-100 text-slate-500 border-slate-200',
};

export default function Prompts() {
  const [filter, setFilter] = useState<'all' | CategoryId>('all');
  const [search, setSearch] = useState('');

  const filtered = ITEMS.filter(item => {
    const matchesFilter = filter === 'all' || item.category === filter;
    const q = search.toLowerCase();
    const matchesSearch = !q
      || item.name.toLowerCase().includes(q)
      || item.description.toLowerCase().includes(q)
      || item.owner.toLowerCase().includes(q)
      || item.variables.some(v => v.toLowerCase().includes(q));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(252,231,243,0.7) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.5) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(254,215,170,0.4) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8 animate-fade-in">
          <Link to="/capabilities/prompts" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Prompts</Link>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">Prompt Library</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Versioned, reusable prompt templates — system prompts, response patterns, evaluation rubrics, and guardrail clauses. Swap a prompt without redeploying an agent; every change is audited.
          </p>
        </div>

        {/* How it works */}
        <div className="card bg-pink-50/50 border-pink-200/60 mb-6 animate-fade-in stagger-1">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-pink-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-pink-900 font-semibold">How Prompts work</p>
              <p className="text-sm text-pink-700/80 mt-1">
                Authors edit prompts in a managed library (backed by <strong>Amazon Bedrock Prompt Management</strong>). Agents reference prompts by name + version at runtime, so updates propagate instantly without a redeploy. Every version is tracked — who changed what, when, and why — and you can run side-by-side comparisons before promoting a draft to production.
              </p>
            </div>
          </div>
        </div>

        {/* Create CTA */}
        <div className="mb-6 animate-fade-in stagger-1">
          <div className="group relative bg-white rounded-xl border-2 border-dashed border-slate-300 overflow-hidden hover:border-pink-400 transition-all cursor-pointer">
            <div className="relative p-6 flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-pink-600 flex items-center justify-center shadow-md ring-1 ring-slate-900/5 group-hover:scale-105 group-hover:shadow-lg transition-all flex-shrink-0">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-semibold text-slate-900 group-hover:text-pink-700 transition-colors">New Prompt</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200">
                    Coming Soon
                  </span>
                </div>
                <p className="text-sm text-slate-500">Draft a new system prompt or template with variables, run it against sample inputs, and publish a version — with full audit trail from first draft.</p>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {['System prompt', 'Response template', 'Eval rubric', 'Guardrail clause', 'Import from Bedrock'].map(t => (
                    <span key={t} className="text-[10px] px-2 py-0.5 bg-slate-50 text-slate-600 rounded-md border border-slate-200">{t}</span>
                  ))}
                </div>
              </div>
              <div className="hidden sm:flex w-10 h-10 items-center justify-center rounded-full bg-slate-100 group-hover:bg-pink-100 transition-colors flex-shrink-0">
                <svg className="w-4 h-4 text-slate-500 group-hover:text-pink-700 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
            placeholder="Search prompts, owners, or variables..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full py-3 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm outline-none transition-all duration-150 focus:border-pink-400 pr-4"
            style={{ paddingLeft: '2.75rem' }}
          />
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-8 animate-fade-in stagger-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              filter === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            All ({ITEMS.length})
          </button>
          {CATEGORIES.map(cat => {
            const count = ITEMS.filter(i => i.category === cat.id).length;
            if (!count) return null;
            return (
              <button
                key={cat.id}
                onClick={() => setFilter(filter === cat.id ? 'all' : cat.id)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  filter === cat.id
                    ? `${cat.bg} ${cat.color} border ${cat.border}`
                    : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in stagger-3">
          {filtered.map(item => {
            const cat = CATEGORY_LOOKUP[item.category];
            return (
              <div key={item.id} className="group bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200/70 p-5 hover:shadow-md hover:border-pink-300/60 transition-all flex flex-col">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl ${cat.bg} flex items-center justify-center flex-shrink-0`}>
                    <svg className={`w-5 h-5 ${cat.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-slate-900 leading-tight">{item.name}</h3>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 ${STATUS_BG[item.status]}`}>
                        {item.status === 'coming_soon' ? 'soon' : item.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-medium ${cat.color}`}>{cat.label}</span>
                      <span className="text-[10px] text-slate-400">· {item.version}</span>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed mb-3 line-clamp-3">{item.description}</p>

                <div className="grid grid-cols-3 gap-2 mb-3 pt-3 border-t border-slate-100">
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-slate-400">Agents</div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5">{item.attachedAgents}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-slate-400">Owner</div>
                    <div className="text-[11px] font-semibold text-slate-900 mt-0.5 truncate" title={item.owner}>{item.owner}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-slate-400">Modified</div>
                    <div className="text-[11px] font-semibold text-slate-900 mt-0.5 truncate" title={item.lastModified}>{item.lastModified}</div>
                  </div>
                </div>

                {item.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-auto">
                    {item.variables.map(v => (
                      <span key={v} className="text-[10px] px-2 py-0.5 bg-pink-50 text-pink-700 rounded-md border border-pink-100 font-mono">
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm">No prompts match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
