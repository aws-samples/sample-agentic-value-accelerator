/**
 * MultiAgentOrchestrator — Chain multiple governance agents for complex workflows.
 * Pre-built workflows: "Prepare for Exam", "Deploy Readiness", "Full Assessment".
 */

import { useState } from 'react';
import { Icon, type IconName } from './icons';
import { downloadJSON, dateStamp } from './exportUtils';

interface WorkflowStep {
  agent: string;
  label: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

interface Workflow {
  id: string;
  name: string;
  icon: IconName;
  color: string;
  description: string;
  steps: WorkflowStep[];
}

const WORKFLOWS: Workflow[] = [
  {
    id: 'exam-prep',
    name: 'Prepare for Exam',
    icon: 'clipboard-list' as IconName,
    color: '#8b5cf6',
    description: 'Compliance gap analysis → remediation plan → evidence verification',
    steps: [
      { agent: 'compliance-gap', label: 'Gap Analysis', description: 'Run compliance gap analysis against all applicable frameworks', status: 'pending' },
      { agent: 'governance-automation', label: 'Remediation Plan', description: 'Generate remediation plan based on compliance gaps', status: 'pending' },
      { agent: 'trust-stack', label: 'Evidence Check', description: 'Verify evidence completeness across all 7 trust layers', status: 'pending' },
    ],
  },
  {
    id: 'deploy-readiness',
    name: 'Deploy Readiness',
    icon: 'rocket-launch' as IconName,
    color: '#10b981',
    description: 'Security scan → gate validation → infrastructure check',
    steps: [
      { agent: 'security-operations', label: 'Security Scan', description: 'Run pre-deployment security assessment', status: 'pending' },
      { agent: 'governance-automation', label: 'Gate Validation', description: 'Validate all stage gates for deployment', status: 'pending' },
      { agent: 'continuous-monitoring', label: 'Infra Check', description: 'Verify monitoring infrastructure is ready', status: 'pending' },
    ],
  },
  {
    id: 'full-assessment',
    name: 'Full Assessment',
    icon: 'viewfinder-circle' as IconName,
    color: '#3b82f6',
    description: 'Trust stack → compliance → security → governance review',
    steps: [
      { agent: 'trust-stack', label: 'Trust Stack', description: 'Run full 7-layer trust assessment', status: 'pending' },
      { agent: 'compliance-gap', label: 'Compliance', description: 'Check compliance across SR 26-2, OSFI E-23, and mapped frameworks', status: 'pending' },
      { agent: 'security-operations', label: 'Security', description: 'Run security posture check — GuardDuty, Security Hub, IAM', status: 'pending' },
      { agent: 'governance-automation', label: 'Governance', description: 'Generate full governance report with action items', status: 'pending' },
    ],
  },
];

interface MultiAgentOrchestratorProps {
  compact?: boolean;
  useCaseId?: string;
}

export default function MultiAgentOrchestrator({ compact = false, useCaseId }: MultiAgentOrchestratorProps) {
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [stepResults, setStepResults] = useState<string[]>([]);

  const runWorkflow = async (workflow: Workflow) => {
    setActiveWorkflow(workflow);
    setCurrentStep(0);
    setStepResults([]);
    setRunning(true);

    // Simulate running each step
    for (let i = 0; i < workflow.steps.length; i++) {
      setCurrentStep(i);

      // Simulate agent execution (2-4 seconds per step)
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

      // Simulate result
      const results = [
        `✓ ${workflow.steps[i].label} completed successfully`,
        `Found 3 items requiring attention`,
        `Generated recommendations for ${useCaseId || 'system'}`,
      ];
      setStepResults(prev => [...prev, results[i % results.length]]);
    }

    setCurrentStep(workflow.steps.length);
    setRunning(false);
  };

  const reset = () => {
    setActiveWorkflow(null);
    setCurrentStep(-1);
    setStepResults([]);
    setRunning(false);
  };

  const exportReport = () => {
    if (!activeWorkflow) return;
    const report = {
      workflow: activeWorkflow.name,
      description: activeWorkflow.description,
      useCaseId: useCaseId ?? null,
      generatedAt: new Date().toISOString(),
      steps: activeWorkflow.steps.map((s, i) => ({
        agent: s.agent,
        step: s.label,
        description: s.description,
        result: stepResults[i] ?? null,
      })),
    };
    const slug = activeWorkflow.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadJSON(report, `agent-workflow-${slug}-${dateStamp()}.json`);
  };

  if (compact) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="cpu-chip" className="w-5 h-5" />
          <span className="text-sm font-semibold text-slate-900">Multi-Agent Workflows</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
            3 available
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {WORKFLOWS.map(wf => (
            <button
              key={wf.id}
              onClick={() => runWorkflow(wf)}
              disabled={running}
              className="p-2 bg-slate-50 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-100 transition-colors text-left disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon name={wf.icon} className="w-4 h-4" />
                <span className="text-xs font-medium text-slate-800">{wf.name}</span>
              </div>
              <div className="text-[9px] text-slate-500">{wf.steps.length} agents</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="cpu-chip" className="w-5 h-5" />
          <div className="text-sm font-semibold text-slate-900">Multi-Agent Orchestrator</div>
          {useCaseId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
              {useCaseId}
            </span>
          )}
        </div>
        {running && (
          <span className="text-[10px] px-2 py-1 rounded bg-blue-100 text-blue-700 font-medium animate-pulse">
            Running...
          </span>
        )}
      </div>

      {!activeWorkflow ? (
        /* Workflow Selector */
        <div className="grid grid-cols-3 gap-4">
          {WORKFLOWS.map(wf => (
            <button
              key={wf.id}
              onClick={() => runWorkflow(wf)}
              className="p-4 bg-slate-50 rounded-xl border-2 border-slate-100 hover:border-slate-300 transition-all text-left group"
              style={{ borderTopColor: wf.color, borderTopWidth: '3px' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon name={wf.icon} className="w-6 h-6" />
                <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-900">
                  {wf.name}
                </span>
              </div>
              <div className="text-xs text-slate-500 mb-3">{wf.description}</div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-400">{wf.steps.length} agents chained</span>
                <span className="text-slate-300">→</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* Active Workflow Progress */
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xl">{activeWorkflow.icon}</span>
            <span className="text-sm font-semibold" style={{ color: activeWorkflow.color }}>
              {activeWorkflow.name}
            </span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${(currentStep / activeWorkflow.steps.length) * 100}%`,
                  backgroundColor: currentStep >= activeWorkflow.steps.length ? '#10b981' : activeWorkflow.color,
                }}
              />
            </div>
            <span className="text-xs text-slate-500">
              {Math.min(currentStep + 1, activeWorkflow.steps.length)}/{activeWorkflow.steps.length}
            </span>
          </div>

          <div className="space-y-2">
            {activeWorkflow.steps.map((step, i) => {
              const isActive = i === currentStep && running;
              const isDone = i < currentStep || (i === currentStep && !running && stepResults[i]);
              const isPending = i > currentStep;

              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                    isActive ? 'bg-blue-50 border border-blue-200' :
                    isDone ? 'bg-emerald-50 border border-emerald-200' :
                    'bg-slate-50 border border-slate-100'
                  }`}
                  style={{ opacity: isPending ? 0.5 : 1 }}
                >
                  <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                    {isActive && (
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    )}
                    {isDone && (
                      <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {isPending && (
                      <div className="w-3 h-3 rounded-full bg-slate-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isActive ? 'text-blue-700' : isDone ? 'text-emerald-700' : 'text-slate-600'}`}>
                        {step.label}
                      </span>
                      <span className="text-[10px] text-slate-400">{step.agent}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{step.description}</div>
                    {stepResults[i] && (
                      <div className="text-xs text-emerald-600 mt-1 font-medium">{stepResults[i]}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Completion */}
          {!running && currentStep >= activeWorkflow.steps.length && (
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-semibold text-emerald-700">
                  {activeWorkflow.name} completed
                </span>
                <span className="text-xs text-emerald-600">
                  — {activeWorkflow.steps.length} agents executed
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-4 justify-end">
            <button
              onClick={reset}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {running ? 'Cancel' : 'Back to Workflows'}
            </button>
            {!running && currentStep >= activeWorkflow.steps.length && (
              <button
                onClick={exportReport}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
              >
                Export Report
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
