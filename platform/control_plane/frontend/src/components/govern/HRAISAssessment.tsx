/**
 * HRAISAssessment — EU AI Act High-Risk AI System Risk Assessment
 * Full 6-step wizard for agentic AI governance.
 *
 * Steps:
 * 0. System Profile (editable form)
 * 1. Identify Risks (9 EU AI Act categories)
 * 2. Assess Misuse (foreseeable misuse scenarios)
 * 3. Evaluate (Severity 1-5 × Likelihood 1-5, 5×5 matrix)
 * 4. Mitigate (4 strategy types, evidence documentation)
 * 5. Reassess (residual risk, overall system risk = highest individual)
 */

import { useState, useMemo, useEffect, useId } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './icons';

// Severity and Likelihood scales
const SEVERITY = [
  { level: 1, label: 'Very Low', desc: 'Negligible impact with no lasting effect', color: '#10b981' },
  { level: 2, label: 'Low', desc: 'Minor inconvenience not requiring intervention', color: '#3b82f6' },
  { level: 3, label: 'Moderate', desc: 'Temporary harm, moderate impact on rights', color: '#f59e0b' },
  { level: 4, label: 'Major', desc: 'Serious injury, significant rights violations', color: '#ef4444' },
  { level: 5, label: 'Extreme', desc: 'Loss of life, permanent disability, systemic violations', color: '#991b1b' },
];

const LIKELIHOOD = [
  { level: 1, label: 'Highly Unlikely', desc: '<5% probability', color: '#10b981' },
  { level: 2, label: 'Unlikely', desc: '5-25% probability', color: '#3b82f6' },
  { level: 3, label: 'Possible', desc: '25-75% probability', color: '#f59e0b' },
  { level: 4, label: 'Likely', desc: '75-95% probability', color: '#ef4444' },
  { level: 5, label: 'Almost Certain', desc: '>=95% probability', color: '#991b1b' },
];

// Mitigation strategy types
const MITIGATION_TYPES = [
  { id: 'eliminate', label: 'Eliminate Inherent Risk', tag: 'Primary', color: '#10b981' },
  { id: 'reduce', label: 'Reduce Inherent Risk', tag: 'Primary', color: '#3b82f6' },
  { id: 'control', label: 'Control Residual Risk', tag: 'Secondary', color: '#f59e0b' },
  { id: 'training', label: 'Information & Training', tag: 'Supporting', color: '#8b5cf6' },
];

// EU AI Act Risk Categories
const RISK_CATEGORIES = [
  { id: 'health-safety', name: 'Health & Safety', icon: 'hospital' as IconName, desc: 'Physical or psychological harm to individuals' },
  { id: 'bias-discrimination', name: 'Algorithmic Bias', icon: 'scale' as IconName, desc: 'Disparate treatment across protected groups' },
  { id: 'privacy-data', name: 'Privacy & Data', icon: 'lock-closed' as IconName, desc: 'Excessive data collection, unauthorized access' },
  { id: 'working-conditions', name: 'Working Conditions', icon: 'briefcase' as IconName, desc: 'Risks to employee rights, fair scheduling' },
  { id: 'fundamental-rights', name: 'Fundamental Rights', icon: 'document-text' as IconName, desc: 'Accessibility, freedom of expression' },
  { id: 'cybersecurity', name: 'Cybersecurity', icon: 'shield-check' as IconName, desc: 'Adversarial attacks, prompt injection' },
  { id: 'accuracy-robustness', name: 'Accuracy & Robustness', icon: 'chart-bar' as IconName, desc: 'Hallucinations, model drift, edge cases' },
  { id: 'transparency', name: 'Transparency', icon: 'eye' as IconName, desc: 'Lack of interpretability or explanations' },
  { id: 'autonomous-decisions', name: 'Autonomous Decisions', icon: 'cpu-chip' as IconName, desc: 'Over-reliance on automation, loss of control' },
];

interface Mitigation {
  text: string;
  type: string;
  evidence?: string;
}

interface Risk {
  id: string;
  category: string;
  name: string;
  component: string;
  description: string;
  intendedUse: string;
  misuse: string;
  severity: number;
  likelihood: number;
  mitigations: Mitigation[];
  residualSeverity: number;
  residualLikelihood: number;
}

interface SystemProfile {
  name: string;
  operatorStatus: string;
  intendedPurpose: string;
  hraisCategory: string;
  lifecycleStage: string;
  version: string;
  vulnerableGroups: string;
  regions: string;
  overview: string;
  businessContext: string;
  architecture: string;
  dataSources: string;
  targetUsers: string;
  deploymentEnv: string;
  testingStatus: string;
}

// Default risks for agentic AI in FSI
const DEFAULT_RISKS: Risk[] = [
  { id: 'R01', category: 'cybersecurity', name: 'Prompt Injection via Tools', component: 'LLM Input Processing', description: 'Malicious instructions in documents, emails, or tool outputs hijack agent behavior through indirect prompt injection.', intendedUse: 'Agent processes trusted inputs from approved data sources within guardrailed boundaries', misuse: 'Attacker crafts document with hidden instructions that override agent system prompt, causing unauthorized actions', severity: 4, likelihood: 3, mitigations: [], residualSeverity: 0, residualLikelihood: 0 },
  { id: 'R02', category: 'autonomous-decisions', name: 'Excessive Agency', component: 'Agent Permissions & Scope', description: 'Agent granted broader permissions than required, enabling unauthorized actions on financial systems without adequate human oversight.', intendedUse: 'Agent executes scoped tasks within defined action groups with human approval for high-value decisions', misuse: 'Compromised or misconfigured agent exploits broad IAM permissions to initiate unauthorized transactions', severity: 4, likelihood: 3, mitigations: [], residualSeverity: 0, residualLikelihood: 0 },
  { id: 'R03', category: 'privacy-data', name: 'Data Exfiltration via Context', component: 'Memory & Context Windows', description: 'Sensitive customer data (PII, financial records) leaks through agent memory, context windows, or tool outputs to unauthorized parties.', intendedUse: 'Agent accesses customer data only for authorized processing with PII redaction active', misuse: 'Context window retains PII across sessions; extraction via prompt manipulation or memory poisoning', severity: 5, likelihood: 2, mitigations: [], residualSeverity: 0, residualLikelihood: 0 },
  { id: 'R04', category: 'accuracy-robustness', name: 'Hallucination in Financial Decisions', component: 'LLM Output Generation', description: 'Agent generates fabricated information (false compliance status, incorrect risk scores, hallucinated regulations) that drives real business decisions.', intendedUse: 'Agent provides grounded, factual responses from knowledge base with citation', misuse: 'Agent confidently states incorrect regulatory requirement or fabricates data, leading to compliance violation or financial loss', severity: 4, likelihood: 3, mitigations: [], residualSeverity: 0, residualLikelihood: 0 },
  { id: 'R05', category: 'bias-discrimination', name: 'Bias in Autonomous Decisions', component: 'Decision Logic & Training Data', description: 'Agent makes decisions that disproportionately impact protected classes in lending, insurance, or employment contexts.', intendedUse: 'Agent applies consistent, fair criteria across all applicants per ECOA/Fair Lending requirements', misuse: 'Training data or prompt design introduces systematic bias; agent processes applications differently based on protected characteristics', severity: 5, likelihood: 3, mitigations: [], residualSeverity: 0, residualLikelihood: 0 },
  { id: 'R06', category: 'cybersecurity', name: 'Identity Confusion (Confused Deputy)', component: 'Authentication & Authorization', description: 'Agent acts with wrong user identity context. User permissions not properly propagated to downstream services.', intendedUse: 'Agent inherits and propagates requesting user identity via STS session credentials', misuse: 'Agent uses service role instead of user context, bypassing row-level security and accessing unauthorized data', severity: 4, likelihood: 2, mitigations: [], residualSeverity: 0, residualLikelihood: 0 },
  { id: 'R07', category: 'accuracy-robustness', name: 'Cascading Multi-Agent Failure', component: 'Multi-Agent Orchestration', description: 'Failure in one agent propagates through multi-agent workflow, causing system-wide outage or compounding incorrect decisions.', intendedUse: 'Agents coordinate via defined protocols with circuit breakers and error handling', misuse: 'Infinite delegation loop, error cascade, or hallucination propagation overwhelms downstream systems', severity: 4, likelihood: 2, mitigations: [], residualSeverity: 0, residualLikelihood: 0 },
  { id: 'R08', category: 'transparency', name: 'Opaque Decision Reasoning', component: 'Agent Decision Chain', description: 'Agent makes consequential decisions (credit, claims, compliance) without providing interpretable reasoning or audit trail.', intendedUse: 'Agent documents reasoning chain, cites sources, and provides explainable outputs', misuse: 'Complex multi-step reasoning produces decision that cannot be explained to affected individual or regulator', severity: 3, likelihood: 3, mitigations: [], residualSeverity: 0, residualLikelihood: 0 },
];

const DEFAULT_PROFILE: SystemProfile = {
  name: '',
  operatorStatus: 'Deployer (AWS Bedrock)',
  intendedPurpose: '',
  hraisCategory: 'Other: Autonomous AI Agent (FSI)',
  lifecycleStage: 'Development',
  version: '1.0',
  vulnerableGroups: '',
  regions: 'us-east-1',
  overview: '',
  businessContext: '',
  architecture: 'Amazon Bedrock Runtime',
  dataSources: '',
  targetUsers: '',
  deploymentEnv: 'AWS Cloud',
  testingStatus: 'Not started',
};

const STORAGE_PREFIX = 'hrais-assessment-';

function getRiskScore(severity: number, likelihood: number): number {
  return severity * likelihood;
}

function getRiskClass(severity: number, likelihood: number): string {
  const score = getRiskScore(severity, likelihood);
  if (score >= 16) return 'Critical';
  if (score >= 10) return 'High';
  if (score >= 6) return 'Medium';
  if (score >= 3) return 'Low';
  return 'Very Low';
}

function getRiskColor(severity: number, likelihood: number): string {
  const score = getRiskScore(severity, likelihood);
  if (score >= 16) return '#991b1b';
  if (score >= 10) return '#ef4444';
  if (score >= 6) return '#f59e0b';
  if (score >= 3) return '#3b82f6';
  return '#10b981';
}

interface HRAISAssessmentProps {
  compact?: boolean;
  useCaseId?: string;
}

export default function HRAISAssessment({ compact = false, useCaseId }: HRAISAssessmentProps) {
  const storageKey = `${STORAGE_PREFIX}${useCaseId || 'standalone'}`;
  const fieldId = useId();

  const [step, setStep] = useState(0);
  const [risks, setRisks] = useState<Risk[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : DEFAULT_RISKS;
    } catch {
      return DEFAULT_RISKS;
    }
  });
  const [profile, setProfile] = useState<SystemProfile>(() => {
    try {
      const stored = localStorage.getItem(`${storageKey}-profile`);
      return stored ? JSON.parse(stored) : DEFAULT_PROFILE;
    } catch {
      return DEFAULT_PROFILE;
    }
  });
  const [newMitigationText, setNewMitigationText] = useState<Record<string, string>>({});
  const [newMitigationType, setNewMitigationType] = useState<Record<string, string>>({});

  // Persist risks to localStorage
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(risks));
  }, [risks, storageKey]);

  // Persist profile to localStorage
  useEffect(() => {
    localStorage.setItem(`${storageKey}-profile`, JSON.stringify(profile));
  }, [profile, storageKey]);

  const updateRisk = (id: string, field: keyof Risk, value: Risk[keyof Risk]) => {
    setRisks(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addMitigation = (riskId: string) => {
    const text = newMitigationText[riskId];
    const type = newMitigationType[riskId] || 'control';
    if (!text?.trim()) return;

    setRisks(prev => prev.map(r =>
      r.id === riskId
        ? { ...r, mitigations: [...r.mitigations, { text: text.trim(), type }] }
        : r
    ));
    setNewMitigationText(prev => ({ ...prev, [riskId]: '' }));
  };

  const removeMitigation = (riskId: string, index: number) => {
    setRisks(prev => prev.map(r =>
      r.id === riskId
        ? { ...r, mitigations: r.mitigations.filter((_, i) => i !== index) }
        : r
    ));
  };

  const saveProfile = (field: keyof SystemProfile, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const stats = useMemo(() => {
    const inherentCritHigh = risks.filter(r => {
      const cls = getRiskClass(r.severity, r.likelihood);
      return cls === 'Critical' || cls === 'High';
    }).length;

    const residualCritHigh = risks.filter(r => {
      if (!r.residualSeverity) return false;
      const cls = getRiskClass(r.residualSeverity, r.residualLikelihood);
      return cls === 'Critical' || cls === 'High';
    }).length;

    const mitigatedCount = risks.filter(r => r.mitigations.length > 0).length;
    const assessedCount = risks.filter(r => r.residualSeverity > 0).length;

    // Overall system risk = highest individual residual risk
    const overallResidualClass = risks.reduce((worst, r) => {
      if (!r.residualSeverity) return worst;
      const cls = getRiskClass(r.residualSeverity, r.residualLikelihood);
      const order: Record<string, number> = { Critical: 5, High: 4, Medium: 3, Low: 2, 'Very Low': 1 };
      return (order[cls] || 0) > (order[worst] || 0) ? cls : worst;
    }, 'Very Low');

    // Check if all Critical/High inherent risks have been reduced
    const passCount = risks.filter(r => {
      if (!r.residualSeverity) return false;
      const inh = getRiskClass(r.severity, r.likelihood);
      const res = getRiskClass(r.residualSeverity, r.residualLikelihood);
      if ((inh === 'Critical' || inh === 'High') && (res === 'Critical' || res === 'High')) return false;
      return true;
    }).length;

    const ready = assessedCount === risks.length && passCount === risks.length;

    return {
      total: risks.length,
      inherentCritHigh,
      residualCritHigh,
      mitigatedCount,
      assessedCount,
      overallResidualClass,
      ready,
    };
  }, [risks]);

  const STEPS = [
    { num: 0, title: 'System Profile', icon: 'clipboard-list' as IconName, color: '#64748b' },
    { num: 1, title: 'Identify Risks', icon: 'viewfinder-circle' as IconName, color: '#3b82f6' },
    { num: 2, title: 'Assess Misuse', icon: 'exclamation-triangle' as IconName, color: '#f59e0b' },
    { num: 3, title: 'Evaluate', icon: 'chart-bar' as IconName, color: '#8b5cf6' },
    { num: 4, title: 'Mitigate', icon: 'shield-check' as IconName, color: '#10b981' },
    { num: 5, title: 'Reassess', icon: 'arrow-path' as IconName, color: '#0ea5e9' },
  ];

  // Compact mode for embedding in other views
  if (compact) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
              <Icon name="shield-check" className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-900">EU AI Act Assessment</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
              HRAIS
            </span>
          </div>
          <Link to="/govern/hrais" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
            Full Assessment →
          </Link>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="text-center p-2 bg-slate-50 rounded-lg">
            <div className="text-xl font-bold text-slate-800">{stats.total}</div>
            <div className="text-[9px] text-slate-500">Risks Identified</div>
          </div>
          <div className="text-center p-2 bg-rose-50 rounded-lg">
            <div className="text-xl font-bold text-rose-600">{stats.inherentCritHigh}</div>
            <div className="text-[9px] text-slate-500">Critical/High</div>
          </div>
          <div className="text-center p-2 bg-emerald-50 rounded-lg">
            <div className="text-xl font-bold text-emerald-600">{stats.mitigatedCount}</div>
            <div className="text-[9px] text-slate-500">Mitigated</div>
          </div>
          <div className="text-center p-2 rounded-lg" style={{ backgroundColor: `${getRiskColor(3, stats.assessedCount > 0 ? 2 : 1)}20` }}>
            <div className="text-xl font-bold" style={{ color: stats.ready ? '#10b981' : '#f59e0b' }}>
              {stats.ready ? 'Pass' : stats.assessedCount === 0 ? 'Start' : 'Review'}
            </div>
            <div className="text-[9px] text-slate-500">Status</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md">
            <Icon name="shield-check" className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">EU AI Act Assessment</h2>
            <p className="text-sm text-slate-500">High-Risk AI System (HRAIS) compliance evaluation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-1 rounded bg-slate-100 text-slate-600">
            {stats.total} risks · {stats.mitigatedCount} mitigated · {stats.assessedCount}/{stats.total} reassessed
          </span>
          <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${
            stats.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {stats.ready
              ? <><Icon name="check" className="w-4 h-4 inline-block mr-1" />Ready for Deployment</>
              : <><Icon name="exclamation-triangle" className="w-4 h-4 inline-block mr-1" />Review Required</>}
          </span>
        </div>
      </div>

      {/* Step Navigation */}
      <div className="flex gap-2">
        {STEPS.map(s => (
          <button
            key={s.num}
            onClick={() => setStep(s.num)}
            className={`flex-1 p-3 rounded-lg border-2 transition-all ${
              step === s.num
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="text-center">
              <Icon name={s.icon} className="w-4 h-4" />
              <div className={`text-[10px] font-semibold mt-1 ${
                step === s.num ? 'text-blue-700' : 'text-slate-600'
              }`}>
                {s.title}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-6 shadow-sm">
        {/* Step 0: System Profile */}
        {step === 0 && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              Provide information about the AI system being assessed. This context helps tailor the risk assessment to your specific deployment.
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">System Identification</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { field: 'name' as const, label: 'Name of AI System', placeholder: 'e.g., Loan Underwriting Agent' },
                  { field: 'operatorStatus' as const, label: 'Operator Status', placeholder: 'Provider or Deployer' },
                  { field: 'intendedPurpose' as const, label: 'Intended Purpose', placeholder: 'Describe intended purpose...' },
                  { field: 'hraisCategory' as const, label: 'High-Risk Classification', placeholder: 'Select category...' },
                  { field: 'lifecycleStage' as const, label: 'Lifecycle Stage', placeholder: 'Development / Testing / Deployed' },
                  { field: 'version' as const, label: 'Version Number', placeholder: '1.0.0' },
                  { field: 'vulnerableGroups' as const, label: 'Vulnerable Groups Affected?', placeholder: 'Describe if minors, disabled, elderly affected' },
                  { field: 'regions' as const, label: 'Applicable Regions', placeholder: 'us-east-1, eu-west-1' },
                ].map(f => (
                  <div key={f.field}>
                    <label htmlFor={`${fieldId}-${f.field}`} className="block text-xs text-slate-500 mb-1">{f.label}</label>
                    <input
                      id={`${fieldId}-${f.field}`}
                      value={profile[f.field]}
                      onChange={e => saveProfile(f.field, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">System Description</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { field: 'overview' as const, label: 'Overview', placeholder: 'High-level overview of AI system' },
                  { field: 'businessContext' as const, label: 'Business Context', placeholder: 'Business use case for deployment' },
                  { field: 'architecture' as const, label: 'System Architecture', placeholder: 'Key technical components (Bedrock, Lambda, etc.)' },
                  { field: 'dataSources' as const, label: 'Data Sources', placeholder: 'Primary data sources' },
                  { field: 'targetUsers' as const, label: 'Target Users', placeholder: 'Intended users of the AI system' },
                  { field: 'deploymentEnv' as const, label: 'Deployment Environment', placeholder: 'Cloud, on-premise, hybrid' },
                  { field: 'testingStatus' as const, label: 'Testing Status', placeholder: 'Completed / In Progress / Not Started' },
                ].map(f => (
                  <div key={f.field}>
                    <label htmlFor={`${fieldId}-${f.field}`} className="block text-xs text-slate-500 mb-1">{f.label}</label>
                    <input
                      id={`${fieldId}-${f.field}`}
                      value={profile[f.field]}
                      onChange={e => saveProfile(f.field, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-slate-500 italic">
              Review and update at least annually, upon substantial modification, or when new risks are identified.
            </div>
          </div>
        )}

        {/* Step 1: Identify Risks */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              Identify all known and reasonably foreseeable risks to health, safety, and fundamental rights. Consider system components individually.
            </div>

            <div className="grid grid-cols-2 gap-4">
              {risks.map(r => {
                const cat = RISK_CATEGORIES.find(c => c.id === r.category);
                const riskClass = getRiskClass(r.severity, r.likelihood);
                return (
                  <div
                    key={r.id}
                    className="p-4 bg-white rounded-xl border shadow-sm"
                    style={{ borderLeftWidth: '4px', borderLeftColor: getRiskColor(r.severity, r.likelihood) }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-400">{r.id}</span>
                        {cat?.icon && <Icon name={cat.icon} className="w-5 h-5" />}
                        <span className="text-sm font-semibold text-slate-900">{r.name}</span>
                      </div>
                      <span
                        className="text-[10px] px-2 py-1 rounded font-semibold text-white"
                        style={{ backgroundColor: getRiskColor(r.severity, r.likelihood) }}
                      >
                        {riskClass}
                      </span>
                    </div>
                    <div className="text-[10px] text-violet-600 mb-1">{cat?.name} · {r.component}</div>
                    <div className="text-xs text-slate-600">{r.description}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Assess Misuse */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              Evaluate whether foreseeable misuse could amplify each risk. Consider user error, operational shortcuts, unauthorized access, or deliberate exploitation.
            </div>

            {risks.map(r => (
              <div
                key={r.id}
                className="p-4 bg-white rounded-xl border shadow-sm"
                style={{ borderLeftWidth: '4px', borderLeftColor: getRiskColor(r.severity, r.likelihood) }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-mono text-slate-400">{r.id}</span>
                  <span className="text-sm font-semibold text-slate-900">{r.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                    <div className="text-[10px] font-semibold text-emerald-700 mb-1">INTENDED USE</div>
                    <div className="text-xs text-slate-700">{r.intendedUse}</div>
                  </div>
                  <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
                    <div className="text-[10px] font-semibold text-rose-700 mb-1">MISUSE SCENARIO</div>
                    <div className="text-xs text-slate-700">{r.misuse}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 3: Evaluate */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs text-violet-800 flex items-center justify-between">
              <span>Rate each risk: <strong>Severity</strong> (impact if realized) × <strong>Likelihood</strong> (probability of occurrence). Score = S × L.</span>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="px-2 py-0.5 rounded text-white font-medium" style={{ backgroundColor: '#10b981' }}>1-4 Low</span>
                <span className="px-2 py-0.5 rounded text-white font-medium" style={{ backgroundColor: '#f59e0b' }}>5-9 Medium</span>
                <span className="px-2 py-0.5 rounded text-white font-medium" style={{ backgroundColor: '#ef4444' }}>10-16 High</span>
                <span className="px-2 py-0.5 rounded text-white font-medium" style={{ backgroundColor: '#991b1b' }}>17-25 Critical</span>
              </div>
            </div>

            {/* Compact Risk Cards */}
            <div className="grid gap-2">
              {risks.map(r => {
                const cat = RISK_CATEGORIES.find(c => c.id === r.category);
                const riskClass = getRiskClass(r.severity, r.likelihood);
                const score = getRiskScore(r.severity, r.likelihood);
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                      style={{ backgroundColor: getRiskColor(r.severity, r.likelihood) }}
                    >
                      {score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400">{r.id}</span>
                        <span className="text-xs font-semibold text-slate-900 truncate">{r.name}</span>
                        {cat && <Icon name={cat.icon} className="w-3 h-3 text-slate-400 flex-shrink-0" />}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{r.description.slice(0, 80)}...</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-center">
                        <div className="text-[9px] text-slate-400 mb-0.5">Severity</div>
                        <select
                          aria-label={`Severity for ${r.id} ${r.name}`}
                          value={r.severity}
                          onChange={e => updateRisk(r.id, 'severity', parseInt(e.target.value))}
                          className="w-16 px-1 py-1 border border-slate-200 rounded text-[10px] text-center"
                        >
                          {SEVERITY.map(s => (
                            <option key={s.level} value={s.level}>{s.level} {s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="text-slate-300">×</div>
                      <div className="text-center">
                        <div className="text-[9px] text-slate-400 mb-0.5">Likelihood</div>
                        <select
                          aria-label={`Likelihood for ${r.id} ${r.name}`}
                          value={r.likelihood}
                          onChange={e => updateRisk(r.id, 'likelihood', parseInt(e.target.value))}
                          className="w-20 px-1 py-1 border border-slate-200 rounded text-[10px] text-center"
                        >
                          {LIKELIHOOD.map(l => (
                            <option key={l.level} value={l.level}>{l.level} {l.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="text-center w-16">
                        <div className="text-[9px] text-slate-400 mb-0.5">Class</div>
                        <span
                          className="text-[10px] px-2 py-1 rounded text-white font-semibold block"
                          style={{ backgroundColor: getRiskColor(r.severity, r.likelihood) }}
                        >
                          {riskClass}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Mitigate */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-800">
              Implement measures to eliminate or reduce risks. Document: (i) what measure, (ii) strategy type, (iii) how it reduces risk.
              <br />
              <strong>Primary:</strong> Eliminate or Reduce inherent risk. <strong>Secondary:</strong> Control residual risk. <strong>Supporting:</strong> Information & training.
            </div>

            {risks.map(r => {
              const riskClass = getRiskClass(r.severity, r.likelihood);
              return (
                <div
                  key={r.id}
                  className="p-4 bg-white rounded-xl border shadow-sm"
                  style={{ borderLeftWidth: '4px', borderLeftColor: getRiskColor(r.severity, r.likelihood) }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-400">{r.id}</span>
                      <span className="text-sm font-semibold text-slate-900">{r.name}</span>
                      <span
                        className="text-[10px] px-2 py-1 rounded text-white font-semibold"
                        style={{ backgroundColor: getRiskColor(r.severity, r.likelihood) }}
                      >
                        {riskClass}
                      </span>
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded font-medium ${
                      r.mitigations.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {r.mitigations.length} controls
                    </span>
                  </div>

                  {/* Existing mitigations */}
                  {r.mitigations.length > 0 && (
                    <div className="space-y-1 mb-3">
                      {r.mitigations.map((m, i) => {
                        const mt = MITIGATION_TYPES.find(t => t.id === m.type) || MITIGATION_TYPES[2];
                        return (
                          <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded font-medium text-white"
                              style={{ backgroundColor: mt.color }}
                            >
                              {mt.tag}
                            </span>
                            <span className="flex-1 text-xs text-slate-700">{m.text}</span>
                            <button
                              onClick={() => removeMitigation(r.id, i)}
                              className="text-slate-400 hover:text-rose-500 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add new mitigation */}
                  <div className="flex gap-2">
                    <select
                      aria-label={`Mitigation strategy type for ${r.id} ${r.name}`}
                      value={newMitigationType[r.id] || 'control'}
                      onChange={e => setNewMitigationType(prev => ({ ...prev, [r.id]: e.target.value }))}
                      className="px-2 py-1.5 border border-slate-200 rounded text-xs"
                    >
                      {MITIGATION_TYPES.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                    <input
                      aria-label={`Describe mitigation measure for ${r.id} ${r.name}`}
                      value={newMitigationText[r.id] || ''}
                      onChange={e => setNewMitigationText(prev => ({ ...prev, [r.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addMitigation(r.id); }}
                      placeholder="Describe mitigation measure..."
                      className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      onClick={() => addMitigation(r.id)}
                      className="px-3 py-1.5 bg-emerald-500 text-white rounded text-xs font-medium hover:bg-emerald-600 transition-colors"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Step 5: Reassess */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4 text-sm text-cyan-800">
              Reassess residual risk after mitigation. Critical/High inherent risks <strong>must</strong> reduce to Medium or lower.
              <br />
              Overall system risk = HIGHEST individual residual risk class.
            </div>

            {/* Reassessment Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th scope="col" className="pb-2 font-medium">ID</th>
                    <th scope="col" className="pb-2 font-medium">Risk</th>
                    <th scope="col" className="pb-2 font-medium">Inherent</th>
                    <th scope="col" className="pb-2 font-medium">Controls</th>
                    <th scope="col" className="pb-2 font-medium">Residual Sev</th>
                    <th scope="col" className="pb-2 font-medium">Residual Lik</th>
                    <th scope="col" className="pb-2 font-medium">Residual</th>
                    <th scope="col" className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {risks.map(r => {
                    const inhClass = getRiskClass(r.severity, r.likelihood);
                    const resClass = r.residualSeverity > 0 ? getRiskClass(r.residualSeverity, r.residualLikelihood) : null;
                    const mustReduce = inhClass === 'Critical' || inhClass === 'High';
                    const pass = resClass && !(mustReduce && (resClass === 'Critical' || resClass === 'High'));
                    return (
                      <tr key={r.id} className="border-b border-slate-100">
                        <td className="py-2 font-mono text-slate-400">{r.id}</td>
                        <td className="py-2 font-medium text-slate-900">{r.name}</td>
                        <td className="py-2">
                          <span
                            className="text-[10px] px-2 py-1 rounded text-white font-semibold"
                            style={{ backgroundColor: getRiskColor(r.severity, r.likelihood) }}
                          >
                            {inhClass}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className={`text-xs font-medium ${r.mitigations.length > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {r.mitigations.length}
                          </span>
                        </td>
                        <td className="py-2">
                          <select
                            aria-label={`Residual severity for ${r.id} ${r.name}`}
                            value={r.residualSeverity}
                            onChange={e => updateRisk(r.id, 'residualSeverity', parseInt(e.target.value))}
                            className="px-2 py-1 border border-slate-200 rounded text-xs"
                          >
                            <option value={0}>—</option>
                            {[1, 2, 3, 4, 5].map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2">
                          <select
                            aria-label={`Residual likelihood for ${r.id} ${r.name}`}
                            value={r.residualLikelihood}
                            onChange={e => updateRisk(r.id, 'residualLikelihood', parseInt(e.target.value))}
                            className="px-2 py-1 border border-slate-200 rounded text-xs"
                          >
                            <option value={0}>—</option>
                            {[1, 2, 3, 4, 5].map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2">
                          {resClass ? (
                            <span
                              className="text-[10px] px-2 py-1 rounded text-white font-semibold"
                              style={{ backgroundColor: getRiskColor(r.residualSeverity, r.residualLikelihood) }}
                            >
                              {resClass}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-2">
                          {!resClass ? (
                            <span className="text-[10px] px-2 py-1 rounded bg-slate-100 text-slate-600 font-medium">Pending</span>
                          ) : pass ? (
                            <span className="text-[10px] px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-medium">PASS</span>
                          ) : (
                            <span className="text-[10px] px-2 py-1 rounded bg-rose-100 text-rose-700 font-medium">FAIL</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Overall System Status */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-700">Overall System Risk:</span>
                <span
                  className="text-sm px-3 py-1 rounded text-white font-semibold"
                  style={{
                    backgroundColor: stats.assessedCount > 0
                      ? getRiskColor(
                          stats.overallResidualClass === 'Critical' ? 5 : stats.overallResidualClass === 'High' ? 4 : stats.overallResidualClass === 'Medium' ? 3 : 2,
                          stats.overallResidualClass === 'Critical' ? 4 : 3
                        )
                      : '#64748b'
                  }}
                >
                  {stats.assessedCount > 0 ? stats.overallResidualClass : 'Not Assessed'}
                </span>
                <span className="text-xs text-slate-500">(= highest individual residual)</span>
              </div>
              <div>
                {stats.ready ? (
                  <span className="text-sm px-4 py-2 rounded-lg bg-emerald-100 text-emerald-700 font-semibold">
                    READY FOR DEPLOYMENT
                  </span>
                ) : stats.assessedCount < stats.total ? (
                  <span className="text-sm px-4 py-2 rounded-lg bg-amber-100 text-amber-700 font-semibold">
                    INCOMPLETE — {stats.total - stats.assessedCount} pending
                  </span>
                ) : (
                  <span className="text-sm px-4 py-2 rounded-lg bg-rose-100 text-rose-700 font-semibold">
                    NOT READY — strengthen mitigations
                  </span>
                )}
              </div>
            </div>

            <div className="text-xs text-slate-500 italic">
              Testing must be completed before launch using defined metrics and probabilistic thresholds. Critical/High risks must be reduced to Medium or lower.
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            step === 0
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          }`}
        >
          ← Previous
        </button>
        <button
          onClick={() => setStep(Math.min(5, step + 1))}
          disabled={step === 5}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            step === 5
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
