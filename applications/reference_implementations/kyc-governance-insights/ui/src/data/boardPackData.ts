// =============================================================================
// boardPackData.ts — Iteration 25: Board Pack One-Pager
// Aggregated summary data for the Risk Committee executive report
// =============================================================================

export interface BoardPackSection {
  title: string;
  content: string[];
}

export interface BoardRecommendation {
  text: string;
  rationale: string;
}

// Board pack is assembled dynamically from other data sources at render time.
// This file provides the static recommendation and template structure.

export const boardRecommendations: BoardRecommendation[] = [
  {
    text: 'Increase KYC autonomy to Level 3 — earned via 847/1000 clean decisions, 0.5% override rate, 30-day improving trend.',
    rationale: 'All earned autonomy criteria met. Risk appetite margin: +7 points. No open incidents for KYC.',
  },
  {
    text: 'Mortgage: restrict to Level 1 pending drift investigation. ETA: 48 hours.',
    rationale: 'Model drift detected 15 Jun 2026. Below risk appetite floor (-2). Investigation ongoing.',
  },
];

export const attestationSummary = [
  { useCase: 'KYC Banking', status: 'attested', note: '' },
  { useCase: 'Trade Surveillance', status: 'attested', note: '' },
  { useCase: 'Claims Processing', status: 'attested', note: '' },
  { useCase: 'Mortgage Assessment', status: 'paused', note: 'Pending drift investigation' },
];
