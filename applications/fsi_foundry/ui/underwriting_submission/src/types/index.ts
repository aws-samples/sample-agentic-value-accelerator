/**
 * TypeScript mirror of use_cases/underwriting_submission/src/strands/models.py.
 *
 * Enum-like fields are typed as plain `string` rather than string unions,
 * matching the deliberate permissiveness of the Python response models: those
 * values come from an LLM synthesis step, and a slightly off-format value must
 * render rather than break. Normalise defensively at the render site.
 */

export interface AppetiteReview {
  /** in_appetite | out_of_appetite | referral_required */
  status: string | null;
  checks_passed: string[];
  checks_failed: string[];
  prohibited_classes_triggered: string[];
  notes: string[];
}

export interface ExposureAssessment {
  total_insured_value: number;
  /** low | moderate | high | critical */
  severity: string | null;
  concentration_flags: string[];
  loss_history_summary: string | null;
  findings: string[];
  notes: string[];
}

export interface PricingIndication {
  indicated_premium: number;
  rate_per_thousand: number;
  loss_ratio_estimate: number;
  confidence_score: number;
  justification: string[];
  notes: string[];
}

export interface RawAgentAnalysis {
  agent: string;
  [key: string]: unknown;
}

export interface SubmissionResponse {
  submission_id: string;
  assessment_id: string;
  timestamp: string;
  /**
   * quote | refer | decline, or null.
   *
   * Null is expected and correct on a partial triage: appetite screening alone
   * is sufficient to decline but never sufficient to quote, and exposure or
   * pricing alone cannot decide in either direction. The UI must not imply an
   * outcome when this is null.
   */
  decision: string | null;
  appetite_review: AppetiteReview | null;
  exposure_assessment: ExposureAssessment | null;
  pricing_indication: PricingIndication | null;
  missing_information: string[];
  summary: string;
  raw_analysis: Record<string, RawAgentAnalysis | null | undefined>;
}

export type ExecutionStatus = 'idle' | 'running' | 'complete' | 'error';
