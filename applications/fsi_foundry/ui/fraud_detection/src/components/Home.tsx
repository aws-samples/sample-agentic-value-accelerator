import { useNavigate, Link } from 'react-router-dom';
import { useRef, useCallback, useEffect, useState } from 'react';
import type { RuntimeConfig } from '../config';

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

/* ---- Radar Sweep ---- */

function RadarSweep() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute inset-0" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Concentric rings */}
        {[240, 180, 120].map((size, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              border: `1px solid rgba(239,68,68,${0.06 + i * 0.02})`,
            }}
          />
        ))}
        {/* Sweep line */}
        <div
          className="absolute animate-radar-sweep"
          style={{
            width: '120px',
            height: '2px',
            background: 'linear-gradient(90deg, rgba(239,68,68,0.5), transparent)',
            transformOrigin: 'left center',
          }}
        />
        {/* Center dot */}
        <div
          className="absolute w-3 h-3 rounded-full"
          style={{ background: 'var(--soc-red-bright)', boxShadow: '0 0 12px var(--soc-red-bright), 0 0 30px rgba(239,68,68,0.3)' }}
        />
        {/* Alert blips */}
        <div
          className="absolute w-2 h-2 rounded-full animate-alert-blink"
          style={{ top: 'calc(50% - 40px)', left: 'calc(50% + 60px)', background: 'var(--soc-amber)', boxShadow: '0 0 8px var(--soc-amber)' }}
        />
        <div
          className="absolute w-1.5 h-1.5 rounded-full animate-alert-blink"
          style={{ top: 'calc(50% + 50px)', left: 'calc(50% - 30px)', background: 'var(--soc-red-bright)', boxShadow: '0 0 8px var(--soc-red-bright)', animationDelay: '0.5s' }}
        />
      </div>
    </div>
  );
}

/* ---- Agent Detail Data ---- */

const agentDetails: Record<string, { color: string; features: string[] }> = {
  transaction_monitor: {
    color: '#EF4444',
    features: ['Real-time transaction surveillance', 'Velocity & amount anomaly detection', 'Geo-location risk assessment'],
  },
  pattern_analyst: {
    color: '#F59E0B',
    features: ['Behavioral pattern recognition', 'Historical trend correlation', 'Network graph analysis'],
  },
  alert_generator: {
    color: '#3B82F6',
    features: ['Automated alert classification', 'Evidence chain compilation', 'Recommended action generation'],
  },
};

const agentIcons: Record<string, React.ReactNode> = {
  transaction_monitor: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  pattern_analyst: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v-5.5m3 5.5V8.75m3 2.5V10.5" />
    </svg>
  ),
  alert_generator: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
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
          color: 'var(--soc-red-bright)',
          textShadow: '0 0 20px rgba(239,68,68,0.4)',
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
      {/* Threat mesh background */}
      <div className="absolute inset-0 bg-threat-mesh bg-grid-soc" />
      {/* Gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(11,15,25,0.3) 0%, rgba(11,15,25,0.1) 30%, rgba(11,15,25,0.4) 70%, rgba(11,15,25,0.95) 100%)',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 py-20">

        {/* ===== HERO ===== */}
        <div className="text-center mb-28 animate-fade-in">
          {/* Radar element */}
          <div className="relative inline-block mb-8" style={{ width: '260px', height: '260px' }}>
            <div className="relative z-10" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
              <div
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-mono uppercase tracking-widest"
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  boxShadow: '0 0 20px rgba(239,68,68,0.1), inset 0 0 20px rgba(239,68,68,0.03)',
                  color: 'var(--soc-red-bright)',
                }}
              >
                <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--soc-red-bright)', boxShadow: '0 0 8px var(--soc-red-bright)' }} />
                {config.domain} &mdash; Threat Monitoring
              </div>
            </div>
            <RadarSweep />
          </div>

          <h1 className="text-7xl font-black mb-6 leading-tight tracking-tight">
            <span style={{ color: 'var(--text-primary)' }}>Real-Time </span>
            <span className="holo-text">Fraud</span>
            <br />
            <span
              className="animate-text-glow"
              style={{ color: 'var(--soc-red-bright)' }}
            >
              Detection
            </span>
          </h1>

          <p className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {config.description}. Powered by <span style={{ color: 'var(--soc-red-bright)' }}>{config.agents.length} autonomous AI agents</span> performing
            continuous threat surveillance and risk analysis.
          </p>

          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/console')} className="btn-primary text-base px-10 py-4 font-bold">
              Open Fraud Ops Center
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
            <AnimatedStat value="4" label="Monitoring Modes" />
            <AnimatedStat value="<30s" label="Threat Analysis" />
          </div>
        </div>

        {/* ===== DETECTION FLOW ===== */}
        <div id="how-it-works" className="max-w-6xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1"
              style={{ color: 'var(--soc-red-bright)', textShadow: '0 0 10px rgba(239,68,68,0.3)' }}
            >
              Fraud Detection Pipeline
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              From transaction ingestion to alert generation -- continuous multi-agent threat analysis
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
            {[
              { num: '01', title: 'Ingest', desc: 'Customer monitoring request enters through CloudFront-backed ops center. Transaction data pipeline begins.', color: 'var(--soc-red-bright)' },
              { num: '02', title: 'Monitor', desc: 'Transaction Monitor performs real-time surveillance, checking velocity, amounts, and geo-location anomalies.', color: 'var(--soc-red-bright)' },
              { num: '03', title: 'Analyze', desc: 'Pattern Analyst correlates historical behaviors, identifies deviations, and maps network connections.', color: 'var(--soc-amber)' },
              { num: '04', title: 'Classify', desc: 'Alert Generator synthesizes findings, assigns severity levels, compiles evidence chains.', color: 'var(--soc-blue)' },
              { num: '05', title: 'Alert', desc: 'Risk score computed with full assessment. Alerts dispatched with evidence and recommended actions.', color: 'var(--soc-emerald)' },
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

        {/* ===== ARCHITECTURE — SVG with AWS Icons ===== */}
        <div className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-10">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1"
              style={{ color: 'var(--soc-red-bright)', textShadow: '0 0 10px rgba(239,68,68,0.3)' }}
            >
              Architecture
            </h2>
          </div>
          <div className="glass animate-fade-in p-8" style={{ animationDelay: '0.15s' }}>
            <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
              <defs>
                <marker id="arrow-f" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#EF4444" />
                </marker>
                <filter id="neon-glow-f">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feFlood floodColor="#EF4444" floodOpacity="0.3" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* ===== ROW 1: User -> CloudFront -> S3 ===== */}
              {/* User Browser */}
              <rect x="30" y="20" width="120" height="70" rx="12" fill="rgba(239,68,68,0.04)" stroke="#EF4444" strokeWidth="1" />
              <text x="90" y="48" textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="bold">User</text>
              <text x="90" y="66" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="220" y2="55" stroke="#EF4444" strokeWidth="1.5" markerEnd="url(#arrow-f)" />

              {/* CloudFront */}
              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
              <text x="250" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">CloudFront</text>
              <text x="250" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">CDN + SPA Rewrite</text>

              <line x1="280" y1="45" x2="370" y2="45" stroke="#EF4444" strokeWidth="1.5" markerEnd="url(#arrow-f)" strokeDasharray="4,3" />
              <text x="325" y="38" textAnchor="middle" fill="var(--text-muted)" fontSize="8">static</text>

              {/* S3 */}
              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
              <text x="400" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">S3</text>
              <text x="400" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">UI Assets (OAC)</text>

              {/* ===== ROW 2: API GW -> Lambda Proxy -> Lambda Worker <-> DynamoDB ===== */}
              <line x1="250" y1="90" x2="250" y2="140" stroke="#EF4444" strokeWidth="1.5" markerEnd="url(#arrow-f)" />
              <text x="262" y="120" textAnchor="start" fill="var(--text-muted)" fontSize="8">/api/*</text>

              {/* API Gateway */}
              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="148" width="36" height="36" />
              <text x="100" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">API Gateway</text>
              <text x="100" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">HTTP API</text>

              <line x1="130" y1="166" x2="250" y2="166" stroke="#EF4444" strokeWidth="1.5" markerEnd="url(#arrow-f)" />

              {/* Lambda Proxy */}
              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="262" y="148" width="36" height="36" />
              <text x="280" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Proxy</text>
              <text x="280" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">POST /invoke, GET /status</text>
              <text x="280" y="221" textAnchor="middle" fill="var(--text-muted)" fontSize="8">30s timeout</text>

              <line x1="310" y1="166" x2="430" y2="166" stroke="#EF4444" strokeWidth="1.5" markerEnd="url(#arrow-f)" />
              <text x="370" y="158" textAnchor="middle" fill="#EF4444" fontSize="8" fontWeight="bold">async</text>

              {/* Lambda Worker */}
              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="442" y="148" width="36" height="36" />
              <text x="460" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Worker</text>
              <text x="460" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">300s timeout</text>

              {/* DynamoDB */}
              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="622" y="148" width="36" height="36" />
              <text x="640" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">DynamoDB</text>
              <text x="640" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Session State + TTL</text>

              <line x1="490" y1="166" x2="610" y2="166" stroke="#EF4444" strokeWidth="1.5" markerEnd="url(#arrow-f)" />
              <line x1="610" y1="174" x2="490" y2="174" stroke="#EF4444" strokeWidth="1.5" markerEnd="url(#arrow-f)" strokeDasharray="4,3" />

              {/* ===== ROW 3: AgentCore -> Agents -> Bedrock ===== */}
              <line x1="460" y1="222" x2="460" y2="280" stroke="#EF4444" strokeWidth="1.5" markerEnd="url(#arrow-f)" />

              {/* AgentCore Runtime */}
              <rect x="250" y="288" width="280" height="60" rx="12" fill="rgba(239,68,68,0.06)" stroke="#EF4444" strokeWidth="2" filter="url(#neon-glow-f)" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="260" y="300" width="36" height="36" />
              <text x="400" y="314" textAnchor="middle" fill="#EF4444" fontSize="12" fontWeight="bold">AgentCore Runtime</text>
              <text x="400" y="332" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Bedrock Managed Container</text>

              {/* ECR */}
              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="132" y="300" width="36" height="36" />
              <text x="150" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">ECR</text>
              <text x="150" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Container Image</text>

              <line x1="178" y1="318" x2="248" y2="318" stroke="#EF4444" strokeWidth="1.5" markerEnd="url(#arrow-f)" strokeDasharray="4,3" />

              {/* Agent lines from AgentCore */}
              <line x1="320" y1="348" x2="280" y2="400" stroke="#EF4444" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="390" y1="348" x2="460" y2="400" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="460" y1="348" x2="640" y2="400" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="4,3" />

              {/* Agent: Transaction Monitor */}
              <rect x="190" y="405" width="180" height="32" rx="8" fill="rgba(239,68,68,0.04)" stroke="#EF4444" strokeWidth="1" />
              <text x="280" y="425" textAnchor="middle" fill="#EF4444" fontSize="10" fontWeight="bold">Transaction Monitor</text>

              {/* Agent: Pattern Analyst */}
              <rect x="390" y="405" width="150" height="32" rx="8" fill="rgba(245,158,11,0.04)" stroke="#F59E0B" strokeWidth="1" />
              <text x="465" y="425" textAnchor="middle" fill="#F59E0B" fontSize="10" fontWeight="bold">Pattern Analyst</text>

              {/* Agent: Alert Generator */}
              <rect x="560" y="405" width="160" height="32" rx="8" fill="rgba(59,130,246,0.04)" stroke="#3B82F6" strokeWidth="1" />
              <text x="640" y="425" textAnchor="middle" fill="#3B82F6" fontSize="10" fontWeight="bold">Alert Generator</text>

              {/* Bedrock */}
              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="782" y="300" width="36" height="36" />
              <text x="800" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">Bedrock</text>
              <text x="800" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Claude Sonnet</text>
              <text x="800" y="373" textAnchor="middle" fill="var(--text-muted)" fontSize="7">LLM Inference</text>

              <line x1="530" y1="318" x2="778" y2="318" stroke="#EF4444" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-f)" />
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

        {/* ===== AI AGENTS — Tilt Cards ===== */}
        <div className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-2"
              style={{ color: 'var(--soc-red-bright)', textShadow: '0 0 10px rgba(239,68,68,0.3)' }}
            >
              Threat Detection Agents
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              Three autonomous agents with distinct security specializations
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {config.agents.map((agent, i) => {
              const detail = agentDetails[agent.id] || agentDetails.transaction_monitor;
              const icon = agentIcons[agent.id] || agentIcons.transaction_monitor;
              return (
                <div key={agent.id} className="animate-fade-in" style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
                  <TiltCard>
                    <div className="relative z-10">
                      {/* Icon */}
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
                      {/* Feature list */}
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
              style={{ color: 'var(--soc-red-bright)', textShadow: '0 0 10px rgba(239,68,68,0.3)' }}
            >
              Technology Stack
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { label: 'Runtime', value: 'Amazon Bedrock AgentCore', detail: 'Managed container runtime for multi-agent orchestration', color: 'var(--soc-red-bright)' },
              { label: 'LLM', value: 'Claude Sonnet (Bedrock)', detail: 'Foundation model for fraud pattern recognition', color: 'var(--soc-amber)' },
              { label: 'Framework', value: 'LangGraph / Strands', detail: 'Agent orchestration with parallel execution', color: 'var(--soc-blue)' },
              { label: 'API Layer', value: 'API Gateway + Lambda', detail: 'Serverless async invoke with proxy/worker split', color: 'var(--soc-red-bright)' },
              { label: 'State Store', value: 'DynamoDB', detail: 'Session tracking with TTL-based cleanup', color: 'var(--soc-amber)' },
              { label: 'CDN & Hosting', value: 'CloudFront + S3', detail: 'SPA hosting with origin access control', color: 'var(--soc-blue)' },
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
            className="glass group block text-center p-6 rounded-2xl transition-all hover:shadow-[0_0_40px_rgba(239,68,68,0.1)]"
            style={{ border: '1px dashed rgba(239,68,68,0.15)' }}
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
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.15)',
                    color: 'var(--soc-red-bright)',
                    boxShadow: '0 0 10px rgba(239,68,68,0.08)',
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
