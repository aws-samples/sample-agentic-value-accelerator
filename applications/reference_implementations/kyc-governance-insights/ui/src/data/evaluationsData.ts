export type EvaluatorCategory = 'screening' | 'ownership' | 'risk' | 'compliance' | 'consistency';

export type Evaluator = {
  id: string;
  name: string;
  category: EvaluatorCategory;
  description: string;
  threshold: number;
  currentScore: number;
  status: 'pass' | 'fail' | 'warning';
  lastRunTime: string;
  trend: 'improving' | 'stable' | 'degrading';
  history: number[];
  keyMetric: string;
  regulatoryBasis: string;
};

export type AutoTightenEvent = {
  id: string;
  triggeredAt: string;
  evaluatorId: string;
  previousThreshold: number;
  newThreshold: number;
  policyChange: string;
};

export const evaluators: Evaluator[] = [
  {
    id: 'sanctions-screening-precision',
    name: 'Sanctions Screening Precision',
    category: 'screening',
    description: 'Measures precision against OFSI, UN, and EU consolidated sanctions lists. A false negative (missed match) constitutes a potential regulatory event under MLR 2017.',
    threshold: 95,
    currentScore: 97,
    status: 'pass',
    lastRunTime: '2026-06-26T08:15:00Z',
    trend: 'improving',
    history: [
      96, 97, 96, 95, 96, 97, 96, 96, 97, 96,
      95, 96, 97, 96, 95, 96, 95, 93, 88, 86,
      84, 87, 93, 96, 97, 97, 96, 97, 97, 97
    ],
    keyMetric: 'False negative rate on sanctions (0.3%)',
    regulatoryBasis: 'OFSI Guidance, EU Reg 2580/2001, UN SC Resolutions',
  },
  {
    id: 'pep-identification-accuracy',
    name: 'PEP Identification Accuracy',
    category: 'screening',
    description: 'Correctly flags Politically Exposed Persons, their family members, and known close associates. Uses Levenshtein distance + phonetic matching (Soundex/Metaphone) for fuzzy name resolution across transliterations.',
    threshold: 92,
    currentScore: 94,
    status: 'pass',
    lastRunTime: '2026-06-26T08:14:00Z',
    trend: 'stable',
    history: [
      93, 94, 93, 92, 93, 94, 94, 93, 93, 94,
      93, 93, 94, 93, 93, 92, 91, 89, 85, 83,
      84, 88, 91, 93, 94, 94, 94, 94, 94, 94
    ],
    keyMetric: 'PEP+RCA detection recall (94.2%)',
    regulatoryBasis: 'MLR 2017 Reg 35, FCA FC Guide 3.2.6, JMLSG 5.3.11',
  },
  {
    id: 'ubo-chain-completeness',
    name: 'UBO Chain Completeness',
    category: 'ownership',
    description: 'Verifies the agent traces Ultimate Beneficial Ownership to required depth (25% UK threshold). Detects nominee structures, layered holdings, circular ownership, and bearer shares.',
    threshold: 90,
    currentScore: 93,
    status: 'pass',
    lastRunTime: '2026-06-26T08:12:00Z',
    trend: 'improving',
    history: [
      92, 93, 92, 91, 92, 93, 93, 92, 91, 92,
      93, 92, 91, 92, 91, 92, 90, 87, 84, 82,
      81, 85, 89, 91, 92, 93, 93, 93, 93, 93
    ],
    keyMetric: 'Ownership layers resolved: avg 4.2 depth',
    regulatoryBasis: 'PSC Register (CA 2006 s790C), MLR 2017 Reg 5, 4AMLD Art 3(6)',
  },
  {
    id: 'risk-score-calibration',
    name: 'Risk Score Calibration',
    category: 'risk',
    description: 'Validates calibration of risk scores against actual outcomes. A score of 81 should mean ~81% of those cases genuinely warranted escalation. Compares predicted vs actual disposition over rolling 90-day window.',
    threshold: 88,
    currentScore: 91,
    status: 'pass',
    lastRunTime: '2026-06-26T08:15:00Z',
    trend: 'stable',
    history: [
      90, 91, 90, 89, 90, 91, 91, 90, 89, 90,
      91, 90, 89, 90, 89, 90, 88, 86, 83, 81,
      80, 84, 87, 89, 90, 91, 91, 91, 91, 91
    ],
    keyMetric: 'Brier score: 0.09 (calibration error)',
    regulatoryBasis: 'FCA SYSC 6.1.1, JMLSG Part I Ch 4, PRA SS1/21',
  },
  {
    id: 'regulatory-completeness-fca',
    name: 'Regulatory Completeness (FCA/PRA)',
    category: 'compliance',
    description: 'Validates assessment covers all required elements per Money Laundering Regulations 2017, Joint Money Laundering Steering Group guidance, and FCA Financial Crime Guide. Checks CDD, EDD, ongoing monitoring triggers.',
    threshold: 93,
    currentScore: 96,
    status: 'pass',
    lastRunTime: '2026-06-26T08:13:00Z',
    trend: 'stable',
    history: [
      95, 96, 95, 95, 96, 95, 96, 95, 95, 96,
      95, 95, 96, 95, 95, 94, 93, 91, 88, 87,
      88, 91, 93, 95, 96, 96, 96, 96, 96, 96
    ],
    keyMetric: 'Regulatory check coverage: 47/49 elements',
    regulatoryBasis: 'MLR 2017, JMLSG Parts I-III, FCA FC Guide Ch 3-6',
  },
  {
    id: 'source-document-grounding',
    name: 'Source Document Grounding',
    category: 'compliance',
    description: 'Every assertion in the KYC assessment must trace to a specific source document — Certificate of Incorporation, audited financials, UBO declaration, passport scan, or utility bill. No ungrounded claims permitted.',
    threshold: 94,
    currentScore: 96,
    status: 'pass',
    lastRunTime: '2026-06-26T08:14:00Z',
    trend: 'stable',
    history: [
      95, 96, 95, 95, 96, 95, 96, 95, 95, 96,
      95, 95, 96, 95, 95, 94, 93, 90, 86, 84,
      83, 87, 92, 95, 96, 96, 95, 96, 96, 96
    ],
    keyMetric: 'Ungrounded assertions per report: 0.3 avg',
    regulatoryBasis: 'MLR 2017 Reg 28(3), JMLSG 5.3.44-48',
  },
  {
    id: 'jurisdiction-risk-assessment',
    name: 'Jurisdiction Risk Assessment',
    category: 'risk',
    description: 'Correct application of FATF grey/blacklist status, Transparency International CPI scores, and local risk factors for offshore jurisdictions (BVI, Cayman, Channel Islands, Isle of Man). Includes sanctions regime mapping.',
    threshold: 91,
    currentScore: 94,
    status: 'pass',
    lastRunTime: '2026-06-26T08:11:00Z',
    trend: 'stable',
    history: [
      93, 94, 93, 93, 94, 93, 94, 93, 93, 94,
      93, 93, 94, 93, 93, 92, 91, 89, 86, 85,
      86, 89, 92, 93, 94, 94, 94, 94, 94, 94
    ],
    keyMetric: 'FATF list accuracy: 100%, CPI delta: ±2',
    regulatoryBasis: 'FATF Mutual Evaluations, TI CPI 2025, JMLSG 5.3.18',
  },
  {
    id: 'transaction-pattern-analysis',
    name: 'Transaction Pattern Analysis',
    category: 'screening',
    description: 'Detection of structuring (smurfing), rapid movement of funds, round-tripping, layering patterns, and integration signals in transaction history. Measures against known typologies from NCA SARs Intelligence.',
    threshold: 87,
    currentScore: 90,
    status: 'pass',
    lastRunTime: '2026-06-26T08:10:00Z',
    trend: 'improving',
    history: [
      88, 89, 88, 87, 88, 89, 89, 88, 88, 89,
      88, 88, 89, 88, 88, 87, 86, 84, 81, 79,
      80, 83, 86, 88, 89, 90, 90, 90, 90, 90
    ],
    keyMetric: 'Typology detection: 12/14 patterns identified',
    regulatoryBasis: 'NCA SAR Typologies, FATF Red Flags, FCA FC Guide 6.3',
  },
  {
    id: 'sar-quality-score',
    name: 'SAR Quality Score',
    category: 'compliance',
    description: 'When a SAR is recommended, validates the draft meets NCA standards — narrative completeness, correct categorisation (DAML/consent/intelligence), supporting evidence attached, and timeline accuracy.',
    threshold: 90,
    currentScore: 93,
    status: 'pass',
    lastRunTime: '2026-06-26T08:13:00Z',
    trend: 'stable',
    history: [
      92, 93, 92, 91, 92, 93, 93, 92, 91, 92,
      93, 92, 91, 92, 91, 92, 90, 88, 85, 84,
      85, 88, 90, 92, 93, 93, 93, 93, 93, 93
    ],
    keyMetric: 'NCA acceptance rate: 97% (draft quality)',
    regulatoryBasis: 'POCA 2002 s330-332, NCA SAR Guidance, Terrorism Act 2000 s21A',
  },
  {
    id: 'decision-consistency',
    name: 'Decision Consistency',
    category: 'consistency',
    description: 'Same input facts must produce same decision across repeated runs. Measures variance across 10 identical inputs — acceptable drift must be under 5%. Exceeding threshold triggers MLRO alert and pauses automated approvals.',
    threshold: 95,
    currentScore: 97,
    status: 'pass',
    lastRunTime: '2026-06-26T08:15:00Z',
    trend: 'stable',
    history: [
      96, 97, 96, 96, 97, 96, 97, 96, 96, 97,
      96, 96, 97, 96, 96, 95, 94, 92, 89, 88,
      89, 92, 94, 96, 97, 97, 97, 97, 97, 97
    ],
    keyMetric: 'Decision variance: 2.8% across 10 runs',
    regulatoryBasis: 'FCA PRIN 2.1 (Skill/care/diligence), SYSC 6.1.1',
  },
];

export const overallHealthScore: number =
  Math.round(
    (evaluators.filter((e) => e.status === 'pass').length / evaluators.length) * 100
  );

export const autoTightenEvents: AutoTightenEvent[] = [
  {
    id: 'ate-001',
    triggeredAt: '2026-06-16T14:32:00Z',
    evaluatorId: 'sanctions-screening-precision',
    previousThreshold: 93,
    newThreshold: 95,
    policyChange: 'Sanctions Screening Precision dropped below 95% — all sanctions matches now require human review regardless of confidence score. Fuzzy match threshold raised from 0.82 to 0.90.',
  },
  {
    id: 'ate-002',
    triggeredAt: '2026-06-18T09:47:00Z',
    evaluatorId: 'ubo-chain-completeness',
    previousThreshold: 88,
    newThreshold: 90,
    policyChange: 'UBO Chain Completeness dropped below 90% — max ownership layer depth before mandatory escalation reduced from 4 to 3. Nominee structure detection sensitivity increased.',
  },
  {
    id: 'ate-003',
    triggeredAt: '2026-06-19T11:15:00Z',
    evaluatorId: 'decision-consistency',
    previousThreshold: 93,
    newThreshold: 95,
    policyChange: 'Decision Consistency variance exceeded 5% — MLRO alerted, automated approvals paused for 4 hours pending review. Variance stabilised after model temperature reduction.',
  },
];
