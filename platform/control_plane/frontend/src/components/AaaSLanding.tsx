import { Link, useNavigate } from 'react-router-dom';

interface Item {
  id: string;
  path: string;
  name: string;
  tagline: string;
  description: string;
  iconBg: string;
  iconPath: string;
  accentFrom: string;
  accentTo: string;
  tags: string[];
  image: string;
  stats?: { label: string; value: string }[];
  subItems?: { name: string; badge?: string; logo?: string }[];
}

const AWS_AGENTS: Item = {
  id: 'aws-agents',
  path: '/aaas/aws-agents',
  name: 'AWS Frontier Agents',
  tagline: 'Managed autonomous agents from AWS.',
  description: 'Deploy Amazon\'s managed agents into your AWS accounts. They run continuously, investigate, and act on their own — scoped to your policies. Three deployment paths: CDK, CloudFormation, or Terraform.',
  iconBg: 'from-orange-500 to-amber-600',
  iconPath: 'M6 13.5V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m12-3V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m-6-9V3.75m0 3.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 9.75V10.5',
  accentFrom: 'from-orange-500',
  accentTo: 'to-red-600',
  image: '/images/aws-agents-hero.png',
  tags: ['CDK', 'CloudFormation', 'Terraform', 'IAM-scoped', 'Cross-account'],
  stats: [
    { label: 'Agents', value: '3' },
    { label: 'IaC flavors', value: '3' },
  ],
  subItems: [
    { name: 'AWS DevOps Agent', badge: 'Available', logo: '/logos/aws-devops-agent.svg' },
    { name: 'AWS Security Agent', badge: 'Available', logo: '/logos/aws-security-agent.svg' },
    { name: 'Kiro', badge: 'Soon', logo: '/logos/kiro.svg' },
  ],
};

const CUSTOM_AGENTS: Item = {
  id: 'custom-agents',
  path: '/aaas/custom',
  name: 'Custom Agents',
  tagline: 'Build your own, run it on AgentCore.',
  description: 'Design an autonomous agent for your domain — pick a model, attach tools, configure memory and guardrails, then deploy to a managed Bedrock AgentCore runtime. Strands or LangGraph, your choice.',
  iconBg: 'from-blue-500 to-indigo-600',
  iconPath: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z',
  accentFrom: 'from-blue-500',
  accentTo: 'to-indigo-700',
  image: '/images/custom-agents-hero.png',
  tags: ['AgentCore', 'Strands', 'LangGraph', 'MCP', 'Guardrails'],
  stats: [
    { label: 'Frameworks', value: '2' },
    { label: 'Tool types', value: '5+' },
  ],
  subItems: [
    { name: 'Create Agent', badge: 'Soon' },
    { name: 'My Agents', badge: 'Soon' },
  ],
};

export default function AaaSLanding() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(254,215,170,0.5) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(219,234,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-8 min-h-[calc(100dvh-4rem)] flex flex-col justify-center">
        <div className="mb-3 animate-fade-in">
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Home</Link>
        </div>

        {/* Hero */}
        <div className="mb-8 animate-fade-in stagger-1">
          <h1 className="text-5xl font-semibold tracking-tight leading-tight" style={{ backgroundImage: 'linear-gradient(135deg, #b91c1c 0%, #ea580c 50%, #f59e0b 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>
            Agents that watch, reason, and act.
          </h1>
          <p className="text-slate-500 mt-4 max-w-2xl">
            Deploy managed AWS agents or build your own on Bedrock AgentCore. Each agent lives continuously in your accounts, runs on your data, and acts within guardrails you set.
          </p>
        </div>

        {/* Two featured cards side by side — flexes to fill remaining viewport space at lg: */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-in stagger-2">
          <FeaturedCard item={AWS_AGENTS} onClick={() => navigate(AWS_AGENTS.path)} />
          <FeaturedCard item={CUSTOM_AGENTS} onClick={() => navigate(CUSTOM_AGENTS.path)} />
        </div>

        {/* Why choose helper — compact inline bar */}
        <div className="mt-6 lg:mt-4 p-4 bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200/60 flex flex-col md:flex-row gap-3 md:gap-6 animate-fade-in stagger-3 lg:flex-none">
          <div className="flex-1 md:border-l-2 md:border-orange-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-orange-700 mr-2">Pick AWS Frontier Agents if</span>
            <span className="text-sm text-slate-600 leading-snug">you want a managed service, fast AWS-native IaC deployment, and AWS-owned operations.</span>
          </div>
          <div className="flex-1 md:border-l-2 md:border-blue-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 mr-2">Pick Custom Agents if</span>
            <span className="text-sm text-slate-600 leading-snug">you need domain-specific reasoning, private-account data, or full control over model and guardrails.</span>
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
      className="group relative bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 hover:border-blue-300/60 transition-all duration-300 flex flex-col"
    >
      {/* Top image hero — ~36% of the card */}
      <div className="relative h-40 overflow-hidden flex-shrink-0 bg-slate-100">
        <img
          src={item.image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
        />

        {/* Icon tile sits on the hero, pinned bottom-left */}
        <div className="absolute bottom-3 left-4">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${item.iconBg} flex items-center justify-center shadow-md ring-2 ring-white/40 group-hover:scale-105 transition-transform`}>
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
            </svg>
          </div>
        </div>

        {/* Stats floated top-right on the hero */}
        <div className="absolute top-3 right-3 flex gap-1.5">
          {item.stats?.map(s => (
            <div key={s.label} className="bg-white/20 backdrop-blur-sm rounded-lg px-2.5 py-1 border border-white/25 text-center">
              <div className="text-sm font-bold text-white leading-none">{s.value}</div>
              <div className="text-[9px] uppercase tracking-wider text-white/90 font-semibold mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Content body — white, like Ref Impl card */}
      <div className="relative p-5 flex flex-col flex-1">
        <h2 className="text-xl font-bold text-blue-700 mb-1 group-hover:text-blue-800 transition-colors">{item.name}</h2>
        <p className="text-sm font-medium text-slate-500 mb-2">{item.tagline}</p>
        <p className="text-sm text-slate-600 leading-relaxed mb-4 line-clamp-3">{item.description}</p>

        {item.subItems && (
          <div className="mb-4 space-y-1.5">
            {item.subItems.map(s => (
              <div key={s.name} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-200/70">
                <span className="flex items-center gap-2.5">
                  {s.logo && (
                    <img src={s.logo} alt="" className="w-5 h-5 rounded shadow-sm ring-1 ring-slate-200" />
                  )}
                  <span className="text-sm text-slate-800 font-medium">{s.name}</span>
                </span>
                {s.badge && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                    {s.badge}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1 mb-4">
          {item.tags.map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 bg-blue-50/60 text-blue-700 rounded-md font-medium border border-blue-100/70">{t}</span>
          ))}
        </div>

        <div className="mt-auto flex items-center text-sm font-semibold text-blue-700 group-hover:text-blue-800 transition-colors">
          Explore {item.name}
          <svg className="w-4 h-4 ml-1.5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      </div>
    </div>
  );
}

