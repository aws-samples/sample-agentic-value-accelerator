import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Sample portfolio metrics for the dashboard feed ── */
const sampleMetrics = [
  { headline: 'US Large Cap allocation drifted +2.3% above target', status: 'warning', asset: 'Equities', time: '1h ago', drift: 2.3 },
  { headline: 'Fixed Income rebalance restored to 98.7% target', status: 'optimal', asset: 'Bonds', time: '3h ago', drift: 0.4 },
  { headline: 'Emerging Markets underweight triggers review flag', status: 'critical', asset: 'EM Equity', time: '5h ago', drift: 4.1 },
  { headline: 'Alternative assets within tolerance at 0.8% drift', status: 'optimal', asset: 'Alts', time: '6h ago', drift: 0.8 },
];

const stats = [
  { value: '3', label: 'AI Agents', icon: 'agents' },
  { value: '4', label: 'Assessment Modes', icon: 'modes' },
  { value: '12+', label: 'Asset Classes', icon: 'classes' },
];

const pipelineStages = [
  {
    title: 'Optimize Allocation',
    desc: 'AI evaluates risk-adjusted returns and generates optimized allocation strategies',
    color: '#0D9488',
    iconPath: 'M3 3v18h18M7 14l4-4 4 4 4-8',
  },
  {
    title: 'Rebalance Portfolio',
    desc: 'Monitor drift thresholds and produce trade recommendations to restore targets',
    color: '#7C3AED',
    iconPath: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  },
  {
    title: 'Attribute Performance',
    desc: 'Decompose returns into selection, allocation, currency, and timing factors',
    color: '#F59E0B',
    iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
];

export default function Home({ config }: Props) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-16">

      {/* ── Hero ── */}
      <section className="text-center animate-fadeSlideUp">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
          style={{ background: 'var(--teal-50)', color: 'var(--teal-700)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <rect x="7" y="10" width="3" height="8" rx="1" />
            <rect x="12" y="6" width="3" height="12" rx="1" />
            <rect x="17" y="3" width="3" height="15" rx="1" />
          </svg>
          AI-Powered Investment Intelligence
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 heading-dash" style={{ color: 'var(--charcoal)' }}>
          Investment Management
          <span className="block" style={{ color: 'var(--teal-600)' }}>Portfolio Dashboard</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>
          {config.description}. Optimize allocations, automate rebalancing decisions,
          and gain deep performance attribution insights.
        </p>

        {/* ── Portfolio metrics feed preview ── */}
        <div className="relative max-w-3xl mx-auto mb-12 overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--slate-200)', background: 'white' }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'var(--slate-100)', background: 'var(--slate-900)' }}>
            <div className="portfolio-pulse optimal" />
            <span className="text-xs font-bold" style={{ color: 'var(--teal-400)' }}>PORTFOLIO MONITORING FEED</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--slate-200)' }}>
            {sampleMetrics.map((metric, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-fadeSlideUp"
                style={{ animationDelay: `${i * 0.15}s` }}>
                <div className={`portfolio-pulse ${metric.status}`} />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{metric.headline}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="asset-tag">{metric.asset}</span>
                    <span className="factor-tag">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                      {metric.drift}% drift
                    </span>
                  </div>
                </div>
                <span className={`urgency-badge ${metric.status === 'optimal' ? 'low' : metric.status === 'warning' ? 'medium' : 'high'}`}>
                  {metric.status === 'optimal' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {metric.status === 'warning' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                  )}
                  {metric.status === 'critical' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  )}
                  {metric.status}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{metric.time}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="grid grid-cols-3 gap-6 max-w-2xl mx-auto animate-fadeSlideUp stagger-1">
        {stats.map((s) => (
          <div key={s.label} className="card text-center">
            <div className="text-3xl font-extrabold mb-1" style={{ color: 'var(--teal-600)' }}>{s.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Pipeline Visualization ── */}
      <section className="animate-fadeSlideUp stagger-2">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-dash" style={{ color: 'var(--charcoal)' }}>
          Assessment Pipeline
        </h2>
        <div className="flex items-center justify-center gap-4">
          {pipelineStages.map((stage, i) => (
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
              {i < pipelineStages.length - 1 && (
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                  <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="var(--teal-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Portfolio Domains Showcase ── */}
      <section className="animate-fadeSlideUp stagger-3">
        <h2 className="text-2xl font-extrabold text-center mb-2 heading-dash" style={{ color: 'var(--charcoal)' }}>
          Management Capabilities
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          AI-driven portfolio intelligence across key investment dimensions
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { name: 'Asset Allocation', level: 'high', icon: 'M3 3v18h18M7 14l4-4 4 4 4-8', desc: 'Multi-asset class allocation optimization with risk parity, mean-variance, and factor-based strategies' },
            { name: 'Drift Monitoring', level: 'medium', icon: 'M22 12h-4l-3 9L9 3l-3 9H2', desc: 'Real-time portfolio drift detection with configurable thresholds and automatic rebalance triggers' },
            { name: 'Performance Attribution', level: 'medium', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14', desc: 'Brinson-style return decomposition across selection, allocation, interaction, and currency effects' },
            { name: 'Trade Execution', level: 'low', icon: 'M8 7h12l-2 13H6L4 7h2m0 0L5 3H2m6 4v10m4-10v10m4-10v10', desc: 'Optimal trade list generation with transaction cost analysis and tax-loss harvesting opportunities' },
          ].map((cat) => (
            <div key={cat.name} className={`recommendation-card ${cat.level}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: cat.level === 'high' ? 'var(--teal-50)' : cat.level === 'medium' ? 'var(--amber-50)' : 'var(--slate-100)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke={cat.level === 'high' ? 'var(--teal-600)' : cat.level === 'medium' ? '#F59E0B' : 'var(--slate-500)'}
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

      {/* ── Architecture Diagram (SVG with Teal arrows) ── */}
      <section className="animate-fadeSlideUp stagger-4">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-dash" style={{ color: 'var(--charcoal)' }}>
          Platform Architecture
        </h2>
        <div className="card p-8 max-w-4xl mx-auto">
          <svg viewBox="0 0 960 520" fill="none" className="w-full">
            <defs>
              <marker id="arrowTeal" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill="#0D9488" />
              </marker>
            </defs>

            {/* ── Row 1: User -> CloudFront -> S3 ── */}
            <rect x="40" y="20" width="100" height="70" rx="10" fill="#F0FDFA" stroke="#0D9488" strokeWidth="1.5" />
            <text x="90" y="50" textAnchor="middle" fill="#0D9488" fontSize="11" fontWeight="600">User Browser</text>
            <text x="90" y="66" textAnchor="middle" fill="#64748B" fontSize="8">SPA Client</text>

            <line x1="140" y1="55" x2="220" y2="55" stroke="#0D9488" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />

            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="74" textAnchor="middle" fill="#0F172A" fontSize="10" fontWeight="600">CloudFront</text>
            <text x="250" y="86" textAnchor="middle" fill="#64748B" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="55" x2="370" y2="55" stroke="#0D9488" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />
            <text x="325" y="48" textAnchor="middle" fill="#94A3B8" fontSize="7">OAC</text>

            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="74" textAnchor="middle" fill="#0F172A" fontSize="10" fontWeight="600">S3</text>
            <text x="400" y="86" textAnchor="middle" fill="#64748B" fontSize="8">Static UI Assets</text>

            {/* CloudFront -> API Gateway (down to row 2) */}
            <line x1="250" y1="90" x2="250" y2="130" stroke="#0D9488" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#0D9488" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#0D9488" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />
            <text x="175" y="126" textAnchor="middle" fill="#94A3B8" fontSize="7">/api/* routing</text>

            {/* ── Row 2: API Gateway -> Lambda Proxy -> Lambda Worker <-> DynamoDB ── */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
            <text x="100" y="214" textAnchor="middle" fill="#0F172A" fontSize="10" fontWeight="600">API Gateway</text>
            <text x="100" y="226" textAnchor="middle" fill="#64748B" fontSize="8">HTTP API</text>

            <line x1="130" y1="180" x2="230" y2="180" stroke="#0D9488" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
            <text x="260" y="214" textAnchor="middle" fill="#0F172A" fontSize="10" fontWeight="600">Lambda Proxy</text>
            <text x="260" y="226" textAnchor="middle" fill="#64748B" fontSize="8">30s timeout</text>
            <text x="260" y="237" textAnchor="middle" fill="#94A3B8" fontSize="7">POST /invoke, GET /status</text>

            <line x1="290" y1="180" x2="400" y2="180" stroke="#0D9488" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />
            <text x="345" y="174" textAnchor="middle" fill="#94A3B8" fontSize="7">async</text>

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
            <text x="430" y="214" textAnchor="middle" fill="#0F172A" fontSize="10" fontWeight="600">Lambda Worker</text>
            <text x="430" y="226" textAnchor="middle" fill="#64748B" fontSize="8">300s timeout</text>

            <line x1="460" y1="180" x2="560" y2="180" stroke="#0D9488" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#0D9488" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#0F172A" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#64748B" fontSize="8">Session State + TTL</text>

            {/* ── Row 3: AgentCore Runtime -> Agents -> Bedrock, ECR connected ── */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#0D9488" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#0D9488" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#0D9488" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#0F172A" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#64748B" fontSize="8">Bedrock Managed Container</text>

            <line x1="200" y1="340" x2="310" y2="340" stroke="#0D9488" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />

            {/* Agent boxes - Teal, Violet, Amber */}
            <rect x="320" y="305" width="120" height="32" rx="6" fill="#F0FDFA" stroke="#0D9488" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#0D9488" fontSize="9" fontWeight="600">Allocation Optimizer</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="#F5F3FF" stroke="#7C3AED" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#7C3AED" fontSize="9" fontWeight="600">Rebalancing Agent</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="#FFFBEB" stroke="#F59E0B" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#D97706" fontSize="9" fontWeight="600">Perf. Attributor</text>

            <line x1="440" y1="360" x2="540" y2="360" stroke="#0D9488" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#0F172A" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#64748B" fontSize="8">Claude Sonnet (LLM)</text>

            {/* ECR -> AgentCore */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#0F172A" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#64748B" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#0D9488" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />

            {/* Monitoring sidebar */}
            <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="802" y="162" width="36" height="36" />
            <text x="820" y="214" textAnchor="middle" fill="#0F172A" fontSize="9" fontWeight="600">CloudWatch</text>

            <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="882" y="162" width="36" height="36" />
            <text x="900" y="214" textAnchor="middle" fill="#0F172A" fontSize="9" fontWeight="600">X-Ray</text>

            <line x1="790" y1="180" x2="628" y2="180" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="4,3" />
            <text x="710" y="174" textAnchor="middle" fill="#94A3B8" fontSize="7">Observability</text>
          </svg>
        </div>
      </section>

      {/* ── Agent Cards ── */}
      <section className="animate-fadeSlideUp stagger-5">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-dash" style={{ color: 'var(--charcoal)' }}>
          AI Investment Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.agents.map((agent, i) => {
            const colors = [
              { bg: '#F0FDFA', border: '#0D9488', text: '#0D9488', accent: '#F0FDFA' },
              { bg: '#F5F3FF', border: '#7C3AED', text: '#7C3AED', accent: '#F5F3FF' },
              { bg: '#FFFBEB', border: '#F59E0B', text: '#D97706', accent: '#FFFBEB' },
            ][i];
            const icons = [
              'M3 3v18h18M7 14l4-4 4 4 4-8',
              'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
              'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
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
        <div className="card max-w-lg mx-auto" style={{ background: 'linear-gradient(135deg, #F0FDFA, #F5F3FF)' }}>
          <h3 className="text-xl font-extrabold mb-2 heading-dash" style={{ color: 'var(--charcoal)' }}>Ready to optimize?</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            Try the assessment engine with test entity <code className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'white', color: 'var(--teal-600)' }}>MGT001</code>
          </p>
          <Link to="/console"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #0D9488, #14B8A6)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <rect x="7" y="10" width="3" height="8" rx="1" />
              <rect x="12" y="6" width="3" height="12" rx="1" />
              <rect x="17" y="3" width="3" height="15" rx="1" />
            </svg>
            Run Assessment
          </Link>
        </div>
      </section>
    </div>
  );
}
