import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Sample protection metrics for the dashboard feed ── */
const sampleMetrics = [
  { headline: 'Young family with $250K coverage gap identified', status: 'gap', stage: 'Family', time: '1h ago', coverage: '$500K' },
  { headline: 'Term life policy matched for income replacement needs', status: 'covered', stage: 'Established', time: '3h ago', coverage: '$1.2M' },
  { headline: 'Underwriting flagged elevated BMI for further review', status: 'partial', stage: 'Pre-Retirement', time: '5h ago', coverage: '$750K' },
  { headline: 'Comprehensive coverage confirmed with no gaps detected', status: 'covered', stage: 'Young Adult', time: '6h ago', coverage: '$300K' },
];

const stats = [
  { value: '3', label: 'AI Agents', icon: 'agents' },
  { value: '4', label: 'Analysis Modes', icon: 'modes' },
  { value: '10+', label: 'Risk Factors', icon: 'factors' },
];

const pipelineStages = [
  {
    title: 'Analyze Needs',
    desc: 'AI evaluates life stage, income, dependents, and obligations to determine optimal coverage',
    color: '#2563EB',
    iconPath: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2m5.5-6a4 4 0 100-8 4 4 0 000 8zm11 11v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75',
  },
  {
    title: 'Match Products',
    desc: 'Recommend optimal insurance products with coverage amounts and premium estimates',
    color: '#166534',
    iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    title: 'Assess Underwriting',
    desc: 'Evaluate health and lifestyle risk factors to determine risk category and confidence',
    color: '#E11D48',
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
];

export default function Home({ config }: Props) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-16">

      {/* ── Hero ── */}
      <section className="text-center animate-fadeSlideUp">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
          style={{ background: 'var(--blue-50)', color: 'var(--blue-800)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
          AI-Powered Life Protection
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 heading-dash" style={{ color: 'var(--text-primary)' }}>
          Life Insurance Agent
          <span className="block" style={{ color: 'var(--blue-600)' }}>Protection Dashboard</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>
          {config.description}. Analyze protection needs, match optimal products,
          and streamline underwriting assessments.
        </p>

        {/* ── Protection monitoring feed preview ── */}
        <div className="relative max-w-3xl mx-auto mb-12 overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--warm-gray-200)', background: 'white' }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'var(--warm-gray-100)', background: 'var(--blue-800)' }}>
            <div className="protection-pulse covered" />
            <span className="text-xs font-bold" style={{ color: '#93C5FD' }}>PROTECTION ANALYSIS FEED</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--warm-gray-200)' }}>
            {sampleMetrics.map((metric, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-fadeSlideUp"
                style={{ animationDelay: `${i * 0.15}s` }}>
                <div className={`protection-pulse ${metric.status}`} />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{metric.headline}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="need-tag">{metric.stage}</span>
                    <span className="factor-tag">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                      </svg>
                      {metric.coverage}
                    </span>
                  </div>
                </div>
                <span className={`stage-badge ${metric.status === 'covered' ? 'family' : metric.status === 'partial' ? 'established' : 'young'}`}>
                  {metric.status === 'covered' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {metric.status === 'partial' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                  )}
                  {metric.status === 'gap' && (
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
            <div className="text-3xl font-extrabold mb-1" style={{ color: 'var(--blue-600)' }}>{s.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Pipeline Visualization ── */}
      <section className="animate-fadeSlideUp stagger-2">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-dash" style={{ color: 'var(--text-primary)' }}>
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
                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{stage.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{stage.desc}</p>
              </div>
              {i < pipelineStages.length - 1 && (
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                  <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Protection Domains Showcase ── */}
      <section className="animate-fadeSlideUp stagger-3">
        <h2 className="text-2xl font-extrabold text-center mb-2 heading-dash" style={{ color: 'var(--text-primary)' }}>
          Protection Capabilities
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          AI-driven insurance intelligence across key protection dimensions
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { name: 'Needs Assessment', level: 'high', icon: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2m5.5-6a4 4 0 100-8 4 4 0 000 8z', desc: 'Comprehensive life stage evaluation considering income, dependents, debts, and future financial obligations' },
            { name: 'Coverage Gap Analysis', level: 'medium', icon: 'M22 12h-4l-3 9L9 3l-3 9H2', desc: 'Identify shortfalls between current protection and recommended coverage with income replacement modeling' },
            { name: 'Product Matching', level: 'medium', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'Match applicant profiles to term, whole, universal, and variable life products with premium comparison' },
            { name: 'Risk Underwriting', level: 'low', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', desc: 'Automated health and lifestyle factor assessment with risk categorization and confidence scoring' },
          ].map((cat) => (
            <div key={cat.name} className={`recommendation-card ${cat.level}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: cat.level === 'high' ? 'var(--blue-50)' : cat.level === 'medium' ? 'var(--amber-50)' : 'var(--warm-gray-100)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke={cat.level === 'high' ? 'var(--blue-600)' : cat.level === 'medium' ? '#F59E0B' : 'var(--warm-gray-500)'}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={cat.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{cat.name}</h3>
                  <span className={`confidence-badge ${cat.level}`}>{cat.level} coverage</span>
                </div>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{cat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Architecture Diagram (SVG with Blue arrows) ── */}
      <section className="animate-fadeSlideUp stagger-4">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-dash" style={{ color: 'var(--text-primary)' }}>
          Platform Architecture
        </h2>
        <div className="card p-8 max-w-4xl mx-auto">
          <svg viewBox="0 0 960 520" fill="none" className="w-full">
            <defs>
              <marker id="arrowBlue" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill="#2563EB" />
              </marker>
            </defs>

            {/* ── Row 1: User -> CloudFront -> S3 ── */}
            <rect x="40" y="20" width="100" height="70" rx="10" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5" />
            <text x="90" y="50" textAnchor="middle" fill="#2563EB" fontSize="11" fontWeight="600">User Browser</text>
            <text x="90" y="66" textAnchor="middle" fill="#78716C" fontSize="8">SPA Client</text>

            <line x1="140" y1="55" x2="220" y2="55" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="74" textAnchor="middle" fill="#1E293B" fontSize="10" fontWeight="600">CloudFront</text>
            <text x="250" y="86" textAnchor="middle" fill="#78716C" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="55" x2="370" y2="55" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />
            <text x="325" y="48" textAnchor="middle" fill="#A8A29E" fontSize="7">OAC</text>

            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="74" textAnchor="middle" fill="#1E293B" fontSize="10" fontWeight="600">S3</text>
            <text x="400" y="86" textAnchor="middle" fill="#78716C" fontSize="8">Static UI Assets</text>

            {/* CloudFront -> API Gateway (down to row 2) */}
            <line x1="250" y1="90" x2="250" y2="130" stroke="#2563EB" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#2563EB" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />
            <text x="175" y="126" textAnchor="middle" fill="#A8A29E" fontSize="7">/api/* routing</text>

            {/* ── Row 2: API Gateway -> Lambda Proxy -> Lambda Worker <-> DynamoDB ── */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
            <text x="100" y="214" textAnchor="middle" fill="#1E293B" fontSize="10" fontWeight="600">API Gateway</text>
            <text x="100" y="226" textAnchor="middle" fill="#78716C" fontSize="8">HTTP API</text>

            <line x1="130" y1="180" x2="230" y2="180" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
            <text x="260" y="214" textAnchor="middle" fill="#1E293B" fontSize="10" fontWeight="600">Lambda Proxy</text>
            <text x="260" y="226" textAnchor="middle" fill="#78716C" fontSize="8">30s timeout</text>
            <text x="260" y="237" textAnchor="middle" fill="#A8A29E" fontSize="7">POST /invoke, GET /status</text>

            <line x1="290" y1="180" x2="400" y2="180" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />
            <text x="345" y="174" textAnchor="middle" fill="#A8A29E" fontSize="7">async</text>

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
            <text x="430" y="214" textAnchor="middle" fill="#1E293B" fontSize="10" fontWeight="600">Lambda Worker</text>
            <text x="430" y="226" textAnchor="middle" fill="#78716C" fontSize="8">300s timeout</text>

            <line x1="460" y1="180" x2="560" y2="180" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#1E293B" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#78716C" fontSize="8">Session State + TTL</text>

            {/* ── Row 3: AgentCore Runtime -> Agents -> Bedrock, ECR connected ── */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#2563EB" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#2563EB" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#1E293B" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#78716C" fontSize="8">Bedrock Managed Container</text>

            <line x1="200" y1="340" x2="310" y2="340" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

            {/* Agent boxes - Blue, Green, Rose */}
            <rect x="320" y="305" width="120" height="32" rx="6" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#2563EB" fontSize="9" fontWeight="600">Needs Analyst</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="#F0FDF4" stroke="#166534" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#166534" fontSize="9" fontWeight="600">Product Matcher</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="#FFF1F2" stroke="#E11D48" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#E11D48" fontSize="9" fontWeight="600">Underwriting Asst.</text>

            <line x1="440" y1="360" x2="540" y2="360" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#1E293B" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#78716C" fontSize="8">Claude Sonnet (LLM)</text>

            {/* ECR -> AgentCore */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#1E293B" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#78716C" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

            {/* Monitoring sidebar */}
            <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="802" y="162" width="36" height="36" />
            <text x="820" y="214" textAnchor="middle" fill="#1E293B" fontSize="9" fontWeight="600">CloudWatch</text>

            <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="882" y="162" width="36" height="36" />
            <text x="900" y="214" textAnchor="middle" fill="#1E293B" fontSize="9" fontWeight="600">X-Ray</text>

            <line x1="790" y1="180" x2="628" y2="180" stroke="#D6D3D1" strokeWidth="1" strokeDasharray="4,3" />
            <text x="710" y="174" textAnchor="middle" fill="#A8A29E" fontSize="7">Observability</text>
          </svg>
        </div>
      </section>

      {/* ── Agent Cards ── */}
      <section className="animate-fadeSlideUp stagger-5">
        <h2 className="text-2xl font-extrabold text-center mb-8 heading-dash" style={{ color: 'var(--text-primary)' }}>
          AI Insurance Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.agents.map((agent, i) => {
            const colors = [
              { bg: '#EFF6FF', border: '#2563EB', text: '#2563EB', accent: '#EFF6FF' },
              { bg: '#F0FDF4', border: '#166534', text: '#166534', accent: '#F0FDF4' },
              { bg: '#FFF1F2', border: '#E11D48', text: '#E11D48', accent: '#FFF1F2' },
            ][i];
            const icons = [
              'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2m5.5-6a4 4 0 100-8 4 4 0 000 8zm11 11v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75',
              'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
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
        <div className="card max-w-lg mx-auto" style={{ background: 'linear-gradient(135deg, #EFF6FF, #F0FDF4)' }}>
          <h3 className="text-xl font-extrabold mb-2 heading-dash" style={{ color: 'var(--text-primary)' }}>Ready to protect?</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            Try the analysis engine with test applicant <code className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'white', color: 'var(--blue-600)' }}>LIF001</code>
          </p>
          <Link to="/console"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #1E40AF, #2563EB)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
            Run Analysis
          </Link>
        </div>
      </section>
    </div>
  );
}
