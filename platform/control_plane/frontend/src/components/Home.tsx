import { Link } from 'react-router-dom';
import Footer from './Footer';

/**
 * Home landing — 5-pillar vertical layout, rich tiles.
 *
 * Design:
 *   - Five side-by-side pillars: Plan · Build · Secure · Operate · Govern.
 *   - Each pillar is a self-contained column with a colored gradient header
 *     + 3–4 tiles inside. Tiles are mini-cards, not bullets: icon square,
 *     name, one-line description, tag chips.
 *   - Whole page fits one viewport at 1440px+.
 *   - Single accent color per pillar for coherence with the rest of AVA.
 *
 * Backup of the previous 2×3 layout is at Home.5col-backup.tsx.
 */

// ─── Content model ─────────────────────────────────────────────────────────

interface Item {
  label: string;
  to: string;
  note?: string;
  tags?: string[];
  /** Heroicon SVG path. Rendered inside an accent-tinted square. */
  icon: string;
}

interface Pillar {
  key: 'plan' | 'build' | 'secure' | 'operate' | 'govern';
  name: string;
  tagline: string;
  landing: string;
  accent: {
    from: string;
    to: string;
    text: string;
    hoverText: string;
    softBg: string;
    softHoverBg: string;
    tagText: string;
    tagBg: string;
    glow: string;
    ring: string;
    iconText: string;
  };
  icon: string;
  items: Item[];
}

// Heroicon paths reused across items — kept as constants so we're not
// hand-pasting the same SVG data in multiple places.
const ICON = {
  chartBar:      'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  identify:      'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  lightbulb:     'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18',
  briefcase:     'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z',
  squares:       'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  cpu:           'M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25',
  rocket:        'M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z',
  book:          'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  key:           'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z',
  shieldCheck:   'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  fingerPrint:   'M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M8.25 10.5a3.75 3.75 0 019 0m-9 0a9.75 9.75 0 011.106-4.554m1.79-.888a9.75 9.75 0 018.31 4.28M3.75 12.75v-.75',
  document:      'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
  rocketBoost:   'M4.5 12.75l7.5-7.5 7.5 7.5m-15 6l7.5-7.5 7.5 7.5',
  play:          'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z',
  eye:           'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z',
  chip:          'M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z',
  wand:          'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.562L16.5 21.75l-.398-1.188a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.188-.398a2.25 2.25 0 001.423-1.423l.398-1.188.398 1.188a2.25 2.25 0 001.423 1.423L19.5 18.75l-1.188.398a2.25 2.25 0 00-1.423 1.423z',
  bank:          'M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z',
  scale:         'M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z',
  fleet:         'M2.25 21h19.5m-18-18v18m2.25-18v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
  triangleAlert: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
  coins:         'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
} as const;

const PILLARS: Pillar[] = [
  {
    key: 'plan',
    name: 'Plan',
    tagline: 'Turn ambition into an investable plan.',
    landing: '/plan',
    accent: {
      from: 'from-sky-500', to: 'to-blue-600',
      text: 'text-blue-700',
      hoverText: 'group-hover:text-blue-900',
      softBg: 'bg-blue-50/70',
      softHoverBg: 'group-hover:bg-blue-100',
      tagText: 'text-blue-600/80',
      tagBg: 'bg-blue-50',
      glow: 'rgba(59,130,246,0.14)',
      ring: 'ring-blue-100',
      iconText: 'text-blue-600',
    },
    icon: 'M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z',
    items: [
      { label: 'Maturity Assessment', to: '/maturity-assessment', note: '5 dimensions · L1–L5', tags: ['Readiness'],  icon: ICON.chartBar },
      { label: 'Operating Model',     to: '/operating-model',     note: '7 dimensions',           tags: ['TOM'],        icon: ICON.identify },
      { label: 'Use Case Priority',   to: '/use-cases',           note: 'AWS scoring model',      tags: ['Prioritize'], icon: ICON.lightbulb },
      { label: 'Business Cases',      to: '/business-cases',      note: 'NPV · IRR · Payback',    tags: ['ROI'],        icon: ICON.briefcase },
      { label: 'Organization Design', to: '/organization-design', note: 'Roles · squads · pods',  tags: ['Org'],        icon: ICON.identify },
    ],
  },
  {
    key: 'build',
    name: 'Build',
    tagline: 'Ship agentic systems on AWS.',
    landing: '/applications',
    accent: {
      from: 'from-indigo-500', to: 'to-violet-600',
      text: 'text-indigo-700',
      hoverText: 'group-hover:text-indigo-900',
      softBg: 'bg-indigo-50/70',
      softHoverBg: 'group-hover:bg-indigo-100',
      tagText: 'text-indigo-600/80',
      tagBg: 'bg-indigo-50',
      glow: 'rgba(99,102,241,0.14)',
      ring: 'ring-indigo-100',
      iconText: 'text-indigo-600',
    },
    icon: ICON.squares,
    items: [
      { label: 'Applications', to: '/applications',  note: 'Foundry · Ref Apps · Templates',   tags: ['App Factory'],     icon: ICON.rocket },
      { label: 'AaaS',         to: '/aaas',          note: 'Frontier + Custom Agents',         tags: ['Managed'],         icon: ICON.wand },
      { label: 'Harness',      to: '/harness',       note: 'Managed agent loop',                tags: ['AgentCore'],       icon: ICON.cpu },
      { label: 'Capabilities', to: '/capabilities',  note: 'Tools · Knowledge · Prompts',       tags: ['Building Blocks'], icon: ICON.wand },
      { label: 'Registry',     to: '/registry',      note: 'Agents · MCP · A2A · Skills · +',   tags: ['AVA Registry'],    icon: ICON.book },
    ],
  },
  {
    key: 'secure',
    name: 'Secure',
    tagline: 'Five layers of defense per agent.',
    landing: '/secure',
    accent: {
      from: 'from-rose-500', to: 'to-red-600',
      text: 'text-rose-700',
      hoverText: 'group-hover:text-rose-900',
      softBg: 'bg-rose-50/70',
      softHoverBg: 'group-hover:bg-rose-100',
      tagText: 'text-rose-600/80',
      tagBg: 'bg-rose-50',
      glow: 'rgba(244,63,94,0.14)',
      ring: 'ring-rose-100',
      iconText: 'text-rose-600',
    },
    icon: 'M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    items: [
      { label: 'LLM Gateway',        to: '/secure/llm-gateway',        note: 'Virtual keys · Budgets',      tags: ['LiteLLM'],  icon: ICON.key },
      { label: 'Guardrails',         to: '/secure/guardrails',         note: 'Content + PII + Topics',      tags: ['Bedrock'],  icon: ICON.shieldCheck },
      { label: 'Identity',           to: '/secure/identity',           note: 'Entra · Okta · Auth0 · OIDC', tags: ['SSO'],      icon: ICON.fingerPrint },
      { label: 'Policy',             to: '/secure/policy',             note: 'Cedar · Tool-access control', tags: ['Cedar'],    icon: ICON.document },
      { label: 'Approval Policies',  to: '/secure/approval-policies',  note: 'HITL rules · Quorum · SLA',   tags: ['HITL'],     icon: ICON.shieldCheck },
    ],
  },
  {
    key: 'operate',
    name: 'Operate',
    tagline: 'Every agent, fully observed.',
    landing: '/operate',
    accent: {
      from: 'from-emerald-500', to: 'to-teal-600',
      text: 'text-emerald-700',
      hoverText: 'group-hover:text-emerald-900',
      softBg: 'bg-emerald-50/70',
      softHoverBg: 'group-hover:bg-emerald-100',
      tagText: 'text-emerald-600/80',
      tagBg: 'bg-emerald-50',
      glow: 'rgba(16,185,129,0.14)',
      ring: 'ring-emerald-100',
      iconText: 'text-emerald-600',
    },
    icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    items: [
      { label: 'Deployments',              to: '/deployments',             note: 'Pipeline runs · Status',     tags: ['CI/CD'],   icon: ICON.rocketBoost },
      { label: 'AgentCore Observability',  to: '/observability/agentcore', note: 'CloudWatch · X-Ray',         tags: ['AWS'],     icon: ICON.chip },
      { label: 'Langfuse Observability',   to: '/observability/langfuse',  note: 'Traces · Evals · Cost',      tags: ['Tracing'], icon: ICON.eye },
      { label: 'Prompt Optimization',      to: '/prompt-optimization',     note: 'Bedrock AdvPO',              tags: ['AdvPO'],   icon: ICON.wand },
      { label: 'Approval Queue',           to: '/operate/approvals',       note: 'HITL inbox · Approve · Deny',tags: ['HITL'],    icon: ICON.eye },
    ],
  },
  {
    key: 'govern',
    name: 'Govern',
    tagline: 'One view for GRC across every agent.',
    landing: '/govern',
    accent: {
      from: 'from-violet-500', to: 'to-fuchsia-600',
      text: 'text-violet-700',
      hoverText: 'group-hover:text-violet-900',
      softBg: 'bg-violet-50/70',
      softHoverBg: 'group-hover:bg-violet-100',
      tagText: 'text-violet-600/80',
      tagBg: 'bg-violet-50',
      glow: 'rgba(139,92,246,0.14)',
      ring: 'ring-violet-100',
      iconText: 'text-violet-600',
    },
    icon: ICON.bank,
    items: [
      { label: 'Command Center', to: '/govern/command-center', note: 'Trust · Fleet · Activity',   tags: ['Overview'],   icon: ICON.bank },
      { label: 'Fleet Management', to: '/govern/fleet',           note: 'Agent inventory',            tags: ['Inventory'],  icon: ICON.fleet },
      { label: 'Risk Management', to: '/govern/risk',            note: 'OWASP · Policies · HRAIS',   tags: ['OWASP'],      icon: ICON.triangleAlert },
      { label: 'Compliance',     to: '/govern/compliance',      note: 'Controls · Audits · Reports',tags: ['SOC2 · GDPR'],icon: ICON.scale },
      { label: 'Cost & FinOps',  to: '/govern/finops',          note: 'Spend · Budgets · Forecast', tags: ['FinOps'],     icon: ICON.coins },
    ],
  },
];

// ─── Layout ───────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="relative min-h-[calc(100dvh-4rem)] flex flex-col">
      {/* Ambient page tint — same drift as other landings */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.55) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.45) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.35) 0%, transparent 50%)',
          animation: 'gradientDrift 20s ease-in-out infinite',
        }}
      />

      {/* py-12 (vs the earlier py-6) balances the space above the headline
          with the space below the 5-pillar grid. justify-center still owns
          the fine tuning, but the increased padding compensates for the
          Footer that sits outside this flex column and would otherwise
          make the top of the page look "too close" to the header. */}
      <div className="relative flex-1 max-w-[1440px] w-full mx-auto px-6 py-12 flex flex-col justify-center">
        {/* Headline — two-line hierarchy, centered.
            Primary: product name in the AVA gradient.
            Secondary: tagline in bold green. */}
        <div className="mb-5 text-center">
          <h1
            className="text-4xl md:text-5xl font-semibold tracking-tight leading-tight"
            style={{
              backgroundImage: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 40%, #818cf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Agentic Value Accelerator
          </h1>
          <p className="text-2xl md:text-3xl font-bold text-emerald-700 mt-3">
            Agents from Inception to Production
          </p>
        </div>

        {/* 5-pillar grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {PILLARS.map((p) => (
            <PillarCard key={p.key} pillar={p} />
          ))}
        </div>
      </div>

      <Footer />
    </div>
  );
}

// ─── Pillar card ──────────────────────────────────────────────────────────

function PillarCard({ pillar }: { pillar: Pillar }) {
  return (
    <div className={`relative bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-lg transition-shadow flex flex-col overflow-hidden ring-1 ${pillar.accent.ring}`}>
      {/* Corner glow — same treatment the older landing used for depth */}
      <div
        className="absolute -bottom-16 -right-16 w-48 h-48 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${pillar.accent.glow}, transparent 70%)` }}
      />

      {/* Gradient header — click to jump to the pillar landing */}
      <Link
        to={pillar.landing}
        className={`relative px-4 py-3.5 bg-gradient-to-br ${pillar.accent.from} ${pillar.accent.to} text-white block group`}
      >
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d={pillar.icon} />
            </svg>
          </div>
          <div className="text-base font-bold tracking-tight">{pillar.name}</div>
          <svg className="ml-auto w-3.5 h-3.5 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <div className="text-[11px] text-white/90 leading-snug">{pillar.tagline}</div>
      </Link>

      {/* Module tiles */}
      <div className="relative flex-1 flex flex-col p-2 gap-1.5">
        {pillar.items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group relative flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/90 transition-colors border border-transparent hover:border-slate-200/70 hover:shadow-sm"
          >
            <div className={`w-8 h-8 rounded-lg ${pillar.accent.softBg} ${pillar.accent.softHoverBg} flex items-center justify-center shrink-0 transition-colors`}>
              <svg className={`w-4 h-4 ${pillar.accent.iconText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-semibold text-slate-800 ${pillar.accent.hoverText} truncate transition-colors`}>
                {item.label}
              </div>
              {item.note && (
                <div className="text-[11px] text-slate-500 leading-snug truncate">{item.note}</div>
              )}
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.tags.map((t) => (
                    <span key={t} className={`text-[9px] font-medium ${pillar.accent.tagText} ${pillar.accent.tagBg} px-1.5 py-0.5 rounded-full`}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <svg className="w-3 h-3 text-slate-300 group-hover:text-slate-500 mt-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}
