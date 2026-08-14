import { Link, useNavigate } from 'react-router-dom';

/**
 * Operate pillar landing — one page, four modules.
 *
 * Order (locked): Deployments → AgentCore Obs → Langfuse Obs → Prompt Optimization.
 * The first two are AWS-native; Langfuse is the OSS layer; Prompt Optimization
 * is the closed-loop improvement step you reach for once you have traces
 * and evals in place.
 */

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

const DEPLOYMENTS: Item = {
  id: 'deployments',
  path: '/deployments',
  name: 'Deployments',
  tagline: 'Every launch, one queue.',
  description:
    'Track every CodeBuild + CloudFormation run kicked off from AVA — reference apps, harness updates, FSI Foundry deploys. Streamed build logs, artifact URLs, and success/failure status; no jumping between AWS consoles.',
  iconBg: 'from-emerald-500 to-teal-600',
  iconPath:
    'M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7',
  image: '/images/operate-deployments-hero.svg',
  tags: ['CodeBuild', 'CloudFormation', 'Streamed logs', 'CI/CD'],
  subItems: [
    { name: 'Pipeline Runs',    badge: 'Live', note: 'CodeBuild + CFN status' },
    { name: 'Streamed Logs',    badge: 'Tail', note: 'Real-time build output' },
    { name: 'Artifacts',        badge: 'Link', note: 'Deploy outputs + URLs' },
    { name: 'Retry / Rollback', badge: 'Act',  note: 'One-click remediation' },
  ],
};

// Observability rollup — clicking this lands on /observability, which offers
// the two-tile choice (AgentCore Observability, then Langfuse Observability).
// Keeping it as a single Operate tile mirrors the way the Sidebar collapses
// the two options under the "Observability" section header.
// Observability tiles — descriptions borrowed verbatim from
// ObservabilityLanding.tsx (which is the dedicated /observability page
// that presents the pair as a sub-choice). Kept as separate top-level
// tiles here so the Operate landing surfaces all 5 operational surfaces
// as a single row.
const AGENTCORE_OBS: Item = {
  id: 'agentcore-observability',
  path: '/observability/agentcore',
  name: 'AgentCore Observability',
  tagline: 'Native AWS observability for AgentCore agents.',
  description:
    'Native AWS observability for AgentCore agents — X-Ray TransactionSearch + CloudWatch Logs. Available as an opt-in checkbox when deploying FSI Foundry use cases. Once enabled, traces appear automatically in the AWS console.',
  iconBg: 'from-orange-500 to-amber-600',
  iconPath:
    'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  image: '/images/observability-agentcore-hero.jpg',
  tags: ['CloudWatch', 'X-Ray', 'Opt-in at deploy', 'FSI Foundry', 'OpenTelemetry'],
  subItems: [
    { name: 'X-Ray Transaction Search', badge: 'Traces', note: 'End-to-end agent spans' },
    { name: 'CloudWatch Logs',          badge: 'Logs',   note: 'aws/spans log group' },
    { name: 'CW Logs Insights',         badge: 'Query',  note: 'Cost + latency queries' },
  ],
};

const LANGFUSE_OBS: Item = {
  id: 'langfuse-observability',
  path: '/observability/langfuse',
  name: 'Langfuse Observability',
  tagline: 'Open-source LLM observability.',
  description:
    'Full execution traces, prompt versioning, evaluations, and cost analytics for every agent invocation. Self-hosted inside your VPC via the FSI Foundry foundation stack.',
  iconBg: 'from-violet-500 to-purple-600',
  iconPath:
    'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-1.5M12 12.75l3 1.5M12 12.75V18',
  image: '/images/observability-langfuse-hero.png',
  tags: ['Self-hosted', 'Open Source', 'OpenTelemetry', 'Tracing', 'Evals'],
  subItems: [
    { name: 'Traces & Spans',   badge: 'Live',  note: 'Multi-agent execution graphs' },
    { name: 'Prompt Versions',  badge: 'Audit', note: 'A/B + history + variables' },
    { name: 'Evaluations',      badge: 'Score', note: 'Custom + LLM-as-judge' },
    { name: 'Cost Analytics',   badge: 'Track', note: 'Token usage per run' },
  ],
};

const PROMPT_OPTIMIZATION: Item = {
  id: 'prompt-optimization',
  path: '/prompt-optimization',
  name: 'Prompt Optimization',
  tagline: 'Bedrock Advanced Prompt Optimization.',
  description:
    'Iteratively refine prompts against your own evaluation dataset. Submit a seed prompt + labeled examples; Bedrock generates candidate variants, evaluates each, and returns the best-scoring version — one-click promotion to your Harness.',
  iconBg: 'from-indigo-500 to-cyan-600',
  iconPath:
    'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z',
  image: '/images/operate-prompt-optimization-hero.svg',
  tags: ['Bedrock', 'AdvPO', 'Evaluation', 'JSONL', 'Iterative'],
  subItems: [
    { name: 'Dataset Builder',     badge: 'JSONL', note: 'Structured eval inputs' },
    { name: 'Optimization Jobs',   badge: 'Live',  note: 'Submit + poll to completion' },
    { name: 'Candidate Compare',   badge: 'Score', note: 'Side-by-side variant results' },
    { name: 'Promote to Harness',  badge: 'Ship',  note: 'One-click winner promotion' },
  ],
};

// Approval Queue — live inbox of HITL sign-offs. Authored under
// Secure → Approval Policies; operators watch this surface for pending
// requests. Kept in the same "things you watch/act on in the moment"
// grouping as Deployments and Observability.
const APPROVAL_QUEUE: Item = {
  id: 'approval-queue',
  path: '/operate/approvals',
  name: 'Approval Queue',
  tagline: 'Live inbox of human sign-offs.',
  description:
    'Pending requests waiting on approval, denial, or SLA expiry. Every row shows the requester, target resource, action, matched policy, and time remaining. Approve or deny inline. Requests are produced by matches against Secure → Approval Policies.',
  iconBg: 'from-emerald-500 to-cyan-600',
  iconPath:
    'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  image: '/images/operate-approval-queue-hero.svg',
  tags: ['HITL', 'Inbox', 'SLA', 'Auditable'],
  subItems: [
    { name: 'Pending Queue',   badge: 'Live', note: 'Sortable by SLA' },
    { name: 'Approve / Deny',  badge: 'Act',  note: 'Comment on each decision' },
    { name: 'History',         badge: 'Audit',note: 'Approved · Denied · Expired' },
    { name: 'Simulate',        badge: 'Demo', note: 'Open a synthetic request' },
  ],
};

// Order (5 tiles): Deployments → AgentCore Observability → Langfuse
// Observability → Prompt Optimization → Approval Queue. Every operational
// surface gets its own top-level tile — no rollup — so scanning the page
// is a single row of decisions, not a decision tree.
const ITEMS = [DEPLOYMENTS, AGENTCORE_OBS, LANGFUSE_OBS, PROMPT_OPTIMIZATION, APPROVAL_QUEUE];

export default function OperateLanding() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(209,250,229,0.55) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(254,243,199,0.5) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(221,214,254,0.45) 0%, transparent 50%)',
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
              backgroundImage: 'linear-gradient(135deg, #059669 0%, #d97706 45%, #7c3aed 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Ship. Watch. Improve.
          </h1>
          <p className="text-slate-500 mt-4 max-w-3xl">
            Five operational surfaces, one platform.{' '}
            <span className="font-semibold text-slate-700">Deployments</span> for launch and rollback,{' '}
            <span className="font-semibold text-slate-700">AgentCore Observability</span> for AWS-native X-Ray + CloudWatch traces,{' '}
            <span className="font-semibold text-slate-700">Langfuse Observability</span> for OSS traces + evals + cost,{' '}
            <span className="font-semibold text-slate-700">Prompt Optimization</span> to close the improvement loop, and{' '}
            <span className="font-semibold text-slate-700">Approval Queue</span> for human sign-off on sensitive actions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 animate-fade-in stagger-2">
          {ITEMS.map((item) => (
            <FeaturedCard key={item.id} item={item} onClick={() => navigate(item.path)} />
          ))}
        </div>

        <div className="mt-6 lg:mt-4 p-4 bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200/60 flex flex-col md:flex-row gap-3 md:gap-6 animate-fade-in stagger-3">
          <div className="flex-1 md:border-l-2 md:border-emerald-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 mr-2">Deploy first</span>
            <span className="text-sm text-slate-600 leading-snug">
              Every module downstream depends on a successful deploy — start with the Deployments queue if
              something's off.
            </span>
          </div>
          <div className="flex-1 md:border-l-2 md:border-amber-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 mr-2">Open standards</span>
            <span className="text-sm text-slate-600 leading-snug">
              AgentCore Observability and Langfuse both emit OpenTelemetry — layer them without rewriting agent
              code.
            </span>
          </div>
          <div className="flex-1 md:border-l-2 md:border-indigo-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 mr-2">Close the loop</span>
            <span className="text-sm text-slate-600 leading-snug">
              Feed evaluation datasets from Langfuse into Prompt Optimization to improve prompts against your
              own scoring.
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
      {/* Header — hero image plus a small colored icon badge, matching the
          Secure landing pattern so the two pillars feel like the same
          product surface. Image is decorative (empty alt); the tile's
          semantic label is the h2 below. */}
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
        <h2 className="text-lg font-bold text-indigo-700 mb-1 group-hover:text-indigo-800 transition-colors">
          {item.name}
        </h2>
        <p className="text-xs font-medium text-slate-500 mb-2">{item.tagline}</p>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">{item.description}</p>

        {item.subItems && (
          <div className="mb-4 space-y-1.5">
            {item.subItems.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-200/70"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-slate-800 font-medium truncate">{s.name}</span>
                  {s.note && <span className="text-[10px] text-slate-500 truncate">{s.note}</span>}
                </div>
                {s.badge && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0 ml-2">
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
