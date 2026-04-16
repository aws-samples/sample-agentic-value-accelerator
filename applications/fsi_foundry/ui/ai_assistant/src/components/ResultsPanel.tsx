// @ts-nocheck
import { useState } from 'react';
import type { AssistantResponse } from '../types';

interface Props {
  response: AssistantResponse;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'COMPLETED' ? 'status-completed' :
    status === 'IN_PROGRESS' ? 'status-in-progress' :
    'status-failed';
  return <span className={`status-badge ${cls}`}>{status.replace('_', ' ')}</span>;
}

function PriorityIndicator({ priority }: { priority: string }) {
  const cls = priority.toLowerCase() as 'low' | 'medium' | 'high' | 'urgent';
  const labels: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--gray-600)' }}>
      <span className={`priority-dot ${cls}`} />
      {labels[priority] || priority}
    </span>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function ResultsPanelInternal({ response }: Props) {
  const [rawExpanded, setRawExpanded] = useState(false);
  const { result: _res = {}, recommendations = [], summary = '', raw_analysis = {} } = response as any;
  const result = { output_data: {}, actions_performed: [], follow_up_items: [], ..._res };

  return (
    <div className="space-y-4">
      {/* Task Header */}
      <div className="animate-fade-slide-up card" style={{ padding: '1.25rem 1.5rem' }}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--gray-400)' }}>Task ID</div>
            <div className="text-sm font-mono font-semibold" style={{ color: 'var(--purple-700)' }}>{response.task_id}</div>
          </div>
          <div>
            <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--gray-400)' }}>Employee</div>
            <div className="text-sm font-mono font-semibold" style={{ color: 'var(--black-near)' }}>{response.employee_id}</div>
          </div>
          <div>
            <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--gray-400)' }}>Timestamp</div>
            <div className="text-sm font-mono" style={{ color: 'var(--gray-600)' }}>{response.timestamp}</div>
          </div>
        </div>
      </div>

      {/* Task Result */}
      {result && (
        <div className="animate-fade-slide-up stagger-1 card" style={{ padding: '1.5rem' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--black-near)' }}>Task Result</h3>
            <div className="flex items-center gap-3">
              <PriorityIndicator priority={result.priority} />
              <StatusBadge status={result.status} />
            </div>
          </div>

          {/* Output Data */}
          {Object.keys(result.output_data).length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--gray-400)' }}>
                Output Data
              </div>
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: '1px solid var(--gray-200)' }}
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '35%' }}>Field</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.output_data).map(([key, value]) => (
                      <tr key={key}>
                        <td className="font-mono text-xs font-medium" style={{ color: 'var(--purple-700)' }}>{key}</td>
                        <td className="font-mono text-xs" style={{ color: 'var(--gray-700)' }}>
                          {typeof value === 'object' ? (
                            <pre className="whitespace-pre-wrap m-0">{formatValue(value)}</pre>
                          ) : (
                            formatValue(value)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions Performed */}
          {result.actions_performed.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--gray-400)' }}>
                Actions Performed
              </div>
              <div className="space-y-1.5">
                {result.actions_performed.map((action, i) => (
                  <div
                    key={i}
                    className="animate-task-slide flex items-start gap-2.5 px-3 py-2 rounded-lg"
                    style={{ animationDelay: `${i * 0.08}s`, background: 'var(--gray-50)' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" className="check-anim flex-shrink-0 mt-0.5" style={{ animationDelay: `${i * 0.1 + 0.3}s` }}>
                      <path d="M5 13l4 4L19 7" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-sm" style={{ color: 'var(--gray-700)' }}>{action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Follow-up Items */}
          {result.follow_up_items.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--gray-400)' }}>
                Follow-up Items
              </div>
              <div className="space-y-1.5">
                {result.follow_up_items.map((item, i) => (
                  <div
                    key={i}
                    className="animate-task-slide flex items-start gap-2.5 px-3 py-2 rounded-lg"
                    style={{ animationDelay: `${i * 0.08}s`, background: 'rgba(124,58,237,0.03)' }}
                  >
                    <div
                      className="w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center"
                      style={{ border: '1.5px solid var(--purple-400)' }}
                    />
                    <span className="text-sm" style={{ color: 'var(--gray-700)' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="animate-fade-slide-up stagger-2 card" style={{ padding: '1.5rem' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--black-near)' }}>Recommendations</h3>
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <div
                key={i}
                className="animate-task-slide flex items-start gap-2.5"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold"
                  style={{
                    background: 'rgba(124,58,237,0.08)',
                    color: 'var(--purple-600)',
                  }}
                >
                  {i + 1}
                </div>
                <span className="text-sm" style={{ color: 'var(--gray-700)', lineHeight: '1.5' }}>{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="animate-fade-slide-up stagger-3 card" style={{ padding: '1.5rem' }}>
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--black-near)' }}>Summary</h3>
          <p className="text-sm" style={{ color: 'var(--gray-600)', lineHeight: '1.7' }}>{summary}</p>
        </div>
      )}

      {/* Raw Analysis (Expandable) */}
      {Object.keys(raw_analysis).length > 0 && (
        <div className="animate-fade-slide-up stagger-4 card" style={{ padding: '0' }}>
          <button
            className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer bg-transparent border-0"
            onClick={() => setRawExpanded(!rawExpanded)}
            style={{ fontFamily: 'inherit' }}
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--black-near)' }}>Raw Agent Analysis</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--gray-400)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transition: 'transform 0.2s ease',
                transform: rawExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {rawExpanded && (
            <div className="animate-slide-down px-6 pb-4">
              <div className="divider mb-4" />
              {Object.entries(raw_analysis).map(([key, analysis]) => (
                <div key={key} className="mb-4 last:mb-0">
                  <div
                    className="text-xs font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--purple-600)' }}
                  >
                    {analysis?.agent || key}
                  </div>
                  <pre
                    className="text-xs font-mono p-3 rounded-lg overflow-x-auto"
                    style={{
                      background: 'var(--gray-50)',
                      color: 'var(--gray-700)',
                      border: '1px solid var(--gray-200)',
                      lineHeight: '1.6',
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(analysis, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
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
