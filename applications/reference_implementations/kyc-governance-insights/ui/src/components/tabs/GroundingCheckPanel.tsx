import React, { useEffect, useState } from 'react';
import { checkGrounding, type GroundingResult } from '../../api/grounding';
import { useOfflineMode } from '../../hooks/useOfflineMode';
import DataSourceBadge from '../shared/DataSourceBadge';
import Tooltip from '../shared/Tooltip';

// Live contextual-grounding check backed by Bedrock Guardrails (ApplyGuardrail).
// Fires two real checks against the grounding proxy: a response that IS supported
// by the source document, and a hallucinated response that contradicts it. This
// demonstrates the guardrail catching fabricated statements before they reach a
// decision. Falls back to representative scores when the API is unreachable.

const SOURCE =
  'Omega Trading Ltd filed FY2025 accounts showing GBP 12.4M revenue. Beneficial owner: Jane Doe (100%). UK-incorporated. Sanctions and PEP screening returned no matches.';
const QUERY = 'Summarise the KYC risk profile for Omega Trading Ltd.';

interface GroundingCase {
  key: string;
  label: string;
  description: string;
  response: string;
  fallback: GroundingResult;
}

const THRESHOLDS = { grounding: 0.85, relevance: 0.75 };

const CASES: GroundingCase[] = [
  {
    key: 'grounded',
    label: 'Grounded response',
    description: 'Agent output fully supported by the source documents.',
    response:
      'Omega Trading Ltd reported GBP 12.4M revenue in FY2025, is UK-incorporated with Jane Doe as sole beneficial owner, and returned no sanctions or PEP matches.',
    fallback: { action: 'NONE', grounding_score: 0.98, relevance_score: 0.95, grounded: true, thresholds: THRESHOLDS },
  },
  {
    key: 'hallucinated',
    label: 'Hallucinated response',
    description: 'Agent output contradicts the source — should be blocked.',
    response:
      'Omega Trading Ltd is under active OFAC sanctions, its beneficial owner is a sanctioned foreign official, and FY2025 revenue exceeded GBP 900M.',
    fallback: { action: 'GUARDRAIL_INTERVENED', grounding_score: 0.05, relevance_score: 0.18, grounded: false, thresholds: THRESHOLDS },
  },
];

function ScoreBar({ score, threshold }: { score: number | null; threshold: number }) {
  const pct = Math.round((score ?? 0) * 100);
  const pass = (score ?? 0) >= threshold;
  const color = pass ? '#10b981' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <div style={{ position: 'relative', flex: 1, height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', minWidth: '60px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: color, borderRadius: '3px' }} />
        <div style={{ position: 'absolute', left: `${Math.round(threshold * 100)}%`, top: '-2px', height: '10px', width: '1px', background: 'var(--text-muted)', opacity: 0.7 }} />
      </div>
      <span style={{ fontSize: '0.7rem', fontWeight: 700, color, width: '34px', textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

function CaseRow({ c, result, loading }: { c: GroundingCase; result: GroundingResult | null; loading: boolean }) {
  const r = result || c.fallback;
  const intervened = r.action === 'GUARDRAIL_INTERVENED';
  const badgeColor = intervened ? '#ef4444' : '#10b981';
  const badgeBg = intervened ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)';
  const badgeLabel = intervened ? 'BLOCKED' : 'GROUNDED';

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <Tooltip text={c.description}>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>{c.label}</span>
        </Tooltip>
        <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: badgeBg, color: badgeColor, textTransform: 'uppercase' }}>
          {loading ? '…' : badgeLabel}
        </span>
      </div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.5, fontStyle: 'italic' }}>
        “{c.response}”
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '4px 8px', alignItems: 'center' }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Grounding</span>
        <ScoreBar score={r.grounding_score} threshold={THRESHOLDS.grounding} />
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Relevance</span>
        <ScoreBar score={r.relevance_score} threshold={THRESHOLDS.relevance} />
      </div>
    </div>
  );
}

export const GroundingCheckPanel: React.FC = () => {
  const offline = useOfflineMode();
  const [results, setResults] = useState<Record<string, GroundingResult | null>>({});
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(!offline);

  useEffect(() => {
    if (offline) {
      setResults({});
      setIsLive(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const entries = await Promise.all(
        CASES.map(async (c) => [c.key, await checkGrounding(SOURCE, QUERY, c.response)] as const)
      );
      if (cancelled) return;
      const map: Record<string, GroundingResult | null> = {};
      let anyLive = false;
      for (const [key, res] of entries) {
        map[key] = res;
        if (res) anyLive = true;
      }
      setResults(map);
      setIsLive(anyLive);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [offline]);

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Tooltip text="Bedrock Guardrails contextual grounding compares each agent statement against the retrieved source documents. Grounding measures factual support; relevance measures on-topic fit. Statements below the grounding threshold (0.85) are blocked before they reach a KYC decision.">
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
            Contextual Grounding Check
          </span>
        </Tooltip>
        <span style={{ fontSize: '8px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,82,204,0.15)', color: '#0052CC', textTransform: 'uppercase' }}>
          Bedrock Guardrails
        </span>
        <DataSourceBadge isLive={isLive} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {CASES.map((c) => (
          <CaseRow key={c.key} c={c} result={results[c.key] ?? null} loading={loading} />
        ))}
      </div>
    </div>
  );
};

export default GroundingCheckPanel;
