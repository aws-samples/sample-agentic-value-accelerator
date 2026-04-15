import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Sample claims feed for dashboard ── */
const sampleClaims = [
  { headline: 'Auto collision claim CLM-2847 submitted with complete documentation', status: 'open', type: 'Auto', time: '1h ago', amount: '$12,500' },
  { headline: 'Property damage assessment completed for CLM-2843', status: 'processing', type: 'Property', time: '3h ago', amount: '$45,200' },
  { headline: 'Settlement approved for water damage claim CLM-2839', status: 'resolved', type: 'Home', time: '5h ago', amount: '$8,750' },
  { headline: 'Missing medical records flagged for CLM-2835', status: 'flagged', type: 'Health', time: '6h ago', amount: '$3,200' },
];

const stats = [
  { value: '3', label: 'AI Agents', icon: 'agents' },
  { value: '4', label: 'Assessment Modes', icon: 'modes' },
  { value: '15+', label: 'Claim Types', icon: 'types' },
];

const pipelineStages = [
  {
    title: 'Claims Intake',
    desc: 'AI validates submissions, identifies claim type, checks documentation completeness, and flags missing items',
    color: '#0284C7',
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    title: 'Damage Assessment',
    desc: 'Evaluate damage severity, estimate repair and replacement costs, and assess evidence quality',
    color: '#F97316',
    iconPath: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  },
  {
    title: 'Settlement Recommendation',
    desc: 'Generate settlement amounts with confidence scoring based on policy coverage and comparable claims',
    color: '#16A34A',
    iconPath: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
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
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          AI-Powered Claims Intelligence
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 heading-dash" style={{ color: 'var(--charcoal)' }}>
          Claims Management
          <span className="block" style={{ color: 'var(--sky-700)' }}>Claims Center</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>
          {config.description}. Streamline intake, automate damage assessment,
          and deliver fair settlement recommendations.
        </p>

        {/* ── Claims monitoring feed preview ── */}
        <div className="relative max-w-3xl mx-auto mb-12 overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--stone-200)', background: 'white' }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'var(--stone-100)', background: 'var(--charcoal)' }}>
            <div className="claims-pulse open" />
            <span className="text-xs font-bold" style={{ color: '#38BDF8' }}>CLAIMS PROCESSING FEED</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--stone-200)' }}>
            {sampleClaims.map((claim, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-fadeSlideUp"
                style={{ animationDelay: `${i * 0.15}s` }}>
                <div className={`claims-pulse ${claim.status}`} />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{claim.headline}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="doc-tag">{claim.type}</span>
                    <span className="detail-tag">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1" />
                      </svg>
                      {claim.amount}
                    </span>
                  </div>
                </div>
                <span className={`status-badge ${claim.status === 'open' ? 'open' : claim.status === 'processing' ? 'in_review' : claim.status === 'resolved' ? 'approved' : 'denied'}`}>
                  {claim.status === 'open' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4l3 3" />
                    </svg>
                  )}
                  {claim.status === 'processing' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                  {claim.status === 'resolved' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {claim.status === 'flagged' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                  )}
                  {claim.status}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{claim.time}</span>
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
                  <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Claims Capabilities Showcase ── */}
      <section className="animate-fadeSlideUp stagger-3">
        <h2 className="text-2xl font-extrabold text-center mb-2 heading-dash" style={{ color: 'var(--charcoal)' }}>
          Processing Capabilities
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          AI-driven claims intelligence across key insurance dimensions
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { name: 'Document Validation', level: 'high', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', desc: 'Automated verification of claim documentation completeness with intelligent missing-document detection and priority flagging' },
            { name: 'Damage Evaluation', level: 'medium', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z', desc: 'Multi-factor damage severity analysis with repair cost estimation, replacement valuation, and evidence quality scoring' },
            { name: 'Settlement Analysis', level: 'medium', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'Fair settlement computation using policy coverage mapping, comparable claims matching, and confidence-scored recommendations' },
            { name: 'Fraud Detection', level: 'low', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', desc: 'Pattern recognition across claims history to identify anomalies, inconsistencies, and potential fraudulent submissions' },
          ].map((cat) => (
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

      {/* ── Architecture Diagram (SVG with Sky blue arrows) ── */}
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

            {/* ── Row 1: User -> CloudFront -> S3 ── */}
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

            {/* CloudFront -> API Gateway (down to row 2) */}
            <line x1="250" y1="90" x2="250" y2="130" stroke="#0284C7" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#0284C7" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />
            <text x="175" y="126" textAnchor="middle" fill="#A8A29E" fontSize="7">/api/* routing</text>

            {/* ── Row 2: API Gateway -> Lambda Proxy -> Lambda Worker <-> DynamoDB ── */}
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
            <text x="430" y="226" textAnchor="middle" fill="#78716C" fontSize="8">300s timeout</text>

            <line x1="460" y1="180" x2="560" y2="180" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#292524" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#78716C" fontSize="8">Session State + TTL</text>

            {/* ── Row 3: AgentCore Runtime -> Agents -> Bedrock, ECR connected ── */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#0284C7" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#0284C7" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#292524" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#78716C" fontSize="8">Bedrock Managed Container</text>

            <line x1="200" y1="340" x2="310" y2="340" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />

            {/* Agent boxes - Sky, Coral, Green */}
            <rect x="320" y="305" width="120" height="32" rx="6" fill="#F0F9FF" stroke="#0284C7" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#0284C7" fontSize="9" fontWeight="600">Claims Intake Agent</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="#FFF7ED" stroke="#F97316" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#EA580C" fontSize="9" fontWeight="600">Damage Assessor</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="#F0FDF4" stroke="#16A34A" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#15803D" fontSize="9" fontWeight="600">Settlement Recommender</text>

            <line x1="440" y1="360" x2="540" y2="360" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#292524" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#78716C" fontSize="8">Claude Sonnet (LLM)</text>

            {/* ECR -> AgentCore */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#292524" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#78716C" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#0284C7" strokeWidth="1.5" markerEnd="url(#arrowSky)" />

            {/* Monitoring sidebar */}
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
          AI Claims Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.agents.map((agent, i) => {
            const colors = [
              { bg: '#F0F9FF', border: '#0284C7', text: '#0284C7', accent: '#F0F9FF' },
              { bg: '#FFF7ED', border: '#F97316', text: '#EA580C', accent: '#FFF7ED' },
              { bg: '#F0FDF4', border: '#16A34A', text: '#15803D', accent: '#F0FDF4' },
            ][i];
            const icons = [
              'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
              'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
              'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
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
        <div className="card max-w-lg mx-auto" style={{ background: 'linear-gradient(135deg, #F0F9FF, #FFF7ED)' }}>
          <h3 className="text-xl font-extrabold mb-2 heading-dash" style={{ color: 'var(--charcoal)' }}>Ready to process claims?</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            Try the assessment engine with test claim <code className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'white', color: 'var(--sky-700)' }}>CLM001</code>
          </p>
          <Link to="/console"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #0284C7, #38BDF8)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Run Assessment
          </Link>
        </div>
      </section>
    </div>
  );
}
