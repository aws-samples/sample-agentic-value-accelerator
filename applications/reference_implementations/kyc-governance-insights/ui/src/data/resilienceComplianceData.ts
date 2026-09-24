export interface ResilienceFramework {
  id: string;
  name: string;
  jurisdiction: string;
  status: 'compliant' | 'in_progress' | 'gap';
  lastAssessed: string;
  evidence: string;
  keyRequirements: string[];
}

export const resilienceFrameworks: ResilienceFramework[] = [
  {
    id: 'pra-ps6', name: 'PRA PS6/21', jurisdiction: 'UK',
    status: 'compliant', lastAssessed: '2026-06-15',
    evidence: 'Self-assessment Q2 2026, Board-approved IBS mapping',
    keyRequirements: ['Important Business Services mapped', 'Impact tolerances defined (4h RTO)', 'Scenario testing completed (June GameDay)', 'Third-party dependencies documented'],
  },
  {
    id: 'dora', name: 'DORA (EU)', jurisdiction: 'EU',
    status: 'compliant', lastAssessed: '2026-06-10',
    evidence: 'ICT Risk Management Framework v2.1, Incident reporting tested',
    keyRequirements: ['ICT risk management framework', 'Incident classification and reporting', 'Digital operational resilience testing', 'Third-party ICT risk management', 'Information sharing arrangements'],
  },
  {
    id: 'fca-resilience', name: 'FCA Operational Resilience', jurisdiction: 'UK',
    status: 'compliant', lastAssessed: '2026-06-12',
    evidence: 'Self-assessment complete, scenario testing report filed',
    keyRequirements: ['Important business services identified', 'Impact tolerances set', 'Mapping of resources supporting IBS', 'Scenario testing (severe but plausible)', 'Communication plans for disruption'],
  },
];
