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
  logo?: string;
  tags: string[];
  subItems?: { name: string; badge?: string; note?: string }[];
}

const LANGFUSE: Item = {
  id: 'langfuse',
  path: '/observability/langfuse',
  name: 'Langfuse',
  tagline: 'Open-source LLM observability.',
  description:
    'Full execution traces, prompt versioning, evaluations, and cost analytics for every agent invocation. Self-hosted inside your VPC via the FSI Foundry foundation stack.',
  iconBg: 'from-violet-500 to-purple-600',
  iconPath:
    'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-1.5M12 12.75l3 1.5M12 12.75V18',
  image: '/images/observability-langfuse-hero.png',
  logo: '/logos/langfuse-icon.png',
  tags: ['Self-hosted', 'Open Source', 'OpenTelemetry', 'Tracing', 'Evals'],
  subItems: [
    { name: 'Traces & Spans',   badge: 'Live',  note: 'Multi-agent execution graphs' },
    { name: 'Prompt Versions',  badge: 'Audit', note: 'A/B + history + variables' },
    { name: 'Evaluations',      badge: 'Score', note: 'Custom + LLM-as-judge' },
    { name: 'Cost Analytics',   badge: 'Track', note: 'Token usage per run' },
  ],
};

const AGENTCORE: Item = {
  id: 'agentcore',
  path: '/observability/agentcore',
  name: 'AgentCore Observability',
  tagline: 'Native AWS observability for AgentCore agents.',
  description:
    'Native AWS observability for AgentCore agents — X-Ray TransactionSearch + CloudWatch Logs. Available as an opt-in checkbox when deploying FSI Foundry use cases. Once enabled, traces appear automatically in the AWS console.',
  iconBg: 'from-orange-500 to-amber-600',
  iconPath:
    'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  image: '/images/observability-agentcore-hero.jpg',
  logo: '/logos/agentcore-obs-icon.png',
  tags: ['CloudWatch', 'X-Ray', 'Opt-in at deploy', 'FSI Foundry', 'OpenTelemetry'],
  subItems: [
    { name: 'X-Ray Transaction Search', badge: 'Traces', note: 'End-to-end agent spans' },
    { name: 'CloudWatch Logs',          badge: 'Logs',   note: 'aws/spans log group' },
    { name: 'CW Logs Insights',         badge: 'Query',  note: 'Cost + latency queries' },
  ],
};

const ITEMS = [LANGFUSE, AGENTCORE];

export default function ObservabilityLanding() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(237,233,254,0.65) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(254,243,199,0.5) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(221,214,254,0.5) 0%, transparent 50%)',
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
              backgroundImage: 'linear-gradient(135deg, #7c3aed 0%, #d97706 60%, #4f46e5 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Trace, debug, audit.
          </h1>
          <p className="text-slate-500 mt-4 max-w-3xl">
            Two observability options, one platform. Use{' '}
            <span className="font-semibold text-slate-700">Langfuse</span> for open-source LLM tracing, prompt
            versioning, and evaluation pipelines. Use{' '}
            <span className="font-semibold text-slate-700">AgentCore Observability</span> for native AWS
            tracing via X-Ray and CloudWatch — enabled as an opt-in checkbox when deploying FSI Foundry use cases.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in stagger-2">
          {ITEMS.map((item) => (
            <FeaturedCard key={item.id} item={item} onClick={() => navigate(item.path)} />
          ))}
        </div>

        <div className="mt-6 lg:mt-4 p-4 bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200/60 flex flex-col md:flex-row gap-3 md:gap-6 animate-fade-in stagger-3">
          <div className="flex-1 md:border-l-2 md:border-violet-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-700 mr-2">Open standards</span>
            <span className="text-sm text-slate-600 leading-snug">
              Both options emit OpenTelemetry spans — switch or layer them without rewriting your agent code.
            </span>
          </div>
          <div className="flex-1 md:border-l-2 md:border-amber-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 mr-2">Opt-in</span>
            <span className="text-sm text-slate-600 leading-snug">
              AgentCore Observability is enabled per deployment via a checkbox at deploy time — no SDK instrumentation required once ticked.
            </span>
          </div>
          <div className="flex-1 md:border-l-2 md:border-indigo-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 mr-2">Cost &amp; evals</span>
            <span className="text-sm text-slate-600 leading-snug">
              Langfuse adds evaluation pipelines and per-run cost analytics; AgentCore adds X-Ray latency
              attribution and CloudWatch Logs Insights queries.
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
            {item.logo ? (
              <img src={item.logo} alt={item.name} className="w-11 h-11 object-contain" />
            ) : (
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
              </svg>
            )}
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

