import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Sample news article cards for intelligence feed ── */
const sampleArticles = [
  { headline: 'Global Bank Under Investigation for AML Violations', source: 'Reuters', sentiment: 'negative', time: '2h ago', category: 'Regulatory' },
  { headline: 'Fintech Startup Receives Clean Compliance Audit', source: 'Bloomberg', sentiment: 'positive', time: '4h ago', category: 'Compliance' },
  { headline: 'New Sanctions List Update Impacts EU Financial Sector', source: 'Financial Times', sentiment: 'neutral', time: '6h ago', category: 'Sanctions' },
  { headline: 'Executive Linked to Fraud Scheme in Court Filing', source: 'WSJ', sentiment: 'negative', time: '8h ago', category: 'Fraud' },
];

const stats = [
  { value: '3', label: 'AI Agents', icon: 'agents' },
  { value: '4', label: 'Screening Modes', icon: 'modes' },
  { value: '99.2%', label: 'Detection Rate', icon: 'detection' },
];

const screeningStages = [
  {
    title: 'Screen Media',
    desc: 'AI scans global media sources for adverse mentions and relevant articles',
    color: '#4338CA',
    iconPath: 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z',
  },
  {
    title: 'Analyze Sentiment',
    desc: 'Deep NLP sentiment classification of discovered media content',
    color: '#F97316',
    iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    title: 'Extract Risk Signals',
    desc: 'Structured risk intelligence extraction with entity linkage analysis',
    color: '#22C55E',
    iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  },
];

export default function Home({ config }: Props) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-16">

      {/* ── Hero ── */}
      <section className="text-center animate-fadeSlideUp">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
          style={{ background: 'var(--indigo-50)', color: 'var(--indigo-700)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          AI-Powered Media Intelligence
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-4" style={{ color: 'var(--charcoal)' }}>
          Adverse Media
          <span className="block" style={{ color: 'var(--indigo-700)' }}>Screening Platform</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>
          {config.description}. Monitor global media sources, analyze sentiment, and
          extract actionable risk signals in real time.
        </p>

        {/* ── News ticker preview ── */}
        <div className="relative max-w-3xl mx-auto mb-12 overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--indigo-100)', background: 'white' }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'var(--indigo-50)', background: 'var(--indigo-50)' }}>
            <div className="feed-pulse negative" />
            <span className="text-xs font-bold" style={{ color: 'var(--indigo-700)' }}>LIVE INTELLIGENCE FEED</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--neutral-200)' }}>
            {sampleArticles.map((article, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-fadeSlideUp"
                style={{ animationDelay: `${i * 0.15}s` }}>
                <div className={`feed-pulse ${article.sentiment}`} />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{article.headline}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="source-tag">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                      </svg>
                      {article.source}
                    </span>
                    <span className="category-tag">{article.category}</span>
                  </div>
                </div>
                <span className={`sentiment-badge ${article.sentiment}`}>
                  {article.sentiment === 'negative' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                    </svg>
                  )}
                  {article.sentiment === 'positive' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                    </svg>
                  )}
                  {article.sentiment === 'neutral' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  )}
                  {article.sentiment}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{article.time}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="grid grid-cols-3 gap-6 max-w-2xl mx-auto animate-fadeSlideUp stagger-1">
        {stats.map((s) => (
          <div key={s.label} className="card text-center">
            <div className="text-3xl font-extrabold mb-1" style={{ color: 'var(--indigo-700)' }}>{s.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Screening Flow Visualization ── */}
      <section className="animate-fadeSlideUp stagger-2">
        <h2 className="text-2xl font-extrabold text-center mb-8" style={{ color: 'var(--charcoal)' }}>
          Screening Pipeline
        </h2>
        <div className="flex items-center justify-center gap-4">
          {screeningStages.map((stage, i) => (
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
              {i < screeningStages.length - 1 && (
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                  <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="var(--indigo-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Risk Signal Showcase ── */}
      <section className="animate-fadeSlideUp stagger-3">
        <h2 className="text-2xl font-extrabold text-center mb-2" style={{ color: 'var(--charcoal)' }}>
          Risk Signal Categories
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          AI-extracted risk intelligence across multiple dimensions
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { name: 'Regulatory Risk', severity: 'critical', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', desc: 'Regulatory actions, sanctions violations, and compliance failures' },
            { name: 'Financial Crime', severity: 'high', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', desc: 'Money laundering, fraud, bribery, and financial misconduct' },
            { name: 'Reputational', severity: 'medium', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z', desc: 'Negative media coverage, public controversies, and ESG concerns' },
            { name: 'Operational', severity: 'low', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', desc: 'Business disruptions, leadership changes, and supply chain issues' },
          ].map((cat) => (
            <div key={cat.name} className={`risk-signal-card ${cat.severity}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: cat.severity === 'critical' ? '#FEE2E2' : cat.severity === 'high' ? 'var(--coral-50)' : cat.severity === 'medium' ? 'var(--amber-50)' : 'var(--green-50)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke={cat.severity === 'critical' ? '#EF4444' : cat.severity === 'high' ? '#F97316' : cat.severity === 'medium' ? '#F59E0B' : '#22C55E'}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={cat.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{cat.name}</h3>
                  <span className={`severity-badge ${cat.severity}`}>{cat.severity}</span>
                </div>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{cat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Architecture Diagram (SVG) ── */}
      <section className="animate-fadeSlideUp stagger-4">
        <h2 className="text-2xl font-extrabold text-center mb-8" style={{ color: 'var(--charcoal)' }}>
          Platform Architecture
        </h2>
        <div className="card p-8 max-w-4xl mx-auto">
          <svg viewBox="0 0 960 520" fill="none" className="w-full">
            <defs>
              <marker id="arrowIndigo" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill="#4338CA" />
              </marker>
            </defs>

            {/* ── Row 1: User -> CloudFront -> S3 ── */}
            <rect x="40" y="20" width="100" height="70" rx="10" fill="#EEF2FF" stroke="#4338CA" strokeWidth="1.5" />
            <text x="90" y="50" textAnchor="middle" fill="#4338CA" fontSize="11" fontWeight="600">User Browser</text>
            <text x="90" y="66" textAnchor="middle" fill="#737373" fontSize="8">SPA Client</text>

            <line x1="140" y1="55" x2="220" y2="55" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrowIndigo)" />

            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="74" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">CloudFront</text>
            <text x="250" y="86" textAnchor="middle" fill="#737373" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="55" x2="370" y2="55" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrowIndigo)" />
            <text x="325" y="48" textAnchor="middle" fill="#A3A3A3" fontSize="7">OAC</text>

            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="74" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">S3</text>
            <text x="400" y="86" textAnchor="middle" fill="#737373" fontSize="8">Static UI Assets</text>

            {/* CloudFront -> API Gateway (down to row 2) */}
            <line x1="250" y1="90" x2="250" y2="130" stroke="#4338CA" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#4338CA" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrowIndigo)" />
            <text x="175" y="126" textAnchor="middle" fill="#A3A3A3" fontSize="7">/api/* routing</text>

            {/* ── Row 2: API Gateway -> Lambda Proxy -> Lambda Worker <-> DynamoDB ── */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
            <text x="100" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">API Gateway</text>
            <text x="100" y="226" textAnchor="middle" fill="#737373" fontSize="8">HTTP API</text>

            <line x1="130" y1="180" x2="230" y2="180" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrowIndigo)" />

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
            <text x="260" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Lambda Proxy</text>
            <text x="260" y="226" textAnchor="middle" fill="#737373" fontSize="8">30s timeout</text>
            <text x="260" y="237" textAnchor="middle" fill="#A3A3A3" fontSize="7">POST /invoke, GET /status</text>

            <line x1="290" y1="180" x2="400" y2="180" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrowIndigo)" />
            <text x="345" y="174" textAnchor="middle" fill="#A3A3A3" fontSize="7">async</text>

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
            <text x="430" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Lambda Worker</text>
            <text x="430" y="226" textAnchor="middle" fill="#737373" fontSize="8">300s timeout</text>

            <line x1="460" y1="180" x2="560" y2="180" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrowIndigo)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrowIndigo)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#737373" fontSize="8">Session State + TTL</text>

            {/* ── Row 3: AgentCore Runtime -> Agents -> Bedrock, ECR connected ── */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#4338CA" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#4338CA" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrowIndigo)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#737373" fontSize="8">Bedrock Managed Container</text>

            <line x1="200" y1="340" x2="310" y2="340" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrowIndigo)" />

            {/* Agent boxes - Indigo, Coral, Green */}
            <rect x="320" y="305" width="120" height="32" rx="6" fill="#EEF2FF" stroke="#4338CA" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#4338CA" fontSize="9" fontWeight="600">Media Screener</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="#FFF7ED" stroke="#F97316" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#F97316" fontSize="9" fontWeight="600">Sentiment Analyst</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="#F0FDF4" stroke="#22C55E" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#22C55E" fontSize="9" fontWeight="600">Risk Signal Extractor</text>

            <line x1="440" y1="360" x2="540" y2="360" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrowIndigo)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#737373" fontSize="8">Claude Sonnet (LLM)</text>

            {/* ECR -> AgentCore */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#737373" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrowIndigo)" />

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
        <h2 className="text-2xl font-extrabold text-center mb-8" style={{ color: 'var(--charcoal)' }}>
          AI Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.agents.map((agent, i) => {
            const colors = [
              { bg: '#EEF2FF', border: '#4338CA', text: '#4338CA', accent: '#EEF2FF' },
              { bg: '#FFF7ED', border: '#F97316', text: '#EA580C', accent: '#FFF7ED' },
              { bg: '#F0FDF4', border: '#22C55E', text: '#16A34A', accent: '#F0FDF4' },
            ][i];
            const icons = [
              'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z',
              'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
              'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
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
        <div className="card max-w-lg mx-auto" style={{ background: 'linear-gradient(135deg, #EEF2FF, #FFF7ED)' }}>
          <h3 className="text-xl font-extrabold mb-2" style={{ color: 'var(--charcoal)' }}>Ready to screen?</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            Try the screening engine with test entity <code className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'white', color: 'var(--indigo-700)' }}>MED001</code>
          </p>
          <Link to="/console"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #312E81, #6366F1)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Screen Entity
          </Link>
        </div>
      </section>
    </div>
  );
}
