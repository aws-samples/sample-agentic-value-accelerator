import { useNavigate, Link } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import type { RuntimeConfig } from '../config';

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
        className="text-4xl font-extrabold mb-1 transition-all duration-1000"
        style={{
          color,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
        }}
      >
        {value}
      </div>
      <div className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

/* ---- Scroll Animated Section ---- */

function ScrollReveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
    }, { threshold: 0.15 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(30px)',
        transition: `all 0.7s cubic-bezier(0.23, 1, 0.32, 1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ---- Floating Support Icons (Hero background) ---- */

function FloatingIcons() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Headset */}
      <div className="absolute animate-float-icon" style={{ top: '10%', left: '8%', animationDelay: '0s' }}>
        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="var(--sky-300)" strokeWidth={0.8} style={{ opacity: 0.15 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      </div>
      {/* Envelope */}
      <div className="absolute animate-float-icon" style={{ top: '15%', right: '12%', animationDelay: '2s' }}>
        <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="var(--sky-300)" strokeWidth={0.8} style={{ opacity: 0.12 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      </div>
      {/* Chat bubble */}
      <div className="absolute animate-float-icon" style={{ top: '25%', left: '85%', animationDelay: '4s' }}>
        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="var(--sky-300)" strokeWidth={0.8} style={{ opacity: 0.1 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
        </svg>
      </div>
      {/* Another headset */}
      <div className="absolute animate-float-icon" style={{ top: '55%', left: '5%', animationDelay: '6s' }}>
        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="var(--sky-300)" strokeWidth={0.8} style={{ opacity: 0.08 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      </div>
      {/* Chat top-right */}
      <div className="absolute animate-float-icon" style={{ top: '50%', right: '5%', animationDelay: '3s' }}>
        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="var(--sky-300)" strokeWidth={0.8} style={{ opacity: 0.1 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
        </svg>
      </div>
      {/* Envelope bottom-left */}
      <div className="absolute animate-float-icon" style={{ top: '70%', left: '15%', animationDelay: '5s' }}>
        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="var(--sky-300)" strokeWidth={0.8} style={{ opacity: 0.08 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      </div>
    </div>
  );
}

/* ---- Agent Detail Data ---- */

const agentDetails: Record<string, { color: string; bgLight: string; features: string[] }> = {
  ticket_classifier: {
    color: '#0EA5E9',
    bgLight: '#F0F9FF',
    features: ['Multi-label ticket categorization', 'Urgency level assessment (4 tiers)', 'Required expertise identification'],
  },
  resolution_agent: {
    color: '#10B981',
    bgLight: '#ECFDF5',
    features: ['Historical case similarity search', 'Step-by-step resolution paths', 'Confidence scoring with KB references'],
  },
  escalation_agent: {
    color: '#F59E0B',
    bgLight: '#FFFBEB',
    features: ['Escalation necessity evaluation', 'Team routing recommendations', 'Priority override decisions'],
  },
};

const agentIcons: Record<string, React.ReactNode> = {
  ticket_classifier: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  ),
  resolution_agent: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  ),
  escalation_agent: (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" />
    </svg>
  ),
};

/* ---- Ticket Type Icons ---- */

const ticketTypeIcons: Record<string, React.ReactNode> = {
  full: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  ),
  general: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  ),
  billing: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  ),
  technical: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1-5.1m0 0L3.4 12.99a1.5 1.5 0 000 2.12l5.1 5.1a1.5 1.5 0 002.12 0l2.92-2.92m-7.04-7.04l2.92-2.92a1.5 1.5 0 012.12 0l5.1 5.1a1.5 1.5 0 010 2.12l-2.92 2.92m-7.04-7.04l7.04 7.04" />
    </svg>
  ),
  account: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
};

const ticketTypeColors: Record<string, string> = {
  full: '#0EA5E9',
  general: '#64748B',
  billing: '#F59E0B',
  technical: '#8B5CF6',
  account: '#10B981',
};

/* ============================================
   MAIN COMPONENT
   ============================================ */

export default function Home({ config }: { config: RuntimeConfig }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-4rem)] relative overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Subtle background gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 0%, rgba(14, 165, 233, 0.06) 0%, transparent 60%), radial-gradient(ellipse at 70% 0%, rgba(56, 189, 248, 0.04) 0%, transparent 50%)',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 py-20">

        {/* ===== HERO ===== */}
        <div className="text-center mb-28 animate-fade-slide-up relative">
          {/* Floating support icons in background */}
          <FloatingIcons />

          <div className="relative z-10">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold uppercase tracking-widest mb-8"
              style={{
                background: 'var(--sky-50)',
                color: 'var(--sky-600)',
                border: '1px solid rgba(14, 165, 233, 0.2)',
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--emerald-500)' }} />
              {config.domain} -- AI-Powered Support
            </div>

            <h1 className="text-6xl font-extrabold mb-6 leading-tight tracking-tight" style={{ color: 'var(--slate-900)' }}>
              Intelligent Ticket
              <br />
              <span style={{ color: 'var(--sky-500)' }}>Management</span>
            </h1>

            <p className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {config.description}. Powered by{' '}
              <span className="font-semibold" style={{ color: 'var(--sky-600)' }}>{config.agents.length} autonomous AI agents</span>{' '}
              that classify, resolve, and escalate tickets in real-time.
            </p>

            <div className="flex justify-center gap-4">
              <button onClick={() => navigate('/console')} className="btn-primary text-base px-10 py-4 font-bold">
                Submit a Ticket
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
              <AnimatedStat value="3" label="AI Agents" color="var(--sky-500)" />
              <AnimatedStat value="5" label="Ticket Types" color="var(--amber-500)" />
              <AnimatedStat value="Auto" label="Resolution" color="var(--emerald-500)" />
            </div>
          </div>
        </div>

        {/* ===== TICKET TYPE CARDS ===== */}
        <ScrollReveal className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] mb-2" style={{ color: 'var(--sky-500)' }}>
              Ticket Categories
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Supports multiple ticket types for comprehensive coverage
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {config.input_schema.type_options.map((opt, i) => {
              const color = ticketTypeColors[opt.value] || '#64748B';
              const icon = ticketTypeIcons[opt.value];
              return (
                <ScrollReveal key={opt.value} delay={0.05 + i * 0.08}>
                  <div
                    className="card text-center py-6 px-4 cursor-pointer group"
                    onClick={() => navigate('/console')}
                    style={{ borderTop: `3px solid ${color}` }}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3 transition-transform group-hover:scale-110"
                      style={{ background: `${color}12`, color }}
                    >
                      {icon}
                    </div>
                    <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{opt.label}</h3>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {opt.value === 'full' ? 'End-to-end analysis' :
                       opt.value === 'general' ? 'General inquiries' :
                       opt.value === 'billing' ? 'Billing & charges' :
                       opt.value === 'technical' ? 'Technical issues' :
                       'Account management'}
                    </p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </ScrollReveal>

        {/* ===== 3-STEP FLOW: Classify -> Resolve -> Escalate ===== */}
        <div id="how-it-works" className="max-w-4xl mx-auto mb-28">
          <ScrollReveal>
            <div className="text-center mb-10">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] mb-2" style={{ color: 'var(--sky-500)' }}>
                Resolution Pipeline
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                From ticket submission to resolution in three intelligent steps
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
            {[
              { num: '01', title: 'Classify', desc: 'Ticket Classifier categorizes by type and urgency, identifies required expertise areas.', color: 'var(--sky-500)', bg: 'var(--sky-50)' },
              null, // arrow
              { num: '02', title: 'Resolve', desc: 'Resolution Agent searches historical cases, builds step-by-step resolution with confidence scoring.', color: 'var(--emerald-500)', bg: 'rgba(16, 185, 129, 0.04)' },
              null, // arrow
              { num: '03', title: 'Escalate', desc: 'Escalation Agent evaluates if human intervention is needed, routes to appropriate teams.', color: 'var(--amber-500)', bg: 'rgba(245, 158, 11, 0.04)' },
            ].map((step, i) => {
              if (!step) {
                return (
                  <ScrollReveal key={`arrow-${i}`} delay={0.1 + i * 0.08} className="hidden md:flex justify-center">
                    <div className="flow-arrow">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </div>
                  </ScrollReveal>
                );
              }
              return (
                <ScrollReveal key={step.num} delay={0.1 + i * 0.08}>
                  <div
                    className="card-elevated text-center py-8 px-5"
                    style={{ background: step.bg, borderTop: `3px solid ${step.color}` }}
                  >
                    <div
                      className="text-3xl font-extrabold mb-3"
                      style={{ color: step.color, opacity: 0.25 }}
                    >
                      {step.num}
                    </div>
                    <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{step.desc}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>

        {/* ===== ARCHITECTURE SVG ===== */}
        <ScrollReveal className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] mb-2" style={{ color: 'var(--sky-500)' }}>
              Architecture
            </h2>
          </div>
          <div className="card p-8" style={{ background: 'var(--bg-card)' }}>
            <svg viewBox="0 0 960 520" className="w-full" style={{ maxHeight: '520px' }}>
              <defs>
                <pattern id="archGridB07" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="0.5" fill="rgba(14,165,233,0.12)" />
                </pattern>
                <marker id="arrow-sky" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#0EA5E9" />
                </marker>
                <marker id="arrow-slate" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="var(--slate-400)" />
                </marker>
                <marker id="arrow-emerald" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#10B981" />
                </marker>
                <marker id="arrow-amber" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,3 L0,6" fill="#F59E0B" />
                </marker>
              </defs>
              <rect width="960" height="520" fill="url(#archGridB07)" />

              {/* ── Row 1: User → CloudFront → S3 ── */}
              <rect x="30" y="20" width="120" height="70" rx="10" fill="var(--sky-50)" stroke="#0EA5E9" strokeWidth="1.5" />
              <text x="90" y="48" textAnchor="middle" fill="var(--slate-800)" fontSize="12" fontWeight="700">User</text>
              <text x="90" y="65" textAnchor="middle" fill="var(--slate-500)" fontSize="9">Browser</text>

              <line x1="150" y1="55" x2="210" y2="55" stroke="#0EA5E9" strokeWidth="1.5" markerEnd="url(#arrow-sky)" />

              <rect x="215" y="15" width="170" height="80" rx="10" fill="var(--sky-50)" stroke="#0EA5E9" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="282" y="18" width="36" height="36" />
              <text x="300" y="68" textAnchor="middle" fill="var(--slate-800)" fontSize="11" fontWeight="700">CloudFront</text>
              <text x="300" y="82" textAnchor="middle" fill="var(--slate-500)" fontSize="9">CDN + SPA Rewrite</text>

              <line x1="385" y1="40" x2="460" y2="40" stroke="#0EA5E9" strokeWidth="1.5" markerEnd="url(#arrow-sky)" />
              <text x="423" y="34" textAnchor="middle" fill="var(--slate-400)" fontSize="8">OAC</text>

              <rect x="465" y="15" width="150" height="80" rx="10" fill="var(--sky-50)" stroke="var(--slate-300)" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="522" y="18" width="36" height="36" />
              <text x="540" y="68" textAnchor="middle" fill="var(--slate-800)" fontSize="11" fontWeight="700">S3</text>
              <text x="540" y="82" textAnchor="middle" fill="var(--slate-500)" fontSize="9">Static UI Assets</text>

              {/* ── Row 2: API Gateway → Lambda Proxy → Lambda Worker ↔ DynamoDB ── */}
              <line x1="300" y1="95" x2="300" y2="145" stroke="#0EA5E9" strokeWidth="1.5" markerEnd="url(#arrow-sky)" />
              <text x="310" y="125" fill="var(--sky-500)" fontSize="8" fontFamily="monospace">/api/*</text>

              <rect x="215" y="150" width="170" height="80" rx="10" fill="var(--sky-50)" stroke="#0EA5E9" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="282" y="153" width="36" height="36" />
              <text x="300" y="203" textAnchor="middle" fill="var(--slate-800)" fontSize="11" fontWeight="700">API Gateway</text>
              <text x="300" y="218" textAnchor="middle" fill="var(--sky-500)" fontSize="9">HTTP API</text>

              <line x1="385" y1="190" x2="460" y2="190" stroke="#0EA5E9" strokeWidth="1.5" markerEnd="url(#arrow-sky)" />

              <rect x="465" y="150" width="180" height="80" rx="10" fill="var(--sky-50)" stroke="#0EA5E9" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="537" y="153" width="36" height="36" />
              <text x="555" y="203" textAnchor="middle" fill="var(--slate-800)" fontSize="11" fontWeight="700">Lambda Proxy</text>
              <text x="555" y="216" textAnchor="middle" fill="var(--sky-500)" fontSize="8" fontFamily="monospace">POST /invoke | GET /status</text>
              <text x="555" y="226" textAnchor="middle" fill="var(--slate-400)" fontSize="8">30s timeout</text>

              <line x1="555" y1="230" x2="555" y2="280" stroke="#0EA5E9" strokeWidth="1.5" markerEnd="url(#arrow-sky)" />
              <text x="565" y="260" fill="var(--sky-500)" fontSize="8" fontWeight="600">async</text>

              <rect x="465" y="285" width="180" height="80" rx="10" fill="var(--sky-50)" stroke="#0EA5E9" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="537" y="288" width="36" height="36" />
              <text x="555" y="340" textAnchor="middle" fill="var(--slate-800)" fontSize="11" fontWeight="700">Lambda Worker</text>
              <text x="555" y="355" textAnchor="middle" fill="var(--slate-500)" fontSize="9">300s timeout</text>

              {/* DynamoDB */}
              <rect x="715" y="150" width="170" height="80" rx="10" fill="var(--sky-50)" stroke="var(--slate-300)" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="782" y="153" width="36" height="36" />
              <text x="800" y="203" textAnchor="middle" fill="var(--slate-800)" fontSize="11" fontWeight="700">DynamoDB</text>
              <text x="800" y="218" textAnchor="middle" fill="var(--slate-500)" fontSize="9">Session State + TTL</text>

              <line x1="645" y1="190" x2="715" y2="190" stroke="var(--slate-400)" strokeWidth="1.5" markerEnd="url(#arrow-slate)" />
              <line x1="715" y1="200" x2="645" y2="200" stroke="var(--slate-400)" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow-slate)" />

              {/* ── Row 3: AgentCore → Agents → Bedrock, ECR ── */}
              <line x1="555" y1="365" x2="555" y2="400" stroke="#0EA5E9" strokeWidth="1.5" markerEnd="url(#arrow-sky)" />

              <rect x="415" y="405" width="280" height="80" rx="10" fill="var(--sky-50)" stroke="#0EA5E9" strokeWidth="2" />
              <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="537" y="408" width="36" height="36" />
              <text x="555" y="460" textAnchor="middle" fill="var(--sky-600)" fontSize="11" fontWeight="700">AgentCore Runtime</text>
              <text x="555" y="475" textAnchor="middle" fill="var(--slate-500)" fontSize="9">Bedrock Managed Container</text>

              {/* Ticket Classifier */}
              <rect x="30" y="415" width="170" height="50" rx="8" fill="var(--sky-50)" stroke="#0EA5E9" strokeWidth="1.5" />
              <text x="115" y="438" textAnchor="middle" fill="#0EA5E9" fontSize="10" fontWeight="600">Ticket Classifier</text>
              <text x="115" y="455" textAnchor="middle" fill="var(--slate-400)" fontSize="8">Categorize + Urgency</text>

              <line x1="415" y1="435" x2="200" y2="435" stroke="#0EA5E9" strokeWidth="1.5" markerEnd="url(#arrow-sky)" />

              {/* Resolution Agent */}
              <rect x="30" y="470" width="170" height="45" rx="8" fill="rgba(16,185,129,0.05)" stroke="#10B981" strokeWidth="1.5" />
              <text x="115" y="492" textAnchor="middle" fill="#10B981" fontSize="10" fontWeight="600">Resolution Agent</text>
              <text x="115" y="507" textAnchor="middle" fill="var(--slate-400)" fontSize="8">KB + Confidence</text>

              <line x1="415" y1="460" x2="200" y2="490" stroke="#10B981" strokeWidth="1.5" markerEnd="url(#arrow-emerald)" />

              {/* Escalation Agent */}
              <rect x="215" y="470" width="170" height="45" rx="8" fill="rgba(245,158,11,0.05)" stroke="#F59E0B" strokeWidth="1.5" />
              <text x="300" y="492" textAnchor="middle" fill="#F59E0B" fontSize="10" fontWeight="600">Escalation Agent</text>
              <text x="300" y="507" textAnchor="middle" fill="var(--slate-400)" fontSize="8">Routing + Priority</text>

              <line x1="415" y1="475" x2="385" y2="490" stroke="#F59E0B" strokeWidth="1.5" markerEnd="url(#arrow-amber)" />

              {/* Amazon Bedrock */}
              <rect x="760" y="405" width="170" height="80" rx="10" fill="var(--sky-50)" stroke="var(--slate-400)" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="827" y="408" width="36" height="36" />
              <text x="845" y="460" textAnchor="middle" fill="var(--slate-800)" fontSize="11" fontWeight="700">Amazon Bedrock</text>
              <text x="845" y="475" textAnchor="middle" fill="var(--slate-500)" fontSize="9">Claude Sonnet</text>

              <line x1="695" y1="445" x2="760" y2="445" stroke="var(--slate-400)" strokeWidth="1.5" markerEnd="url(#arrow-slate)" />

              {/* ECR */}
              <rect x="760" y="290" width="170" height="75" rx="10" fill="var(--sky-50)" stroke="var(--slate-300)" strokeWidth="1.5" />
              <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="827" y="293" width="36" height="36" />
              <text x="845" y="345" textAnchor="middle" fill="var(--slate-800)" fontSize="11" fontWeight="700">ECR</text>
              <text x="845" y="358" textAnchor="middle" fill="var(--slate-400)" fontSize="8">Container Images</text>

              <line x1="845" y1="365" x2="845" y2="405" stroke="var(--slate-400)" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow-slate)" />
            </svg>
          </div>
        </ScrollReveal>

        {/* ===== AI AGENTS ===== */}
        <div className="max-w-5xl mx-auto mb-28">
          <ScrollReveal>
            <div className="text-center mb-14">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] mb-2" style={{ color: 'var(--sky-500)' }}>
                AI Agents
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Three specialized agents working in concert
              </p>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {config.agents.map((agent, i) => {
              const detail = agentDetails[agent.id] || agentDetails.ticket_classifier;
              const icon = agentIcons[agent.id] || agentIcons.ticket_classifier;
              return (
                <ScrollReveal key={agent.id} delay={0.1 + i * 0.12}>
                  <div className="card h-full" style={{ borderTop: `3px solid ${detail.color}` }}>
                    {/* Icon */}
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center mb-5"
                      style={{
                        background: detail.bgLight,
                        color: detail.color,
                      }}
                    >
                      {icon}
                    </div>
                    <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{agent.name}</h3>
                    <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)' }}>{agent.description}</p>
                    {/* Feature list */}
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
                </ScrollReveal>
              );
            })}
          </div>
        </div>

        {/* ===== TECH STACK ===== */}
        <ScrollReveal className="max-w-5xl mx-auto mb-28">
          <div className="text-center mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] mb-2" style={{ color: 'var(--sky-500)' }}>
              Technology Stack
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: 'Runtime', value: 'Amazon Bedrock AgentCore', detail: 'Managed container runtime for multi-agent orchestration', color: 'var(--sky-500)' },
              { label: 'LLM', value: 'Claude Sonnet (Bedrock)', detail: 'Foundation model for natural language understanding', color: 'var(--amber-500)' },
              { label: 'Framework', value: 'LangGraph / Strands', detail: 'Agent orchestration with parallel execution', color: 'var(--emerald-500)' },
              { label: 'API Layer', value: 'API Gateway + Lambda', detail: 'Serverless async invoke with proxy/worker split', color: 'var(--sky-500)' },
              { label: 'State Store', value: 'DynamoDB', detail: 'Session tracking with TTL-based cleanup', color: 'var(--amber-500)' },
              { label: 'CDN & Hosting', value: 'CloudFront + S3', detail: 'SPA hosting with origin access control', color: 'var(--emerald-500)' },
            ].map((item, i) => (
              <ScrollReveal key={item.label} delay={0.05 + i * 0.06}>
                <div className="card">
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: item.color }}>{item.label}</p>
                  <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{item.value}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.detail}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </ScrollReveal>

        {/* ===== CTA ===== */}
        <ScrollReveal className="max-w-lg mx-auto">
          <Link
            to="/console"
            className="block text-center p-6 rounded-2xl transition-all card group"
            style={{ border: '1px dashed var(--sky-300)' }}
          >
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Try with a sample customer
            </p>
            <div className="flex justify-center gap-3">
              {config.input_schema.test_entities.map((id) => (
                <code
                  key={id}
                  className="inline-block px-4 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    background: 'var(--sky-50)',
                    border: '1px solid rgba(14, 165, 233, 0.2)',
                    color: 'var(--sky-600)',
                  }}
                >
                  {id}
                </code>
              ))}
            </div>
          </Link>
        </ScrollReveal>
      </div>
    </div>
  );
}
