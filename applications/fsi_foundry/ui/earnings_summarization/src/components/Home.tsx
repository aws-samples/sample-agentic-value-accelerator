import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Sample earnings ticker data ── */
const tickerItems = [
  { symbol: 'AAPL', metric: 'EPS', value: '$1.52', change: '+8.6%', up: true },
  { symbol: 'MSFT', metric: 'Rev', value: '$56.2B', change: '+12.3%', up: true },
  { symbol: 'GOOGL', metric: 'EPS', value: '$1.89', change: '-2.1%', up: false },
  { symbol: 'AMZN', metric: 'Rev', value: '$143.3B', change: '+11.0%', up: true },
  { symbol: 'META', metric: 'EPS', value: '$4.71', change: '+19.4%', up: true },
  { symbol: 'NVDA', metric: 'Rev', value: '$22.1B', change: '+122%', up: true },
  { symbol: 'JPM', metric: 'EPS', value: '$4.44', change: '-3.2%', up: false },
  { symbol: 'TSLA', metric: 'Rev', value: '$25.2B', change: '+8.8%', up: true },
];

const stats = [
  { value: '3', label: 'AI Agents', sub: 'Processing Pipeline' },
  { value: '4', label: 'Analysis Modes', sub: 'Full / Transcript / Metrics / Sentiment' },
  { value: '<30s', label: 'Avg. Latency', sub: 'End-to-End Analysis' },
];

const pipelineStages = [
  {
    title: 'Process Transcript',
    desc: 'Ingest and parse raw earnings call transcripts into structured sections',
    color: '#2563EB',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    title: 'Extract Metrics',
    desc: 'Identify and extract KPIs, financial metrics, and guidance changes',
    color: '#F97316',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    title: 'Analyze Sentiment',
    desc: 'Gauge management tone, market outlook, and forward-looking sentiment',
    color: '#22C55E',
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  },
];

export default function Home({ config }: Props) {
  return (
    <div className="space-y-0">

      {/* ── Earnings Ticker Bar ── */}
      <div className="ticker-bar py-2">
        <div className="ticker-content">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-2 mx-6">
              <span className="text-xs font-bold" style={{ color: 'var(--white)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                {item.symbol}
              </span>
              <span className="text-xs" style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                {item.metric}
              </span>
              <span className="text-xs font-bold" style={{ color: 'var(--white)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                {item.value}
              </span>
              <span className="text-xs font-bold" style={{
                color: item.up ? 'var(--green-400)' : 'var(--red-400)',
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              }}>
                {item.up ? '\u25B2' : '\u25BC'} {item.change}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10 space-y-14">

        {/* ── Hero ── */}
        <section className="text-center animate-fadeSlideUp">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded text-xs font-bold mb-6"
            style={{
              background: 'rgba(37,99,235,0.15)',
              color: 'var(--blue-400)',
              border: '1px solid rgba(37,99,235,0.3)',
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            AI-POWERED EARNINGS INTELLIGENCE
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-4" style={{ color: 'var(--white)' }}>
            Earnings Call
            <span className="block" style={{ color: 'var(--blue-400)' }}>Summarization Engine</span>
          </h1>
          <p className="text-sm max-w-2xl mx-auto mb-10" style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
            {config.description}. Process transcripts, extract key financial metrics,
            analyze management sentiment, and generate actionable investment insights.
          </p>

          {/* ── Sample Terminal Output Preview ── */}
          <div className="max-w-3xl mx-auto mb-8">
            <div className="terminal-card text-left" style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
              <div className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#EF4444' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#F59E0B' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#22C55E' }} />
                <span className="ml-2 text-xs" style={{ color: 'var(--gray-400)' }}>ava-earnings-terminal</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div><span style={{ color: 'var(--blue-400)' }}>$</span> <span style={{ color: 'var(--gray-300)' }}>ava analyze --entity ERN001 --mode FULL</span></div>
                <div style={{ color: 'var(--gray-400)' }}>[transcript_processor] Parsing Q4 2024 earnings call...</div>
                <div style={{ color: 'var(--gray-400)' }}>[metric_extractor] Extracting KPIs and financial metrics...</div>
                <div style={{ color: 'var(--gray-400)' }}>[sentiment_analyst] Analyzing management tone and outlook...</div>
                <div className="pt-1">
                  <span style={{ color: 'var(--green-400)' }}>STATUS:</span>
                  <span style={{ color: 'var(--white)' }}> Analysis complete</span>
                </div>
                <div>
                  <span style={{ color: 'var(--orange-500)' }}>SENTIMENT:</span>
                  <span style={{ color: 'var(--green-400)' }}> BULLISH</span>
                  <span style={{ color: 'var(--gray-400)' }}> | EPS: $2.18 (+14.2%) | Rev: $94.3B (+8.1%)</span>
                </div>
                <div>
                  <span style={{ color: 'var(--blue-400)' }}>GUIDANCE:</span>
                  <span style={{ color: 'var(--white)' }}> FY2025 revenue raised to $385-390B</span>
                  <span className="terminal-cursor" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="grid grid-cols-3 gap-4 max-w-2xl mx-auto animate-fadeSlideUp stagger-1">
          {stats.map((s) => (
            <div key={s.label} className="metric-card text-center">
              <div className="text-2xl font-extrabold mb-0.5" style={{ color: 'var(--blue-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{s.value}</div>
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--white)' }}>{s.label}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--gray-400)', fontSize: '0.6rem' }}>{s.sub}</div>
            </div>
          ))}
        </section>

        {/* ── Pipeline Visualization ── */}
        <section className="animate-fadeSlideUp stagger-2">
          <h2 className="text-xl font-extrabold text-center mb-6" style={{ color: 'var(--white)' }}>
            Analysis Pipeline
          </h2>
          <div className="flex items-center justify-center gap-3">
            {pipelineStages.map((stage, i) => (
              <div key={stage.title} className="flex items-center gap-3">
                <div className="terminal-card text-center px-6 py-5 flex flex-col items-center"
                  style={{ borderTop: `2px solid ${stage.color}`, minWidth: '200px' }}>
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3"
                    style={{ background: `${stage.color}18`, border: `1px solid ${stage.color}40` }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stage.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={stage.icon} />
                    </svg>
                  </div>
                  <h3 className="text-xs font-bold mb-1" style={{ color: 'var(--white)' }}>{stage.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--gray-400)', fontSize: '0.65rem' }}>{stage.desc}</p>
                </div>
                {i < pipelineStages.length - 1 && (
                  <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
                    <path d="M4 10h16m0 0l-5-5m5 5l-5 5" stroke="var(--blue-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Sample Metrics Showcase ── */}
        <section className="animate-fadeSlideUp stagger-3">
          <h2 className="text-xl font-extrabold text-center mb-2" style={{ color: 'var(--white)' }}>
            Extracted Intelligence
          </h2>
          <p className="text-xs text-center mb-6" style={{ color: 'var(--gray-400)' }}>
            Sample output from a processed earnings call
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'EPS (Actual)', value: '$2.18', change: '+14.2%', up: true, accent: 'green' },
              { label: 'Revenue', value: '$94.3B', change: '+8.1%', up: true, accent: '' },
              { label: 'Gross Margin', value: '45.2%', change: '-0.8pp', up: false, accent: 'orange' },
              { label: 'FCF', value: '$21.4B', change: '+22.6%', up: true, accent: 'green' },
            ].map((m) => (
              <div key={m.label} className={`metric-card ${m.accent}`}>
                <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--gray-400)' }}>{m.label}</div>
                <div className="text-xl font-extrabold" style={{ color: 'var(--white)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{m.value}</div>
                <div className="text-xs font-bold mt-1" style={{
                  color: m.up ? 'var(--green-400)' : 'var(--red-400)',
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                }}>
                  {m.up ? '\u25B2' : '\u25BC'} {m.change}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Architecture Diagram ── */}
        <section className="animate-fadeSlideUp stagger-4">
          <h2 className="text-xl font-extrabold text-center mb-6" style={{ color: 'var(--white)' }}>
            Platform Architecture
          </h2>
          <div className="terminal-card p-6 max-w-4xl mx-auto">
            <svg viewBox="0 0 960 520" fill="none" className="w-full">
              <defs>
                <marker id="arrowBlue" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L8,3 L0,6 Z" fill="#2563EB" />
                </marker>
              </defs>

              {/* ── Row 1: User -> CloudFront -> S3 ── */}
              <rect x="40" y="20" width="100" height="70" rx="6" fill="rgba(37,99,235,0.1)" stroke="#2563EB" strokeWidth="1.5" />
              <text x="90" y="50" textAnchor="middle" fill="#60A5FA" fontSize="11" fontWeight="600">User Browser</text>
              <text x="90" y="66" textAnchor="middle" fill="#94A3B8" fontSize="8">SPA Client</text>

              <line x1="140" y1="55" x2="220" y2="55" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
              <text x="250" y="74" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">CloudFront</text>
              <text x="250" y="86" textAnchor="middle" fill="#94A3B8" fontSize="8">CDN + SPA Rewrite</text>

              <line x1="280" y1="55" x2="370" y2="55" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />
              <text x="325" y="48" textAnchor="middle" fill="#4B5563" fontSize="7">OAC</text>

              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
              <text x="400" y="74" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">S3</text>
              <text x="400" y="86" textAnchor="middle" fill="#94A3B8" fontSize="8">Static UI Assets</text>

              {/* CloudFront -> API Gateway (down to row 2) */}
              <line x1="250" y1="90" x2="250" y2="130" stroke="#2563EB" strokeWidth="1.5" />
              <line x1="250" y1="130" x2="100" y2="130" stroke="#2563EB" strokeWidth="1.5" />
              <line x1="100" y1="130" x2="100" y2="160" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />
              <text x="175" y="126" textAnchor="middle" fill="#4B5563" fontSize="7">/api/* routing</text>

              {/* ── Row 2: API Gateway -> Lambda Proxy -> Lambda Worker <-> DynamoDB ── */}
              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
              <text x="100" y="214" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">API Gateway</text>
              <text x="100" y="226" textAnchor="middle" fill="#94A3B8" fontSize="8">HTTP API</text>

              <line x1="130" y1="180" x2="230" y2="180" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
              <text x="260" y="214" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">Lambda Proxy</text>
              <text x="260" y="226" textAnchor="middle" fill="#94A3B8" fontSize="8">30s timeout</text>
              <text x="260" y="237" textAnchor="middle" fill="#4B5563" fontSize="7">POST /invoke, GET /status</text>

              <line x1="290" y1="180" x2="400" y2="180" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />
              <text x="345" y="174" textAnchor="middle" fill="#4B5563" fontSize="7">async</text>

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
              <text x="430" y="214" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">Lambda Worker</text>
              <text x="430" y="226" textAnchor="middle" fill="#94A3B8" fontSize="8">300s timeout</text>

              <line x1="460" y1="180" x2="560" y2="180" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />
              <line x1="560" y1="186" x2="460" y2="186" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
              <text x="590" y="214" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">DynamoDB</text>
              <text x="590" y="226" textAnchor="middle" fill="#94A3B8" fontSize="8">Session State + TTL</text>

              {/* ── Row 3: AgentCore Runtime -> Agents -> Bedrock ── */}
              <line x1="430" y1="240" x2="430" y2="280" stroke="#2563EB" strokeWidth="1.5" />
              <line x1="430" y1="280" x2="160" y2="280" stroke="#2563EB" strokeWidth="1.5" />
              <line x1="160" y1="280" x2="160" y2="320" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
              <text x="160" y="374" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">AgentCore Runtime</text>
              <text x="160" y="386" textAnchor="middle" fill="#94A3B8" fontSize="8">Bedrock Managed Container</text>

              <line x1="200" y1="340" x2="310" y2="340" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

              {/* Agent boxes - Blue, Orange, Green */}
              <rect x="320" y="305" width="120" height="32" rx="4" fill="rgba(37,99,235,0.12)" stroke="#2563EB" strokeWidth="1.5" />
              <text x="380" y="325" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="600">Transcript Processor</text>

              <rect x="320" y="345" width="120" height="32" rx="4" fill="rgba(249,115,22,0.12)" stroke="#F97316" strokeWidth="1.5" />
              <text x="380" y="365" textAnchor="middle" fill="#FB923C" fontSize="9" fontWeight="600">Metric Extractor</text>

              <rect x="320" y="385" width="120" height="32" rx="4" fill="rgba(34,197,94,0.12)" stroke="#22C55E" strokeWidth="1.5" />
              <text x="380" y="405" textAnchor="middle" fill="#4ADE80" fontSize="9" fontWeight="600">Sentiment Analyst</text>

              <line x1="440" y1="360" x2="540" y2="360" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
              <text x="570" y="394" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">Amazon Bedrock</text>
              <text x="570" y="406" textAnchor="middle" fill="#94A3B8" fontSize="8">Claude Sonnet (LLM)</text>

              {/* ECR -> AgentCore */}
              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
              <text x="160" y="482" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontWeight="600">ECR</text>
              <text x="160" y="494" textAnchor="middle" fill="#94A3B8" fontSize="8">Container Images</text>
              <line x1="160" y1="430" x2="160" y2="392" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

              {/* Monitoring sidebar */}
              <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="802" y="162" width="36" height="36" />
              <text x="820" y="214" textAnchor="middle" fill="#F8FAFC" fontSize="9" fontWeight="600">CloudWatch</text>

              <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="882" y="162" width="36" height="36" />
              <text x="900" y="214" textAnchor="middle" fill="#F8FAFC" fontSize="9" fontWeight="600">X-Ray</text>

              <line x1="790" y1="180" x2="628" y2="180" stroke="#4B5563" strokeWidth="1" strokeDasharray="4,3" />
              <text x="710" y="174" textAnchor="middle" fill="#4B5563" fontSize="7">Observability</text>
            </svg>
          </div>
        </section>

        {/* ── Agent Cards ── */}
        <section className="animate-fadeSlideUp stagger-5">
          <h2 className="text-xl font-extrabold text-center mb-6" style={{ color: 'var(--white)' }}>
            AI Agents
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {config.agents.map((agent, i) => {
              const colors = [
                { border: '#2563EB', text: '#60A5FA', bg: 'rgba(37,99,235,0.1)' },
                { border: '#F97316', text: '#FB923C', bg: 'rgba(249,115,22,0.1)' },
                { border: '#22C55E', text: '#4ADE80', bg: 'rgba(34,197,94,0.1)' },
              ][i];
              const icons = [
                'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
                'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
                'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
              ][i];
              return (
                <div key={agent.id} className="terminal-card"
                  style={{ borderTop: `2px solid ${colors.border}` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: colors.bg, border: `1px solid ${colors.border}40` }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={icons} />
                      </svg>
                    </div>
                    <h3 className="text-sm font-bold" style={{ color: colors.text }}>{agent.name}</h3>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--gray-400)' }}>{agent.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="text-center animate-fadeSlideUp stagger-6 pb-8">
          <div className="terminal-card max-w-lg mx-auto"
            style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(249,115,22,0.06))' }}>
            <h3 className="text-lg font-extrabold mb-2" style={{ color: 'var(--white)' }}>Ready to analyze?</h3>
            <p className="text-xs mb-5" style={{ color: 'var(--gray-400)' }}>
              Try the earnings analysis engine with test entity{' '}
              <code className="px-2 py-0.5 rounded text-xs font-bold"
                style={{ background: 'rgba(37,99,235,0.15)', color: 'var(--blue-400)', border: '1px solid rgba(37,99,235,0.3)' }}>
                ERN001
              </code>
            </p>
            <Link to="/console"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded text-xs font-bold text-white tracking-wider uppercase transition-all duration-200 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #2563EB, #3B82F6)',
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              ANALYZE EARNINGS
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
