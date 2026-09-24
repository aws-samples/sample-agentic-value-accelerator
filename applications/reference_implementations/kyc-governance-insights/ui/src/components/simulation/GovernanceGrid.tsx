import { useState, useMemo, useRef, useCallback } from 'react';
import {
  riskControlMapping,
  controls,
  services,
} from '../../data/riskControlMapping';
import type { ControlItem, ServiceItem, RiskControlLink } from '../../data/riskControlMapping';
import Tooltip from '../shared/Tooltip';
import DetailPanel from '../shared/DetailPanel';
import type { PanelItem } from '../shared/DetailPanel';

interface GovernanceGridProps {
  currentStep: number;
}

/* --- Risk category definitions --- */
const RISK_CATEGORIES: { key: string; label: string; icon: string; riskIds: string[] }[] = [
  {
    key: 'security',
    label: 'Security',
    icon: '🔒',
    riskIds: ['injection-document', 'data-exfiltration', 'document-forgery', 'data-source-manipulation', 'token-manipulation', 'unauthorised-data-access'],
  },
  {
    key: 'accuracy',
    label: 'Accuracy',
    icon: '🎯',
    riskIds: ['hallucination', 'ocr-error', 'calculation-error', 'sanctions-false-negative', 'false-positive-flooding', 'geographic-risk-miscalc'],
  },
  {
    key: 'compliance',
    label: 'Compliance',
    icon: '📜',
    riskIds: ['ubo-misidentification', 'stale-screening-data', 'sar-filing-error', 'audit-trail-incomplete', 'data-retention-violation', 'policy-bypass', 'rule-staleness'],
  },
  {
    key: 'operational',
    label: 'Operational',
    icon: '⚙️',
    riskIds: ['model-drift', 'agent-conflict', 'blast-radius', 'config-drift', 'escalation-failure', 'sla-breach', 'reviewer-bias', 'decision-inconsistency', 'data-lineage-loss'],
  },
];

/* --- Tooltip descriptions (legacy + new fallback to risk.description) --- */
const controlDescriptions: Record<string, string> = {
  'automated-reasoning': 'Cedar policies that formally verify agent outputs via Bedrock Automated Reasoning.',
  'guardrails-input': 'Bedrock Guardrails scan all incoming prompts for injection, toxicity, and PII leakage.',
  'guardrails-output': 'Bedrock Guardrails scan agent responses before delivery to catch hallucination and policy violations.',
  'contextual-grounding': 'Verifies that agent claims are grounded in the retrieved source documents.',
  'verified-permissions-cedar': 'Amazon Verified Permissions enforces Cedar policies as runtime authorization gates.',
  'verified-permissions-read': 'Cedar policy scoping external API access to read-only.',
  'verified-permissions-tool-auth': 'Cedar policy ensuring agent calls mandatory tools (e.g., sanctions API).',
  'verified-permissions-reviewer': 'Cedar policy restricting approval actions to designated reviewers.',
  'step-functions-hitl': 'TaskToken callback pattern with SLA-driven escalation timers.',
  'gateway-interceptors': 'AgentCore Gateway intercepts and validates every API call before execution.',
  'tier-limits': 'Exposure limits restrict blast radius based on customer risk tier and transaction size.',
  'llm-as-judge': "A second LLM evaluates the primary agent's output for accuracy and faithfulness.",
  'lambda-validators': 'Lambda functions run deterministic validation (schema checks, calculations, sanctions matching).',
  'continuous-eval': 'Ongoing metric tracking detects accuracy drift and triggers policy tightening.',
  'auto-tighten': 'Automatically restricts agent autonomy if evaluation scores drop below threshold.',
  'rai-evaluator': 'Responsible AI evaluator checks outputs for bias across protected attributes.',
  arbiter: 'Resolves disagreements between multiple agents by applying consensus or priority rules.',
  'iam-least-privilege': 'Each Lambda and agent has minimum required permissions.',
  'kms-encryption': 'All data encrypted at rest and in transit via AWS KMS.',
  'vpc-isolation': 'Backend compute runs in private subnets with no direct internet access.',
  'waf-rules': 'WAF blocks common attack patterns, rate limits requests, and geo-restricts access.',
  'cloudwatch-alarms': 'Automated alerts on error rate spikes, latency thresholds, and cost anomalies.',
  'dynamodb-ttl': 'Session/cache data auto-expires to limit exposure and enforce retention.',
  's3-object-lock': 'Immutable document storage for regulatory record-keeping.',
  'sns-notifications': 'Reviewer notification delivery for HITL workflows.',
};

const serviceDescriptions: Record<string, string> = {
  bedrock: 'Amazon Bedrock provides foundation model inference (Claude, Titan) for the KYC agent.',
  'bedrock-ar': 'Bedrock Automated Reasoning uses Cedar policies for formal verification of outputs.',
  'bedrock-guardrails': 'Content filtering, PII detection, and grounding checks on all model I/O.',
  agentcore: 'Amazon Bedrock AgentCore manages agent lifecycle, deployment, and runtime orchestration.',
  'agentcore-gateway': 'API proxy that routes, authenticates, and rate-limits all agent invocations.',
  'agentcore-evaluations': 'Framework for running custom evaluation metrics against agent outputs.',
  'verified-permissions': 'Cedar-based policy engine for fine-grained authorization decisions.',
  'step-functions': 'AWS Step Functions orchestrates HITL workflows with TaskToken callbacks.',
  lambda: 'AWS Lambda runs deterministic validation functions (sanctions check, schema validation).',
  textract: 'Amazon Textract extracts structured data from documents with confidence scoring.',
  dynamodb: 'Amazon DynamoDB stores screening results and decision records with TTL.',
  s3: 'Amazon S3 provides immutable document storage and long-term archival.',
  iam: 'AWS IAM enforces least-privilege access for all agents and functions.',
  kms: 'AWS KMS provides encryption key management for data protection.',
  vpc: 'Amazon VPC provides network isolation for backend compute.',
  waf: 'AWS WAF filters malicious requests at the edge.',
  cloudwatch: 'Metrics, alarms, and dashboards for agent performance and governance compliance.',
  'sns-ses': 'Amazon SNS/SES delivers notifications to human reviewers.',
};

function ExpLabel({ text }: { text: string }) {
  if (!text.includes('Automated Reasoning')) return <>{text}</>;
  const idx = text.indexOf('Automated Reasoning');
  const before = text.slice(0, idx);
  const after = text.slice(idx + 'Automated Reasoning'.length);
  return (
    <>
      {before}Automated Reasoning<span style={{ fontSize: '8px', color: '#ff9800', fontWeight: 700, verticalAlign: 'super', marginLeft: '2px' }}>EXP</span>{after}
    </>
  );
}

/* --- Main component --- */
export default function GovernanceGrid({ currentStep }: GovernanceGridProps) {
  const [hoveredItem, setHoveredItem] = useState<{ id: string; type: 'risk' | 'control' | 'service' } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set(RISK_CATEGORIES.map(c => c.key)));
  const [lowRiskExpanded, setLowRiskExpanded] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PanelItem | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleItemClick = useCallback((id: string, type: 'risk' | 'control' | 'service') => {
    setSelectedItem(prev => (prev && prev.id === id && prev.type === type) ? null : { id, type });
  }, []);

  const activeAtStep = useMemo(() => {
    const riskIds = new Set<string>();
    const controlIds = new Set<string>();
    const serviceIds = new Set<string>();
    for (const link of riskControlMapping) {
      if (link.activeAtSteps.includes(currentStep)) {
        riskIds.add(link.risk.id);
        link.controls.forEach((c) => controlIds.add(c));
        link.services.forEach((s) => serviceIds.add(s));
      }
    }
    return { riskIds, controlIds, serviceIds };
  }, [currentStep]);

  const highlighted = useMemo(() => {
    if (!hoveredItem) return null;
    const h = { risks: new Set<string>(), controls: new Set<string>(), services: new Set<string>() };
    if (hoveredItem.type === 'risk') {
      const link = riskControlMapping.find((l) => l.risk.id === hoveredItem.id);
      if (link) { h.risks.add(link.risk.id); link.controls.forEach((c) => h.controls.add(c)); link.services.forEach((s) => h.services.add(s)); }
    } else if (hoveredItem.type === 'control') {
      for (const link of riskControlMapping) {
        if (link.controls.includes(hoveredItem.id)) { h.risks.add(link.risk.id); h.controls.add(hoveredItem.id); link.services.forEach((s) => h.services.add(s)); }
      }
    } else {
      for (const link of riskControlMapping) {
        if (link.services.includes(hoveredItem.id)) { h.risks.add(link.risk.id); h.services.add(hoveredItem.id); link.controls.forEach((c) => h.controls.add(c)); }
      }
    }
    return h;
  }, [hoveredItem]);

  const risksByCategory = useMemo(() => {
    const linkMap = new Map<string, RiskControlLink>();
    for (const link of riskControlMapping) {
      linkMap.set(link.risk.id, link);
    }

    const lowRisks: RiskControlLink[] = [];
    const categorized: { category: typeof RISK_CATEGORIES[number]; risks: RiskControlLink[] }[] = [];

    for (const cat of RISK_CATEGORIES) {
      const catRisks: RiskControlLink[] = [];
      for (const riskId of cat.riskIds) {
        const link = linkMap.get(riskId);
        if (!link) continue;
        if (link.risk.severity === 'medium') {
          lowRisks.push(link);
        } else {
          catRisks.push(link);
        }
      }
      categorized.push({ category: cat, risks: catRisks });
    }

    return { categorized, lowRisks };
  }, []);

  function getActiveCountForCategory(risks: RiskControlLink[]): number {
    return risks.filter(r => activeAtStep.riskIds.has(r.risk.id)).length;
  }

  function toggleCategory(key: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function getPillOpacity(id: string, column: 'risk' | 'control' | 'service'): number {
    if (highlighted) {
      const set = column === 'risk' ? highlighted.risks : column === 'control' ? highlighted.controls : highlighted.services;
      return set.has(id) ? 1 : 0.2;
    }
    const activeSet = column === 'risk' ? activeAtStep.riskIds : column === 'control' ? activeAtStep.controlIds : activeAtStep.serviceIds;
    return activeSet.has(id) ? 1 : 0.3;
  }

  function getPillGlow(id: string, column: 'risk' | 'control' | 'service'): string {
    if (highlighted) {
      const set = column === 'risk' ? highlighted.risks : column === 'control' ? highlighted.controls : highlighted.services;
      if (set.has(id)) return '0 0 8px rgba(59,130,246,0.4)';
    }
    const activeSet = column === 'risk' ? activeAtStep.riskIds : column === 'control' ? activeAtStep.controlIds : activeAtStep.serviceIds;
    if (activeSet.has(id)) return '0 0 6px rgba(59,130,246,0.2)';
    return 'none';
  }

  const pillBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 500,
    background: 'var(--bg-secondary)', cursor: 'pointer',
    transition: 'all 0.2s ease', whiteSpace: 'nowrap',
    border: 'none',
  };

  const categoryHeaderStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '4px 6px', borderRadius: '4px', cursor: 'pointer',
    fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)',
    background: 'transparent', border: 'none', width: '100%',
    transition: 'background 0.15s ease',
  };

  function renderRiskPill(link: RiskControlLink) {
    return (
      <Tooltip key={link.risk.id} text={link.risk.description}>
        <div
          style={{
            ...pillBase,
            opacity: getPillOpacity(link.risk.id, 'risk'),
            boxShadow: getPillGlow(link.risk.id, 'risk'),
            outline: selectedItem?.id === link.risk.id ? '1.5px solid #3b82f6' : 'none',
          }}
          onMouseEnter={() => setHoveredItem({ id: link.risk.id, type: 'risk' })}
          onClick={() => handleItemClick(link.risk.id, 'risk')}
        >
          <span>{link.risk.icon}</span>
          <span style={{ color: 'var(--text-primary)' }}>{link.risk.label}</span>
        </div>
      </Tooltip>
    );
  }


  return (
    <div
      ref={gridRef}
      style={{
        background: 'var(--bg-card)', borderRadius: '10px', padding: '14px',
        marginTop: '4px',
      }}
      onMouseLeave={() => setHoveredItem(null)}
    >
      {/* CSS animation for detail panel */}
      <style>{`
        @keyframes slideInFromRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
        Governance Map
      </div>

      {/* 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        {/* RISKS — categorized & collapsible */}
        <div>
          <div style={{ fontSize: '8px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Risks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {risksByCategory.categorized.map(({ category, risks }) => {
              const activeCount = getActiveCountForCategory(risks);
              const isExpanded = expandedCategories.has(category.key);
              return (
                <div key={category.key}>
                  <button
                    style={categoryHeaderStyle}
                    onClick={() => toggleCategory(category.key)}
                    onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'; }}
                    onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: '8px', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
                    <span>{category.icon}</span>
                    <span>{category.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '9px', color: activeCount > 0 ? '#3b82f6' : 'var(--text-muted)', fontWeight: 700 }}>
                      ({activeCount})
                    </span>
                  </button>
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '12px', marginTop: '3px', marginBottom: '4px' }}>
                      {risks.map(renderRiskPill)}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Low Inherent Risk section */}
            {risksByCategory.lowRisks.length > 0 && (
              <div style={{ marginTop: '6px', borderTop: '1px solid var(--bg-secondary)', paddingTop: '4px' }}>
                <button
                  style={{ ...categoryHeaderStyle, fontSize: '9px', color: 'var(--text-muted)' }}
                  onClick={() => setLowRiskExpanded(!lowRiskExpanded)}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: '8px', transition: 'transform 0.15s', transform: lowRiskExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
                  <span>Low Inherent Risk</span>
                  <span style={{ marginLeft: 'auto', fontSize: '9px' }}>
                    ({risksByCategory.lowRisks.filter(r => activeAtStep.riskIds.has(r.risk.id)).length})
                  </span>
                </button>
                {lowRiskExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '12px', marginTop: '3px' }}>
                    {risksByCategory.lowRisks.map(renderRiskPill)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CONTROLS */}
        <div>
          <div style={{ fontSize: '8px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Controls</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {controls.map((ctrl: ControlItem) => (
              <Tooltip key={ctrl.id} text={controlDescriptions[ctrl.id] || ctrl.description || `${ctrl.label} (${ctrl.nature})`}>
                <div
                  style={{
                    ...pillBase,
                    opacity: getPillOpacity(ctrl.id, 'control'),
                    boxShadow: getPillGlow(ctrl.id, 'control'),
                    outline: selectedItem?.id === ctrl.id ? '1.5px solid #3b82f6' : 'none',
                  }}
                  onMouseEnter={() => setHoveredItem({ id: ctrl.id, type: 'control' })}
                  onClick={() => handleItemClick(ctrl.id, 'control')}
                >
                  <span style={{ fontSize: '9px', color: ctrl.nature === 'deterministic' ? '#10b981' : ctrl.nature === 'probabilistic' ? '#f59e0b' : '#3b82f6' }}>
                    {ctrl.nature === 'deterministic' ? '✓' : ctrl.nature === 'probabilistic' ? '⚠' : '📊'}
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}><ExpLabel text={ctrl.label} /></span>
                </div>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* SERVICES */}
        <div>
          <div style={{ fontSize: '8px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>AWS Services</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {services.map((svc: ServiceItem) => (
              <Tooltip key={svc.id} text={serviceDescriptions[svc.id] || svc.label}>
                <div
                  style={{
                    ...pillBase,
                    opacity: getPillOpacity(svc.id, 'service'),
                    boxShadow: getPillGlow(svc.id, 'service'),
                    outline: selectedItem?.id === svc.id ? '1.5px solid #3b82f6' : 'none',
                  }}
                  onMouseEnter={() => setHoveredItem({ id: svc.id, type: 'service' })}
                  onClick={() => handleItemClick(svc.id, 'service')}
                >
                  <span>{svc.icon}</span>
                  <span style={{ color: 'var(--text-primary)' }}><ExpLabel text={svc.label} /></span>
                </div>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      <DetailPanel selectedItem={selectedItem} onClose={() => setSelectedItem(null)} excludeRef={gridRef} />
    </div>
  );
}
