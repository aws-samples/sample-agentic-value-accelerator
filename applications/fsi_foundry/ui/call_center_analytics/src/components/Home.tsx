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
  call_monitor: {
    color: '#2563EB',
    features: ['Real-time call quality scoring', 'Sentiment & compliance tracking', 'Quality issue identification'],
  },
  performance_analyst: {
    color: '#10B981',
    features: ['Agent KPI benchmarking', 'First-call resolution analysis', 'Coaching priority ranking'],
  },
  insight_generator: {
    color: '#F59E0B',
    features: ['Volume trend forecasting', 'Bottleneck detection', 'Staffing optimization'],
  },
};

const agentIcons: Record<string, React.ReactNode> = {
  call_monitor: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  ),
  performance_analyst: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  insight_generator: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
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
          background: 'radial-gradient(ellipse at 30% 20%, rgba(37,99,235,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(16,185,129,0.04) 0%, transparent 50%)',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 py-20">

        {/* ===== HERO ===== */}
        <div className="text-center mb-28 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-mono uppercase tracking-widest mb-8"
            style={{
              background: 'rgba(37,99,235,0.06)',
              border: '1px solid rgba(37,99,235,0.15)',
              color: 'var(--blue)',
            }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--emerald)' }} />
            {config.domain} &mdash; Operations Monitor
          </div>

          <h1 className="text-6xl font-black mb-6 leading-tight tracking-tight" style={{ color: 'var(--slate-900)' }}>
            Call Center{' '}
            <span style={{ color: 'var(--blue)' }}>Analytics</span>
          </h1>

          <p className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {config.description}. Powered by <span className="font-semibold" style={{ color: 'var(--blue)' }}>{config.agents.length} AI agents</span> monitoring
            call quality, agent performance, and operational efficiency in real-time.
          </p>

          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/console')} className="btn-primary text-base px-10 py-4 font-bold">
              Open Analytics Console
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
            <AnimatedStat value="3" label="AI Agents" color="var(--blue)" />
            <AnimatedStat value="4" label="Analysis Types" color="var(--emerald)" />
            <AnimatedStat value="<45s" label="Avg Analysis" color="var(--amber)" />
          </div>
        </div>

        {/* ===== ANALYTICS FLOW ===== */}
        <div id="how-it-works" className="max-w-6xl mx-auto mb-28">
          <div className="text-center mb-14">
            <h2 className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1" style={{ color: 'var(--blue)' }}>
              Analytics Pipeline
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              From call center ID to comprehensive analytics &mdash; multi-agent orchestration
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
            {[
              { num: '01', title: 'Input Received', desc: 'Call center ID and analysis scope submitted through the analytics console.', color: 'var(--blue)' },
              { num: '02', title: 'Call Monitoring', desc: 'Call Monitor agent reviews call quality, sentiment, and compliance across all interactions.', color: 'var(--blue)' },
              { num: '03', title: 'Performance Analysis', desc: 'Performance Analyst benchmarks agent KPIs, resolution rates, and coaching needs.', color: 'var(--emerald)' },
              { num: '04', title: 'Ops Insights', desc: 'Insight Generator analyzes volumes, identifies bottlenecks, and forecasts staffing.', color: 'var(--amber)' },
              { num: '05', title: 'Report Ready', desc: 'Unified analytics dashboard with KPIs, issues, and actionable recommendations.', color: 'var(--emerald)' },
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
                    <svg className="w-5 h-5" fill="var(--blue)" viewBox="0 0 20 20">
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
            <h2 className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-1" style={{ color: 'var(--blue)' }}>
              Architecture
            </h2>
          </div>
          <div className="card-elevated animate-fade-in p-8" style={{ animationDelay: '0.15s' }}>
            <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
              <defs>
                <marker id="arrow-c" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#2563EB" />
                </marker>
                <filter id="soft-shadow">
                  <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.06" />
                </filter>
              </defs>

              {/* Row 1: User -> CloudFront -> S3 */}
              <rect x="30" y="20" width="120" height="70" rx="12" fill="white" stroke="#E2E8F0" strokeWidth="1" filter="url(#soft-shadow)" />
              <text x="90" y="48" textAnchor="middle" fill="#1E293B" fontSize="12" fontWeight="bold">User</text>
              <text x="90" y="66" textAnchor="middle" fill="#64748B" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="220" y2="55" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrow-c)" />

              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
              <text x="250" y="72" textAnchor="middle" fill="#1E293B" fontSize="11" fontWeight="bold">CloudFront</text>
              <text x="250" y="84" textAnchor="middle" fill="#64748B" fontSize="8">CDN + SPA Rewrite</text>

              <line x1="280" y1="45" x2="370" y2="45" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrow-c)" strokeDasharray="4,3" />
              <text x="325" y="38" textAnchor="middle" fill="#94A3B8" fontSize="8">static</text>

              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
              <text x="400" y="72" textAnchor="middle" fill="#1E293B" fontSize="11" fontWeight="bold">S3</text>
              <text x="400" y="84" textAnchor="middle" fill="#64748B" fontSize="8">UI Assets (OAC)</text>

              {/* Row 2: API GW -> Lambda Proxy -> Lambda Worker <-> DynamoDB */}
              <line x1="250" y1="90" x2="250" y2="140" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrow-c)" />
              <text x="262" y="120" textAnchor="start" fill="#94A3B8" fontSize="8">/api/*</text>

              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="148" width="36" height="36" />
              <text x="100" y="198" textAnchor="middle" fill="#1E293B" fontSize="11" fontWeight="bold">API Gateway</text>
              <text x="100" y="210" textAnchor="middle" fill="#64748B" fontSize="8">HTTP API</text>

              <line x1="130" y1="166" x2="250" y2="166" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrow-c)" />

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="262" y="148" width="36" height="36" />
              <text x="280" y="198" textAnchor="middle" fill="#1E293B" fontSize="11" fontWeight="bold">Lambda Proxy</text>
              <text x="280" y="210" textAnchor="middle" fill="#64748B" fontSize="8">POST /invoke, GET /status</text>
              <text x="280" y="221" textAnchor="middle" fill="#94A3B8" fontSize="8">30s timeout</text>

              <line x1="310" y1="166" x2="430" y2="166" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrow-c)" />
              <text x="370" y="158" textAnchor="middle" fill="#2563EB" fontSize="8" fontWeight="bold">async</text>

              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="442" y="148" width="36" height="36" />
              <text x="460" y="198" textAnchor="middle" fill="#1E293B" fontSize="11" fontWeight="bold">Lambda Worker</text>
              <text x="460" y="210" textAnchor="middle" fill="#64748B" fontSize="8">300s timeout</text>

              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="622" y="148" width="36" height="36" />
              <text x="640" y="198" textAnchor="middle" fill="#1E293B" fontSize="11" fontWeight="bold">DynamoDB</text>
              <text x="640" y="210" textAnchor="middle" fill="#64748B" fontSize="8">Session State + TTL</text>

              <line x1="490" y1="166" x2="610" y2="166" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrow-c)" />
              <line x1="610" y1="174" x2="490" y2="174" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrow-c)" strokeDasharray="4,3" />

              {/* Row 3: AgentCore -> Agents -> Bedrock */}
              <line x1="460" y1="222" x2="460" y2="280" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrow-c)" />

              <rect x="250" y="288" width="280" height="60" rx="12" fill="rgba(37,99,235,0.04)" stroke="#2563EB" strokeWidth="2" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="260" y="300" width="36" height="36" />
              <text x="400" y="314" textAnchor="middle" fill="#2563EB" fontSize="12" fontWeight="bold">AgentCore Runtime</text>
              <text x="400" y="332" textAnchor="middle" fill="#64748B" fontSize="9">Bedrock Managed Container</text>

              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="132" y="300" width="36" height="36" />
              <text x="150" y="350" textAnchor="middle" fill="#1E293B" fontSize="10" fontWeight="bold">ECR</text>
              <text x="150" y="362" textAnchor="middle" fill="#64748B" fontSize="8">Container Image</text>

              <line x1="178" y1="318" x2="248" y2="318" stroke="#2563EB" strokeWidth="1.5" markerEnd="url(#arrow-c)" strokeDasharray="4,3" />

              <line x1="320" y1="348" x2="280" y2="400" stroke="#2563EB" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="390" y1="348" x2="460" y2="400" stroke="#10B981" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="460" y1="348" x2="640" y2="400" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="4,3" />

              <rect x="195" y="405" width="170" height="32" rx="8" fill="rgba(37,99,235,0.04)" stroke="#2563EB" strokeWidth="1" />
              <text x="280" y="425" textAnchor="middle" fill="#2563EB" fontSize="10" fontWeight="bold">Call Monitor</text>

              <rect x="380" y="405" width="170" height="32" rx="8" fill="rgba(16,185,129,0.04)" stroke="#10B981" strokeWidth="1" />
              <text x="465" y="425" textAnchor="middle" fill="#10B981" fontSize="10" fontWeight="bold">Performance Analyst</text>

              <rect x="570" y="405" width="155" height="32" rx="8" fill="rgba(245,158,11,0.04)" stroke="#F59E0B" strokeWidth="1" />
              <text x="648" y="425" textAnchor="middle" fill="#F59E0B" fontSize="10" fontWeight="bold">Insight Generator</text>

              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="782" y="300" width="36" height="36" />
              <text x="800" y="350" textAnchor="middle" fill="#1E293B" fontSize="10" fontWeight="bold">Bedrock</text>
              <text x="800" y="362" textAnchor="middle" fill="#64748B" fontSize="8">Claude Sonnet</text>
              <text x="800" y="373" textAnchor="middle" fill="#94A3B8" fontSize="7">LLM Inference</text>

              <line x1="530" y1="318" x2="778" y2="318" stroke="#2563EB" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-c)" />
              <text x="654" y="310" textAnchor="middle" fill="#94A3B8" fontSize="8">LLM inference</text>

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
            <h2 className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-2" style={{ color: 'var(--blue)' }}>
              AI Agents
            </h2>
            <p className="text-sm animate-fade-in stagger-2" style={{ color: 'var(--text-muted)' }}>
              Three specialized agents for comprehensive call center analytics
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {config.agents.map((agent, i) => {
              const detail = agentDetails[agent.id] || agentDetails.call_monitor;
              const icon = agentIcons[agent.id] || agentIcons.call_monitor;
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
            <h2 className="text-xs font-mono uppercase tracking-[0.3em] mb-3 animate-fade-in stagger-2" style={{ color: 'var(--blue)' }}>
              Technology Stack
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { label: 'Runtime', value: 'Amazon Bedrock AgentCore', detail: 'Managed container runtime for multi-agent orchestration', color: 'var(--blue)' },
              { label: 'LLM', value: 'Claude Sonnet (Bedrock)', detail: 'Foundation model for natural language understanding', color: 'var(--emerald)' },
              { label: 'Framework', value: 'LangGraph / Strands', detail: 'Agent orchestration with parallel execution', color: 'var(--amber)' },
              { label: 'API Layer', value: 'API Gateway + Lambda', detail: 'Serverless async invoke with proxy/worker split', color: 'var(--blue)' },
              { label: 'State Store', value: 'DynamoDB', detail: 'Session tracking with TTL-based cleanup', color: 'var(--emerald)' },
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
            style={{ border: '1px dashed rgba(37,99,235,0.2)' }}
          >
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Try with a sample call center
            </p>
            <div className="flex justify-center gap-3">
              {config.input_schema.test_entities.map((id) => (
                <code
                  key={id}
                  className="inline-block px-4 py-1.5 rounded-lg text-xs font-mono"
                  style={{
                    background: 'rgba(37,99,235,0.06)',
                    border: '1px solid rgba(37,99,235,0.15)',
                    color: 'var(--blue)',
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
