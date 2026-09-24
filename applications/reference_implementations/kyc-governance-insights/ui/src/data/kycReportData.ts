export interface ReportData {
  verdict: string;
  verdictColor: string;
  customer: string;
  creditRisk: string;
  creditRiskColor: string;
  compliance: string;
  complianceColor: string;
  date: string;
  confidence: string;
  executiveSummary: string[];
  creditScore: number;       // risk score (22 = low risk, 81 = high risk) — internal
  creditScoreMax: number;
  creditScoreDisplay: number; // credit score (750 = good, 520 = poor) — shown in UI circle
  creditScoreDisplayMax: number; // 850
  creditLevel: string;
  creditFactors: string[];
  creditRecommendations: string[];
  complianceChecks: { name: string; status: 'pass' | 'fail' | 'warn' }[];
  regulatoryNotes: string[];
}

export const kycReportData: ReportData = {
  verdict: 'APPROVE',
  verdictColor: '#36b37e',
  customer: 'CUST001',
  creditRisk: 'Low',
  creditRiskColor: '#36b37e',
  compliance: 'Compliant',
  complianceColor: '#36b37e',
  date: '19 Jun 2026',
  confidence: 'HIGH',
  executiveSummary: [
    'OVERALL RECOMMENDATION: APPROVE',
    'Acme Corporation Ltd presents an excellent risk profile suitable for corporate banking onboarding with favorable credit terms. Strong creditworthiness, financial stability, and full regulatory compliance.',
    'Credit Risk Score: 22/100 (LOW) — 750 credit score (A-rated)',
    'Compliance: COMPLIANT — All KYC/AML checks passed',
    'Financial Position: STRONG — 0.33 D/E, 2.1x current ratio, $8.5M net income',
    'Payment: EXCELLENT — 96% on-time (48/50), zero defaults',
    'Business: LEGITIMATE — $87M volume, diversified base',
    'Ownership: VERIFIED — Smith 45%, Doe 30%, Fund ABC 25%',
    'Recommended Facilities: $15M–$23M | Prime + 75–100 bps | 3–5 year tenor',
  ],
  creditScore: 22,
  creditScoreMax: 100,
  creditScoreDisplay: 750,
  creditScoreDisplayMax: 850,
  creditLevel: 'A-RATED',
  creditFactors: ['Strong revenue growth (12% YoY)', 'Excellent payment history (96%)', 'Low leverage (D/E 0.33)', 'Diversified client base', 'A-rated credit score (750)'],
  creditRecommendations: ['Standard facility terms', 'Annual review cycle', 'No enhanced monitoring required'],
  complianceChecks: [
    { name: 'Corporate Registration (Active, Good Standing)', status: 'pass' },
    { name: 'Beneficial Ownership Identified (3 UBOs)', status: 'pass' },
    { name: 'OFAC Sanctions Screening', status: 'pass' },
    { name: 'UN Sanctions Screening', status: 'pass' },
    { name: 'EU Sanctions Screening', status: 'pass' },
    { name: 'UK HMT Sanctions Screening', status: 'pass' },
      { name: 'Companies House Filings Verification', status: 'pass' },
    { name: 'PEP Screening (All UBOs)', status: 'pass' },
    { name: 'Adverse Media Check', status: 'pass' },
    { name: 'Source of Funds Verification', status: 'pass' },
    { name: 'Geographic Risk Assessment', status: 'pass' },
    { name: 'Industry Risk Assessment', status: 'pass' },
    { name: 'Transaction Pattern Analysis', status: 'pass' },
  ],
  regulatoryNotes: [
    'All checks conducted per MLR 2017 / AML requirements',
    'FATF guidelines fully satisfied',
    'No enhanced due diligence required',
    'Standard KYC refresh: 12-month cycle',
  ],
};
