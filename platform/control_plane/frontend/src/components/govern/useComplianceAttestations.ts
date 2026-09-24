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
      // Honesty gate: posture alone (all controls not_started with empty
      // attestations) is not live compliance data. Only mark live when real
      // attestation/evidence data exists, so the LIVE badge and posture strip
      // don't misrepresent mock control statuses as live.
      //
      // Re-checked after the backend control-id re-key (2026-09-14), which made the merge
      // below land 24 attestations where 14 used to land. The predicate is unchanged in
      // correctness, because it never claimed anything per-row: it says "the compliance API
      // is reachable and has stored attestations", and that is true of the response whenever
      // it is true. The re-key raised how many of those attestations actually reach a
      // control, so the flag is now backed by more of what it implies, not less.
      //
      // It is deliberately NOT a per-control provenance claim and callers must not spend it
      // as one: 24 of 806 controls are measured, so a LiveDataBadge placed over the whole
      // framework list still sits on 782 seeded literals. Badge scope is the caller's
      // problem; this flag answers only "did any measurement arrive".
      //
      // Why `size === 0` yields false rather than counting as a measured zero: a reachable
      // store that holds no attestations has measured nothing *about these controls*, so
      // there is no zero to report - the page would be 806 seeded rows under a Live badge.
      // That is different from a store being queried for a quantity and honestly answering
      // 0, which would be live data.
      setLive(allAttestations.size > 0);
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
          // JOIN KEY: `${fw.id}#${ctrl.id}` - the framework id from this checklist plus the
          // control's own `id`, never its `section`. The backend's auto-detector is written
          // against exactly this contract (see the "CONTROL ID CONTRACT" block in
          // backend/src/services/govern_compliance_service.py), and the two sides now agree:
          // every stored attestation resolves to a control here.
          //
          // Until 2026-09-14 they did not. 10 of the 24 stored attestations used an id this
          // checklist has nowhere - the 3 nist-ai-rmf rows sent `section` values ("GOVERN
          // 1.6" where the id is "NIST-GV-1.6"), and 7 finos-air rows used AIR-P-### /
          // AIR-D-###, prefixes absent from the FINOS taxonomy entirely. That was closed on
          // the backend by re-keying to the ids below; this side was already correct to key
          // on `ctrl.id`, so nothing changed here.
          //
          // What would break the agreement again: any backend `control_id` that is not a
          // `ctrl.id` in COMPLIANCE_CENTER_FRAMEWORKS. There is no runtime signal when that
          // happens, which is why it survived so long. `attestations.get()` simply misses,
          // the control keeps its seeded status, and a miss is indistinguishable from "not
          // assessed" - while `setLive()` above has already flipped the page to LIVE because
          // the *other* attestations did arrive. So a seeded PASS renders under a Live badge
          // and nothing logs. The provenance claim ends up true of the response and false of
          // the row.
          //
          // One id is expected to miss, by design: `finos-air` / `AIR-D-002`, written by the
          // backend's aws-config scanner. No FINOS control means "configuration compliance
          // monitoring", and inventing one to host the measurement was rejected, so it stays
          // measured-but-undisplayable rather than pointed at an approximate control.
          //
          // Still true regardless of the key: only 24 of the 806 controls in this checklist
          // are measured at all, and each of the 24 is an existence probe, not an efficacy
          // test. Agreeing on ids makes those 24 land on the right rows; it does not make
          // the remaining 782 anything other than seeded literals.
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
            // 'unknown' rather than 'user' because that is what the server will actually
            // store: the route resolves attribution from the x-user-email header and
            // falls back to 'unknown', and we deliberately no longer send an updated_by
            // param. An optimistic row that guesses a different value than the write it
            // is predicting would flicker to the real one a moment later, and 'user'
            // named nobody in the first place.
            updated_by: 'unknown',
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
