import { useNavigate } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-grid opacity-60" />
      <div className="absolute inset-0 bg-mesh" />
      {/* Decorative orbs */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full animate-float"
        style={{
          top: '-10%', right: '-5%',
          background: 'radial-gradient(circle, rgba(0, 212, 170, 0.06) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute w-[400px] h-[400px] rounded-full animate-float"
        style={{
          bottom: '5%', left: '-5%',
          background: 'radial-gradient(circle, rgba(56, 100, 220, 0.05) 0%, transparent 70%)',
          animationDelay: '1.5s',
        }}
      />
    </div>
  );
}

function AgentCard({ name, description, index }: { name: string; description: string; index: number }) {
  const icons = [
    // Financial Analyst
    <svg key="fa" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>,
    // Risk Scorer
    <svg key="rs" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z" /></svg>,
    // Portfolio Analyst
    <svg key="pa" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>,
  ];

  return (
    <div
      className="card-glow group animate-fade-in cursor-default"
      style={{ animationDelay: `${0.2 + index * 0.1}s` }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all group-hover:scale-110"
        style={{
          background: 'linear-gradient(135deg, rgba(0, 212, 170, 0.15), rgba(0, 212, 170, 0.05))',
          border: '1px solid rgba(0, 212, 170, 0.2)',
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
              background: 'rgba(0, 212, 170, 0.08)',
              border: '1px solid rgba(0, 212, 170, 0.2)',
              color: 'var(--accent)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--accent)' }} />
            {config.domain} &mdash; AI-Powered Assessment
          </div>
          <h1 className="text-6xl font-extrabold mb-6 leading-tight">
            <span style={{ color: 'var(--text-primary)' }}>Intelligent </span>
            <span style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, #38bdf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Credit Risk
            </span>
            <br />
            <span style={{ color: 'var(--text-primary)' }}>Analysis</span>
          </h1>
          <p className="text-lg max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {config.description}. Powered by {config.agents.length} specialized AI agents
            working in parallel to deliver comprehensive financial assessments.
          </p>
          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/console')} className="btn-primary text-base px-10 py-3.5">
              Start Assessment
            </button>
            <button
              onClick={() => document.getElementById('agents')?.scrollIntoView({ behavior: 'smooth' })}
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
                <marker id="arrow-cr" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="var(--accent)" />
                </marker>
                <filter id="glow-cr">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Row 1: User → CloudFront → S3 */}
              <rect x="30" y="20" width="120" height="70" rx="12" fill="rgba(0,212,170,0.04)" stroke="var(--accent)" strokeWidth="1" />
              <text x="90" y="48" textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="bold">User</text>
              <text x="90" y="66" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="220" y2="55" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-cr)" />

              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
              <text x="250" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">CloudFront</text>
              <text x="250" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">CDN + SPA Rewrite</text>

              <line x1="280" y1="45" x2="370" y2="45" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-cr)" strokeDasharray="4,3" />
              <text x="325" y="38" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">static</text>

              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
              <text x="400" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">S3</text>
              <text x="400" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">UI Assets (OAC)</text>

              {/* Row 2: API GW → Lambda Proxy → Lambda Worker ↔ DynamoDB */}
              <line x1="250" y1="90" x2="250" y2="140" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-cr)" />
              <text x="262" y="120" textAnchor="start" fill="var(--text-secondary)" fontSize="8">/api/*</text>

              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="148" width="36" height="36" />
              <text x="100" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">API Gateway</text>
              <text x="100" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">HTTP API</text>

              <line x1="130" y1="166" x2="250" y2="166" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-cr)" />

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="262" y="148" width="36" height="36" />
              <text x="280" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Proxy</text>
              <text x="280" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">POST /invoke, GET /status</text>
              <text x="280" y="221" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">30s timeout</text>

              <line x1="310" y1="166" x2="430" y2="166" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-cr)" />
              <text x="370" y="158" textAnchor="middle" fill="var(--accent)" fontSize="8" fontWeight="bold">async</text>

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="442" y="148" width="36" height="36" />
              <text x="460" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Worker</text>
              <text x="460" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">300s timeout</text>

              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="622" y="148" width="36" height="36" />
              <text x="640" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">DynamoDB</text>
              <text x="640" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Session State + TTL</text>

              <line x1="490" y1="166" x2="610" y2="166" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-cr)" />
              <line x1="610" y1="174" x2="490" y2="174" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-cr)" strokeDasharray="4,3" />

              {/* Row 3: AgentCore → Agents → Bedrock */}
              <line x1="460" y1="222" x2="460" y2="280" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-cr)" />

              <rect x="250" y="288" width="280" height="60" rx="12" fill="rgba(0,212,170,0.06)" stroke="var(--accent)" strokeWidth="2" filter="url(#glow-cr)" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="260" y="300" width="36" height="36" />
              <text x="400" y="314" textAnchor="middle" fill="var(--accent)" fontSize="12" fontWeight="bold">AgentCore Runtime</text>
              <text x="400" y="332" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Bedrock Managed Container</text>

              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="132" y="300" width="36" height="36" />
              <text x="150" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">ECR</text>
              <text x="150" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Container Image</text>

              <line x1="178" y1="318" x2="248" y2="318" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#arrow-cr)" strokeDasharray="4,3" />

              <line x1="320" y1="348" x2="280" y2="400" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="390" y1="348" x2="460" y2="400" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="460" y1="348" x2="640" y2="400" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4,3" />

              <rect x="190" y="405" width="150" height="32" rx="8" fill="rgba(0,212,170,0.04)" stroke="var(--accent)" strokeWidth="1" />
              <text x="265" y="425" textAnchor="middle" fill="var(--accent)" fontSize="10" fontWeight="bold">Financial Analyst</text>

              <rect x="360" y="405" width="130" height="32" rx="8" fill="rgba(0,212,170,0.04)" stroke="var(--accent)" strokeWidth="1" />
              <text x="425" y="425" textAnchor="middle" fill="var(--accent)" fontSize="10" fontWeight="bold">Risk Scorer</text>

              <rect x="560" y="405" width="160" height="32" rx="8" fill="rgba(0,212,170,0.04)" stroke="var(--accent)" strokeWidth="1" />
              <text x="640" y="425" textAnchor="middle" fill="var(--accent)" fontSize="10" fontWeight="bold">Portfolio Analyst</text>

              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="782" y="300" width="36" height="36" />
              <text x="800" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">Bedrock</text>
              <text x="800" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Claude Sonnet</text>
              <text x="800" y="373" textAnchor="middle" fill="var(--text-secondary)" fontSize="7">LLM Inference</text>

              <line x1="530" y1="318" x2="778" y2="318" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-cr)" />
              <text x="654" y="310" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">LLM inference</text>

              <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="822" y="148" width="36" height="36" />
              <text x="840" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="9" fontWeight="bold">CloudWatch</text>

              <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="892" y="148" width="36" height="36" />
              <text x="910" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="9" fontWeight="bold">X-Ray</text>

              <text x="875" y="215" textAnchor="middle" fill="var(--text-secondary)" fontSize="7">Observability</text>
            </svg>
          </div>
        </div>

        {/* How it works - detailed pipeline */}
        <div className="max-w-5xl mx-auto mb-20">
          <h2 className="text-sm font-mono uppercase tracking-widest text-center mb-10 animate-fade-in stagger-1" style={{ color: 'var(--accent)' }}>
            Assessment Pipeline
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {[
              { num: '01', title: 'Submit Request', desc: `Enter a ${config.input_schema.id_label} and select an assessment type. The UI sends a POST to /api/invoke via CloudFront.` },
              { num: '02', title: 'Async Invocation', desc: 'The proxy Lambda validates the request, creates a DynamoDB session, and asynchronously invokes the worker Lambda. You get a session ID immediately.' },
              { num: '03', title: 'Multi-Agent Execution', desc: `The worker Lambda calls the AgentCore runtime. ${config.agents.length} specialized agents run in parallel — financial analysis, risk scoring, and portfolio impact — powered by Claude on Amazon Bedrock.` },
              { num: '04', title: 'Poll & Display', desc: 'The UI polls GET /api/status/{sessionId}. Once complete, results are rendered: risk score, credit rating, risk factors, and actionable recommendations.' },
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

        {/* Tech stack details */}
        <div className="max-w-5xl mx-auto mb-20">
          <h2 className="text-sm font-mono uppercase tracking-widest text-center mb-10 animate-fade-in stagger-2" style={{ color: 'var(--accent)' }}>
            Technology Stack
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { label: 'Runtime', value: 'Amazon Bedrock AgentCore', detail: 'Managed container runtime for multi-agent orchestration' },
              { label: 'LLM', value: 'Claude Sonnet (Bedrock)', detail: 'Foundation model for financial reasoning and risk analysis' },
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
        <div id="agents" className="max-w-4xl mx-auto mb-16">
          <h2 className="text-sm font-mono uppercase tracking-widest text-center mb-10 animate-fade-in stagger-2" style={{ color: 'var(--accent)' }}>
            AI Agents
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {config.agents.map((agent, i) => (
              <AgentCard key={agent.id} name={agent.name} description={agent.description} index={i} />
            ))}
          </div>
        </div>

        {/* Quick action */}
        <div className="max-w-lg mx-auto animate-fade-in stagger-3">
          <div
            onClick={() => navigate('/console')}
            className="card group cursor-pointer text-center"
            style={{ border: '1px dashed var(--border)' }}
          >
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Quick test with sample data
            </p>
            <code
              className="inline-block px-3 py-1 rounded text-xs font-mono"
              style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}
            >
              {config.input_schema.test_entities[0] || 'BORROW001'}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
