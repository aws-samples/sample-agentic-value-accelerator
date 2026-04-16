import { useNavigate, Link } from 'react-router-dom';
import { useRef, useCallback, useEffect, useState, lazy, Suspense } from 'react';
import type { RuntimeConfig } from '../config';

const Scene3D = lazy(() => import('./Scene3D'));

/* ---- Tilt Card ---- */

function TiltCard({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(800px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) scale3d(1.01, 1.01, 1.01)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = 'perspective(800px) rotateY(0) rotateX(0) scale3d(1, 1, 1)';
  }, []);

  return (
    <div
      ref={cardRef}
      className={`card ${className}`}
      style={{ transition: 'transform 0.3s ease', ...style }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
}

/* ---- Agent Detail Data ---- */

const agentDetails: Record<string, { color: string; bgLight: string; features: string[] }> = {
  email_classifier: {
    color: '#3B82F6',
    bgLight: '#DBEAFE',
    features: ['Email category classification', 'Urgency & priority assessment', 'Sender importance scoring (0-1)'],
  },
  action_extractor: {
    color: '#2563EB',
    bgLight: '#BFDBFE',
    features: ['Action item extraction', 'Deadline identification', 'Follow-up requirement detection'],
  },
};

const agentIcons: Record<string, React.ReactNode> = {
  email_classifier: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  ),
  action_extractor: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75" />
    </svg>
  ),
};

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
          color: 'var(--blue-600)',
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

/* ============================================
   MAIN COMPONENT
   ============================================ */

export default function Home({ config }: { config: RuntimeConfig }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-4rem)] relative overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* 3D Scene */}
      <div className="absolute inset-0" style={{ height: '100vh' }}>
        <Suspense fallback={null}>
          <Scene3D />
        </Suspense>
        {/* Gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(249,250,251,0.2) 0%, rgba(249,250,251,0.1) 30%, rgba(249,250,251,0.5) 70%, rgba(249,250,251,0.97) 100%)',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-20">

        {/* ===== HERO ===== */}
        <div className="text-center mb-28 animate-fade-in">
          <div className="relative inline-block mb-8">
            <div className="relative z-10">
              <div
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-mono uppercase tracking-widest"
                style={{
                  background: 'var(--blue-50)',
                  border: '1px solid var(--blue-200)',
                  color: 'var(--blue-600)',
                }}
              >
                <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--green-500)' }} />
                {config.domain} &mdash; AI-Powered Triage
              </div>
            </div>
          </div>

          <h1 className="text-7xl font-black mb-6 leading-tight tracking-tight">
            <span style={{ color: 'var(--charcoal)' }}>Intelligent </span>
            <span style={{ color: 'var(--blue-500)' }}>Email</span>
            <br />
            <span style={{ color: 'var(--blue-600)' }}>Triage</span>
          </h1>

          <p className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {config.description}. Powered by <span style={{ color: 'var(--blue-600)', fontWeight: 600 }}>{config.agents.length} autonomous AI agents</span> that
            classify, prioritize, and extract actions from every email.
          </p>

          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/console')} className="btn-primary text-base px-10 py-4 font-bold">
              Open Inbox Manager
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
            <AnimatedStat value="2" label="AI Agents" />
            <AnimatedStat value="3" label="Triage Modes" />
            <AnimatedStat value="<15s" label="Avg Triage" />
          </div>
        </div>

        {/* ===== TRIAGE FLOW ===== */}
        <div id="how-it-works" className="max-w-6xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1"
              style={{ color: 'var(--blue-600)' }}
            >
              Email Triage Flow
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              From inbox arrival to actionable intelligence — watch AI agents process every email
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
            {[
              { num: '01', title: 'Email Received', desc: 'New email arrives and enters the AI triage pipeline for processing.', color: 'var(--blue-400)' },
              { num: '02', title: 'Classify', desc: 'Email Classifier analyzes content, determines category, urgency level, and sender importance.', color: 'var(--blue-500)' },
              { num: '03', title: 'Extract Actions', desc: 'Action Extractor identifies action items, deadlines, and follow-up requirements.', color: 'var(--blue-600)' },
              { num: '04', title: 'Synthesize', desc: 'Agent outputs are combined into a unified triage response with recommendations.', color: 'var(--blue-600)' },
              { num: '05', title: 'Deliver', desc: 'Complete triage with classification, topics, actions, deadlines, and summary.', color: 'var(--blue-700)' },
            ].map((step, i) => (
              <div key={step.num} className="relative animate-fade-in" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                <TiltCard className="text-center h-full">
                  <div>
                    <div
                      className="text-3xl font-black font-mono mb-3"
                      style={{ color: step.color, opacity: 0.25 }}
                    >
                      {step.num}
                    </div>
                    <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--charcoal)' }}>{step.title}</h3>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{step.desc}</p>
                  </div>
                </TiltCard>
                {/* Connector dot */}
                {i < 4 && (
                  <div className="hidden md:flex absolute top-1/2 -right-3 transform -translate-y-1/2 z-20 items-center">
                    <div
                      style={{
                        width: '6px', height: '6px',
                        background: step.color,
                        borderRadius: '50%',
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ===== ARCHITECTURE — Blue Arrows ===== */}
        <div className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-10">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1"
              style={{ color: 'var(--blue-600)' }}
            >
              Architecture
            </h2>
          </div>
          <div className="glass animate-fade-in p-8" style={{ animationDelay: '0.15s' }}>
            <svg viewBox="0 0 960 480" className="w-full" style={{ maxHeight: '480px' }}>
              <defs>
                <marker id="arrow-b" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#3B82F6" />
                </marker>
                <filter id="blue-glow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feFlood floodColor="#3B82F6" floodOpacity="0.15" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* ROW 1: User -> CloudFront -> S3 */}
              <rect x="30" y="20" width="120" height="70" rx="12" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1" />
              <text x="90" y="48" textAnchor="middle" fill="#1F2937" fontSize="12" fontWeight="bold">User</text>
              <text x="90" y="66" textAnchor="middle" fill="#6B7280" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="220" y2="55" stroke="#3B82F6" strokeWidth="1.5" markerEnd="url(#arrow-b)" />

              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
              <text x="250" y="72" textAnchor="middle" fill="#1F2937" fontSize="11" fontWeight="bold">CloudFront</text>
              <text x="250" y="84" textAnchor="middle" fill="#6B7280" fontSize="8">CDN + SPA Rewrite</text>

              <line x1="280" y1="45" x2="370" y2="45" stroke="#3B82F6" strokeWidth="1.5" markerEnd="url(#arrow-b)" strokeDasharray="4,3" />
              <text x="325" y="38" textAnchor="middle" fill="#9CA3AF" fontSize="8">static</text>

              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
              <text x="400" y="72" textAnchor="middle" fill="#1F2937" fontSize="11" fontWeight="bold">S3</text>
              <text x="400" y="84" textAnchor="middle" fill="#6B7280" fontSize="8">UI Assets (OAC)</text>

              {/* ROW 2: API GW -> Lambda Proxy -> Lambda Worker <-> DynamoDB */}
              <line x1="250" y1="90" x2="250" y2="140" stroke="#3B82F6" strokeWidth="1.5" markerEnd="url(#arrow-b)" />
              <text x="262" y="120" textAnchor="start" fill="#9CA3AF" fontSize="8">/api/*</text>

              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="148" width="36" height="36" />
              <text x="100" y="198" textAnchor="middle" fill="#1F2937" fontSize="11" fontWeight="bold">API Gateway</text>
              <text x="100" y="210" textAnchor="middle" fill="#6B7280" fontSize="8">HTTP API</text>

              <line x1="130" y1="166" x2="250" y2="166" stroke="#3B82F6" strokeWidth="1.5" markerEnd="url(#arrow-b)" />

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="262" y="148" width="36" height="36" />
              <text x="280" y="198" textAnchor="middle" fill="#1F2937" fontSize="11" fontWeight="bold">Lambda Proxy</text>
              <text x="280" y="210" textAnchor="middle" fill="#6B7280" fontSize="8">POST /invoke, GET /status</text>
              <text x="280" y="221" textAnchor="middle" fill="#9CA3AF" fontSize="8">30s timeout</text>

              <line x1="310" y1="166" x2="430" y2="166" stroke="#3B82F6" strokeWidth="1.5" markerEnd="url(#arrow-b)" />
              <text x="370" y="158" textAnchor="middle" fill="#3B82F6" fontSize="8" fontWeight="bold">async</text>

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="442" y="148" width="36" height="36" />
              <text x="460" y="198" textAnchor="middle" fill="#1F2937" fontSize="11" fontWeight="bold">Lambda Worker</text>
              <text x="460" y="210" textAnchor="middle" fill="#6B7280" fontSize="8">300s timeout</text>

              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="622" y="148" width="36" height="36" />
              <text x="640" y="198" textAnchor="middle" fill="#1F2937" fontSize="11" fontWeight="bold">DynamoDB</text>
              <text x="640" y="210" textAnchor="middle" fill="#6B7280" fontSize="8">Session State + TTL</text>

              <line x1="490" y1="166" x2="610" y2="166" stroke="#3B82F6" strokeWidth="1.5" markerEnd="url(#arrow-b)" />
              <line x1="610" y1="174" x2="490" y2="174" stroke="#3B82F6" strokeWidth="1.5" markerEnd="url(#arrow-b)" strokeDasharray="4,3" />

              {/* ROW 3: AgentCore -> Agents -> Bedrock */}
              <line x1="460" y1="222" x2="460" y2="270" stroke="#3B82F6" strokeWidth="1.5" markerEnd="url(#arrow-b)" />

              <rect x="280" y="278" width="250" height="56" rx="12" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="2" filter="url(#blue-glow)" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="290" y="290" width="32" height="32" />
              <text x="415" y="303" textAnchor="middle" fill="#3B82F6" fontSize="12" fontWeight="bold">AgentCore Runtime</text>
              <text x="415" y="320" textAnchor="middle" fill="#6B7280" fontSize="9">Bedrock Managed Container</text>

              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="132" y="290" width="36" height="36" />
              <text x="150" y="340" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="bold">ECR</text>
              <text x="150" y="352" textAnchor="middle" fill="#6B7280" fontSize="8">Container Image</text>

              <line x1="178" y1="308" x2="278" y2="308" stroke="#3B82F6" strokeWidth="1.5" markerEnd="url(#arrow-b)" strokeDasharray="4,3" />

              {/* Agent lines from AgentCore */}
              <line x1="350" y1="334" x2="310" y2="385" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="460" y1="334" x2="530" y2="385" stroke="#2563EB" strokeWidth="1.5" strokeDasharray="4,3" />

              {/* Agent: Email Classifier */}
              <rect x="210" y="390" width="180" height="32" rx="8" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1" />
              <text x="300" y="410" textAnchor="middle" fill="#3B82F6" fontSize="10" fontWeight="bold">Email Classifier</text>

              {/* Agent: Action Extractor */}
              <rect x="430" y="390" width="180" height="32" rx="8" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1" />
              <text x="520" y="410" textAnchor="middle" fill="#2563EB" fontSize="10" fontWeight="bold">Action Extractor</text>

              {/* Bedrock */}
              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="782" y="290" width="36" height="36" />
              <text x="800" y="340" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="bold">Bedrock</text>
              <text x="800" y="352" textAnchor="middle" fill="#6B7280" fontSize="8">Claude Sonnet</text>
              <text x="800" y="363" textAnchor="middle" fill="#9CA3AF" fontSize="7">LLM Inference</text>

              <line x1="530" y1="308" x2="778" y2="308" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-b)" />
              <text x="654" y="300" textAnchor="middle" fill="#9CA3AF" fontSize="8">LLM inference</text>

              {/* Monitoring */}
              <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="822" y="148" width="36" height="36" />
              <text x="840" y="198" textAnchor="middle" fill="#1F2937" fontSize="9" fontWeight="bold">CloudWatch</text>

              <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="892" y="148" width="36" height="36" />
              <text x="910" y="198" textAnchor="middle" fill="#1F2937" fontSize="9" fontWeight="bold">X-Ray</text>

              <text x="875" y="215" textAnchor="middle" fill="#9CA3AF" fontSize="7">Observability</text>
            </svg>
          </div>
        </div>

        {/* ===== AI AGENTS ===== */}
        <div className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-2"
              style={{ color: 'var(--blue-600)' }}
            >
              AI Agents
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              Two autonomous agents with distinct specializations
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {config.agents.map((agent, i) => {
              const detail = agentDetails[agent.id] || agentDetails.email_classifier;
              const icon = agentIcons[agent.id] || agentIcons.email_classifier;
              return (
                <div key={agent.id} className="animate-fade-in" style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
                  <TiltCard>
                    <div>
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center mb-5"
                        style={{
                          background: detail.bgLight,
                          color: detail.color,
                        }}
                      >
                        {icon}
                      </div>
                      <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--charcoal)' }}>{agent.name}</h3>
                      <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)' }}>{agent.description}</p>
                      <div className="space-y-2.5">
                        {detail.features.map((feat, fi) => (
                          <div key={fi} className="flex items-start gap-3">
                            <div
                              className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                              style={{ background: detail.color }}
                            />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{feat}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TiltCard>
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
              style={{ color: 'var(--blue-600)' }}
            >
              Technology Stack
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { label: 'Runtime', value: 'Amazon Bedrock AgentCore', detail: 'Managed container runtime for multi-agent orchestration', color: 'var(--blue-500)' },
              { label: 'LLM', value: 'Claude Sonnet (Bedrock)', detail: 'Foundation model for natural language understanding', color: 'var(--blue-600)' },
              { label: 'Framework', value: 'LangGraph / Strands', detail: 'Agent orchestration with parallel execution', color: 'var(--blue-700)' },
              { label: 'API Layer', value: 'API Gateway + Lambda', detail: 'Serverless async invoke with proxy/worker split', color: 'var(--blue-500)' },
              { label: 'State Store', value: 'DynamoDB', detail: 'Session tracking with TTL-based cleanup', color: 'var(--blue-600)' },
              { label: 'CDN & Hosting', value: 'CloudFront + S3', detail: 'SPA hosting with origin access control', color: 'var(--blue-700)' },
            ].map((item, i) => (
              <div
                key={item.label}
                className="card animate-fade-in"
                style={{ animationDelay: `${0.15 + i * 0.08}s` }}
              >
                <p className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: item.color }}>{item.label}</p>
                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--charcoal)' }}>{item.value}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ===== CTA ===== */}
        <div className="max-w-lg mx-auto animate-fade-in stagger-3">
          <Link
            to="/console"
            className="card group block text-center p-6 rounded-2xl transition-all hover:shadow-lg"
            style={{ border: '1px dashed var(--blue-300)' }}
          >
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Try with a sample email
            </p>
            <div className="flex justify-center gap-3">
              {config.input_schema.test_entities.map((id) => (
                <code
                  key={id}
                  className="inline-block px-4 py-1.5 rounded-lg text-xs font-mono"
                  style={{
                    background: 'var(--blue-50)',
                    border: '1px solid var(--blue-200)',
                    color: 'var(--blue-600)',
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
