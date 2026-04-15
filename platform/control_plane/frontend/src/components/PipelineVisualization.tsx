import { useState, useEffect } from 'react';
import type { DeploymentStatus, StatusHistoryEntry } from '../types';

interface Props {
  status: DeploymentStatus;
  statusHistory: StatusHistoryEntry[];
  failedStage?: string;
  buildId?: string;
}

const STAGES = [
  { key: 'pending', label: 'Created', icon: '1', detail: 'Deployment record created in DynamoDB' },
  { key: 'validating', label: 'Validating', icon: '2', detail: 'Validating template and parameters' },
  { key: 'packaging', label: 'Packaging', icon: '3', detail: 'Packaging template to S3 archive' },
  { key: 'deploying', label: 'Building', icon: '4', detail: 'CodeBuild executing IaC (Terraform/CDK/CFN)' },
  { key: 'verifying', label: 'Verifying', icon: '5', detail: 'Capturing outputs from state backend' },
  { key: 'deployed', label: 'Deployed', icon: '6', detail: 'Infrastructure provisioned successfully' },
] as const;

const DESTROY_STAGES = [
  { key: 'destroying', label: 'Destroying', icon: '1', detail: 'Running terraform destroy / stack delete' },
  { key: 'destroyed', label: 'Destroyed', icon: '2', detail: 'All resources cleaned up' },
] as const;

function getStageIdx(status: string): number {
  return STAGES.findIndex(s => s.key === status);
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return ''; }
}

function getDuration(from: string, to: string): string {
  try {
    const ms = new Date(to).getTime() - new Date(from).getTime();
    if (ms < 1000) return '<1s';
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  } catch { return ''; }
}

export default function PipelineVisualization({ status, statusHistory, failedStage, buildId }: Props) {
  const [pulse, setPulse] = useState(true);
  const isDestroy = status === 'destroying' || status === 'destroyed';
  const isFailed = status === 'failed';
  const isTerminal = ['deployed', 'destroyed', 'failed', 'rolled_back', 'delivered'].includes(status);

  useEffect(() => {
    if (isTerminal) { setPulse(false); return; }
    const t = setInterval(() => setPulse(p => !p), 800);
    return () => clearInterval(t);
  }, [isTerminal]);

  const currentIdx = getStageIdx(status);
  const historyMap = new Map(statusHistory.map(h => [h.status, h]));
  const totalDuration = statusHistory.length >= 2
    ? getDuration(statusHistory[0].timestamp, statusHistory[statusHistory.length - 1].timestamp)
    : '';

  if (isDestroy) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-sm font-semibold text-orange-700 bg-orange-50 px-3 py-1 rounded-xl border border-orange-200">
            Destroy Pipeline
          </span>
        </div>
        {DESTROY_STAGES.map((stage, idx) => {
          const isActive = stage.key === status;
          const isDone = status === 'destroyed' && idx === 0;
          return (
            <div key={stage.key} className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-500 ${
              isActive ? 'bg-orange-50 border border-orange-200' : isDone ? 'bg-slate-50' : 'opacity-40'
            }`}>
              <div className={`text-2xl ${isActive && !isTerminal ? 'animate-bounce' : ''}`}>{stage.icon}</div>
              <div>
                <div className="font-semibold text-slate-900">{stage.label}</div>
                <div className="text-xs text-slate-500">{stage.detail}</div>
              </div>
              {isDone && <span className="ml-auto text-emerald-600 text-sm font-semibold">Done</span>}
              {isActive && !isTerminal && <span className="ml-auto"><Spinner /></span>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header with total duration */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {!isTerminal && <span className={`inline-block w-2 h-2 rounded-full bg-blue-500 ${pulse ? 'opacity-100' : 'opacity-30'} transition-opacity`} />}
          <span className="text-sm font-semibold text-slate-700">
            {isFailed ? 'Pipeline Failed' : isTerminal ? 'Pipeline Complete' : 'Pipeline Running'}
          </span>
        </div>
        {totalDuration && (
          <span className="text-xs text-slate-400 font-medium">Total: {totalDuration}</span>
        )}
      </div>

      {/* Flow visualization */}
      <div className="relative">
        {STAGES.map((stage, idx) => {
          const entry = historyMap.get(stage.key);
          const isActive = stage.key === status;
          const isDone = currentIdx > idx || (status === 'deployed' && idx <= getStageIdx('deployed'));
          const isFailedHere = isFailed && failedStage && (
            (failedStage === 'ValidateInput' && idx === 1) ||
            (failedStage === 'PackageTemplate' && idx === 2) ||
            ((failedStage === 'StartBuild' || failedStage === 'MonitorBuild') && idx === 3) ||
            (failedStage === 'CaptureOutputs' && idx === 4)
          );

          const nextEntry = statusHistory.find(h => getStageIdx(h.status) === idx + 1);
          const stageDuration = entry && nextEntry ? getDuration(entry.timestamp, nextEntry.timestamp) : '';

          return (
            <div key={stage.key} className="flex items-stretch">
              {/* Timeline line + dot */}
              <div className="flex flex-col items-center mr-4 w-9">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-700 ${
                  isFailedHere ? 'bg-red-500 text-white' :
                  isDone ? 'bg-blue-500 text-white' :
                  isActive ? `bg-blue-50 text-blue-700 border-2 border-blue-500 ${!isTerminal ? 'shadow-lg shadow-blue-100' : ''}` :
                  'bg-slate-100 text-slate-400'
                }`}>
                  {isFailedHere ? 'X' : isDone ? '✓' : stage.icon}
                </div>
                {idx < STAGES.length - 1 && (
                  <div className={`w-0.5 flex-1 min-h-[2rem] transition-all duration-700 ${
                    isDone ? 'bg-blue-300' :
                    isActive && !isTerminal ? 'bg-gradient-to-b from-blue-300 to-slate-200' :
                    'bg-slate-200'
                  }`} />
                )}
              </div>

              {/* Content */}
              <div className={`flex-1 pb-4 transition-all duration-500 ${
                isActive && !isTerminal ? 'transform' : ''
              }`}>
                <div className={`p-3 rounded-xl transition-all duration-500 ${
                  isFailedHere ? 'bg-red-50 border border-red-200' :
                  isActive && !isTerminal ? 'bg-blue-50/50 border border-blue-200' :
                  isDone ? 'bg-white' :
                  'opacity-40'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-sm ${
                        isFailedHere ? 'text-red-800' :
                        isDone || isActive ? 'text-slate-900' : 'text-slate-400'
                      }`}>
                        {stage.label}
                      </span>
                      {isActive && !isTerminal && <Spinner />}
                      {isDone && <span className="text-xs text-emerald-600 font-semibold">✓</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      {stageDuration && <span className="text-xs text-slate-400">{stageDuration}</span>}
                      {entry && <span className="text-xs text-slate-400">{formatTime(entry.timestamp)}</span>}
                    </div>
                  </div>
                  <div className={`text-xs mt-1 ${isFailedHere ? 'text-red-600' : 'text-slate-500'}`}>
                    {isFailedHere ? `Failed: ${failedStage}` : stage.detail}
                  </div>
                  {entry?.message && entry.message !== 'Deployment created' && (
                    <div className="text-xs text-blue-600 mt-1">{entry.message}</div>
                  )}

                  {stage.key === 'deploying' && isActive && buildId && (
                    <div className="mt-2 text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200/60">
                      Build: {buildId.split(':')[1]?.substring(0, 8)}...
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* AWS Resource Flow */}
      <div className="mt-4 pt-4 border-t border-slate-100">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Resource Flow</div>
        <div className="flex items-center gap-1 flex-wrap text-xs">
          {[
            { label: 'API', done: currentIdx >= 0 },
            { label: 'DynamoDB', done: currentIdx >= 0 },
            { label: 'Step Functions', done: currentIdx >= 1 },
            { label: 'S3 Archive', done: currentIdx >= 2 },
            { label: 'CodeBuild', done: currentIdx >= 3 },
            { label: 'Terraform', done: currentIdx >= 3 },
            { label: 'State Backend', done: currentIdx >= 4 },
            { label: 'Outputs', done: currentIdx >= 5 },
          ].map((r, i, arr) => (
            <span key={r.label} className="flex items-center gap-1">
              <span className={`px-2 py-0.5 rounded-lg transition-all duration-500 ${
                r.done ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200' : 'bg-slate-50 text-slate-400 border border-slate-200'
              }`}>
                {r.label}
              </span>
              {i < arr.length - 1 && (
                <span className={`transition-colors duration-500 ${r.done ? 'text-blue-300' : 'text-slate-300'}`}>→</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
