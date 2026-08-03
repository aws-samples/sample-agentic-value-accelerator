import { Link, useNavigate } from 'react-router-dom';

interface Item {
  id: string;
  path: string;
  name: string;
  tagline: string;
  description: string;
  iconBg: string;
  iconPath: string;
  illustration: 'maturity' | 'operating-model' | 'use-cases' | 'business-cases' | 'organization-design';
  tags: string[];
  stats?: { label: string; value: string }[];
  subItems?: { name: string; badge?: string; note?: string }[];
  step: number;
  stepLabel: string;
}

const MATURITY: Item = {
  id: 'maturity',
  path: '/maturity-assessment',
  name: 'Maturity Assessment',
  tagline: 'Know where you stand.',
  description: 'Score your organization across 5 dimensions — Data, Infrastructure, Org, Governance, and Strategy — to expose readiness gaps before you build.',
  iconBg: 'from-indigo-500 to-blue-600',
  iconPath: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  illustration: 'maturity',
  tags: ['5 dimensions', '25 indicators', 'Gap analysis', 'Roadmap'],
  stats: [
    { label: 'Dimensions', value: '5' },
    { label: 'Indicators', value: '25' },
  ],
  subItems: [
    { name: 'Readiness Scoring', badge: 'Assess', note: 'Weighted across 5 axes' },
    { name: 'Gap & Roadmap',     badge: 'Plan',   note: 'What to fix first' },
  ],
  step: 1,
  stepLabel: 'Assess',
};

const OPERATING_MODEL: Item = {
  id: 'operating-model',
  path: '/operating-model',
  name: 'Operating Model',
  tagline: 'Design the org to deliver.',
  description: 'Pick the right TOM pattern — Centralized CoE, Hub-and-Spoke, or Federated — by scoring 7 dimensions: Strategy, Governance, Org, People, Tech, Process, and Ecosystem.',
  iconBg: 'from-blue-500 to-violet-600',
  iconPath: 'M12 4.5v15m7.5-7.5h-15M19.5 4.5v15m-15-15v15M4.5 4.5h15M4.5 19.5h15',
  illustration: 'operating-model',
  tags: ['7 dimensions', '21 questions', '3 patterns', 'Investment guide'],
  stats: [
    { label: 'Dimensions', value: '7' },
    { label: 'Patterns',   value: '3' },
  ],
  subItems: [
    { name: 'Dimension Scoring',    badge: 'Design',  note: 'Strategy · Gov · Org · People · Tech · Process · Ecosystem' },
    { name: 'Pattern Recommendation', badge: 'Decide', note: 'Centralized · Hub-and-Spoke · Federated' },
  ],
  step: 2,
  stepLabel: 'Design',
};

const PRIORITIZATION: Item = {
  id: 'use-cases',
  path: '/use-cases',
  name: 'Use Case Prioritization',
  tagline: 'Pick the right battle.',
  description: 'Rank competing opportunities with the AWS Enterprise AI Scoring Model — 25 weighted criteria across value, feasibility, and risk — for clear Go / No-Go / Defer recommendations.',
  iconBg: 'from-violet-500 to-fuchsia-600',
  iconPath: 'M3 6h18M3 12h18M3 18h12M9 6v12M15 6v6',
  illustration: 'use-cases',
  tags: ['25 criteria', 'AWS scoring', 'Go/No-Go', 'Portfolio view'],
  stats: [
    { label: 'Criteria', value: '25' },
    { label: 'Verdicts', value: '3' },
  ],
  subItems: [
    { name: 'Multi-Use-Case Scoring', badge: 'Score', note: 'Weighted across 25 criteria' },
    { name: 'Portfolio Ranking',      badge: 'Rank',  note: 'Compare side-by-side' },
  ],
  step: 3,
  stepLabel: 'Identify',
};

const BUSINESS_CASES: Item = {
  id: 'business-cases',
  path: '/business-cases',
  name: 'Business Cases',
  tagline: 'Justify the investment.',
  description: 'CFO-grade financial models with NPV, IRR, payback, and sensitivity for the use cases you chose to pursue. A defensible case your finance and risk committees will sign off on.',
  iconBg: 'from-fuchsia-500 to-pink-600',
  iconPath: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  illustration: 'business-cases',
  tags: ['NPV', 'IRR', 'Payback', 'Sensitivity', 'Risk-adjusted'],
  stats: [
    { label: 'Models',   value: '4' },
    { label: 'Horizons', value: '3y' },
  ],
  subItems: [
    { name: 'Financial Modeling', badge: 'Build',  note: 'NPV · IRR · Payback' },
    { name: 'Sensitivity & Risk', badge: 'Stress', note: 'Monte Carlo scenarios' },
  ],
  step: 4,
  stepLabel: 'Justify',
};

const ORGANIZATION_DESIGN: Item = {
  id: 'organization-design',
  path: '/organization-design',
  name: 'Organization Design',
  tagline: 'Assemble the future org.',
  description: 'Design a blended organization where humans and AI agents deliver goals together. 8-dim scoring, 10-function agent config, 4-phase roadmap, and a 7-layer blended org chart.',
  iconBg: 'from-pink-500 to-rose-600',
  iconPath: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  illustration: 'organization-design',
  tags: ['8 dimensions', '10 functions', 'Sub vs Peer', '7-layer org', 'Phased'],
  stats: [
    { label: 'Functions', value: '10' },
    { label: 'Phases',    value: '4' },
  ],
  subItems: [
    { name: 'Agent Configuration', badge: 'Compose', note: 'Subordinate vs Peer per function' },
    { name: 'Blended Org Chart',   badge: 'Assemble',note: '7 layers × humans + AI agents' },
  ],
  step: 5,
  stepLabel: 'Assemble',
};

// Narrative order: assess → design → identify → justify → assemble
const ITEMS = [MATURITY, OPERATING_MODEL, PRIORITIZATION, BUSINESS_CASES, ORGANIZATION_DESIGN];

export default function PlanLanding() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      {/* Ambient gradient — indigo/violet to differentiate from Build's blue */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(221,214,254,0.7) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(245,208,254,0.55) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(251,207,232,0.55) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />

      <div className="relative max-w-7xl mx-auto px-6 py-8">
        <div className="mb-3 animate-fade-in">
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Home</Link>
        </div>

        {/* Hero */}
        <div className="mb-6 animate-fade-in stagger-1">
          <h1 className="text-5xl font-semibold tracking-tight leading-tight" style={{ backgroundImage: 'linear-gradient(135deg, #4338ca 0%, #8b5cf6 50%, #ec4899 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>
            From idea to investable. Before you build.
          </h1>
          <p className="text-slate-500 mt-4 max-w-3xl">
            Five frameworks that turn AI agent ambition into an executable plan. <span className="font-semibold text-slate-700">Assess</span> where you stand, <span className="font-semibold text-slate-700">design</span> how to organize, <span className="font-semibold text-slate-700">identify</span> where to start, <span className="font-semibold text-slate-700">justify</span> the spend, and <span className="font-semibold text-slate-700">assemble</span> the blended human+AI org. Use them in order, or jump to the one you need.
          </p>
        </div>

        {/* Five featured cards side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 animate-fade-in stagger-2">
          {ITEMS.map((item) => (
            <FeaturedCard key={item.id} item={item} onClick={() => navigate(item.path)} />
          ))}
        </div>

        {/* "Pick X if" inline guidance bar */}
        <div className="mt-6 lg:mt-4 p-4 bg-white/70 backdrop-blur-sm rounded-xl border border-slate-200/60 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-5 animate-fade-in stagger-3">
          <div className="md:border-l-2 md:border-indigo-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 mr-2">Pick Maturity if</span>
            <span className="text-sm text-slate-600 leading-snug">you&rsquo;re new to AI agents and need a baseline before investing — or want to defend a roadmap to your CIO.</span>
          </div>
          <div className="md:border-l-2 md:border-blue-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 mr-2">Pick Operating Model if</span>
            <span className="text-sm text-slate-600 leading-snug">you have a maturity score and now need to choose how to organize — CoE, Hub-and-Spoke, or Federated.</span>
          </div>
          <div className="md:border-l-2 md:border-violet-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-700 mr-2">Pick Use Cases if</span>
            <span className="text-sm text-slate-600 leading-snug">you have many competing ideas and need an objective way to sequence what to build first.</span>
          </div>
          <div className="md:border-l-2 md:border-pink-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-pink-700 mr-2">Pick Business Cases if</span>
            <span className="text-sm text-slate-600 leading-snug">you have prioritized use cases and need NPV, IRR, and risk-adjusted returns to win budget approval.</span>
          </div>
          <div className="md:border-l-2 md:border-rose-400 md:pl-4">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700 mr-2">Pick Organization Design if</span>
            <span className="text-sm text-slate-600 leading-snug">you&rsquo;re ready to assemble the blended human+AI org — teams, roles, sub vs peer agents, phased 4-year roadmap.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Featured card — mirrors Govern landing pattern ───────── */

function FeaturedCard({ item, onClick }: { item: Item; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group relative bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200/70 overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-1 hover:border-indigo-300/60 transition-all duration-300 flex flex-col"
    >
      {/* Hero illustration — compact */}
      <div className="relative h-20 overflow-hidden flex-shrink-0">
        {item.illustration === 'maturity'            && <MaturityArt />}
        {item.illustration === 'operating-model'     && <OperatingModelArt />}
        {item.illustration === 'use-cases'           && <UseCasesArt />}
        {item.illustration === 'business-cases'      && <BusinessCasesArt />}
        {item.illustration === 'organization-design' && <OrganizationDesignArt />}

        {/* Step pill — top-left */}
        <div className="absolute top-2 left-2">
          <div className="flex items-center gap-1 bg-white/25 backdrop-blur-sm rounded-full pl-0.5 pr-2 py-0.5 border border-white/30">
            <span className="w-4 h-4 rounded-full bg-white text-[9px] font-bold text-slate-800 flex items-center justify-center">{item.step}</span>
            <span className="text-[9px] uppercase tracking-wider text-white font-semibold">{item.stepLabel}</span>
          </div>
        </div>

        {/* Stats floated top-right */}
        {item.stats && (
          <div className="absolute top-2 right-2 flex gap-1">
            {item.stats.map((s) => (
              <div key={s.label} className="bg-white/20 backdrop-blur-sm rounded px-2 py-0.5 border border-white/25 text-center">
                <div className="text-xs font-bold text-white leading-none">{s.value}</div>
                <div className="text-[8px] uppercase tracking-wider text-white/80 font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Icon badge */}
        <div className="absolute bottom-2 left-3">
          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${item.iconBg} flex items-center justify-center shadow-sm ring-1 ring-white/30 group-hover:scale-110 transition-transform`}>
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
            </svg>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">{item.name}</h3>
        <p className="text-xs font-medium text-slate-500 mb-2">{item.tagline}</p>
        <p className="text-xs text-slate-600 leading-relaxed mb-3 flex-1">{item.description}</p>

        <div className="flex flex-wrap gap-1 mb-3">
          {item.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">{t}</span>
          ))}
        </div>

        <div className="flex items-center text-xs font-semibold text-indigo-600 group-hover:text-indigo-700 transition-colors">
          Open
          <svg className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ───────── Three matching gradient illustrations ───────── */

function MaturityArt() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-blue-500 to-blue-600 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/30 via-transparent to-blue-700/40" />
      <div className="absolute -top-12 -left-8 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-10 right-8 w-36 h-36 rounded-full bg-white/15 blur-2xl" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        <g>
          <rect x="60"  y="100" width="28" height="40"  rx="4" fill="white" fillOpacity="0.35" />
          <rect x="100" y="80"  width="28" height="60"  rx="4" fill="white" fillOpacity="0.5" />
          <rect x="140" y="60"  width="28" height="80"  rx="4" fill="white" fillOpacity="0.65" />
          <rect x="180" y="44"  width="28" height="96"  rx="4" fill="white" fillOpacity="0.8" />
          <rect x="220" y="28"  width="28" height="112" rx="4" fill="white" fillOpacity="0.95" />
        </g>
        <path d="M74 110 L114 90 L154 70 L194 54 L234 38" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" strokeDasharray="3 3" />
      </svg>
    </div>
  );
}

function OperatingModelArt() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/30 via-transparent to-violet-700/40" />
      <div className="absolute -top-12 -left-8 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-10 right-8 w-36 h-36 rounded-full bg-white/15 blur-2xl" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* Hub-and-spoke org diagram: center node + 6 satellite nodes connected */}
        <g stroke="white" strokeOpacity="0.5" strokeWidth="1.2">
          <line x1="160" y1="80" x2="60"  y2="40" />
          <line x1="160" y1="80" x2="260" y2="40" />
          <line x1="160" y1="80" x2="40"  y2="80" />
          <line x1="160" y1="80" x2="280" y2="80" />
          <line x1="160" y1="80" x2="60"  y2="120" />
          <line x1="160" y1="80" x2="260" y2="120" />
        </g>
        {/* Satellite nodes */}
        <g>
          <circle cx="60"  cy="40"  r="11" fill="white" fillOpacity="0.55" />
          <circle cx="260" cy="40"  r="11" fill="white" fillOpacity="0.6" />
          <circle cx="40"  cy="80"  r="11" fill="white" fillOpacity="0.45" />
          <circle cx="280" cy="80"  r="11" fill="white" fillOpacity="0.65" />
          <circle cx="60"  cy="120" r="11" fill="white" fillOpacity="0.55" />
          <circle cx="260" cy="120" r="11" fill="white" fillOpacity="0.5" />
        </g>
        {/* Center hub — slightly larger, glowing */}
        <circle cx="160" cy="80" r="22" fill="white" fillOpacity="0.18" />
        <circle cx="160" cy="80" r="16" fill="white" fillOpacity="0.95" stroke="white" strokeOpacity="0.6" strokeWidth="1.5" />
        <text x="160" y="86" textAnchor="middle" fill="#4338ca" fontSize="14" fontWeight="700" fontFamily="Inter, sans-serif">CoE</text>
      </svg>
    </div>
  );
}

function BusinessCasesArt() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500 via-pink-500 to-rose-500 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/30 via-transparent to-rose-700/40" />
      <div className="absolute -top-12 -left-8 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-10 right-8 w-36 h-36 rounded-full bg-white/15 blur-2xl" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="roi-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="white" stopOpacity="0.45" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M40 130 Q 90 110 130 90 T 220 40 L 220 140 L 40 140 Z" fill="url(#roi-area)" />
        <path d="M40 130 Q 90 110 130 90 T 220 40" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="220" cy="40" r="6" fill="white" />
        <g transform="translate(245, 70)">
          <circle cx="22" cy="22" r="22" fill="white" fillOpacity="0.22" stroke="white" strokeOpacity="0.6" strokeWidth="1.2" />
          <text x="22" y="30" textAnchor="middle" fill="white" fontSize="22" fontWeight="700" fontFamily="Inter, sans-serif">$</text>
        </g>
      </svg>
    </div>
  );
}

function UseCasesArt() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-600 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/30 via-transparent to-fuchsia-700/40" />
      <div className="absolute -top-12 -left-8 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-10 right-8 w-36 h-36 rounded-full bg-white/15 blur-2xl" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {[
          { y: 28,  w: 230, op: 0.95, rank: 1 },
          { y: 60,  w: 190, op: 0.78, rank: 2 },
          { y: 92,  w: 150, op: 0.6,  rank: 3 },
          { y: 124, w: 110, op: 0.42, rank: 4 },
        ].map((b, i) => (
          <g key={i}>
            <circle cx="42" cy={b.y + 12} r="12" fill="white" fillOpacity={b.op + 0.05} />
            <text x="42" y={b.y + 16} textAnchor="middle" fill="#7c3aed" fontSize="12" fontWeight="700" fontFamily="Inter, sans-serif">
              {b.rank}
            </text>
            <rect x="64" y={b.y + 4} width={b.w} height="16" rx="4" fill="white" fillOpacity={b.op * 0.4} />
            <rect x="64" y={b.y + 4} width={b.w * 0.7} height="16" rx="4" fill="white" fillOpacity={b.op} />
          </g>
        ))}
      </svg>
    </div>
  );
}

function OrganizationDesignArt() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-pink-500 via-rose-500 to-red-500 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-pink-500/30 via-transparent to-red-700/40" />
      <div className="absolute -top-12 -left-8 w-44 h-44 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-10 right-8 w-36 h-36 rounded-full bg-white/15 blur-2xl" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 128" preserveAspectRatio="xMidYMid meet">
        {/* Blended team: 3 humans (circles) + 3 AI agents (rounded squares) linked to a supervisor */}
        <g stroke="white" strokeOpacity="0.5" strokeWidth="1.2">
          <line x1="160" y1="40" x2="60"  y2="110" />
          <line x1="160" y1="40" x2="110" y2="110" />
          <line x1="160" y1="40" x2="160" y2="110" />
          <line x1="160" y1="40" x2="210" y2="110" />
          <line x1="160" y1="40" x2="260" y2="110" />
        </g>
        {/* Supervisor at top */}
        <circle cx="160" cy="40" r="16" fill="white" fillOpacity="0.95" stroke="white" strokeOpacity="0.6" strokeWidth="1.5" />
        <text x="160" y="46" textAnchor="middle" fill="#be185d" fontSize="12" fontWeight="700" fontFamily="Inter, sans-serif">MGR</text>
        {/* Row of team members: humans (circles) alternate with agents (rounded squares) */}
        <g>
          {/* Human */}
          <circle cx="60"  cy="120" r="11" fill="white" fillOpacity="0.85" />
          <text x="60" y="124" textAnchor="middle" fill="#be185d" fontSize="9" fontWeight="700">H</text>
          {/* Agent (subordinate) */}
          <rect x="99" y="109" width="22" height="22" rx="5" fill="white" fillOpacity="0.7" />
          <text x="110" y="124" textAnchor="middle" fill="#be185d" fontSize="9" fontWeight="700">AI</text>
          {/* Human */}
          <circle cx="160" cy="120" r="11" fill="white" fillOpacity="0.85" />
          <text x="160" y="124" textAnchor="middle" fill="#be185d" fontSize="9" fontWeight="700">H</text>
          {/* Agent (peer) — dashed border to indicate autonomous */}
          <rect x="199" y="109" width="22" height="22" rx="5" fill="white" fillOpacity="0.55" stroke="white" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="3 2" />
          <text x="210" y="124" textAnchor="middle" fill="#be185d" fontSize="9" fontWeight="700">AI</text>
          {/* Human */}
          <circle cx="260" cy="120" r="11" fill="white" fillOpacity="0.85" />
          <text x="260" y="124" textAnchor="middle" fill="#be185d" fontSize="9" fontWeight="700">H</text>
        </g>
      </svg>
    </div>
  );
}
