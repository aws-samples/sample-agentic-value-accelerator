import { useNavigate, Link } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import type { RuntimeConfig } from '../config';

/* ---- Animated Counter ---- */

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
      <div className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

/* ---- Agent Detail Data ---- */

const agentDetails: Record<string, { color: string; features: string[] }> = {
  transcription_processor: {
    color: '#4338CA',
    features: ['Speaker diarization & identification', 'Key topic extraction', 'Transcript summarization'],
  },
  sentiment_analyst: {
    color: '#16A34A',
    features: ['Real-time sentiment scoring', 'Emotional shift detection', 'Customer satisfaction prediction'],
  },
  action_extractor: {
    color: '#D97706',
    features: ['Action item identification', 'Assignee & deadline extraction', 'Priority classification'],
  },
};

const agentIcons: Record<string, React.ReactNode> = {
  transcription_processor: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  sentiment_analyst: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
    </svg>
  ),
  action_extractor: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
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
      {/* Subtle gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, rgba(67,56,202,0.05) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(22,163,74,0.03) 0%, transparent 50%)',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 py-20">

        {/* ===== HERO ===== */}
        <div className="text-center mb-28 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-mono uppercase tracking-widest mb-8"
            style={{
              background: 'rgba(67,56,202,0.06)',
              border: '1px solid rgba(67,56,202,0.15)',
              color: 'var(--indigo)',
            }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--green)' }} />
            {config.domain} &mdash; Call Review
          </div>

          <h1 className="text-6xl font-black mb-6 leading-tight tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Post Call{' '}
            <span style={{ color: 'var(--indigo)' }}>Analytics</span>
          </h1>

          <p className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {config.description}. Powered by <span className="font-semibold" style={{ color: 'var(--indigo)' }}>{config.agents.length} AI agents</span> for
            transcription, sentiment analysis, and action item extraction.
          </p>

          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/console')} className="btn-primary text-base px-10 py-4 font-bold">
              Review a Call
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
            <AnimatedStat value="3" label="AI Agents" color="var(--indigo)" />
            <AnimatedStat value="4" label="Analysis Types" color="var(--green)" />
            <AnimatedStat value="<30s" label="Avg Review" color="var(--amber)" />
          </div>
        </div>

        {/* ===== REVIEW FLOW ===== */}
        <div id="how-it-works" className="max-w-6xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2 className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1" style={{ color: 'var(--indigo)' }}>
              Review Pipeline
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              From call ID to actionable insights &mdash; automated post-call analysis
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
            {[
              { num: '01', title: 'Call Submitted', desc: 'Call ID and analysis scope submitted for review through the console.', color: 'var(--indigo)' },
              { num: '02', title: 'Transcription', desc: 'Transcription Processor identifies speakers, extracts topics, and summarizes dialogue.', color: 'var(--indigo)' },
              { num: '03', title: 'Sentiment', desc: 'Sentiment Analyst scores customer/agent emotion, tracks shifts, and predicts satisfaction.', color: 'var(--green)' },
              { num: '04', title: 'Actions', desc: 'Action Extractor identifies follow-ups, assigns owners, and sets priorities and deadlines.', color: 'var(--amber)' },
              { num: '05', title: 'Report', desc: 'Unified call review with transcript, sentiment visualization, and action items.', color: 'var(--green)' },
            ].map((step, i) => (
              <div key={step.num} className="relative animate-fade-in" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                <div className="card text-center h-full">
                  <div className="text-3xl font-black font-mono mb-3" style={{ color: step.color, opacity: 0.2 }}>
                    {step.num}
                  </div>
                  <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{step.desc}</p>
                </div>
                {i < 4 && (
                  <div className="hidden md:flex absolute top-1/2 -right-3 transform -translate-y-1/2 z-20 items-center">
                    <svg className="w-5 h-5" fill="var(--indigo)" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
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
            <h2 className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1" style={{ color: 'var(--indigo)' }}>
              Architecture
            </h2>
          </div>
          <div className="card-elevated animate-fade-in p-8" style={{ animationDelay: '0.15s' }}>
            <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
              <defs>
                <marker id="arrow-c" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#4338CA" />
                </marker>
                <filter id="soft-shadow">
                  <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.06" />
                </filter>
              </defs>

              {/* Row 1: User -> CloudFront -> S3 */}
              <rect x="30" y="20" width="120" height="70" rx="12" fill="white" stroke="#E5E7EB" strokeWidth="1" filter="url(#soft-shadow)" />
              <text x="90" y="48" textAnchor="middle" fill="#1F2937" fontSize="12" fontWeight="bold">User</text>
              <text x="90" y="66" textAnchor="middle" fill="#6B7280" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="220" y2="55" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrow-c)" />

              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
              <text x="250" y="72" textAnchor="middle" fill="#1F2937" fontSize="11" fontWeight="bold">CloudFront</text>
              <text x="250" y="84" textAnchor="middle" fill="#6B7280" fontSize="8">CDN + SPA Rewrite</text>

              <line x1="280" y1="45" x2="370" y2="45" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrow-c)" strokeDasharray="4,3" />
              <text x="325" y="38" textAnchor="middle" fill="#9CA3AF" fontSize="8">static</text>

              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
              <text x="400" y="72" textAnchor="middle" fill="#1F2937" fontSize="11" fontWeight="bold">S3</text>
              <text x="400" y="84" textAnchor="middle" fill="#6B7280" fontSize="8">UI Assets (OAC)</text>

              {/* Row 2: API GW -> Lambda Proxy -> Lambda Worker <-> DynamoDB */}
              <line x1="250" y1="90" x2="250" y2="140" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrow-c)" />
              <text x="262" y="120" textAnchor="start" fill="#9CA3AF" fontSize="8">/api/*</text>

              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="148" width="36" height="36" />
              <text x="100" y="198" textAnchor="middle" fill="#1F2937" fontSize="11" fontWeight="bold">API Gateway</text>
              <text x="100" y="210" textAnchor="middle" fill="#6B7280" fontSize="8">HTTP API</text>

              <line x1="130" y1="166" x2="250" y2="166" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrow-c)" />

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="262" y="148" width="36" height="36" />
              <text x="280" y="198" textAnchor="middle" fill="#1F2937" fontSize="11" fontWeight="bold">Lambda Proxy</text>
              <text x="280" y="210" textAnchor="middle" fill="#6B7280" fontSize="8">POST /invoke, GET /status</text>
              <text x="280" y="221" textAnchor="middle" fill="#9CA3AF" fontSize="8">30s timeout</text>

              <line x1="310" y1="166" x2="430" y2="166" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrow-c)" />
              <text x="370" y="158" textAnchor="middle" fill="#4338CA" fontSize="8" fontWeight="bold">async</text>

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="442" y="148" width="36" height="36" />
              <text x="460" y="198" textAnchor="middle" fill="#1F2937" fontSize="11" fontWeight="bold">Lambda Worker</text>
              <text x="460" y="210" textAnchor="middle" fill="#6B7280" fontSize="8">300s timeout</text>

              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="622" y="148" width="36" height="36" />
              <text x="640" y="198" textAnchor="middle" fill="#1F2937" fontSize="11" fontWeight="bold">DynamoDB</text>
              <text x="640" y="210" textAnchor="middle" fill="#6B7280" fontSize="8">Session State + TTL</text>

              <line x1="490" y1="166" x2="610" y2="166" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrow-c)" />
              <line x1="610" y1="174" x2="490" y2="174" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrow-c)" strokeDasharray="4,3" />

              {/* Row 3: AgentCore -> Agents -> Bedrock */}
              <line x1="460" y1="222" x2="460" y2="280" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrow-c)" />

              <rect x="250" y="288" width="280" height="60" rx="12" fill="rgba(67,56,202,0.04)" stroke="#4338CA" strokeWidth="2" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="260" y="300" width="36" height="36" />
              <text x="400" y="314" textAnchor="middle" fill="#4338CA" fontSize="12" fontWeight="bold">AgentCore Runtime</text>
              <text x="400" y="332" textAnchor="middle" fill="#6B7280" fontSize="9">Bedrock Managed Container</text>

              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="132" y="300" width="36" height="36" />
              <text x="150" y="350" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="bold">ECR</text>
              <text x="150" y="362" textAnchor="middle" fill="#6B7280" fontSize="8">Container Image</text>

              <line x1="178" y1="318" x2="248" y2="318" stroke="#4338CA" strokeWidth="1.5" markerEnd="url(#arrow-c)" strokeDasharray="4,3" />

              <line x1="320" y1="348" x2="280" y2="400" stroke="#4338CA" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="390" y1="348" x2="460" y2="400" stroke="#16A34A" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="460" y1="348" x2="640" y2="400" stroke="#D97706" strokeWidth="1.5" strokeDasharray="4,3" />

              <rect x="185" y="405" width="190" height="32" rx="8" fill="rgba(67,56,202,0.04)" stroke="#4338CA" strokeWidth="1" />
              <text x="280" y="425" textAnchor="middle" fill="#4338CA" fontSize="10" fontWeight="bold">Transcription Processor</text>

              <rect x="390" y="405" width="150" height="32" rx="8" fill="rgba(22,163,74,0.04)" stroke="#16A34A" strokeWidth="1" />
              <text x="465" y="425" textAnchor="middle" fill="#16A34A" fontSize="10" fontWeight="bold">Sentiment Analyst</text>

              <rect x="560" y="405" width="160" height="32" rx="8" fill="rgba(217,119,6,0.04)" stroke="#D97706" strokeWidth="1" />
              <text x="640" y="425" textAnchor="middle" fill="#D97706" fontSize="10" fontWeight="bold">Action Extractor</text>

              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="782" y="300" width="36" height="36" />
              <text x="800" y="350" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="bold">Bedrock</text>
              <text x="800" y="362" textAnchor="middle" fill="#6B7280" fontSize="8">Claude Sonnet</text>
              <text x="800" y="373" textAnchor="middle" fill="#9CA3AF" fontSize="7">LLM Inference</text>

              <line x1="530" y1="318" x2="778" y2="318" stroke="#4338CA" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-c)" />
              <text x="654" y="310" textAnchor="middle" fill="#9CA3AF" fontSize="8">LLM inference</text>

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
            <h2 className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-2" style={{ color: 'var(--indigo)' }}>
              AI Agents
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              Three specialized agents for comprehensive post-call analysis
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {config.agents.map((agent, i) => {
              const detail = agentDetails[agent.id] || agentDetails.transcription_processor;
              const icon = agentIcons[agent.id] || agentIcons.transcription_processor;
              return (
                <div key={agent.id} className="animate-fade-in" style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
                  <div className="card h-full">
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center mb-5"
                      style={{
                        background: `${detail.color}0A`,
                        border: `1px solid ${detail.color}20`,
                        color: detail.color,
                      }}
                    >
                      {icon}
                    </div>
                    <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{agent.name}</h3>
                    <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)' }}>{agent.description}</p>
                    <div className="space-y-2.5">
                      {detail.features.map((feat, fi) => (
                        <div key={fi} className="flex items-start gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: detail.color }} />
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
            <h2 className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-2" style={{ color: 'var(--indigo)' }}>
              Technology Stack
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { label: 'Runtime', value: 'Amazon Bedrock AgentCore', detail: 'Managed container runtime for multi-agent orchestration', color: 'var(--indigo)' },
              { label: 'LLM', value: 'Claude Sonnet (Bedrock)', detail: 'Foundation model for natural language understanding', color: 'var(--green)' },
              { label: 'Framework', value: 'LangGraph / Strands', detail: 'Agent orchestration with parallel execution', color: 'var(--amber)' },
              { label: 'API Layer', value: 'API Gateway + Lambda', detail: 'Serverless async invoke with proxy/worker split', color: 'var(--indigo)' },
              { label: 'State Store', value: 'DynamoDB', detail: 'Session tracking with TTL-based cleanup', color: 'var(--green)' },
              { label: 'CDN & Hosting', value: 'CloudFront + S3', detail: 'SPA hosting with origin access control', color: 'var(--amber)' },
            ].map((item, i) => (
              <div key={item.label} className="card animate-fade-in" style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                <p className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: item.color }}>{item.label}</p>
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
            className="card group block text-center p-6 rounded-2xl transition-all"
            style={{ border: '1px dashed rgba(67,56,202,0.2)' }}
          >
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Try with a sample call
            </p>
            <div className="flex justify-center gap-3">
              {config.input_schema.test_entities.map((id) => (
                <code
                  key={id}
                  className="inline-block px-4 py-1.5 rounded-lg text-xs font-mono"
                  style={{
                    background: 'rgba(67,56,202,0.06)',
                    border: '1px solid rgba(67,56,202,0.15)',
                    color: 'var(--indigo)',
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
