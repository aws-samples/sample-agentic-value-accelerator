import { useNavigate, Link } from 'react-router-dom';
import { useRef, useCallback, useEffect, useState, lazy, Suspense } from 'react';
import type { RuntimeConfig } from '../config';

const Scene3D = lazy(() => import('./Scene3D'));

/* ---- 3D Tilt Card ---- */

function TiltCard({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(800px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) scale3d(1.02, 1.02, 1.02)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = 'perspective(800px) rotateY(0) rotateX(0) scale3d(1, 1, 1)';
  }, []);

  return (
    <div
      ref={cardRef}
      className={`card-3d ${className}`}
      style={{ transition: 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)', ...style }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
}

/* ---- Orbiting Element ---- */

function OrbitRing() {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ perspective: '600px' }}>
      <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
        <div
          className="absolute"
          style={{
            top: '50%', left: '50%',
            width: '240px', height: '240px',
            marginTop: '-120px', marginLeft: '-120px',
            border: '1px solid rgba(139,92,246,0.08)',
            borderRadius: '50%',
            transform: 'rotateX(70deg)',
          }}
        />
        <div className="absolute" style={{ top: '50%', left: '50%', width: 0, height: 0 }}>
          <div style={{ animation: 'orbitSlow 12s linear infinite' }}>
            <div
              style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: '#8B5CF6',
                boxShadow: '0 0 10px #8B5CF6, 0 0 30px rgba(139,92,246,0.3)',
              }}
            />
          </div>
        </div>
        <div className="absolute" style={{ top: '50%', left: '50%', width: 0, height: 0 }}>
          <div style={{ animation: 'orbitFast 8s linear infinite' }}>
            <div
              style={{
                width: '4px', height: '4px', borderRadius: '50%',
                background: '#60A5FA',
                boxShadow: '0 0 8px #60A5FA, 0 0 20px rgba(96,165,250,0.3)',
              }}
            />
          </div>
        </div>
        <div className="absolute" style={{ top: '50%', left: '50%', width: 0, height: 0 }}>
          <div style={{ animation: 'orbitMid 10s linear infinite' }}>
            <div
              style={{
                width: '3px', height: '3px', borderRadius: '50%',
                background: '#34D399',
                boxShadow: '0 0 6px #34D399',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Agent Detail Data ---- */

const agentDetails: Record<string, { color: string; features: string[] }> = {
  requirement_analyst: {
    color: '#8B5CF6',
    features: ['Functional & non-functional requirements extraction', 'Dependency mapping & risk assessment', 'API contract & data model specification'],
  },
  code_scaffolder: {
    color: '#60A5FA',
    features: ['Project structure generation & design patterns', 'Boilerplate code & configuration scaffolding', 'Code quality enforcement & best practices'],
  },
  test_generator: {
    color: '#34D399',
    features: ['Unit & integration test generation', 'Test fixture creation & framework setup', 'Coverage estimation & manual testing guidance'],
  },
};

const agentIcons: Record<string, React.ReactNode> = {
  requirement_analyst: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  code_scaffolder: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  ),
  test_generator: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
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
          color: '#8B5CF6',
          textShadow: '0 0 20px rgba(139,92,246,0.4)',
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
      <div className="absolute inset-0" style={{ height: '100vh' }}>
        <Suspense fallback={null}>
          <Scene3D />
        </Suspense>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(17,24,39,0.3) 0%, rgba(17,24,39,0.1) 30%, rgba(17,24,39,0.4) 70%, rgba(17,24,39,0.95) 100%)',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-20 scene-3d">

        {/* ===== HERO ===== */}
        <div className="text-center mb-28 animate-fade-in">
          <div className="relative inline-block mb-8">
            <div className="relative z-10">
              <div
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-mono uppercase tracking-widest"
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(139,92,246,0.2)',
                  boxShadow: '0 0 20px rgba(139,92,246,0.1), inset 0 0 20px rgba(139,92,246,0.03)',
                  color: '#8B5CF6',
                }}
              >
                <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: '#34D399', boxShadow: '0 0 8px #34D399' }} />
                {config.domain} &mdash; AI-Powered Generation
              </div>
            </div>
            <OrbitRing />
          </div>

          <h1 className="text-7xl font-black mb-6 leading-tight tracking-tight">
            <span style={{ color: 'var(--text-primary)' }}>Intelligent </span>
            <span className="holo-text">Code</span>
            <br />
            <span
              className="animate-text-glow"
              style={{ color: '#8B5CF6' }}
            >
              Generation
            </span>
          </h1>

          <p className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {config.description}. Powered by <span style={{ color: '#8B5CF6' }}>{config.agents.length} autonomous AI agents</span> working
            in concert to analyze requirements, scaffold code, and generate tests.
          </p>

          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/console')} className="btn-primary text-base px-10 py-4 font-bold">
              Open Code Studio
            </button>
            <button
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              className="btn-secondary text-base px-10 py-4"
            >
              How it Works
            </button>
          </div>

          <div className="flex justify-center gap-16 mt-16">
            <AnimatedStat value="3" label="AI Agents" />
            <AnimatedStat value="4" label="Generation Scopes" />
            <AnimatedStat value="<60s" label="Avg Generation" />
          </div>
        </div>

        {/* ===== GENERATION FLOW ===== */}
        <div id="how-it-works" className="max-w-6xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1"
              style={{ color: '#8B5CF6', textShadow: '0 0 10px rgba(139,92,246,0.3)' }}
            >
              Code Generation Flow
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              From project input to production-ready code with full test coverage
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
            {[
              { num: '01', title: 'Project Input', desc: 'Submit project ID and generation scope. Request enters the async processing pipeline.', color: '#8B5CF6' },
              { num: '02', title: 'Analyze Requirements', desc: 'Requirement Analyst extracts functional specs, dependencies, data models, and API contracts.', color: '#8B5CF6' },
              { num: '03', title: 'Scaffold Code', desc: 'Code Scaffolder generates project structure, applies design patterns, and creates configuration files.', color: '#60A5FA' },
              { num: '04', title: 'Generate Tests', desc: 'Test Generator creates unit & integration tests, fixtures, and estimates coverage across the codebase.', color: '#60A5FA' },
              { num: '05', title: 'Deliver', desc: 'Complete generation output with requirements, scaffolded code, tests, and quality metrics.', color: '#34D399' },
            ].map((step, i) => (
              <div key={step.num} className="relative animate-fade-in" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                <TiltCard className="text-center h-full">
                  <div className="relative z-10">
                    <div
                      className="text-3xl font-black font-mono mb-3"
                      style={{ color: step.color, opacity: 0.3, textShadow: `0 0 20px ${step.color}` }}
                    >
                      {step.num}
                    </div>
                    <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{step.desc}</p>
                  </div>
                </TiltCard>
                {i < 4 && (
                  <div className="hidden md:flex absolute top-1/2 -right-3 transform -translate-y-1/2 z-20 items-center">
                    <div
                      style={{
                        width: '6px', height: '6px',
                        background: step.color,
                        boxShadow: `0 0 6px ${step.color}`,
                        borderRadius: '50%',
                      }}
                    />
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
              style={{ color: '#8B5CF6', textShadow: '0 0 10px rgba(139,92,246,0.3)' }}
            >
              Architecture
            </h2>
          </div>
          <div className="glass animate-fade-in p-8" style={{ animationDelay: '0.15s' }}>
            <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
              <defs>
                <marker id="arrow-c" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#8B5CF6" />
                </marker>
                <filter id="neon-glow-c">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feFlood floodColor="#8B5CF6" floodOpacity="0.3" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* ROW 1: User -> CloudFront -> S3 */}
              <rect x="30" y="20" width="120" height="70" rx="12" fill="rgba(139,92,246,0.04)" stroke="#8B5CF6" strokeWidth="1" />
              <text x="90" y="48" textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="bold">User</text>
              <text x="90" y="66" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="220" y2="55" stroke="#8B5CF6" strokeWidth="1.5" markerEnd="url(#arrow-c)" />

              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
              <text x="250" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">CloudFront</text>
              <text x="250" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">CDN + SPA Rewrite</text>

              <line x1="280" y1="45" x2="370" y2="45" stroke="#8B5CF6" strokeWidth="1.5" markerEnd="url(#arrow-c)" strokeDasharray="4,3" />
              <text x="325" y="38" textAnchor="middle" fill="var(--text-muted)" fontSize="8">static</text>

              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
              <text x="400" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">S3</text>
              <text x="400" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">UI Assets (OAC)</text>

              {/* ROW 2: API GW -> Lambda Proxy -> Lambda Worker <-> DynamoDB */}
              <line x1="250" y1="90" x2="250" y2="140" stroke="#8B5CF6" strokeWidth="1.5" markerEnd="url(#arrow-c)" />
              <text x="262" y="120" textAnchor="start" fill="var(--text-muted)" fontSize="8">/api/*</text>

              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="148" width="36" height="36" />
              <text x="100" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">API Gateway</text>
              <text x="100" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">HTTP API</text>

              <line x1="130" y1="166" x2="250" y2="166" stroke="#8B5CF6" strokeWidth="1.5" markerEnd="url(#arrow-c)" />

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="262" y="148" width="36" height="36" />
              <text x="280" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Proxy</text>
              <text x="280" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">POST /invoke, GET /status</text>
              <text x="280" y="221" textAnchor="middle" fill="var(--text-muted)" fontSize="8">30s timeout</text>

              <line x1="310" y1="166" x2="430" y2="166" stroke="#8B5CF6" strokeWidth="1.5" markerEnd="url(#arrow-c)" />
              <text x="370" y="158" textAnchor="middle" fill="#8B5CF6" fontSize="8" fontWeight="bold">async</text>

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="442" y="148" width="36" height="36" />
              <text x="460" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Worker</text>
              <text x="460" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">300s timeout</text>

              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="622" y="148" width="36" height="36" />
              <text x="640" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">DynamoDB</text>
              <text x="640" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Session State + TTL</text>

              <line x1="490" y1="166" x2="610" y2="166" stroke="#8B5CF6" strokeWidth="1.5" markerEnd="url(#arrow-c)" />
              <line x1="610" y1="174" x2="490" y2="174" stroke="#8B5CF6" strokeWidth="1.5" markerEnd="url(#arrow-c)" strokeDasharray="4,3" />

              {/* ROW 3: AgentCore -> Agents -> Bedrock */}
              <line x1="460" y1="222" x2="460" y2="280" stroke="#8B5CF6" strokeWidth="1.5" markerEnd="url(#arrow-c)" />

              <rect x="250" y="288" width="280" height="60" rx="12" fill="rgba(139,92,246,0.06)" stroke="#8B5CF6" strokeWidth="2" filter="url(#neon-glow-c)" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="260" y="300" width="36" height="36" />
              <text x="400" y="314" textAnchor="middle" fill="#8B5CF6" fontSize="12" fontWeight="bold">AgentCore Runtime</text>
              <text x="400" y="332" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Bedrock Managed Container</text>

              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="132" y="300" width="36" height="36" />
              <text x="150" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">ECR</text>
              <text x="150" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Container Image</text>

              <line x1="178" y1="318" x2="248" y2="318" stroke="#8B5CF6" strokeWidth="1.5" markerEnd="url(#arrow-c)" strokeDasharray="4,3" />

              {/* Agent lines */}
              <line x1="320" y1="348" x2="280" y2="400" stroke="#8B5CF6" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="390" y1="348" x2="460" y2="400" stroke="#60A5FA" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="460" y1="348" x2="640" y2="400" stroke="#34D399" strokeWidth="1.5" strokeDasharray="4,3" />

              {/* Agent: Requirement Analyst */}
              <rect x="200" y="405" width="160" height="32" rx="8" fill="rgba(139,92,246,0.04)" stroke="#8B5CF6" strokeWidth="1" />
              <text x="280" y="425" textAnchor="middle" fill="#8B5CF6" fontSize="10" fontWeight="bold">Requirement Analyst</text>

              {/* Agent: Code Scaffolder */}
              <rect x="380" y="405" width="160" height="32" rx="8" fill="rgba(96,165,250,0.04)" stroke="#60A5FA" strokeWidth="1" />
              <text x="460" y="425" textAnchor="middle" fill="#60A5FA" fontSize="10" fontWeight="bold">Code Scaffolder</text>

              {/* Agent: Test Generator */}
              <rect x="560" y="405" width="160" height="32" rx="8" fill="rgba(52,211,153,0.04)" stroke="#34D399" strokeWidth="1" />
              <text x="640" y="425" textAnchor="middle" fill="#34D399" fontSize="10" fontWeight="bold">Test Generator</text>

              {/* Bedrock */}
              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="782" y="300" width="36" height="36" />
              <text x="800" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">Bedrock</text>
              <text x="800" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Claude Sonnet</text>
              <text x="800" y="373" textAnchor="middle" fill="var(--text-muted)" fontSize="7">LLM Inference</text>

              <line x1="530" y1="318" x2="778" y2="318" stroke="#8B5CF6" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-c)" />
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
              style={{ color: '#8B5CF6', textShadow: '0 0 10px rgba(139,92,246,0.3)' }}
            >
              AI Agents
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              Three autonomous agents with distinct specializations
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {config.agents.map((agent, i) => {
              const detail = agentDetails[agent.id] || agentDetails.requirement_analyst;
              const icon = agentIcons[agent.id] || agentIcons.requirement_analyst;
              return (
                <div key={agent.id} className="animate-fade-in" style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
                  <TiltCard>
                    <div className="relative z-10">
                      <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                        style={{
                          background: `${detail.color}08`,
                          border: `1px solid ${detail.color}30`,
                          boxShadow: `0 0 20px ${detail.color}15, inset 0 0 20px ${detail.color}05`,
                          color: detail.color,
                        }}
                      >
                        {icon}
                      </div>
                      <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{agent.name}</h3>
                      <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>{agent.description}</p>
                      <div className="space-y-3">
                        {detail.features.map((feat, fi) => (
                          <div key={fi} className="flex items-start gap-3">
                            <div
                              className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                              style={{ background: detail.color, boxShadow: `0 0 6px ${detail.color}` }}
                            />
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{feat}</span>
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
              style={{ color: '#8B5CF6', textShadow: '0 0 10px rgba(139,92,246,0.3)' }}
            >
              Technology Stack
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { label: 'Runtime', value: 'Amazon Bedrock AgentCore', detail: 'Managed container runtime for multi-agent orchestration', color: '#8B5CF6' },
              { label: 'LLM', value: 'Claude Sonnet (Bedrock)', detail: 'Foundation model for code understanding & generation', color: '#60A5FA' },
              { label: 'Framework', value: 'LangGraph / Strands', detail: 'Agent orchestration with parallel execution', color: '#34D399' },
              { label: 'API Layer', value: 'API Gateway + Lambda', detail: 'Serverless async invoke with proxy/worker split', color: '#8B5CF6' },
              { label: 'State Store', value: 'DynamoDB', detail: 'Session tracking with TTL-based cleanup', color: '#60A5FA' },
              { label: 'CDN & Hosting', value: 'CloudFront + S3', detail: 'SPA hosting with origin access control', color: '#34D399' },
            ].map((item, i) => (
              <div
                key={item.label}
                className="card-glow animate-fade-in"
                style={{ animationDelay: `${0.15 + i * 0.08}s` }}
              >
                <div className="relative z-10">
                  <p className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: item.color, textShadow: `0 0 8px ${item.color}40` }}>{item.label}</p>
                  <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{item.value}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ===== CTA ===== */}
        <div className="max-w-lg mx-auto animate-fade-in stagger-3">
          <Link
            to="/console"
            className="glass group block text-center p-6 rounded-2xl transition-all hover:shadow-[0_0_40px_rgba(139,92,246,0.1)]"
            style={{ border: '1px dashed rgba(139,92,246,0.15)' }}
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
                    background: 'rgba(139,92,246,0.06)',
                    border: '1px solid rgba(139,92,246,0.15)',
                    color: '#8B5CF6',
                    boxShadow: '0 0 10px rgba(139,92,246,0.08)',
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
