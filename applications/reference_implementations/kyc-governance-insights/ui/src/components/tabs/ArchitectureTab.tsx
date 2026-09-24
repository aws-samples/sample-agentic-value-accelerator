import React, { useState } from 'react';
import { usePersona } from '../../contexts/PersonaContext';
import { threats, type Threat } from '../../data/threatModelData';
import { modelChainSteps } from '../../data/multiModelChainData';
import { awsServices } from '../../data/awsServicesData';
import { resilienceMetrics, securityDimensions, compositeSecurityScore } from '../../data/resilienceData';
import InterventionStatus from '../architecture/InterventionStatus';
import AttackSurfacePanel from '../architecture/AttackSurfacePanel';
import ResilienceCompliance from '../architecture/ResilienceCompliance';
import RequestFlowDiagram from '../architecture/RequestFlowDiagram';
import DefenceInDepthLayers from '../architecture/DefenceInDepthLayers';
import DataFlowMap from '../architecture/DataFlowMap';
import ModelInventory from '../compliance/ModelInventory';
import SectionDescription from '../shared/SectionDescription';
import CollapsibleSection from '../shared/CollapsibleSection';

/* --- Security Score (preserved from iteration 16) --- */
function SecurityScore() {
  const color = compositeSecurityScore >= 90 ? '#10b981' : '#f59e0b';
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '20px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', fontWeight: 800, color }}>{compositeSecurityScore}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Security Posture</div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {securityDimensions.map(d => (
          <div key={d.id} style={{ fontSize: '0.7rem', padding: '4px 8px', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{d.label}</span>
            <span style={{ color: d.score >= 95 ? '#10b981' : '#f59e0b', marginLeft: '6px' }}>{d.score}%</span>
          </div>
        ))}
      </div>
      <span style={{ fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px', background: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 700 }}>Enterprise Grade {'\u2713'}</span>
    </div>
  );
}

/* --- Threat Heatmap (preserved from iteration 16) --- */
function ThreatHeatmap() {
  const [selected, setSelected] = useState<Threat | null>(null);
  const cellColor = (l: string, i: string) => {
    if (l === 'high' && i === 'high') return '#ef4444';
    if ((l === 'high' && i === 'medium') || (l === 'medium' && i === 'high')) return '#f59e0b';
    return '#10b981';
  };
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Threat Model (9 vectors)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
        {threats.map(t => (
          <button key={t.id} onClick={() => setSelected(selected?.id === t.id ? null : t)} style={{ padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: `${cellColor(t.likelihood, t.impact)}20`, textAlign: 'left' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: cellColor(t.likelihood, t.impact) }}>{t.name}</div>
          </button>
        ))}
      </div>
      {selected && <div style={{ marginTop: '8px', padding: '8px', borderRadius: '6px', background: 'var(--bg-secondary)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{selected.description} | Controls: {selected.controls.join(', ')}</div>}
    </div>
  );
}

/* --- Multi-Model Chain (preserved from iteration 16) --- */
function MultiModelChain() {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Multi-Model Governance Chain</h3>
        <span style={{ fontSize: '0.55rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,153,0,0.12)', color: '#ff9900', fontWeight: 600 }}>Only on AWS</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto', padding: '4px 0' }}>
        {modelChainSteps.map((step, i) => (
          <React.Fragment key={step.id}>
            <div style={{ padding: '6px 10px', borderRadius: '6px', background: `${step.color}15`, border: `1px solid ${step.color}40`, textAlign: 'center', minWidth: '80px' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: step.color }}>{step.model}</div>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{step.role}</div>
            </div>
            {step.gateAfter && <span style={{ fontSize: '0.7rem', color: '#10b981' }}>{'\u2192'}{step.gateType === 'cedar' ? 'Cedar' : 'Guard'}{'\u2713\u2192'}</span>}
          </React.Fragment>
        ))}
        <div style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#10b981' }}>Decision</div>
        </div>
      </div>
    </div>
  );
}

/* === MAIN TAB (persona-tiered) === */
export const ArchitectureTab: React.FC = () => {
  const { persona } = usePersona();
  const isEng = persona === 'engineering';
  const isCompliance = persona === 'compliance';
  const showDeepDive = isEng || isCompliance;

  return (
    <div data-testid="architecture.container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SectionDescription text="Security posture, threat heatmap, multi-model chain, AWS services, and resilience." />
      {/* Primary: Request Flow Diagram (ALL personas — tiered detail) */}
      <RequestFlowDiagram />

      {/* Security Score (Executive + Engineering) */}
      {(persona === 'cro-fleet' || isEng) && <SecurityScore />}

      {/* Defence in Depth (Tier 1 — kept expanded) */}
      {showDeepDive && <DefenceInDepthLayers />}

      {/* Data Flow & PII Map (depth — collapsed) */}
      {showDeepDive && (
        <CollapsibleSection title="Data Flow & PII Map" defaultCollapsed info="How customer data moves across the system — where PII lives, encryption at each hop, cross-boundary edges, and residency, mapped to GDPR / UK DPA.">
          <DataFlowMap />
        </CollapsibleSection>
      )}

      {/* Multi-Model Chain (Tier 1 — kept expanded; Business Ops sees this + Engineering) */}
      {(persona === 'business-ops' || isEng) && <MultiModelChain />}

      {/* Engineering: preserved sub-sections from iterations 16-17 */}
      {isEng && (
        <>
          <div data-testid="compliance.model-inventory">
            <ModelInventory readOnly />
          </div>
          <CollapsibleSection title="Threat Model" defaultCollapsed info="Nine agentic-AI threat vectors scored by likelihood × impact, each mapped to the controls that mitigate it.">
            <ThreatHeatmap />
          </CollapsibleSection>
          <CollapsibleSection title="Attack Surface" defaultCollapsed info="Ten agentic-AI attack vectors mapped to specific controls, MITRE references, and Cedar policies — with mitigation status.">
            <AttackSurfacePanel />
          </CollapsibleSection>
          <InterventionStatus />
          <CollapsibleSection title="Operational Resilience" defaultCollapsed info="Operational-resilience regulatory frameworks with compliance status, evidence, and key requirements.">
            <ResilienceCompliance />
          </CollapsibleSection>
        </>
      )}

      {/* Compliance: Resilience Compliance (depth — collapsed) */}
      {isCompliance && (
        <CollapsibleSection title="Operational Resilience" defaultCollapsed info="Operational-resilience regulatory frameworks with compliance status, evidence, and key requirements.">
          <ResilienceCompliance />
        </CollapsibleSection>
      )}
    </div>
  );
};

export default ArchitectureTab;
