import React from 'react';
import OperationalKPIs from '../operations/OperationalKPIs';
import SLAMonitor from '../operations/SLAMonitor';
import CostBreakdown from '../operations/CostBreakdown';
import CapacityPlanning from '../operations/CapacityPlanning';
import SectionDescription from '../shared/SectionDescription';
import CollapsibleSection from '../shared/CollapsibleSection';

export const OperationsTab: React.FC = () => {
  return (
    <div data-testid="business-ops.container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SectionDescription text="Operational KPIs for the AI-assisted KYC pipeline — throughput, SLA compliance, cost per decision." />
      {/* Entry: headline operational KPIs stay expanded */}
      <div data-testid="business-ops.kpi-cards">
        <OperationalKPIs />
      </div>
      {/* Depth: SLA / cost / capacity drill-downs collapse by default */}
      <CollapsibleSection title="SLA Monitor" defaultCollapsed info="Per-tier service-level compliance — how decision latency tracks against the SLA target for each risk tier, and where breaches occur. The throughput headline is above; this is the drill-down behind it.">
        <div data-testid="business-ops.sla-monitor">
          <SLAMonitor />
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Cost Breakdown" defaultCollapsed info="Where the per-decision cost comes from — model inference, tool calls, human review time — and how automation shifts the mix. Expand to see the components behind the cost-per-decision figure.">
        <CostBreakdown />
      </CollapsibleSection>
      <CollapsibleSection title="Capacity Planning" defaultCollapsed info="Projected throughput headroom versus incoming volume — how much spare capacity the pipeline has before SLA risk rises. Planning depth, not a landing metric.">
        <CapacityPlanning />
      </CollapsibleSection>
    </div>
  );
};

export default OperationsTab;
