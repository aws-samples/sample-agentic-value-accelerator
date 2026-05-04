import { Link, useNavigate } from 'react-router-dom';

interface Option {
  id: string;
  path: string;
  name: string;
  tagline: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  iconBg: string;
  iconPath: string;
  accentFrom: string;
  accentTo: string;
  tags: string[];
  stats?: { label: string; value: string }[];
  image?: string;
}

const FEATURED: Option = {
  id: 'fsi-foundry',
  path: '/applications/fsi-foundry',
  name: 'FSI Foundry',
  tagline: 'The fastest way to ship multi-agent systems for financial services.',
  description: '34 multi-agent use cases spanning banking, risk & compliance, capital markets, insurance, operations, and modernization. Each ships with Strands and LangGraph implementations on a shared infrastructure foundation.',
  badge: 'Most Popular',
  badgeColor: 'bg-white/90 text-blue-700',
  iconBg: 'from-blue-500 to-indigo-600',
  iconPath: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  accentFrom: 'from-blue-600',
  accentTo: 'to-indigo-700',
  tags: ['Banking', 'Payments', 'Risk & Compliance', 'Capital Markets', 'Insurance', 'Operations', 'Modernization'],
  stats: [
    { label: 'Use cases', value: '34' },
    { label: 'Domains', value: '7' },
    { label: 'Frameworks', value: '2' },
  ],
  image: '/images/foundry-hero.png',
};

const SECONDARY: Option[] = [
  {
    id: 'reference-impl',
    path: '/applications/reference-implementations',
    name: 'Reference Implementations',
    tagline: 'Fork and customize end-to-end.',
    description: 'Complete full-stack applications with dedicated frontends, backends, and infrastructure. Four reference apps today: Market Surveillance, Shopping Concierge, Case Management, and Agent Safety.',
    iconBg: 'from-blue-600 to-indigo-700',
    iconPath: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z',
    accentFrom: 'from-blue-600',
    accentTo: 'to-indigo-700',
    tags: ['Market Surveillance', 'Shopping Concierge', 'Case Management', 'Agent Safety'],
    stats: [
      { label: 'Apps', value: '4' },
    ],
  },
  {
    id: 'templates',
    path: '/applications/templates',
    name: 'App Templates',
    tagline: 'Scaffold from reusable patterns.',
    description: 'Starter templates for foundation, AgentCore runtimes, RAG, tool-calling, and multi-agent orchestration. Deploy with Terraform, CDK, or CloudFormation.',
    iconBg: 'from-blue-600 to-indigo-700',
    iconPath: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
    accentFrom: 'from-indigo-600',
    accentTo: 'to-blue-700',
    tags: ['Terraform', 'CDK', 'CloudFormation'],
    stats: [
      { label: 'Templates', value: '8' },
    ],
  },
  {
    id: 'app-factory',
    path: '/applications/app-factory',
    name: 'App Factory',
    tagline: 'Describe it. We build and deploy it.',
    description: 'Five-step wizard captures your problem, users, workflow, data, and constraints. AI generates the agent code and Terraform, then the pipeline deploys it to Bedrock AgentCore on AWS — no coding required.',
    badge: 'New',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    iconBg: 'from-blue-600 to-indigo-700',
    iconPath: 'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 001.591 1.591L19 14.5m-9.25 0v5.25m4.5-5.25v5.25M3 21h18',
    accentFrom: 'from-blue-500',
    accentTo: 'to-indigo-600',
    tags: ['Natural Language', 'AI Code Generation', 'AgentCore', 'Strands', 'Terraform'],
  },
];

export default function ApplicationsLanding() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-8 min-h-[calc(100dvh-4rem)] flex flex-col justify-center">
        {/* Breadcrumb */}
        <div className="mb-3 animate-fade-in">
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Home</Link>
        </div>

        {/* Hero */}
        <div className="mb-8 animate-fade-in stagger-1">
          <h1 className="text-5xl font-semibold tracking-tight leading-tight" style={{ backgroundImage: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 40%, #818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>
            Ship agentic applications.
          </h1>
          <p className="text-slate-500 mt-4 max-w-2xl">
            Four ways to go from idea to production — pre-built use cases, forkable references, reusable templates, or AI-generated apps deployed straight from a plain-language brief.
          </p>
        </div>

        {/* Card container — flexes to fill remaining viewport space at lg: */}
        <div className="space-y-4">
          {/* Featured card (FSI Foundry) */}
          <div
            onClick={() => navigate(FEATURED.path)}
            className="group relative rounded-2xl overflow-hidden cursor-pointer animate-fade-in stagger-2 hover:shadow-2xl transition-all duration-300"
          >
            <div className={`relative bg-gradient-to-br ${FEATURED.accentFrom} ${FEATURED.accentTo} p-6 overflow-hidden flex flex-col md:flex-row gap-6 items-stretch`}>
            {FEATURED.image && (
              <img src={FEATURED.image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-luminosity group-hover:scale-105 transition-transform duration-700" />
            )}
            <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-indigo-400/20 blur-3xl pointer-events-none" />

            <div className="relative flex-1 flex flex-col justify-between text-white z-10">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  {FEATURED.badge && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${FEATURED.badgeColor}`}>
                      {FEATURED.badge}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">{FEATURED.name}</h2>
                <p className="text-base text-white/90 font-medium mb-3">{FEATURED.tagline}</p>
                <p className="text-sm text-white/75 leading-relaxed max-w-xl">{FEATURED.description}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-4">
                {FEATURED.tags.map(t => (
                  <span key={t} className="text-[10px] font-medium text-white/90 bg-white/15 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/20">
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative flex md:flex-col gap-4 md:gap-3 md:w-40 z-10">
              {FEATURED.stats?.map(s => (
                <div key={s.label} className="flex-1 bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                  <div className="text-xl md:text-2xl font-bold text-white">{s.value}</div>
                  <div className="text-[10px] uppercase tracking-wider text-white/80 font-semibold mt-0.5">{s.label}</div>
                </div>
              ))}
              <div className="hidden md:flex items-center justify-center mt-auto">
                <div className="w-full bg-white/15 backdrop-blur-sm rounded-xl px-3.5 py-2.5 flex items-center justify-between border border-white/20 group-hover:bg-white/25 transition-colors">
                  <span className="text-sm font-semibold text-white">Explore</span>
                  <svg className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* Secondary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in stagger-3 lg:flex-1 lg:min-h-0">
            {SECONDARY.map(opt => (
            <div
              key={opt.id}
              onClick={() => navigate(opt.path)}
              className="group relative bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 hover:border-blue-300/60 transition-all duration-300"
            >
              {/* Corner wash — unified indigo family, subtle on idle, lifts on hover */}
              <div
                className={`absolute -top-20 -right-20 w-48 h-48 rounded-full bg-gradient-to-br ${opt.accentFrom} ${opt.accentTo} opacity-[0.08] blur-2xl pointer-events-none group-hover:opacity-[0.14] transition-opacity`}
              />
              <div className={`h-1 bg-gradient-to-r ${opt.accentFrom} ${opt.accentTo}`} />
              <div className="relative p-5 flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${opt.iconBg} flex items-center justify-center shadow-sm ring-1 ring-slate-900/5 group-hover:shadow-md group-hover:scale-105 transition-all`}>
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={opt.iconPath} />
                    </svg>
                  </div>
                  {opt.badge && (
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${opt.badgeColor}`}>{opt.badge}</span>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-blue-700 mb-1 group-hover:text-blue-800 transition-colors">{opt.name}</h3>
                <p className="text-xs font-medium text-slate-500 mb-3">{opt.tagline}</p>
                <p className="text-sm text-slate-600 mb-4 flex-1 leading-relaxed line-clamp-3">{opt.description}</p>

                {opt.stats && (
                  <div className="flex gap-4 pb-3 mb-3 border-b border-slate-100">
                    {opt.stats.map(s => (
                      <div key={s.label}>
                        <div className="text-xl font-bold text-blue-700">{s.value}</div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-1 mb-4">
                  {opt.tags.map(t => (
                    <span key={t} className="text-[10px] px-2 py-0.5 bg-blue-50/60 text-blue-700 rounded-md font-medium border border-blue-100/70">{t}</span>
                  ))}
                </div>
                <div className="flex items-center text-xs font-semibold text-slate-600 group-hover:text-blue-600 transition-colors mt-auto">
                  Explore
                  <svg className="w-3.5 h-3.5 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>
            </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
