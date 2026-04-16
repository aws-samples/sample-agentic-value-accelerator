import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Sample surveillance alerts for dashboard feed ── */
const sampleAlerts = [
  { headline: 'Unusual Volume Spike in OTC Derivatives - Desk 7A', type: 'Trade Pattern', severity: 'critical', time: '12m ago', category: 'Spoofing' },
  { headline: 'Flagged Communication: Front-Running Keywords Detected', type: 'Comms', severity: 'alert', time: '34m ago', category: 'Front Running' },
  { headline: 'Cross-Market Correlation Anomaly Between FX and Equities', type: 'Trade Pattern', severity: 'alert', time: '1h ago', category: 'Manipulation' },
  { headline: 'Routine Compliance Check - All Clear for Fixed Income Desk', type: 'Compliance', severity: 'clear', time: '2h ago', category: 'Routine' },
];

const stats = [
  { value: '3', label: 'AI Agents', icon: 'agents' },
  { value: '4', label: 'Surveillance Modes', icon: 'modes' },
  { value: '24/7', label: 'Monitoring', icon: 'monitoring' },
];

const surveillanceStages = [
  {
    title: 'Analyze Trades',
    desc: 'AI scans trade patterns for anomalies, spoofing, layering, and wash trading',
    color: '#06B6D4',
    iconPath: 'M3 3v18h18 M18.7 8l-5.1 5.2-2.8-2.7L7 14.3',
  },
  {
    title: 'Monitor Comms',
    desc: 'NLP analysis of communications for compliance risks and prohibited language',
    color: '#F97316',
    iconPath: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  },
  {
    title: 'Generate Alerts',
    desc: 'Structured alert generation with severity scoring and escalation routing',
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
          style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan-400)', border: '1px solid rgba(6,182,212,0.2)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          AI-Powered Trading Floor Surveillance
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-4" style={{ color: 'var(--zinc-300)' }}>
          Market
          <span className="block" style={{ color: 'var(--cyan-400)' }}>Surveillance Platform</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto mb-10" style={{ color: 'var(--zinc-400)' }}>
          {config.description}. Detect trade manipulation, monitor communications, and
          generate surveillance alerts in real time.
        </p>

        {/* ── Live surveillance feed preview ── */}
        <div className="relative max-w-3xl mx-auto mb-12 overflow-hidden rounded-xl border scan-line-container"
          style={{ borderColor: 'var(--zinc-800)', background: 'var(--zinc-900)' }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'var(--zinc-800)', background: 'rgba(6,182,212,0.05)' }}>
            <div className="surv-pulse critical" />
            <span className="text-xs font-bold" style={{ color: 'var(--cyan-400)' }}>LIVE SURVEILLANCE FEED</span>
            <span className="ml-auto text-xs font-mono" style={{ color: 'var(--zinc-600)' }}>STREAM ACTIVE</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--zinc-800)' }}>
            {sampleAlerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-fadeSlideUp"
                style={{ animationDelay: `${i * 0.15}s` }}>
                <div className={`surv-pulse ${alert.severity}`} />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold" style={{ color: 'var(--zinc-300)' }}>{alert.headline}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="source-tag">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3v18h18" />
                      </svg>
                      {alert.type}
                    </span>
                    <span className="category-tag">{alert.category}</span>
                  </div>
                </div>
                <span className={`alert-indicator ${alert.severity === 'critical' ? 'critical' : alert.severity === 'alert' ? 'high' : 'low'}`}>
                  {alert.severity === 'critical' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 9v2m0 4h.01" />
                    </svg>
                  )}
                  {alert.severity === 'alert' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  {alert.severity === 'clear' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {alert.severity}
                </span>
                <span className="text-xs" style={{ color: 'var(--zinc-600)' }}>{alert.time}</span>
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
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--zinc-500)' }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Surveillance Flow Visualization ── */}
      <section className="animate-fadeSlideUp stagger-2">
        <h2 className="text-2xl font-extrabold text-center mb-8" style={{ color: 'var(--zinc-300)' }}>
          Surveillance Pipeline
        </h2>
        <div className="flex items-center justify-center gap-4">
          {surveillanceStages.map((stage, i) => (
            <div key={stage.title} className="flex items-center gap-4">
              <div className="card text-center px-8 py-6 flex flex-col items-center"
                style={{ borderTop: `3px solid ${stage.color}`, minWidth: '200px' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: `${stage.color}15` }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={stage.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={stage.iconPath} />
                  </svg>
                </div>
                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--zinc-300)' }}>{stage.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--zinc-500)' }}>{stage.desc}</p>
              </div>
              {i < surveillanceStages.length - 1 && (
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                  <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="var(--cyan-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Alert Severity Dashboard ── */}
      <section className="animate-fadeSlideUp stagger-3">
        <h2 className="text-2xl font-extrabold text-center mb-2" style={{ color: 'var(--zinc-300)' }}>
          Alert Severity Dashboard
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--zinc-500)' }}>
          AI-generated surveillance alerts across multiple risk dimensions
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { name: 'Trade Manipulation', severity: 'critical', icon: 'M3 3v18h18 M18.7 8l-5.1 5.2-2.8-2.7L7 14.3', desc: 'Spoofing, layering, wash trading, and coordinated market manipulation' },
            { name: 'Front Running', severity: 'high', icon: 'M13 17l5-5-5-5M6 17l5-5-5-5', desc: 'Trading ahead of client orders, information barriers breach, and order flow exploitation' },
            { name: 'Insider Trading', severity: 'medium', icon: 'M12 15V9m-3 3h6 M21 12a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'Material non-public information usage, suspicious timing, and unusual profit patterns' },
            { name: 'Compliance Risk', severity: 'low', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', desc: 'Regulatory reporting gaps, position limit breaches, and best execution failures' },
          ].map((cat) => (
            <div key={cat.name} className={`comm-flag-card ${cat.severity === 'critical' ? 'concern' : cat.severity === 'high' ? 'flagged' : 'indicator'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: cat.severity === 'critical' ? 'rgba(239,68,68,0.1)' : cat.severity === 'high' ? 'rgba(249,115,22,0.1)' : cat.severity === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke={cat.severity === 'critical' ? '#EF4444' : cat.severity === 'high' ? '#F97316' : cat.severity === 'medium' ? '#F59E0B' : '#22C55E'}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={cat.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--zinc-300)' }}>{cat.name}</h3>
                  <span className={`severity-badge ${cat.severity}`}>{cat.severity}</span>
                </div>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--zinc-500)' }}>{cat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Architecture Diagram (SVG) ── */}
      <section className="animate-fadeSlideUp stagger-4">
        <h2 className="text-2xl font-extrabold text-center mb-8" style={{ color: 'var(--zinc-300)' }}>
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
            <text x="90" y="66" textAnchor="middle" fill="#71717A" fontSize="8">SPA Client</text>

            <line x1="140" y1="55" x2="220" y2="55" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="74" textAnchor="middle" fill="#D4D4D8" fontSize="10" fontWeight="600">CloudFront</text>
            <text x="250" y="86" textAnchor="middle" fill="#71717A" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="55" x2="370" y2="55" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />
            <text x="325" y="48" textAnchor="middle" fill="#52525B" fontSize="7">OAC</text>

            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="74" textAnchor="middle" fill="#D4D4D8" fontSize="10" fontWeight="600">S3</text>
            <text x="400" y="86" textAnchor="middle" fill="#71717A" fontSize="8">Static UI Assets</text>

            {/* CloudFront -> API Gateway (down to row 2) */}
            <line x1="250" y1="90" x2="250" y2="130" stroke="#06B6D4" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#06B6D4" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />
            <text x="175" y="126" textAnchor="middle" fill="#52525B" fontSize="7">/api/* routing</text>

            {/* ── Row 2: API Gateway -> Lambda Proxy -> Lambda Worker <-> DynamoDB ── */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
            <text x="100" y="214" textAnchor="middle" fill="#D4D4D8" fontSize="10" fontWeight="600">API Gateway</text>
            <text x="100" y="226" textAnchor="middle" fill="#71717A" fontSize="8">HTTP API</text>

            <line x1="130" y1="180" x2="230" y2="180" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
            <text x="260" y="214" textAnchor="middle" fill="#D4D4D8" fontSize="10" fontWeight="600">Lambda Proxy</text>
            <text x="260" y="226" textAnchor="middle" fill="#71717A" fontSize="8">30s timeout</text>
            <text x="260" y="237" textAnchor="middle" fill="#52525B" fontSize="7">POST /invoke, GET /status</text>

            <line x1="290" y1="180" x2="400" y2="180" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />
            <text x="345" y="174" textAnchor="middle" fill="#52525B" fontSize="7">async</text>

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
            <text x="430" y="214" textAnchor="middle" fill="#D4D4D8" fontSize="10" fontWeight="600">Lambda Worker</text>
            <text x="430" y="226" textAnchor="middle" fill="#71717A" fontSize="8">300s timeout</text>

            <line x1="460" y1="180" x2="560" y2="180" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#D4D4D8" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#71717A" fontSize="8">Session State + TTL</text>

            {/* ── Row 3: AgentCore Runtime -> Agents -> Bedrock, ECR connected ── */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#06B6D4" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#06B6D4" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#D4D4D8" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#71717A" fontSize="8">Bedrock Managed Container</text>

            <line x1="200" y1="340" x2="310" y2="340" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            {/* Agent boxes - Cyan, Orange, Green */}
            <rect x="320" y="305" width="120" height="32" rx="6" fill="rgba(6,182,212,0.08)" stroke="#06B6D4" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#06B6D4" fontSize="9" fontWeight="600">Trade Pattern Analyst</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="rgba(249,115,22,0.08)" stroke="#F97316" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#F97316" fontSize="9" fontWeight="600">Comms Monitor</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="rgba(34,197,94,0.08)" stroke="#22C55E" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#22C55E" fontSize="9" fontWeight="600">Alert Generator</text>

            <line x1="440" y1="360" x2="540" y2="360" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#D4D4D8" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#71717A" fontSize="8">Claude Sonnet (LLM)</text>

            {/* ECR -> AgentCore */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#D4D4D8" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#71717A" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#06B6D4" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />

            {/* Monitoring sidebar */}
            <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="802" y="162" width="36" height="36" />
            <text x="820" y="214" textAnchor="middle" fill="#D4D4D8" fontSize="9" fontWeight="600">CloudWatch</text>

            <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="882" y="162" width="36" height="36" />
            <text x="900" y="214" textAnchor="middle" fill="#D4D4D8" fontSize="9" fontWeight="600">X-Ray</text>

            <line x1="790" y1="180" x2="628" y2="180" stroke="#3F3F46" strokeWidth="1" strokeDasharray="4,3" />
            <text x="710" y="174" textAnchor="middle" fill="#52525B" fontSize="7">Observability</text>
          </svg>
        </div>
      </section>

      {/* ── Agent Cards ── */}
      <section className="animate-fadeSlideUp stagger-5">
        <h2 className="text-2xl font-extrabold text-center mb-8" style={{ color: 'var(--zinc-300)' }}>
          AI Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.agents.map((agent, i) => {
            const colors = [
              { bg: 'rgba(6,182,212,0.08)', border: '#06B6D4', text: '#22D3EE', accent: 'rgba(6,182,212,0.1)' },
              { bg: 'rgba(249,115,22,0.08)', border: '#F97316', text: '#FB923C', accent: 'rgba(249,115,22,0.1)' },
              { bg: 'rgba(34,197,94,0.08)', border: '#22C55E', text: '#4ADE80', accent: 'rgba(34,197,94,0.1)' },
            ][i];
            const icons = [
              'M3 3v18h18 M18.7 8l-5.1 5.2-2.8-2.7L7 14.3',
              'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
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
                <p className="text-xs leading-relaxed" style={{ color: 'var(--zinc-500)' }}>{agent.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="text-center animate-fadeSlideUp stagger-6 pb-8">
        <div className="card max-w-lg mx-auto" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(249,115,22,0.06))' }}>
          <h3 className="text-xl font-extrabold mb-2" style={{ color: 'var(--zinc-300)' }}>Ready to surveil?</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--zinc-400)' }}>
            Try the surveillance engine with test entity <code className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'var(--zinc-800)', color: 'var(--cyan-400)' }}>SUR001</code>
          </p>
          <Link to="/console"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #164E63, #06B6D4)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Run Surveillance
          </Link>
        </div>
      </section>
    </div>
  );
}
