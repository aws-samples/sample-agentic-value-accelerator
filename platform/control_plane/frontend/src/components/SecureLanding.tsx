import { Link, useNavigate } from 'react-router-dom';

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
  subItems?: { name: string; badge?: string; note?: string }[];
}

const GUARDRAILS: Item = {
  id: 'guardrails',
  path: '/secure/guardrails',
  name: 'Guardrails',
  tagline: 'Content-level safety for every agent invocation.',
  description:
    'Block harmful content, redact PII, deny topics, and check grounding before responses leave your agents. FSI-tuned templates ship pre-configured for AML/KYC, Wealth, Trading, Claims, and more.',
  iconBg: 'from-rose-500 to-red-600',
  iconPath:
    'M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  image: '/images/secure-guardrails-hero.png',
  tags: ['Content Filters', 'PII Detection', 'Denied Topics', 'Bedrock Guardrails', 'FSI Templates'],
  subItems: [
    { name: 'FSI Templates',  badge: 'Browse',  note: '13+ pre-configured policies' },
    { name: 'Live Preview',   badge: 'Test',    note: 'Validate before deploy' },
    { name: 'Observability',  badge: 'Monitor', note: 'Coverage + audit trail' },
  ],
};

const POLICY: Item = {
  id: 'policy',
  path: '/secure/policy',
  name: 'Policy Management',
  tagline: 'Resource-level governance via Cedar + AgentCore.',
  description:
    'Cedar policies attached to AgentCore Gateways enforce who can do what at the agent and tool level — model access, token limits, data scopes, network egress. Deploy once, governed everywhere.',
  iconBg: 'from-indigo-500 to-blue-600',
  iconPath:
    'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  image: '/images/secure-policy-hero.png',
  tags: ['Cedar Policies', 'AgentCore Gateway', 'Resource-level', 'Audit Trail'],
  subItems: [
    { name: 'Policy Builder', badge: 'Create',     note: '8 rule categories' },
    { name: 'Cedar Engine',   badge: 'Enforce',    note: 'AgentCore-native' },
    { name: 'Audit Log',      badge: 'Compliance', note: 'Every decision tracked' },
  ],
};

const LLM_GATEWAY: Item = {
  id: 'llm-gateway',
  path: '/secure/llm-gateway',
  name: 'LLM Gateway',
  tagline: 'One chokepoint for every model call.',
  description:
    'LiteLLM proxy fronting Amazon Bedrock — virtual keys per agent, daily/monthly budgets, rate limits, attached Bedrock Guardrails, and full audit. Govern’s FinOps and Audit views read live data from here instead of mocks.',
  iconBg: 'from-amber-500 to-rose-600',
  iconPath:
    'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
  image: '/images/secure-llm-gateway-hero.svg',
  tags: ['LiteLLM', 'Virtual Keys', 'Budgets', 'Rate Limits', 'Bedrock', 'OpenAI-Compatible'],
  subItems: [
    { name: 'Virtual Keys',   badge: 'Issue',    note: 'Per-agent + per-team' },
    { name: 'Live Config',    badge: 'Tune',     note: 'SSM-backed config.yaml' },
    { name: 'Spend + Audit',  badge: 'Govern',   note: 'Powers FinOps + Audit' },
  ],
};

const ITEMS = [GUARDRAILS, POLICY, LLM_GATEWAY];

export default function SecureLanding() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(254,226,226,0.65) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(224,231,255,0.5) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(243,232,255,0.5) 0%, transparent 50%)',
          animation: 'gradientDrift 20s ease-in-out infinite',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 py-8 min-h-[calc(100dvh-4rem)] flex flex-col justify-center">
        <div className="mb-3 animate-fade-in">
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
            ← Back to Home
          </Link>
        </div>

        <div className="mb-8 animate-fade-in stagger-1">
          <h1
            className="text-5xl font-semibold tracking-tight leading-tight"
            style={{
              backgroundImage: 'linear-gradient(135deg, #be123c 0%, #4f46e5 60%, #7c3aed 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Three layers of defense for every agent.
          </h1>
          <p className="text-slate-500 mt-4 max-w-3xl">
            <span className="font-semibold text-slate-700">Guardrails</span> handle the content the agent emits.{' '}
            <span className="font-semibold text-slate-700">Policies</span> govern what the agent is allowed to do.{' '}
            <span className="font-semibold text-slate-700">LLM Gateway</span> is the single chokepoint every model call passes through —
            virtual keys, budgets, rate limits, audit. Together, they make autonomous agents safe to ship.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in stagger-2">
          {ITEMS.map((item) => (
            <FeaturedCard key={item.id} item={item} onClick={() => navigate(item.path)} />
          ))}
        </div>

        <div className="mt-6 lg:mt-4 p-4 bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200/60 flex flex-col md:flex-row gap-3 md:gap-6 animate-fade-in stagger-3">
          <div className="flex-1 md:border-l-2 md:border-rose-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700 mr-2">Content + behavior together</span>
            <span className="text-sm text-slate-600 leading-snug">
              Guardrails alone can&apos;t stop a wrongly-scoped tool call; Policies alone can&apos;t stop a hallucinated SSN. You need both.
            </span>
          </div>
          <div className="flex-1 md:border-l-2 md:border-indigo-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 mr-2">FSI-tuned out of the box</span>
            <span className="text-sm text-slate-600 leading-snug">
              13+ guardrail templates and 4+ policy presets shaped for banking, payments, capital markets.
            </span>
          </div>
          <div className="flex-1 md:border-l-2 md:border-violet-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-700 mr-2">Audit-ready</span>
            <span className="text-sm text-slate-600 leading-snug">
              Every decision (block, redact, deny) lands in an immutable log. Regulators get evidence on demand.
            </span>
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
          <div
            className={`w-11 h-11 rounded-xl bg-gradient-to-br ${item.iconBg} flex items-center justify-center shadow-md ring-2 ring-white/40 group-hover:scale-105 transition-transform overflow-hidden`}
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
            </svg>
          </div>
        </div>
      </div>

      <div className="relative p-5 flex flex-col flex-1">
        <h2 className="text-xl font-bold text-indigo-700 mb-1 group-hover:text-indigo-800 transition-colors">
          {item.name}
        </h2>
        <p className="text-sm font-medium text-slate-500 mb-2">{item.tagline}</p>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">{item.description}</p>

        {item.subItems && (
          <div className="mb-4 space-y-1.5">
            {item.subItems.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-200/70"
              >
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
          {item.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] px-2 py-0.5 bg-indigo-50/60 text-indigo-700 rounded-md font-medium border border-indigo-100/70"
            >
              {t}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-center text-sm font-semibold text-indigo-700 group-hover:text-indigo-800 transition-colors">
          Explore {item.name}
          <svg
            className="w-4 h-4 ml-1.5 group-hover:translate-x-1 transition-transform"
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
  );
}

