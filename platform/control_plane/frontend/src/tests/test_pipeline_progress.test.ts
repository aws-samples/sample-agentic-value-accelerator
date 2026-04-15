/**
 * Property-Based Tests for PipelineProgress rendering logic
 *
 * # Feature: cicd-deployment-pipeline, Property 12: Pipeline progress component renders correct stage for any status
 *
 * Uses fast-check to verify that the pure logic extracted from PipelineProgress.tsx
 * correctly classifies pipeline stages for any deployment status value.
 *
 * **Validates: Requirements 7.2, 7.3, 7.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { DeploymentStatus } from '../types';
import {
  getStageIndex,
  getFailedStageIndex,
  isDestroyStatus,
  classifyStages,
  classifyDestroyStages,
  PIPELINE_STAGES,
  DESTROY_STAGES,
  FAILED_STAGE_MAP,
} from '../components/pipelineProgressUtils';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** All pipeline statuses that map to a stage in PIPELINE_STAGES */
const pipelineStatusArb: fc.Arbitrary<DeploymentStatus> = fc.constantFrom(
  ...PIPELINE_STAGES as unknown as DeploymentStatus[],
);

/** Destroy statuses */
const destroyStatusArb: fc.Arbitrary<DeploymentStatus> = fc.constantFrom(
  ...DESTROY_STAGES as unknown as DeploymentStatus[],
);

/** All known failed stage names from Step Functions */
const failedStageNameArb: fc.Arbitrary<string> = fc.constantFrom(
  ...Object.keys(FAILED_STAGE_MAP),
);

// ---------------------------------------------------------------------------
// Property 12 Tests
// ---------------------------------------------------------------------------

describe('Property 12: Pipeline progress component renders correct stage for any status', () => {
  // Feature: cicd-deployment-pipeline, Property 12: Pipeline progress component renders correct stage for any status

  describe('getStageIndex', () => {
    it('returns the correct index for any pipeline status', () => {
      // Feature: cicd-deployment-pipeline, Property 12
      // **Validates: Requirements 7.2, 7.3, 7.4**
      fc.assert(
        fc.property(pipelineStatusArb, (status) => {
          const idx = getStageIndex(status);
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(PIPELINE_STAGES.length);
          expect(PIPELINE_STAGES[idx]).toBe(status);
        }),
        { numRuns: 100 },
      );
    });

    it('returns -1 for any non-pipeline status', () => {
      // Feature: cicd-deployment-pipeline, Property 12
      // **Validates: Requirements 7.2, 7.3, 7.4**
      const nonPipelineStatuses: DeploymentStatus[] = [
        'pending', 'destroying', 'destroyed', 'packaged', 'delivered', 'failed', 'rolled_back',
      ];
      const nonPipelineArb = fc.constantFrom<DeploymentStatus>(...nonPipelineStatuses);

      fc.assert(
        fc.property(nonPipelineArb, (status) => {
          const idx = getStageIndex(status);
          expect(idx).toBe(-1);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('classifyStages – normal pipeline statuses', () => {
    it('completed stages are before the current index, current is at the index, future are pending', () => {
      // Feature: cicd-deployment-pipeline, Property 12
      // **Validates: Requirements 7.2, 7.3, 7.4**
      fc.assert(
        fc.property(pipelineStatusArb, (status) => {
          const classifications = classifyStages(status);
          const currentIdx = getStageIndex(status);

          for (let i = 0; i < PIPELINE_STAGES.length; i++) {
            if (i < currentIdx) {
              expect(classifications[i]).toBe('completed');
            } else if (i === currentIdx) {
              expect(classifications[i]).toBe('current');
            } else {
              expect(classifications[i]).toBe('pending');
            }
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('classifyStages – FAILED status with failed stage', () => {
    it('marks the failed stage as failed and others as completed or pending', () => {
      // Feature: cicd-deployment-pipeline, Property 12
      // **Validates: Requirements 7.2, 7.3, 7.4**
      fc.assert(
        fc.property(failedStageNameArb, (failedStageName) => {
          const classifications = classifyStages('failed', failedStageName);
          const failedIdx = getFailedStageIndex(failedStageName);

          expect(failedIdx).toBeGreaterThanOrEqual(0);

          for (let i = 0; i < PIPELINE_STAGES.length; i++) {
            if (i === failedIdx) {
              expect(classifications[i]).toBe('failed');
            } else if (i < failedIdx) {
              expect(classifications[i]).toBe('completed');
            } else {
              expect(classifications[i]).toBe('pending');
            }
          }
        }),
        { numRuns: 100 },
      );
    });

    it('the error indicator is on exactly one stage', () => {
      // Feature: cicd-deployment-pipeline, Property 12
      // **Validates: Requirements 7.4**
      fc.assert(
        fc.property(failedStageNameArb, (failedStageName) => {
          const classifications = classifyStages('failed', failedStageName);
          const failedCount = classifications.filter((c) => c === 'failed').length;
          expect(failedCount).toBe(1);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('getFailedStageIndex – failed stage mapping', () => {
    it('maps every known failed stage name to a valid pipeline index', () => {
      // Feature: cicd-deployment-pipeline, Property 12
      // **Validates: Requirements 7.4**
      fc.assert(
        fc.property(failedStageNameArb, (failedStageName) => {
          const idx = getFailedStageIndex(failedStageName);
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(PIPELINE_STAGES.length);
        }),
        { numRuns: 100 },
      );
    });

    it('StartBuild and MonitorBuild both map to the deploying stage (index 2)', () => {
      // Feature: cicd-deployment-pipeline, Property 12
      // **Validates: Requirements 7.4**
      expect(getFailedStageIndex('StartBuild')).toBe(2);
      expect(getFailedStageIndex('MonitorBuild')).toBe(2);
      expect(PIPELINE_STAGES[2]).toBe('deploying');
    });

    it('returns -1 for unknown stage names', () => {
      // Feature: cicd-deployment-pipeline, Property 12
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(
            (s) => !Object.keys(FAILED_STAGE_MAP).includes(s),
          ),
          (unknownStage) => {
            expect(getFailedStageIndex(unknownStage)).toBe(-1);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('isDestroyStatus and destroy stage classification', () => {
    it('destroying/destroyed statuses use the destroy stages', () => {
      // Feature: cicd-deployment-pipeline, Property 12
      // **Validates: Requirements 7.2**
      fc.assert(
        fc.property(destroyStatusArb, (status) => {
          expect(isDestroyStatus(status)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('non-destroy statuses do not use destroy stages', () => {
      // Feature: cicd-deployment-pipeline, Property 12
      const nonDestroyArb = fc.constantFrom<DeploymentStatus>(
        'pending', 'validating', 'packaging', 'deploying', 'verifying',
        'deployed', 'packaged', 'delivered', 'failed', 'rolled_back',
      );
      fc.assert(
        fc.property(nonDestroyArb, (status) => {
          expect(isDestroyStatus(status)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('classifyDestroyStages shows correct completed/current/pending for destroy statuses', () => {
      // Feature: cicd-deployment-pipeline, Property 12
      // **Validates: Requirements 7.2**
      fc.assert(
        fc.property(destroyStatusArb, (status) => {
          const classifications = classifyDestroyStages(status);
          const destroyIdx = DESTROY_STAGES.indexOf(status as typeof DESTROY_STAGES[number]);

          for (let i = 0; i < DESTROY_STAGES.length; i++) {
            if (i < destroyIdx) {
              expect(classifications[i]).toBe('completed');
            } else if (i === destroyIdx) {
              expect(classifications[i]).toBe('current');
            } else {
              expect(classifications[i]).toBe('pending');
            }
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
