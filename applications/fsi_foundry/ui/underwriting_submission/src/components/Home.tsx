import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Sample submission feed for the dashboard ── */
const sampleSubmissions = [
  { headline: 'Light manufacturing submission SUB-4471 received, 3 inland locations', status: 'received', line: 'Property', time: '1h ago', tiv: '$14.0M' },
  { headline: 'Appetite screening cleared for food processor SUB-1188', status: 'screening', line: 'Property + GL', time: '3h ago', tiv: '$36.3M' },
  { headline: 'Quote released for precision components account SUB-4471', status: 'quoted', line: 'Property', time: '5h ago', tiv: '$14.0M' },
  { headline: 'Coastal salvage submission SUB-0907 declined on prohibited class', status: 'declined', line: 'Property', time: '6h ago', tiv: '$29.0M' },
];

const stats = [
  { value: '3', label: 'AI Agents' },
  { value: '4', label: 'Triage Modes' },
  { value: '10', label: 'Appetite Rules' },
];

const pipelineStages = [
  {
    title: 'Appetite Screening',
    desc: 'Applies every rule in the written appetite ruleset, citing each finding by rule id and flagging prohibited classes',
    color: '#0284C7',
    iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    title: 'Exposure Analysis',
    desc: 'Aggregates insured value, quantifies catastrophe concentration, and assesses claims frequency, severity and trend',
    color: '#F97316',
    iconPath: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z',
  },
  {
    title: 'Technical Pricing',
    desc: 'Anchors on the expiring rate and adjusts for loss experience, exposure and data quality, with a stated confidence',
    color: '#16A34A',
    iconPath: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
];

const capabilities = [
  {
    name: 'Appetite Rule Evaluation',
    level: 'high',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    desc: 'Applies prohibition, limit, requirement and referral rules from the insurer ruleset, respecting each rule qualifier so an out-of-scope location is never reported as a breach',
  },
  {
    name: 'Exposure Aggregation',
    level: 'medium',
    icon: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z',
    desc: 'Sums building and contents values across the property schedule and computes concentration by catastrophe zone for perils each location is actually exposed to',
  },
  {
    name: 'Loss History Assessment',
    level: 'medium',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    desc: 'Separates frequency from severity, distinguishes closed claims from open reserves, and weighs loss ratio against premium paid over the period supplied',
  },
  {
    name: 'Submission Completeness',
    level: 'low',
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    desc: 'Identifies schedule fields absent for some locations but present for others, gaps in the loss run period, and unevidenced remediation of prior findings',
  },
];

export default function Home({ config }: Props) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-16">

      {/* ── Hero ── */}
      <section className="text-center animate-fadeSlideUp">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
          style={{ background: 'var(--sky-50)', color: 'var(--sky-700)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          AI-Powered Underwriting Intelligence
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 heading-dash" style={{ color: 'var(--charcoal)' }}>
          Underwriting Submission
          <span className="block" style={{ color: 'var(--sky-700)' }}>Triage Center</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>
          {config.description}. Decline early, quote what can be won, and give brokers a clear
          list of what is still outstanding.
        </p>

        {/* ── Submission feed preview ── */}
        <div className="relative max-w-3xl mx-auto mb-12 overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--stone-200)', background: 'white' }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'var(--stone-100)', background: 'var(--charcoal)' }}>
            <div className="submission-pulse received" />
            <span className="text-xs font-bold" style={{ color: '#38BDF8' }}>SUBMISSION TRIAGE FEED</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--stone-200)' }}>
            {sampleSubmissions.map((sub, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-fadeSlideUp"
                style={{ animationDelay: `${i * 0.15}s` }}>
                <div className={`submission-pulse ${sub.status}`} />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{sub.headline}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="doc-tag">{sub.line}</span>
                    <span className="detail-tag">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1" />
                      </svg>
                      TIV {sub.tiv}
                    </span>
                  </div>
                </div>
                <span className={`decision-badge ${sub.status === 'quoted' ? 'quote' : sub.status === 'declined' ? 'decline' : sub.status === 'screening' ? 'refer' : 'none'}`}>
                  {sub.status}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub.time}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="grid grid-cols-3 gap-6 max-w-2xl mx-auto animate-fadeSlideUp stagger-1">
        {stats.map((s) => (
          <div key={s.label} className="card text-center">
            <div className="text-3xl font-extrabold mb-1" style={{ color: 'var(--sky-700)' }}>{s.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Pipeline ── */}
      <section className="animate-fadeSlideUp stagger-2">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-dash" style={{ color: 'var(--charcoal)' }}>
          Triage Pipeline
        </h2>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {pipelineStages.map((stage, i) => (
            <div key={stage.title} className="flex items-center gap-4">
              <div className="card text-center px-8 py-6 flex flex-col items-center"
                style={{ borderTop: `3px solid ${stage.color}`, minWidth: '200px', maxWidth: '240px' }}>
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
                  <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-center mt-6 max-w-2xl mx-auto" style={{ color: 'var(--text-muted)' }}>
          The three specialists run in parallel. Synthesis applies precedence rather than averaging: a breach of a
          prohibition, limit or requirement rule is dispositive, and pricing may never upgrade an outcome.
        </p>
      </section>

      {/* ── Capabilities ── */}
      <section className="animate-fadeSlideUp stagger-3">
        <h2 className="text-2xl font-extrabold text-center mb-2 heading-dash" style={{ color: 'var(--charcoal)' }}>
          Triage Capabilities
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          AI-driven underwriting judgement across key commercial lines dimensions
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {capabilities.map((cat) => (
            <div key={cat.name} className={`finding-card ${cat.level}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: cat.level === 'high' ? 'var(--sky-50)' : cat.level === 'medium' ? 'var(--coral-50)' : 'var(--stone-100)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke={cat.level === 'high' ? 'var(--sky-700)' : cat.level === 'medium' ? '#F97316' : 'var(--stone-500)'}
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

      {/* ── Architecture Diagram ── */}
      <section className="animate-fadeSlideUp stagger-4">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-dash" style={{ color: 'var(--charcoal)' }}>
          Platform Architecture
        </h2>
        <div className="card p-8 max-w-4xl mx-auto">
          <svg viewBox="0 0 960 520" fill="none" className="w-full">
            <defs>
              <marker id="arrowSky" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill="#0284C7" />
              </marker>
            </defs>

            {/* Row 1: User -> CloudFront -> S3 */}
            <rect x="40" y="20" width="100" height="70" rx="10" fill="#F0F9FF" stroke="#0284C7" strokeWidth="1.5" />
            <text x="90" y="50" textAnchor="middle" fill="#0284C7" fontSize="11" fontWeight="600">User Browser</text>
            <text x="90" y="66" textAnchor="middle" fill="#78716C" fontSize="8">SPA Client</text>

            <line x1="140" y1="55" x2="220" y2="55" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />

            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="74" textAnchor="middle" fill="#292524" fontSize="10" fontWeight="600">CloudFront</text>
            <text x="250" y="86" textAnchor="middle" fill="#78716C" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="55" x2="370" y2="55" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />
            <text x="325" y="48" textAnchor="middle" fill="#A8A29E" fontSize="7">OAC</text>

            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="74" textAnchor="middle" fill="#292524" fontSize="10" fontWeight="600">S3</text>
            <text x="400" y="86" textAnchor="middle" fill="#78716C" fontSize="8">Static UI Assets</text>

            <line x1="250" y1="90" x2="250" y2="130" stroke="#0284C7" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#0284C7" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />
            <text x="175" y="126" textAnchor="middle" fill="#A8A29E" fontSize="7">/api/* routing</text>

            {/* Row 2: API Gateway -> Proxy -> Worker <-> DynamoDB */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
            <text x="100" y="214" textAnchor="middle" fill="#292524" fontSize="10" fontWeight="600">API Gateway</text>
            <text x="100" y="226" textAnchor="middle" fill="#78716C" fontSize="8">HTTP API</text>

            <line x1="130" y1="180" x2="230" y2="180" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
            <text x="260" y="214" textAnchor="middle" fill="#292524" fontSize="10" fontWeight="600">Lambda Proxy</text>
            <text x="260" y="226" textAnchor="middle" fill="#78716C" fontSize="8">30s timeout</text>
            <text x="260" y="237" textAnchor="middle" fill="#A8A29E" fontSize="7">POST /invoke, GET /status</text>

            <line x1="290" y1="180" x2="400" y2="180" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />
            <text x="345" y="174" textAnchor="middle" fill="#A8A29E" fontSize="7">async</text>

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
            <text x="430" y="214" textAnchor="middle" fill="#292524" fontSize="10" fontWeight="600">Lambda Worker</text>
            <text x="430" y="226" textAnchor="middle" fill="#78716C" fontSize="8">900s read timeout</text>

            <line x1="460" y1="180" x2="560" y2="180" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#292524" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#78716C" fontSize="8">Session State + TTL</text>

            {/* Row 3: AgentCore -> Agents -> Bedrock */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#0284C7" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#0284C7" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#292524" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#78716C" fontSize="8">Bedrock Managed Container</text>

            <line x1="200" y1="340" x2="310" y2="340" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />

            <rect x="320" y="305" width="120" height="32" rx="6" fill="#F0F9FF" stroke="#0284C7" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#0284C7" fontSize="9" fontWeight="600">Appetite Screener</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="#FFF7ED" stroke="#F97316" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#EA580C" fontSize="9" fontWeight="600">Exposure Analyst</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="#F0FDF4" stroke="#16A34A" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#15803D" fontSize="9" fontWeight="600">Pricing Indicator</text>

            <line x1="440" y1="360" x2="540" y2="360" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#292524" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#78716C" fontSize="8">Claude Haiku (LLM)</text>

            {/* S3 sample data */}
            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="322" y="440" width="36" height="36" />
            <text x="340" y="492" textAnchor="middle" fill="#292524" fontSize="9" fontWeight="600">S3 Submission Data</text>
            <text x="340" y="504" textAnchor="middle" fill="#78716C" fontSize="7">profile / loss runs / appetite rules</text>
            <line x1="358" y1="440" x2="380" y2="422" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />

            {/* ECR */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#292524" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#78716C" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />

            {/* Observability */}
            <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="802" y="162" width="36" height="36" />
            <text x="820" y="214" textAnchor="middle" fill="#292524" fontSize="9" fontWeight="600">CloudWatch</text>

            <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="882" y="162" width="36" height="36" />
            <text x="900" y="214" textAnchor="middle" fill="#292524" fontSize="9" fontWeight="600">X-Ray</text>

            <line x1="790" y1="180" x2="628" y2="180" stroke="#D6D3D1" strokeWidth="1" strokeDasharray="4,3" />
            <text x="710" y="174" textAnchor="middle" fill="#A8A29E" fontSize="7">Observability</text>
          </svg>
        </div>
      </section>

      {/* ── Agent Cards ── */}
      <section className="animate-fadeSlideUp stagger-5">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-dash" style={{ color: 'var(--charcoal)' }}>
          AI Underwriting Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.agents.map((agent, i) => {
            const palette = [
              { border: '#0284C7', text: '#0284C7', accent: '#F0F9FF' },
              { border: '#F97316', text: '#EA580C', accent: '#FFF7ED' },
              { border: '#16A34A', text: '#15803D', accent: '#F0FDF4' },
            ][i % 3];
            const icon = [
              'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
              'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z',
              'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
            ][i % 3];
            return (
              <div key={agent.id} className="card" style={{ borderTop: `3px solid ${palette.border}` }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: palette.accent }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={palette.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={icon} />
                    </svg>
                  </div>
                  <h3 className="text-sm font-bold" style={{ color: palette.text }}>{agent.name}</h3>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{agent.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Sample submissions ── */}
      <section className="animate-fadeSlideUp stagger-5">
        <h2 className="text-2xl font-extrabold text-center mb-2 heading-dash" style={{ color: 'var(--charcoal)' }}>
          Test Submissions
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          The same ten appetite rules produce three different outcomes
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[
            { id: 'SUB001', name: 'Meridian Precision Components', detail: 'Ohio machine shop, 3 inland masonry locations, five years of clean loss runs', tiv: '$14.0M', outcome: 'quote' },
            { id: 'SUB002', name: 'Harvest Ridge Foods', detail: 'Food processor, open $400K fire claim, roof ages and loss run years outstanding', tiv: '$36.3M', outcome: 'refer' },
            { id: 'SUB003', name: 'Gulfline Terminal & Salvage', detail: 'Coastal marine terminal with a prohibited salvage occupancy and hurricane concentration', tiv: '$29.0M', outcome: 'decline' },
          ].map((s) => (
            <div key={s.id} className="location-card">
              <div className="flex items-center justify-between mb-2">
                <span className="doc-tag">{s.id}</span>
                <span className={`decision-badge ${s.outcome}`}>{s.outcome}</span>
              </div>
              <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--charcoal)' }}>{s.name}</h3>
              <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-muted)' }}>{s.detail}</p>
              <span className="detail-tag">TIV {s.tiv}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="text-center animate-fadeSlideUp stagger-6 pb-8">
        <div className="card max-w-lg mx-auto" style={{ background: 'linear-gradient(135deg, #F0F9FF, #FFF7ED)' }}>
          <h3 className="text-xl font-extrabold mb-2 heading-dash" style={{ color: 'var(--charcoal)' }}>Ready to triage a submission?</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            Try the triage engine with test submission{' '}
            <code className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'white', color: 'var(--sky-700)' }}>SUB001</code>
          </p>
          <Link to="/console"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #0284C7, #38BDF8)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Run Triage
          </Link>
        </div>
      </section>
    </div>
  );
}
