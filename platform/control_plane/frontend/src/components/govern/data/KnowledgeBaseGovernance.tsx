/**
 * KnowledgeBaseGovernance — Live Bedrock Knowledge Base governance view
 *
 * Fetches the live Bedrock KB inventory via `governKnowledgeBasesApi.list()` and
 * renders:
 *  - Summary stat cards (total, active, total data sources) plus breakdowns by
 *    storage type and embedding model.
 *  - A card per knowledge base (status, storage type, embedding model, description,
 *    data-source count) with an expandable list of its data sources.
 *
 * Embedding model ARNs are shortened to the model identifier for display — the raw
 * account-bearing ARN is never rendered. Header shows a LiveDataBadge when the
 * backend reports live data, otherwise a MockDataBadge with an honest empty state.
 *
 * Designed to render embedded inside a tab (like KnowledgeSources) — no page chrome.
 */

import { useState, useEffect } from 'react';
import {
  governKnowledgeBasesApi,
  type AwsKnowledgeBasesResponse,
  type AwsKnowledgeBaseSummary,
} from '../../../api/client';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import { RegionCoverageBadge } from '../RegionCoverageBadge';
import { Icon } from '../icons';

// ─────────────────────────── Helpers ───────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  AVAILABLE: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  CREATING: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  UPDATING: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  DELETING: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  FAILED: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  DELETE_UNSUCCESSFUL: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

function statusStyle(status?: string | null) {
  return STATUS_STYLES[(status || '').toUpperCase()] || { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' };
}

/**
 * Reduce an embedding-model ARN to its model identifier for display.
 * Foundation-model ARNs look like
 *   arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0
 * We show only the segment after the final "/" (falling back to the last ":"
 * segment) so no account-bearing ARN is ever rendered raw.
 */
function shortenModelArn(arn?: string | null): string {
  if (!arn) return 'Not specified';
  const trimmed = arn.trim();
  if (trimmed.includes('/')) return trimmed.substring(trimmed.lastIndexOf('/') + 1);
  if (trimmed.includes(':')) return trimmed.substring(trimmed.lastIndexOf(':') + 1);
  return trimmed;
}

function fmtStorageType(storageType?: string | null): string {
  if (!storageType) return 'Unknown';
  // e.g. OPENSEARCH_SERVERLESS -> "Opensearch Serverless"
  return storageType
    .split(/[_\s]+/)
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

function fmtDate(s?: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─────────────────────────── Component ───────────────────────────

export default function KnowledgeBaseGovernance() {
  const [data, setData] = useState<AwsKnowledgeBasesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    governKnowledgeBasesApi
      .list(100)
      .then(res => {
        if (!cancelled) setData(res);
      })
      .catch(err => {
        console.warn('Knowledge base inventory fetch failed:', err);
        if (!cancelled) setError(err?.message || 'Failed to load knowledge bases');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Loading knowledge bases from Bedrock…</span>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
        <p className="text-sm text-rose-700">Error loading knowledge bases: {error}</p>
      </div>
    );
  }

  const isLive = !!data?.live;
  const kbs = data?.knowledge_bases ?? [];
  const storageEntries = Object.entries(data?.by_storage_type ?? {});
  const embeddingEntries = Object.entries(data?.by_embedding_model ?? {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Bedrock Knowledge Bases</h3>
          {isLive ? (
            <LiveDataBadge source="Bedrock Knowledge Bases" />
          ) : (
            <MockDataBadge integration="Bedrock ListKnowledgeBases" />
          )}
          {isLive && <RegionCoverageBadge regions={data?.regions} noun="Knowledge base counts" />}
        </div>
        {data?.source && (
          <span className="text-[10px] text-slate-400">Source: {data.source}</span>
        )}
      </div>

      {/* Not-live notice */}
      {!isLive && data?.note && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-800">{data.note}</p>
        </div>
      )}

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Knowledge Bases" value={data?.total ?? 0} sub={`${data?.active ?? 0} active`} tone="text-blue-600" />
        <StatCard label="Active" value={data?.active ?? 0} sub="ready for retrieval" tone={(data?.active ?? 0) > 0 ? 'text-emerald-600' : 'text-slate-400'} />
        <StatCard label="Data Sources" value={data?.total_data_sources ?? 0} sub="across all KBs" tone="text-violet-600" />
      </div>

      {/* Breakdown cards */}
      {(storageEntries.length > 0 || embeddingEntries.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {storageEntries.length > 0 && (
            <BreakdownCard
              title="By Storage Type"
              icon="circle-stack"
              iconClass="text-violet-500"
              entries={storageEntries.map(([k, v]) => ({ label: fmtStorageType(k), value: v }))}
            />
          )}
          {embeddingEntries.length > 0 && (
            <BreakdownCard
              title="By Embedding Model"
              icon="sparkles"
              iconClass="text-blue-500"
              entries={embeddingEntries.map(([k, v]) => ({ label: shortenModelArn(k), value: v }))}
            />
          )}
        </div>
      )}

      {/* Empty state (live but none, or not live) */}
      {kbs.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-white/60">
          <Icon name="book-open" className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <h3 className="text-lg font-semibold text-slate-700 mb-1">
            {isLive ? 'No knowledge bases found' : 'Knowledge base inventory unavailable'}
          </h3>
          <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
            {isLive
              ? 'This account has no Amazon Bedrock knowledge bases yet. Create one to enable retrieval-augmented generation for your agents.'
              : 'Live Bedrock data could not be loaded. The values below are not from a live source.'}
          </p>
          <a
            href="https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            Learn about Bedrock Knowledge Bases →
          </a>
        </div>
      ) : (
        /* Per-KB cards */
        <div className="space-y-3">
          {kbs.map(kb => (
            <KnowledgeBaseCard
              key={kb.knowledge_base_id}
              kb={kb}
              expanded={!!expanded[kb.knowledge_base_id]}
              onToggle={() => toggle(kb.knowledge_base_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Sub-components ───────────────────────────

function StatCard({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: string }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${tone}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

function BreakdownCard({
  title,
  icon,
  iconClass,
  entries,
}: {
  title: string;
  icon: 'circle-stack' | 'sparkles';
  iconClass: string;
  entries: { label: string; value: number }[];
}) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Icon name={icon} className={`w-4 h-4 ${iconClass}`} />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="space-y-1.5">
        {entries.map(e => (
          <div key={e.label} className="flex items-center justify-between text-[11px]">
            <span className="text-slate-600 truncate mr-2">{e.label}</span>
            <span className="font-semibold text-slate-800 tabular-nums flex-shrink-0">{e.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KnowledgeBaseCard({
  kb,
  expanded,
  onToggle,
}: {
  kb: AwsKnowledgeBaseSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = statusStyle(kb.status);
  const updated = fmtDate(kb.updated_at) || fmtDate(kb.created_at);
  const hasSources = kb.data_sources.length > 0;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Icon name="book-open" className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">{kb.name}</div>
            <div className="text-[10px] text-slate-400 font-mono truncate">{kb.knowledge_base_id}</div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase flex-shrink-0 ${style.bg} ${style.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ${(kb.status || '').toUpperCase() === 'CREATING' || (kb.status || '').toUpperCase() === 'UPDATING' ? 'animate-pulse' : ''}`} />
          {kb.status || 'UNKNOWN'}
        </span>
      </div>

      {/* Description */}
      {kb.description && (
        <p className="text-xs text-slate-600 mt-3 line-clamp-2">{kb.description}</p>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <Icon name="circle-stack" className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">Storage:</span> {fmtStorageType(kb.storage_type)}
        </span>
        <span className="flex items-center gap-1.5">
          <Icon name="sparkles" className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">Embedding:</span> {shortenModelArn(kb.embedding_model_arn)}
        </span>
        <span className="flex items-center gap-1.5">
          <Icon name="server-stack" className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">Data sources:</span> {kb.data_source_count}
        </span>
        {updated && (
          <span className="flex items-center gap-1.5">
            <Icon name="clock" className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Updated:</span> {updated}
          </span>
        )}
      </div>

      {/* Expandable data sources */}
      {hasSources && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
            aria-expanded={expanded}
          >
            <Icon name={expanded ? 'chevron-down' : 'chevron-right'} className="w-3.5 h-3.5" />
            {expanded ? 'Hide' : 'Show'} {kb.data_sources.length} data source{kb.data_sources.length !== 1 ? 's' : ''}
          </button>

          {expanded && (
            <div className="mt-2 space-y-2">
              {kb.data_sources.map(ds => {
                const dsStyle = statusStyle(ds.status);
                const dsUpdated = fmtDate(ds.updated_at);
                return (
                  <div
                    key={ds.data_source_id}
                    className="flex items-start justify-between gap-3 border border-slate-200 rounded-lg p-3 hover:border-blue-200 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 truncate">{ds.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">{ds.data_source_id}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{ds.type}</span>
                        {dsUpdated && <span className="text-[9px] text-slate-400">Updated {dsUpdated}</span>}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase flex-shrink-0 ${dsStyle.bg} ${dsStyle.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${dsStyle.dot}`} />
                      {ds.status || 'UNKNOWN'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
