// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { ProcessingResponse } from '../types';

/* ---- Validation Status Badge ---- */

function ValidationBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; border: string; text: string; label: string; icon: string }> = {
    PASSED: {
      bg: 'rgba(34,197,94,0.06)',
      border: 'rgba(34,197,94,0.2)',
      text: 'var(--green-500)',
      label: 'Passed',
      icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    FAILED: {
      bg: 'rgba(239,68,68,0.06)',
      border: 'rgba(239,68,68,0.2)',
      text: 'var(--red-500)',
      label: 'Failed',
      icon: 'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    PARTIAL: {
      bg: 'rgba(245,158,11,0.06)',
      border: 'rgba(245,158,11,0.2)',
      text: 'var(--amber-500)',
      label: 'Partial',
      icon: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
    },
  };
  const c = cfg[status] || cfg.PARTIAL;

  return (
    <div
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wider animate-fade-in-scale"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={c.icon} />
      </svg>
      {c.label}
    </div>
  );
}

/* ---- Classification Tag ---- */

function ClassificationTag({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        className="tag"
        style={{
          background: `${color}08`,
          color,
          border: `1px solid ${color}20`,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ---- Confidence Meter ---- */

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'var(--green-500)' : pct >= 60 ? 'var(--amber-500)' : 'var(--red-500)';

  return (
    <div className="flex items-center gap-3">
      <div className="confidence-bar flex-1">
        <div className="confidence-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-sm font-bold font-mono tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  );
}

/* ---- Collapsible Section ---- */

function Collapsible({ title, children, defaultOpen = false, delay = 0 }: { title: string; children: React.ReactNode; defaultOpen?: boolean; delay?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="surface animate-fade-in p-6" style={{ animationDelay: `${delay}s` }}>
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-left cursor-pointer">
        <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{title}</h3>
        <svg
          className="w-4 h-4 transition-transform"
          style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>{children}</div>}
    </div>
  );
}

/* ============================================
   MAIN COMPONENT
   ============================================ */

function ResultsPanelInternal({
  response,
  config,
  elapsed,
}: {
  response: ProcessingResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { classification: _cls = {}, extracted_data: _ed = {}, validation_result: _vr = {}, summary = '' } = response as any;
  const classification = { document_type: '', confidence: 0, ..._cls };
  const extracted_data = { fields: {}, entities: [], amounts: [], dates: [], ..._ed };
  const validation_result = { checks_passed: [], checks_failed: [], ..._vr };

  return (
    <div className="space-y-5">
      {/* ===== Hero -- Processing Complete ===== */}
      <div
        className="surface animate-fade-in-scale p-6"
        style={{
          borderColor: 'rgba(124, 58, 237, 0.15)',
          boxShadow: 'var(--shadow-violet)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--green-500)' }} />
            <span
              className="text-xs font-mono uppercase tracking-widest"
              style={{ color: 'var(--violet-700)' }}
            >
              Processing Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.processing_id?.slice(0, 8) || "N/A"} &bull; {elapsed}s
          </span>
        </div>

        {/* Validation Status */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <ValidationBadge status={validation_result.status} />
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Document</div>
            <div className="text-base font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{response.document_id}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Type</div>
            <div className="text-base font-bold" style={{ color: 'var(--violet-700)' }}>{classification.type}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Checks Passed</div>
            <div className="text-base font-bold font-mono" style={{ color: 'var(--green-500)' }}>{validation_result.checks_passed.length}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Checks Failed</div>
            <div className="text-base font-bold font-mono" style={{ color: validation_result.checks_failed.length > 0 ? 'var(--red-500)' : 'var(--green-500)' }}>
              {validation_result.checks_failed.length}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div
          className="text-sm leading-relaxed p-4 rounded-xl"
          style={{ background: 'var(--slate-100)', color: 'var(--text-secondary)' }}
        >
          {summary}
        </div>
      </div>

      {/* ===== Classification ===== */}
      <div className="surface animate-fade-in p-6" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--violet-700)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
            </svg>
          </div>
          <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Classification</h3>
        </div>

        <div className="space-y-4">
          {/* Confidence meter */}
          <div>
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Confidence</div>
            <ConfidenceMeter value={classification.confidence} />
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-3">
            <ClassificationTag label="Type" value={classification.type} color="#7C3AED" />
            <ClassificationTag label="Jurisdiction" value={classification.jurisdiction} color="#3B82F6" />
            <ClassificationTag label="Regulatory" value={classification.regulatory_relevance} color="#22C55E" />
          </div>
        </div>
      </div>

      {/* ===== Extracted Data ===== */}
      <div className="surface animate-fade-in p-6" style={{ animationDelay: '0.15s' }}>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.08)', color: '#3B82F6' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375" />
            </svg>
          </div>
          <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Extracted Data</h3>
        </div>

        {/* Fields */}
        {extracted_data.fields && Object.keys(extracted_data.fields).length > 0 && (
          <div className="mb-5">
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Fields</div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {Object.entries(extracted_data.fields).map(([key, value], i) => (
                <div
                  key={key}
                  className="extraction-row"
                  style={{ borderBottom: i < Object.keys(extracted_data.fields).length - 1 ? '1px solid var(--border)' : 'none' }}
                >
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{key}</span>
                  <span className="extraction-highlight">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Entities */}
        {extracted_data.entities && extracted_data.entities.length > 0 && (
          <div className="mb-5">
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Entities</div>
            <div className="flex flex-wrap gap-2">
              {extracted_data.entities.map((entity, i) => (
                <span key={i} className="tag tag-violet">{entity}</span>
              ))}
            </div>
          </div>
        )}

        {/* Amounts */}
        {extracted_data.amounts && extracted_data.amounts.length > 0 && (
          <div className="mb-5">
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Amounts</div>
            <div className="flex flex-wrap gap-2">
              {extracted_data.amounts.map((amount, i) => (
                <span
                  key={i}
                  className="tag"
                  style={{
                    background: 'rgba(59,130,246,0.06)',
                    color: '#3B82F6',
                    border: '1px solid rgba(59,130,246,0.15)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {amount}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Dates */}
        {extracted_data.dates && extracted_data.dates.length > 0 && (
          <div>
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Dates</div>
            <div className="flex flex-wrap gap-2">
              {extracted_data.dates.map((date, i) => (
                <span key={i} className="tag tag-slate" style={{ fontFamily: 'var(--font-mono)' }}>{date}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== Validation Results ===== */}
      <div className="surface animate-fade-in p-6" style={{ animationDelay: '0.2s' }}>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.08)', color: 'var(--green-500)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Validation Results</h3>
        </div>

        {/* Checks Passed */}
        {validation_result.checks_passed.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--green-500)' }}>Passed</div>
            <div className="space-y-1">
              {validation_result.checks_passed.map((check, i) => (
                <div key={i} className="check-item" style={{ animationDelay: `${0.3 + i * 0.05}s` }}>
                  <svg className="w-4 h-4 shrink-0 check-passed" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{check}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checks Failed */}
        {validation_result.checks_failed.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--red-500)' }}>Failed</div>
            <div className="space-y-1">
              {validation_result.checks_failed.map((check, i) => (
                <div key={i} className="check-item">
                  <svg className="w-4 h-4 shrink-0 check-failed" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{check}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Validation Notes */}
        {validation_result.notes && (
          <div
            className="p-4 rounded-xl text-sm leading-relaxed"
            style={{ background: 'var(--slate-100)', color: 'var(--text-secondary)' }}
          >
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Notes</div>
            {validation_result.notes}
          </div>
        )}
      </div>

      {/* ===== Raw Agent Analysis ===== */}
      {response.raw_analysis && (
        <Collapsible title="Detailed Agent Reports" delay={0.3}>
          <div className="space-y-4">
            {Object.entries(response.raw_analysis).map(([key, agentData]) => {
              if (!agentData) return null;
              const agentMeta = config.agents.find((a) => a.id === agentData.agent) || { name: agentData.agent || key };
              const content = agentData.analysis || agentData.assessment || '';
              const colorMap: Record<string, string> = {
                document_classifier: '#7C3AED',
                data_extractor: '#3B82F6',
                validation_agent: '#22C55E',
              };
              const color = colorMap[agentData.agent] || '#7C3AED';

              return (
                <div
                  key={key}
                  className="rounded-xl p-5"
                  style={{
                    background: `${color}04`,
                    border: `1px solid ${color}12`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <h4
                      className="text-xs font-mono font-bold uppercase tracking-wider"
                      style={{ color }}
                    >
                      {agentMeta.name}
                    </h4>
                  </div>
                  <pre
                    className="text-xs whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto"
                    style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}
                  >
                    {content}
                  </pre>
                </div>
              );
            })}
          </div>
        </Collapsible>
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
