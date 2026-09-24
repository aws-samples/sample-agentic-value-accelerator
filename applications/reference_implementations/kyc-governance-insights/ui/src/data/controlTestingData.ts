// =============================================================================
// controlTestingData.ts — Iteration 23: Control Testing Evidence
// Extends controlMappingData with test dates, results, methodology, cadence
// =============================================================================

export type TestResult = 'pass' | 'fail' | 'partial';
export type TestCadence = 'quarterly' | 'annual' | 'continuous';
export type TestMethodology = 'walkthrough' | 'sample_testing' | 'automated_continuous' | 'inspection' | 'reperformance';

export interface ControlTestRecord {
  controlId: string; // maps to Control.id in controlMappingData
  lastTested: Date;
  testResult: TestResult;
  tester: string;
  testerIndependence: string; // e.g., "2nd line — independent of control owner"
  methodology: TestMethodology;
  sampleSize?: string; // e.g., "25 transactions reviewed"
  evidenceLink: string; // reference to test workpaper
  cadence: TestCadence;
  nextDue: Date;
  testProcedure: string;
  observations: string;
  exceptions?: string; // only if partial or fail
  remediationAction?: string; // only if fail
}

// --- Dynamic date calculations ---
const now = new Date();
const daysMs = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * daysMs);
}

function daysFromNow(days: number): Date {
  return new Date(now.getTime() + days * daysMs);
}

// --- Utility functions ---

export type TestDueStatus = 'current' | 'pending' | 'overdue';

export function computeTestDueStatus(record: ControlTestRecord): TestDueStatus {
  const daysRemaining = (record.nextDue.getTime() - now.getTime()) / daysMs;
  if (daysRemaining < 0) return 'overdue';
  if (daysRemaining <= 30) return 'pending';
  return 'current';
}

// --- Control Testing Data (representative sample — 12 records covering all result types) ---

export const controlTestingRecords: ControlTestRecord[] = [
  {
    controlId: 'GV.OV-01',
    lastTested: daysAgo(12),
    testResult: 'pass',
    tester: 'Maria Santos, Senior Internal Auditor',
    testerIndependence: '3rd line — Internal Audit, independent of 1st/2nd line',
    methodology: 'walkthrough',
    evidenceLink: 'WP-GV-OV-01-Q2-2026',
    cadence: 'quarterly',
    nextDue: daysFromNow(78),
    testProcedure: 'Reviewed board AI governance minutes (Q1-Q2 2026). Verified quorum attendance, agenda items covering AI risk, and documented decisions.',
    observations: 'Board reviewed AI governance at all 4 quarterly meetings. CRO presented AI risk report at each. All decisions documented with action owners.',
  },
  {
    controlId: 'GV.OV-03',
    lastTested: daysAgo(25),
    testResult: 'partial',
    tester: 'James Webb, Compliance Testing',
    testerIndependence: '2nd line — Compliance, independent of control owner',
    methodology: 'inspection',
    sampleSize: '15 model change requests reviewed',
    evidenceLink: 'WP-GV-OV-03-Q2-2026',
    cadence: 'quarterly',
    nextDue: daysFromNow(65),
    testProcedure: 'Inspected model change governance log for all changes in Q1-Q2 2026. Verified approval chain, impact assessment, and rollback plan for each.',
    observations: 'Of 15 changes: 13 fully documented with all required approvals. 2 changes had approval but missing impact assessment documentation.',
    exceptions: '2 model changes (CHG-2026-008, CHG-2026-011) missing documented impact assessment. Changes were approved verbally per interview with Head of AI but written record incomplete.',
    remediationAction: 'FND-2026-002 raised. Head of AI to implement mandatory form submission before change approval.',
  },
  {
    controlId: 'RS.AN-01',
    lastTested: daysAgo(18),
    testResult: 'pass',
    tester: 'Maria Santos, Senior Internal Auditor',
    testerIndependence: '3rd line — Internal Audit',
    methodology: 'sample_testing',
    sampleSize: '50 KYC decisions sampled (25 approve, 25 block/escalate)',
    evidenceLink: 'WP-RS-AN-01-Q2-2026',
    cadence: 'quarterly',
    nextDue: daysFromNow(72),
    testProcedure: 'Randomly sampled 50 KYC decisions from the 90-day period. Verified each decision had complete risk assessment, source document linkage, and appropriate escalation.',
    observations: 'All 50 decisions contained complete risk assessments. All decisions matched policy thresholds correctly. Zero false approvals detected in sample.',
  },
  {
    controlId: 'RS.AN-07',
    lastTested: daysAgo(74),
    testResult: 'fail',
    tester: 'External: Deloitte LLP — AI Assurance',
    testerIndependence: 'External audit firm — fully independent',
    methodology: 'reperformance',
    sampleSize: '200 synthetic test cases across 4 demographic groups',
    evidenceLink: 'WP-RS-AN-07-EXT-2026',
    cadence: 'annual',
    nextDue: daysAgo(10), // OVERDUE
    testProcedure: 'Re-performed bias testing on Nova Pro risk classification model using Deloitte proprietary fairness testing framework. 200 synthetic cases balanced across ethnicity, gender, nationality, age.',
    observations: 'Statistical significance test (chi-squared, p<0.05) detected geographic bias: Caribbean-registered entities scored 8.2% higher risk on average, controlling for financial indicators.',
    exceptions: 'Bias detected in Nova Pro model for geographic jurisdiction. Caribbean entities systematically over-scored vs comparable European entities with identical financials.',
    remediationAction: 'FND-2026-001 raised (Critical). Cedar policy jurisdiction weighting adjustment implemented as interim fix. Full model revalidation required.',
  },
  {
    controlId: 'GV.OV-02',
    lastTested: daysAgo(8),
    testResult: 'pass',
    tester: 'Aisha Khan, Compliance Manager',
    testerIndependence: '2nd line — Compliance',
    methodology: 'walkthrough',
    evidenceLink: 'WP-GV-OV-02-Q2-2026',
    cadence: 'quarterly',
    nextDue: daysFromNow(82),
    testProcedure: 'Walked through AI risk appetite statement with CRO. Verified alignment with board-approved risk appetite, quantitative thresholds, and escalation triggers.',
    observations: 'Risk appetite statement current (v3.1, approved 14 Mar 2026). Quantitative thresholds defined for all AI systems. Breach escalation tested via tabletop exercise.',
  },
  {
    controlId: 'MP.VL-01',
    lastTested: daysAgo(20),
    testResult: 'pass',
    tester: 'External: PwC — Model Risk',
    testerIndependence: 'External audit firm — fully independent',
    methodology: 'reperformance',
    sampleSize: '1,000 historical decisions replayed',
    evidenceLink: 'WP-MP-VL-01-EXT-2026',
    cadence: 'annual',
    nextDue: daysFromNow(345),
    testProcedure: 'Independent model validation: replayed 1,000 historical KYC decisions through current model version. Compared outcomes to human reviewer baseline.',
    observations: 'Model performance within acceptable bounds. Agreement rate with human reviewers: 94.2% (threshold: >90%). No systematic errors detected.',
  },
  {
    controlId: 'DP.PR-01',
    lastTested: daysAgo(5),
    testResult: 'pass',
    tester: 'Automated — Continuous Monitoring',
    testerIndependence: 'Automated control — no human tester required',
    methodology: 'automated_continuous',
    evidenceLink: 'AUTO-DP-PR-01-DAILY',
    cadence: 'continuous',
    nextDue: daysFromNow(1), // continuous = always tomorrow
    testProcedure: 'Automated daily scan: verify all data-at-rest encryption (AES-256) active, all data-in-transit TLS 1.3, no plaintext PII in logs.',
    observations: 'Last 90 days: 90/90 daily checks passed. No encryption gaps detected. PII scan: 0 exposures.',
  },
  {
    controlId: 'DP.PR-03',
    lastTested: daysAgo(15),
    testResult: 'pass',
    tester: 'James Webb, Compliance Testing',
    testerIndependence: '2nd line — Compliance',
    methodology: 'sample_testing',
    sampleSize: '30 data access requests reviewed',
    evidenceLink: 'WP-DP-PR-03-Q2-2026',
    cadence: 'quarterly',
    nextDue: daysFromNow(75),
    testProcedure: 'Sampled 30 data access requests from IAM logs. Verified each request followed least-privilege principle, had valid justification, and appropriate approval.',
    observations: 'All 30 requests properly authorised. No privilege escalations detected. Average time-to-revoke for leavers: 2.1 hours (policy: <24 hours).',
  },
  {
    controlId: 'TR.AU-01',
    lastTested: daysAgo(10),
    testResult: 'pass',
    tester: 'Automated — Continuous Monitoring',
    testerIndependence: 'Automated control — no human tester required',
    methodology: 'automated_continuous',
    evidenceLink: 'AUTO-TR-AU-01-DAILY',
    cadence: 'continuous',
    nextDue: daysFromNow(1),
    testProcedure: 'Automated daily: verify all AI decisions have complete audit trail (input, reasoning, output, timestamps, actor). Check trail immutability via hash chain validation.',
    observations: 'Last 90 days: 100% of decisions have complete trails. Hash chain integrity: verified. Zero tamper attempts detected.',
  },
  {
    controlId: 'RS.CM-01',
    lastTested: daysAgo(22),
    testResult: 'pass',
    tester: 'Aisha Khan, Compliance Manager',
    testerIndependence: '2nd line — Compliance',
    methodology: 'walkthrough',
    evidenceLink: 'WP-RS-CM-01-Q2-2026',
    cadence: 'quarterly',
    nextDue: daysFromNow(68),
    testProcedure: 'Reviewed continuous monitoring dashboard outputs. Verified drift detection thresholds configured correctly, alert routing active, and monthly review cadence maintained.',
    observations: 'Drift monitoring active for all 3 models. Alert threshold: >5% distribution shift triggers review. 2 alerts in Q2 — both investigated and resolved within SLA.',
  },
  {
    controlId: 'GV.PL-01',
    lastTested: daysAgo(35),
    testResult: 'pass',
    tester: 'Maria Santos, Senior Internal Auditor',
    testerIndependence: '3rd line — Internal Audit',
    methodology: 'inspection',
    evidenceLink: 'WP-GV-PL-01-Q2-2026',
    cadence: 'quarterly',
    nextDue: daysFromNow(55),
    testProcedure: 'Inspected Cedar policy repository. Verified all policies version-controlled, change-logged, and linked to regulatory requirement. Confirmed no shadow policies.',
    observations: 'All 12 active Cedar policies properly version-controlled. Git history shows full change audit trail. All policies linked to at least one regulatory requirement.',
  },
  {
    controlId: 'HO.HI-01',
    lastTested: daysAgo(14),
    testResult: 'pass',
    tester: 'James Webb, Compliance Testing',
    testerIndependence: '2nd line — Compliance',
    methodology: 'sample_testing',
    sampleSize: '20 HITL escalation events reviewed',
    evidenceLink: 'WP-HO-HI-01-Q2-2026',
    cadence: 'quarterly',
    nextDue: daysFromNow(76),
    testProcedure: 'Sampled 20 human-in-the-loop escalation events. Verified each was triggered correctly per policy threshold, routed to appropriate reviewer, and resolved within SLA.',
    observations: 'All 20 escalations triggered correctly. Average response time: 4.2 hours (SLA: 24 hours). All decisions documented with reasoning.',
  },
];

// --- Summary for fleet/executive view ---

export function getControlTestingSummary() {
  const testedLast90 = controlTestingRecords.filter(r => {
    const daysSince = (now.getTime() - r.lastTested.getTime()) / daysMs;
    return daysSince <= 90;
  });

  const overdue = controlTestingRecords.filter(r => computeTestDueStatus(r) === 'overdue');
  const pending = controlTestingRecords.filter(r => computeTestDueStatus(r) === 'pending');
  const passed = testedLast90.filter(r => r.testResult === 'pass');
  const failed = testedLast90.filter(r => r.testResult === 'fail');
  const partial = testedLast90.filter(r => r.testResult === 'partial');

  return {
    testedLast90Days: testedLast90.length,
    pending: pending.length,
    overdue: overdue.length,
    passed: passed.length,
    failed: failed.length,
    partial: partial.length,
  };
}
