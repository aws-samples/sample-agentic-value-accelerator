import { useNavigate, Link } from 'react-router-dom';
import { useRef, useCallback, useEffect, useState } from 'react';
import type { RuntimeConfig } from '../config';

/* ---- Hover Lift Card ---- */

function LiftCard({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(800px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateY(-4px)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = 'perspective(800px) rotateY(0) rotateX(0) translateY(0)';
  }, []);

  return (
    <div
      ref={cardRef}
      className={`card-elevated ${className}`}
      style={{ transition: 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)', ...style }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
}

/* ---- Animated Stat ---- */

function AnimatedStat({ value, label, color }: { value: string; label: string; color: string }) {
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
          color,
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
  document_classifier: {
    color: '#7C3AED',
    features: ['Document type identification & categorization', 'Jurisdiction & regulatory mapping', 'Confidence scoring with multi-signal analysis'],
  },
  data_extractor: {
    color: '#3B82F6',
    features: ['Key field extraction from structured forms', 'Named entity recognition for parties & dates', 'Amount & currency identification'],
  },
  validation_agent: {
    color: '#22C55E',
    features: ['Completeness & consistency checks', 'Regulatory compliance validation', 'Cross-reference verification & flagging'],
  },
};

const agentIcons: Record<string, React.ReactNode> = {
  document_classifier: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  ),
  data_extractor: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12v-1.5c0-.621-.504-1.125-1.125-1.125M12 12c0-.621.504-1.125 1.125-1.125m-2.25 0A1.125 1.125 0 0012 12m0-1.5c0 .621.504 1.125 1.125 1.125" />
    </svg>
  ),
  validation_agent: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
};

/* ============================================
   MAIN COMPONENT
   ============================================ */

export default function Home({ config }: { config: RuntimeConfig }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-4rem)] relative overflow-hidden bg-grid-subtle bg-gradient-hero">

      <div className="relative max-w-7xl mx-auto px-6 py-20">

        {/* ===== HERO ===== */}
        <div className="text-center mb-28 animate-fade-in">
          {/* Badge */}
          <div className="relative inline-block mb-8">
            <div className="relative z-10">
              <div
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-mono uppercase tracking-widest"
                style={{
                  background: 'rgba(124, 58, 237, 0.06)',
                  border: '1px solid rgba(124, 58, 237, 0.15)',
                  color: 'var(--violet-700)',
                }}
              >
                <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--green-500)' }} />
                {config.domain} -- Intelligent Processing
              </div>
            </div>
          </div>

          <h1 className="text-7xl font-black mb-6 leading-tight tracking-tight">
            <span style={{ color: 'var(--text-primary)' }}>Smart </span>
            <span style={{
              background: 'linear-gradient(135deg, var(--violet-700), var(--violet-400))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>Document</span>
            <br />
            <span style={{ color: 'var(--slate-700)' }}>Processing</span>
          </h1>

          <p className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {config.description}. Powered by <span style={{ color: 'var(--violet-700)', fontWeight: 600 }}>{config.agents.length} autonomous AI agents</span> that
            classify, extract, and validate documents with precision.
          </p>

          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/console')} className="btn-primary text-base px-10 py-4 font-bold">
              Open Processing Console
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
            <AnimatedStat value="3" label="AI Agents" color="var(--violet-700)" />
            <AnimatedStat value="4" label="Processing Modes" color="var(--violet-500)" />
            <AnimatedStat value="<20s" label="Avg Processing" color="var(--green-500)" />
          </div>
        </div>

        {/* ===== PROCESSING FLOW ===== */}
        <div id="how-it-works" className="max-w-6xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1"
              style={{ color: 'var(--violet-700)' }}
            >
              Document Processing Flow
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              From document ingestion to validated output -- watch AI agents process in real-time
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
            {[
              { num: '01', title: 'Ingest Document', desc: 'Document submitted through API Gateway. Enters the async processing pipeline for analysis.', color: 'var(--slate-700)' },
              { num: '02', title: 'Classify', desc: 'Document Classifier identifies type, jurisdiction, regulatory relevance with confidence scoring.', color: 'var(--violet-700)' },
              { num: '03', title: 'Extract', desc: 'Data Extractor pulls key fields, entities, amounts, and dates from the classified document.', color: '#3B82F6' },
              { num: '04', title: 'Validate', desc: 'Validation Agent runs completeness checks, cross-references, and compliance verification.', color: 'var(--green-500)' },
              { num: '05', title: 'Deliver', desc: 'Complete processing result with classification, extracted data, and validation status returned.', color: 'var(--violet-700)' },
            ].map((step, i) => (
              <div key={step.num} className="relative animate-fade-in" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                <LiftCard className="text-center h-full">
                  <div className="relative z-10">
                    <div
                      className="text-3xl font-black font-mono mb-3"
                      style={{ color: step.color, opacity: 0.2 }}
                    >
                      {step.num}
                    </div>
                    <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{step.desc}</p>
                  </div>
                </LiftCard>
                {/* Connector arrow */}
                {i < 4 && (
                  <div className="hidden md:flex absolute top-1/2 -right-3 transform -translate-y-1/2 z-20 items-center">
                    <svg className="w-5 h-5" style={{ color: 'var(--violet-400)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
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
              style={{ color: 'var(--violet-700)' }}
            >
              Architecture
            </h2>
          </div>
          <div className="surface animate-fade-in p-8" style={{ animationDelay: '0.15s' }}>
            <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
              <defs>
                <marker id="arrow-dp" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#7C3AED" />
                </marker>
                <filter id="shadow-dp">
                  <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.08" />
                </filter>
              </defs>

              {/* ===== ROW 1: User -> CloudFront -> S3 ===== */}
              {/* User Browser */}
              <rect x="30" y="20" width="120" height="70" rx="12" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" filter="url(#shadow-dp)" />
              <text x="90" y="48" textAnchor="middle" fill="#1E293B" fontSize="12" fontWeight="bold">User</text>
              <text x="90" y="66" textAnchor="middle" fill="#64748B" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="220" y2="55" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrow-dp)" />

              {/* CloudFront */}
              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
              <text x="250" y="72" textAnchor="middle" fill="#1E293B" fontSize="11" fontWeight="bold">CloudFront</text>
              <text x="250" y="84" textAnchor="middle" fill="#64748B" fontSize="8">CDN + SPA Rewrite</text>

              <line x1="280" y1="45" x2="370" y2="45" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrow-dp)" strokeDasharray="4,3" />
              <text x="325" y="38" textAnchor="middle" fill="#94A3B8" fontSize="8">static</text>

              {/* S3 */}
              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
              <text x="400" y="72" textAnchor="middle" fill="#1E293B" fontSize="11" fontWeight="bold">S3</text>
              <text x="400" y="84" textAnchor="middle" fill="#64748B" fontSize="8">UI Assets (OAC)</text>

              {/* ===== ROW 2: API GW -> Lambda Proxy -> Lambda Worker <-> DynamoDB ===== */}
              <line x1="250" y1="90" x2="250" y2="140" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrow-dp)" />
              <text x="262" y="120" textAnchor="start" fill="#94A3B8" fontSize="8">/api/*</text>

              {/* API Gateway */}
              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="148" width="36" height="36" />
              <text x="100" y="198" textAnchor="middle" fill="#1E293B" fontSize="11" fontWeight="bold">API Gateway</text>
              <text x="100" y="210" textAnchor="middle" fill="#64748B" fontSize="8">HTTP API</text>

              <line x1="130" y1="166" x2="250" y2="166" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrow-dp)" />

              {/* Lambda Proxy */}
              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="262" y="148" width="36" height="36" />
              <text x="280" y="198" textAnchor="middle" fill="#1E293B" fontSize="11" fontWeight="bold">Lambda Proxy</text>
              <text x="280" y="210" textAnchor="middle" fill="#64748B" fontSize="8">POST /invoke, GET /status</text>
              <text x="280" y="221" textAnchor="middle" fill="#94A3B8" fontSize="8">30s timeout</text>

              <line x1="310" y1="166" x2="430" y2="166" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrow-dp)" />
              <text x="370" y="158" textAnchor="middle" fill="#7C3AED" fontSize="8" fontWeight="bold">async</text>

              {/* Lambda Worker */}
              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="442" y="148" width="36" height="36" />
              <text x="460" y="198" textAnchor="middle" fill="#1E293B" fontSize="11" fontWeight="bold">Lambda Worker</text>
              <text x="460" y="210" textAnchor="middle" fill="#64748B" fontSize="8">300s timeout</text>

              {/* DynamoDB */}
              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="622" y="148" width="36" height="36" />
              <text x="640" y="198" textAnchor="middle" fill="#1E293B" fontSize="11" fontWeight="bold">DynamoDB</text>
              <text x="640" y="210" textAnchor="middle" fill="#64748B" fontSize="8">Session State + TTL</text>

              <line x1="490" y1="166" x2="610" y2="166" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrow-dp)" />
              <line x1="610" y1="174" x2="490" y2="174" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrow-dp)" strokeDasharray="4,3" />

              {/* ===== ROW 3: AgentCore -> Agents -> Bedrock ===== */}
              <line x1="460" y1="222" x2="460" y2="280" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrow-dp)" />

              {/* AgentCore Runtime */}
              <rect x="250" y="288" width="280" height="60" rx="12" fill="rgba(124,58,237,0.04)" stroke="#7C3AED" strokeWidth="2" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="260" y="300" width="36" height="36" />
              <text x="400" y="314" textAnchor="middle" fill="#7C3AED" fontSize="12" fontWeight="bold">AgentCore Runtime</text>
              <text x="400" y="332" textAnchor="middle" fill="#64748B" fontSize="9">Bedrock Managed Container</text>

              {/* ECR */}
              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="132" y="300" width="36" height="36" />
              <text x="150" y="350" textAnchor="middle" fill="#1E293B" fontSize="10" fontWeight="bold">ECR</text>
              <text x="150" y="362" textAnchor="middle" fill="#64748B" fontSize="8">Container Image</text>

              <line x1="178" y1="318" x2="248" y2="318" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrow-dp)" strokeDasharray="4,3" />

              {/* Agent lines from AgentCore */}
              <line x1="320" y1="348" x2="280" y2="400" stroke="#7C3AED" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="390" y1="348" x2="460" y2="400" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="460" y1="348" x2="640" y2="400" stroke="#22C55E" strokeWidth="1.5" strokeDasharray="4,3" />

              {/* Agent: Document Classifier (violet) */}
              <rect x="190" y="405" width="180" height="32" rx="8" fill="rgba(124,58,237,0.04)" stroke="#7C3AED" strokeWidth="1" />
              <text x="280" y="425" textAnchor="middle" fill="#7C3AED" fontSize="10" fontWeight="bold">Document Classifier</text>

              {/* Agent: Data Extractor (blue) */}
              <rect x="385" y="405" width="155" height="32" rx="8" fill="rgba(59,130,246,0.04)" stroke="#3B82F6" strokeWidth="1" />
              <text x="462" y="425" textAnchor="middle" fill="#3B82F6" fontSize="10" fontWeight="bold">Data Extractor</text>

              {/* Agent: Validation Agent (green) */}
              <rect x="555" y="405" width="165" height="32" rx="8" fill="rgba(34,197,94,0.04)" stroke="#22C55E" strokeWidth="1" />
              <text x="637" y="425" textAnchor="middle" fill="#22C55E" fontSize="10" fontWeight="bold">Validation Agent</text>

              {/* Bedrock */}
              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="782" y="300" width="36" height="36" />
              <text x="800" y="350" textAnchor="middle" fill="#1E293B" fontSize="10" fontWeight="bold">Bedrock</text>
              <text x="800" y="362" textAnchor="middle" fill="#64748B" fontSize="8">Claude Sonnet</text>
              <text x="800" y="373" textAnchor="middle" fill="#94A3B8" fontSize="7">LLM Inference</text>

              <line x1="530" y1="318" x2="778" y2="318" stroke="#A78BFA" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-dp)" />
              <text x="654" y="310" textAnchor="middle" fill="#94A3B8" fontSize="8">LLM inference</text>

              {/* Monitoring */}
              <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="822" y="148" width="36" height="36" />
              <text x="840" y="198" textAnchor="middle" fill="#1E293B" fontSize="9" fontWeight="bold">CloudWatch</text>

              <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="892" y="148" width="36" height="36" />
              <text x="910" y="198" textAnchor="middle" fill="#1E293B" fontSize="9" fontWeight="bold">X-Ray</text>

              <text x="875" y="215" textAnchor="middle" fill="#94A3B8" fontSize="7">Observability</text>
            </svg>
          </div>
        </div>

        {/* ===== AI AGENTS ===== */}
        <div className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2
              className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-2"
              style={{ color: 'var(--violet-700)' }}
            >
              AI Agents
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              Three specialized agents for end-to-end document intelligence
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {config.agents.map((agent, i) => {
              const detail = agentDetails[agent.id] || agentDetails.document_classifier;
              const icon = agentIcons[agent.id] || agentIcons.document_classifier;
              return (
                <div key={agent.id} className="animate-fade-in" style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
                  <LiftCard>
                    <div className="relative z-10">
                      {/* Icon */}
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center mb-5"
                        style={{
                          background: `${detail.color}08`,
                          border: `1px solid ${detail.color}20`,
                          color: detail.color,
                        }}
                      >
                        {icon}
                      </div>
                      <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{agent.name}</h3>
                      <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)' }}>{agent.description}</p>
                      {/* Feature list */}
                      <div className="space-y-2.5">
                        {detail.features.map((feat, fi) => (
                          <div key={fi} className="flex items-start gap-2.5">
                            <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: detail.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{feat}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </LiftCard>
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
              style={{ color: 'var(--violet-700)' }}
            >
              Technology Stack
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { label: 'Runtime', value: 'Amazon Bedrock AgentCore', detail: 'Managed container runtime for multi-agent orchestration', color: 'var(--violet-700)' },
              { label: 'LLM', value: 'Claude Sonnet (Bedrock)', detail: 'Foundation model for document understanding', color: '#3B82F6' },
              { label: 'Framework', value: 'LangGraph / Strands', detail: 'Agent orchestration with sequential pipelines', color: 'var(--green-500)' },
              { label: 'API Layer', value: 'API Gateway + Lambda', detail: 'Serverless async invoke with proxy/worker split', color: 'var(--violet-700)' },
              { label: 'State Store', value: 'DynamoDB', detail: 'Session tracking with TTL-based cleanup', color: '#3B82F6' },
              { label: 'CDN & Hosting', value: 'CloudFront + S3', detail: 'SPA hosting with origin access control', color: 'var(--green-500)' },
            ].map((item, i) => (
              <div
                key={item.label}
                className="card animate-fade-in"
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
            className="surface group block text-center p-6 rounded-2xl transition-all hover:shadow-lg"
            style={{ border: '1px dashed rgba(124, 58, 237, 0.2)' }}
          >
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Try with a sample document
            </p>
            <div className="flex justify-center gap-3">
              {config.input_schema.test_entities.map((id) => (
                <code
                  key={id}
                  className="inline-block px-4 py-1.5 rounded-lg text-xs font-mono"
                  style={{
                    background: 'rgba(124, 58, 237, 0.06)',
                    border: '1px solid rgba(124, 58, 237, 0.15)',
                    color: 'var(--violet-700)',
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
