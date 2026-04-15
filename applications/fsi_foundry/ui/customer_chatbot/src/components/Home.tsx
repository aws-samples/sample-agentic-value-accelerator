import { useNavigate, Link } from 'react-router-dom';
import { useRef, useCallback, useEffect, useState } from 'react';
import type { RuntimeConfig } from '../config';

/* ---- Scroll-triggered animation hook ---- */

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

/* ---- Floating Chat Bubble (hero) ---- */

function FloatingBubble({ text, delay, left, size }: { text: string; delay: number; left: string; size: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: '0.7rem', md: '0.8rem', lg: '0.9rem' };
  const padMap = { sm: '0.5rem 0.75rem', md: '0.625rem 1rem', lg: '0.75rem 1.125rem' };

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left,
        bottom: '-10px',
        animation: `floatUp 8s ${delay}s ease-in-out infinite`,
        opacity: 0,
      }}
    >
      <div
        style={{
          padding: padMap[size],
          borderRadius: '1rem',
          borderBottomLeftRadius: '0.25rem',
          background: 'linear-gradient(135deg, rgba(101,163,13,0.1), rgba(132,204,22,0.07))',
          border: '1px solid rgba(101,163,13,0.15)',
          fontSize: sizeMap[size],
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          backdropFilter: 'blur(8px)',
        }}
      >
        {text}
      </div>
    </div>
  );
}

/* ---- Morphing Blob ---- */

function MorphBlob({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`blob ${className || ''}`}
      style={style}
    />
  );
}

/* ---- Animated Stat ---- */

function AnimatedStat({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  const { ref, visible } = useScrollReveal();

  return (
    <div ref={ref} className="card text-center">
      <div
        className="transition-all duration-700"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(16px)',
        }}
      >
        <div className="flex justify-center mb-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(101,163,13,0.08), rgba(132,204,22,0.05))',
              border: '1px solid rgba(101,163,13,0.12)',
            }}
          >
            {icon}
          </div>
        </div>
        <div className="text-2xl font-bold mb-1" style={{ color: 'var(--sage)' }}>{value}</div>
        <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

/* ---- Intent Type Icons ---- */

const intentIcons: Record<string, { icon: string; color: string }> = {
  full: { icon: '\uD83D\uDD04', color: 'var(--sage)' },
  general: { icon: '\uD83D\uDCAC', color: 'var(--warm-gray)' },
  account_inquiry: { icon: '\uD83C\uDFE6', color: '#3B82F6' },
  transfer: { icon: '\uD83D\uDCB8', color: 'var(--sage)' },
  bill_payment: { icon: '\uD83D\uDCCB', color: 'var(--coral)' },
  transaction_history: { icon: '\uD83D\uDCCA', color: '#8B5CF6' },
};

const intentDescriptions: Record<string, string> = {
  full: 'Complete end-to-end conversation with all agents',
  general: 'Ask general questions about banking services',
  account_inquiry: 'Check balances, statements, and account details',
  transfer: 'Send money to another account instantly',
  bill_payment: 'Pay utility bills, credit cards, and more',
  transaction_history: 'View recent transactions and activity',
};

/* ============================================
   MAIN COMPONENT
   ============================================ */

export default function Home({ config }: { config: RuntimeConfig }) {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);

  /* Scroll-reveal refs for each section */
  const statsReveal = useScrollReveal();
  const intentsReveal = useScrollReveal();
  const howItWorksReveal = useScrollReveal();
  const archReveal = useScrollReveal();
  const agentsReveal = useScrollReveal();
  const ctaReveal = useScrollReveal();

  /* Message cascade for "How It Works" */
  const [showMessages, setShowMessages] = useState([false, false, false, false, false]);

  const startCascade = useCallback(() => {
    const delays = [0, 800, 1600, 2400, 3200];
    delays.forEach((delay, i) => {
      setTimeout(() => {
        setShowMessages((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, delay);
    });
  }, []);

  useEffect(() => {
    if (howItWorksReveal.visible) startCascade();
  }, [howItWorksReveal.visible, startCascade]);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative overflow-hidden" style={{ background: 'var(--bg-primary)' }}>

      {/* ===== Floating Background Shapes ===== */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="floating-shape floating-shape--circle" style={{ width: '200px', height: '200px', top: '15%', right: '10%', animationDelay: '0s' }} />
        <div className="floating-shape floating-shape--square" style={{ width: '120px', height: '120px', top: '60%', left: '5%', animationDelay: '4s' }} />
        <div className="floating-shape floating-shape--circle" style={{ width: '80px', height: '80px', top: '80%', right: '25%', animationDelay: '8s' }} />
        <div className="floating-shape floating-shape--square" style={{ width: '60px', height: '60px', top: '30%', left: '15%', animationDelay: '12s' }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-16">

        {/* ===== HERO ===== */}
        <div ref={heroRef} className="text-center mb-24 relative" style={{ minHeight: '420px' }}>

          {/* Morphing blobs */}
          <MorphBlob
            className="blob--sage"
            style={{ width: '350px', height: '350px', top: '-60px', left: '10%', animationDuration: '14s' }}
          />
          <MorphBlob
            className="blob--cream"
            style={{ width: '280px', height: '280px', top: '20px', right: '8%', animationDuration: '18s', animationDelay: '3s' }}
          />
          <MorphBlob
            className="blob--coral"
            style={{ width: '200px', height: '200px', bottom: '20px', left: '30%', animationDuration: '16s', animationDelay: '6s' }}
          />

          {/* Floating chat bubbles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ height: '400px' }}>
            <FloatingBubble text="What's my balance?" delay={0} left="8%" size="md" />
            <FloatingBubble text="Transfer $500" delay={2} left="75%" size="lg" />
            <FloatingBubble text="Pay my electric bill" delay={4} left="20%" size="sm" />
            <FloatingBubble text="Show recent transactions" delay={1.5} left="60%" size="md" />
            <FloatingBubble text="Update my address" delay={3.5} left="40%" size="sm" />
            <FloatingBubble text="How do I open a savings account?" delay={5} left="85%" size="sm" />
          </div>

          {/* Hero content */}
          <div className="relative z-10 pt-12">
            {/* Available badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
              style={{
                background: 'rgba(101, 163, 13, 0.06)',
                border: '1px solid rgba(101, 163, 13, 0.15)',
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: 'var(--sage)',
                  boxShadow: '0 0 6px rgba(101, 163, 13, 0.5)',
                  animation: 'gentleBounce 2s ease-in-out infinite',
                }}
              />
              <span className="text-xs font-semibold" style={{ color: 'var(--sage)' }}>Available 24/7</span>
            </div>

            <h1 className="text-6xl font-bold mb-5 leading-tight tracking-tight">
              <span style={{ color: 'var(--charcoal)' }}>Your Personal</span>
              <br />
              <span style={{ color: 'var(--sage)' }}>Banking Assistant</span>
            </h1>

            <p className="text-lg max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {config.description}. Powered by{' '}
              <span className="font-semibold" style={{ color: 'var(--sage)' }}>{config.agents.length} specialist agents</span>{' '}
              working together to help you with anything banking-related.
            </p>

            <div className="flex justify-center gap-4 mb-8">
              <button onClick={() => navigate('/console')} className="btn-primary text-base px-10 py-4 font-bold">
                Start Chatting
              </button>
              <button
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                className="btn-secondary text-base px-10 py-4"
              >
                See How It Works
              </button>
            </div>

            {/* Typing indicator */}
            <div className="flex justify-center">
              <div className="typing-indicator">
                <div className="dot" />
                <div className="dot" />
                <div className="dot" />
              </div>
            </div>
          </div>
        </div>

        {/* ===== STATS ===== */}
        <div ref={statsReveal.ref} className="max-w-4xl mx-auto mb-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <AnimatedStat
              value="3"
              label="Specialist Agents"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="var(--sage)" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              }
            />
            <AnimatedStat
              value="6"
              label="Intent Types"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="var(--sage)" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              }
            />
            <AnimatedStat
              value="24/7"
              label="Available"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="var(--sage)" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>
        </div>

        {/* ===== Wave Separator ===== */}
        <div className="wave-separator mb-16">
          <svg viewBox="0 0 900 40" preserveAspectRatio="none">
            <path d="M0,20 Q150,5 300,20 Q450,35 600,20 Q750,5 900,20" fill="none" stroke="#E7E5E4" strokeWidth="1.5" />
          </svg>
        </div>

        {/* ===== INTENT TYPES ===== */}
        <div ref={intentsReveal.ref} className="max-w-5xl mx-auto mb-24 relative">
          {/* Background floating shapes */}
          <div className="floating-shape floating-shape--circle" style={{ width: '140px', height: '140px', top: '-30px', right: '-20px', animationDelay: '2s' }} />
          <div className="floating-shape floating-shape--square" style={{ width: '90px', height: '90px', bottom: '-20px', left: '-15px', animationDelay: '7s' }} />

          <div className="text-center mb-10 relative z-10">
            <h2 className="text-sm font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--sage)' }}>
              What Can I Help With?
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Choose your topic and start chatting right away
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 relative z-10">
            {config.input_schema.type_options.map((opt, i) => {
              const info = intentIcons[opt.value] || { icon: '\uD83D\uDCCB', color: 'var(--warm-gray)' };
              const desc = intentDescriptions[opt.value] || '';
              return (
                <div
                  key={opt.value}
                  className="animate-fan-out"
                  style={{
                    animationDelay: `${intentsReveal.visible ? 0.1 + i * 0.08 : 0}s`,
                    opacity: intentsReveal.visible ? undefined : 0,
                  }}
                >
                  <div
                    className="card group cursor-pointer"
                    style={{ transition: 'all 0.3s ease' }}
                    onClick={() => navigate('/console')}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
                      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 30px rgba(28,25,23,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                      (e.currentTarget as HTMLDivElement).style.boxShadow = '';
                    }}
                  >
                    <div className="text-2xl mb-3">{info.icon}</div>
                    <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{opt.label}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== HOW IT WORKS (Chat Conversation) ===== */}
        <div id="how-it-works" ref={howItWorksReveal.ref} className="max-w-3xl mx-auto mb-24">
          <div className="text-center mb-10">
            <h2 className="text-sm font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--sage)' }}>
              How It Works
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              A natural conversation between you and our AI agents
            </p>
          </div>

          <div className="card" style={{ padding: '2rem' }}>
            {/* Chat thread */}
            <div className="flex flex-col gap-4">
              {/* Step 1: User message */}
              <div
                className="flex justify-end"
                style={{
                  opacity: showMessages[0] ? 1 : 0,
                  transform: showMessages[0] ? 'translateX(0)' : 'translateX(20px)',
                  transition: 'all 0.5s ease-out',
                }}
              >
                <div className="chat-bubble chat-bubble--user" style={{ maxWidth: '70%' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>You</p>
                  <p className="text-sm">I need help with my account balance and want to transfer $500 to my savings.</p>
                </div>
              </div>

              {/* Step 2: Conversation Manager routes */}
              <div
                className="flex justify-start"
                style={{
                  opacity: showMessages[1] ? 1 : 0,
                  transform: showMessages[1] ? 'translateX(0)' : 'translateX(-20px)',
                  transition: 'all 0.5s ease-out',
                }}
              >
                <div className="chat-bubble chat-bubble--bot" style={{ maxWidth: '80%' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(101,163,13,0.15)' }}>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="var(--sage)" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold" style={{ color: 'var(--sage)' }}>Conversation Manager</span>
                  </div>
                  <p className="text-sm">I'll route your request to our specialists. One moment...</p>
                </div>
              </div>

              {/* Step 3: Account Agent responds */}
              <div
                className="flex justify-start"
                style={{
                  opacity: showMessages[2] ? 1 : 0,
                  transform: showMessages[2] ? 'translateX(0)' : 'translateX(-20px)',
                  transition: 'all 0.5s ease-out',
                }}
              >
                <div className="chat-bubble chat-bubble--bot" style={{ maxWidth: '80%' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(249,115,22,0.12)' }}>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="var(--coral)" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>Account Agent</span>
                  </div>
                  <p className="text-sm">Your checking account balance is $3,240.50. Ready to process the transfer.</p>
                </div>
              </div>

              {/* Step 4: Transaction Agent responds */}
              <div
                className="flex justify-start"
                style={{
                  opacity: showMessages[3] ? 1 : 0,
                  transform: showMessages[3] ? 'translateX(0)' : 'translateX(-20px)',
                  transition: 'all 0.5s ease-out',
                }}
              >
                <div className="chat-bubble chat-bubble--bot" style={{ maxWidth: '80%' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(120,113,108,0.12)' }}>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="var(--warm-gray)" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold" style={{ color: 'var(--warm-gray)' }}>Transaction Agent</span>
                  </div>
                  <p className="text-sm">Transfer of $500.00 to Savings initiated. Confirmation #TXN-48291.</p>
                </div>
              </div>

              {/* Step 5: Resolution */}
              <div
                className="flex justify-start"
                style={{
                  opacity: showMessages[4] ? 1 : 0,
                  transform: showMessages[4] ? 'translateX(0)' : 'translateX(-20px)',
                  transition: 'all 0.5s ease-out',
                }}
              >
                <div className="chat-bubble chat-bubble--bot-filled" style={{ maxWidth: '85%' }}>
                  <p className="text-sm font-medium mb-2">All done! Here is your summary:</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs" style={{ background: 'rgba(255,255,255,0.2)' }}>
                      &#10003; Balance checked
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs" style={{ background: 'rgba(255,255,255,0.2)' }}>
                      &#10003; $500 transferred
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== Wave Separator ===== */}
        <div className="wave-separator mb-16">
          <svg viewBox="0 0 900 40" preserveAspectRatio="none">
            <path d="M0,20 Q225,35 450,20 Q675,5 900,20" fill="none" stroke="#E7E5E4" strokeWidth="1.5" />
          </svg>
        </div>

        {/* ===== ARCHITECTURE DIAGRAM ===== */}
        <div ref={archReveal.ref} className="max-w-5xl mx-auto mb-24">
          <div className="text-center mb-10">
            <h2 className="text-sm font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--sage)' }}>
              Architecture
            </h2>
          </div>
          <div
            className="card p-8"
            style={{
              opacity: archReveal.visible ? 1 : 0,
              transform: archReveal.visible ? 'translateY(0)' : 'translateY(20px)',
              transition: 'all 0.7s ease-out',
            }}
          >
            <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
              <defs>
                <pattern id="archGridB06" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="0.5" fill="rgba(101,163,13,0.15)" />
                </pattern>
                <marker id="arrow-sage" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#65A30D" />
                </marker>
                <marker id="arrow-gray" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#78716C" />
                </marker>
                <marker id="arrow-steel" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#94A3B8" />
                </marker>
              </defs>
              <rect width="960" height="520" fill="url(#archGridB06)" />

              {/* ── Row 1: User → CloudFront → S3 ── */}
              <rect x="30" y="20" width="120" height="70" rx="10" fill="var(--bg-card)" stroke="var(--sage)" strokeWidth="1.5" />
              <text x="90" y="48" textAnchor="middle" fill="var(--charcoal)" fontSize="12" fontWeight="700">User</text>
              <text x="90" y="65" textAnchor="middle" fill="var(--text-muted)" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="210" y2="55" stroke="#65A30D" strokeWidth="1.5" markerEnd="url(#arrow-sage)" />

              <rect x="215" y="15" width="170" height="80" rx="10" fill="var(--bg-card)" stroke="#65A30D" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="282" y="18" width="36" height="36" />
              <text x="300" y="68" textAnchor="middle" fill="var(--charcoal)" fontSize="11" fontWeight="700">CloudFront</text>
              <text x="300" y="82" textAnchor="middle" fill="var(--text-muted)" fontSize="9">CDN + SPA Rewrite</text>

              <line x1="385" y1="40" x2="460" y2="40" stroke="#65A30D" strokeWidth="1.5" markerEnd="url(#arrow-sage)" />
              <text x="423" y="34" textAnchor="middle" fill="var(--text-muted)" fontSize="8">OAC</text>

              <rect x="465" y="15" width="150" height="80" rx="10" fill="var(--bg-card)" stroke="var(--sand)" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="522" y="18" width="36" height="36" />
              <text x="540" y="68" textAnchor="middle" fill="var(--charcoal)" fontSize="11" fontWeight="700">S3</text>
              <text x="540" y="82" textAnchor="middle" fill="var(--text-muted)" fontSize="9">Static UI Assets</text>

              {/* ── Row 2: API Gateway → Lambda Proxy → Lambda Worker ↔ DynamoDB ── */}
              <line x1="300" y1="95" x2="300" y2="145" stroke="#65A30D" strokeWidth="1.5" markerEnd="url(#arrow-sage)" />
              <text x="310" y="125" fill="var(--sage)" fontSize="8" fontFamily="monospace">/api/*</text>

              <rect x="215" y="150" width="170" height="80" rx="10" fill="var(--bg-card)" stroke="#65A30D" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="282" y="153" width="36" height="36" />
              <text x="300" y="203" textAnchor="middle" fill="var(--charcoal)" fontSize="11" fontWeight="700">API Gateway</text>
              <text x="300" y="218" textAnchor="middle" fill="var(--sage)" fontSize="9">HTTP API</text>

              <line x1="385" y1="190" x2="460" y2="190" stroke="#65A30D" strokeWidth="1.5" markerEnd="url(#arrow-sage)" />

              <rect x="465" y="150" width="180" height="80" rx="10" fill="var(--bg-card)" stroke="#65A30D" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="537" y="153" width="36" height="36" />
              <text x="555" y="203" textAnchor="middle" fill="var(--charcoal)" fontSize="11" fontWeight="700">Lambda Proxy</text>
              <text x="555" y="216" textAnchor="middle" fill="var(--sage)" fontSize="8" fontFamily="monospace">POST /invoke | GET /status</text>
              <text x="555" y="226" textAnchor="middle" fill="var(--text-muted)" fontSize="8">30s timeout</text>

              <line x1="555" y1="230" x2="555" y2="280" stroke="#65A30D" strokeWidth="1.5" markerEnd="url(#arrow-sage)" />
              <text x="565" y="260" fill="var(--sage)" fontSize="8" fontWeight="600">async</text>

              <rect x="465" y="285" width="180" height="80" rx="10" fill="var(--bg-card)" stroke="#65A30D" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="537" y="288" width="36" height="36" />
              <text x="555" y="340" textAnchor="middle" fill="var(--charcoal)" fontSize="11" fontWeight="700">Lambda Worker</text>
              <text x="555" y="355" textAnchor="middle" fill="var(--text-muted)" fontSize="9">300s timeout</text>

              {/* DynamoDB */}
              <rect x="715" y="150" width="170" height="80" rx="10" fill="var(--bg-card)" stroke="var(--sand)" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="782" y="153" width="36" height="36" />
              <text x="800" y="203" textAnchor="middle" fill="var(--charcoal)" fontSize="11" fontWeight="700">DynamoDB</text>
              <text x="800" y="218" textAnchor="middle" fill="var(--text-muted)" fontSize="9">Session State + TTL</text>

              <line x1="645" y1="190" x2="715" y2="190" stroke="#94A3B8" strokeWidth="1.5" markerEnd="url(#arrow-steel)" />
              <line x1="715" y1="200" x2="645" y2="200" stroke="#94A3B8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow-steel)" />

              {/* ── Row 3: AgentCore → Agents → Bedrock, ECR ── */}
              <line x1="555" y1="365" x2="555" y2="400" stroke="#65A30D" strokeWidth="1.5" markerEnd="url(#arrow-sage)" />

              <rect x="415" y="405" width="280" height="80" rx="10" fill="var(--bg-card)" stroke="#65A30D" strokeWidth="2" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="537" y="408" width="36" height="36" />
              <text x="555" y="460" textAnchor="middle" fill="var(--sage)" fontSize="11" fontWeight="700">AgentCore Runtime</text>
              <text x="555" y="475" textAnchor="middle" fill="var(--text-muted)" fontSize="9">Bedrock Managed Container</text>

              {/* Conversation Manager */}
              <rect x="30" y="415" width="170" height="50" rx="8" fill="rgba(101,163,13,0.06)" stroke="#65A30D" strokeWidth="1.5" />
              <text x="115" y="438" textAnchor="middle" fill="#65A30D" fontSize="10" fontWeight="600">Conversation Manager</text>
              <text x="115" y="455" textAnchor="middle" fill="var(--text-muted)" fontSize="8">Intent Routing</text>

              <line x1="415" y1="435" x2="200" y2="435" stroke="#65A30D" strokeWidth="1.5" markerEnd="url(#arrow-sage)" />

              {/* Account Agent */}
              <rect x="30" y="470" width="170" height="45" rx="8" fill="rgba(249,115,22,0.06)" stroke="#F97316" strokeWidth="1.5" />
              <text x="115" y="492" textAnchor="middle" fill="#F97316" fontSize="10" fontWeight="600">Account Agent</text>
              <text x="115" y="507" textAnchor="middle" fill="var(--text-muted)" fontSize="8">Balance + Profile</text>

              <line x1="415" y1="460" x2="200" y2="490" stroke="#F97316" strokeWidth="1.5" markerEnd="url(#arrow-sage)" />

              {/* Transaction Agent */}
              <rect x="215" y="470" width="170" height="45" rx="8" fill="rgba(120,113,108,0.06)" stroke="#78716C" strokeWidth="1.5" />
              <text x="300" y="492" textAnchor="middle" fill="#78716C" fontSize="10" fontWeight="600">Transaction Agent</text>
              <text x="300" y="507" textAnchor="middle" fill="var(--text-muted)" fontSize="8">Transfers + History</text>

              <line x1="415" y1="475" x2="385" y2="490" stroke="#78716C" strokeWidth="1.5" markerEnd="url(#arrow-gray)" />

              {/* Amazon Bedrock */}
              <rect x="760" y="405" width="170" height="80" rx="10" fill="var(--bg-card)" stroke="#78716C" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="827" y="408" width="36" height="36" />
              <text x="845" y="460" textAnchor="middle" fill="var(--charcoal)" fontSize="11" fontWeight="700">Amazon Bedrock</text>
              <text x="845" y="475" textAnchor="middle" fill="var(--text-muted)" fontSize="9">Claude Sonnet</text>

              <line x1="695" y1="445" x2="760" y2="445" stroke="#78716C" strokeWidth="1.5" markerEnd="url(#arrow-gray)" />

              {/* ECR */}
              <rect x="760" y="290" width="170" height="75" rx="10" fill="var(--bg-card)" stroke="var(--sand)" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="827" y="293" width="36" height="36" />
              <text x="845" y="345" textAnchor="middle" fill="var(--charcoal)" fontSize="11" fontWeight="700">ECR</text>
              <text x="845" y="358" textAnchor="middle" fill="var(--text-muted)" fontSize="8">Container Images</text>

              <line x1="845" y1="365" x2="845" y2="405" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-steel)" />
            </svg>
          </div>
        </div>

        {/* ===== AGENT CARDS ===== */}
        <div ref={agentsReveal.ref} className="max-w-5xl mx-auto mb-24">
          <div className="text-center mb-10">
            <h2 className="text-sm font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--sage)' }}>
              Meet Your Agents
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Three specialist agents working together for you
            </p>
          </div>

          <div className="relative">
            {/* Connecting line */}
            <div
              className="hidden md:block absolute top-1/2 left-0 right-0 h-px"
              style={{
                background: 'linear-gradient(90deg, transparent 5%, var(--sand) 20%, var(--sand) 80%, transparent 95%)',
                transform: 'translateY(-50%)',
                zIndex: 0,
              }}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
              {[
                {
                  agent: config.agents[0],
                  color: 'var(--sage)',
                  bgColor: 'rgba(101,163,13,0.06)',
                  borderColor: 'rgba(101,163,13,0.15)',
                  icon: (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                    </svg>
                  ),
                  capabilities: ['Multi-turn context tracking', 'Intent classification', 'Intelligent routing'],
                },
                {
                  agent: config.agents[1],
                  color: 'var(--coral)',
                  bgColor: 'rgba(249,115,22,0.06)',
                  borderColor: 'rgba(249,115,22,0.15)',
                  icon: (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                    </svg>
                  ),
                  capabilities: ['Balance inquiries', 'Statement generation', 'Profile management'],
                },
                {
                  agent: config.agents[2],
                  color: 'var(--warm-gray)',
                  bgColor: 'rgba(120,113,108,0.06)',
                  borderColor: 'rgba(120,113,108,0.15)',
                  icon: (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                    </svg>
                  ),
                  capabilities: ['Fund transfers', 'Bill payments', 'Transaction history'],
                },
              ].map(({ agent, color, bgColor, borderColor, icon, capabilities }, i) => (
                <div
                  key={agent.id}
                  className="card"
                  style={{
                    opacity: agentsReveal.visible ? 1 : 0,
                    transform: agentsReveal.visible ? 'translateY(0)' : 'translateY(20px)',
                    transition: `all 0.6s ease-out ${0.1 + i * 0.15}s`,
                  }}
                >
                  {/* Avatar */}
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                    style={{ background: bgColor, border: `1px solid ${borderColor}`, color }}
                  >
                    {icon}
                  </div>
                  <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{agent.name}</h3>
                  <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)' }}>{agent.description}</p>
                  {/* Capabilities */}
                  <div className="space-y-2.5">
                    {capabilities.map((cap, ci) => (
                      <div key={ci} className="flex items-start gap-2.5">
                        <div
                          className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                          style={{ background: color }}
                        />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{cap}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== CTA ===== */}
        <div ref={ctaReveal.ref} className="max-w-lg mx-auto mb-16">
          <Link
            to="/console"
            className="card group block text-center"
            style={{
              border: '1.5px dashed rgba(101,163,13,0.25)',
              opacity: ctaReveal.visible ? 1 : 0,
              transform: ctaReveal.visible ? 'translateY(0)' : 'translateY(16px)',
              transition: 'all 0.6s ease-out',
            }}
          >
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Try it now with a sample customer
            </p>
            <div className="flex justify-center gap-3">
              {config.input_schema.test_entities.map((id) => (
                <code
                  key={id}
                  className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold"
                  style={{
                    background: 'rgba(101,163,13,0.06)',
                    border: '1px solid rgba(101,163,13,0.15)',
                    color: 'var(--sage)',
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
