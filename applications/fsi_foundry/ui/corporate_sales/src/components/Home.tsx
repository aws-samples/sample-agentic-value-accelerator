import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Circular Gauge Preview ─────────────────────── */
function GaugePreview() {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const previewScore = 78;
  const dashLen = (previewScore / 100) * circumference;

  return (
    <div className="score-gauge" style={{ width: 160, height: 160 }}>
      <svg width="160" height="160" viewBox="0 0 140 140">
        <circle className="gauge-track" cx="70" cy="70" r={radius} />
        <circle
          className="gauge-fill"
          cx="70" cy="70" r={radius}
          stroke="#D4A017"
          style={{ strokeDasharray: `${dashLen}, ${circumference}` }}
        />
      </svg>
      <div className="gauge-value">
        <span className="gauge-number">{previewScore}</span>
        <span className="gauge-label">Lead Score</span>
      </div>
    </div>
  );
}

/* ── Sparkline SVG ──────────────────────────────── */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 80;
  const h = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(' ');

  return (
    <svg width={w} height={h} className="sparkline-container">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

/* ── Funnel Stage Bar ──────────────────────────── */
function FunnelStage({ label, width, color, delay }: { label: string; width: string; color: string; delay: string }) {
  return (
    <div
      className="funnel-bar"
      style={{ width, background: color, animationDelay: delay }}
    >
      {label}
    </div>
  );
}

export default function Home({ config }: Props) {
  const funnelStages = [
    { label: 'Prospecting', width: '100%', color: 'linear-gradient(90deg, #1A2332, #2D3748)' },
    { label: 'Qualification', width: '75%', color: 'linear-gradient(90deg, #D4A017, #E5B120)' },
    { label: 'Proposal', width: '50%', color: 'linear-gradient(90deg, #F5C842, #FCD34D)' },
    { label: 'Close', width: '30%', color: 'linear-gradient(90deg, #22C55E, #4ADE80)' },
  ];

  const analysisTypes = config.input_schema.type_options;

  const typeIcons: Record<string, string> = {
    full: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    lead_scoring: 'M13 10V3L4 14h7v7l9-11h-7z',
    opportunity_analysis: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    pitch_preparation: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z',
  };

  const agentColors: Record<string, { bg: string; border: string; icon: string }> = {
    lead_scorer: { bg: '#FFFBEB', border: '#D4A017', icon: '#D4A017' },
    opportunity_analyst: { bg: '#EFF6FF', border: '#1A2332', icon: '#1A2332' },
    pitch_preparer: { bg: '#ECFDF5', border: '#059669', icon: '#059669' },
  };

  return (
    <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      {/* ── Hero Section ──────────────────────────── */}
      <section className="animate-fade-slide-up" style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ display: 'inline-block', padding: '0.25rem 1rem', borderRadius: '999px', background: '#FEF3C7', color: '#92400E', fontSize: '0.75rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          B09 -- Corporate Banking
        </div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1F2937', letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          Corporate Sales <span className="gold-gradient-text">Intelligence</span>
        </h1>
        <p style={{ fontSize: '1.1rem', color: '#6B7280', maxWidth: '38rem', margin: '0 auto 2rem' }}>
          {config.description}
        </p>

        {/* Gauge Preview */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
          <GaugePreview />
        </div>

        {/* Quick Stats */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap' }}>
          {[
            { label: 'AI Agents', value: String(config.agents.length), spark: [3, 5, 4, 7, 6, 8, 7] },
            { label: 'Analysis Types', value: String(config.input_schema.type_options.length), spark: [2, 3, 5, 4, 6, 5, 7] },
            { label: 'Lead Score Range', value: '0-100', spark: [10, 30, 45, 60, 55, 78, 85] },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="card animate-fade-slide-up"
              style={{ minWidth: '10rem', textAlign: 'center', animationDelay: `${0.1 + i * 0.1}s` }}
            >
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#D4A017', marginBottom: '0.125rem' }}>{stat.value}</div>
              <div style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 500, marginBottom: '0.5rem' }}>{stat.label}</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Sparkline data={stat.spark} color="#D4A017" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sales Funnel Visualization ─────────── */}
      <section className="animate-fade-slide-up stagger-2" style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1F2937', textAlign: 'center', marginBottom: '1.5rem' }}>
          Sales Pipeline Funnel
        </h2>
        <div className="card" style={{ maxWidth: '36rem', margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            {funnelStages.map((stage, i) => (
              <FunnelStage
                key={stage.label}
                label={stage.label}
                width={stage.width}
                color={stage.color}
                delay={`${0.2 + i * 0.15}s`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Analysis Type Cards ───────────────── */}
      <section className="animate-fade-slide-up stagger-3" style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1F2937', textAlign: 'center', marginBottom: '1.5rem' }}>
          Analysis Capabilities
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: '1rem' }}>
          {analysisTypes.map((t, i) => (
            <div
              key={t.value}
              className="card card-gold animate-fade-slide-up"
              style={{ animationDelay: `${0.1 + i * 0.1}s` }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div style={{
                  width: '2.25rem', height: '2.25rem', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4A017" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={typeIcons[t.value] || typeIcons['full']} />
                  </svg>
                </div>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1F2937' }}>{t.label}</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#6B7280', lineHeight: 1.5 }}>
                {t.value === 'full' && 'Comprehensive analysis combining all agent capabilities into a single report.'}
                {t.value === 'lead_scoring' && 'Score leads 0-100 with tier classification based on firmographic data.'}
                {t.value === 'opportunity_analysis' && 'Evaluate deal probability, competitive landscape, and pricing strategy.'}
                {t.value === 'pitch_preparation' && 'Generate customized pitch decks with ROI projections and talking points.'}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Architecture Diagram ──────────────── */}
      <section className="animate-fade-slide-up stagger-4" style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1F2937', textAlign: 'center', marginBottom: '1.5rem' }}>
          Agent Architecture
        </h2>
        <div className="card" style={{ maxWidth: '48rem', margin: '0 auto', padding: '2rem', overflow: 'hidden' }}>
          <svg viewBox="0 0 960 520" style={{ width: '100%', height: 'auto' }}>
            <defs>
              <marker id="arrowGold" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill="#D4A017" />
              </marker>
            </defs>

            {/* ── Row 1: User → CloudFront → S3 ── */}
            <rect x="40" y="20" width="100" height="70" rx="10" fill="#FFFBEB" stroke="#D4A017" strokeWidth="1.5" />
            <text x="90" y="50" textAnchor="middle" fill="#D4A017" fontSize="11" fontWeight="600">User Browser</text>
            <text x="90" y="66" textAnchor="middle" fill="#737373" fontSize="8">SPA Client</text>

            <line x1="140" y1="55" x2="220" y2="55" stroke="#D4A017" strokeWidth="1.5" markerEnd="url(#arrowGold)" />

            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="74" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">CloudFront</text>
            <text x="250" y="86" textAnchor="middle" fill="#737373" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="55" x2="370" y2="55" stroke="#D4A017" strokeWidth="1.5" markerEnd="url(#arrowGold)" />
            <text x="325" y="48" textAnchor="middle" fill="#A3A3A3" fontSize="7">OAC</text>

            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="74" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">S3</text>
            <text x="400" y="86" textAnchor="middle" fill="#737373" fontSize="8">Static UI Assets</text>

            {/* CloudFront → API Gateway (down to row 2) */}
            <line x1="250" y1="90" x2="250" y2="130" stroke="#D4A017" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#D4A017" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#D4A017" strokeWidth="1.5" markerEnd="url(#arrowGold)" />
            <text x="175" y="126" textAnchor="middle" fill="#A3A3A3" fontSize="7">/api/* routing</text>

            {/* ── Row 2: API Gateway → Lambda Proxy → Lambda Worker ↔ DynamoDB ── */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
            <text x="100" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">API Gateway</text>
            <text x="100" y="226" textAnchor="middle" fill="#737373" fontSize="8">HTTP API</text>

            <line x1="130" y1="180" x2="230" y2="180" stroke="#D4A017" strokeWidth="1.5" markerEnd="url(#arrowGold)" />

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
            <text x="260" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Lambda Proxy</text>
            <text x="260" y="226" textAnchor="middle" fill="#737373" fontSize="8">30s timeout</text>
            <text x="260" y="237" textAnchor="middle" fill="#A3A3A3" fontSize="7">POST /invoke, GET /status</text>

            <line x1="290" y1="180" x2="400" y2="180" stroke="#D4A017" strokeWidth="1.5" markerEnd="url(#arrowGold)" />
            <text x="345" y="174" textAnchor="middle" fill="#A3A3A3" fontSize="7">async</text>

            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
            <text x="430" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Lambda Worker</text>
            <text x="430" y="226" textAnchor="middle" fill="#737373" fontSize="8">300s timeout</text>

            <line x1="460" y1="180" x2="560" y2="180" stroke="#D4A017" strokeWidth="1.5" markerEnd="url(#arrowGold)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#D4A017" strokeWidth="1.5" markerEnd="url(#arrowGold)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#737373" fontSize="8">Session State + TTL</text>

            {/* ── Row 3: AgentCore Runtime → Agents → Bedrock, ECR connected ── */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#D4A017" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#D4A017" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#D4A017" strokeWidth="1.5" markerEnd="url(#arrowGold)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#737373" fontSize="8">Bedrock Managed Container</text>

            <line x1="200" y1="340" x2="310" y2="340" stroke="#D4A017" strokeWidth="1.5" markerEnd="url(#arrowGold)" />

            {/* Agent boxes */}
            <rect x="320" y="305" width="120" height="32" rx="6" fill="#FFFBEB" stroke="#D4A017" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#D4A017" fontSize="9" fontWeight="600">Lead Scorer</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="#EFF6FF" stroke="#1A2332" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#1A2332" fontSize="9" fontWeight="600">Opportunity Analyst</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="#ECFDF5" stroke="#22C55E" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#22C55E" fontSize="9" fontWeight="600">Pitch Preparer</text>

            <line x1="440" y1="360" x2="540" y2="360" stroke="#D4A017" strokeWidth="1.5" markerEnd="url(#arrowGold)" />

            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#737373" fontSize="8">Claude Sonnet (LLM)</text>

            {/* ECR → AgentCore */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#737373" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#D4A017" strokeWidth="1.5" markerEnd="url(#arrowGold)" />

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

      {/* ── Agent Cards ───────────────────────── */}
      <section className="animate-fade-slide-up stagger-5" style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1F2937', textAlign: 'center', marginBottom: '1.5rem' }}>
          AI Agent Team
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: '1rem' }}>
          {config.agents.map((agent, i) => {
            const colors = agentColors[agent.id] || agentColors['lead_scorer'];
            return (
              <div
                key={agent.id}
                className="card animate-fade-slide-up"
                style={{
                  borderLeft: `4px solid ${colors.border}`,
                  background: colors.bg,
                  animationDelay: `${0.2 + i * 0.15}s`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{
                    width: '2.5rem', height: '2.5rem', borderRadius: '50%',
                    background: colors.border, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {agent.id === 'lead_scorer' && <path d="M13 10V3L4 14h7v7l9-11h-7z" />}
                      {agent.id === 'opportunity_analyst' && <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>}
                      {agent.id === 'pitch_preparer' && <><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>}
                    </svg>
                  </div>
                  <h3 style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1F2937' }}>{agent.name}</h3>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#4B5563', lineHeight: 1.6 }}>{agent.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────── */}
      <section className="animate-fade-slide-up stagger-6" style={{ textAlign: 'center' }}>
        <div className="card" style={{ maxWidth: '32rem', margin: '0 auto', background: 'linear-gradient(135deg, #1A2332, #0C1222)', color: 'white', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Ready to Analyze?</h3>
          <p style={{ fontSize: '0.85rem', color: '#9CA3AF', marginBottom: '1.25rem' }}>
            Start with test lead <span style={{ fontFamily: 'monospace', color: '#FCD34D', fontWeight: 600 }}>LEAD001</span>
          </p>
          <Link
            to="/console"
            style={{
              display: 'inline-block',
              padding: '0.75rem 2rem',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #D4A017, #F5C842)',
              color: '#1F2937',
              fontWeight: 700,
              fontSize: '0.9rem',
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(212, 160, 23, 0.3)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            Analyze Lead
          </Link>
        </div>
      </section>
    </div>
  );
}
