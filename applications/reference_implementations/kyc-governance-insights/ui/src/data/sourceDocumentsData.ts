/**
 * Mock source documents that represent what the agents ingest at Step 1.
 * Shows the audience what unstructured data feeds into the KYC assessment.
 */

export interface SourceDocument {
  type: string;
  icon: string;
  title: string;
  details: string[];
  confidence?: string; // OCR confidence
}

export const sourceDocsApprove: SourceDocument[] = [
  {
    type: 'Certificate of Incorporation',
    icon: '📜',
    title: 'Acme Corporation Ltd — CoI',
    details: [
      'Incorporated: 2015, Delaware (USA)',
      'Status: Active, Good Standing',
      'Registration No: DE-2015-AC-0847291',
      'Directors: J. Smith (Chair), M. Doe (CFO)',
    ],
    confidence: '99.4%',
  },
  {
    type: 'Financial Statements (FY2025)',
    icon: '📊',
    title: 'Audited Financials — PwC',
    details: [
      'Revenue: $75M (+12% YoY)',
      'Total Assets: $75M | Liabilities: $25M',
      'Equity: $50M | D/E Ratio: 0.33',
      'Net Income: $8.5M | Margin: 11.3%',
      'Current Ratio: 2.1x',
    ],
    confidence: '98.1%',
  },
  {
    type: 'UBO Declaration',
    icon: '👤',
    title: 'Beneficial Ownership Structure',
    details: [
      'UBO 1: John Smith — 45% (Director, US citizen)',
      'UBO 2: Mary Doe — 30% (Director, US citizen)',
      'UBO 3: Fund ABC — 25% (Registered investment vehicle, US)',
      'No nominee structures detected',
      'All UBOs verified against electoral roll',
    ],
    confidence: '97.9%',
  },
  {
    type: 'Transaction History',
    icon: '💳',
    title: '24-Month Payment Record',
    details: [
      'Total invoices: 50 | On-time: 48 (96%)',
      'Average payment cycle: 28 days',
      'Zero defaults in 5 years',
      'Annual volume: $87M across 3 sectors',
      'No unusual patterns flagged',
    ],
  },
];

export const sourceDocsBlock: SourceDocument[] = [
  {
    type: 'Certificate of Incorporation',
    icon: '📜',
    title: 'Omega Trading Ltd — CoI',
    details: [
      'Incorporated: 2019, British Virgin Islands',
      'Status: Active',
      'Registration No: BVI-2019-OT-4712',
      'Directors: J. Thornton (sole)',
      '⚠ Jurisdiction: HIGH RISK (BVI)',
    ],
    confidence: '97.1%',
  },
  {
    type: 'Financial Statements (FY2025)',
    icon: '📊',
    title: 'Unaudited Financials — Self-reported',
    details: [
      'Revenue: $12M',
      'Total Assets: $45M | Liabilities: $38M',
      'Equity: $7M | D/E Ratio: 5.43 ⚠',
      'Net Income: $252K | Margin: 2.1%',
      'Current Ratio: 0.8x ⚠ (below 1.0)',
      '⚠ No independent audit',
    ],
    confidence: '94.3%',
  },
  {
    type: 'UBO Declaration',
    icon: '👤',
    title: 'Beneficial Ownership Structure',
    details: [
      'UBO 1: J.R. Thornton — 60% (Director, UK national)',
      'UBO 2: Holdings BVI Ltd — 25% ⚠ NOMINEE STRUCTURE',
      'UBO 3: Unnamed nominee — 15% ⚠ UNDISCLOSED',
      '⚠ Complex ownership with BVI nominee',
      '⚠ Ultimate beneficial owner unclear for 40%',
    ],
    confidence: '96.2%',
  },
  {
    type: 'Transaction History',
    icon: '💳',
    title: '18-Month Payment Record',
    details: [
      'Total invoices: 50 | On-time: 31 (62%)',
      'Average payment cycle: 47 days',
      '2 defaults in 18 months',
      '⚠ Irregular transaction patterns',
      '⚠ Cross-border flows to Cyprus, BVI',
    ],
  },
];
