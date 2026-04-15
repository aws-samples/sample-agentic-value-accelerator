import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

/* ── Animated SVG mini-icons for stat cards ── */
function GaugeIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="13" stroke="rgba(71,85,105,0.3)" strokeWidth="3" />
      <circle
        cx="16" cy="16" r="13"
        stroke="var(--copper-light)" strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="82"
        strokeDashoffset="30"
        style={{ animation: 'gaugeArc 2s ease-out forwards' }}
      />
      <circle cx="16" cy="16" r="2" fill="var(--copper-light)" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      {[4, 12, 20, 28].map((x) =>
        [4, 12, 20, 28].map((y) => (
          <circle
            key={`${x}-${y}`}
            cx={x} cy={y} r="1.5"
            fill="var(--teal-light)"
            opacity="0.6"
            style={{ animation: `dotPulse 2s ease-in-out infinite ${(x + y) * 0.05}s` }}
          />
        ))
      )}
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path
        d="M16 4L30 28H2L16 4Z"
        stroke="var(--copper-light)" strokeWidth="2" strokeLinejoin="round"
        fill="rgba(234,88,12,0.1)"
      />
      <line x1="16" y1="13" x2="16" y2="20" stroke="var(--copper-light)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="24" r="1.2" fill="var(--copper-light)" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="4" fill="var(--teal)" />
      <circle cx="16" cy="16" r="8" stroke="var(--teal-light)" strokeWidth="1" opacity="0.5" style={{ animation: 'pulseRing 2s ease-out infinite' }} />
      <circle cx="16" cy="16" r="12" stroke="var(--teal-light)" strokeWidth="0.5" opacity="0.3" style={{ animation: 'pulseRing 2s ease-out infinite 0.5s' }} />
    </svg>
  );
}

/* ── Intersection Observer hook ── */
function useScrollReveal() {
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
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

    refs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  return (idx: number) => (el: HTMLDivElement | null) => {
    refs.current[idx] = el;
  };
}

/* ── Pipeline stages ── */
const pipelineStages = [
  { title: 'Exception Detection', desc: 'Incoming payment anomalies flagged by monitoring systems', icon: '!' },
  { title: 'Analysis', desc: 'AI agent determines root cause and severity classification', icon: 'A' },
  { title: 'Resolution', desc: 'Automated or escalated resolution actions applied', icon: 'R' },
  { title: 'Settlement', desc: 'Payment settlement verification and timeline tracking', icon: 'S' },
  { title: 'Reconciliation', desc: 'Final reconciliation and compliance audit trail', icon: 'C' },
];

/* ── Tech stack ── */
const techStack = [
  { label: 'Runtime', value: 'AgentCore', desc: 'Bedrock Managed Container' },
  { label: 'LLM', value: 'Claude Sonnet', desc: 'Amazon Bedrock' },
  { label: 'Framework', value: 'Strands Agents', desc: 'Multi-agent orchestration' },
  { label: 'API Layer', value: 'API Gateway', desc: 'REST + Lambda Proxy' },
  { label: 'State Store', value: 'DynamoDB', desc: 'Session state with TTL' },
  { label: 'CDN', value: 'CloudFront', desc: 'Global edge distribution' },
];

export default function Home({ config }: Props) {
  const setRef = useScrollReveal();

  return (
    <div>
      {/* ═══════ HERO SECTION ═══════ */}
      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          minHeight: '600px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Animated gradient background */}
        <div
          className="animate-breathe"
          style={{
            position: 'absolute',
            inset: '-10%',
            background: 'radial-gradient(ellipse at 30% 50%, #1E293B 0%, #0F172A 50%, #020617 100%)',
            zIndex: 0,
          }}
        />

        {/* Radar sweep overlay */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '500px',
            height: '500px',
            marginLeft: '-250px',
            marginTop: '-250px',
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, transparent 0deg, rgba(234,88,12,0.06) 40deg, transparent 80deg)',
            animation: 'radarSweep 4s linear infinite',
            zIndex: 1,
            opacity: 0.7,
          }}
        />

        {/* Radar concentric rings */}
        {[100, 170, 240].map((r) => (
          <div
            key={r}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: r * 2,
              height: r * 2,
              marginLeft: -r,
              marginTop: -r,
              borderRadius: '50%',
              border: '1px solid rgba(71,85,105,0.15)',
              zIndex: 1,
            }}
          />
        ))}

        {/* Dot grid overlay */}
        <div
          className="dot-grid"
          style={{ position: 'absolute', inset: 0, zIndex: 1, opacity: 0.5 }}
        />

        {/* Content */}
        <div className="max-w-7xl mx-auto px-6 py-24 relative" style={{ zIndex: 10 }}>
          <div className="text-center max-w-3xl mx-auto">
            <div
              className="mono"
              style={{
                display: 'inline-block',
                marginBottom: '1rem',
                padding: '0.3rem 0.8rem',
                borderRadius: 6,
                fontSize: '0.75rem',
                fontWeight: 600,
                background: 'rgba(234,88,12,0.1)',
                color: 'var(--copper-light)',
                border: '1px solid rgba(234,88,12,0.25)',
                letterSpacing: '0.08em',
              }}
            >
              B05 / PAYMENT OPS
            </div>

            <h1
              style={{
                fontSize: 'clamp(2.2rem, 5vw, 3.5rem)',
                fontWeight: 800,
                lineHeight: 1.1,
                marginBottom: '1.25rem',
                color: 'var(--text-primary)',
              }}
            >
              Payment Operations{' '}
              <span style={{ color: 'var(--copper-light)' }}>Center</span>
            </h1>

            <p
              style={{
                fontSize: '1.15rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
                marginBottom: '2rem',
                maxWidth: '600px',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              {config.description}. AI-driven exception handling, severity classification,
              and automated settlement reconciliation.
            </p>

            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link to="/console" className="btn-primary" style={{ textDecoration: 'none' }}>
                Launch Console
              </Link>
              <a href="#architecture" className="btn-secondary" style={{ textDecoration: 'none' }}>
                View Architecture
              </a>
            </div>
          </div>

          {/* Stat cards row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 max-w-4xl mx-auto">
            {[
              { icon: <GaugeIcon />, value: '2', label: 'AI Agents' },
              { icon: <GridIcon />, value: '3', label: 'Operation Modes' },
              { icon: <AlertIcon />, value: '4', label: 'Severity Levels' },
              { icon: <PulseIcon />, value: 'Live', label: 'Monitoring' },
            ].map((stat, i) => (
              <div
                key={i}
                className="control-card"
                style={{
                  textAlign: 'center',
                  opacity: 0,
                  animation: `fadeSlideUp 0.5s ease-out ${0.2 + i * 0.1}s forwards`,
                }}
              >
                <div className="flex justify-center mb-2">{stat.icon}</div>
                <div
                  className="mono"
                  style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}
                >
                  {stat.value}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ OPERATIONS PIPELINE ═══════ */}
      <section className="max-w-7xl mx-auto px-6 py-20" ref={setRef(0)} style={{ opacity: 0 }}>
        <div className="text-center mb-12">
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Operations Pipeline
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
            End-to-end payment exception processing and settlement workflow
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-6">
          {pipelineStages.map((stage, i) => (
            <div key={i} className="relative flex items-center">
              <div
                className="isometric-card"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid rgba(71,85,105,0.3)',
                  borderRadius: 12,
                  padding: '1.5rem',
                  width: 180,
                  textAlign: 'center',
                  opacity: 0,
                  animation: `fadeSlideUp 0.5s ease-out ${0.1 + i * 0.12}s forwards`,
                }}
              >
                {/* Stage icon */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: i < 3
                      ? 'rgba(234,88,12,0.12)'
                      : 'rgba(13,148,136,0.12)',
                    border: `2px solid ${i < 3 ? 'var(--copper)' : 'var(--teal)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 0.75rem',
                    fontWeight: 800,
                    fontSize: '1rem',
                    color: i < 3 ? 'var(--copper-light)' : 'var(--teal-light)',
                    animation: i < 3
                      ? 'nodeGlow 3s ease-in-out infinite'
                      : 'nodeGlowTeal 3s ease-in-out infinite',
                    animationDelay: `${i * 0.5}s`,
                  }}
                >
                  {stage.icon}
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    color: 'var(--text-primary)',
                    marginBottom: '0.4rem',
                  }}
                >
                  {stage.title}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {stage.desc}
                </div>
              </div>

              {/* Connector with flowing dot */}
              {i < pipelineStages.length - 1 && (
                <div
                  style={{
                    position: 'relative',
                    width: 40,
                    height: 2,
                    background: 'rgba(71,85,105,0.3)',
                    marginLeft: -4,
                    marginRight: -4,
                  }}
                  className="hidden md:block"
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: -3,
                      left: 0,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: i < 2 ? 'var(--copper)' : 'var(--teal)',
                      animation: `flowDot 2s ease-in-out infinite ${i * 0.3}s`,
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ ARCHITECTURE DIAGRAM ═══════ */}
      <section id="architecture" className="max-w-7xl mx-auto px-6 py-20" ref={setRef(1)} style={{ opacity: 0 }}>
        <div className="text-center mb-12">
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            System Architecture
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
            Serverless payment operations pipeline on AWS
          </p>
        </div>

        <div className="card" style={{ padding: '2rem', overflowX: 'auto' }}>
          <svg viewBox="0 0 960 520" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 960, margin: '0 auto', display: 'block' }}>
            <defs>
              <pattern id="archGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="0.5" fill="rgba(71,85,105,0.2)" />
              </pattern>
              <marker id="arrowCopper" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6" fill="#EA580C" />
              </marker>
              <marker id="arrowSteel" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6" fill="#64748B" />
              </marker>
              <marker id="arrowTeal" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6" fill="#0D9488" />
              </marker>
            </defs>
            <rect width="960" height="520" fill="url(#archGrid)" />

            {/* ── Row 1: User → CloudFront → S3 ── */}
            <rect x="30" y="20" width="120" height="70" rx="8" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
            <text x="90" y="48" textAnchor="middle" fill="#F8FAFC" fontSize="12" fontWeight="700">User</text>
            <text x="90" y="65" textAnchor="middle" fill="#94A3B8" fontSize="9">Browser</text>

            <line x1="150" y1="55" x2="210" y2="55" stroke="#EA580C" strokeWidth="1.5" markerEnd="url(#arrowCopper)" />

            <rect x="215" y="15" width="170" height="80" rx="8" fill="#1E293B" stroke="#EA580C" strokeWidth="1.5" />
            <image href="/aws-icons/Arch_Amazon-CloudFront_48.svg" x="282" y="18" width="36" height="36" />
            <text x="300" y="68" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="700">CloudFront</text>
            <text x="300" y="82" textAnchor="middle" fill="#94A3B8" fontSize="9">CDN + SPA Rewrite</text>

            <line x1="385" y1="40" x2="460" y2="40" stroke="#EA580C" strokeWidth="1.5" markerEnd="url(#arrowCopper)" />
            <text x="423" y="34" textAnchor="middle" fill="#94A3B8" fontSize="8">OAC</text>

            <rect x="465" y="15" width="150" height="80" rx="8" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
            <image href="/aws-icons/Arch_Amazon-Simple-Storage-Service_48.svg" x="522" y="18" width="36" height="36" />
            <text x="540" y="68" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="700">S3</text>
            <text x="540" y="82" textAnchor="middle" fill="#94A3B8" fontSize="9">Static UI Assets</text>

            {/* ── Row 2: API Gateway → Lambda Proxy → Lambda Worker ↔ DynamoDB ── */}
            <line x1="300" y1="95" x2="300" y2="145" stroke="#EA580C" strokeWidth="1.5" markerEnd="url(#arrowCopper)" />
            <text x="310" y="125" fill="#F97316" fontSize="8" fontFamily="monospace">/api/*</text>

            <rect x="215" y="150" width="170" height="80" rx="8" fill="#1E293B" stroke="#EA580C" strokeWidth="1.5" />
            <image href="/aws-icons/Arch_Amazon-API-Gateway_48.svg" x="282" y="153" width="36" height="36" />
            <text x="300" y="203" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="700">API Gateway</text>
            <text x="300" y="218" textAnchor="middle" fill="#F97316" fontSize="9">HTTP API</text>

            <line x1="385" y1="190" x2="460" y2="190" stroke="#EA580C" strokeWidth="1.5" markerEnd="url(#arrowCopper)" />

            <rect x="465" y="150" width="180" height="80" rx="8" fill="#1E293B" stroke="#EA580C" strokeWidth="1.5" />
            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="537" y="153" width="36" height="36" />
            <text x="555" y="203" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="700">Lambda Proxy</text>
            <text x="555" y="216" textAnchor="middle" fill="#F97316" fontSize="8" fontFamily="monospace">POST /invoke | GET /status</text>
            <text x="555" y="226" textAnchor="middle" fill="#94A3B8" fontSize="8">30s timeout</text>

            <line x1="555" y1="230" x2="555" y2="280" stroke="#EA580C" strokeWidth="1.5" markerEnd="url(#arrowCopper)" />
            <text x="565" y="260" fill="#F97316" fontSize="8" fontWeight="600">async</text>

            <rect x="465" y="285" width="180" height="80" rx="8" fill="#1E293B" stroke="#EA580C" strokeWidth="1.5" />
            <image href="/aws-icons/Arch_AWS-Lambda_48.svg" x="537" y="288" width="36" height="36" />
            <text x="555" y="340" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="700">Lambda Worker</text>
            <text x="555" y="355" textAnchor="middle" fill="#94A3B8" fontSize="9">300s timeout</text>

            {/* DynamoDB */}
            <rect x="715" y="150" width="170" height="80" rx="8" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
            <image href="/aws-icons/Arch_Amazon-DynamoDB_48.svg" x="782" y="153" width="36" height="36" />
            <text x="800" y="203" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="700">DynamoDB</text>
            <text x="800" y="218" textAnchor="middle" fill="#94A3B8" fontSize="9">Session State + TTL</text>

            <line x1="645" y1="190" x2="715" y2="190" stroke="#64748B" strokeWidth="1.5" markerEnd="url(#arrowSteel)" />
            <line x1="715" y1="200" x2="645" y2="200" stroke="#64748B" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrowSteel)" />

            {/* ── Row 3: AgentCore → Agents → Bedrock, ECR ── */}
            <line x1="555" y1="365" x2="555" y2="400" stroke="#0D9488" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />

            <rect x="415" y="405" width="280" height="80" rx="8" fill="#1E293B" stroke="#0D9488" strokeWidth="2" />
            <image href="/aws-icons/Arch_Amazon-Bedrock-AgentCore_48.svg" x="537" y="408" width="36" height="36" />
            <text x="555" y="460" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="700">AgentCore Runtime</text>
            <text x="555" y="475" textAnchor="middle" fill="#14B8A6" fontSize="9">Bedrock Managed Container</text>

            {/* Exception Handler Agent */}
            <rect x="30" y="420" width="170" height="55" rx="8" fill="rgba(234,88,12,0.08)" stroke="#EA580C" strokeWidth="1.5" />
            <text x="115" y="445" textAnchor="middle" fill="#F97316" fontSize="11" fontWeight="700">Exception Handler</text>
            <text x="115" y="462" textAnchor="middle" fill="#94A3B8" fontSize="8">Severity + Resolution</text>

            <line x1="415" y1="440" x2="200" y2="440" stroke="#EA580C" strokeWidth="1.5" markerEnd="url(#arrowCopper)" />

            {/* Settlement Agent */}
            <rect x="215" y="420" width="170" height="55" rx="8" fill="rgba(13,148,136,0.08)" stroke="#0D9488" strokeWidth="1.5" />
            <text x="300" y="445" textAnchor="middle" fill="#14B8A6" fontSize="11" fontWeight="700">Settlement Agent</text>
            <text x="300" y="462" textAnchor="middle" fill="#94A3B8" fontSize="8">Reconciliation + Timeline</text>

            <line x1="415" y1="455" x2="385" y2="455" stroke="#0D9488" strokeWidth="1.5" markerEnd="url(#arrowTeal)" />

            {/* Amazon Bedrock */}
            <rect x="760" y="405" width="170" height="80" rx="8" fill="#1E293B" stroke="#64748B" strokeWidth="1.5" />
            <image href="/aws-icons/Arch_Amazon-Bedrock_48.svg" x="827" y="408" width="36" height="36" />
            <text x="845" y="460" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="700">Amazon Bedrock</text>
            <text x="845" y="475" textAnchor="middle" fill="#94A3B8" fontSize="9">Claude Sonnet</text>

            <line x1="695" y1="445" x2="760" y2="445" stroke="#64748B" strokeWidth="1.5" markerEnd="url(#arrowSteel)" />

            {/* ECR */}
            <rect x="760" y="290" width="170" height="75" rx="8" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
            <image href="/aws-icons/Arch_Amazon-Elastic-Container-Registry_48.svg" x="827" y="293" width="36" height="36" />
            <text x="845" y="345" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="700">ECR</text>
            <text x="845" y="358" textAnchor="middle" fill="#94A3B8" fontSize="8">Container Images</text>

            <line x1="845" y1="365" x2="845" y2="405" stroke="#475569" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowSteel)" />
          </svg>
        </div>
      </section>

      {/* ═══════ AGENT DETAIL CARDS ═══════ */}
      <section className="max-w-7xl mx-auto px-6 py-20" ref={setRef(2)} style={{ opacity: 0 }}>
        <div className="text-center mb-12">
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            AI Agent Capabilities
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
            Specialized agents for exception handling and settlement processing
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Exception Handler Card */}
          <div
            className="card card-lift"
            style={{ borderTop: '3px solid var(--copper)', padding: '2rem' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'rgba(234,88,12,0.12)',
                  border: '1px solid rgba(234,88,12,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  Exception Handler
                </h3>
                <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--copper-light)' }}>
                  exception_handler
                </span>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1rem' }}>
              Analyzes payment exceptions, determines root cause and severity, recommends resolution actions.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Responsibilities
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {[
                  'Payment exception root cause analysis',
                  'Severity classification (LOW to CRITICAL)',
                  'Resolution recommendation engine',
                  'Escalation decision logic',
                ].map((item, i) => (
                  <li key={i} style={{ padding: '0.3rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--copper)', flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Severity Levels
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="severity-low">LOW</span>
                <span className="severity-medium">MEDIUM</span>
                <span className="severity-high">HIGH</span>
                <span className="severity-critical">CRITICAL</span>
              </div>
            </div>
          </div>

          {/* Settlement Agent Card */}
          <div
            className="card card-lift"
            style={{ borderTop: '3px solid var(--teal)', padding: '2rem' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'rgba(13,148,136,0.12)',
                  border: '1px solid rgba(13,148,136,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  Settlement Agent
                </h3>
                <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--teal-light)' }}>
                  settlement_agent
                </span>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1rem' }}>
              Verifies settlement readiness, reconciles payments, tracks settlement timelines.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Responsibilities
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {[
                  'Settlement readiness verification',
                  'Payment reconciliation processing',
                  'Settlement timeline tracking',
                  'Compliance audit trail generation',
                ].map((item, i) => (
                  <li key={i} style={{ padding: '0.3rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Settlement Statuses
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="settlement-pending">PENDING</span>
                <span className="settlement-settled">SETTLED</span>
                <span className="settlement-failed">FAILED</span>
                <span className="settlement-requires_action">REQUIRES ACTION</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ TECHNOLOGY STACK ═══════ */}
      <section className="max-w-7xl mx-auto px-6 py-20" ref={setRef(3)} style={{ opacity: 0 }}>
        <div className="text-center mb-12">
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Technology Stack
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
            Enterprise-grade serverless infrastructure
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {techStack.map((tech, i) => (
            <div
              key={i}
              className="control-card steel"
              style={{
                textAlign: 'center',
                opacity: 0,
                animation: `fadeSlideUp 0.5s ease-out ${0.1 + i * 0.08}s forwards`,
              }}
            >
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                {tech.label}
              </div>
              <div className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                {tech.value}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {tech.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ CTA SECTION ═══════ */}
      <section className="max-w-7xl mx-auto px-6 py-20" ref={setRef(4)} style={{ opacity: 0 }}>
        <div
          className="card dot-grid-dense"
          style={{
            textAlign: 'center',
            padding: '3rem 2rem',
            borderColor: 'rgba(234,88,12,0.2)',
          }}
        >
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
            Ready to Analyze Payment Operations?
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', maxWidth: 500, margin: '0 auto 1.5rem' }}>
            Launch the operations console with test entity{' '}
            <code className="mono" style={{ color: 'var(--copper-light)', background: 'rgba(234,88,12,0.1)', padding: '0.15rem 0.4rem', borderRadius: 4 }}>
              {config.input_schema.test_entities[0]}
            </code>
          </p>
          <Link
            to={`/console?id=${config.input_schema.test_entities[0]}`}
            className="btn-primary"
            style={{ textDecoration: 'none', display: 'inline-block' }}
          >
            Open Operations Console
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(71,85,105,0.2)', padding: '2rem 0' }}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {config.use_case_name} — Agentic Value Accelerator
          </span>
          <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            B05 / {config.domain}
          </span>
        </div>
      </footer>
    </div>
  );
}
