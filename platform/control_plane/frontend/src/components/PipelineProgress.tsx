import type { DeploymentStatus } from '../types';
import {
  PIPELINE_STAGES,
  DESTROY_STAGES,
  getStageIndex,
  getFailedStageIndex,
  isDestroyStatus,
} from './pipelineProgressUtils';

const STAGE_LABELS: Record<string, string> = {
  validating: 'Validating',
  packaging: 'Packaging',
  deploying: 'Deploying',
  verifying: 'Verifying',
  deployed: 'Deployed',
  destroying: 'Destroying',
  destroyed: 'Destroyed',
};

interface Props {
  status: DeploymentStatus;
  failedStage?: string;
}

export default function PipelineProgress({ status, failedStage }: Props) {
  const isDestroy = isDestroyStatus(status);
  const isFailed = status === 'failed';

  if (isDestroy) {
    return (
      <div className="flex items-center gap-2">
        {DESTROY_STAGES.map((stage, idx) => {
          const destroyIdx = DESTROY_STAGES.indexOf(status as typeof DESTROY_STAGES[number]);
          const isComplete = idx < destroyIdx;
          const isCurrent = idx === destroyIdx;
          return (
            <div key={stage} className="flex items-center">
              <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${
                  isComplete ? 'bg-orange-600 text-white' :
                  isCurrent ? 'bg-orange-50 text-orange-700 border-2 border-orange-500' :
                  'bg-slate-100 text-slate-400'
                }`}>
                  {isComplete ? '✓' : idx + 1}
                </div>
                <span className={`text-sm font-semibold ${isCurrent ? 'text-slate-900' : 'text-slate-400'}`}>
                  {STAGE_LABELS[stage]}
                </span>
              </div>
              {idx < DESTROY_STAGES.length - 1 && (
                <div className={`h-0.5 w-12 mx-3 rounded-full ${isComplete ? 'bg-orange-500' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const failedStageIdx = isFailed && failedStage
    ? getFailedStageIndex(failedStage)
    : -1;

  const currentIdx = isFailed ? failedStageIdx : getStageIndex(status);

  return (
    <div className="flex items-center gap-2">
      {PIPELINE_STAGES.map((stage, idx) => {
        const isComplete = !isFailed && (currentIdx > idx || (status === 'deployed' && idx === currentIdx));
        const isCurrent = currentIdx === idx && status !== 'deployed';
        const isFailedStage = isFailed && idx === failedStageIdx;

        return (
          <div key={stage} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${
                isFailedStage ? 'bg-red-500 text-white' :
                isComplete ? 'bg-blue-600 text-white' :
                isCurrent && !isFailed ? 'bg-blue-50 text-blue-700 border-2 border-blue-500' :
                'bg-slate-100 text-slate-400'
              }`}>
                {isFailedStage ? 'X' : isComplete ? '✓' : idx + 1}
              </div>
              <span className={`text-sm font-semibold ${
                isFailedStage ? 'text-red-700' :
                isCurrent && !isFailed ? 'text-slate-900' :
                isComplete ? 'text-blue-700' :
                'text-slate-400'
              }`}>
                {STAGE_LABELS[stage]}
              </span>
            </div>
            {idx < PIPELINE_STAGES.length - 1 && (
              <div className={`h-0.5 w-12 mx-3 rounded-full ${
                isFailedStage ? 'bg-red-300' :
                isComplete ? 'bg-blue-500' :
                'bg-slate-200'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
