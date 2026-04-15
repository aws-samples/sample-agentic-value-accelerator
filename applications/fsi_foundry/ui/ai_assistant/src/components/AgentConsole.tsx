// @ts-nocheck
import { useState } from 'react';
import type { RuntimeConfig } from '../config';
import type { AssistantResponse, ExecutionStatus } from '../types';
import { invokeAgent } from '../api/client';
import ResultsPanel from './ResultsPanel';

interface Props {
  config: RuntimeConfig;
}

const taskTypeIcons: Record<string, JSX.Element> = {
  full: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12l2 2 4-4" />
    </svg>
  ),
  data_lookup: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  ),
  report_generation: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  document_summary: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  task_automation: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  ),
};

const agentStages = [
  { id: 'task_router', name: 'Task Router', desc: 'Classifying request...' },
  { id: 'data_lookup_agent', name: 'Data Lookup', desc: 'Retrieving data...' },
  { id: 'report_generator', name: 'Report Generator', desc: 'Generating output...' },
];

export default function AgentConsole({ config }: Props) {
  const [employeeId, setEmployeeId] = useState('');
  const [taskType, setTaskType] = useState('full');
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [result, setResult] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState(0);

  const canExecute = employeeId.trim().length > 0 && status !== 'running';

  async function handleExecute() {
    if (!canExecute) return;
    setStatus('running');
    setResult(null);
    setError(null);
    setActiveStage(0);

    // Simulate stage progression
    const stageTimer1 = setTimeout(() => setActiveStage(1), 2500);
    const stageTimer2 = setTimeout(() => setActiveStage(2), 5000);

    try {
      const response = await invokeAgent(config, {
        [config.input_schema.id_field]: employeeId.trim(),
        [config.input_schema.type_field]: taskType,
      });
      setResult(response);
      setStatus('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Task execution failed');
      setStatus('error');
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setActiveStage(0);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="animate-fade-slide-up mb-8">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--black-near)' }}>New Task</h1>
        <p className="text-sm" style={{ color: 'var(--gray-500)' }}>Configure and execute a banking assistant task</p>
      </div>

      {/* Input Section */}
      <div className="animate-fade-slide-up stagger-1 card mb-6" style={{ padding: '1.75rem' }}>
        {/* Employee ID */}
        <div className="mb-6">
          <label className="label">{config.input_schema.id_label}</label>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray-400)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 1 0-16 0" />
              </svg>
            </div>
            <input
              type="text"
              className="input-field"
              style={{ paddingLeft: '2.5rem' }}
              placeholder={config.input_schema.id_placeholder}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
            />
          </div>
        </div>

        {/* Task Type Cards */}
        <div className="mb-6">
          <label className="label">{config.input_schema.type_field.replace('_', ' ')}</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {config.input_schema.type_options.map((opt) => (
              <button
                key={opt.value}
                className={`type-card ${taskType === opt.value ? 'selected' : ''}`}
                onClick={() => setTaskType(opt.value)}
              >
                <div
                  className="mb-1.5 flex justify-center"
                  style={{ color: taskType === opt.value ? 'var(--purple-600)' : 'var(--gray-400)' }}
                >
                  {taskTypeIcons[opt.value] || taskTypeIcons['full']}
                </div>
                <div
                  className="text-xs font-medium"
                  style={{ color: taskType === opt.value ? 'var(--purple-700)' : 'var(--gray-600)' }}
                >
                  {opt.label}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Execute Button */}
        <button
          className="btn-primary w-full gap-2"
          disabled={!canExecute}
          onClick={handleExecute}
        >
          {status === 'running' ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Executing...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Execute Task
            </>
          )}
        </button>
      </div>

      {/* Processing State */}
      {status === 'running' && (
        <div className="animate-fade-slide-up card mb-6" style={{ padding: '1.5rem' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full animate-subtle-pulse" style={{ background: 'var(--purple-600)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--black-near)' }}>Processing Task</span>
          </div>

          {/* Agent Stages */}
          <div className="space-y-3 mb-4">
            {agentStages.map((stage, i) => {
              const isActive = i === activeStage;
              const isDone = i < activeStage;
              return (
                <div
                  key={stage.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300"
                  style={{
                    background: isActive ? 'rgba(124,58,237,0.05)' : isDone ? 'rgba(16,185,129,0.04)' : 'transparent',
                    border: isActive ? '1px solid rgba(124,58,237,0.12)' : '1px solid transparent',
                  }}
                >
                  {/* Status indicator */}
                  <div className="flex-shrink-0">
                    {isDone ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" className="check-anim">
                        <path d="M5 13l4 4L19 7" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : isActive ? (
                      <div className="dot-loading flex gap-1">
                        <span /><span /><span />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full" style={{ border: '2px solid var(--gray-300)' }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium"
                      style={{ color: isActive ? 'var(--purple-700)' : isDone ? 'var(--emerald)' : 'var(--gray-400)' }}
                    >
                      {stage.name}
                    </div>
                    {isActive && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--gray-500)' }}>{stage.desc}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="w-full rounded-full overflow-hidden" style={{ height: '3px', background: 'var(--gray-200)' }}>
            <div className="progress-bar" />
          </div>
        </div>
      )}

      {/* Error State */}
      {status === 'error' && error && (
        <div
          className="animate-fade-slide-up card mb-6"
          style={{ padding: '1.25rem', background: 'var(--red-bg)', border: '1px solid var(--red-border)' }}
        >
          <div className="flex items-start gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <div>
              <div className="text-sm font-semibold mb-1" style={{ color: '#DC2626' }}>Task Failed</div>
              <div className="text-sm" style={{ color: '#7F1D1D' }}>{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {status === 'complete' && result && (
        <ResultsPanel response={result} />
      )}
    </div>
  );
}
