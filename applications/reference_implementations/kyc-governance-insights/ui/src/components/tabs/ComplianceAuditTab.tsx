import React, { useState, useMemo } from 'react';
import { controlMappingData, frameworks, type FrameworkId, type FrameworkMapping, type Control, type ControlStatus } from '../../data/controlMappingData';
import RiskAssessmentReport from '../reports/RiskAssessmentReport';
import { defaultConfig, type ReportConfig } from '../../data/reportTemplateData';
import ControlFilterBar from '../controls/ControlFilterBar';
import ControlAccordion from '../controls/ControlAccordion';
import ModelInventory from '../compliance/ModelInventory';
import ControlTestingOverlay from '../compliance/ControlTestingOverlay';
import IssuesTracker from '../compliance/IssuesTracker';
import SectionDescription from '../shared/SectionDescription';
import CollapsibleSection from '../shared/CollapsibleSection';

const statusBadge: Record<ControlStatus, { label: string; bg: string; color: string }> = {
  pass: { label: '✅ Pass', bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  fail: { label: '❌ Fail', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  warning: { label: '⚠️ Warning', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  not_assessed: { label: '— N/A', bg: 'rgba(100,116,139,0.15)', color: '#64748b' },
};

function ScoreRing({ score }: { score: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 90 ? '#10b981' : score >= 75 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="100" height="100" style={{ display: 'block', margin: '0 auto' }}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.8s ease' }} />
      <text x="50" y="54" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text-primary)">{score}%</text>
    </svg>
  );
}

function DomainCard({ label, score }: { label: string; score: number }) {
  const color = score >= 90 ? '#10b981' : score >= 75 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{score}%</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>{label}</div>
    </div>
  );
}

function ControlRow({ ctrl }: { ctrl: Control }) {
  const badge = statusBadge[ctrl.status];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent)', minWidth: '90px' }}>{ctrl.id}</span>
      <span style={{ flex: 1, color: 'var(--text-primary)' }}>{ctrl.name}</span>
      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: badge.bg, color: badge.color }}>{badge.label}</span>
      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', minWidth: '70px', textAlign: 'right' }}>{ctrl.lastAssessed}</span>
    </div>
  );
}

export const ComplianceAuditTab: React.FC = () => {
  const [framework, setFramework] = useState<FrameworkId | 'all'>('all');
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<ControlStatus[]>(['pass', 'warning', 'fail', 'not_assessed']);

  const filtered = useMemo(() => {
    let result = controlMappingData;
    if (framework !== 'all') result = result.filter(c => c.framework_mappings[framework as keyof FrameworkMapping]);
    if (statusFilters.length < 4) result = result.filter(c => statusFilters.includes(c.status));
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }
    return result;
  }, [framework, statusFilters, search]);

  const statusCounts = useMemo(() => {
    const base = framework !== 'all' ? controlMappingData.filter(c => c.framework_mappings[framework as keyof FrameworkMapping]) : controlMappingData;
    return { pass: base.filter(c => c.status === 'pass').length, warning: base.filter(c => c.status === 'warning').length, fail: base.filter(c => c.status === 'fail').length, not_assessed: base.filter(c => c.status === 'not_assessed').length };
  }, [framework]);

  const toggleStatus = (s: ControlStatus) => {
    setStatusFilters(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const compositeScore = useMemo(() => {
    const scored = controlMappingData.filter(c => c.status !== 'not_assessed');
    return Math.round((scored.reduce((s, c) => s + c.score, 0) / scored.length) * 10) / 10;
  }, []);

  if (showReport) {
    return <RiskAssessmentReport config={defaultConfig} onClose={() => setShowReport(false)} />;
  }

  return (
    <div data-testid="compliance.container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Generate Report Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setShowReport(true)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
          {'\uD83D\uDCCB'} Generate Risk Assessment Report
        </button>
      </div>
      <SectionDescription text="Composite compliance score across all frameworks — control testing status, model inventory, issues." />

      {/* Composite Score */}
      <div data-testid="compliance.composite-score" style={{ textAlign: 'center' }}>
        <ScoreRing score={compositeScore} />
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>Composite Compliance Score</div>
      </div>

      {/* Domain Scores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        <DomainCard label="Policy Enforcement" score={96.8} />
        <DomainCard label="Data Protection" score={93.1} />
        <DomainCard label="Audit Trail" score={97.5} />
        <DomainCard label="Model Governance" score={89.4} />
      </div>

      {/* Control Bucketing: Filters + Accordion */}
      <CollapsibleSection title="Control Framework Mapping" defaultCollapsed info="The full control library mapped to frameworks (CRI, NIST, ISO 42001, EU AI Act, FCA). Filter by framework or status and expand a control for its evidence. The composite and domain scores above summarise this; here is the underlying control-by-control detail.">
      <ControlFilterBar
        search={search}
        onSearchChange={setSearch}
        statusFilters={statusFilters}
        onToggleStatus={toggleStatus}
        activeFramework={framework}
        onFrameworkChange={(f) => { setFramework(f); }}
        counts={statusCounts}
        total={controlMappingData.length}
        matchCount={filtered.length}
      />
      <ControlAccordion controls={filtered} />
      </CollapsibleSection>

      {/* Control Testing Evidence — Iteration 23 */}
      <CollapsibleSection title="Control Testing Evidence" defaultCollapsed info="Results of periodic control tests — which controls were tested, when, and their pass / partial / fail outcomes. The evidence depth behind the composite score.">
        <div data-testid="compliance.control-testing">
          <ControlTestingOverlay />
        </div>
      </CollapsibleSection>

      {/* AI Model Inventory — Iteration 23 */}
      <CollapsibleSection title="AI Model Inventory" defaultCollapsed info="The registered models behind the agents — validation status, risk rating, and revalidation cadence. Model-governance depth; the Model Governance domain score above summarises it.">
        <div data-testid="compliance.model-inventory">
          <ModelInventory />
        </div>
      </CollapsibleSection>

      {/* Issues & Findings Tracker — Iteration 23 (accountability — stays expanded) */}
      <div data-testid="compliance.issues-tracker">
        <IssuesTracker />
      </div>
    </div>
  );
};

export default ComplianceAuditTab;
