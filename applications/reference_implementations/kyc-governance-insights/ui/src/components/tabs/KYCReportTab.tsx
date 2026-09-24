import React, { useState } from 'react';
import { kycReportData } from '../../data/kycReportData';
import { kycReportRejectData } from '../../data/kycReportRejectData';
import type { ReportData } from '../../data/kycReportData';
import type { KYCResponse } from '../../types/index';
import type { TabId } from '../../types/tabs';
import SectionDescription from '../shared/SectionDescription';

interface KYCReportTabProps {
  liveResponse?: KYCResponse | null;
  onNavigate?: (tab: TabId) => void;
}

type Scenario = 'approve' | 'reject';

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '1.5rem',
};

const getLevelColor = (level: string): string => {
  switch (level) {
    case 'low': return '#36b37e';
    case 'medium': return '#ffab00';
    case 'high': return '#ff5630';
    case 'critical': return '#d32f2f';
    default: return '#6b778c';
  }
};

const getComplianceColor = (status: string): string => {
  switch (status) {
    case 'compliant': return '#36b37e';
    case 'non_compliant': return '#ff5630';
    case 'review_required': return '#ffab00';
    default: return '#6b778c';
  }
};

const formatStatus = (status: string): string => {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

/* ─── Scenario Toggle ─── */
const ScenarioToggle: React.FC<{ scenario: Scenario; onChange: (s: Scenario) => void }> = ({ scenario, onChange }) => (
  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
    <button
      onClick={() => onChange('approve')}
      style={{
        padding: '8px 20px',
        borderRadius: '8px',
        border: scenario === 'approve' ? '2px solid #2e7d32' : '1px solid var(--border)',
        background: scenario === 'approve' ? 'rgba(46, 125, 50, 0.12)' : 'var(--bg-card)',
        color: scenario === 'approve' ? '#4caf50' : 'var(--text-muted)',
        fontWeight: 600,
        fontSize: '0.8rem',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      Acme Corp (APPROVE)
    </button>
    <button
      onClick={() => onChange('reject')}
      style={{
        padding: '8px 20px',
        borderRadius: '8px',
        border: scenario === 'reject' ? '2px solid #c62828' : '1px solid var(--border)',
        background: scenario === 'reject' ? 'rgba(198, 40, 40, 0.12)' : 'var(--bg-card)',
        color: scenario === 'reject' ? '#ef5350' : 'var(--text-muted)',
        fontWeight: 600,
        fontSize: '0.8rem',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      Omega Trading (REJECT)
    </button>
  </div>
);

/* ─── Live Agent Result Section ─── */
const LiveResultSection: React.FC<{ liveResponse: KYCResponse }> = ({ liveResponse }) => (
  <>
    {/* Live Result Banner */}
    <div
      style={{
        ...cardStyle,
        border: '2px solid #2684ff',
        background: 'linear-gradient(135deg, rgba(38, 132, 255, 0.06), rgba(38, 132, 255, 0.02))',
        marginBottom: '1.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <span
          style={{
            background: '#2684ff',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.7rem',
            padding: '4px 12px',
            borderRadius: '20px',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          ⚡ Latest Live Result
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {new Date(liveResponse.timestamp).toLocaleString()}
        </span>
      </div>

      {/* Live Summary */}
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 1rem 0' }}>
        {liveResponse.summary}
      </p>

      {/* Live metadata */}
      <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <span>Assessment: {liveResponse.assessment_id}</span>
        <span>Customer: {liveResponse.customer_id}</span>
        {liveResponse.credit_risk && (
          <span>
            Credit Risk:{' '}
            <span style={{ color: getLevelColor(liveResponse.credit_risk.level), fontWeight: 600 }}>
              {liveResponse.credit_risk.score}/100 ({liveResponse.credit_risk.level.toUpperCase()})
            </span>
          </span>
        )}
        {liveResponse.compliance && (
          <span>
            Compliance:{' '}
            <span style={{ color: getComplianceColor(liveResponse.compliance.status), fontWeight: 600 }}>
              {formatStatus(liveResponse.compliance.status)}
            </span>
          </span>
        )}
      </div>
    </div>

    {/* Divider */}
    <div
      style={{
        textAlign: 'center',
        padding: '0.5rem 0 1.5rem',
        fontSize: '0.7rem',
        color: 'var(--text-muted)',
        letterSpacing: '1px',
        textTransform: 'uppercase',
      }}
    >
      ─── Reference Report ───
    </div>
  </>
);

/* ─── Report Header ─── */
const ReportHeader: React.FC<{ data: ReportData }> = ({ data }) => {
  const title = data.verdict === 'APPROVE' ? 'KYC Assessment Report — Acme Corp' : 'KYC Assessment Report — Omega Trading Ltd';
  return (
    <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <span
          style={{
            background: data.verdictColor,
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.9rem',
            padding: '8px 20px',
            borderRadius: '6px',
            letterSpacing: '0.5px',
          }}
        >
          {data.verdict}
        </span>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          {title}
        </h1>
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '2rem',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border)',
        }}
      >
        <span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Customer</span>{' '}
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{data.customer}</span>
        </span>
        <span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Date</span>{' '}
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{data.date}</span>
        </span>
        <span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Confidence</span>{' '}
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{data.confidence}</span>
        </span>
        <span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Credit Risk</span>{' '}
          <span style={{ fontWeight: 600, color: data.creditRiskColor }}>{data.creditRisk}</span>
        </span>
        <span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Compliance</span>{' '}
          <span style={{ fontWeight: 600, color: data.complianceColor }}>{data.compliance}</span>
        </span>
      </div>
    </div>
  );
};

/* ─── Executive Summary ─── */
const ExecutiveSummary: React.FC<{ data: ReportData }> = ({ data }) => (
  <div
    style={{
      ...cardStyle,
      marginBottom: '1.5rem',
      borderLeft: `4px solid ${data.verdictColor}`,
    }}
  >
    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1rem 0' }}>
      📋 Executive Summary
    </h2>
    <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {data.executiveSummary.map((point, i) => (
        <li
          key={i}
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            fontWeight: i === 0 ? 600 : 400,
          }}
        >
          {point}
        </li>
      ))}
    </ul>
  </div>
);

/* ─── Credit Risk Assessment ─── */
const CreditRiskSection: React.FC<{ data: ReportData }> = ({ data }) => (
  <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1.25rem 0' }}>
      📊 Credit Risk Assessment
    </h2>
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
      {/* Score Circle */}
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: data.verdictColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 700,
          fontSize: '1.1rem',
          boxShadow: `0 4px 12px ${data.verdictColor}44`,
        }}
      >
        {data.creditScoreDisplay}
      </div>
      <div>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {data.creditScoreDisplay} / {data.creditScoreDisplayMax}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          Credit Grade: <span style={{ color: data.creditRiskColor, fontWeight: 600 }}>{data.creditLevel}</span>
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          Risk Score: {data.creditScore}/{data.creditScoreMax}
        </div>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      <div>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>
          Risk Factors
        </h3>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {data.creditFactors.map((factor, i) => (
            <li key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {factor}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>
          Recommendations
        </h3>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {data.creditRecommendations.map((rec, i) => (
            <li key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {rec}
            </li>
          ))}
        </ul>
      </div>
    </div>
  </div>
);

/* ─── Compliance Verification ─── */
const ComplianceSection: React.FC<{ data: ReportData }> = ({ data }) => {
  const passed = data.complianceChecks.filter(c => c.status === 'pass');
  const failed = data.complianceChecks.filter(c => c.status === 'fail');

  return (
    <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1.25rem 0' }}>
        🛡️ Compliance Verification
      </h2>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        {passed.length} passed · {failed.length} failed · {data.complianceChecks.length} total checks
      </div>

      {/* Failed checks */}
      {failed.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '0.5rem',
            }}
          >
            {failed.map((check, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.8rem',
                  color: '#ff5630',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'rgba(255, 86, 48, 0.06)',
                  border: '1px solid rgba(255, 86, 48, 0.15)',
                }}
              >
                <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>✗</span>
                <span>{check.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Passed checks */}
      {passed.length > 0 && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '0.5rem',
            }}
          >
            {passed.map((check, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.8rem',
                  color: '#36b37e',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'rgba(54, 179, 126, 0.06)',
                  border: '1px solid rgba(54, 179, 126, 0.15)',
                }}
              >
                <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>✓</span>
                <span>{check.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Regulatory Notes ─── */
const RegulatoryNotes: React.FC<{ data: ReportData }> = ({ data }) => {
  const isReject = data.verdict === 'REJECT';
  return (
    <div
      style={{
        ...cardStyle,
        background: isReject
          ? 'linear-gradient(135deg, rgba(255, 152, 0, 0.06), rgba(255, 152, 0, 0.02))'
          : 'var(--bg-card)',
        border: isReject ? '1px solid rgba(255, 152, 0, 0.25)' : '1px solid var(--border)',
      }}
    >
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1rem 0' }}>
        ⚖️ Regulatory Notes
      </h2>
      <ol style={{ margin: 0, paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {data.regulatoryNotes.map((note, i) => (
          <li
            key={i}
            style={{
              fontSize: '0.8rem',
              color: isReject ? '#ffb74d' : 'var(--text-secondary)',
              lineHeight: 1.6,
              fontWeight: isReject && i === 0 ? 600 : 400,
            }}
          >
            {note}
          </li>
        ))}
      </ol>
    </div>
  );
};

/* ─── Main Component ─── */
export const KYCReportTab: React.FC<KYCReportTabProps> = ({ liveResponse, onNavigate }) => {
  const [scenario, setScenario] = useState<Scenario>('approve');
  const data: ReportData = scenario === 'approve' ? kycReportData : kycReportRejectData;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div data-testid="kyc-report.container" style={{ display: 'flex', flexDirection: 'column', maxWidth: '1000px', margin: '0 auto' }}>
      <SectionDescription text="Generated KYC assessment report — credit analysis, compliance checks, regulatory notes." />
      {/* Top bar: Scenario Toggle + PDF button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <ScenarioToggle scenario={scenario} onChange={setScenario} />
        <button
          onClick={handlePrint}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 0.2s ease',
          }}
          title="Save this report as PDF"
        >
          📥 Save as PDF
        </button>
      </div>

      {/* Live Agent Result (only show on approve scenario when available) */}
      {liveResponse && scenario === 'approve' && <LiveResultSection liveResponse={liveResponse} />}

      {/* Report Content */}
      <ReportHeader data={data} />
      <ExecutiveSummary data={data} />
      <CreditRiskSection data={data} />
      <ComplianceSection data={data} />
      <RegulatoryNotes data={data} />

      {/* Cross-tab references */}
      {onNavigate && (
        <div style={{ ...cardStyle, marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            Related Sections
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span>
              Credit Risk Score{' '}
              <button onClick={() => onNavigate('simulation')} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', fontSize: 'inherit', padding: 0 }}>
                View in Agent Execution →
              </button>
            </span>
            <span>
              Compliance checks (13 passed){' '}
              <button onClick={() => onNavigate('risk-register')} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', fontSize: 'inherit', padding: 0 }}>
                View Risk Register →
              </button>
            </span>
            <span>
              Agent: Credit Analyst (Tier 2){' '}
              <button onClick={() => onNavigate('governance')} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', fontSize: 'inherit', padding: 0 }}>
                View Agent Registry →
              </button>
            </span>
            <span>
              Controls: Guardrails, LLM-as-Judge, Lambda Validators{' '}
              <button onClick={() => onNavigate('architecture')} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', fontSize: 'inherit', padding: 0 }}>
                View Architecture →
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default KYCReportTab;
