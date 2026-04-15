// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { MainframeMigrationResponse } from '../types';

/* ---- Metric Card ---- */

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-lg font-bold font-mono" style={{ color, textShadow: `0 0 10px ${color}40` }}>
        {value}
      </div>
    </div>
  );
}

/* ---- List Section ---- */

function ListSection({ items, color }: { items: string[]; color: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-start gap-3 p-3 rounded-xl animate-slide-right"
          style={{
            background: `${color}06`,
            border: `1px solid ${color}12`,
            animationDelay: `${0.1 + i * 0.05}s`,
          }}
        >
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: `${color}10`, border: `1px solid ${color}25` }}
          >
            <span className="text-[10px] font-mono font-bold" style={{ color }}>{i + 1}</span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item}</p>
        </div>
      ))}
    </div>
  );
}

/* ---- Collapsible Section ---- */

function Collapsible({ title, children, defaultOpen = false, delay = 0, accentColor = '#00FF41' }: { title: string; children: React.ReactNode; defaultOpen?: boolean; delay?: number; accentColor?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass animate-fade-in p-6" style={{ animationDelay: `${delay}s` }}>
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-left">
        <h3 className="text-sm font-mono uppercase tracking-widest" style={{ color: accentColor }}>{title}</h3>
        <svg
          className="w-4 h-4 transition-transform"
          style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${accentColor}15` }}>{children}</div>}
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
  response: MainframeMigrationResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { mainframe_analysis: _ma = {}, business_rules: _br = {}, cloud_code: _cc = {}, summary = '' } = response as any;
  const mainframe_analysis = { dependencies: [], risks: [], total_lines: 0, complexity_level: '', programs_analyzed: 0, jcl_jobs_analyzed: 0, copybooks_found: 0, ..._ma };
  const business_rules = { validation_rules: [], computational_formulas: [], manual_review_items: [], ..._br };
  const cloud_code = { services_mapped: [], ..._cc };

  return (
    <div className="space-y-5">
      {/* ===== Hero — Migration Complete ===== */}
      <div
        className="glass animate-fade-in-scale p-6"
        style={{
          background: 'linear-gradient(135deg, rgba(5,10,5,0.6) 0%, rgba(0,255,65,0.02) 50%, rgba(255,176,0,0.02) 100%)',
          borderColor: 'rgba(0,255,65,0.15)',
          boxShadow: '0 0 40px rgba(0,255,65,0.05)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: '#00FF41', boxShadow: '0 0 8px #00FF41' }} />
            <span className="text-xs font-mono uppercase tracking-widest" style={{ color: '#00FF41', textShadow: '0 0 8px rgba(0,255,65,0.3)' }}>
              Migration Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.migration_id?.slice(0, 8) || "N/A"} &bull; {elapsed}s
          </span>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <MetricCard label="Programs" value={mainframe_analysis.programs_analyzed} color="#00FF41" />
          <MetricCard label="Rules Extracted" value={business_rules.rules_extracted} color="#FFB000" />
          <MetricCard label="Files Generated" value={cloud_code.files_generated} color="#64748B" />
          <MetricCard label="Equivalence" value={cloud_code.functional_equivalence_score} color="#00FF41" />
        </div>

        {/* Summary */}
        <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
          {summary.split('\n').map((line, i) => {
            if (line.startsWith('**') && line.endsWith('**')) {
              return <p key={i} className="font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>{line.replace(/\*\*/g, '')}</p>;
            }
            if (line.startsWith('- **')) {
              const parts = line.replace(/^- /, '').split('**');
              return (
                <p key={i} className="ml-4 mb-0.5">
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{parts[1]}</span>
                  {parts[2]}
                </p>
              );
            }
            if (line.trim() === '') return <br key={i} />;
            return <p key={i} className="mb-0.5">{line.replace(/\*\*/g, '')}</p>;
          })}
        </div>
      </div>

      {/* ===== Mainframe Analysis ===== */}
      <Collapsible title="Mainframe Analysis" defaultOpen={true} delay={0.1} accentColor="#00FF41">
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Programs" value={mainframe_analysis.programs_analyzed} color="#00FF41" />
            <MetricCard label="JCL Jobs" value={mainframe_analysis.jcl_jobs_analyzed} color="#39FF14" />
            <MetricCard label="Copybooks" value={mainframe_analysis.copybooks_found} color="#00FF41" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard label="Total Lines" value={mainframe_analysis.total_lines.toLocaleString()} color="#00FF41" />
            <MetricCard label="Complexity" value={mainframe_analysis.complexity_level} color="#FFB000" />
          </div>
          {mainframe_analysis.dependencies.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#00FF41' }}>Dependencies</h4>
              <div className="flex flex-wrap gap-2">
                {mainframe_analysis.dependencies.map((dep, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono"
                    style={{ background: 'rgba(0,255,65,0.06)', border: '1px solid rgba(0,255,65,0.15)', color: '#00FF41' }}
                  >
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}
          {mainframe_analysis.risks.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#ff3366' }}>Risks</h4>
              <ListSection items={mainframe_analysis.risks} color="#ff3366" />
            </div>
          )}
        </div>
      </Collapsible>

      {/* ===== Business Rules ===== */}
      <Collapsible title="Business Rules" defaultOpen={true} delay={0.15} accentColor="#FFB000">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <MetricCard label="Rules Extracted" value={business_rules.rules_extracted} color="#FFB000" />
            <MetricCard label="Confidence" value={business_rules.extraction_confidence} color="#00FF41" />
          </div>
          {business_rules.validation_rules.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#FFB000' }}>Validation Rules</h4>
              <ListSection items={business_rules.validation_rules} color="#FFB000" />
            </div>
          )}
          {business_rules.computational_formulas.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#39FF14' }}>Computational Formulas</h4>
              <ListSection items={business_rules.computational_formulas} color="#39FF14" />
            </div>
          )}
          {business_rules.manual_review_items.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#ff3366' }}>Manual Review Items</h4>
              <ListSection items={business_rules.manual_review_items} color="#ff3366" />
            </div>
          )}
        </div>
      </Collapsible>

      {/* ===== Cloud Code ===== */}
      <Collapsible title="Cloud Code Output" defaultOpen={true} delay={0.2} accentColor="#64748B">
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Files Generated" value={cloud_code.files_generated} color="#64748B" />
            <MetricCard label="Quality Score" value={cloud_code.generation_quality_score} color="#00FF41" />
            <MetricCard label="Equivalence" value={cloud_code.functional_equivalence_score} color="#FFB000" />
          </div>
          <div>
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#64748B' }}>Target Language</h4>
            <span
              className="px-3 py-1.5 rounded-lg text-xs font-mono"
              style={{ background: 'rgba(100,116,139,0.06)', border: '1px solid rgba(100,116,139,0.15)', color: '#64748B' }}
            >
              {cloud_code.target_language}
            </span>
          </div>
          {cloud_code.services_mapped.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#00FF41' }}>Services Mapped</h4>
              <div className="flex flex-wrap gap-2">
                {cloud_code.services_mapped.map((svc, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono"
                    style={{ background: 'rgba(0,255,65,0.06)', border: '1px solid rgba(0,255,65,0.15)', color: '#00FF41' }}
                  >
                    {svc}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Collapsible>

      {/* ===== Raw Agent Analysis ===== */}
      {response.raw_analysis && (
        <Collapsible title="Detailed Agent Reports" delay={0.3} accentColor="#00FF41">
          <div className="space-y-4">
            {Object.entries(response.raw_analysis).map(([key, agentData]) => {
              if (!agentData) return null;
              const agentMeta = config.agents.find((a) => a.id === agentData.agent) || { name: agentData.agent || key };
              const content = agentData.analysis || agentData.assessment || '';
              const colorMap: Record<string, string> = {
                mainframe_analyzer: '#00FF41',
                business_rule_extractor: '#FFB000',
                cloud_code_generator: '#64748B',
              };
              const color = colorMap[agentData.agent] || '#00FF41';

              return (
                <div
                  key={key}
                  className="rounded-xl p-5"
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${color}15`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider" style={{ color, textShadow: `0 0 8px ${color}40` }}>
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
