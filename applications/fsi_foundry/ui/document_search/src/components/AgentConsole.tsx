// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import type { RuntimeConfig } from '../config';
import type { SearchResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

interface Props {
  config: RuntimeConfig;
}

const placeholders = [
  'anti-money laundering requirements',
  'KYC documentation standards',
  'credit risk assessment procedures',
  'Basel III compliance guidelines',
  'loan origination process',
];

export default function AgentConsole({ config }: Props) {
  const [query, setQuery] = useState('');
  const [selectedType, setSelectedType] = useState('full');
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Typewriter placeholder animation
  useEffect(() => {
    if (query) return; // Don't animate when user is typing
    const target = placeholders[placeholderIndex];
    let charIndex = 0;
    let direction: 'typing' | 'deleting' = 'typing';
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (direction === 'typing') {
        charIndex++;
        setDisplayedPlaceholder(target.slice(0, charIndex));
        if (charIndex >= target.length) {
          timeout = setTimeout(() => {
            direction = 'deleting';
            tick();
          }, 2000);
          return;
        }
        timeout = setTimeout(tick, 60);
      } else {
        charIndex--;
        setDisplayedPlaceholder(target.slice(0, charIndex));
        if (charIndex <= 0) {
          setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
          return;
        }
        timeout = setTimeout(tick, 30);
      }
    };

    timeout = setTimeout(tick, 300);
    return () => clearTimeout(timeout);
  }, [placeholderIndex, query]);

  async function handleSearch() {
    if (!query.trim()) return;
    setStatus('running');
    setError(null);
    setResult(null);

    try {
      const payload: Record<string, string> = {
        [config.input_schema.id_field]: query.trim(),
        [config.input_schema.type_field]: selectedType,
      };
      const data = await invokeAgent(config, payload);
      setResult(data);
      setStatus('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setStatus('error');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch();
  }

  const isRunning = status === 'running';

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8 animate-fade-slide-up">
        <h1
          className="text-3xl mb-2"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: 'var(--brown-deep)' }}
        >
          Search Console
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Search across the entire document corpus using natural language queries
        </p>
      </div>

      {/* Search Section */}
      <div className="card mb-6 animate-fade-slide-up stagger-1" style={{ padding: '2rem' }}>
        {/* Search Input */}
        <div className="relative mb-5">
          <div className="absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warm-gray-light)" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={query ? '' : `e.g. ${displayedPlaceholder}`}
            className="search-bar-large"
            style={{ paddingLeft: '3rem', paddingRight: '7rem' }}
            disabled={isRunning}
          />
          <button
            onClick={handleSearch}
            disabled={isRunning || !query.trim()}
            className="btn-primary absolute right-3 top-1/2 -translate-y-1/2"
            style={{ padding: '0.625rem 1.5rem' }}
          >
            {isRunning ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Searching
              </span>
            ) : (
              'Search'
            )}
          </button>
        </div>

        {/* Document Type Filters */}
        <div>
          <div className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Document Type
          </div>
          <div className="flex flex-wrap gap-2">
            {config.input_schema.type_options.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedType(option.value)}
                className={`filter-pill ${selectedType === option.value ? 'active' : ''}`}
                disabled={isRunning}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Status */}
      <div className="grid md:grid-cols-2 gap-4 mb-8 animate-fade-slide-up stagger-2">
        {config.agents.map((agent) => {
          const isIndexer = agent.id === 'document_indexer';
          const agentStatus =
            status === 'idle'
              ? 'ready'
              : status === 'running'
                ? 'processing'
                : status === 'complete'
                  ? 'done'
                  : 'error';

          return (
            <div
              key={agent.id}
              className={isIndexer ? 'agent-card-indexer' : 'agent-card-search'}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{
                      background: isIndexer
                        ? 'rgba(217,119,6,0.12)'
                        : 'rgba(120,53,15,0.12)',
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
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
                    <div className="text-sm font-semibold" style={{ color: 'var(--brown-deep)' }}>
                      {agent.name}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {agent.description}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      background:
                        agentStatus === 'ready'
                          ? 'var(--status-active)'
                          : agentStatus === 'processing'
                            ? 'var(--amber)'
                            : agentStatus === 'done'
                              ? 'var(--status-active)'
                              : '#EF4444',
                      animation: agentStatus === 'processing' ? 'warmPulse 1.5s infinite' : 'none',
                    }}
                  />
                  <span
                    className="text-xs font-medium capitalize"
                    style={{
                      color:
                        agentStatus === 'ready'
                          ? 'var(--status-active)'
                          : agentStatus === 'processing'
                            ? 'var(--amber)'
                            : agentStatus === 'done'
                              ? 'var(--status-active)'
                              : '#EF4444',
                    }}
                  >
                    {agentStatus === 'done' ? 'complete' : agentStatus}
                  </span>
                </div>
              </div>

              {/* Loading bar when processing */}
              {agentStatus === 'processing' && (
                <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(217,119,6,0.1)' }}>
                  <div className="loading-bar" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Loading State */}
      {isRunning && (
        <div className="card text-center py-12 animate-fade-in">
          <div className="book-loader mx-auto mb-5">
            <div className="page" />
            <div className="page" />
            <div className="page" />
            <div className="page" />
          </div>
          <p
            className="text-sm font-medium mb-1"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--brown-deep)' }}
          >
            Searching documents...
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            AI agents are indexing and ranking results
          </p>
        </div>
      )}

      {/* Error State */}
      {status === 'error' && error && (
        <div
          className="card animate-fade-slide-up"
          style={{ borderLeft: '4px solid #EF4444' }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(239, 68, 68, 0.1)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-1" style={{ color: '#991B1B' }}>
                Search Error
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
              <button
                onClick={() => { setStatus('idle'); setError(null); }}
                className="btn-secondary mt-3"
                style={{ padding: '0.375rem 1rem', fontSize: '0.75rem' }}
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {status === 'complete' && result && (
        <ResultsPanel data={result} />
      )}
    </div>
  );
}
