/**
 * useComplianceAttestations — Hook for managing compliance attestations.
 *
 * Bridges the Compliance API with the UI, providing:
 * - Live attestation data merged with framework definitions
 * - Optimistic updates for status changes
 * - Auto-detection trigger
 * - Evidence management
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  complianceApi,
  type CompliancePosture,
  type ControlAttestation,
  type ControlAttestationUpdate,
  type ControlStatus,
  type Evidence,
  type EvidenceCreate,
  type AutoDetectionResult,
} from '../../api/client';
import { COMPLIANCE_CENTER_FRAMEWORKS, type ComplianceFramework, type ControlStatus as MockControlStatus } from './mockData';

export interface AttestationState {
  /** Overall posture from API (null if not loaded yet). */
  posture: CompliancePosture | null;
  /** Loading state. */
  loading: boolean;
  /** Error message if API failed. */
  error: string | null;
  /** Whether we're using live API data vs fallback. */
  live: boolean;
  /** Frameworks with merged attestation data. */
  frameworks: ComplianceFramework[];
  /** Map of control attestations by "frameworkId#controlId". */
  attestations: Map<string, ControlAttestation>;
  /** Last auto-detection results. */
  autoDetectionResults: AutoDetectionResult[];
}

export interface UseComplianceAttestationsReturn extends AttestationState {
  /** Refresh posture and attestations from API. */
  refresh: () => Promise<void>;
  /** Update a control's status. */
  updateStatus: (frameworkId: string, controlId: string, status: ControlStatus, notes?: string) => Promise<void>;
  /** Add evidence to a control. */
  addEvidence: (frameworkId: string, controlId: string, evidence: EvidenceCreate) => Promise<Evidence | null>;
  /** Run auto-detection sync. */
  runAutoDetection: () => Promise<AutoDetectionResult[]>;
  /** Get attestation for a specific control. */
  getAttestation: (frameworkId: string, controlId: string) => ControlAttestation | undefined;
}

function attestationKey(frameworkId: string, controlId: string): string {
  return `${frameworkId}#${controlId}`;
}

function mapApiStatusToMock(status: ControlStatus): MockControlStatus {
  switch (status) {
    case 'pass': return 'pass';
    case 'in-progress': return 'in-progress';
    case 'fail': return 'fail';
    case 'not-started': return 'not-started';
    default: return 'not-started';
  }
}

export function useComplianceAttestations(): UseComplianceAttestationsReturn {
  const [posture, setPosture] = useState<CompliancePosture | null>(null);
  const [attestations, setAttestations] = useState<Map<string, ControlAttestation>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [autoDetectionResults, setAutoDetectionResults] = useState<AutoDetectionResult[]>([]);

  // Fetch posture and attestations on mount
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch overall posture
      const postureData = await complianceApi.getPosture();
      setPosture(postureData);
      setLive(true);

      // Fetch attestations for all frameworks
      const allAttestations = new Map<string, ControlAttestation>();
      await Promise.all(
        COMPLIANCE_CENTER_FRAMEWORKS.map(async (fw) => {
          try {
            const fwAttestations = await complianceApi.listAttestations(fw.id);
            fwAttestations.forEach((att) => {
              allAttestations.set(attestationKey(att.framework_id, att.control_id), att);
            });
          } catch {
            // Framework might not have any attestations yet
          }
        })
      );
      setAttestations(allAttestations);
    } catch (err) {
      console.warn('Compliance API unavailable, using mock data:', err);
      setError('API unavailable — showing mock data');
      setLive(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Merge attestations into framework definitions
  const frameworks = useMemo((): ComplianceFramework[] => {
    return COMPLIANCE_CENTER_FRAMEWORKS.map((fw) => ({
      ...fw,
      categories: fw.categories.map((cat) => ({
        ...cat,
        controls: cat.controls.map((ctrl) => {
          const att = attestations.get(attestationKey(fw.id, ctrl.id));
          if (att) {
            return {
              ...ctrl,
              status: mapApiStatusToMock(att.status),
              evidence: att.notes || ctrl.evidence,
              owner: att.owner || ctrl.owner,
              lastReviewed: att.last_reviewed?.split('T')[0] || ctrl.lastReviewed,
              dueDate: att.due_date?.split('T')[0] || ctrl.dueDate,
              // Flag auto-detected controls
              ...(att.auto_detected && { autoDetected: true, autoSource: att.auto_detection_source }),
            };
          }
          return ctrl;
        }),
      })),
    }));
  }, [attestations]);

  // Update a control's status
  const updateStatus = useCallback(
    async (frameworkId: string, controlId: string, status: ControlStatus, notes?: string) => {
      const key = attestationKey(frameworkId, controlId);

      // Optimistic update
      const existing = attestations.get(key);
      const optimistic: ControlAttestation = existing
        ? { ...existing, status, notes: notes ?? existing.notes, updated_at: new Date().toISOString() }
        : {
            control_id: controlId,
            framework_id: frameworkId,
            status,
            notes,
            evidence: [],
            auto_detected: false,
            updated_at: new Date().toISOString(),
            updated_by: 'user',
          };

      setAttestations((prev) => new Map(prev).set(key, optimistic));

      try {
        const update: ControlAttestationUpdate = { status, notes };
        const result = await complianceApi.updateAttestation(frameworkId, controlId, update);
        setAttestations((prev) => new Map(prev).set(key, result));
      } catch (err) {
        console.error('Failed to update attestation:', err);
        // Revert optimistic update
        if (existing) {
          setAttestations((prev) => new Map(prev).set(key, existing));
        } else {
          setAttestations((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        }
        throw err;
      }
    },
    [attestations]
  );

  // Add evidence
  const addEvidence = useCallback(
    async (frameworkId: string, controlId: string, evidence: EvidenceCreate): Promise<Evidence | null> => {
      try {
        const result = await complianceApi.addEvidence(frameworkId, controlId, evidence);
        // Refresh attestation to get updated evidence list
        const updated = await complianceApi.getAttestation(frameworkId, controlId);
        const key = attestationKey(frameworkId, controlId);
        setAttestations((prev) => new Map(prev).set(key, updated));
        return result;
      } catch (err) {
        console.error('Failed to add evidence:', err);
        return null;
      }
    },
    []
  );

  // Run auto-detection
  const runAutoDetection = useCallback(async (): Promise<AutoDetectionResult[]> => {
    try {
      const results = await complianceApi.runAutoDetection();
      setAutoDetectionResults(results);
      // Refresh attestations to reflect auto-detected changes
      await refresh();
      return results;
    } catch (err) {
      console.error('Auto-detection failed:', err);
      return [];
    }
  }, [refresh]);

  // Get single attestation
  const getAttestation = useCallback(
    (frameworkId: string, controlId: string): ControlAttestation | undefined => {
      return attestations.get(attestationKey(frameworkId, controlId));
    },
    [attestations]
  );

  return {
    posture,
    loading,
    error,
    live,
    frameworks,
    attestations,
    autoDetectionResults,
    refresh,
    updateStatus,
    addEvidence,
    runAutoDetection,
    getAttestation,
  };
}
