import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

const pipelineSteps = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l2 2 4-4" />
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      </svg>
    ),
    title: 'Validate',
    description: 'Check compliance, sanctions, and business rules',
    agent: 'Payment Validator',
    color: 'var(--emerald-600)',
    bgColor: 'var(--emerald-50)',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="16 12 12 8 8 12" />
        <line x1="12" y1="16" x2="12" y2="8" />
      </svg>
    ),
    title: 'Route',
    description: 'Select optimal payment rail and path',
    agent: 'Routing Agent',
    color: 'var(--blue-500)',
    bgColor: 'var(--blue-50)',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <polyline points="17 11 19 13 23 9" />
      </svg>
    ),
    title: 'Reconcile',
    description: 'Match and reconcile across systems',
    agent: 'Reconciliation Agent',
    color: 'var(--slate-700)',
    bgColor: 'var(--slate-100)',
  },
];

const paymentRails = [
  {
    name: 'Fedwire',
    speed: 'Same day',
    cost: 'High',
    useCase: 'Large-value, time-critical transfers',
    color: 'var(--blue-500)',
    bgColor: 'var(--blue-50)',
    badgeClass: 'fedwire',
  },
  {
    name: 'ACH',
    speed: '1-3 days',
    cost: 'Low',
    useCase: 'Batch payments, payroll, recurring',
    color: 'var(--emerald-600)',
    bgColor: 'var(--emerald-50)',
    badgeClass: 'ach',
  },
  {
    name: 'RTP',
    speed: 'Instant',
    cost: 'Medium',
    useCase: 'Real-time domestic payments',
    color: 'var(--purple-500)',
    bgColor: 'var(--purple-100)',
    badgeClass: 'rtp',
  },
  {
    name: 'SWIFT',
    speed: '1-5 days',
    cost: 'High',
    useCase: 'International cross-border transfers',
    color: 'var(--orange-500)',
    bgColor: 'var(--orange-100)',
    badgeClass: 'swift',
  },
  {
    name: 'SEPA',
    speed: '1 day',
    cost: 'Low',
    useCase: 'European domestic and cross-border',
    color: 'var(--teal-500)',
    bgColor: 'var(--teal-100)',
    badgeClass: 'sepa',
  },
];

const agentDetails = [
  {
    id: 'payment_validator',
    name: 'Payment Validator',
    color: 'var(--emerald-600)',
    bgColor: 'var(--emerald-50)',
    borderColor: 'var(--emerald-500)',
    responsibilities: [
      'Sanctions screening (OFAC, EU, UN lists)',
      'Business rule compliance checks',
      'Duplicate payment detection',
      'Amount threshold validation',
      'KYC/AML verification status',
    ],
  },
  {
    id: 'routing_agent',
    name: 'Routing Agent',
    color: 'var(--blue-500)',
    bgColor: 'var(--blue-50)',
    borderColor: 'var(--blue-400)',
    responsibilities: [
      'Payment rail selection optimization',
      'Cost-benefit analysis per route',
      'Settlement time estimation',
      'Fallback routing paths',
      'Currency corridor analysis',
    ],
  },
  {
    id: 'reconciliation_agent',
    name: 'Reconciliation Agent',
    color: 'var(--slate-700)',
    bgColor: 'var(--slate-100)',
    borderColor: 'var(--slate-400)',
    responsibilities: [
      'Transaction matching across systems',
      'Discrepancy identification',
      'Balance reconciliation',
      'Exception handling workflows',
      'Audit trail generation',
    ],
  },
];

export default function Home({ config }: Props) {
  const revealRefs = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    revealRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const addRevealRef = (el: HTMLDivElement | null) => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      {/* Hero Section */}
      <div className="text-center mb-16 animate-fade-in">
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6"
          style={{ background: 'var(--emerald-50)', color: 'var(--emerald-600)' }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--emerald-500)' }} />
          {config.description}
        </div>
        <h1
          className="text-4xl md:text-5xl font-bold mb-4 leading-tight"
          style={{ color: 'var(--slate-900)' }}
        >
          Intelligent Payment
          <br />
          <span style={{ color: 'var(--emerald-600)' }}>Processing</span>
        </h1>
        <p
          className="text-lg max-w-2xl mx-auto mb-8"
          style={{ color: 'var(--text-secondary)' }}
        >
          AI-powered agents that validate, route, and reconcile payments in real time.
          Reduce errors, optimize costs, and accelerate settlement.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
        <div className="stat-card animate-slide-up">
          <div className="stat-value" style={{ color: 'var(--emerald-600)' }}>3</div>
          <div className="stat-label">AI Agents</div>
        </div>
        <div className="stat-card animate-slide-up-delay-1">
          <div className="stat-value" style={{ color: 'var(--blue-500)' }}>5</div>
          <div className="stat-label">Payment Rails</div>
        </div>
        <div className="stat-card animate-slide-up-delay-2">
          <div className="flex items-center justify-center gap-2">
            <div className="stat-value" style={{ color: 'var(--slate-900)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
          </div>
          <div className="stat-label">Real-time Processing</div>
        </div>
      </div>

      {/* Payment Pipeline */}
      <div ref={addRevealRef} className="reveal mb-20">
        <h2 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--slate-900)' }}>
          Payment Pipeline
        </h2>
        <p className="text-center mb-10" style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
          Every payment flows through three intelligent stages
        </p>

        <div className="flex items-start justify-center gap-0">
          {pipelineSteps.map((step, i) => (
            <div key={step.title} className="contents">
              <div className="pipeline-step" style={{ maxWidth: 200 }}>
                <div
                  className="pipeline-step-icon"
                  style={{ borderColor: step.color, background: step.bgColor, color: step.color }}
                >
                  {step.icon}
                </div>
                <span className="pipeline-step-label" style={{ color: step.color }}>
                  {step.title}
                </span>
                <span className="text-xs text-center px-2" style={{ color: 'var(--text-secondary)' }}>
                  {step.description}
                </span>
                <span
                  className="text-xs font-semibold mt-1 px-3 py-1 rounded-full"
                  style={{ background: step.bgColor, color: step.color }}
                >
                  {step.agent}
                </span>
              </div>
              {i < pipelineSteps.length - 1 && (
                <div className="pipeline-connector active" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Payment Rails */}
      <div ref={addRevealRef} className="reveal mb-20">
        <h2 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--slate-900)' }}>
          Supported Payment Rails
        </h2>
        <p className="text-center mb-10" style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
          Intelligent routing across all major payment networks
        </p>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {paymentRails.map((rail) => (
            <div
              key={rail.name}
              className="card text-center"
              style={{ borderTop: `3px solid ${rail.color}` }}
            >
              <div className={`payment-rail-badge ${rail.badgeClass} mx-auto mb-3`}>
                {rail.name}
              </div>
              <div className="space-y-3 mt-4">
                <div>
                  <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                    Speed
                  </div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {rail.speed}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                    Cost
                  </div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {rail.cost}
                  </div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {rail.useCase}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Detail Cards */}
      <div ref={addRevealRef} className="reveal mb-20">
        <h2 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--slate-900)' }}>
          AI Agent Network
        </h2>
        <p className="text-center mb-10" style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
          Specialized agents working in concert for every transaction
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {agentDetails.map((agent) => (
            <div
              key={agent.id}
              className="card"
              style={{ borderLeft: `4px solid ${agent.borderColor}` }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                  style={{ background: agent.bgColor, color: agent.color }}
                >
                  {agent.name.split(' ').map((w) => w[0]).join('')}
                </div>
                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {agent.name}
                </h3>
              </div>
              <ul className="space-y-2">
                {agent.responsibilities.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={agent.color}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-0.5 shrink-0"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Architecture */}
      <div ref={addRevealRef} className="reveal mb-20">
        <h2 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--slate-900)' }}>
          Architecture
        </h2>
        <p className="text-center mb-10" style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
          End-to-end serverless pipeline powering intelligent payment processing
        </p>

        <div
          className="card p-8"
          style={{ border: '1px solid var(--border)' }}
        >
          <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
            <defs>
              <marker id="arrow-e" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,3 L0,6" fill="#059669" />
              </marker>
              <filter id="emerald-glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor="#059669" floodOpacity="0.3" />
                <feComposite in2="blur" operator="in" />
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* ===== ROW 1: User -> CloudFront -> S3 ===== */}
            {/* User Browser */}
            <rect x="30" y="20" width="120" height="70" rx="12" fill="rgba(5,150,105,0.04)" stroke="#059669" strokeWidth="1" />
            <text x="90" y="48" textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="bold">User</text>
            <text x="90" y="66" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Browser</text>

            <line x1="150" y1="55" x2="220" y2="55" stroke="#059669" strokeWidth="1.5" markerEnd="url(#arrow-e)" />

            {/* CloudFront */}
            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">CloudFront</text>
            <text x="250" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="45" x2="370" y2="45" stroke="#059669" strokeWidth="1.5" markerEnd="url(#arrow-e)" strokeDasharray="4,3" />
            <text x="325" y="38" textAnchor="middle" fill="var(--text-muted)" fontSize="8">static</text>

            {/* S3 */}
            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">S3</text>
            <text x="400" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">UI Assets (OAC)</text>

            {/* ===== ROW 2: API GW -> Lambda Proxy -> Lambda Worker <-> DynamoDB ===== */}
            <line x1="250" y1="90" x2="250" y2="140" stroke="#059669" strokeWidth="1.5" markerEnd="url(#arrow-e)" />
            <text x="262" y="120" textAnchor="start" fill="var(--text-muted)" fontSize="8">/api/*</text>

            {/* API Gateway */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="148" width="36" height="36" />
            <text x="100" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">API Gateway</text>
            <text x="100" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">HTTP API</text>

            <line x1="130" y1="166" x2="250" y2="166" stroke="#059669" strokeWidth="1.5" markerEnd="url(#arrow-e)" />

            {/* Lambda Proxy */}
            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="262" y="148" width="36" height="36" />
            <text x="280" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Proxy</text>
            <text x="280" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">POST /invoke, GET /status</text>
            <text x="280" y="221" textAnchor="middle" fill="var(--text-muted)" fontSize="8">30s timeout</text>

            <line x1="310" y1="166" x2="430" y2="166" stroke="#059669" strokeWidth="1.5" markerEnd="url(#arrow-e)" />
            <text x="370" y="158" textAnchor="middle" fill="#059669" fontSize="8" fontWeight="bold">async</text>

            {/* Lambda Worker */}
            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="442" y="148" width="36" height="36" />
            <text x="460" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">Lambda Worker</text>
            <text x="460" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">300s timeout</text>

            {/* DynamoDB */}
            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="622" y="148" width="36" height="36" />
            <text x="640" y="198" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="bold">DynamoDB</text>
            <text x="640" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Session State + TTL</text>

            <line x1="490" y1="166" x2="610" y2="166" stroke="#059669" strokeWidth="1.5" markerEnd="url(#arrow-e)" />
            <line x1="610" y1="174" x2="490" y2="174" stroke="#059669" strokeWidth="1.5" markerEnd="url(#arrow-e)" strokeDasharray="4,3" />

            {/* ===== ROW 3: AgentCore -> Agents -> Bedrock, ECR -> AgentCore ===== */}
            <line x1="460" y1="222" x2="460" y2="280" stroke="#059669" strokeWidth="1.5" markerEnd="url(#arrow-e)" />

            {/* AgentCore Runtime */}
            <rect x="250" y="288" width="280" height="60" rx="12" fill="rgba(5,150,105,0.06)" stroke="#059669" strokeWidth="2" filter="url(#emerald-glow)" />
            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="260" y="300" width="36" height="36" />
            <text x="400" y="314" textAnchor="middle" fill="#059669" fontSize="12" fontWeight="bold">AgentCore Runtime</text>
            <text x="400" y="332" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Bedrock Managed Container</text>

            {/* ECR */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="132" y="300" width="36" height="36" />
            <text x="150" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">ECR</text>
            <text x="150" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Container Image</text>

            <line x1="178" y1="318" x2="248" y2="318" stroke="#059669" strokeWidth="1.5" markerEnd="url(#arrow-e)" strokeDasharray="4,3" />

            {/* Agent lines from AgentCore */}
            <line x1="320" y1="348" x2="280" y2="400" stroke="#059669" strokeWidth="1.5" strokeDasharray="4,3" />
            <line x1="390" y1="348" x2="460" y2="400" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="4,3" />
            <line x1="460" y1="348" x2="640" y2="400" stroke="#475569" strokeWidth="1.5" strokeDasharray="4,3" />

            {/* Agent: Payment Validator */}
            <rect x="200" y="405" width="160" height="32" rx="8" fill="rgba(5,150,105,0.04)" stroke="#059669" strokeWidth="1" />
            <text x="280" y="425" textAnchor="middle" fill="#059669" fontSize="10" fontWeight="bold">Payment Validator</text>

            {/* Agent: Routing Agent */}
            <rect x="380" y="405" width="160" height="32" rx="8" fill="rgba(59,130,246,0.04)" stroke="#3B82F6" strokeWidth="1" />
            <text x="460" y="425" textAnchor="middle" fill="#3B82F6" fontSize="10" fontWeight="bold">Routing Agent</text>

            {/* Agent: Reconciliation Agent */}
            <rect x="560" y="405" width="170" height="32" rx="8" fill="rgba(71,85,105,0.04)" stroke="#475569" strokeWidth="1" />
            <text x="645" y="425" textAnchor="middle" fill="#475569" fontSize="10" fontWeight="bold">Reconciliation Agent</text>

            {/* Bedrock */}
            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="782" y="300" width="36" height="36" />
            <text x="800" y="350" textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="bold">Bedrock</text>
            <text x="800" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Claude Sonnet</text>
            <text x="800" y="373" textAnchor="middle" fill="var(--text-muted)" fontSize="7">LLM Inference</text>

            <line x1="530" y1="318" x2="778" y2="318" stroke="#059669" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-e)" />
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

      {/* CTA */}
      <div ref={addRevealRef} className="reveal text-center mb-12">
        <div className="card inline-block px-12 py-10">
          <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--slate-900)' }}>
            Ready to process a payment?
          </h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Submit a payment and watch the AI agents validate, route, and reconcile in real time.
          </p>
          <Link to="/console" className="btn-primary inline-block no-underline">
            Process Payment
          </Link>
        </div>
      </div>
    </div>
  );
}
