import { useState, useEffect } from 'react';
import { checkGrounding, type GroundingResult } from '../api/grounding';
import { useOfflineMode } from './useOfflineMode';

// Static fallback scores for when API is not available
const FALLBACK_SCORES: Record<string, { grounding: number; relevance: number }> = {
  approve: { grounding: 0.94, relevance: 0.88 },
  block: { grounding: 0.91, relevance: 0.85 },
};

export function useGrounding(scenario: 'approve' | 'block'): {
  result: GroundingResult | null;
  isLive: boolean;
  isLoading: boolean;
} {
  const offline = useOfflineMode();
  const [result, setResult] = useState<GroundingResult | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (offline) {
      const fallback = FALLBACK_SCORES[scenario] || FALLBACK_SCORES.approve;
      setResult({
        action: 'NONE',
        grounding_score: fallback.grounding,
        relevance_score: fallback.relevance,
        grounded: true,
        thresholds: { grounding: 0.85, relevance: 0.75 },
      });
      setIsLive(false);
      return;
    }

    const doCheck = async () => {
      setIsLoading(true);
      try {
        const res = await checkGrounding(
          'KYC assessment source documents',
          'Perform full KYC assessment',
          `KYC ${scenario === 'approve' ? 'approval' : 'rejection'} decision`
        );
        if (res) {
          setResult(res);
          setIsLive(true);
        } else {
          // Fallback to static
          const fallback = FALLBACK_SCORES[scenario] || FALLBACK_SCORES.approve;
          setResult({
            action: 'NONE',
            grounding_score: fallback.grounding,
            relevance_score: fallback.relevance,
            grounded: true,
            thresholds: { grounding: 0.85, relevance: 0.75 },
          });
          setIsLive(false);
        }
      } catch {
        const fallback = FALLBACK_SCORES[scenario] || FALLBACK_SCORES.approve;
        setResult({
          action: 'NONE',
          grounding_score: fallback.grounding,
          relevance_score: fallback.relevance,
          grounded: true,
          thresholds: { grounding: 0.85, relevance: 0.75 },
        });
        setIsLive(false);
      } finally {
        setIsLoading(false);
      }
    };

    doCheck();
  }, [scenario, offline]);

  return { result, isLive, isLoading };
}
