/**
 * GovernanceConsoleTemplate — Generic governance console shell.
 * Accepts a UseCase configuration and renders the full demo experience
 * (tabs, simulation engine, activity log, HITL, blast radius).
 *
 * The same UI structure works for any domain — only the data changes.
 */

import type { UseCase } from './types';
import { kycUseCase } from './useCases/kyc';
import { tradeSurveillanceUseCase } from './useCases/tradeSurveillance';
import { claimsProcessingUseCase } from './useCases/claimsProcessing';

export type UseCaseId = 'kyc' | 'trade-surveillance' | 'claims-processing';

const USE_CASE_REGISTRY: Record<UseCaseId, UseCase> = {
  'kyc': kycUseCase,
  'trade-surveillance': tradeSurveillanceUseCase,
  'claims-processing': claimsProcessingUseCase,
};

/**
 * Get use case configuration by ID.
 * Falls back to KYC if not found.
 */
export function getUseCase(id: string): UseCase {
  return USE_CASE_REGISTRY[id as UseCaseId] || kycUseCase;
}

/**
 * Get use case ID from URL params (?use-case=trade-surveillance)
 */
export function getUseCaseFromUrl(): UseCaseId {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('use-case') || 'kyc';
  return (id in USE_CASE_REGISTRY) ? id as UseCaseId : 'kyc';
}

/**
 * List all available use cases (for a switcher UI if needed)
 */
export function listUseCases(): { id: UseCaseId; name: string; domain: string }[] {
  return Object.entries(USE_CASE_REGISTRY).map(([id, uc]) => ({
    id: id as UseCaseId,
    name: uc.name,
    domain: uc.domain,
  }));
}

export { kycUseCase, tradeSurveillanceUseCase, claimsProcessingUseCase };
export type { UseCase };
