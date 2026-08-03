/**
 * MitreAtlasView — MITRE ATLAS deep-dive view for adversarial AI threats.
 *
 * A comprehensive threat intelligence view for MITRE ATLAS (Adversarial Threat
 * Landscape for AI Systems). Features:
 * - ATLAS tactics matrix visualization (horizontal flow like ATT&CK)
 * - Per-tactic control coverage and status
 * - Cross-reference to OWASP LLM Top 10 where tactics overlap
 * - Case study highlights from real-world AI attacks
 * - Integration guidance for defensive controls
 */
import { useState, useMemo } from 'react';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { COMPLIANCE_CENTER_FRAMEWORKS, type ComplianceFramework } from './mockData';

// -------------------------------- ATLAS Tactic Metadata --------------------------------
// MITRE ATLAS tactics follow the adversary lifecycle for AI systems
interface AtlasTactic {
  id: string;
  name: string;
  shortName: string;
  description: string;
  techniques: string[];
  owaspOverlap?: string[]; // OWASP LLM Top 10 IDs that overlap
  caseStudies?: string[];
}

const ATLAS_TACTICS: AtlasTactic[] = [
  {
    id: 'AML.TA0002',
    name: 'Reconnaissance',
    shortName: 'Recon',
    description: 'Gathering information about target AI systems, their capabilities, training data, and deployment environment.',
    techniques: ['AML.T0016 Discover ML Artifacts', 'AML.T0002 Active Scanning', 'AML.T0014 Search for Victim\'s Model Information'],
    owaspOverlap: ['LLM07'],
    caseStudies: ['Microsoft Tay fingerprinting (2016)'],
  },
  {
    id: 'AML.TA0003',
    name: 'Resource Development',
    shortName: 'Resource Dev',
    description: 'Preparing adversarial resources including poisoned training data, adversarial examples, and attack infrastructure.',
    techniques: ['AML.T0019 Develop Adversarial Examples', 'AML.T0020 Poison Training Data', 'AML.T0018 Backdoor ML Model'],
    owaspOverlap: ['LLM03', 'LLM04'],
    caseStudies: ['ImageNet backdoor study (2018)', 'NLP trigger phrase injection'],
  },
  {
    id: 'AML.TA0004',
    name: 'Initial Access',
    shortName: 'Initial Access',
    description: 'Gaining access to AI systems through prompts, APIs, supply chain, or social engineering vectors.',
    techniques: ['AML.T0051 LLM Prompt Injection', 'AML.T0049 LLM Plugin Compromise', 'AML.T0047 ML Supply Chain Compromise'],
    owaspOverlap: ['LLM01', 'LLM03'],
    caseStudies: ['ChatGPT plugin exploitation', 'Indirect prompt injection via emails'],
  },
  {
    id: 'AML.TA0000',
    name: 'AI Model Access',
    shortName: 'Model Access',
    description: 'Establishing persistent access to AI models through API abuse, inference endpoints, or model theft.',
    techniques: ['AML.T0024 Exfiltration via ML Inference API', 'AML.T0044 Full ML Model Access', 'AML.T0053 LLM API Abuse'],
    owaspOverlap: ['LLM10'],
    caseStudies: ['GPT-2 replication via API querying'],
  },
  {
    id: 'AML.TA0005',
    name: 'Execution',
    shortName: 'Execution',
    description: 'Running adversarial payloads through model inference, tool execution, or code generation.',
    techniques: ['AML.T0043 Command Injection via Prompt', 'AML.T0050 LLM Generated Malware', 'AML.T0048 Autonomous Agent Execution'],
    owaspOverlap: ['LLM05', 'LLM06'],
    caseStudies: ['Agent tool chain exploitation', 'Code interpreter sandbox escapes'],
  },
  {
    id: 'AML.TA0007',
    name: 'Defense Evasion',
    shortName: 'Def Evasion',
    description: 'Bypassing safety guardrails, content filters, and detection mechanisms through jailbreaks and evasion techniques.',
    techniques: ['AML.T0054 LLM Jailbreak', 'AML.T0040 Evade ML Model', 'AML.T0055 Prompt Obfuscation'],
    owaspOverlap: ['LLM01'],
    caseStudies: ['DAN jailbreak variants', 'Multi-language guardrail evasion'],
  },
  {
    id: 'AML.TA0008',
    name: 'Discovery',
    shortName: 'Discovery',
    description: 'Extracting information about model internals, system prompts, training data, and capabilities.',
    techniques: ['AML.T0056 Extract LLM System Prompt', 'AML.T0057 Discover Model Capabilities', 'AML.T0041 ML Model Inference API Access'],
    owaspOverlap: ['LLM02', 'LLM07'],
    caseStudies: ['System prompt extraction attacks', 'Training data membership inference'],
  },
  {
    id: 'AML.TA0001',
    name: 'AI Attack Staging',
    shortName: 'Staging',
    description: 'Preparing and staging adversarial inputs for model manipulation, including crafted prompts and perturbations.',
    techniques: ['AML.T0022 Craft Adversarial Data', 'AML.T0052 Inject Data into RAG', 'AML.T0021 Stage Backdoor Trigger'],
    owaspOverlap: ['LLM04', 'LLM08'],
    caseStudies: ['RAG poisoning via public documents', 'Vector database injection'],
  },
  {
    id: 'AML.TA0010',
    name: 'Exfiltration',
    shortName: 'Exfil',
    description: 'Extracting sensitive data including training data, model weights, PII, and proprietary information.',
    techniques: ['AML.T0025 Extract ML Model', 'AML.T0024 Exfiltration via ML Inference API', 'AML.T0037 Data Reconstruction'],
    owaspOverlap: ['LLM02'],
    caseStudies: ['Model extraction via query access', 'Training data extraction attacks'],
  },
  {
    id: 'AML.TA0011',
    name: 'Impact',
    shortName: 'Impact',
    description: 'Achieving adversary objectives including model corruption, service disruption, misinformation, and reputational damage.',
    techniques: ['AML.T0031 Erode ML Model Integrity', 'AML.T0029 Denial of ML Service', 'AML.T0058 LLM-Generated Misinformation'],
    owaspOverlap: ['LLM09', 'LLM10'],
    caseStudies: ['Tay Twitter manipulation', 'Election misinformation via AI'],
  },
];

// Tactic flow order for the matrix visualization
const TACTIC_FLOW_ORDER = [
  'AML.TA0002', // Reconnaissance
  'AML.TA0003', // Resource Development
  'AML.TA0004', // Initial Access
  'AML.TA0000', // AI Model Access
  'AML.TA0005', // Execution
  'AML.TA0007', // Defense Evasion
  'AML.TA0008', // Discovery
  'AML.TA0001', // AI Attack Staging
  'AML.TA0010', // Exfiltration
  'AML.TA0011', // Impact
];

// OWASP LLM Top 10 reference for cross-mapping
const OWASP_LLM_REFS: Record<string, { name: string; severity: 'critical' | 'high' | 'medium' }> = {
  LLM01: { name: 'Prompt Injection', severity: 'critical' },
  LLM02: { name: 'Sensitive Info Disclosure', severity: 'critical' },
  LLM03: { name: 'Supply Chain', severity: 'high' },
  LLM04: { name: 'Data/Model Poisoning', severity: 'high' },
  LLM05: { name: 'Improper Output Handling', severity: 'high' },
  LLM06: { name: 'Excessive Agency', severity: 'critical' },
  LLM07: { name: 'System Prompt Leakage', severity: 'high' },
  LLM08: { name: 'Vector/Embedding Weakness', severity: 'high' },
  LLM09: { name: 'Misinformation', severity: 'high' },
  LLM10: { name: 'Unbounded Consumption', severity: 'medium' },
};

const severityColors: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700 border-rose-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  medium: 'bg-sky-100 text-sky-700 border-sky-200',
};

// -------------------------------- Component Props --------------------------------
interface MitreAtlasViewProps {
  embedded?: boolean;
  onNavigateToProgram?: () => void;
}

export default function MitreAtlasView({ embedded = false, onNavigateToProgram }: MitreAtlasViewProps = {}) {
  const [expandedTactic, setExpandedTactic] = useState<string | null>(null);

  // Get MITRE ATLAS framework data from mockData
  const atlasFramework = useMemo(() => {
    return COMPLIANCE_CENTER_FRAMEWORKS.find(fw => fw.id === 'mitre-atlas') as ComplianceFramework | undefined;
  }, []);

  // Compute status for each ATLAS tactic based on control data
  const tacticStatuses = useMemo(() => {
    if (!atlasFramework) return {};
    const statuses: Record<string, { status: string; controls: number; passed: number }> = {};

    atlasFramework.categories.forEach(cat => {
      // Extract tactic ID from category name (e.g., "Reconnaissance (AML.TA0002)" -> "AML.TA0002")
      const match = cat.name.match(/\((AML\.TA\d{4})\)/);
      if (match) {
        const tacticId = match[1];
        const controls = cat.controls.length;
        const passed = cat.controls.filter(c => c.status === 'pass').length;
        const inProgress = cat.controls.filter(c => c.status === 'in-progress').length;

        let status = 'not-started';
        if (passed === controls) status = 'pass';
        else if (passed + inProgress > 0) status = 'in-progress';
        else if (cat.controls.some(c => c.status === 'fail')) status = 'fail';

        statuses[tacticId] = { status, controls, passed };
      }
    });
    return statuses;
  }, [atlasFramework]);

  // Compute overall posture
  const posture = useMemo(() => {
    if (!atlasFramework) return { score: 0, passed: 0, inProgress: 0, gaps: 0, total: 0 };
    const controls = atlasFramework.categories.flatMap(c => c.controls);
    const total = controls.length;
    const passed = controls.filter(c => c.status === 'pass').length;
    const inProgress = controls.filter(c => c.status === 'in-progress').length;
    const gaps = controls.filter(c => c.status === 'fail').length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;
    return { score, passed, inProgress, gaps, total };
  }, [atlasFramework]);

  // Get controls for a specific tactic
  const getControlsForTactic = (tacticId: string) => {
    if (!atlasFramework) return [];
    const category = atlasFramework.categories.find(c => c.name.includes(tacticId));
    return category?.controls || [];
  };

  // Get tactic by ID
  const getTacticById = (id: string) => ATLAS_TACTICS.find(t => t.id === id);

  const body = (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-rose-50 to-pink-50 rounded-xl border border-rose-200/60 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">MITRE ATLAS</h2>
            <p className="text-sm text-slate-600 mt-1">
              <strong>Adversarial Threat Landscape for Artificial Intelligence Systems</strong> is a knowledge base
              of adversary tactics, techniques, and procedures (TTPs) specifically targeting AI/ML systems.
              ATLAS extends the MITRE ATT&CK framework methodology for machine learning threats.
            </p>
            <div className="flex items-center gap-4 mt-3 text-[11px]">
              <a
                href="https://atlas.mitre.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-rose-600 hover:text-rose-700 underline"
              >
                atlas.mitre.org
              </a>
              <span className="text-slate-400">|</span>
              <span className="text-slate-500">Last audit: {atlasFramework?.lastAudit || 'N/A'}</span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-500">Next: {atlasFramework?.nextAudit || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Threat Intelligence Context Callout */}
      <div className="flex items-start gap-3 bg-rose-50 rounded-xl border border-rose-200/60 px-4 py-3">
        <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-semibold text-rose-800">Adversary-Centric Threat Intelligence</div>
          <div className="text-[11px] text-rose-700 mt-0.5">
            ATLAS documents real-world case studies of attacks against AI systems, mapping adversary behaviors
            to defensive controls. Use this view to understand attacker TTPs and validate your defensive posture
            against known AI threat vectors.
          </div>
        </div>
      </div>

      {/* Program Builder Link */}
      {onNavigateToProgram && (
        <div className="flex items-center justify-between bg-violet-50 rounded-xl border border-violet-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-violet-600 text-sm">+</span>
            <span className="text-sm text-violet-800">Track MITRE ATLAS controls in your governance program</span>
          </div>
          <button
            onClick={onNavigateToProgram}
            className="text-xs font-medium px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
          >
            Add to Program
          </button>
        </div>
      )}

      {/* Overall Security Posture Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Defense Posture"
          value={`${posture.score}%`}
          variant={posture.score >= 80 ? 'success' : posture.score >= 60 ? 'warning' : 'danger'}
          sub="ATLAS coverage"
        />
        <StatCard label="Controls" value={posture.total} />
        <StatCard label="Defended" value={posture.passed} variant="success" />
        <StatCard label="In Progress" value={posture.inProgress} variant="warning" />
        <StatCard label="Gaps" value={posture.gaps} variant={posture.gaps > 0 ? 'danger' : 'muted'} />
      </div>

      {/* ATLAS Tactics Matrix - Horizontal Flow */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-slate-900">ATLAS Tactics Matrix</div>
          <div className="flex items-center gap-3 text-[9px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Defended</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> In Progress</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Gap</span>
          </div>
        </div>

        {/* Horizontal tactic flow */}
        <div className="relative overflow-x-auto">
          <div className="flex items-start gap-1 min-w-max pb-2">
            {TACTIC_FLOW_ORDER.map((tacticId, idx) => {
              const tactic = getTacticById(tacticId);
              const status = tacticStatuses[tacticId];
              if (!tactic) return null;

              const statusColor = status?.status === 'pass' ? 'bg-emerald-500' :
                                  status?.status === 'in-progress' ? 'bg-amber-500' :
                                  'bg-rose-500';
              const borderColor = status?.status === 'pass' ? 'border-emerald-300' :
                                  status?.status === 'in-progress' ? 'border-amber-300' :
                                  'border-rose-300';
              const bgColor = status?.status === 'pass' ? 'bg-emerald-50' :
                              status?.status === 'in-progress' ? 'bg-amber-50' :
                              'bg-rose-50';

              return (
                <div key={tacticId} className="flex items-center">
                  <button
                    onClick={() => setExpandedTactic(expandedTactic === tacticId ? null : tacticId)}
                    className={`w-24 p-2 rounded-lg border ${borderColor} ${bgColor} hover:shadow-md transition-all text-center flex-shrink-0`}
                  >
                    <div className={`w-3 h-3 rounded-full ${statusColor} mx-auto mb-1`} />
                    <div className="text-[9px] font-semibold text-slate-700 truncate">{tactic.shortName}</div>
                    <div className="text-[8px] text-slate-500 mt-0.5">{tactic.id}</div>
                    <div className="text-[8px] text-slate-400 mt-0.5">
                      {status?.passed || 0}/{status?.controls || 0}
                    </div>
                  </button>
                  {idx < TACTIC_FLOW_ORDER.length - 1 && (
                    <div className="w-4 h-px bg-slate-300 flex-shrink-0">
                      <div className="w-0 h-0 border-t-[3px] border-b-[3px] border-l-[4px] border-transparent border-l-slate-300 float-right -mt-[3px]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Expanded tactic detail */}
          {expandedTactic && (
            <div className="mt-4 p-4 bg-slate-50/80 rounded-lg border border-slate-200">
              {(() => {
                const tactic = getTacticById(expandedTactic);
                const controls = getControlsForTactic(expandedTactic);
                if (!tactic) return null;

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-700 mb-1">{tactic.name}</div>
                      <div className="text-[10px] text-slate-500 mb-3">{tactic.description}</div>

                      <div className="text-[10px] font-semibold text-slate-600 mb-1">Key Techniques:</div>
                      <ul className="space-y-0.5">
                        {tactic.techniques.map((tech, i) => (
                          <li key={i} className="text-[9px] text-slate-500 flex items-start gap-1">
                            <span className="text-rose-400 mt-0.5">-</span>
                            {tech}
                          </li>
                        ))}
                      </ul>

                      {tactic.caseStudies && tactic.caseStudies.length > 0 && (
                        <>
                          <div className="text-[10px] font-semibold text-slate-600 mt-3 mb-1">Case Studies:</div>
                          <ul className="space-y-0.5">
                            {tactic.caseStudies.map((cs, i) => (
                              <li key={i} className="text-[9px] text-slate-500 flex items-start gap-1">
                                <span className="text-amber-400 mt-0.5">!</span>
                                {cs}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold text-slate-600 mb-2">Control Status:</div>
                      <div className="space-y-1.5">
                        {controls.map(ctrl => (
                          <div key={ctrl.id} className="flex items-center gap-2 text-[10px]">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              ctrl.status === 'pass' ? 'bg-emerald-500' :
                              ctrl.status === 'in-progress' ? 'bg-amber-500' :
                              'bg-rose-500'
                            }`} />
                            <span className="text-slate-600 flex-1">{ctrl.label}</span>
                            {ctrl.evidence && (
                              <span className="text-slate-400 truncate max-w-[120px]">({ctrl.evidence})</span>
                            )}
                          </div>
                        ))}
                      </div>

                      {tactic.owaspOverlap && tactic.owaspOverlap.length > 0 && (
                        <>
                          <div className="text-[10px] font-semibold text-slate-600 mt-3 mb-1">OWASP LLM Overlap:</div>
                          <div className="flex flex-wrap gap-1">
                            {tactic.owaspOverlap.map(owaspId => {
                              const ref = OWASP_LLM_REFS[owaspId];
                              if (!ref) return null;
                              return (
                                <span
                                  key={owaspId}
                                  className={`text-[9px] px-1.5 py-0.5 rounded border ${severityColors[ref.severity]}`}
                                >
                                  {owaspId}: {ref.name}
                                </span>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Per-Tactic Control Coverage Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-900">Per-Tactic Control Coverage</div>
        </div>
        <div className="divide-y divide-slate-100">
          {ATLAS_TACTICS.map(tactic => {
            const status = tacticStatuses[tactic.id];
            const controls = getControlsForTactic(tactic.id);

            return (
              <div key={tactic.id} className="px-5 py-3 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      status?.status === 'pass' ? 'bg-emerald-500' :
                      status?.status === 'in-progress' ? 'bg-amber-500' :
                      'bg-rose-500'
                    }`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-800">{tactic.id}</span>
                        <span className="text-[11px] text-slate-700">{tactic.name}</span>
                      </div>
                      <div className="text-[9px] text-slate-400 mt-0.5 line-clamp-1">{tactic.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {tactic.owaspOverlap && tactic.owaspOverlap.length > 0 && (
                      <div className="flex items-center gap-1">
                        {tactic.owaspOverlap.slice(0, 2).map(owaspId => (
                          <span
                            key={owaspId}
                            className="text-[8px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200"
                          >
                            {owaspId}
                          </span>
                        ))}
                        {tactic.owaspOverlap.length > 2 && (
                          <span className="text-[8px] text-slate-400">+{tactic.owaspOverlap.length - 2}</span>
                        )}
                      </div>
                    )}
                    <span className={`text-[9px] px-2 py-1 rounded ${
                      status?.status === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                      status?.status === 'in-progress' ? 'bg-amber-100 text-amber-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>
                      {status?.passed || 0}/{status?.controls || 0} controls
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* OWASP LLM Top 10 Cross-Reference */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="text-sm font-semibold text-slate-900 mb-4">ATLAS to OWASP LLM Top 10 Cross-Reference</div>
        <div className="text-[10px] text-slate-500 mb-4">
          MITRE ATLAS tactics map to OWASP LLM Top 10 risks. Use both frameworks together for comprehensive coverage:
          ATLAS for adversary TTPs and OWASP for application security risks.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-2 text-slate-600 font-semibold">ATLAS Tactic</th>
                <th className="text-left py-2 px-2 text-slate-600 font-semibold">OWASP LLM Risks</th>
                <th className="text-left py-2 px-2 text-slate-600 font-semibold">Shared Threat Surface</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ATLAS_TACTICS.filter(t => t.owaspOverlap && t.owaspOverlap.length > 0).map(tactic => (
                <tr key={tactic.id} className="hover:bg-slate-50/50">
                  <td className="py-2 px-2">
                    <span className="font-semibold text-slate-700">{tactic.shortName}</span>
                    <span className="text-slate-400 ml-1 text-[9px]">({tactic.id})</span>
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex flex-wrap gap-1">
                      {tactic.owaspOverlap?.map(owaspId => {
                        const ref = OWASP_LLM_REFS[owaspId];
                        if (!ref) return null;
                        return (
                          <span
                            key={owaspId}
                            className={`px-1.5 py-0.5 rounded border ${severityColors[ref.severity]}`}
                          >
                            {owaspId}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-slate-500">
                    {tactic.id === 'AML.TA0002' && 'Information gathering, prompt extraction'}
                    {tactic.id === 'AML.TA0003' && 'Supply chain compromise, data poisoning'}
                    {tactic.id === 'AML.TA0004' && 'Injection vectors, compromised dependencies'}
                    {tactic.id === 'AML.TA0000' && 'Resource exhaustion, API abuse'}
                    {tactic.id === 'AML.TA0005' && 'Tool execution, code generation risks'}
                    {tactic.id === 'AML.TA0007' && 'Guardrail bypass, jailbreaking'}
                    {tactic.id === 'AML.TA0008' && 'Sensitive info extraction, prompt leakage'}
                    {tactic.id === 'AML.TA0001' && 'RAG poisoning, vector DB attacks'}
                    {tactic.id === 'AML.TA0010' && 'PII exfiltration, model theft'}
                    {tactic.id === 'AML.TA0011' && 'Misinformation, service disruption'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Key Differentiators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-rose-50/80 rounded-xl border border-rose-200/60 p-4">
          <div className="text-[11px] font-semibold text-rose-800 mb-2">MITRE ATLAS Focus</div>
          <ul className="space-y-1 text-[10px] text-rose-700">
            <li><strong>Adversary-centric:</strong> Documents attacker behaviors and TTPs</li>
            <li><strong>Case study driven:</strong> Based on real-world AI attacks</li>
            <li><strong>Extends ATT&CK:</strong> Familiar methodology for security teams</li>
            <li><strong>ML-specific:</strong> Covers model extraction, poisoning, evasion</li>
          </ul>
        </div>
        <div className="bg-sky-50/80 rounded-xl border border-sky-200/60 p-4">
          <div className="text-[11px] font-semibold text-sky-800 mb-2">Use Together With OWASP</div>
          <ul className="space-y-1 text-[10px] text-sky-700">
            <li><strong>ATLAS:</strong> Threat intelligence and attacker perspective</li>
            <li><strong>OWASP:</strong> Application security risks and mitigations</li>
            <li><strong>Combined:</strong> Full coverage from threat to control</li>
            <li><strong>Mapping:</strong> Cross-reference for gap analysis</li>
          </ul>
        </div>
      </div>
    </div>
  );

  if (embedded) return body;
  return (
    <GovernPageLayout
      title="MITRE ATLAS"
      description="Adversarial Threat Landscape for AI Systems - knowledge base of attacker tactics, techniques, and procedures targeting AI/ML."
      badge={<MockDataBadge integration="ATLAS mapping - control-plane backend" />}
    >
      {body}
    </GovernPageLayout>
  );
}
