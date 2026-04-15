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
    card.style.transform = `perspective(800px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) scale3d(1.02, 1.02, 1.02)`;
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
            width: '200px', height: '200px',
            marginTop: '-100px', marginLeft: '-100px',
            border: '1px solid rgba(20,184,166,0.12)',
            borderRadius: '50%',
            transform: 'rotateX(70deg)',
          }}
        />
        <div className="absolute" style={{ top: '50%', left: '50%', width: 0, height: 0 }}>
          <div style={{ animation: 'orbitSlow 12s linear infinite' }}>
            <div
              style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: 'var(--teal-light)',
                boxShadow: '0 0 8px var(--teal-light), 0 0 20px rgba(20,184,166,0.3)',
              }}
            />
          </div>
        </div>
        <div className="absolute" style={{ top: '50%', left: '50%', width: 0, height: 0 }}>
          <div style={{ animation: 'orbitFast 8s linear infinite' }}>
            <div
              style={{
                width: '4px', height: '4px', borderRadius: '50%',
                background: 'var(--amber)',
                boxShadow: '0 0 6px var(--amber), 0 0 16px rgba(245,158,11,0.3)',
              }}
            />
          </div>
        </div>
        <div className="absolute" style={{ top: '50%', left: '50%', width: 0, height: 0 }}>
          <div style={{ animation: 'orbitMid 10s linear infinite' }}>
            <div
              style={{
                width: '3px', height: '3px', borderRadius: '50%',
                background: 'var(--green)',
                boxShadow: '0 0 4px var(--green)',
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
  churn_predictor: {
    color: '#E11D48',
    features: ['Behavioral pattern analysis & risk scoring', 'Churn probability modeling with confidence intervals', 'Retention window estimation & urgency flagging'],
  },
  outreach_agent: {
    color: '#0F766E',
    features: ['Optimal channel selection & timing', 'Personalized messaging theme generation', 'Multi-channel outreach orchestration'],
  },
  policy_optimizer: {
    color: '#F59E0B',
    features: ['Coverage gap analysis & adjustment', 'Bundling opportunity identification', 'Savings estimation & value improvement'],
  },
};

const agentIcons: Record<string, React.ReactNode> = {
  churn_predictor: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  outreach_agent: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
    </svg>
  ),
  policy_optimizer: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
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
          color: 'var(--teal)',
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
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(250,250,249,0.3) 0%, rgba(250,250,249,0.1) 30%, rgba(250,250,249,0.5) 70%, rgba(250,250,249,0.97) 100%)',
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
                  background: 'rgba(255,255,255,0.8)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(15,118,110,0.2)',
                  boxShadow: '0 2px 12px rgba(15,118,110,0.08)',
                  color: 'var(--teal)',
                }}
              >
                <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
                {config.domain} &mdash; Customer Retention
              </div>
            </div>
            <OrbitRing />
          </div>

          <h1 className="text-7xl font-black mb-6 leading-tight tracking-tight">
            <span style={{ color: 'var(--text-primary)' }}>Proactive </span>
            <span className="gradient-text">Customer</span>
            <br />
            <span style={{ color: 'var(--teal)' }}>Engagement</span>
          </h1>

          <p className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {config.description}. Powered by <span style={{ color: 'var(--teal)' }}>{config.agents.length} autonomous AI agents</span> working
            in concert to predict churn, personalize outreach, and optimize policies.
          </p>

          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/console')} className="btn-primary text-base px-10 py-4 font-bold">
              Open Retention Dashboard
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
            <AnimatedStat value="4" label="Assessment Types" />
            <AnimatedStat value="<30s" label="Avg Analysis" />
          </div>
        </div>

        {/* ===== ENGAGEMENT FLOW — 3D Cards ===== */}
        <div id="how-it-works" className="max-w-6xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1"
              style={{ color: 'var(--teal)' }}
            >
              Engagement Analysis Flow
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              From customer ID to actionable retention strategy — watch AI agents collaborate in real-time
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
            {[
              { num: '01', title: 'Customer Data', desc: 'Customer ID and assessment type submitted. Request enters the async processing pipeline.', color: 'var(--teal)' },
              { num: '02', title: 'Churn Analysis', desc: 'Churn Predictor analyzes behavioral signals, calculates risk score, and estimates retention window.', color: 'var(--rose)' },
              { num: '03', title: 'Outreach Planning', desc: 'Outreach Agent selects optimal channels, crafts messaging themes, and plans personalized timing.', color: 'var(--teal-light)' },
              { num: '04', title: 'Policy Optimization', desc: 'Policy Optimizer identifies coverage gaps, bundling opportunities, and potential savings.', color: 'var(--amber)' },
              { num: '05', title: 'Engagement Plan', desc: 'Complete retention strategy with risk assessment, outreach plan, and policy recommendations.', color: 'var(--green)' },
            ].map((step, i) => (
              <div key={step.num} className="relative animate-fade-in" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                <TiltCard className="text-center h-full">
                  <div className="relative z-10">
                    <div
                      className="text-3xl font-black font-mono mb-3"
                      style={{ color: step.color, opacity: 0.25 }}
                    >
                      {step.num}
                    </div>
                    <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
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
                        boxShadow: `0 0 4px ${step.color}`,
                        borderRadius: '50%',
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ===== ARCHITECTURE — Teal SVG ===== */}
        <div className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-10">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1"
              style={{ color: 'var(--teal)' }}
            >
              Architecture
            </h2>
          </div>
          <div className="glass animate-fade-in p-8" style={{ animationDelay: '0.15s' }}>
            <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
              <defs>
                <marker id="arrow-e" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#0F766E" />
                </marker>
                <filter id="teal-glow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feFlood floodColor="#0F766E" floodOpacity="0.2" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* ===== ROW 1: User -> CloudFront -> S3 ===== */}
              <rect x="30" y="20" width="120" height="70" rx="12" fill="rgba(15,118,110,0.04)" stroke="#0F766E" strokeWidth="1" />
              <text x="90" y="48" textAnchor="middle" fill="#1C1917" fontSize="12" fontWeight="bold">User</text>
              <text x="90" y="66" textAnchor="middle" fill="#57534E" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="220" y2="55" stroke="#0F766E" strokeWidth="1.5" markerEnd="url(#arrow-e)" />

              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
              <text x="250" y="72" textAnchor="middle" fill="#1C1917" fontSize="11" fontWeight="bold">CloudFront</text>
              <text x="250" y="84" textAnchor="middle" fill="#57534E" fontSize="8">CDN + SPA Rewrite</text>

              <line x1="280" y1="45" x2="370" y2="45" stroke="#0F766E" strokeWidth="1.5" markerEnd="url(#arrow-e)" strokeDasharray="4,3" />
              <text x="325" y="38" textAnchor="middle" fill="#A8A29E" fontSize="8">static</text>

              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
              <text x="400" y="72" textAnchor="middle" fill="#1C1917" fontSize="11" fontWeight="bold">S3</text>
              <text x="400" y="84" textAnchor="middle" fill="#57534E" fontSize="8">UI Assets (OAC)</text>

              {/* ===== ROW 2: API GW -> Lambda Proxy -> Lambda Worker <-> DynamoDB ===== */}
              <line x1="250" y1="90" x2="250" y2="140" stroke="#0F766E" strokeWidth="1.5" markerEnd="url(#arrow-e)" />
              <text x="262" y="120" textAnchor="start" fill="#A8A29E" fontSize="8">/api/*</text>

              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="148" width="36" height="36" />
              <text x="100" y="198" textAnchor="middle" fill="#1C1917" fontSize="11" fontWeight="bold">API Gateway</text>
              <text x="100" y="210" textAnchor="middle" fill="#57534E" fontSize="8">HTTP API</text>

              <line x1="130" y1="166" x2="250" y2="166" stroke="#0F766E" strokeWidth="1.5" markerEnd="url(#arrow-e)" />

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="262" y="148" width="36" height="36" />
              <text x="280" y="198" textAnchor="middle" fill="#1C1917" fontSize="11" fontWeight="bold">Lambda Proxy</text>
              <text x="280" y="210" textAnchor="middle" fill="#57534E" fontSize="8">POST /invoke, GET /status</text>
              <text x="280" y="221" textAnchor="middle" fill="#A8A29E" fontSize="8">30s timeout</text>

              <line x1="310" y1="166" x2="430" y2="166" stroke="#0F766E" strokeWidth="1.5" markerEnd="url(#arrow-e)" />
              <text x="370" y="158" textAnchor="middle" fill="#0F766E" fontSize="8" fontWeight="bold">async</text>

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="442" y="148" width="36" height="36" />
              <text x="460" y="198" textAnchor="middle" fill="#1C1917" fontSize="11" fontWeight="bold">Lambda Worker</text>
              <text x="460" y="210" textAnchor="middle" fill="#57534E" fontSize="8">300s timeout</text>

              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="622" y="148" width="36" height="36" />
              <text x="640" y="198" textAnchor="middle" fill="#1C1917" fontSize="11" fontWeight="bold">DynamoDB</text>
              <text x="640" y="210" textAnchor="middle" fill="#57534E" fontSize="8">Session State + TTL</text>

              <line x1="490" y1="166" x2="610" y2="166" stroke="#0F766E" strokeWidth="1.5" markerEnd="url(#arrow-e)" />
              <line x1="610" y1="174" x2="490" y2="174" stroke="#0F766E" strokeWidth="1.5" markerEnd="url(#arrow-e)" strokeDasharray="4,3" />

              {/* ===== ROW 3: AgentCore -> Agents -> Bedrock ===== */}
              <line x1="460" y1="222" x2="460" y2="280" stroke="#0F766E" strokeWidth="1.5" markerEnd="url(#arrow-e)" />

              <rect x="250" y="288" width="280" height="60" rx="12" fill="rgba(15,118,110,0.06)" stroke="#0F766E" strokeWidth="2" filter="url(#teal-glow)" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="260" y="300" width="36" height="36" />
              <text x="400" y="314" textAnchor="middle" fill="#0F766E" fontSize="12" fontWeight="bold">AgentCore Runtime</text>
              <text x="400" y="332" textAnchor="middle" fill="#57534E" fontSize="9">Bedrock Managed Container</text>

              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="132" y="300" width="36" height="36" />
              <text x="150" y="350" textAnchor="middle" fill="#1C1917" fontSize="10" fontWeight="bold">ECR</text>
              <text x="150" y="362" textAnchor="middle" fill="#57534E" fontSize="8">Container Image</text>

              <line x1="178" y1="318" x2="248" y2="318" stroke="#0F766E" strokeWidth="1.5" markerEnd="url(#arrow-e)" strokeDasharray="4,3" />

              {/* Agent lines from AgentCore */}
              <line x1="320" y1="348" x2="280" y2="400" stroke="#E11D48" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="390" y1="348" x2="460" y2="400" stroke="#0F766E" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="460" y1="348" x2="640" y2="400" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="4,3" />

              {/* Agent: Churn Predictor */}
              <rect x="200" y="405" width="160" height="32" rx="8" fill="rgba(225,29,72,0.04)" stroke="#E11D48" strokeWidth="1" />
              <text x="280" y="425" textAnchor="middle" fill="#E11D48" fontSize="10" fontWeight="bold">Churn Predictor</text>

              {/* Agent: Outreach Agent */}
              <rect x="380" y="405" width="160" height="32" rx="8" fill="rgba(15,118,110,0.04)" stroke="#0F766E" strokeWidth="1" />
              <text x="460" y="425" textAnchor="middle" fill="#0F766E" fontSize="10" fontWeight="bold">Outreach Agent</text>

              {/* Agent: Policy Optimizer */}
              <rect x="560" y="405" width="170" height="32" rx="8" fill="rgba(245,158,11,0.04)" stroke="#F59E0B" strokeWidth="1" />
              <text x="645" y="425" textAnchor="middle" fill="#F59E0B" fontSize="10" fontWeight="bold">Policy Optimizer</text>

              {/* Bedrock */}
              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="782" y="300" width="36" height="36" />
              <text x="800" y="350" textAnchor="middle" fill="#1C1917" fontSize="10" fontWeight="bold">Bedrock</text>
              <text x="800" y="362" textAnchor="middle" fill="#57534E" fontSize="8">Claude Sonnet</text>
              <text x="800" y="373" textAnchor="middle" fill="#A8A29E" fontSize="7">LLM Inference</text>

              <line x1="530" y1="318" x2="778" y2="318" stroke="#0F766E" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-e)" />
              <text x="654" y="310" textAnchor="middle" fill="#A8A29E" fontSize="8">LLM inference</text>

              {/* Monitoring */}
              <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="822" y="148" width="36" height="36" />
              <text x="840" y="198" textAnchor="middle" fill="#1C1917" fontSize="9" fontWeight="bold">CloudWatch</text>

              <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="892" y="148" width="36" height="36" />
              <text x="910" y="198" textAnchor="middle" fill="#1C1917" fontSize="9" fontWeight="bold">X-Ray</text>

              <text x="875" y="215" textAnchor="middle" fill="#A8A29E" fontSize="7">Observability</text>
            </svg>
          </div>
        </div>

        {/* ===== AI AGENTS — 3D Tilt Cards ===== */}
        <div className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-2"
              style={{ color: 'var(--teal)' }}
            >
              AI Agents
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              Three autonomous agents with distinct specializations
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {config.agents.map((agent, i) => {
              const detail = agentDetails[agent.id] || agentDetails.churn_predictor;
              const icon = agentIcons[agent.id] || agentIcons.churn_predictor;
              return (
                <div key={agent.id} className="animate-fade-in" style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
                  <TiltCard>
                    <div className="relative z-10">
                      <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                        style={{
                          background: `${detail.color}08`,
                          border: `1px solid ${detail.color}25`,
                          boxShadow: `0 4px 14px ${detail.color}10`,
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
                              style={{ background: detail.color }}
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
              style={{ color: 'var(--teal)' }}
            >
              Technology Stack
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { label: 'Runtime', value: 'Amazon Bedrock AgentCore', detail: 'Managed container runtime for multi-agent orchestration', color: 'var(--teal)' },
              { label: 'LLM', value: 'Claude Sonnet (Bedrock)', detail: 'Foundation model for natural language understanding', color: 'var(--rose)' },
              { label: 'Framework', value: 'LangGraph / Strands', detail: 'Agent orchestration with parallel execution', color: 'var(--amber)' },
              { label: 'API Layer', value: 'API Gateway + Lambda', detail: 'Serverless async invoke with proxy/worker split', color: 'var(--teal)' },
              { label: 'State Store', value: 'DynamoDB', detail: 'Session tracking with TTL-based cleanup', color: 'var(--rose)' },
              { label: 'CDN & Hosting', value: 'CloudFront + S3', detail: 'SPA hosting with origin access control', color: 'var(--green)' },
            ].map((item, i) => (
              <div
                key={item.label}
                className="card-glow animate-fade-in"
                style={{ animationDelay: `${0.15 + i * 0.08}s` }}
              >
                <div className="relative z-10">
                  <p className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: item.color }}>{item.label}</p>
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
            className="glass group block text-center p-6 rounded-2xl transition-all hover:shadow-[0_4px_30px_rgba(15,118,110,0.1)]"
            style={{ border: '1px dashed rgba(15,118,110,0.2)' }}
          >
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Try with a sample customer
            </p>
            <div className="flex justify-center gap-3">
              {config.input_schema.test_entities.map((id) => (
                <code
                  key={id}
                  className="inline-block px-4 py-1.5 rounded-lg text-xs font-mono"
                  style={{
                    background: 'rgba(15,118,110,0.06)',
                    border: '1px solid rgba(15,118,110,0.15)',
                    color: 'var(--teal)',
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
