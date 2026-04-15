import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

const placeholderSuggestions = [
  'Look up customer account balances...',
  'Generate quarterly compliance report...',
  'Summarize onboarding documents...',
  'Automate wire transfer approvals...',
  'Pull recent transaction history...',
];

const taskTypeIcons: Record<string, JSX.Element> = {
  full: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  data_lookup: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  ),
  report_generation: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  document_summary: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  task_automation: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  ),
};

const taskTypeDescriptions: Record<string, string> = {
  full: 'End-to-end task execution with all agents',
  data_lookup: 'Query and retrieve banking system data',
  report_generation: 'Create formatted reports and insights',
  document_summary: 'Summarize and extract key information',
  task_automation: 'Automate repetitive banking workflows',
};

export default function Home({ config }: Props) {
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const target = placeholderSuggestions[placeholderIdx];
    if (isTyping) {
      if (displayText.length < target.length) {
        const timer = setTimeout(() => {
          setDisplayText(target.slice(0, displayText.length + 1));
        }, 35);
        return () => clearTimeout(timer);
      } else {
        const pause = setTimeout(() => setIsTyping(false), 2000);
        return () => clearTimeout(pause);
      }
    } else {
      if (displayText.length > 0) {
        const timer = setTimeout(() => {
          setDisplayText(displayText.slice(0, -1));
        }, 20);
        return () => clearTimeout(timer);
      } else {
        setPlaceholderIdx((i) => (i + 1) % placeholderSuggestions.length);
        setIsTyping(true);
      }
    }
  }, [displayText, isTyping, placeholderIdx]);

  const agents = config.agents;
  const agentColors = ['#7C3AED', '#3B82F6', '#10B981'];
  const agentBgs = ['rgba(124,58,237,0.06)', 'rgba(59,130,246,0.06)', 'rgba(16,185,129,0.06)'];
  const agentBorders = ['rgba(124,58,237,0.15)', 'rgba(59,130,246,0.15)', 'rgba(16,185,129,0.15)'];

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">

      {/* Hero: Command Palette */}
      <section className="animate-fade-slide-up mb-16 text-center">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--black-near)' }}>
          Banking AI Assistant
        </h1>
        <p className="text-base mb-8" style={{ color: 'var(--gray-500)' }}>
          {config.description}
        </p>

        <div className="max-w-2xl mx-auto relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--gray-400)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <input
            type="text"
            className="command-bar-large"
            placeholder={displayText + (isTyping ? '|' : '')}
            readOnly
            onClick={() => window.location.href = '/console'}
            style={{ cursor: 'pointer' }}
          />
          <div
            className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-xs font-mono"
            style={{
              background: 'var(--gray-100)',
              color: 'var(--gray-400)',
              border: '1px solid var(--gray-200)',
            }}
          >
            Ctrl+K
          </div>
        </div>
      </section>

      {/* Stats Row */}
      <section className="animate-fade-slide-up stagger-1 mb-14">
        <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto">
          {[
            { value: String(agents.length), label: 'Agents', icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--purple-600)" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 1 0-16 0" /></svg>
            )},
            { value: String(config.input_schema.type_options.length), label: 'Task Types', icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--purple-600)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12l2 2 4-4" /></svg>
            )},
            { value: '24hr', label: 'Data Freshness', icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--purple-600)" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            )},
          ].map((stat, i) => (
            <div key={i} className="card text-center" style={{ padding: '1.25rem 1rem' }}>
              <div className="flex items-center justify-center gap-2 mb-1">
                {stat.icon}
                <span className="text-2xl font-bold" style={{ color: 'var(--black-near)' }}>{stat.value}</span>
              </div>
              <span className="text-xs font-medium" style={{ color: 'var(--gray-500)' }}>{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Task Types - Kanban Row */}
      <section className="animate-fade-slide-up stagger-2 mb-14">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--black-near)' }}>Task Types</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {config.input_schema.type_options.map((opt) => (
            <Link
              key={opt.value}
              to="/console"
              className="kanban-col no-underline flex-shrink-0"
              style={{ minWidth: '180px' }}
            >
              <div className="mb-3" style={{ color: 'var(--purple-600)' }}>
                {taskTypeIcons[opt.value] || taskTypeIcons['full']}
              </div>
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--black-near)' }}>
                {opt.label}
              </div>
              <div className="text-xs" style={{ color: 'var(--gray-500)', lineHeight: '1.5' }}>
                {taskTypeDescriptions[opt.value] || 'Execute this task type'}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="animate-fade-slide-up stagger-3 mb-14">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--black-near)' }}>How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { step: '01', title: 'Route', desc: 'Task Router classifies your request and identifies the optimal processing path', color: '#7C3AED' },
            { step: '02', title: 'Lookup', desc: 'Data Lookup Agent retrieves relevant information from internal banking systems', color: '#3B82F6' },
            { step: '03', title: 'Report', desc: 'Report Generator synthesizes findings into actionable, formatted output', color: '#10B981' },
          ].map((item, i) => (
            <div key={i} className="card relative overflow-hidden" style={{ padding: '1.5rem' }}>
              <div
                className="absolute top-0 left-0 w-full h-1"
                style={{ background: item.color }}
              />
              <div
                className="text-xs font-bold mb-2 font-mono"
                style={{ color: item.color }}
              >
                STEP {item.step}
              </div>
              <div className="text-base font-semibold mb-1" style={{ color: 'var(--black-near)' }}>
                {item.title}
              </div>
              <div className="text-sm" style={{ color: 'var(--gray-500)', lineHeight: '1.6' }}>
                {item.desc}
              </div>
              {i < 2 && (
                <div
                  className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10"
                  style={{ color: 'var(--gray-300)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Architecture Diagram */}
      <section className="animate-fade-slide-up stagger-4 mb-14">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--black-near)' }}>Architecture</h2>
        <div className="card" style={{ padding: '2rem', overflow: 'hidden' }}>
          <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
            <defs>
              <marker id="arrowPurple" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill="#7C3AED" />
              </marker>
            </defs>

            {/* ── Row 1: User → CloudFront → S3 ── */}
            {/* User Browser */}
            <rect x="40" y="20" width="100" height="70" rx="10" fill="#F5F3FF" stroke="#7C3AED" strokeWidth="1.5" />
            <text x="90" y="50" textAnchor="middle" fill="#7C3AED" fontSize="11" fontWeight="600">User Browser</text>
            <text x="90" y="66" textAnchor="middle" fill="#737373" fontSize="8">SPA Client</text>

            <line x1="140" y1="55" x2="220" y2="55" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrowPurple)" />

            {/* CloudFront */}
            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
            <text x="250" y="74" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">CloudFront</text>
            <text x="250" y="86" textAnchor="middle" fill="#737373" fontSize="8">CDN + SPA Rewrite</text>

            <line x1="280" y1="55" x2="370" y2="55" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrowPurple)" />
            <text x="325" y="48" textAnchor="middle" fill="#A3A3A3" fontSize="7">OAC</text>

            {/* S3 */}
            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
            <text x="400" y="74" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">S3</text>
            <text x="400" y="86" textAnchor="middle" fill="#737373" fontSize="8">Static UI Assets</text>

            {/* CloudFront → API Gateway (down to row 2) */}
            <line x1="250" y1="90" x2="250" y2="130" stroke="#7C3AED" strokeWidth="1.5" />
            <line x1="250" y1="130" x2="100" y2="130" stroke="#7C3AED" strokeWidth="1.5" />
            <line x1="100" y1="130" x2="100" y2="160" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrowPurple)" />
            <text x="175" y="126" textAnchor="middle" fill="#A3A3A3" fontSize="7">/api/* routing</text>

            {/* ── Row 2: API Gateway → Lambda Proxy → Lambda Worker ↔ DynamoDB ── */}
            {/* API Gateway */}
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="162" width="36" height="36" />
            <text x="100" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">API Gateway</text>
            <text x="100" y="226" textAnchor="middle" fill="#737373" fontSize="8">HTTP API</text>

            <line x1="130" y1="180" x2="230" y2="180" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrowPurple)" />

            {/* Lambda Proxy */}
            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="242" y="162" width="36" height="36" />
            <text x="260" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Lambda Proxy</text>
            <text x="260" y="226" textAnchor="middle" fill="#737373" fontSize="8">30s timeout</text>
            <text x="260" y="237" textAnchor="middle" fill="#A3A3A3" fontSize="7">POST /invoke, GET /status</text>

            <line x1="290" y1="180" x2="400" y2="180" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrowPurple)" />
            <text x="345" y="174" textAnchor="middle" fill="#A3A3A3" fontSize="7">async</text>

            {/* Lambda Worker */}
            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="412" y="162" width="36" height="36" />
            <text x="430" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Lambda Worker</text>
            <text x="430" y="226" textAnchor="middle" fill="#737373" fontSize="8">300s timeout</text>

            {/* DynamoDB (right of worker) */}
            <line x1="460" y1="180" x2="560" y2="180" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrowPurple)" />
            <line x1="560" y1="186" x2="460" y2="186" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrowPurple)" />

            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="572" y="162" width="36" height="36" />
            <text x="590" y="214" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">DynamoDB</text>
            <text x="590" y="226" textAnchor="middle" fill="#737373" fontSize="8">Session State + TTL</text>

            {/* ── Row 3: AgentCore Runtime → Agents → Bedrock, ECR connected ── */}
            {/* Lambda Worker → AgentCore (down) */}
            <line x1="430" y1="240" x2="430" y2="280" stroke="#7C3AED" strokeWidth="1.5" />
            <line x1="430" y1="280" x2="160" y2="280" stroke="#7C3AED" strokeWidth="1.5" />
            <line x1="160" y1="280" x2="160" y2="320" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrowPurple)" />

            {/* AgentCore Runtime */}
            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="142" y="322" width="36" height="36" />
            <text x="160" y="374" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">AgentCore Runtime</text>
            <text x="160" y="386" textAnchor="middle" fill="#737373" fontSize="8">Bedrock Managed Container</text>

            {/* AgentCore → Agents */}
            <line x1="200" y1="340" x2="310" y2="340" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrowPurple)" />

            {/* Agent boxes */}
            <rect x="320" y="305" width="120" height="32" rx="6" fill="#F5F3FF" stroke="#7C3AED" strokeWidth="1.5" />
            <text x="380" y="325" textAnchor="middle" fill="#7C3AED" fontSize="9" fontWeight="600">Task Router</text>

            <rect x="320" y="345" width="120" height="32" rx="6" fill="rgba(59,130,246,0.08)" stroke="#3B82F6" strokeWidth="1.5" />
            <text x="380" y="365" textAnchor="middle" fill="#3B82F6" fontSize="9" fontWeight="600">Data Lookup Agent</text>

            <rect x="320" y="385" width="120" height="32" rx="6" fill="rgba(16,185,129,0.08)" stroke="#10B981" strokeWidth="1.5" />
            <text x="380" y="405" textAnchor="middle" fill="#10B981" fontSize="9" fontWeight="600">Report Generator</text>

            {/* Agents → Bedrock */}
            <line x1="440" y1="360" x2="540" y2="360" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrowPurple)" />

            {/* Amazon Bedrock */}
            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="552" y="342" width="36" height="36" />
            <text x="570" y="394" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">Amazon Bedrock</text>
            <text x="570" y="406" textAnchor="middle" fill="#737373" fontSize="8">Claude Sonnet (LLM)</text>

            {/* ECR → AgentCore */}
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="142" y="430" width="36" height="36" />
            <text x="160" y="482" textAnchor="middle" fill="#1F2937" fontSize="10" fontWeight="600">ECR</text>
            <text x="160" y="494" textAnchor="middle" fill="#737373" fontSize="8">Container Images</text>
            <line x1="160" y1="430" x2="160" y2="392" stroke="#7C3AED" strokeWidth="1.5" markerEnd="url(#arrowPurple)" />

            {/* Monitoring sidebar */}
            <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="802" y="162" width="36" height="36" />
            <text x="820" y="214" textAnchor="middle" fill="#1F2937" fontSize="9" fontWeight="600">CloudWatch</text>

            <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="882" y="162" width="36" height="36" />
            <text x="900" y="214" textAnchor="middle" fill="#1F2937" fontSize="9" fontWeight="600">X-Ray</text>

            <line x1="790" y1="180" x2="628" y2="180" stroke="#D4D4D4" strokeWidth="1" strokeDasharray="4,3" />
            <text x="710" y="174" textAnchor="middle" fill="#A3A3A3" fontSize="7">Observability</text>
          </svg>
        </div>
      </section>

      {/* Agent Cards */}
      <section className="animate-fade-slide-up stagger-5 mb-14">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--black-near)' }}>Agents</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {agents.map((agent, i) => (
            <div
              key={agent.id}
              className="card relative overflow-hidden"
              style={{
                background: agentBgs[i % agentBgs.length],
                border: `1px solid ${agentBorders[i % agentBorders.length]}`,
                padding: '1.5rem',
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                style={{ background: agentColors[i % agentColors.length] + '18' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={agentColors[i % agentColors.length]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 1 0-16 0" />
                </svg>
              </div>
              <div className="text-sm font-semibold mb-1" style={{ color: agentColors[i % agentColors.length] }}>
                {agent.name}
              </div>
              <div className="text-sm" style={{ color: 'var(--gray-600)', lineHeight: '1.5' }}>
                {agent.description}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="animate-fade-slide-up stagger-6 text-center pb-10">
        <div className="card inline-block" style={{ padding: '2rem 3rem', background: 'var(--purple-50)', border: '1px solid rgba(124,58,237,0.12)' }}>
          <p className="text-sm mb-3" style={{ color: 'var(--gray-600)' }}>
            Ready to get started? Try with test employee
          </p>
          <div className="flex items-center justify-center gap-3">
            <code
              className="px-3 py-1.5 rounded-lg text-sm font-mono font-medium"
              style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', color: 'var(--purple-700)' }}
            >
              {config.input_schema.test_entities[0]}
            </code>
            <Link to="/console" className="btn-primary no-underline gap-2">
              Launch Console
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
