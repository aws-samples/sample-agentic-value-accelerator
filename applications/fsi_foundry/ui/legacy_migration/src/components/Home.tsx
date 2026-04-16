import { useNavigate, Link } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import type { RuntimeConfig } from '../config';

/* ---- Animated Counter ---- */

function AnimatedStat({ value, label }: { value: string; label: string }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="text-center">
      <div
        className="text-4xl font-black font-mono mb-1 transition-all duration-1000"
        style={{
          color: 'var(--green-term)',
          textShadow: '0 0 20px rgba(34,197,94,0.3)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
        }}
      >
        {value}
      </div>
      <div className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

/* ---- Agent Detail Data ---- */

const agentDetails: Record<string, { color: string; features: string[] }> = {
  code_analyzer: {
    color: '#22C55E',
    features: ['Multi-language codebase detection and scanning', 'Dependency graph construction and risk identification', 'Pattern and anti-pattern recognition'],
  },
  migration_planner: {
    color: '#3B82F6',
    features: ['Phased migration strategy with effort estimates', 'Risk assessment and dependency ordering', 'Rollback strategy and contingency planning'],
  },
  conversion_agent: {
    color: '#F59E0B',
    features: ['Automated code conversion to modern frameworks', 'Confidence scoring per conversion', 'Manual review flagging for complex patterns'],
  },
};

const agentIcons: Record<string, React.ReactNode> = {
  code_analyzer: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  ),
  migration_planner: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  ),
  conversion_agent: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
    </svg>
  ),
};

/* ============================================
   MAIN COMPONENT
   ============================================ */

export default function Home({ config }: { config: RuntimeConfig }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-4rem)] relative overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Terminal grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(34,197,94,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.02) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />
      {/* Gradient overlays */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 20% 20%, rgba(34,197,94,0.06) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(59,130,246,0.04) 0%, transparent 50%)',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 py-20">

        {/* ===== HERO ===== */}
        <div className="text-center mb-28 animate-fade-in">
          <div className="inline-block mb-6">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono uppercase tracking-widest"
              style={{
                background: 'rgba(34,197,94,0.06)',
                border: '1px solid rgba(34,197,94,0.2)',
                color: 'var(--green-term)',
                boxShadow: '0 0 15px rgba(34,197,94,0.08)',
              }}
            >
              <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--green-term)', boxShadow: '0 0 6px var(--green-term)' }} />
              {config.domain} &mdash; Code Migration
            </div>
          </div>

          <h1 className="text-6xl font-black mb-6 leading-tight tracking-tight">
            <span style={{ color: 'var(--text-primary)' }}>Legacy Code</span>
            <br />
            <span style={{ color: 'var(--green-term)', textShadow: '0 0 30px rgba(34,197,94,0.3)' }}>Migration</span>
          </h1>

          <p className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {config.description}. Powered by <span style={{ color: 'var(--green-term)' }}>{config.agents.length} AI agents</span> working
            in sequence to modernize your codebase.
          </p>

          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/console')} className="btn-primary text-base px-10 py-4 font-bold">
              Open Migration Console
            </button>
            <button
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              className="btn-secondary text-base px-10 py-4"
            >
              How it Works
            </button>
          </div>

          {/* Stats bar */}
          <div className="flex justify-center gap-16 mt-16">
            <AnimatedStat value="3" label="AI Agents" />
            <AnimatedStat value="4" label="Scope Types" />
            <AnimatedStat value="<60s" label="Avg Analysis" />
          </div>
        </div>

        {/* ===== MIGRATION FLOW ===== */}
        <div id="how-it-works" className="max-w-6xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1"
              style={{ color: 'var(--green-term)', textShadow: '0 0 8px rgba(34,197,94,0.3)' }}
            >
              Migration Pipeline
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              From legacy codebase to modern framework -- fully automated
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
            {[
              { num: '01', title: 'Ingest Project', desc: 'Project ID submitted. Codebase enters the analysis pipeline for processing.', color: 'var(--green-term)' },
              { num: '02', title: 'Code Analysis', desc: 'Code Analyzer scans for languages, dependencies, patterns, complexity, and risks.', color: 'var(--green-term)' },
              { num: '03', title: 'Plan Migration', desc: 'Migration Planner creates phased strategy with effort estimates and rollback plans.', color: 'var(--blue)' },
              { num: '04', title: 'Convert Code', desc: 'Conversion Agent transforms legacy code to modern framework with confidence scores.', color: 'var(--amber)' },
              { num: '05', title: 'Deliver Report', desc: 'Complete migration report with analysis, plan, converted files, and review flags.', color: 'var(--green-term)' },
            ].map((step, i) => (
              <div key={step.num} className="relative animate-fade-in" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                <div className="card-terminal text-center h-full">
                  <div
                    className="text-3xl font-black font-mono mb-3"
                    style={{ color: step.color, opacity: 0.3, textShadow: `0 0 15px ${step.color}` }}
                  >
                    {step.num}
                  </div>
                  <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{step.desc}</p>
                </div>
                {i < 4 && (
                  <div className="hidden md:flex absolute top-1/2 -right-3 transform -translate-y-1/2 z-20 items-center">
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <path d="M2 6 L10 6 M7 3 L10 6 L7 9" fill="none" stroke="var(--green-term)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ===== ARCHITECTURE ===== */}
        <div className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-10">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1"
              style={{ color: 'var(--green-term)', textShadow: '0 0 8px rgba(34,197,94,0.3)' }}
            >
              Architecture
            </h2>
          </div>
          <div className="card-terminal animate-fade-in p-8" style={{ animationDelay: '0.15s' }}>
            <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
              <defs>
                <marker id="arrow-g" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#22C55E" />
                </marker>
                <filter id="glow-g">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feFlood floodColor="#22C55E" floodOpacity="0.2" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* ===== ROW 1: User -> CloudFront -> S3 ===== */}
              <rect x="30" y="20" width="120" height="70" rx="12" fill="rgba(34,197,94,0.04)" stroke="#22C55E" strokeWidth="1" />
              <text x="90" y="48" textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="bold">User</text>
              <text x="90" y="66" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="220" y2="55" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrow-g)" />

              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
              <text x="250" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">CloudFront</text>
              <text x="250" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">CDN + SPA Rewrite</text>

              <line x1="280" y1="45" x2="370" y2="45" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrow-g)" strokeDasharray="4,3" />
              <text x="325" y="38" textAnchor="middle" fill="var(--text-muted)" fontSize="8">static</text>

              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
              <text x="400" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">S3</text>
              <text x="400" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">UI Assets (OAC)</text>

              {/* ===== ROW 2: API GW -> Lambda Proxy -> Lambda Worker <-> DynamoDB ===== */}
              <line x1="250" y1="90" x2="250" y2="140" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrow-g)" />
              <text x="262" y="120" textAnchor="start" fill="var(--text-muted)" fontSize="8">/api/*</text>

              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="148" width="36" height="36" />
              <text x="100" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">API Gateway</text>
              <text x="100" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">HTTP API</text>

              <line x1="130" y1="166" x2="250" y2="166" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrow-g)" />

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="262" y="148" width="36" height="36" />
              <text x="280" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Proxy</text>
              <text x="280" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">POST /invoke, GET /status</text>
              <text x="280" y="221" textAnchor="middle" fill="var(--text-muted)" fontSize="8">30s timeout</text>

              <line x1="310" y1="166" x2="430" y2="166" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrow-g)" />
              <text x="370" y="158" textAnchor="middle" fill="#22C55E" fontSize="8" fontWeight="bold">async</text>

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="442" y="148" width="36" height="36" />
              <text x="460" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Worker</text>
              <text x="460" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">300s timeout</text>

              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="622" y="148" width="36" height="36" />
              <text x="640" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">DynamoDB</text>
              <text x="640" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Session State + TTL</text>

              <line x1="490" y1="166" x2="610" y2="166" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrow-g)" />
              <line x1="610" y1="174" x2="490" y2="174" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrow-g)" strokeDasharray="4,3" />

              {/* ===== ROW 3: AgentCore -> Agents -> Bedrock ===== */}
              <line x1="460" y1="222" x2="460" y2="280" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrow-g)" />

              <rect x="250" y="288" width="280" height="60" rx="12" fill="rgba(34,197,94,0.06)" stroke="#22C55E" strokeWidth="2" filter="url(#glow-g)" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="260" y="300" width="36" height="36" />
              <text x="400" y="314" textAnchor="middle" fill="#22C55E" fontSize="12" fontWeight="bold">AgentCore Runtime</text>
              <text x="400" y="332" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Bedrock Managed Container</text>

              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="132" y="300" width="36" height="36" />
              <text x="150" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">ECR</text>
              <text x="150" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Container Image</text>

              <line x1="178" y1="318" x2="248" y2="318" stroke="#22C55E" strokeWidth="1.5" markerEnd="url(#arrow-g)" strokeDasharray="4,3" />

              {/* Agent lines from AgentCore */}
              <line x1="310" y1="348" x2="250" y2="400" stroke="#22C55E" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="390" y1="348" x2="460" y2="400" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="470" y1="348" x2="660" y2="400" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="4,3" />

              {/* Agent: Code Analyzer */}
              <rect x="170" y="405" width="160" height="32" rx="8" fill="rgba(34,197,94,0.04)" stroke="#22C55E" strokeWidth="1" />
              <text x="250" y="425" textAnchor="middle" fill="#22C55E" fontSize="10" fontWeight="bold">Code Analyzer</text>

              {/* Agent: Migration Planner */}
              <rect x="380" y="405" width="170" height="32" rx="8" fill="rgba(59,130,246,0.04)" stroke="#3B82F6" strokeWidth="1" />
              <text x="465" y="425" textAnchor="middle" fill="#3B82F6" fontSize="10" fontWeight="bold">Migration Planner</text>

              {/* Agent: Conversion Agent */}
              <rect x="580" y="405" width="170" height="32" rx="8" fill="rgba(245,158,11,0.04)" stroke="#F59E0B" strokeWidth="1" />
              <text x="665" y="425" textAnchor="middle" fill="#F59E0B" fontSize="10" fontWeight="bold">Conversion Agent</text>

              {/* Bedrock */}
              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="782" y="300" width="36" height="36" />
              <text x="800" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">Bedrock</text>
              <text x="800" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Claude Sonnet</text>
              <text x="800" y="373" textAnchor="middle" fill="var(--text-muted)" fontSize="7">LLM Inference</text>

              <line x1="530" y1="318" x2="778" y2="318" stroke="#22C55E" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-g)" />
              <text x="654" y="310" textAnchor="middle" fill="var(--text-muted)" fontSize="8">LLM inference</text>

              {/* Monitoring */}
              <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="822" y="148" width="36" height="36" />
              <text x="840" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="9" fontWeight="bold">CloudWatch</text>

              <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="892" y="148" width="36" height="36" />
              <text x="910" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="9" fontWeight="bold">X-Ray</text>

              <text x="875" y="215" textAnchor="middle" fill="var(--text-muted)" fontSize="7">Observability</text>
            </svg>
          </div>
        </div>

        {/* ===== AI AGENTS ===== */}
        <div className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-2"
              style={{ color: 'var(--green-term)', textShadow: '0 0 8px rgba(34,197,94,0.3)' }}
            >
              AI Agents
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              Three specialized agents forming a migration pipeline
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {config.agents.map((agent, i) => {
              const detail = agentDetails[agent.id] || agentDetails.code_analyzer;
              const icon = agentIcons[agent.id] || agentIcons.code_analyzer;
              return (
                <div key={agent.id} className="animate-fade-in" style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
                  <div className="card-glow h-full">
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center mb-5"
                      style={{
                        background: `${detail.color}0A`,
                        border: `1px solid ${detail.color}25`,
                        boxShadow: `0 0 15px ${detail.color}10`,
                        color: detail.color,
                      }}
                    >
                      {icon}
                    </div>
                    <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{agent.name}</h3>
                    <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)' }}>{agent.description}</p>
                    <div className="space-y-2.5">
                      {detail.features.map((feat, fi) => (
                        <div key={fi} className="flex items-start gap-3">
                          <div
                            className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                            style={{ background: detail.color, boxShadow: `0 0 4px ${detail.color}` }}
                          />
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== TECH STACK ===== */}
        <div className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-10">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-2"
              style={{ color: 'var(--green-term)', textShadow: '0 0 8px rgba(34,197,94,0.3)' }}
            >
              Technology Stack
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { label: 'Runtime', value: 'Amazon Bedrock AgentCore', detail: 'Managed container runtime for multi-agent orchestration', color: 'var(--green-term)' },
              { label: 'LLM', value: 'Claude Sonnet (Bedrock)', detail: 'Foundation model for code understanding and generation', color: 'var(--blue)' },
              { label: 'Framework', value: 'LangGraph / Strands', detail: 'Agent orchestration with sequential pipeline execution', color: 'var(--amber)' },
              { label: 'API Layer', value: 'API Gateway + Lambda', detail: 'Serverless async invoke with proxy/worker split', color: 'var(--green-term)' },
              { label: 'State Store', value: 'DynamoDB', detail: 'Session tracking with TTL-based cleanup', color: 'var(--blue)' },
              { label: 'CDN & Hosting', value: 'CloudFront + S3', detail: 'SPA hosting with origin access control', color: 'var(--amber)' },
            ].map((item, i) => (
              <div
                key={item.label}
                className="card-glow animate-fade-in"
                style={{ animationDelay: `${0.15 + i * 0.08}s` }}
              >
                <p className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: item.color, textShadow: `0 0 6px ${item.color}30` }}>{item.label}</p>
                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{item.value}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ===== CTA ===== */}
        <div className="max-w-lg mx-auto animate-fade-in stagger-3">
          <Link
            to="/console"
            className="card-terminal group block text-center p-6 rounded-2xl transition-all hover:shadow-[0_0_30px_rgba(34,197,94,0.06)]"
            style={{ border: '1px dashed rgba(34,197,94,0.2)', textDecoration: 'none' }}
          >
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Try with a sample project
            </p>
            <div className="flex justify-center gap-3">
              {config.input_schema.test_entities.map((id) => (
                <code
                  key={id}
                  className="inline-block px-4 py-1.5 rounded-lg text-xs font-mono"
                  style={{
                    background: 'rgba(34,197,94,0.06)',
                    border: '1px solid rgba(34,197,94,0.15)',
                    color: 'var(--green-term)',
                    boxShadow: '0 0 8px rgba(34,197,94,0.06)',
                  }}
                >
                  {id}
                </code>
              ))}
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
