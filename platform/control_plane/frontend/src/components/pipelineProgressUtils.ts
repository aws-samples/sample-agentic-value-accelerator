/**
 * Pure logic extracted from PipelineProgress.tsx for testability.
 *
 * These functions drive the pipeline progress visualization:
 * - getStageIndex: maps a deployment status to its pipeline stage index
 * - classifyStages: determines completed/current/pending/failed for each stage
 * - getFailedStageIndex: maps a failed stage name to its pipeline stage index
 * - isDestroyStatus: checks if a status uses the destroy stages
 */

import type { DeploymentStatus } from '../types';

export const PIPELINE_STAGES = ['validating', 'packaging', 'deploying', 'verifying', 'deployed'] as const;
export const DESTROY_STAGES = ['destroying', 'destroyed'] as const;

export type PipelineStage = typeof PIPELINE_STAGES[number];
export type DestroyStage = typeof DESTROY_STAGES[number];

/**
 * Map a deployment status to its index in the PIPELINE_STAGES array.
 * Returns -1 if the status is not a pipeline stage.
 */
export function getStageIndex(status: DeploymentStatus): number {
  return PIPELINE_STAGES.indexOf(status as PipelineStage);
}

/**
 * Map a failed stage name (from Step Functions) to the corresponding
 * pipeline stage index. Returns -1 if the stage name is not recognized.
 */
export const FAILED_STAGE_MAP: Record<string, number> = {
  ValidateInput: 0,
  PackageTemplate: 1,
  StartBuild: 2,
  MonitorBuild: 2,
  CaptureOutputs: 3,
};

export function getFailedStageIndex(failedStageName: string): number {
  if (Object.prototype.hasOwnProperty.call(FAILED_STAGE_MAP, failedStageName)) {
    return FAILED_STAGE_MAP[failedStageName];
  }
  return -1;
}

/**
 * Check if a status uses the destroy pipeline stages.
 */
export function isDestroyStatus(status: DeploymentStatus): boolean {
  return status === 'destroying' || status === 'destroyed';
}

export type StageClassification = 'completed' | 'current' | 'pending' | 'failed';

/**
 * Classify each pipeline stage based on the current deployment status.
 *
 * For normal (non-destroy, non-failed) statuses:
 *   - Stages before the current index are 'completed'
 *   - The stage at the current index is 'current'
 *   - Stages after the current index are 'pending'
 *
 * For FAILED status with a failedStage:
 *   - The stage at the failed index is 'failed'
 *   - Stages before the failed index are 'completed'
 *   - Stages after the failed index are 'pending'
 */
export function classifyStages(
  status: DeploymentStatus,
  failedStage?: string,
): StageClassification[] {
  const isFailed = status === 'failed';

  const currentIdx = isFailed && failedStage
    ? getFailedStageIndex(failedStage)
    : getStageIndex(status);

  return PIPELINE_STAGES.map((_stage, idx) => {
    if (isFailed && idx === currentIdx) {
      return 'failed';
    }
    if (idx < currentIdx) {
      return 'completed';
    }
    if (idx === currentIdx && !isFailed) {
      return 'current';
    }
    return 'pending';
  });
}

/**
 * Classify each destroy stage based on the current deployment status.
 */
export function classifyDestroyStages(
  status: DeploymentStatus,
): StageClassification[] {
  const destroyIdx = DESTROY_STAGES.indexOf(status as DestroyStage);

  return DESTROY_STAGES.map((_stage, idx) => {
    if (idx < destroyIdx) return 'completed';
    if (idx === destroyIdx) return 'current';
    return 'pending';
  });
}
