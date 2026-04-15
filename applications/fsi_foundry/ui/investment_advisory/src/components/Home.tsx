import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Sample portfolio holdings for wealth dashboard ── */
const sampleHoldings = [
  { name: 'US Large Cap Equities', allocation: 35, change: '+2.4%', trend: 'up', sector: 'Equity' },
  { name: 'International Bonds', allocation: 25, change: '-0.3%', trend: 'down', sector: 'Fixed Income' },
  { name: 'Real Estate (REITs)', allocation: 15, change: '+1.1%', trend: 'up', sector: 'Alternatives' },
  { name: 'Emerging Market Equities', allocation: 10, change: '+3.7%', trend: 'up', sector: 'Equity' },
  { name: 'Commodities & Gold', allocation: 8, change: '+0.8%', trend: 'up', sector: 'Alternatives' },
  { name: 'Cash & Equivalents', allocation: 7, change: '+0.02%', trend: 'up', sector: 'Cash' },
];

const stats = [
  { value: '3', label: 'AI Agents', icon: 'agents' },
  { value: '5', label: 'Advisory Modes', icon: 'modes' },
  { value: '98.5%', label: 'Client Satisfaction', icon: 'satisfaction' },
];

const advisoryStages = [
  {
    title: 'Profile Client',
    desc: 'AI evaluates risk tolerance, objectives, and suitability for personalized advisory',
    color: '#064E3B',
    iconPath: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M8.5 3a4 4 0 100 8 4 4 0 000-8z',
  },
  {
    title: 'Analyze Portfolio',
    desc: 'Deep analysis of asset allocation, risk exposure, concentration, and performance metrics',
    color: '#D4A017',
    iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    title: 'Generate Advisory',
    desc: 'Produces actionable recommendations with rebalancing strategies and market insights',
    color: '#059669',
    iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
];

/* ── Pie chart colors ── */
const pieColors = ['#064E3B', '#065F46', '#059669', '#D4A017', '#FCD34D', '#E5E7EB'];

export default function Home({ config }: Props) {
  /* ── Build conic-gradient for sample allocation pie chart ── */
  let cumulative = 0;
  const conicStops = sampleHoldings.map((h, i) => {
    const start = cumulative;
    cumulative += h.allocation;
    return `${pieColors[i % pieColors.length]} ${start}% ${cumulative}%`;
  }).join(', ');

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-16">

      {/* ── Hero ── */}
      <section className="text-center animate-fadeSlideUp">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
          style={{ background: 'var(--forest-50)', color: 'var(--forest-800)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
          </svg>
          AI-Powered Wealth Management
        </div>
        <h1 className="text-5xl heading-serif tracking-tight mb-4" style={{ color: 'var(--charcoal)' }}>
          Investment
          <span className="block" style={{ color: 'var(--forest-800)' }}>Advisory Platform</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>
          {config.description}. Deliver institutional-grade portfolio intelligence and
          personalized wealth management recommendations.
        </p>

        {/* ── Portfolio Overview Preview ── */}
        <div className="relative max-w-4xl mx-auto mb-12 overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--forest-100)', background: 'white' }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'var(--forest-50)', background: 'var(--forest-50)' }}>
            <div className="portfolio-pulse" />
            <span className="text-xs font-bold" style={{ color: 'var(--forest-800)' }}>PORTFOLIO OVERVIEW</span>
            <span className="ml-auto text-xs font-semibold" style={{ color: 'var(--gold-600)' }}>Total AUM: $2.4M</span>
          </div>
          <div className="flex flex-col lg:flex-row">
            {/* Pie Chart */}
            <div className="flex flex-col items-center justify-center p-6 animate-pieReveal">
              <div className="pie-chart" style={{ background: `conic-gradient(${conicStops})` }}>
                <div className="pie-chart-center">
                  <div className="text-center">
                    <div className="text-xs font-bold" style={{ color: 'var(--forest-800)' }}>6</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Assets</div>
                  </div>
                </div>
              </div>
            </div>
            {/* Holdings List */}
            <div className="flex-1 divide-y" style={{ borderColor: 'var(--warm-gray-200)' }}>
              {sampleHoldings.map((holding, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 animate-fadeSlideUp"
                  style={{ animationDelay: `${i * 0.1}s` }}>
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: pieColors[i % pieColors.length] }} />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{holding.name}</p>
                    <span className="allocation-tag">{holding.sector}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{holding.allocation}%</div>
                    <div className="text-xs font-semibold" style={{ color: holding.trend === 'up' ? '#059669' : '#EF4444' }}>
                      {holding.change}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="grid grid-cols-3 gap-6 max-w-2xl mx-auto animate-fadeSlideUp stagger-1">
        {stats.map((s) => (
          <div key={s.label} className="card text-center">
            <div className="text-3xl font-extrabold mb-1" style={{ color: 'var(--forest-800)' }}>{s.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Gold Divider ── */}
      <div className="gold-divider max-w-xs mx-auto" />

      {/* ── Advisory Flow Visualization ── */}
      <section className="animate-fadeSlideUp stagger-2">
        <h2 className="text-2xl heading-serif text-center mb-8" style={{ color: 'var(--charcoal)' }}>
          Advisory Pipeline
        </h2>
        <div className="flex items-center justify-center gap-4">
          {advisoryStages.map((stage, i) => (
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
              {i < advisoryStages.length - 1 && (
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                  <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="#065F46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Performance Metrics Showcase ── */}
      <section className="animate-fadeSlideUp stagger-3">
        <h2 className="text-2xl heading-serif text-center mb-2" style={{ color: 'var(--charcoal)' }}>
          Advisory Capabilities
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          Comprehensive wealth intelligence across multiple dimensions
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { name: 'Risk Assessment', level: 'Portfolio', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', desc: 'Evaluate risk exposure, concentration risks, and volatility metrics across portfolios', color: '#064E3B', bg: '#ECFDF5' },
            { name: 'Market Research', level: 'Global', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'Analyze market conditions, sector trends, and macroeconomic indicators for opportunities', color: '#D4A017', bg: '#FEFCE8' },
            { name: 'Client Suitability', level: 'Individual', icon: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M8.5 3a4 4 0 100 8 4 4 0 000-8z M20 8v6 M23 11h-6', desc: 'Profile client objectives, risk tolerance, and time horizons for personalized advisory', color: '#059669', bg: '#ECFDF5' },
            { name: 'Rebalancing', level: 'Tactical', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', desc: 'Generate data-driven rebalancing strategies aligned with target allocations and goals', color: '#065F46', bg: '#D1FAE5' },
          ].map((cap) => (
            <div key={cap.name} className="card" style={{ borderTop: `3px solid ${cap.color}` }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: cap.bg }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke={cap.color}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={cap.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{cap.name}</h3>
                  <span className="allocation-tag">{cap.level}</span>
                </div>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{cap.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Architecture Diagram (SVG) ── */}
      <section className="animate-fadeSlideUp stagger-4">
        <h2 className="text-2xl heading-serif text-center mb-8" style={{ color: 'var(--charcoal)' }}>
          Platform Architecture
        </h2>
        <div className="card p-8 max-w-4xl mx-auto">
          <svg viewBox="0 0 960 520" fill="none" className="w-full">
            <defs>
              <marker id="arrowForest" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill="#065F46" />
              </marker>
            </defs>

            {/* ── Row 1: User -> CloudFront -> S3 ── */}
            <rect x="40" y="20" width="100" height="70" rx="10" fill="#ECFDF5" stroke="#065F46" strokeWidth="1.5" />
            <text x="90" y="50" textAnchor="middle" fill="#065F46" fontSize="11" fontWeight="600">User Browser</text>
            <text x="90" y="66" textAnchor="middle" fill="#737373" fontSize="8">SPA Client</text>

            <line x1="140" y1="55" x2="220" y2="55" stroke="#065F46" strokeWidth="1.5" markerEnd="url(#arrowForest)" />

            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="74" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">CloudFront</text>
            <text x="250" y="86" textAnchor="middle" fill="#737373" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="55" x2="370" y2="55" stroke="#065F46" strokeWidth="1.5" markerEnd="url(#arrowForest)" />
            <text x="325" y="48" textAnchor="middle" fill="#A3A3A3" fontSize="7">OAC</text>

            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="74" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">S3</text>
            <text x="400" y="86" textAnchor="middle" fill="#737373" fontSize="8">Static UI Assets</text>

            {/* CloudFront -> API Gateway (down to row 2) */}
            <line x1="250" y1="90" x2="250" y2="130" stroke="#065F46" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#065F46" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#065F46" strokeWidth="1.5" markerEnd="url(#arrowForest)" />
            <text x="175" y="126" textAnchor="middle" fill="#A3A3A3" fontSize="7">/api/* routing</text>

            {/* ── Row 2: API Gateway -> Lambda Proxy -> Lambda Worker <-> DynamoDB ── */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
            <text x="100" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">API Gateway</text>
            <text x="100" y="226" textAnchor="middle" fill="#737373" fontSize="8">HTTP API</text>

            <line x1="130" y1="180" x2="230" y2="180" stroke="#065F46" strokeWidth="1.5" markerEnd="url(#arrowForest)" />

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
            <text x="260" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Lambda Proxy</text>
            <text x="260" y="226" textAnchor="middle" fill="#737373" fontSize="8">30s timeout</text>
            <text x="260" y="237" textAnchor="middle" fill="#A3A3A3" fontSize="7">POST /invoke, GET /status</text>

            <line x1="290" y1="180" x2="400" y2="180" stroke="#065F46" strokeWidth="1.5" markerEnd="url(#arrowForest)" />
            <text x="345" y="174" textAnchor="middle" fill="#A3A3A3" fontSize="7">async</text>

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
            <text x="430" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Lambda Worker</text>
            <text x="430" y="226" textAnchor="middle" fill="#737373" fontSize="8">300s timeout</text>

            <line x1="460" y1="180" x2="560" y2="180" stroke="#065F46" strokeWidth="1.5" markerEnd="url(#arrowForest)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#065F46" strokeWidth="1.5" markerEnd="url(#arrowForest)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#737373" fontSize="8">Session State + TTL</text>

            {/* ── Row 3: AgentCore Runtime -> Agents -> Bedrock, ECR connected ── */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#065F46" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#065F46" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#065F46" strokeWidth="1.5" markerEnd="url(#arrowForest)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#737373" fontSize="8">Bedrock Managed Container</text>

            <line x1="200" y1="340" x2="310" y2="340" stroke="#065F46" strokeWidth="1.5" markerEnd="url(#arrowForest)" />

            {/* Agent boxes - Forest, Gold, Emerald */}
            <rect x="320" y="305" width="120" height="32" rx="6" fill="#ECFDF5" stroke="#064E3B" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#064E3B" fontSize="9" fontWeight="600">Portfolio Analyst</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="#FEFCE8" stroke="#D4A017" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#D4A017" fontSize="9" fontWeight="600">Market Researcher</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="#D1FAE5" stroke="#059669" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#059669" fontSize="9" fontWeight="600">Client Profiler</text>

            <line x1="440" y1="360" x2="540" y2="360" stroke="#065F46" strokeWidth="1.5" markerEnd="url(#arrowForest)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#737373" fontSize="8">Claude Sonnet (LLM)</text>

            {/* ECR -> AgentCore */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#737373" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#065F46" strokeWidth="1.5" markerEnd="url(#arrowForest)" />

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
        <h2 className="text-2xl heading-serif text-center mb-8" style={{ color: 'var(--charcoal)' }}>
          AI Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.agents.map((agent, i) => {
            const colors = [
              { bg: '#ECFDF5', border: '#064E3B', text: '#064E3B', accent: '#ECFDF5' },
              { bg: '#FEFCE8', border: '#D4A017', text: '#92400E', accent: '#FEFCE8' },
              { bg: '#D1FAE5', border: '#059669', text: '#059669', accent: '#D1FAE5' },
            ][i];
            const icons = [
              'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
              'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
              'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M8.5 3a4 4 0 100 8 4 4 0 000-8z M20 8v6 M23 11h-6',
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
        <div className="card max-w-lg mx-auto" style={{ background: 'linear-gradient(135deg, #ECFDF5, #FEFCE8)' }}>
          <h3 className="text-xl heading-serif mb-2" style={{ color: 'var(--charcoal)' }}>Ready for advisory?</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            Try the advisory engine with test client <code className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'white', color: 'var(--forest-800)' }}>ADV001</code>
          </p>
          <Link to="/console"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #064E3B, #059669)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
            </svg>
            Launch Advisory
          </Link>
        </div>
      </section>
    </div>
  );
}
