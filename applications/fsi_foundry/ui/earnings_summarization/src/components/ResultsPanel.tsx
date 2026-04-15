// @ts-nocheck
import { useState } from 'react';
import type { SummarizationResponse } from '../types';

interface Props {
  result: SummarizationResponse;
}

/* ── Sentiment color mapping ── */
function sentimentColor(sentiment: string): { text: string; bg: string; border: string } {
  const s = sentiment.toLowerCase();
  if (s === 'bullish') return { text: '#4ADE80', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)' };
  if (s === 'bearish') return { text: '#F87171', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' };
  if (s === 'mixed') return { text: '#FB923C', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)' };
  return { text: '#94A3B8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)' };
}

/* ── Sentiment icon ── */
function SentimentIcon({ sentiment }: { sentiment: string }) {
  const s = sentiment.toLowerCase();
  const color = sentimentColor(sentiment).text;
  if (s === 'bullish') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    );
  }
  if (s === 'bearish') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
      </svg>
    );
  }
  if (s === 'mixed') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* ── Sentiment Gauge Bar ── */
function SentimentGaugeBar({ sentiment }: { sentiment: string }) {
  const s = sentiment.toLowerCase();
  const positions: Record<string, number> = { bearish: 15, neutral: 50, mixed: 50, bullish: 85 };
  const pct = positions[s] ?? 50;
  const sc = sentimentColor(sentiment);

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs mb-1" style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
        <span style={{ color: '#F87171' }}>BEARISH</span>
        <span style={{ color: '#94A3B8' }}>NEUTRAL</span>
        <span style={{ color: '#4ADE80' }}>BULLISH</span>
      </div>
      <div className="relative h-2 rounded" style={{ background: 'var(--terminal-border)' }}>
        <div className="absolute inset-0 rounded" style={{
          background: 'linear-gradient(90deg, #EF444440, #94A3B840, #22C55E40)',
        }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 transition-all duration-700"
          style={{
            left: `${pct}%`,
            transform: `translate(-50%, -50%)`,
            background: sc.bg,
            borderColor: sc.text,
            boxShadow: `0 0 8px ${sc.text}60`,
          }}
        />
      </div>
    </div>
  );
}

function ResultsPanelInternal({ result }: Props) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const { earnings_overview } = result;

  return (
    <div className="space-y-4 animate-fadeSlideUp">

      {/* ── Result Header ── */}
      <div className="terminal-card flex items-center justify-between" style={{ borderTop: `2px solid #2563EB` }}>
        <div>
          <h2 className="text-base font-extrabold" style={{ color: 'var(--white)' }}>Analysis Result</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs" style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
              SID: {result.session_id}
            </span>
            <span className="text-xs" style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
              {new Date(result.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold px-2.5 py-1 rounded"
            style={{
              background: 'rgba(37,99,235,0.15)',
              color: 'var(--blue-400)',
              border: '1px solid rgba(37,99,235,0.3)',
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            }}>
            {result.entity_id}
          </span>
        </div>
      </div>

      {/* ── Two-Column Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Left: Sentiment + Key Metrics ── */}
        <div className="space-y-4">

          {/* Sentiment Card */}
          {earnings_overview && (
            <div className="terminal-card animate-fadeSlideUp stagger-1">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2"
                style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                <SentimentIcon sentiment={earnings_overview.sentiment} />
                <span>Market Sentiment</span>
              </h3>
              <div className="flex items-center gap-3 mb-2">
                <span className={`sentiment-gauge ${earnings_overview.sentiment.toLowerCase()}`}>
                  {earnings_overview.sentiment}
                </span>
              </div>
              <SentimentGaugeBar sentiment={earnings_overview.sentiment} />
            </div>
          )}

          {/* Key Metrics */}
          {earnings_overview && Object.keys(earnings_overview.key_metrics).length > 0 && (
            <div className="terminal-card animate-fadeSlideUp stagger-2">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2"
                style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue-400)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Key Metrics
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(earnings_overview.key_metrics).map(([key, value], i) => (
                  <div key={key} className="metric-card animate-dataStream" style={{ animationDelay: `${i * 0.08}s` }}>
                    <div className="text-xs font-bold uppercase tracking-wider mb-1"
                      style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: '0.6rem' }}>
                      {key.replace(/_/g, ' ')}
                    </div>
                    <div className="text-sm font-extrabold"
                      style={{ color: 'var(--white)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Guidance Changes */}
          {earnings_overview && earnings_overview.guidance_changes.length > 0 && (
            <div className="terminal-card animate-fadeSlideUp stagger-3">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2"
                style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--orange-400)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Guidance Changes
              </h3>
              <div className="space-y-2">
                {earnings_overview.guidance_changes.map((change, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded animate-dataStream"
                    style={{ background: 'var(--terminal-dark)', border: '1px solid var(--terminal-border)', animationDelay: `${i * 0.1}s` }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--orange-400)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                      <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <span className="text-xs leading-relaxed" style={{ color: 'var(--gray-300)' }}>{change}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Quotes + Risks ── */}
        <div className="space-y-4">

          {/* Notable Quotes */}
          {earnings_overview && earnings_overview.notable_quotes.length > 0 && (
            <div className="terminal-card animate-fadeSlideUp stagger-2">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2"
                style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--orange-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                Notable Quotes
              </h3>
              <div className="space-y-2">
                {earnings_overview.notable_quotes.map((quote, i) => (
                  <div key={i} className="quote-block animate-dataStream" style={{ animationDelay: `${i * 0.12}s` }}>
                    <p className="text-xs leading-relaxed pl-4" style={{ color: 'var(--gray-300)' }}>
                      {quote}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risks Identified */}
          {earnings_overview && earnings_overview.risks_identified.length > 0 && (
            <div className="terminal-card animate-fadeSlideUp stagger-3">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2"
                style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red-400)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Risks Identified
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded"
                  style={{
                    background: 'rgba(239,68,68,0.1)',
                    color: 'var(--red-400)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  }}>
                  {earnings_overview.risks_identified.length}
                </span>
              </h3>
              <div className="space-y-2">
                {earnings_overview.risks_identified.map((risk, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded animate-dataStream"
                    style={{
                      background: 'rgba(239,68,68,0.04)',
                      border: '1px solid rgba(239,68,68,0.12)',
                      animationDelay: `${i * 0.1}s`,
                    }}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: 'var(--red-400)' }} />
                    <span className="text-xs leading-relaxed" style={{ color: 'var(--gray-300)' }}>{risk}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations && result.recommendations.length > 0 && (
            <div className="terminal-card animate-fadeSlideUp stagger-4">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2"
                style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue-400)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Recommendations
              </h3>
              <div className="space-y-2">
                {result.recommendations.map((rec, i) => (
                  <div key={i} className="recommendation-card animate-dataStream" style={{ animationDelay: `${i * 0.1}s` }}>
                    <p className="text-xs leading-relaxed pl-2" style={{ color: 'var(--gray-300)' }}>{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Summary ── */}
      {result.summary && (
        <div className="terminal-card animate-fadeSlideUp stagger-4" style={{ borderLeft: '3px solid #2563EB' }}>
          <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2"
            style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue-400)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Executive Summary
          </h3>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--gray-300)' }}>{result.summary}</p>
        </div>
      )}

      {/* ── Raw Analysis ── */}
      {Object.keys(result.raw_analysis).length > 0 && (
        <div className="terminal-card animate-fadeSlideUp stagger-5">
          <button
            onClick={() => setRawExpanded(!rawExpanded)}
            className="w-full flex items-center justify-between text-xs font-bold"
            style={{ color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}
          >
            <span className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              RAW AGENT OUTPUT
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: rawExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {rawExpanded && (
            <pre className="mt-3 p-4 rounded text-xs overflow-x-auto"
              style={{
                background: 'var(--terminal-dark)',
                color: 'var(--gray-300)',
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                border: '1px solid var(--terminal-border)',
              }}>
              {JSON.stringify(result.raw_analysis, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

import { Component, type ErrorInfo, type ReactNode } from 'react';
class ResultsErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean}> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('ResultsPanel error:', error, info); }
  render() {
    if (this.state.hasError) {
      return <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-center">
        <p className="text-amber-800 font-medium">Unable to display results</p>
        <p className="text-amber-600 text-sm mt-1">The agent response format was unexpected. Check the raw output in deployment details.</p>
      </div>;
    }
    return this.props.children;
  }
}
export default function ResultsPanel(props: any) { return <ResultsErrorBoundary><ResultsPanelInternal {...props} /></ResultsErrorBoundary>; }
