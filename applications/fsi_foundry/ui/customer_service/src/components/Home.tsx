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
        {/* Orbit ring 1 */}
        <div
          className="absolute"
          style={{
            top: '50%', left: '50%',
            width: '240px', height: '240px',
            marginTop: '-120px', marginLeft: '-120px',
            border: '1px solid rgba(0,240,255,0.08)',
            borderRadius: '50%',
            transform: 'rotateX(70deg)',
          }}
        />
        {/* Orbiting dot 1 */}
        <div
          className="absolute"
          style={{ top: '50%', left: '50%', width: 0, height: 0 }}
        >
          <div style={{ animation: 'orbitSlow 12s linear infinite' }}>
            <div
              style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: 'var(--neon-cyan)',
                boxShadow: '0 0 10px var(--neon-cyan), 0 0 30px rgba(0,240,255,0.3)',
              }}
            />
          </div>
        </div>
        {/* Orbiting dot 2 */}
        <div
          className="absolute"
          style={{ top: '50%', left: '50%', width: 0, height: 0 }}
        >
          <div style={{ animation: 'orbitFast 8s linear infinite' }}>
            <div
              style={{
                width: '4px', height: '4px', borderRadius: '50%',
                background: 'var(--neon-magenta)',
                boxShadow: '0 0 8px var(--neon-magenta), 0 0 20px rgba(255,0,229,0.3)',
              }}
            />
          </div>
        </div>
        {/* Orbiting dot 3 */}
        <div
          className="absolute"
          style={{ top: '50%', left: '50%', width: 0, height: 0 }}
        >
          <div style={{ animation: 'orbitMid 10s linear infinite' }}>
            <div
              style={{
                width: '3px', height: '3px', borderRadius: '50%',
                background: 'var(--neon-green)',
                boxShadow: '0 0 6px var(--neon-green)',
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
  inquiry_handler: {
    color: '#00f0ff',
    features: ['Smart inquiry triage & routing', 'Context gathering from account history', 'Priority classification & SLA tracking'],
  },
  transaction_specialist: {
    color: '#ff00e5',
    features: ['Dispute investigation & evidence review', 'Account activity pattern analysis', 'Billing discrepancy resolution'],
  },
  product_advisor: {
    color: '#39ff14',
    features: ['Personalized product recommendations', 'Eligibility assessment & comparison', 'Upgrade path & benefit analysis'],
  },
};

const agentIcons: Record<string, React.ReactNode> = {
  inquiry_handler: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  ),
  transaction_specialist: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  ),
  product_advisor: (
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
          color: 'var(--neon-cyan)',
          textShadow: '0 0 20px rgba(0,240,255,0.4)',
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
      {/* 3D Mountain/Ocean Scene */}
      <div className="absolute inset-0" style={{ height: '100vh' }}>
        <Suspense fallback={null}>
          <Scene3D />
        </Suspense>
        {/* Gradient overlay so text is readable */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(3,3,8,0.3) 0%, rgba(3,3,8,0.1) 30%, rgba(3,3,8,0.4) 70%, rgba(3,3,8,0.95) 100%)',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-20 scene-3d">

        {/* ===== HERO ===== */}
        <div className="text-center mb-28 animate-fade-in">
          {/* Orbiting hero element */}
          <div className="relative inline-block mb-8">
            <div className="relative z-10">
              <div
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-mono uppercase tracking-widest"
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(0,240,255,0.2)',
                  boxShadow: '0 0 20px rgba(0,240,255,0.1), inset 0 0 20px rgba(0,240,255,0.03)',
                  color: 'var(--neon-cyan)',
                }}
              >
                <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--neon-green)', boxShadow: '0 0 8px var(--neon-green)' }} />
                {config.domain} &mdash; AI-Powered Support
              </div>
            </div>
            <OrbitRing />
          </div>

          <h1 className="text-7xl font-black mb-6 leading-tight tracking-tight">
            <span style={{ color: 'var(--text-primary)' }}>Intelligent </span>
            <span className="holo-text">Customer</span>
            <br />
            <span
              className="animate-text-glow"
              style={{ color: 'var(--neon-cyan)' }}
            >
              Service
            </span>
          </h1>

          <p className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {config.description}. Powered by <span style={{ color: 'var(--neon-cyan)' }}>{config.agents.length} autonomous AI agents</span> working
            in concert to resolve inquiries in real-time.
          </p>

          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/console')} className="btn-primary text-base px-10 py-4 font-bold">
              Open Service Desk
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
            <AnimatedStat value="5" label="Inquiry Types" />
            <AnimatedStat value="<30s" label="Avg Resolution" />
          </div>
        </div>

        {/* ===== SERVICE FLOW — 3D Cards ===== */}
        <div id="how-it-works" className="max-w-6xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1"
              style={{ color: 'var(--neon-cyan)', textShadow: '0 0 10px rgba(0,240,255,0.3)' }}
            >
              Service Resolution Flow
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              From inquiry submission to resolution — watch AI agents collaborate in real-time
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
            {[
              { num: '01', title: 'Inquiry Received', desc: 'Customer submits through CloudFront-backed service desk. Request enters the async processing pipeline.', color: 'var(--neon-cyan)' },
              { num: '02', title: 'Triage & Route', desc: 'Inquiry Handler analyzes intent, pulls account context, classifies priority, routes to specialists.', color: 'var(--neon-cyan)' },
              { num: '03', title: 'Deep Investigation', desc: 'Transaction Specialist and Product Advisor work in parallel to analyze the issue from multiple angles.', color: 'var(--neon-magenta)' },
              { num: '04', title: 'Synthesize', desc: 'Agent outputs are combined into a unified resolution with actions taken and recommendations.', color: 'var(--neon-magenta)' },
              { num: '05', title: 'Resolve', desc: 'Complete resolution with status, priority, action items, follow-up flags, and full audit trail.', color: 'var(--neon-green)' },
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
                {/* Connector arrow */}
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

        {/* ===== ARCHITECTURE — Neon SVG ===== */}
        <div className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-10">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1"
              style={{ color: 'var(--neon-cyan)', textShadow: '0 0 10px rgba(0,240,255,0.3)' }}
            >
              Architecture
            </h2>
          </div>
          <div className="glass animate-fade-in p-8" style={{ animationDelay: '0.15s' }}>
            <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
              <defs>
                <marker id="arrow-c" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#00f0ff" />
                </marker>
                <filter id="neon-glow-c">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feFlood floodColor="#00f0ff" floodOpacity="0.3" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* ===== ROW 1: User -> CloudFront -> S3 ===== */}
              {/* User Browser */}
              <rect x="30" y="20" width="120" height="70" rx="12" fill="rgba(0,240,255,0.04)" stroke="#00f0ff" strokeWidth="1" />
              <text x="90" y="48" textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="bold">User</text>
              <text x="90" y="66" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="220" y2="55" stroke="#00f0ff" strokeWidth="1.5" markerEnd="url(#arrow-c)" />

              {/* CloudFront */}
              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
              <text x="250" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">CloudFront</text>
              <text x="250" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">CDN + SPA Rewrite</text>

              <line x1="280" y1="45" x2="370" y2="45" stroke="#00f0ff" strokeWidth="1.5" markerEnd="url(#arrow-c)" strokeDasharray="4,3" />
              <text x="325" y="38" textAnchor="middle" fill="var(--text-muted)" fontSize="8">static</text>

              {/* S3 */}
              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
              <text x="400" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">S3</text>
              <text x="400" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">UI Assets (OAC)</text>

              {/* ===== ROW 2: API GW -> Lambda Proxy -> Lambda Worker <-> DynamoDB ===== */}
              <line x1="250" y1="90" x2="250" y2="140" stroke="#00f0ff" strokeWidth="1.5" markerEnd="url(#arrow-c)" />
              <text x="262" y="120" textAnchor="start" fill="var(--text-muted)" fontSize="8">/api/*</text>

              {/* API Gateway */}
              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="148" width="36" height="36" />
              <text x="100" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">API Gateway</text>
              <text x="100" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">HTTP API</text>

              <line x1="130" y1="166" x2="250" y2="166" stroke="#00f0ff" strokeWidth="1.5" markerEnd="url(#arrow-c)" />

              {/* Lambda Proxy */}
              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="262" y="148" width="36" height="36" />
              <text x="280" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Proxy</text>
              <text x="280" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">POST /invoke, GET /status</text>
              <text x="280" y="221" textAnchor="middle" fill="var(--text-muted)" fontSize="8">30s timeout</text>

              <line x1="310" y1="166" x2="430" y2="166" stroke="#00f0ff" strokeWidth="1.5" markerEnd="url(#arrow-c)" />
              <text x="370" y="158" textAnchor="middle" fill="#00f0ff" fontSize="8" fontWeight="bold">async</text>

              {/* Lambda Worker */}
              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="442" y="148" width="36" height="36" />
              <text x="460" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Worker</text>
              <text x="460" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">300s timeout</text>

              {/* DynamoDB */}
              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="622" y="148" width="36" height="36" />
              <text x="640" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">DynamoDB</text>
              <text x="640" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Session State + TTL</text>

              <line x1="490" y1="166" x2="610" y2="166" stroke="#00f0ff" strokeWidth="1.5" markerEnd="url(#arrow-c)" />
              <line x1="610" y1="174" x2="490" y2="174" stroke="#00f0ff" strokeWidth="1.5" markerEnd="url(#arrow-c)" strokeDasharray="4,3" />

              {/* ===== ROW 3: AgentCore -> Agents -> Bedrock, ECR -> AgentCore ===== */}
              <line x1="460" y1="222" x2="460" y2="280" stroke="#00f0ff" strokeWidth="1.5" markerEnd="url(#arrow-c)" />

              {/* AgentCore Runtime */}
              <rect x="250" y="288" width="280" height="60" rx="12" fill="rgba(0,240,255,0.06)" stroke="#00f0ff" strokeWidth="2" filter="url(#neon-glow-c)" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="260" y="300" width="36" height="36" />
              <text x="400" y="314" textAnchor="middle" fill="#00f0ff" fontSize="12" fontWeight="bold">AgentCore Runtime</text>
              <text x="400" y="332" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Bedrock Managed Container</text>

              {/* ECR */}
              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="132" y="300" width="36" height="36" />
              <text x="150" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">ECR</text>
              <text x="150" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Container Image</text>

              <line x1="178" y1="318" x2="248" y2="318" stroke="#00f0ff" strokeWidth="1.5" markerEnd="url(#arrow-c)" strokeDasharray="4,3" />

              {/* Agent lines from AgentCore */}
              <line x1="320" y1="348" x2="280" y2="400" stroke="#00f0ff" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="390" y1="348" x2="460" y2="400" stroke="var(--neon-magenta)" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="460" y1="348" x2="640" y2="400" stroke="var(--neon-green)" strokeWidth="1.5" strokeDasharray="4,3" />

              {/* Agent: Inquiry Handler */}
              <rect x="200" y="405" width="160" height="32" rx="8" fill="rgba(0,240,255,0.04)" stroke="#00f0ff" strokeWidth="1" />
              <text x="280" y="425" textAnchor="middle" fill="#00f0ff" fontSize="10" fontWeight="bold">Inquiry Handler</text>

              {/* Agent: Transaction Specialist */}
              <rect x="380" y="405" width="170" height="32" rx="8" fill="rgba(255,0,229,0.04)" stroke="var(--neon-magenta)" strokeWidth="1" />
              <text x="465" y="425" textAnchor="middle" fill="var(--neon-magenta)" fontSize="10" fontWeight="bold">Transaction Specialist</text>

              {/* Agent: Product Advisor */}
              <rect x="570" y="405" width="150" height="32" rx="8" fill="rgba(57,255,20,0.04)" stroke="var(--neon-green)" strokeWidth="1" />
              <text x="645" y="425" textAnchor="middle" fill="var(--neon-green)" fontSize="10" fontWeight="bold">Product Advisor</text>

              {/* Bedrock */}
              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="782" y="300" width="36" height="36" />
              <text x="800" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">Bedrock</text>
              <text x="800" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Claude Sonnet</text>
              <text x="800" y="373" textAnchor="middle" fill="var(--text-muted)" fontSize="7">LLM Inference</text>

              <line x1="530" y1="318" x2="778" y2="318" stroke="#00f0ff" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-c)" />
              <text x="654" y="310" textAnchor="middle" fill="var(--text-muted)" fontSize="8">LLM inference</text>

              {/* Monitoring: CloudWatch + X-Ray */}
              <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="822" y="148" width="36" height="36" />
              <text x="840" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="9" fontWeight="bold">CloudWatch</text>

              <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="892" y="148" width="36" height="36" />
              <text x="910" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="9" fontWeight="bold">X-Ray</text>

              <text x="875" y="215" textAnchor="middle" fill="var(--text-muted)" fontSize="7">Observability</text>
            </svg>
          </div>
        </div>

        {/* ===== AI AGENTS — 3D Tilt Cards ===== */}
        <div className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-2"
              style={{ color: 'var(--neon-cyan)', textShadow: '0 0 10px rgba(0,240,255,0.3)' }}
            >
              AI Agents
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              Three autonomous agents with distinct specializations
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {config.agents.map((agent, i) => {
              const detail = agentDetails[agent.id] || agentDetails.inquiry_handler;
              const icon = agentIcons[agent.id] || agentIcons.inquiry_handler;
              return (
                <div key={agent.id} className="animate-fade-in" style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
                  <TiltCard>
                    <div className="relative z-10">
                      {/* Neon icon */}
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
                      {/* Feature list with neon bullets */}
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
              style={{ color: 'var(--neon-cyan)', textShadow: '0 0 10px rgba(0,240,255,0.3)' }}
            >
              Technology Stack
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { label: 'Runtime', value: 'Amazon Bedrock AgentCore', detail: 'Managed container runtime for multi-agent orchestration', color: 'var(--neon-cyan)' },
              { label: 'LLM', value: 'Claude Sonnet (Bedrock)', detail: 'Foundation model for natural language understanding', color: 'var(--neon-magenta)' },
              { label: 'Framework', value: 'LangGraph / Strands', detail: 'Agent orchestration with parallel execution', color: 'var(--neon-green)' },
              { label: 'API Layer', value: 'API Gateway + Lambda', detail: 'Serverless async invoke with proxy/worker split', color: 'var(--neon-cyan)' },
              { label: 'State Store', value: 'DynamoDB', detail: 'Session tracking with TTL-based cleanup', color: 'var(--neon-magenta)' },
              { label: 'CDN & Hosting', value: 'CloudFront + S3', detail: 'SPA hosting with origin access control', color: 'var(--neon-green)' },
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
            className="glass group block text-center p-6 rounded-2xl transition-all hover:shadow-[0_0_40px_rgba(0,240,255,0.1)]"
            style={{ border: '1px dashed rgba(0,240,255,0.15)' }}
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
                    background: 'rgba(0,240,255,0.06)',
                    border: '1px solid rgba(0,240,255,0.15)',
                    color: 'var(--neon-cyan)',
                    boxShadow: '0 0 10px rgba(0,240,255,0.08)',
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
