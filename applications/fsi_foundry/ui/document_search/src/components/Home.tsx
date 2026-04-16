import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

const categoryIcons: Record<string, { icon: string; color: string }> = {
  full: { icon: 'M4 6h16M4 12h16M4 18h16', color: '#D97706' },
  policy: { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', color: '#B45309' },
  procedure: { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', color: '#92400E' },
  compliance: { icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z', color: '#78350F' },
  regulation: { icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z', color: '#44200D' },
  guideline: { icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', color: '#D97706' },
};

const sampleSearches = [
  'Anti-money laundering requirements',
  'KYC documentation standards',
  'Credit risk assessment procedures',
  'Basel III compliance guidelines',
  'Data privacy regulations banking',
  'Loan origination process steps',
];

const stats = [
  { label: 'Documents Indexed', value: '12,847' },
  { label: 'Categories', value: '6' },
  { label: 'Instant Results', value: '<2s' },
];

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-slide-up');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 },
    );
    const children = el.querySelectorAll('.reveal');
    children.forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, []);
  return ref;
}

export default function Home({ config }: Props) {
  const scrollRef = useScrollReveal();

  return (
    <div ref={scrollRef}>
      {/* Hero Section */}
      <section
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #FFFBF2 0%, #FDF8F0 40%, #FEF3C7 100%)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Decorative elements */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.4 }}>
          <div
            className="absolute top-20 left-10 w-64 h-64 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(217,119,6,0.08), transparent 70%)' }}
          />
          <div
            className="absolute bottom-10 right-20 w-80 h-80 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06), transparent 70%)' }}
          />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          {/* Small badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 animate-fade-slide-up"
            style={{
              background: 'rgba(217, 119, 6, 0.08)',
              border: '1px solid rgba(217, 119, 6, 0.15)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="text-xs font-medium" style={{ color: 'var(--brown-warm)' }}>
              Powered by AI Agents
            </span>
          </div>

          {/* Heading */}
          <h1
            className="text-5xl md:text-6xl mb-6 animate-fade-slide-up stagger-1"
            style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 700,
              color: 'var(--brown-deep)',
              lineHeight: 1.15,
            }}
          >
            Your Banking
            <br />
            <span
              style={{
                background: 'linear-gradient(135deg, #D97706, #B45309)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Document Library
            </span>
          </h1>

          <p
            className="text-lg max-w-2xl mx-auto mb-10 animate-fade-slide-up stagger-2"
            style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}
          >
            Intelligent semantic search across all your banking documents.
            Find policies, procedures, compliance guidelines, and regulations
            in seconds with AI-powered indexing and retrieval.
          </p>

          {/* Search bar preview */}
          <Link
            to="/console"
            className="block max-w-2xl mx-auto animate-fade-slide-up stagger-3 no-underline"
          >
            <div
              className="flex items-center gap-3 px-6 py-4 rounded-2xl cursor-pointer transition-all duration-300"
              style={{
                background: 'var(--bg-card)',
                border: '2px solid var(--border)',
                boxShadow: 'var(--shadow-elevated)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--amber)';
                e.currentTarget.style.boxShadow = '0 0 0 4px rgba(217, 119, 6, 0.1), var(--shadow-elevated)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'var(--shadow-elevated)';
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--warm-gray-light)" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span className="text-base" style={{ color: 'var(--text-muted)' }}>
                Search for banking documents, policies, regulations...
              </span>
              <span
                className="ml-auto px-3 py-1 rounded-lg text-xs font-medium"
                style={{
                  background: 'linear-gradient(135deg, #D97706, #B45309)',
                  color: '#FFF',
                }}
              >
                Search
              </span>
            </div>
          </Link>

          {/* Stats */}
          <div className="flex items-center justify-center gap-12 mt-12">
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className="text-center animate-fade-slide-up"
                style={{ animationDelay: `${0.4 + i * 0.1}s` }}
              >
                <div
                  className="text-2xl font-bold mb-1"
                  style={{
                    fontFamily: 'var(--font-serif)',
                    color: 'var(--brown-deep)',
                  }}
                >
                  {stat.value}
                </div>
                <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Document Categories */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12 reveal" style={{ opacity: 0 }}>
          <h2
            className="text-3xl mb-3"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: 'var(--brown-deep)' }}
          >
            Browse by Category
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Explore documents across all major banking categories
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {config.input_schema.type_options.map((option, i) => {
            const cat = categoryIcons[option.value] || categoryIcons.full;
            return (
              <Link
                key={option.value}
                to="/console"
                className="category-card reveal no-underline"
                style={{ opacity: 0, animationDelay: `${i * 0.08}s` }}
              >
                <div
                  className="absolute top-0 left-0 w-1 h-full rounded-l-xl"
                  style={{ background: cat.color }}
                />
                <div className="flex items-center gap-3 pl-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${cat.color}12` }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={cat.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={cat.icon} />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--brown-deep)' }}>
                      {option.label}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Browse documents
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* How It Works */}
      <section style={{ background: 'var(--parchment)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="text-center mb-14 reveal" style={{ opacity: 0 }}>
            <h2
              className="text-3xl mb-3"
              style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: 'var(--brown-deep)' }}
            >
              How It Works
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Three simple steps to find any document
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line */}
            <div
              className="hidden md:block absolute top-12 left-[17%] right-[17%] h-px"
              style={{ background: 'linear-gradient(90deg, var(--border), var(--amber), var(--border))' }}
            />

            {[
              {
                step: '1',
                title: 'Enter Query',
                desc: 'Type your search query in natural language. Describe what you are looking for.',
                icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
              },
              {
                step: '2',
                title: 'AI Agents Search',
                desc: 'Our Document Indexer and Search Agent work together to find and rank results.',
                icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
              },
              {
                step: '3',
                title: 'Get Results',
                desc: 'Receive ranked, relevant documents with summaries and relevance scores.',
                icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
              },
            ].map((item, i) => (
              <div key={i} className="text-center reveal relative" style={{ opacity: 0, animationDelay: `${i * 0.15}s` }}>
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 relative z-10"
                  style={{
                    background: 'linear-gradient(135deg, #D97706, #B45309)',
                    boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)',
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFBF2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                </div>
                <div
                  className="text-xs font-bold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--amber)' }}
                >
                  Step {item.step}
                </div>
                <h3
                  className="text-lg mb-2"
                  style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: 'var(--brown-deep)' }}
                >
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent Cards */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-12 reveal" style={{ opacity: 0 }}>
          <h2
            className="text-3xl mb-3"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: 'var(--brown-deep)' }}
          >
            Meet the Agents
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Specialized AI agents working behind the scenes
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {config.agents.map((agent, i) => {
            const isIndexer = agent.id === 'document_indexer';
            return (
              <div
                key={agent.id}
                className={`${isIndexer ? 'agent-card-indexer' : 'agent-card-search'} reveal`}
                style={{ opacity: 0, animationDelay: `${i * 0.12}s` }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                    style={{
                      background: isIndexer
                        ? 'linear-gradient(135deg, rgba(217,119,6,0.15), rgba(245,158,11,0.1))'
                        : 'linear-gradient(135deg, rgba(120,53,15,0.15), rgba(68,32,13,0.1))',
                    }}
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={isIndexer ? 'var(--amber)' : 'var(--brown-dark)'}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {isIndexer ? (
                        <>
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </>
                      ) : (
                        <>
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </>
                      )}
                    </svg>
                  </div>
                  <div>
                    <h3
                      className="text-base font-semibold mb-1"
                      style={{ color: 'var(--brown-deep)' }}
                    >
                      {agent.name}
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {agent.description}
                    </p>
                    <div
                      className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs font-medium"
                      style={{
                        background: isIndexer ? 'rgba(217,119,6,0.08)' : 'rgba(120,53,15,0.08)',
                        color: isIndexer ? 'var(--amber)' : 'var(--brown-dark)',
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
                      Ready
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Architecture */}
      <section style={{ background: 'var(--parchment)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="text-center mb-10 reveal" style={{ opacity: 0 }}>
            <h2
              className="text-3xl mb-3"
              style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: 'var(--brown-deep)' }}
            >
              Architecture
            </h2>
          </div>
          <div
            className="reveal rounded-2xl p-8"
            style={{
              opacity: 0,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-elevated)',
            }}
          >
            <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
              <defs>
                <marker id="arrow-a" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#D97706" />
                </marker>
                <filter id="amber-glow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feFlood floodColor="#D97706" floodOpacity="0.3" />
                  <feComposite in2="blur" operator="in" />
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* ===== ROW 1: User -> CloudFront -> S3 ===== */}
              {/* User Browser */}
              <rect x="30" y="20" width="120" height="70" rx="12" fill="rgba(217,119,6,0.04)" stroke="#D97706" strokeWidth="1" />
              <text x="90" y="48" textAnchor="middle" fill="var(--brown-deep)" fontSize="12" fontWeight="bold">User</text>
              <text x="90" y="66" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="220" y2="55" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrow-a)" />

              {/* CloudFront */}
              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="232" y="22" width="36" height="36" />
              <text x="250" y="72" textAnchor="middle" fill="var(--brown-deep)" fontSize="11" fontWeight="bold">CloudFront</text>
              <text x="250" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">CDN + SPA Rewrite</text>

              <line x1="280" y1="45" x2="370" y2="45" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrow-a)" strokeDasharray="4,3" />
              <text x="325" y="38" textAnchor="middle" fill="var(--text-muted)" fontSize="8">static</text>

              {/* S3 */}
              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="382" y="22" width="36" height="36" />
              <text x="400" y="72" textAnchor="middle" fill="var(--brown-deep)" fontSize="11" fontWeight="bold">S3</text>
              <text x="400" y="84" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">UI Assets (OAC)</text>

              {/* ===== ROW 2: API GW -> Lambda Proxy -> Lambda Worker <-> DynamoDB ===== */}
              <line x1="250" y1="90" x2="250" y2="140" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrow-a)" />
              <text x="262" y="120" textAnchor="start" fill="var(--text-muted)" fontSize="8">/api/*</text>

              {/* API Gateway */}
              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="82" y="148" width="36" height="36" />
              <text x="100" y="198" textAnchor="middle" fill="var(--brown-deep)" fontSize="11" fontWeight="bold">API Gateway</text>
              <text x="100" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">HTTP API</text>

              <line x1="130" y1="166" x2="250" y2="166" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrow-a)" />

              {/* Lambda Proxy */}
              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="262" y="148" width="36" height="36" />
              <text x="280" y="198" textAnchor="middle" fill="var(--brown-deep)" fontSize="11" fontWeight="bold">Lambda Proxy</text>
              <text x="280" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">POST /invoke, GET /status</text>
              <text x="280" y="221" textAnchor="middle" fill="var(--text-muted)" fontSize="8">30s timeout</text>

              <line x1="310" y1="166" x2="430" y2="166" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrow-a)" />
              <text x="370" y="158" textAnchor="middle" fill="#D97706" fontSize="8" fontWeight="bold">async</text>

              {/* Lambda Worker */}
              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="442" y="148" width="36" height="36" />
              <text x="460" y="198" textAnchor="middle" fill="var(--brown-deep)" fontSize="11" fontWeight="bold">Lambda Worker</text>
              <text x="460" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">300s timeout</text>

              {/* DynamoDB */}
              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="622" y="148" width="36" height="36" />
              <text x="640" y="198" textAnchor="middle" fill="var(--brown-deep)" fontSize="11" fontWeight="bold">DynamoDB</text>
              <text x="640" y="210" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Session State + TTL</text>

              <line x1="490" y1="166" x2="610" y2="166" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrow-a)" />
              <line x1="610" y1="174" x2="490" y2="174" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrow-a)" strokeDasharray="4,3" />

              {/* ===== ROW 3: AgentCore -> Agents -> Bedrock, ECR -> AgentCore ===== */}
              <line x1="460" y1="222" x2="460" y2="280" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrow-a)" />

              {/* AgentCore Runtime */}
              <rect x="250" y="288" width="280" height="60" rx="12" fill="rgba(217,119,6,0.06)" stroke="#D97706" strokeWidth="2" filter="url(#amber-glow)" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="260" y="300" width="36" height="36" />
              <text x="400" y="314" textAnchor="middle" fill="#D97706" fontSize="12" fontWeight="bold">AgentCore Runtime</text>
              <text x="400" y="332" textAnchor="middle" fill="var(--text-secondary)" fontSize="9">Bedrock Managed Container</text>

              {/* ECR */}
              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="132" y="300" width="36" height="36" />
              <text x="150" y="350" textAnchor="middle" fill="var(--brown-deep)" fontSize="10" fontWeight="bold">ECR</text>
              <text x="150" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Container Image</text>

              <line x1="178" y1="318" x2="248" y2="318" stroke="#D97706" strokeWidth="1.5" markerEnd="url(#arrow-a)" strokeDasharray="4,3" />

              {/* Agent lines from AgentCore */}
              <line x1="350" y1="348" x2="350" y2="400" stroke="#D97706" strokeWidth="1.5" strokeDasharray="4,3" />
              <line x1="430" y1="348" x2="530" y2="400" stroke="#78350F" strokeWidth="1.5" strokeDasharray="4,3" />

              {/* Agent: Document Indexer */}
              <rect x="270" y="405" width="160" height="32" rx="8" fill="rgba(217,119,6,0.04)" stroke="#D97706" strokeWidth="1" />
              <text x="350" y="425" textAnchor="middle" fill="#D97706" fontSize="10" fontWeight="bold">Document Indexer</text>

              {/* Agent: Search Agent */}
              <rect x="460" y="405" width="150" height="32" rx="8" fill="rgba(120,53,15,0.04)" stroke="#78350F" strokeWidth="1" />
              <text x="535" y="425" textAnchor="middle" fill="#78350F" fontSize="10" fontWeight="bold">Search Agent</text>

              {/* Bedrock */}
              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="782" y="300" width="36" height="36" />
              <text x="800" y="350" textAnchor="middle" fill="var(--brown-deep)" fontSize="10" fontWeight="bold">Bedrock</text>
              <text x="800" y="362" textAnchor="middle" fill="var(--text-secondary)" fontSize="8">Claude Sonnet</text>
              <text x="800" y="373" textAnchor="middle" fill="var(--text-muted)" fontSize="7">LLM Inference</text>

              <line x1="530" y1="318" x2="778" y2="318" stroke="#D97706" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-a)" />
              <text x="654" y="310" textAnchor="middle" fill="var(--text-muted)" fontSize="8">LLM inference</text>

              {/* Monitoring: CloudWatch + X-Ray */}
              <image href="/aws-icons/Arch_Amazon-CloudWatch_48.svg" x="822" y="148" width="36" height="36" />
              <text x="840" y="198" textAnchor="middle" fill="var(--brown-deep)" fontSize="9" fontWeight="bold">CloudWatch</text>

              <image href="/aws-icons/Arch_AWS-X-Ray_48.svg" x="892" y="148" width="36" height="36" />
              <text x="910" y="198" textAnchor="middle" fill="var(--brown-deep)" fontSize="9" fontWeight="bold">X-Ray</text>

              <text x="875" y="215" textAnchor="middle" fill="var(--text-muted)" fontSize="7">Observability</text>
            </svg>
          </div>
        </div>
      </section>

      {/* Sample Searches */}
      <section
        style={{
          background: 'var(--parchment)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="text-center mb-10 reveal" style={{ opacity: 0 }}>
            <h2
              className="text-3xl mb-3"
              style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: 'var(--brown-deep)' }}
            >
              Popular Searches
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Try one of these common queries to get started
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {sampleSearches.map((query, i) => (
              <Link
                key={query}
                to="/console"
                className="reveal no-underline"
                style={{ opacity: 0, animationDelay: `${i * 0.06}s` }}
              >
                <div
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm transition-all duration-200 cursor-pointer"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    boxShadow: 'var(--shadow-soft)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--amber)';
                    e.currentTarget.style.color = 'var(--brown-dark)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  {query}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 text-center" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span className="text-sm font-semibold" style={{ color: 'var(--brown-deep)' }}>
              AVA Document Search
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Agentic Value Accelerator &middot; {config.domain} &middot; {config.description}
          </p>
        </div>
      </footer>
    </div>
  );
}
