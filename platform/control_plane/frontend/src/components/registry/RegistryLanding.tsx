import { Link, useNavigate } from 'react-router-dom';

// Registry landing — top-level /registry page. Introduces the five resource
// types the AVA registry can catalog and links to each. Sits under Build in
// the sidebar (Build → Registry → {Agents, MCP Servers, A2A Agents, Skills,
// Custom Resources}). AWS Agent Registry ("AVA") backs this in-account —
// records are discoverable across teams once approved via the Approval Queue.
interface Card {
  id: string;
  path: string;
  name: string;
  tagline: string;
  description: string;
  iconBg: string;
  iconPath: string;
  tags: string[];
}

const AGENTS: Card = {
  id: 'agents',
  path: '/registry/agents',
  name: 'Agents',
  tagline: 'Autonomous peers in your organization.',
  description:
    'Register agents built with Bedrock AgentCore, Strands, or any AWS-compatible runtime. Discoverable across teams once approved. Metadata carries the agent card, capability tags, and cost profile so downstream agents can call them without hardcoded ARNs.',
  iconBg: 'from-indigo-500 to-blue-600',
  iconPath:
    'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  tags: ['AgentCard', 'MCP-callable', 'Approval'],
};

const MCP_SERVERS: Card = {
  id: 'mcp-servers',
  path: '/mcp',
  name: 'MCP Servers',
  tagline: 'Tools your agents call at runtime.',
  description:
    'Register MCP-compliant tool servers — hosted or self-hosted. Publish once; consume everywhere. Auth hints, URL, and capability tags help agents pick the right tool without runtime discovery calls to third-party services.',
  iconBg: 'from-violet-500 to-purple-600',
  iconPath:
    'M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z',
  tags: ['Model Context Protocol', 'Tools', 'Curated'],
};

const A2A_SERVERS: Card = {
  id: 'a2a-servers',
  path: '/a2a',
  name: 'A2A Agents',
  tagline: 'Agent-to-agent peer catalog.',
  description:
    'Register A2A-protocol agents — the ones other agents delegate to. AgentCard fetch + capability declarations let peer agents build call graphs at plan time. Includes curated references for common patterns (research, extraction, evaluation).',
  iconBg: 'from-emerald-500 to-teal-600',
  iconPath:
    'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  tags: ['A2A Protocol', 'Peer agents', 'AgentCard'],
};

const SKILLS: Card = {
  id: 'skills',
  path: '/registry/skills',
  name: 'Skills',
  tagline: 'Reusable capabilities agents can equip.',
  description:
    'Catalog reusable agent skills — sub-plans, evaluation rubrics, structured workflows — that any agent can attach at runtime. Distinct from tools (MCP): skills carry procedural knowledge, not endpoint access. Coming soon.',
  iconBg: 'from-orange-500 to-amber-600',
  iconPath:
    'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  tags: ['Coming soon', 'Reusable', 'Curated'],
};

const CUSTOM: Card = {
  id: 'custom-resources',
  path: '/registry/custom-resources',
  name: 'Custom Resources',
  tagline: 'Anything else worth discovering.',
  description:
    'The escape hatch. Register anything — knowledge bases, datasets, evaluation harnesses, deployment templates, prompt libraries — that the AWS Agent Registry schema doesn\'t model natively. Metadata is free-form; discoverable by tag. Coming soon.',
  iconBg: 'from-rose-500 to-pink-600',
  iconPath:
    'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z',
  tags: ['Coming soon', 'Free-form', 'Discovery'],
};

const CARDS = [AGENTS, MCP_SERVERS, A2A_SERVERS, SKILLS, CUSTOM];

export default function RegistryLanding() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.55) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.5) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.35) 0%, transparent 50%)',
          animation: 'gradientDrift 20s ease-in-out infinite',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 py-8">
        <div className="mb-3">
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
            ← Back to Home
          </Link>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
              Build · Registry
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
              AWS Agent Registry · AVA
            </span>
          </div>
          <h1
            className="text-5xl font-semibold tracking-tight leading-tight"
            style={{
              backgroundImage: 'linear-gradient(135deg, #1e40af 0%, #7c3aed 50%, #db2777 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            One registry. Every resource.
          </h1>
          <p className="text-slate-500 mt-4 max-w-3xl">
            The AVA registry — backed by AWS Agent Registry — is the discovery layer for everything an agent
            might reach for at runtime. Publish once, discover anywhere, gate sensitive publications through the
            Approval Queue in Operate.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {CARDS.map((c) => (
            <div key={c.id}
              onClick={() => navigate(c.path)}
              className="group relative bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 hover:border-indigo-300/60 transition-all duration-300 flex flex-col p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${c.iconBg} flex items-center justify-center shadow-md ring-2 ring-white/40 group-hover:scale-105 transition-transform`}>
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={c.iconPath} />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-slate-900 group-hover:text-indigo-800 transition-colors">{c.name}</h2>
                  <p className="text-xs font-medium text-slate-500">{c.tagline}</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">{c.description}</p>
              <div className="mt-auto flex flex-wrap gap-1">
                {c.tags.map((t) => (
                  <span key={t} className="text-[10px] px-2 py-0.5 bg-indigo-50/60 text-indigo-700 rounded-md font-medium border border-indigo-100/70">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200/60 flex flex-col md:flex-row gap-3 md:gap-6">
          <div className="flex-1 md:border-l-2 md:border-indigo-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 mr-2">Registry: AVA</span>
            <span className="text-sm text-slate-600 leading-snug">
              Backed by AWS Agent Registry (preview). All records live in one in-account registry named{' '}
              <code className="text-xs bg-slate-100 px-1 rounded">AVA</code>.
            </span>
          </div>
          <div className="flex-1 md:border-l-2 md:border-amber-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 mr-2">Manual approval</span>
            <span className="text-sm text-slate-600 leading-snug">
              Publications require sign-off via the{' '}
              <Link to="/operate/approvals" className="text-amber-700 hover:underline">Approval Queue</Link>.
            </span>
          </div>
          <div className="flex-1 md:border-l-2 md:border-emerald-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 mr-2">MCP-native</span>
            <span className="text-sm text-slate-600 leading-snug">
              Agents can query the registry via MCP endpoint — no bespoke SDK required.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
