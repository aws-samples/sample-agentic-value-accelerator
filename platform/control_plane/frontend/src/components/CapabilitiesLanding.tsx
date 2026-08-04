import { Link, useNavigate } from 'react-router-dom';

type Availability = 'available' | 'coming_soon';

interface Item {
  id: string;
  path: string;
  name: string;
  tagline: string;
  description: string;
  iconBg: string;
  iconPath: string;
  image: string;
  tags: string[];
  status: Availability;
  stats?: { label: string; value: string }[];
  subItems?: { name: string; badge?: string; note?: string }[];
}

const TOOLS: Item = {
  id: 'tools',
  path: '/capabilities/tools',
  name: 'Tools',
  tagline: 'Everything agents can call.',
  description: 'Pre-built function tools, custom Lambdas, REST/OpenAPI endpoints, and MCP servers. Every callable capability your agents reach for at runtime lives here.',
  iconBg: 'from-blue-500 to-indigo-600',
  iconPath: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085',
  image: '/images/capabilities-hero.png',
  tags: ['Lambda', 'OpenAPI', 'MCP', 'Code Interpreter', 'Browser'],
  status: 'coming_soon',
  stats: [
    { label: 'Pre-built', value: '12+' },
    { label: 'Categories', value: '5' },
  ],
  subItems: [
    { name: 'Pre-built Tools',   badge: 'Browse',  note: 'Curated catalog' },
    { name: 'Custom Tools',       badge: 'Build',   note: 'Lambda · API · MCP' },
  ],
};

const KNOWLEDGE: Item = {
  id: 'knowledge',
  path: '/capabilities/knowledge',
  name: 'Knowledge',
  tagline: 'Expose your data as MCP servers.',
  description: 'Register data lakes, databases, and knowledge bases as MCP endpoints. Agents connect to discover schemas and query data — governed by Lake Formation and scoped to what you choose to expose.',
  iconBg: 'from-indigo-500 to-purple-600',
  iconPath: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  image: '/images/knowledge-hero.png',
  tags: ['Data Lake', 'Glue', 'Athena', 'Iceberg', 'MCP', 'AgentCore'],
  status: 'available',
  stats: [
    { label: 'Types', value: '1' },
    { label: 'Tools/endpoint', value: '4' },
  ],
  subItems: [
    { name: 'Data Lake',         badge: 'Available', note: 'Glue + Athena + S3/Iceberg' },
    { name: 'Knowledge Base',    badge: 'Soon',      note: 'Bedrock KB + Vector Search' },
  ],
};

const PROMPTS: Item = {
  id: 'prompts',
  path: '/capabilities/prompts',
  name: 'Prompts',
  tagline: 'Reusable, versioned templates.',
  description: 'System prompts and user-facing templates, versioned like code. Swap a prompt without redeploying the agent, run A/B comparisons, and keep an audit trail of every change regulators might ask about.',
  iconBg: 'from-pink-500 to-rose-600',
  iconPath: 'M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z',
  image: '/images/prompts-hero.png',
  tags: ['Bedrock Prompts', 'Versioning', 'A/B', 'Variables', 'Audit'],
  status: 'coming_soon',
  stats: [
    { label: 'Patterns', value: '8+' },
    { label: 'Tracked',  value: '100%' },
  ],
  subItems: [
    { name: 'Prompt Library',       badge: 'Soon',      note: 'Versioned templates' },
    { name: 'Prompt Optimization',  badge: 'Available', note: 'Bedrock AdvPO' },
  ],
};

export default function CapabilitiesLanding() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(204,251,241,0.55) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(224,231,255,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-8 min-h-[calc(100dvh-4rem)] flex flex-col justify-center">
        <div className="mb-3 animate-fade-in">
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Home</Link>
        </div>

        {/* Hero */}
        <div className="mb-8 animate-fade-in stagger-1">
          <h1 className="text-5xl font-semibold tracking-tight leading-tight" style={{ backgroundImage: 'linear-gradient(135deg, #0f766e 0%, #4f46e5 50%, #be185d 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>
            The building blocks agents depend on.
          </h1>
          <p className="text-slate-500 mt-4 max-w-2xl">
            Composable primitives that every application and autonomous agent reaches for at runtime — tools to call, knowledge to read, and prompts to guide. Governed once, reused everywhere.
          </p>
        </div>

        {/* Three featured cards side by side */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-fade-in stagger-2">
          <FeaturedCard item={TOOLS}     onClick={() => navigate(TOOLS.path)} />
          <FeaturedCard item={KNOWLEDGE} onClick={() => navigate(KNOWLEDGE.path)} />
          <FeaturedCard item={PROMPTS}   onClick={() => navigate(PROMPTS.path)} />
        </div>

        {/* Why-it-matters bar */}
        <div className="mt-6 lg:mt-4 p-4 bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200/60 flex flex-col md:flex-row gap-3 md:gap-6 animate-fade-in stagger-3">
          <div className="flex-1 md:border-l-2 md:border-blue-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 mr-2">Reused, not rebuilt</span>
            <span className="text-sm text-slate-600 leading-snug">Every application and agent pulls from the same governed catalog — one change, many beneficiaries.</span>
          </div>
          <div className="flex-1 md:border-l-2 md:border-indigo-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 mr-2">Governed at the source</span>
            <span className="text-sm text-slate-600 leading-snug">Access control, lineage, and audit trail live with the capability, so you&rsquo;re not chasing them through 30 agents.</span>
          </div>
          <div className="flex-1 md:border-l-2 md:border-pink-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-pink-700 mr-2">Swap without redeploys</span>
            <span className="text-sm text-slate-600 leading-snug">Update a prompt, re-index a KB, or add a new tool integration — agents pick it up at runtime.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturedCard({ item, onClick }: { item: Item; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group relative bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 hover:border-indigo-300/60 transition-all duration-300 flex flex-col"
    >
      <div className="relative h-40 overflow-hidden flex-shrink-0 bg-slate-100">
        <img
          src={item.image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
        />
        <div className="absolute bottom-3 left-4">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${item.iconBg} flex items-center justify-center shadow-md ring-2 ring-white/40 group-hover:scale-105 transition-transform`}>
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
            </svg>
          </div>
        </div>
        <div className="absolute top-3 right-3 flex gap-1.5">
          {item.stats?.map(s => (
            <div key={s.label} className="bg-white/20 backdrop-blur-sm rounded-lg px-2.5 py-1 border border-white/25 text-center">
              <div className="text-sm font-bold text-white leading-none">{s.value}</div>
              <div className="text-[9px] uppercase tracking-wider text-white/90 font-semibold mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative p-5 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-xl font-bold text-indigo-700 group-hover:text-indigo-800 transition-colors">{item.name}</h2>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
            item.status === 'available'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-50 text-slate-500 border-slate-200'
          }`}>
            {item.status === 'available' ? 'Available' : 'Coming Soon'}
          </span>
        </div>
        <p className="text-sm font-medium text-slate-500 mb-2">{item.tagline}</p>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">{item.description}</p>

        {item.subItems && (
          <div className="mb-4 space-y-1.5">
            {item.subItems.map(s => (
              <div key={s.name} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-200/70">
                <div className="flex flex-col">
                  <span className="text-sm text-slate-800 font-medium">{s.name}</span>
                  {s.note && <span className="text-[11px] text-slate-500">{s.note}</span>}
                </div>
                {s.badge && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {s.badge}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1 mb-4">
          {item.tags.map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 bg-indigo-50/60 text-indigo-700 rounded-md font-medium border border-indigo-100/70">{t}</span>
          ))}
        </div>

        <div className="mt-auto flex items-center text-sm font-semibold text-indigo-700 group-hover:text-indigo-800 transition-colors">
          Explore {item.name}
          <svg className="w-4 h-4 ml-1.5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
