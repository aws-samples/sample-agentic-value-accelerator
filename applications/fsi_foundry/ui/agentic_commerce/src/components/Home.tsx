import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Sample product cards for catalog ── */
const products = [
  { name: 'Premium Savings', category: 'Savings', gradient: 'savings', rate: '4.5% APY', desc: 'High-yield savings with no minimum balance and instant access to funds.' },
  { name: 'Platinum Credit', category: 'Credit', gradient: 'credit', rate: '1.5% Cash Back', desc: 'Premium rewards card with travel perks, purchase protection, and no annual fee.' },
  { name: 'Smart Mortgage', category: 'Mortgage', gradient: 'mortgage', rate: 'From 5.2%', desc: 'Flexible home financing with competitive rates and digital-first application.' },
  { name: 'Growth Portfolio', category: 'Investment', gradient: 'investment', rate: '8.3% Avg Return', desc: 'AI-managed diversified portfolio tailored to your risk profile and goals.' },
];

const stats = [
  { value: '3', label: 'AI Agents', icon: '>' },
  { value: '4', label: 'Commerce Flows', icon: '#' },
  { value: '98%', label: 'Personalization', icon: '*' },
];

const flowStages = [
  {
    title: 'Generate Offers',
    desc: 'AI creates personalized product offers based on customer profile',
    color: '#E11D48',
    iconPath: 'M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6m16-4H4m16 0l-2-4H6L4 8m16 0v4M4 8v4m8-8v4m-2 4h4',
  },
  {
    title: 'Match Products',
    desc: 'Intelligent matching engine finds best-fit banking products',
    color: '#4F46E5',
    iconPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    title: 'Fulfill Order',
    desc: 'Automated fulfillment across digital, branch, and phone channels',
    color: '#34D399',
    iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
];

export default function Home({ config }: Props) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-16">

      {/* ── Hero ── */}
      <section className="text-center animate-fadeSlideUp">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
          style={{ background: 'var(--rose-50)', color: 'var(--rose-600)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          AI-Powered Banking Commerce
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight mb-4" style={{ color: 'var(--charcoal)' }}>
          Personalized Banking
          <span className="block" style={{ color: 'var(--rose-600)' }}>Commerce Platform</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>
          {config.description}. Leverage AI agents to generate offers, match products, and
          fulfill orders across every channel.
        </p>

        {/* ── Animated offer card carousel preview ── */}
        <div className="flex justify-center gap-6 mb-12">
          {['Premium Savings', 'Platinum Credit', 'Growth Portfolio'].map((name, i) => (
            <div key={name}
              className="offer-card w-52 animate-floatCard"
              style={{ animationDelay: `${i * 0.8}s` }}>
              <div className={`offer-card-header ${['savings', 'credit', 'investment'][i]}`}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8">
                  <path d={flowStages[i].iconPath} />
                </svg>
                <div className="price-tag">{['4.5% APY', '1.5% CB', '8.3% Ret'][i]}</div>
              </div>
              <div className="offer-card-body">
                <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{name}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>AI-recommended</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="grid grid-cols-3 gap-6 max-w-2xl mx-auto animate-fadeSlideUp stagger-1">
        {stats.map((s) => (
          <div key={s.label} className="card text-center">
            <div className="text-3xl font-extrabold mb-1" style={{ color: 'var(--rose-600)' }}>{s.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Commerce Flow Visualization ── */}
      <section className="animate-fadeSlideUp stagger-2">
        <h2 className="text-2xl font-extrabold text-center mb-8" style={{ color: 'var(--charcoal)' }}>
          Commerce Flow
        </h2>
        <div className="flex items-center justify-center gap-4">
          {flowStages.map((stage, i) => (
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
              {i < flowStages.length - 1 && (
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                  <path d="M4 12h20m0 0l-6-6m6 6l-6 6" stroke="var(--warm-gray-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Product Catalog ── */}
      <section className="animate-fadeSlideUp stagger-3">
        <h2 className="text-2xl font-extrabold text-center mb-2" style={{ color: 'var(--charcoal)' }}>
          Banking Product Catalog
        </h2>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-muted)' }}>
          AI-curated products matched to customer needs
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((p) => (
            <div key={p.name} className="offer-card">
              <div className={`offer-card-header ${p.gradient}`}>
                <span className="text-white font-bold text-lg opacity-90">{p.category}</span>
                <div className="price-tag">{p.rate}</div>
              </div>
              <div className="offer-card-body">
                <h3 className="text-sm font-bold mb-1.5" style={{ color: 'var(--charcoal)' }}>{p.name}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{p.desc}</p>
              </div>
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
              <marker id="arrowRose" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill="#E11D48" />
              </marker>
            </defs>

            {/* ── Row 1: User → CloudFront → S3 ── */}
            <rect x="40" y="20" width="100" height="70" rx="10" fill="#FFF1F2" stroke="#E11D48" strokeWidth="1.5" />
            <text x="90" y="50" textAnchor="middle" fill="#E11D48" fontSize="11" fontWeight="600">User Browser</text>
            <text x="90" y="66" textAnchor="middle" fill="#737373" fontSize="8">SPA Client</text>

            <line x1="140" y1="55" x2="220" y2="55" stroke="#E11D48" strokeWidth="1.5" markerEnd="url(#arrowRose)" />

            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="74" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">CloudFront</text>
            <text x="250" y="86" textAnchor="middle" fill="#737373" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="55" x2="370" y2="55" stroke="#E11D48" strokeWidth="1.5" markerEnd="url(#arrowRose)" />
            <text x="325" y="48" textAnchor="middle" fill="#A3A3A3" fontSize="7">OAC</text>

            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="74" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">S3</text>
            <text x="400" y="86" textAnchor="middle" fill="#737373" fontSize="8">Static UI Assets</text>

            {/* CloudFront → API Gateway (down to row 2) */}
            <line x1="250" y1="90" x2="250" y2="130" stroke="#E11D48" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#E11D48" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#E11D48" strokeWidth="1.5" markerEnd="url(#arrowRose)" />
            <text x="175" y="126" textAnchor="middle" fill="#A3A3A3" fontSize="7">/api/* routing</text>

            {/* ── Row 2: API Gateway → Lambda Proxy → Lambda Worker ↔ DynamoDB ── */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
            <text x="100" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">API Gateway</text>
            <text x="100" y="226" textAnchor="middle" fill="#737373" fontSize="8">HTTP API</text>

            <line x1="130" y1="180" x2="230" y2="180" stroke="#E11D48" strokeWidth="1.5" markerEnd="url(#arrowRose)" />

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
            <text x="260" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Lambda Proxy</text>
            <text x="260" y="226" textAnchor="middle" fill="#737373" fontSize="8">30s timeout</text>
            <text x="260" y="237" textAnchor="middle" fill="#A3A3A3" fontSize="7">POST /invoke, GET /status</text>

            <line x1="290" y1="180" x2="400" y2="180" stroke="#E11D48" strokeWidth="1.5" markerEnd="url(#arrowRose)" />
            <text x="345" y="174" textAnchor="middle" fill="#A3A3A3" fontSize="7">async</text>

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
            <text x="430" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Lambda Worker</text>
            <text x="430" y="226" textAnchor="middle" fill="#737373" fontSize="8">300s timeout</text>

            <line x1="460" y1="180" x2="560" y2="180" stroke="#E11D48" strokeWidth="1.5" markerEnd="url(#arrowRose)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#E11D48" strokeWidth="1.5" markerEnd="url(#arrowRose)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#737373" fontSize="8">Session State + TTL</text>

            {/* ── Row 3: AgentCore Runtime → Agents → Bedrock, ECR connected ── */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#E11D48" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#E11D48" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#E11D48" strokeWidth="1.5" markerEnd="url(#arrowRose)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#737373" fontSize="8">Bedrock Managed Container</text>

            <line x1="200" y1="340" x2="310" y2="340" stroke="#E11D48" strokeWidth="1.5" markerEnd="url(#arrowRose)" />

            {/* Agent boxes */}
            <rect x="320" y="305" width="120" height="32" rx="6" fill="#FFF1F2" stroke="#E11D48" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#E11D48" fontSize="9" fontWeight="600">Offer Engine</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="#ECFDF5" stroke="#34D399" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#34D399" fontSize="9" fontWeight="600">Fulfillment Agent</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="#EEF2FF" stroke="#4F46E5" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#4F46E5" fontSize="9" fontWeight="600">Product Matcher</text>

            <line x1="440" y1="360" x2="540" y2="360" stroke="#E11D48" strokeWidth="1.5" markerEnd="url(#arrowRose)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#737373" fontSize="8">Claude Sonnet (LLM)</text>

            {/* ECR → AgentCore */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#737373" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#E11D48" strokeWidth="1.5" markerEnd="url(#arrowRose)" />

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
              { bg: '#FFF1F2', border: '#E11D48', text: '#E11D48', accent: '#FFF1F2' },
              { bg: '#EEF2FF', border: '#4F46E5', text: '#4F46E5', accent: '#EEF2FF' },
              { bg: '#ECFDF5', border: '#34D399', text: '#059669', accent: '#ECFDF5' },
            ][i];
            const icons = [
              'M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6m16-4H4m16 0l-2-4H6L4 8m16 0v4M4 8v4m8-8v4m-2 4h4',
              'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
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
        <div className="card max-w-lg mx-auto" style={{ background: 'linear-gradient(135deg, #FFF1F2, #EEF2FF)' }}>
          <h3 className="text-xl font-extrabold mb-2" style={{ color: 'var(--charcoal)' }}>Ready to process?</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            Try the commerce engine with test customer <code className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'white', color: 'var(--rose-600)' }}>COM001</code>
          </p>
          <Link to="/console"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #E11D48, #FB7185)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
            Process Order
          </Link>
        </div>
      </section>
    </div>
  );
}
