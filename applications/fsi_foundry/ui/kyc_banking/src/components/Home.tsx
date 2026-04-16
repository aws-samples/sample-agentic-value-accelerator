import { useNavigate } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-grid opacity-60" />
      <div className="absolute inset-0 bg-mesh" />
      <div
        className="absolute w-[500px] h-[500px] rounded-full animate-float"
        style={{
          top: '-10%', right: '-5%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.06) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute w-[400px] h-[400px] rounded-full animate-float"
        style={{
          bottom: '5%', left: '-5%',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.05) 0%, transparent 70%)',
          animationDelay: '1.5s',
        }}
      />
    </div>
  );
}

function AgentCard({ name, description, index }: { name: string; description: string; index: number }) {
  const icons = [
    <svg key="ca" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>,
    <svg key="co" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>,
  ];

  return (
    <div
      className="card-glow group animate-fade-in cursor-default"
      style={{ animationDelay: `${0.2 + index * 0.1}s` }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all group-hover:scale-110"
        style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05))',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          color: 'var(--accent)',
        }}
      >
        {icons[index % icons.length]}
      </div>
      <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{name}</h3>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{description}</p>
    </div>
  );
}

export default function Home({ config }: { config: RuntimeConfig }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-4rem)] relative overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <GridBackground />

      <div className="relative max-w-7xl mx-auto px-6 py-20">
        {/* Hero */}
        <div className="text-center mb-20 animate-fade-in">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono uppercase tracking-widest mb-6"
            style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              color: 'var(--accent)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--accent)' }} />
            {config.domain} &mdash; AI-Powered KYC
          </div>
          <h1 className="text-6xl font-extrabold mb-6 leading-tight">
            <span style={{ color: 'var(--text-primary)' }}>Know Your </span>
            <span style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, #10b981 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Customer
            </span>
            <br />
            <span style={{ color: 'var(--text-primary)' }}>Assessment</span>
          </h1>
          <p className="text-lg max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {config.description}. Powered by {config.agents.length} specialized AI agents
            for credit analysis and compliance verification.
          </p>
          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/console')} className="btn-primary text-base px-10 py-3.5">
              Start Assessment
            </button>
            <button
              onClick={() => document.getElementById('pipeline')?.scrollIntoView({ behavior: 'smooth' })}
              className="btn-secondary text-base px-10 py-3.5"
            >
              How it Works
            </button>
          </div>
        </div>

        {/* Architecture Diagram */}
        <div className="max-w-5xl mx-auto mb-20">
          <h2 className="text-sm font-mono uppercase tracking-widest text-center mb-10 animate-fade-in stagger-1" style={{ color: 'var(--accent)' }}>
            Architecture
          </h2>
          <div className="card-glow animate-fade-in p-8" style={{ animationDelay: '0.15s' }}>
            <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
              <defs>
                <marker id="arrow-k" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="var(--accent)" />
                </marker>
                <filter id="glow-k">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Row 1: User → CloudFront → S3 */}
              <rect x="30" y="20" width="120" height="70" rx="12" fill="rgba(59,130,246,0.04)" stroke="var(--accent)" strokeWidth="1" />
              <text x="90" y="48" textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="bold">User</text>
              <text x="90" y="66" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="220" y2="55" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-k)" />

              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
              <text x="250" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">CloudFront</text>
              <text x="250" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">CDN + SPA Rewrite</text>

              <line x1="280" y1="45" x2="370" y2="45" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-k)" strokeDasharray="4,3" />
              <text x="325" y="38" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">static</text>

              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
              <text x="400" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">S3</text>
              <text x="400" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">UI Assets (OAC)</text>

              {/* Row 2: API GW → Lambda Proxy → Lambda Worker ↔ DynamoDB */}
              <line x1="250" y1="90" x2="250" y2="140" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-k)" />
              <text x="262" y="120" textAnchor="start" fill="var(--text-secondary)" fontSize="8">/api/*</text>

              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="148" width="36" height="36" />
              <text x="100" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">API Gateway</text>
              <text x="100" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">HTTP API</text>

              <line x1="130" y1="166" x2="250" y2="166" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-k)" />

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="262" y="148" width="36" height="36" />
              <text x="280" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Proxy</text>
              <text x="280" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">POST /invoke, GET /status</text>
              <text x="280" y="221" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">30s timeout</text>

              <line x1="310" y1="166" x2="430" y2="166" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-k)" />
              <text x="370" y="158" textAnchor="middle" fill="var(--accent)" fontSize="8" fontWeight="bold">async</text>

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="442" y="148" width="36" height="36" />
              <text x="460" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Worker</text>
              <text x="460" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">300s timeout</text>

              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="622" y="148" width="36" height="36" />
              <text x="640" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">DynamoDB</text>
              <text x="640" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Session State + TTL</text>

              <line x1="490" y1="166" x2="610" y2="166" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-k)" />
              <line x1="610" y1="174" x2="490" y2="174" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-k)" strokeDasharray="4,3" />

              {/* Row 3: AgentCore → Agents → Bedrock */}
              <line x1="460" y1="222" x2="460" y2="280" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-k)" />

              <rect x="250" y="288" width="280" height="60" rx="12" fill="rgba(59,130,246,0.06)" stroke="var(--accent)" strokeWidth="2" filter="url(#glow-k)" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="260" y="300" width="36" height="36" />
              <text x="400" y="314" textAnchor="middle" fill="var(--accent)" fontSize="12" fontWeight="bold">AgentCore Runtime</text>
              <text x="400" y="332" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Bedrock Managed Container</text>

              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="132" y="300" width="36" height="36" />
              <text x="150" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">ECR</text>
              <text x="150" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Container Image</text>

              <line x1="178" y1="318" x2="248" y2="318" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-k)" strokeDasharray="4,3" />

              <line x1="340" y1="348" x2="320" y2="400" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="440" y1="348" x2="530" y2="400" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4,3" />

              <rect x="220" y="405" width="170" height="32" rx="8" fill="rgba(59,130,246,0.04)" stroke="var(--accent)" strokeWidth="1" />
              <text x="305" y="425" textAnchor="middle" fill="var(--accent)" fontSize="10" fontWeight="bold">Credit Analyst</text>

              <rect x="440" y="405" width="190" height="32" rx="8" fill="rgba(59,130,246,0.04)" stroke="var(--accent)" strokeWidth="1" />
              <text x="535" y="425" textAnchor="middle" fill="var(--accent)" fontSize="10" fontWeight="bold">Compliance Officer</text>

              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="782" y="300" width="36" height="36" />
              <text x="800" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">Bedrock</text>
              <text x="800" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Claude Sonnet</text>
              <text x="800" y="373" textAnchor="middle" fill="var(--text-secondary)" fontSize="7">LLM Inference</text>

              <line x1="530" y1="318" x2="778" y2="318" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-k)" />
              <text x="654" y="310" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">LLM inference</text>

              <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="822" y="148" width="36" height="36" />
              <text x="840" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="9" fontWeight="bold">CloudWatch</text>

              <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="892" y="148" width="36" height="36" />
              <text x="910" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="9" fontWeight="bold">X-Ray</text>

              <text x="875" y="215" textAnchor="middle" fill="var(--text-secondary)" fontSize="7">Observability</text>
            </svg>
          </div>
        </div>

        {/* Pipeline */}
        <div id="pipeline" className="max-w-5xl mx-auto mb-20">
          <h2 className="text-sm font-mono uppercase tracking-widest text-center mb-10 animate-fade-in stagger-1" style={{ color: 'var(--accent)' }}>
            KYC Assessment Pipeline
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {[
              { num: '01', title: 'Submit Request', desc: 'Enter a Customer ID and select assessment type (Full, Credit Only, or Compliance Only). The UI sends a POST to /api/invoke via CloudFront.' },
              { num: '02', title: 'Credit Analysis', desc: 'AI Credit Analyst evaluates financial health, payment history, credit exposure, and transaction patterns to compute a risk score.' },
              { num: '03', title: 'Compliance Check', desc: 'AI Compliance Officer runs sanctions screening, PEP verification, adverse media checks, and AML/KYC regulatory compliance.' },
              { num: '04', title: 'Decision', desc: 'Results are synthesized into APPROVE, REJECT, or ESCALATE recommendation with credit risk score, compliance status, and full audit trail.' },
            ].map((step, i) => (
              <div
                key={step.num}
                className="card-glow animate-fade-in"
                style={{ animationDelay: `${0.1 + i * 0.12}s` }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-mono text-2xl font-bold" style={{ color: 'var(--accent)', opacity: 0.5 }}>{step.num}</span>
                  <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
                </div>
                <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tech stack */}
        <div className="max-w-5xl mx-auto mb-20">
          <h2 className="text-sm font-mono uppercase tracking-widest text-center mb-10 animate-fade-in stagger-2" style={{ color: 'var(--accent)' }}>
            Technology Stack
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { label: 'Runtime', value: 'Amazon Bedrock AgentCore', detail: 'Managed container runtime for multi-agent orchestration' },
              { label: 'LLM', value: 'Claude Sonnet (Bedrock)', detail: 'Foundation model for financial reasoning and compliance analysis' },
              { label: 'Framework', value: 'LangGraph / Strands', detail: 'Agent orchestration with parallel execution support' },
              { label: 'API Layer', value: 'API Gateway + Lambda', detail: 'Serverless async invoke pattern with proxy/worker split' },
              { label: 'State Store', value: 'DynamoDB', detail: 'Session tracking with TTL-based automatic cleanup' },
              { label: 'CDN & Hosting', value: 'CloudFront + S3', detail: 'SPA hosting with origin access control and /api routing' },
            ].map((item, i) => (
              <div
                key={item.label}
                className="card-glow animate-fade-in"
                style={{ animationDelay: `${0.15 + i * 0.08}s` }}
              >
                <p className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--accent)' }}>{item.label}</p>
                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{item.value}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Agents */}
        <div className="max-w-3xl mx-auto mb-16">
          <h2 className="text-sm font-mono uppercase tracking-widest text-center mb-10 animate-fade-in stagger-2" style={{ color: 'var(--accent)' }}>
            AI Agents
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {config.agents.map((agent, i) => (
              <AgentCard
                key={agent.id}
                name={agent.name}
                description={agent.id === 'credit_analyst'
                  ? 'Analyzes financial statements, credit history, payment behavior, and transaction patterns to assess creditworthiness.'
                  : 'Performs KYC/AML verification including sanctions screening, PEP checks, adverse media, and regulatory compliance.'}
                index={i}
              />
            ))}
          </div>
        </div>

        {/* Quick test */}
        <div className="max-w-lg mx-auto animate-fade-in stagger-3">
          <div
            onClick={() => navigate('/console')}
            className="card group cursor-pointer text-center"
            style={{ border: '1px dashed var(--border)' }}
          >
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Quick test with sample customers
            </p>
            <div className="flex justify-center gap-2">
              {config.input_schema.test_entities.map((id) => (
                <code
                  key={id}
                  className="inline-block px-3 py-1 rounded text-xs font-mono"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}
                >
                  {id}
                </code>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
