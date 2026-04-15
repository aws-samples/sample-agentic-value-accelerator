// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { GenerationResponse } from '../types';

/* ---- Metric Card ---- */

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div
        className="text-lg font-bold font-mono"
        style={{ color, textShadow: `0 0 10px ${color}40` }}
      >
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

function Collapsible({ title, children, defaultOpen = false, delay = 0, accentColor = '#8B5CF6' }: { title: string; children: React.ReactNode; defaultOpen?: boolean; delay?: number; accentColor?: string }) {
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
  response: GenerationResponse;
  config: RuntimeConfig;
  elapsed: number;
}) {
  const { requirement_analysis: _ra = {}, scaffolded_code: _sc = {}, test_output: _to = {}, summary = '' } = response as any;
  const requirement_analysis = { functional_requirements: [], non_functional_requirements: [], dependencies: [], data_models: [], api_contracts: [], risks: [], ..._ra };
  const scaffolded_code = { files_generated: 0, project_structure: [], design_patterns_applied: [], configuration_files: [], ..._sc };
  const test_output = { unit_tests_generated: 0, integration_tests_generated: 0, test_frameworks_used: [], test_fixtures_created: [], ..._to };

  return (
    <div className="space-y-5">
      {/* ===== Hero — Generation Complete ===== */}
      <div
        className="glass animate-fade-in-scale p-6"
        style={{
          background: 'linear-gradient(135deg, rgba(31,41,55,0.6) 0%, rgba(139,92,246,0.02) 50%, rgba(96,165,250,0.02) 100%)',
          borderColor: 'rgba(139,92,246,0.15)',
          boxShadow: '0 0 40px rgba(139,92,246,0.05)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: '#34D399', boxShadow: '0 0 8px #34D399' }} />
            <span
              className="text-xs font-mono uppercase tracking-widest"
              style={{ color: '#8B5CF6', textShadow: '0 0 8px rgba(139,92,246,0.3)' }}
            >
              Generation Complete
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {response.generation_id?.slice(0, 8) || "N/A"} &bull; {elapsed}s
          </span>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <MetricCard label="Project" value={response.project_id} color="#8B5CF6" />
          <MetricCard label="Files Generated" value={scaffolded_code.files_generated} color="#60A5FA" />
          <MetricCard label="Tests Created" value={test_output.unit_tests_generated + test_output.integration_tests_generated} color="#34D399" />
          <MetricCard label="Coverage" value={test_output.test_coverage_estimate} color="#FBBF24" />
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

      {/* ===== Requirement Analysis ===== */}
      <Collapsible title="Requirement Analysis" defaultOpen={true} delay={0.1} accentColor="#8B5CF6">
        <div className="space-y-6">
          {requirement_analysis.functional_requirements.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#8B5CF6' }}>Functional Requirements</h4>
              <ListSection items={requirement_analysis.functional_requirements} color="#8B5CF6" />
            </div>
          )}
          {requirement_analysis.non_functional_requirements.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#A78BFA' }}>Non-Functional Requirements</h4>
              <ListSection items={requirement_analysis.non_functional_requirements} color="#A78BFA" />
            </div>
          )}
          {requirement_analysis.dependencies.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#60A5FA' }}>Dependencies</h4>
              <div className="flex flex-wrap gap-2">
                {requirement_analysis.dependencies.map((dep, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono"
                    style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', color: '#60A5FA' }}
                  >
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}
          {requirement_analysis.data_models.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#34D399' }}>Data Models</h4>
              <ListSection items={requirement_analysis.data_models} color="#34D399" />
            </div>
          )}
          {requirement_analysis.api_contracts.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#FBBF24' }}>API Contracts</h4>
              <ListSection items={requirement_analysis.api_contracts} color="#FBBF24" />
            </div>
          )}
          {requirement_analysis.risks.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#ff3366' }}>Risks</h4>
              <ListSection items={requirement_analysis.risks} color="#ff3366" />
            </div>
          )}
        </div>
      </Collapsible>

      {/* ===== Scaffolded Code ===== */}
      <Collapsible title="Scaffolded Code" defaultOpen={true} delay={0.15} accentColor="#60A5FA">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <MetricCard label="Files Generated" value={scaffolded_code.files_generated} color="#60A5FA" />
            <MetricCard label="Code Quality" value={scaffolded_code.code_quality} color="#34D399" />
          </div>
          {scaffolded_code.project_structure.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#60A5FA' }}>Project Structure</h4>
              <div className="code-block">
                {scaffolded_code.project_structure.map((line, i) => (
                  <div key={i} style={{ color: 'var(--text-secondary)' }}>{line}</div>
                ))}
              </div>
            </div>
          )}
          {scaffolded_code.design_patterns_applied.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#A78BFA' }}>Design Patterns Applied</h4>
              <div className="flex flex-wrap gap-2">
                {scaffolded_code.design_patterns_applied.map((pattern, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono"
                    style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', color: '#A78BFA' }}
                  >
                    {pattern}
                  </span>
                ))}
              </div>
            </div>
          )}
          {scaffolded_code.configuration_files.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#FBBF24' }}>Configuration Files</h4>
              <ListSection items={scaffolded_code.configuration_files} color="#FBBF24" />
            </div>
          )}
        </div>
      </Collapsible>

      {/* ===== Test Output ===== */}
      <Collapsible title="Test Output" defaultOpen={true} delay={0.2} accentColor="#34D399">
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Unit Tests" value={test_output.unit_tests_generated} color="#34D399" />
            <MetricCard label="Integration Tests" value={test_output.integration_tests_generated} color="#60A5FA" />
            <MetricCard label="Coverage Est." value={test_output.test_coverage_estimate} color="#FBBF24" />
          </div>
          {test_output.test_frameworks_used.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#34D399' }}>Test Frameworks</h4>
              <div className="flex flex-wrap gap-2">
                {test_output.test_frameworks_used.map((fw, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono"
                    style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', color: '#34D399' }}
                  >
                    {fw}
                  </span>
                ))}
              </div>
            </div>
          )}
          {test_output.test_fixtures_created.length > 0 && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#60A5FA' }}>Test Fixtures</h4>
              <ListSection items={test_output.test_fixtures_created} color="#60A5FA" />
            </div>
          )}
          {test_output.manual_testing_notes && (
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider mb-3" style={{ color: '#FBBF24' }}>Manual Testing Notes</h4>
              <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
                {test_output.manual_testing_notes}
              </div>
            </div>
          )}
        </div>
      </Collapsible>

      {/* ===== Raw Agent Analysis ===== */}
      {response.raw_analysis && (
        <Collapsible title="Detailed Agent Reports" delay={0.3} accentColor="#8B5CF6">
          <div className="space-y-4">
            {Object.entries(response.raw_analysis).map(([key, agentData]) => {
              if (!agentData) return null;
              const agentMeta = config.agents.find((a) => a.id === agentData.agent) || { name: agentData.agent || key };
              const content = agentData.analysis || agentData.assessment || '';
              const colorMap: Record<string, string> = {
                requirement_analyst: '#8B5CF6',
                code_scaffolder: '#60A5FA',
                test_generator: '#34D399',
              };
              const color = colorMap[agentData.agent] || '#8B5CF6';

              return (
                <div
                  key={key}
                  className="rounded-xl p-5"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${color}15`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                    <h4
                      className="text-xs font-mono font-bold uppercase tracking-wider"
                      style={{ color, textShadow: `0 0 8px ${color}40` }}
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
