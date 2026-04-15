// @ts-nocheck
import { useState } from 'react';
import type { SearchResponse, SearchResult } from '../types';

interface Props {
  data: SearchResponse;
}

function RelevanceBadge({ relevance }: { relevance: SearchResult['relevance'] }) {
  const cls = `relevance-badge relevance-${relevance}`;
  const label = relevance.toUpperCase();
  return (
    <span className={cls}>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background:
            relevance === 'high'
              ? 'var(--relevance-high)'
              : relevance === 'medium'
                ? 'var(--relevance-medium)'
                : 'var(--relevance-low)',
        }}
      />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: SearchResult['status'] }) {
  const cls = `status-badge status-${status}`;
  return <span className={cls}>{status}</span>;
}

function DocumentCard({ result, index }: { result: SearchResult; index: number }) {
  return (
    <div
      className={`document-card relevance-${result.relevance} animate-fade-slide-up`}
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <h3
          className="text-base leading-snug"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: 'var(--brown-deep)' }}
        >
          {result.title}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          <RelevanceBadge relevance={result.relevance} />
          <StatusBadge status={result.status} />
        </div>
      </div>

      <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
        {result.snippet}
      </p>

      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
          style={{
            background: 'rgba(217, 119, 6, 0.06)',
            color: 'var(--brown-warm)',
            border: '1px solid rgba(217, 119, 6, 0.1)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          {result.document_type}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {result.document_id}
        </span>
      </div>
    </div>
  );
}

function ResultsPanelInternal({ data }: Props) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="space-y-5 animate-fade-slide-up">
      {/* Summary */}
      <div className="card-parchment">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: 'rgba(217, 119, 6, 0.1)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div>
            <h3
              className="text-sm font-semibold mb-1.5"
              style={{ color: 'var(--brown-deep)' }}
            >
              Search Summary
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {data.summary}
            </p>
          </div>
        </div>

        {/* Metadata */}
        <div className="warm-divider my-4" />
        <div className="flex items-center gap-6 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>
            <strong style={{ color: 'var(--text-secondary)' }}>Query:</strong> {data.query}
          </span>
          <span>
            <strong style={{ color: 'var(--text-secondary)' }}>Results:</strong> {data.results.length}
          </span>
          <span>
            <strong style={{ color: 'var(--text-secondary)' }}>Time:</strong>{' '}
            {new Date(data.timestamp).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Results List */}
      <div>
        <h3
          className="text-sm font-semibold uppercase tracking-wider mb-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          Documents Found ({data.results.length})
        </h3>
        <div className="space-y-3">
          {data.results.map((result, i) => (
            <DocumentCard key={result.document_id} result={result} index={i} />
          ))}
        </div>
      </div>

      {/* Relevance Scores */}
      {data.relevance_scores.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--brown-deep)' }}>
            Relevance Scores
          </h4>
          <div className="flex items-end gap-2 h-16">
            {data.relevance_scores.map((score, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <div
                  className="w-full rounded-t-md animate-fade-slide-up"
                  style={{
                    height: `${score * 60}px`,
                    background: `linear-gradient(to top, var(--amber), var(--amber-light))`,
                    opacity: 0.3 + score * 0.7,
                    animationDelay: `${i * 0.05}s`,
                  }}
                />
                <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {(score * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw Analysis */}
      <div className="card">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-2 text-sm font-medium cursor-pointer bg-transparent border-0 p-0"
          style={{ color: 'var(--amber)' }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              transform: showRaw ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          Raw Analysis
        </button>
        {showRaw && (
          <pre
            className="mt-3 p-4 rounded-xl text-xs overflow-auto max-h-80"
            style={{
              background: 'var(--cream)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.6,
            }}
          >
            {JSON.stringify(data.raw_analysis, null, 2)}
          </pre>
        )}
      </div>
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
