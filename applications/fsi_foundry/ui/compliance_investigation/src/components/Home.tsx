import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Sample investigation case cards ── */
const caseTypes = [
  { name: 'AML Screening', category: 'Anti-Money Laundering', severity: 'critical', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', desc: 'Detect and investigate potential money laundering patterns across transactions.' },
  { name: 'KYC Verification', category: 'Know Your Customer', severity: 'high', icon: 'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0', desc: 'Verify customer identity documents and cross-reference against watchlists.' },
  { name: 'Sanctions Check', category: 'Sanctions Compliance', severity: 'critical', icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636', desc: 'Screen entities against global sanctions lists and restricted party databases.' },
  { name: 'Fraud Detection', category: 'Fraud Prevention', severity: 'medium', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', desc: 'Identify fraudulent transaction patterns and suspicious account behavior.' },
];

const stats = [
  { value: '3', label: 'AI Agents', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { value: '4', label: 'Investigation Types', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { value: '100+', label: 'Regulations Mapped', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
];

const flowStages = [
  {
    title: 'Gather Evidence',
    desc: 'Collect transaction records, communications, and audit trails',
    color: '#D97706',
    iconPath: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  },
  {
    title: 'Analyze Patterns',
    desc: 'Identify suspicious behaviors, anomalies, and correlations',
    color: '#0D9488',
    iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    title: 'Map Regulations',
    desc: 'Match findings to regulatory requirements and severity levels',
    color: '#1E293B',
    iconPath: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
];

const severityColors: Record<string, { bg: string; border: string; text: string }> = {
  critical: { bg: '#FEF2F2', border: '#DC2626', text: '#DC2626' },
  high: { bg: '#FEF3C7', border: '#B45309', text: '#B45309' },
  medium: { bg: '#FFFBEB', border: '#D97706', text: '#D97706' },
  low: { bg: '#F0FDFA', border: '#0D9488', text: '#0D9488' },
};

export default function Home({ config }: Props) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-16">

      {/* ── Hero ── */}
      <section className="text-center animate-fadeSlideUp">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded text-xs font-bold mb-6"
          style={{ background: 'rgba(217,119,6,0.1)', color: '#D97706' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          AI-Powered Compliance Investigation
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-4" style={{ color: 'var(--slate-900)' }}>
          Compliance Investigation
          <span className="block" style={{ color: '#D97706' }}>Dashboard</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>
          {config.description}. Leverage AI agents to gather evidence, identify patterns,
          and map findings to regulatory requirements.
        </p>

        {/* ── Animated investigation case preview cards ── */}
        <div className="flex justify-center gap-5 mb-12">
          {['AML Screening', 'KYC Verification', 'Sanctions Check'].map((name, i) => {
            const severity = ['critical', 'high', 'critical'][i];
            const colors = severityColors[severity];
            return (
              <div key={name}
                className="evidence-card w-56 animate-fadeSlideUp"
                style={{ animationDelay: `${i * 0.15}s` }}>
                <div className="evidence-card-marker" style={{ background: colors.border }} />
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`severity-badge ${severity}`}>
                      {severity}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-alertPulse">
                      <path d={caseTypes[i].icon} />
                    </svg>
                  </div>
                  <p className="text-sm font-bold" style={{ color: 'var(--slate-900)' }}>{name}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>AI-investigated</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="grid grid-cols-3 gap-6 max-w-2xl mx-auto animate-fadeSlideUp stagger-1">
        {stats.map((s) => (
          <div key={s.label} className="card text-center" style={{ borderTop: '2px solid var(--amber-600)' }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2"
              style={{ background: 'rgba(217,119,6,0.1)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={s.icon} />
              </svg>
            </div>
            <div className="text-3xl font-extrabold mb-1" style={{ color: '#D97706' }}>{s.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Investigation Flow Visualization ── */}
      <section className="animate-fadeSlideUp stagger-2">
        <h2 className="text-2xl font-extrabold text-center mb-8" style={{ color: 'var(--slate-900)' }}>
          Investigation Pipeline
        </h2>
        <div className="flex items-center justify-center gap-4">
          {flowStages.map((stage, i) => (
            <div key={stage.title} className="flex items-center gap-4">
              <div className="card text-center px-8 py-6 flex flex-col items-center"
                style={{ borderTop: `3px solid ${stage.color}`, minWidth: '200px' }}>
                <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${stage.color}15` }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={stage.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={stage.iconPath} />
                  </svg>
                </div>
                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--slate-900)' }}>{stage.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{stage.desc}</p>
              </div>
              {i < flowStages.length - 1 && (
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                  <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Investigation Case Types ── */}
      <section className="animate-fadeSlideUp stagger-3">
        <h2 className="text-2xl font-extrabold text-center mb-2" style={{ color: 'var(--slate-900)' }}>
          Investigation Case Types
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          AI-driven compliance investigations across regulatory domains
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {caseTypes.map((c) => {
            const colors = severityColors[c.severity];
            return (
              <div key={c.name} className="evidence-card">
                <div className="evidence-card-marker" style={{ background: colors.border }} />
                <div className="p-5 pl-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.text }}>
                      {c.category}
                    </span>
                    <span className={`severity-badge ${c.severity}`}>{c.severity}</span>
                  </div>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                    style={{ background: colors.bg }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={c.icon} />
                    </svg>
                  </div>
                  <h3 className="text-sm font-bold mb-1.5" style={{ color: 'var(--slate-900)' }}>{c.name}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{c.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Architecture Diagram (SVG) ── */}
      <section className="animate-fadeSlideUp stagger-4">
        <h2 className="text-2xl font-extrabold text-center mb-8" style={{ color: 'var(--slate-900)' }}>
          Platform Architecture
        </h2>
        <div className="card p-8 max-w-4xl mx-auto" style={{ background: 'white' }}>
          <svg viewBox="0 0 960 520" fill="none" className="w-full">
            <defs>
              <marker id="arrowAmber" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill="#D97706" />
              </marker>
            </defs>

            {/* ── Row 1: User -> CloudFront -> S3 ── */}
            <rect x="40" y="20" width="100" height="70" rx="8" fill="#FFFBEB" stroke="#D97706" strokeWidth="1.5" />
            <text x="90" y="50" textAnchor="middle" fill="#D97706" fontSize="11" fontWeight="600">Investigator</text>
            <text x="90" y="66" textAnchor="middle" fill="#737373" fontSize="8">SPA Client</text>

            <line x1="140" y1="55" x2="220" y2="55" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrowAmber)" />

            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="74" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">CloudFront</text>
            <text x="250" y="86" textAnchor="middle" fill="#737373" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="55" x2="370" y2="55" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrowAmber)" />
            <text x="325" y="48" textAnchor="middle" fill="#A3A3A3" fontSize="7">OAC</text>

            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="74" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">S3</text>
            <text x="400" y="86" textAnchor="middle" fill="#737373" fontSize="8">Static UI Assets</text>

            {/* CloudFront -> API Gateway (down to row 2) */}
            <line x1="250" y1="90" x2="250" y2="130" stroke="#D97706" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#D97706" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrowAmber)" />
            <text x="175" y="126" textAnchor="middle" fill="#A3A3A3" fontSize="7">/api/* routing</text>

            {/* ── Row 2: API Gateway -> Lambda Proxy -> Lambda Worker <-> DynamoDB ── */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
            <text x="100" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">API Gateway</text>
            <text x="100" y="226" textAnchor="middle" fill="#737373" fontSize="8">HTTP API</text>

            <line x1="130" y1="180" x2="230" y2="180" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrowAmber)" />

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
            <text x="260" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Lambda Proxy</text>
            <text x="260" y="226" textAnchor="middle" fill="#737373" fontSize="8">30s timeout</text>
            <text x="260" y="237" textAnchor="middle" fill="#A3A3A3" fontSize="7">POST /invoke, GET /status</text>

            <line x1="290" y1="180" x2="400" y2="180" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrowAmber)" />
            <text x="345" y="174" textAnchor="middle" fill="#A3A3A3" fontSize="7">async</text>

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
            <text x="430" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Lambda Worker</text>
            <text x="430" y="226" textAnchor="middle" fill="#737373" fontSize="8">300s timeout</text>

            <line x1="460" y1="180" x2="560" y2="180" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrowAmber)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrowAmber)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#737373" fontSize="8">Session State + TTL</text>

            {/* ── Row 3: AgentCore Runtime -> Agents -> Bedrock ── */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#D97706" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#D97706" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrowAmber)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#737373" fontSize="8">Bedrock Managed Container</text>

            <line x1="200" y1="340" x2="310" y2="340" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrowAmber)" />

            {/* Agent boxes */}
            <rect x="320" y="305" width="120" height="32" rx="6" fill="#FFFBEB" stroke="#D97706" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#D97706" fontSize="9" fontWeight="600">Evidence Gatherer</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="#F0FDFA" stroke="#0D9488" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#0D9488" fontSize="9" fontWeight="600">Pattern Matcher</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="#F1F5F9" stroke="#1E293B" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#1E293B" fontSize="9" fontWeight="600">Regulatory Mapper</text>

            <line x1="440" y1="360" x2="540" y2="360" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrowAmber)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#737373" fontSize="8">Claude Sonnet (LLM)</text>

            {/* ECR -> AgentCore */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#737373" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrowAmber)" />

            {/* Monitoring sidebar */}
            <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="802" y="162" width="36" height="36" />
            <text x="820" y="214" textAnchor="middle" fill="#1F2937" fontSize="9" fontWeight="600">CloudWatch</text>

            <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="882" y="162" width="36" height="36" />
            <text x="900" y="214" textAnchor="middle" fill="#1F2937" fontSize="9" fontWeight="600">X-Ray</text>

            <line x1="790" y1="180" x2="628" y2="180" stroke="#D4D4D4" strokeWidth="1" strokeDasharray="4,3" />
            <text x="710" y="174" textAnchor="middle" fill="#A3A3A3" fontSize="7">Observability</text>
          </svg>
        </div>
      </section>

      {/* ── Agent Cards ── */}
      <section className="animate-fadeSlideUp stagger-5">
        <h2 className="text-2xl font-extrabold text-center mb-8" style={{ color: 'var(--slate-900)' }}>
          AI Investigation Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.agents.map((agent, i) => {
            const colors = [
              { bg: '#FFFBEB', border: '#D97706', text: '#D97706', accent: '#FFFBEB' },
              { bg: '#F0FDFA', border: '#0D9488', text: '#0D9488', accent: '#F0FDFA' },
              { bg: '#F1F5F9', border: '#1E293B', text: '#1E293B', accent: '#F1F5F9' },
            ][i];
            const icons = [
              'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
              'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
              'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
            ][i];
            return (
              <div key={agent.id} className="card"
                style={{ borderTop: `3px solid ${colors.border}` }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: colors.accent }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={icons} />
                    </svg>
                  </div>
                  <h3 className="text-sm font-bold" style={{ color: colors.text }}>{agent.name}</h3>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{agent.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="text-center animate-fadeSlideUp stagger-6 pb-8">
        <div className="card max-w-lg mx-auto" style={{ background: 'linear-gradient(135deg, #FFFBEB, #F0FDFA)' }}>
          <h3 className="text-xl font-extrabold mb-2" style={{ color: 'var(--slate-900)' }}>Launch Investigation</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            Start a compliance investigation with test entity <code className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'white', color: '#D97706', border: '1px solid #FEF3C7' }}>INV001</code>
          </p>
          <Link to="/console"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold text-white transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Begin Investigation
          </Link>
        </div>
      </section>
    </div>
  );
}
