import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Sample research briefs for the feed ── */
const sampleBriefs = [
  { headline: 'GDP Growth Exceeds Expectations at 3.2% Annualized', source: 'BEA', trend: 'up', time: '2h ago', indicator: 'GDP' },
  { headline: 'CPI Inflation Moderates to 2.4% Year-over-Year', source: 'BLS', trend: 'down', time: '4h ago', indicator: 'CPI' },
  { headline: 'Unemployment Holds Steady at 3.8% for Third Month', source: 'Fed Reserve', trend: 'stable', time: '6h ago', indicator: 'Employment' },
  { headline: 'Treasury Yield Curve Shows Renewed Steepening Signal', source: 'Treasury Dept', trend: 'up', time: '8h ago', indicator: 'Yields' },
];

const stats = [
  { value: '3', label: 'AI Agents', icon: 'agents' },
  { value: '5', label: 'Research Modes', icon: 'modes' },
  { value: '150+', label: 'Data Sources', icon: 'sources' },
];

const researchStages = [
  {
    title: 'Aggregate Data',
    desc: 'AI collects and normalizes economic indicators from global data sources',
    color: '#1E3A5F',
    iconPath: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
  },
  {
    title: 'Analyze Trends',
    desc: 'Statistical modeling identifies trends, correlations, and anomalies',
    color: '#C2410C',
    iconPath: 'M3 3v18h18M7 16l4-8 4 4 4-12',
  },
  {
    title: 'Generate Report',
    desc: 'Research-grade narrative with forecasts and actionable recommendations',
    color: '#4D7C0F',
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
];

export default function Home({ config }: Props) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-16">

      {/* ── Hero ── */}
      <section className="text-center animate-fadeSlideUp">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
          style={{ background: 'var(--navy-50)', color: 'var(--navy-800)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="M7 16l4-8 4 4 4-12" />
          </svg>
          AI-Powered Economic Intelligence
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 heading-serif" style={{ color: 'var(--charcoal)' }}>
          Economic Research
          <span className="block" style={{ color: 'var(--navy-800)' }}>Publication Platform</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>
          {config.description}. Aggregate data, analyze trends, and generate
          research-grade economic reports with AI-driven insights.
        </p>

        {/* ── Research feed preview ── */}
        <div className="relative max-w-3xl mx-auto mb-12 overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--navy-100)', background: 'white' }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'var(--navy-50)', background: 'var(--navy-50)' }}>
            <div className="research-pulse up" />
            <span className="text-xs font-bold" style={{ color: 'var(--navy-800)' }}>ECONOMIC RESEARCH FEED</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--stone-200)' }}>
            {sampleBriefs.map((brief, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-fadeSlideUp"
                style={{ animationDelay: `${i * 0.15}s` }}>
                <div className={`research-pulse ${brief.trend}`} />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{brief.headline}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="source-tag">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7" />
                      </svg>
                      {brief.source}
                    </span>
                    <span className="indicator-tag">{brief.indicator}</span>
                  </div>
                </div>
                <span className={`trend-badge ${brief.trend}`}>
                  {brief.trend === 'up' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                    </svg>
                  )}
                  {brief.trend === 'down' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                    </svg>
                  )}
                  {brief.trend === 'stable' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  )}
                  {brief.trend}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{brief.time}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="grid grid-cols-3 gap-6 max-w-2xl mx-auto animate-fadeSlideUp stagger-1">
        {stats.map((s) => (
          <div key={s.label} className="card text-center">
            <div className="text-3xl font-extrabold mb-1" style={{ color: 'var(--navy-800)' }}>{s.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Research Pipeline Visualization ── */}
      <section className="animate-fadeSlideUp stagger-2">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-serif" style={{ color: 'var(--charcoal)' }}>
          Research Pipeline
        </h2>
        <div className="flex items-center justify-center gap-4">
          {researchStages.map((stage, i) => (
            <div key={stage.title} className="flex items-center gap-4">
              <div className="card text-center px-8 py-6 flex flex-col items-center"
                style={{ borderTop: `3px solid ${stage.color}`, minWidth: '200px' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: `${stage.color}15` }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={stage.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={stage.iconPath} />
                  </svg>
                </div>
                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--charcoal)' }}>{stage.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{stage.desc}</p>
              </div>
              {i < researchStages.length - 1 && (
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                  <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="var(--navy-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Research Domains Showcase ── */}
      <section className="animate-fadeSlideUp stagger-3">
        <h2 className="text-2xl font-extrabold text-center mb-2 heading-serif" style={{ color: 'var(--charcoal)' }}>
          Research Domains
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          AI-generated economic intelligence across key domains
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { name: 'Macroeconomic Indicators', level: 'high', icon: 'M3 3v18h18M7 16l4-8 4 4 4-12', desc: 'GDP, inflation, employment, and productivity metrics with historical trend analysis' },
            { name: 'Monetary Policy', level: 'medium', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'Central bank policy analysis, rate decisions, and quantitative easing impact assessments' },
            { name: 'Trade & Markets', level: 'medium', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'International trade flows, market correlations, and sector-specific performance analysis' },
            { name: 'Fiscal & Regulatory', level: 'low', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', desc: 'Government spending analysis, tax policy impacts, and regulatory environment monitoring' },
          ].map((cat) => (
            <div key={cat.name} className={`recommendation-card ${cat.level}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: cat.level === 'high' ? 'var(--sage-50)' : cat.level === 'medium' ? 'var(--amber-50)' : 'var(--stone-100)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke={cat.level === 'high' ? 'var(--sage)' : cat.level === 'medium' ? '#F59E0B' : 'var(--stone)'}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={cat.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{cat.name}</h3>
                  <span className={`confidence-badge ${cat.level}`}>{cat.level} coverage</span>
                </div>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{cat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Architecture Diagram (SVG) ── */}
      <section className="animate-fadeSlideUp stagger-4">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-serif" style={{ color: 'var(--charcoal)' }}>
          Platform Architecture
        </h2>
        <div className="card p-8 max-w-4xl mx-auto">
          <svg viewBox="0 0 960 520" fill="none" className="w-full">
            <defs>
              <marker id="arrowNavy" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill="#1E3A5F" />
              </marker>
            </defs>

            {/* ── Row 1: User -> CloudFront -> S3 ── */}
            <rect x="40" y="20" width="100" height="70" rx="10" fill="#EDF2F8" stroke="#1E3A5F" strokeWidth="1.5" />
            <text x="90" y="50" textAnchor="middle" fill="#1E3A5F" fontSize="11" fontWeight="600">User Browser</text>
            <text x="90" y="66" textAnchor="middle" fill="#78716C" fontSize="8">SPA Client</text>

            <line x1="140" y1="55" x2="220" y2="55" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowNavy)" />

            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="74" textAnchor="middle" fill="#1C1917" fontSize="10" fontWeight="600">CloudFront</text>
            <text x="250" y="86" textAnchor="middle" fill="#78716C" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="55" x2="370" y2="55" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowNavy)" />
            <text x="325" y="48" textAnchor="middle" fill="#A8A29E" fontSize="7">OAC</text>

            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="74" textAnchor="middle" fill="#1C1917" fontSize="10" fontWeight="600">S3</text>
            <text x="400" y="86" textAnchor="middle" fill="#78716C" fontSize="8">Static UI Assets</text>

            {/* CloudFront -> API Gateway (down to row 2) */}
            <line x1="250" y1="90" x2="250" y2="130" stroke="#1E3A5F" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#1E3A5F" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowNavy)" />
            <text x="175" y="126" textAnchor="middle" fill="#A8A29E" fontSize="7">/api/* routing</text>

            {/* ── Row 2: API Gateway -> Lambda Proxy -> Lambda Worker <-> DynamoDB ── */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
            <text x="100" y="214" textAnchor="middle" fill="#1C1917" fontSize="10" fontWeight="600">API Gateway</text>
            <text x="100" y="226" textAnchor="middle" fill="#78716C" fontSize="8">HTTP API</text>

            <line x1="130" y1="180" x2="230" y2="180" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowNavy)" />

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
            <text x="260" y="214" textAnchor="middle" fill="#1C1917" fontSize="10" fontWeight="600">Lambda Proxy</text>
            <text x="260" y="226" textAnchor="middle" fill="#78716C" fontSize="8">30s timeout</text>
            <text x="260" y="237" textAnchor="middle" fill="#A8A29E" fontSize="7">POST /invoke, GET /status</text>

            <line x1="290" y1="180" x2="400" y2="180" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowNavy)" />
            <text x="345" y="174" textAnchor="middle" fill="#A8A29E" fontSize="7">async</text>

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
            <text x="430" y="214" textAnchor="middle" fill="#1C1917" fontSize="10" fontWeight="600">Lambda Worker</text>
            <text x="430" y="226" textAnchor="middle" fill="#78716C" fontSize="8">300s timeout</text>

            <line x1="460" y1="180" x2="560" y2="180" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowNavy)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowNavy)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#1C1917" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#78716C" fontSize="8">Session State + TTL</text>

            {/* ── Row 3: AgentCore Runtime -> Agents -> Bedrock, ECR connected ── */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#1E3A5F" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#1E3A5F" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowNavy)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#1C1917" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#78716C" fontSize="8">Bedrock Managed Container</text>

            <line x1="200" y1="340" x2="310" y2="340" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowNavy)" />

            {/* Agent boxes - Navy, Terracotta, Sage */}
            <rect x="320" y="305" width="120" height="32" rx="6" fill="#EDF2F8" stroke="#1E3A5F" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#1E3A5F" fontSize="9" fontWeight="600">Data Aggregator</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="#FFF4ED" stroke="#C2410C" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#C2410C" fontSize="9" fontWeight="600">Trend Analyst</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="#F3F9EC" stroke="#4D7C0F" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#4D7C0F" fontSize="9" fontWeight="600">Research Writer</text>

            <line x1="440" y1="360" x2="540" y2="360" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowNavy)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#1C1917" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#78716C" fontSize="8">Claude Sonnet (LLM)</text>

            {/* ECR -> AgentCore */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#1C1917" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#78716C" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowNavy)" />

            {/* Monitoring sidebar */}
            <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="802" y="162" width="36" height="36" />
            <text x="820" y="214" textAnchor="middle" fill="#1C1917" fontSize="9" fontWeight="600">CloudWatch</text>

            <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="882" y="162" width="36" height="36" />
            <text x="900" y="214" textAnchor="middle" fill="#1C1917" fontSize="9" fontWeight="600">X-Ray</text>

            <line x1="790" y1="180" x2="628" y2="180" stroke="#D6D3D1" strokeWidth="1" strokeDasharray="4,3" />
            <text x="710" y="174" textAnchor="middle" fill="#A8A29E" fontSize="7">Observability</text>
          </svg>
        </div>
      </section>

      {/* ── Agent Cards ── */}
      <section className="animate-fadeSlideUp stagger-5">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-serif" style={{ color: 'var(--charcoal)' }}>
          AI Research Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.agents.map((agent, i) => {
            const colors = [
              { bg: '#EDF2F8', border: '#1E3A5F', text: '#1E3A5F', accent: '#EDF2F8' },
              { bg: '#FFF4ED', border: '#C2410C', text: '#C2410C', accent: '#FFF4ED' },
              { bg: '#F3F9EC', border: '#4D7C0F', text: '#4D7C0F', accent: '#F3F9EC' },
            ][i];
            const icons = [
              'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
              'M3 3v18h18M7 16l4-8 4 4 4-12',
              'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
            ][i];
            return (
              <div key={agent.id} className="card"
                style={{ borderTop: `3px solid ${colors.border}` }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
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
        <div className="card max-w-lg mx-auto" style={{ background: 'linear-gradient(135deg, #EDF2F8, #FFF4ED)' }}>
          <h3 className="text-xl font-extrabold mb-2 heading-serif" style={{ color: 'var(--charcoal)' }}>Ready to research?</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            Try the research engine with test entity <code className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'white', color: 'var(--navy-800)' }}>ECO001</code>
          </p>
          <Link to="/console"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #0F2440, #1E3A5F)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M7 16l4-8 4 4 4-12" />
            </svg>
            Run Analysis
          </Link>
        </div>
      </section>
    </div>
  );
}
