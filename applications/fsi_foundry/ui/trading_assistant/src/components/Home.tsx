import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Sample market signals for the feed ── */
const sampleSignals = [
  { headline: 'S&P 500 breaks above 200-day MA with volume confirmation', source: 'Price Action', condition: 'bullish', time: '2m ago', instrument: 'ES' },
  { headline: 'VIX spikes 18% amid geopolitical tensions in Asia-Pacific', source: 'Volatility', condition: 'volatile', time: '15m ago', instrument: 'VIX' },
  { headline: 'EUR/USD consolidating near 1.0850 support zone', source: 'FX Desk', condition: 'neutral', time: '32m ago', instrument: 'EURUSD' },
  { headline: 'Crude oil rejects $78 resistance for third consecutive session', source: 'Commodities', condition: 'bearish', time: '1h ago', instrument: 'CL' },
];

const stats = [
  { value: '3', label: 'AI Agents', icon: 'agents' },
  { value: '4', label: 'Analysis Modes', icon: 'modes' },
  { value: 'Real-Time', label: 'Market Coverage', icon: 'sources' },
];

const tradingStages = [
  {
    title: 'Analyze Market',
    desc: 'AI monitors conditions, volatility regimes, and macro catalysts across asset classes',
    color: '#22C55E',
    iconPath: 'M3 3v18h18M7 16l4-8 4 4 4-12',
  },
  {
    title: 'Generate Ideas',
    desc: 'Multi-factor analysis produces trade ideas with entry, exit, and risk parameters',
    color: '#F59E0B',
    iconPath: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    title: 'Plan Execution',
    desc: 'Optimal execution strategy with timing, sizing, and slippage minimization',
    color: '#4ADE80',
    iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
];

export default function Home({ config }: Props) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-16">

      {/* ── Hero ── */}
      <section className="text-center animate-fadeSlideUp">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
          style={{ background: 'rgba(34,197,94,0.15)', color: '#4ADE80' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 17 9 11 13 15 21 7" />
            <polyline points="14 7 21 7 21 14" />
          </svg>
          AI-Powered Trading Intelligence
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 heading-terminal" style={{ color: 'var(--white)' }}>
          Trading Assistant
          <span className="block" style={{ color: '#22C55E' }}>Command Center</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>
          {config.description}. Analyze markets, generate trade ideas, and plan
          optimal execution with AI-driven precision.
        </p>

        {/* ── Market signal feed preview ── */}
        <div className="relative max-w-3xl mx-auto mb-12 overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'var(--border-color)', background: 'rgba(34,197,94,0.05)' }}>
            <div className="signal-pulse bullish" />
            <span className="text-xs font-bold heading-terminal" style={{ color: '#4ADE80' }}>MARKET SIGNALS</span>
            <span className="ml-auto text-xs heading-terminal" style={{ color: 'var(--text-muted)' }}>LIVE</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
            {sampleSignals.map((signal, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-fadeSlideUp"
                style={{ animationDelay: `${i * 0.15}s` }}>
                <div className={`signal-pulse ${signal.condition}`} />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold" style={{ color: 'var(--white)' }}>{signal.headline}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="level-tag">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 17 9 11 13 15 21 7" />
                      </svg>
                      {signal.source}
                    </span>
                    <span className="text-xs font-bold heading-terminal px-2 py-0.5 rounded"
                      style={{ background: 'rgba(100,116,139,0.15)', color: '#94A3B8' }}>
                      {signal.instrument}
                    </span>
                  </div>
                </div>
                <span className={`condition-badge ${signal.condition}`}>
                  {signal.condition === 'bullish' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                    </svg>
                  )}
                  {signal.condition === 'bearish' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                    </svg>
                  )}
                  {signal.condition === 'neutral' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  )}
                  {signal.condition === 'volatile' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  )}
                  {signal.condition}
                </span>
                <span className="text-xs heading-terminal" style={{ color: 'var(--text-muted)' }}>{signal.time}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="grid grid-cols-3 gap-6 max-w-2xl mx-auto animate-fadeSlideUp stagger-1">
        {stats.map((s) => (
          <div key={s.label} className="card text-center">
            <div className="text-3xl font-extrabold mb-1" style={{ color: '#22C55E' }}>{s.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Trading Pipeline Visualization ── */}
      <section className="animate-fadeSlideUp stagger-2">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-terminal" style={{ color: 'var(--white)' }}>
          Trading Pipeline
        </h2>
        <div className="flex items-center justify-center gap-4">
          {tradingStages.map((stage, i) => (
            <div key={stage.title} className="flex items-center gap-4">
              <div className="card text-center px-8 py-6 flex flex-col items-center"
                style={{ borderTop: `3px solid ${stage.color}`, minWidth: '200px' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: `${stage.color}15` }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={stage.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={stage.iconPath} />
                  </svg>
                </div>
                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--white)' }}>{stage.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{stage.desc}</p>
              </div>
              {i < tradingStages.length - 1 && (
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                  <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Asset Coverage Showcase ── */}
      <section className="animate-fadeSlideUp stagger-3">
        <h2 className="text-2xl font-extrabold text-center mb-2 heading-terminal" style={{ color: 'var(--white)' }}>
          Asset Coverage
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          AI-generated trading intelligence across major asset classes
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { name: 'Equities & Indices', level: 'high', icon: 'M3 3v18h18M7 16l4-8 4 4 4-12', desc: 'S&P 500, NASDAQ, sector ETFs, and single-name equities with real-time price action analysis' },
            { name: 'Fixed Income', level: 'medium', icon: 'M4 6h16M4 12h16M4 18h7', desc: 'Treasury yields, credit spreads, curve dynamics, and duration-adjusted trade opportunities' },
            { name: 'Foreign Exchange', level: 'medium', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'G10 and EM currency pairs, cross-rates, and macro-driven FX trade idea generation' },
            { name: 'Commodities', level: 'high', icon: 'M13 10V3L4 14h7v7l9-11h-7z', desc: 'Energy, metals, and agriculture futures with supply-demand analysis and seasonal patterns' },
          ].map((cat) => (
            <div key={cat.name} className={`trade-card ${cat.level}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: cat.level === 'high' ? 'rgba(34,197,94,0.15)' : cat.level === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke={cat.level === 'high' ? '#4ADE80' : cat.level === 'medium' ? '#FBBF24' : '#94A3B8'}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={cat.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--white)' }}>{cat.name}</h3>
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
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-terminal" style={{ color: 'var(--white)' }}>
          Platform Architecture
        </h2>
        <div className="card p-8 max-w-4xl mx-auto">
          <svg viewBox="0 0 960 520" fill="none" className="w-full">
            <defs>
              <marker id="arrowGreen" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill="#22C55E" />
              </marker>
            </defs>

            {/* ── Row 1: User -> CloudFront -> S3 ── */}
            <rect x="40" y="20" width="100" height="70" rx="10" fill="rgba(34,197,94,0.08)" stroke="#22C55E" strokeWidth="1.5" />
            <text x="90" y="50" textAnchor="middle" fill="#4ADE80" fontSize="11" fontWeight="600">User Browser</text>
            <text x="90" y="66" textAnchor="middle" fill="#64748B" fontSize="8">SPA Client</text>

            <line x1="140" y1="55" x2="220" y2="55" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />

            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="74" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">CloudFront</text>
            <text x="250" y="86" textAnchor="middle" fill="#64748B" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="55" x2="370" y2="55" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />
            <text x="325" y="48" textAnchor="middle" fill="#64748B" fontSize="7">OAC</text>

            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="74" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">S3</text>
            <text x="400" y="86" textAnchor="middle" fill="#64748B" fontSize="8">Static UI Assets</text>

            {/* CloudFront -> API Gateway (down to row 2) */}
            <line x1="250" y1="90" x2="250" y2="130" stroke="#22C55E" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#22C55E" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />
            <text x="175" y="126" textAnchor="middle" fill="#64748B" fontSize="7">/api/* routing</text>

            {/* ── Row 2: API Gateway -> Lambda Proxy -> Lambda Worker <-> DynamoDB ── */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
            <text x="100" y="214" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">API Gateway</text>
            <text x="100" y="226" textAnchor="middle" fill="#64748B" fontSize="8">HTTP API</text>

            <line x1="130" y1="180" x2="230" y2="180" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
            <text x="260" y="214" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">Lambda Proxy</text>
            <text x="260" y="226" textAnchor="middle" fill="#64748B" fontSize="8">30s timeout</text>
            <text x="260" y="237" textAnchor="middle" fill="#64748B" fontSize="7">POST /invoke, GET /status</text>

            <line x1="290" y1="180" x2="400" y2="180" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />
            <text x="345" y="174" textAnchor="middle" fill="#64748B" fontSize="7">async</text>

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
            <text x="430" y="214" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">Lambda Worker</text>
            <text x="430" y="226" textAnchor="middle" fill="#64748B" fontSize="8">300s timeout</text>

            <line x1="460" y1="180" x2="560" y2="180" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#64748B" fontSize="8">Session State + TTL</text>

            {/* ── Row 3: AgentCore Runtime -> Agents -> Bedrock, ECR connected ── */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#22C55E" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#22C55E" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#64748B" fontSize="8">Bedrock Managed Container</text>

            <line x1="200" y1="340" x2="310" y2="340" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />

            {/* Agent boxes - Green, Amber, Light-Green */}
            <rect x="320" y="305" width="120" height="32" rx="6" fill="rgba(34,197,94,0.08)" stroke="#22C55E" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#4ADE80" fontSize="9" fontWeight="600">Market Analyst</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="rgba(245,158,11,0.08)" stroke="#F59E0B" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#FBBF24" fontSize="9" fontWeight="600">Trade Idea Gen</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="rgba(74,222,128,0.08)" stroke="#4ADE80" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#86EFAC" fontSize="9" fontWeight="600">Execution Planner</text>

            <line x1="440" y1="360" x2="540" y2="360" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#64748B" fontSize="8">Claude Sonnet (LLM)</text>

            {/* ECR -> AgentCore */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#64748B" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />

            {/* Monitoring sidebar */}
            <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="802" y="162" width="36" height="36" />
            <text x="820" y="214" textAnchor="middle" fill="#F8FAFC" fontSize="9" fontWeight="600">CloudWatch</text>

            <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="882" y="162" width="36" height="36" />
            <text x="900" y="214" textAnchor="middle" fill="#F8FAFC" fontSize="9" fontWeight="600">X-Ray</text>

            <line x1="790" y1="180" x2="628" y2="180" stroke="#334155" strokeWidth="1" strokeDasharray="4,3" />
            <text x="710" y="174" textAnchor="middle" fill="#64748B" fontSize="7">Observability</text>
          </svg>
        </div>
      </section>

      {/* ── Agent Cards ── */}
      <section className="animate-fadeSlideUp stagger-5">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-terminal" style={{ color: 'var(--white)' }}>
          AI Trading Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.agents.map((agent, i) => {
            const colors = [
              { bg: 'rgba(34,197,94,0.08)', border: '#22C55E', text: '#4ADE80', accent: 'rgba(34,197,94,0.15)' },
              { bg: 'rgba(245,158,11,0.08)', border: '#F59E0B', text: '#FBBF24', accent: 'rgba(245,158,11,0.15)' },
              { bg: 'rgba(74,222,128,0.08)', border: '#4ADE80', text: '#86EFAC', accent: 'rgba(74,222,128,0.15)' },
            ][i];
            const icons = [
              'M3 3v18h18M7 16l4-8 4 4 4-12',
              'M13 10V3L4 14h7v7l9-11h-7z',
              'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
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
        <div className="card max-w-lg mx-auto" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(245,158,11,0.08))' }}>
          <h3 className="text-xl font-extrabold mb-2 heading-terminal" style={{ color: 'var(--white)' }}>Ready to trade?</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            Try the trading engine with test entity <code className="px-2 py-0.5 rounded text-xs font-bold heading-terminal" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ADE80' }}>TRD001</code>
          </p>
          <Link to="/console"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #22C55E, #16A34A)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 17 9 11 13 15 21 7" />
              <polyline points="14 7 21 7 21 14" />
            </svg>
            Run Analysis
          </Link>
        </div>
      </section>
    </div>
  );
}
