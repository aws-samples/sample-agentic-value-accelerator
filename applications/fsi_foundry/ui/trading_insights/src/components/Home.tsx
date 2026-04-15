import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Sample signal feed for dashboard preview ── */
const sampleSignals = [
  { headline: 'RSI divergence detected on S&P 500 — bullish reversal signal', status: 'bullish', asset: 'Equities', time: '2m ago', strength: 0.87 },
  { headline: 'EUR/USD breaking below 200-day MA with volume confirmation', status: 'bearish', asset: 'FX', time: '8m ago', strength: 0.72 },
  { headline: 'Gold-silver ratio at 3-year extreme — mean reversion opportunity', status: 'bullish', asset: 'Commodities', time: '15m ago', strength: 0.65 },
  { headline: 'Treasury yield curve steepening — regime shift underway', status: 'neutral', asset: 'Fixed Income', time: '23m ago', strength: 0.54 },
];

const stats = [
  { value: '3', label: 'AI Agents', icon: 'agents' },
  { value: '4', label: 'Analysis Modes', icon: 'modes' },
  { value: '50+', label: 'Signal Types', icon: 'signals' },
];

const pipelineStages = [
  {
    title: 'Generate Signals',
    desc: 'AI scans market data streams and detects technical and fundamental trading signals in real time',
    color: '#06B6D4',
    iconPath: 'M22 12h-4l-3 9L9 3l-3 9H2',
  },
  {
    title: 'Cross-Asset Analysis',
    desc: 'Identify correlations, divergences, and arbitrage across equities, bonds, commodities, and FX',
    color: '#D946EF',
    iconPath: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  },
  {
    title: 'Model Scenarios',
    desc: 'Construct probabilistic outcomes using Monte Carlo, stress testing, and macro regime analysis',
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
          style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--cyan-400)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          AI-Powered Trading Intelligence
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 heading-dash text-white">
          Trading Insights
          <span className="block" style={{ color: 'var(--cyan-400)' }}>Signal Dashboard</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>
          {config.description}. Detect signals, analyze cross-asset opportunities,
          and model probabilistic scenarios with AI precision.
        </p>

        {/* ── Signal feed preview ── */}
        <div className="relative max-w-3xl mx-auto mb-12 overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--dark-600)', background: 'var(--dark-800)' }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'var(--dark-600)', background: 'var(--dark-900)' }}>
            <div className="signal-pulse active" />
            <span className="text-xs font-bold" style={{ color: 'var(--cyan-400)' }}>LIVE SIGNAL FEED</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--dark-600)' }}>
            {sampleSignals.map((signal, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-fadeSlideUp"
                style={{ animationDelay: `${i * 0.15}s` }}>
                <div className={`signal-pulse ${signal.status}`} />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-white">{signal.headline}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="asset-tag">{signal.asset}</span>
                    <span className="factor-tag">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                      {Math.round(signal.strength * 100)}% strength
                    </span>
                  </div>
                </div>
                <span className={`signal-badge ${signal.status}`}>
                  {signal.status === 'bullish' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                    </svg>
                  )}
                  {signal.status === 'bearish' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                    </svg>
                  )}
                  {signal.status === 'neutral' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  )}
                  {signal.status}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{signal.time}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="grid grid-cols-3 gap-6 max-w-2xl mx-auto animate-fadeSlideUp stagger-1">
        {stats.map((s) => (
          <div key={s.label} className="card text-center">
            <div className="text-3xl font-extrabold mb-1" style={{ color: 'var(--cyan-400)' }}>{s.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Pipeline Visualization ── */}
      <section className="animate-fadeSlideUp stagger-2">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-dash text-white">
          Analysis Pipeline
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
                <h3 className="text-sm font-bold mb-1 text-white">{stage.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{stage.desc}</p>
              </div>
              {i < pipelineStages.length - 1 && (
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                  <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="#06B6D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Capabilities Showcase ── */}
      <section className="animate-fadeSlideUp stagger-3">
        <h2 className="text-2xl font-extrabold text-center mb-2 heading-dash text-white">
          Intelligence Capabilities
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          AI-driven trading intelligence across market dimensions
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { name: 'Signal Detection', level: 'high', icon: 'M22 12h-4l-3 9L9 3l-3 9H2', desc: 'Real-time detection of technical patterns, momentum shifts, mean reversion setups, and fundamental catalysts across all asset classes' },
            { name: 'Cross-Asset Mapping', level: 'medium', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', desc: 'Multi-asset correlation analysis identifying divergences, regime changes, and relative value opportunities' },
            { name: 'Scenario Modeling', level: 'medium', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14', desc: 'Monte Carlo simulation with stress testing, tail risk analysis, and probabilistic outcome distributions' },
            { name: 'Conviction Scoring', level: 'low', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'AI confidence scoring combining signal strength, scenario likelihood, and cross-asset confirmation into actionable ratings' },
          ].map((cat) => (
            <div key={cat.name} className={`recommendation-card ${cat.level}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: cat.level === 'high' ? 'rgba(6,182,212,0.12)' : cat.level === 'medium' ? 'rgba(245,158,11,0.12)' : 'var(--dark-700)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke={cat.level === 'high' ? '#06B6D4' : cat.level === 'medium' ? '#F59E0B' : '#737373'}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={cat.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{cat.name}</h3>
                  <span className={`confidence-badge ${cat.level}`}>{cat.level} coverage</span>
                </div>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{cat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Architecture Diagram (SVG with Cyan arrows) ── */}
      <section className="animate-fadeSlideUp stagger-4">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-dash text-white">
          Platform Architecture
        </h2>
        <div className="card p-8 max-w-4xl mx-auto">
          <svg viewBox="0 0 960 520" fill="none" className="w-full">
            <defs>
              <marker id="arrowCyan" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill="#06B6D4" />
              </marker>
            </defs>

            {/* ── Row 1: User -> CloudFront -> S3 ── */}
            <rect x="40" y="20" width="100" height="70" rx="10" fill="rgba(6,182,212,0.08)" stroke="#06B6D4" strokeWidth="1.5" />
            <text x="90" y="50" textAnchor="middle" fill="#06B6D4" fontSize="11" fontWeight="600">User Browser</text>
            <text x="90" y="66" textAnchor="middle" fill="#737373" fontSize="8">SPA Client</text>

            <line x1="140" y1="55" x2="220" y2="55" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="74" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="600">CloudFront</text>
            <text x="250" y="86" textAnchor="middle" fill="#737373" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="55" x2="370" y2="55" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />
            <text x="325" y="48" textAnchor="middle" fill="#525252" fontSize="7">OAC</text>

            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="74" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="600">S3</text>
            <text x="400" y="86" textAnchor="middle" fill="#737373" fontSize="8">Static UI Assets</text>

            {/* CloudFront -> API Gateway (down to row 2) */}
            <line x1="250" y1="90" x2="250" y2="130" stroke="#06B6D4" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#06B6D4" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />
            <text x="175" y="126" textAnchor="middle" fill="#525252" fontSize="7">/api/* routing</text>

            {/* ── Row 2: API Gateway -> Lambda Proxy -> Lambda Worker <-> DynamoDB ── */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
            <text x="100" y="214" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="600">API Gateway</text>
            <text x="100" y="226" textAnchor="middle" fill="#737373" fontSize="8">HTTP API</text>

            <line x1="130" y1="180" x2="230" y2="180" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
            <text x="260" y="214" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="600">Lambda Proxy</text>
            <text x="260" y="226" textAnchor="middle" fill="#737373" fontSize="8">30s timeout</text>
            <text x="260" y="237" textAnchor="middle" fill="#525252" fontSize="7">POST /invoke, GET /status</text>

            <line x1="290" y1="180" x2="400" y2="180" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />
            <text x="345" y="174" textAnchor="middle" fill="#525252" fontSize="7">async</text>

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
            <text x="430" y="214" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="600">Lambda Worker</text>
            <text x="430" y="226" textAnchor="middle" fill="#737373" fontSize="8">300s timeout</text>

            <line x1="460" y1="180" x2="560" y2="180" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#737373" fontSize="8">Session State + TTL</text>

            {/* ── Row 3: AgentCore Runtime -> Agents -> Bedrock, ECR connected ── */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#06B6D4" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#06B6D4" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#737373" fontSize="8">Bedrock Managed Container</text>

            <line x1="200" y1="340" x2="310" y2="340" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            {/* Agent boxes - Cyan, Magenta, Amber */}
            <rect x="320" y="305" width="120" height="32" rx="6" fill="rgba(6,182,212,0.08)" stroke="#06B6D4" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#06B6D4" fontSize="9" fontWeight="600">Signal Generator</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="rgba(217,70,239,0.08)" stroke="#D946EF" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#D946EF" fontSize="9" fontWeight="600">Cross Asset Analyst</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="rgba(245,158,11,0.08)" stroke="#F59E0B" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#D97706" fontSize="9" fontWeight="600">Scenario Modeler</text>

            <line x1="440" y1="360" x2="540" y2="360" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#737373" fontSize="8">Claude Sonnet (LLM)</text>

            {/* ECR -> AgentCore */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#737373" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            {/* Monitoring sidebar */}
            <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="802" y="162" width="36" height="36" />
            <text x="820" y="214" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="600">CloudWatch</text>

            <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="882" y="162" width="36" height="36" />
            <text x="900" y="214" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="600">X-Ray</text>

            <line x1="790" y1="180" x2="628" y2="180" stroke="#525252" strokeWidth="1" strokeDasharray="4,3" />
            <text x="710" y="174" textAnchor="middle" fill="#525252" fontSize="7">Observability</text>
          </svg>
        </div>
      </section>

      {/* ── Agent Cards ── */}
      <section className="animate-fadeSlideUp stagger-5">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-dash text-white">
          AI Trading Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.agents.map((agent, i) => {
            const colors = [
              { bg: 'rgba(6,182,212,0.08)', border: '#06B6D4', text: '#06B6D4', accent: 'rgba(6,182,212,0.12)' },
              { bg: 'rgba(217,70,239,0.08)', border: '#D946EF', text: '#D946EF', accent: 'rgba(217,70,239,0.12)' },
              { bg: 'rgba(245,158,11,0.08)', border: '#F59E0B', text: '#D97706', accent: 'rgba(245,158,11,0.12)' },
            ][i];
            const icons = [
              'M22 12h-4l-3 9L9 3l-3 9H2',
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
        <div className="card max-w-lg mx-auto" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(217,70,239,0.08))' }}>
          <h3 className="text-xl font-extrabold mb-2 heading-dash text-white">Ready to analyze?</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            Try the signal engine with test entity <code className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'var(--dark-700)', color: 'var(--cyan-400)' }}>SIG001</code>
          </p>
          <Link to="/console"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #06B6D4, #0891B2)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Run Analysis
          </Link>
        </div>
      </section>
    </div>
  );
}
