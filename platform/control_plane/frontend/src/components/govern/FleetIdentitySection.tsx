/**
 * FleetIdentitySection — AgentCore Identity surface for Agent Fleet Governance.
 *
 * Lists the AWS Bedrock AgentCore workload identities issued to agents in the
 * fleet (machine/workload identities — distinct from human SSO federation in
 * the Secure → Identity module). Reuses the existing read-only
 * governAgentCoreApi.workloadIdentities() feed.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  governAgentCoreApi,
  type AwsWorkloadIdentity,
} from '../../api/client';
import { Icon } from './icons';
import { LiveDataBadge } from './DataSourceIndicator';

/**
 * Many AgentCore workload identities are auto-generated with a random
 * session/instance suffix (e.g. `sec_sci_specialist-15JMwW215y`). Treat a
 * trailing `-<random>` segment (6+ alphanumerics) as a suffix and drop it for
 * the display label. The full original name is always preserved in a tooltip.
 */
const SUFFIX_RE = /-[A-Za-z0-9]{6,}$/;

function baseNameOf(name: string): string {
  const stripped = name.replace(SUFFIX_RE, '');
  return stripped.length > 0 ? stripped : name;
}

/** Compact, locale-aware date label (e.g. "Mar 5, 2026"). */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** One display row per base name, aggregating all its instances. */
interface IdentityGroup {
  baseName: string;
  count: number;
  originalNames: string[];
  /** Earliest createdTime across the group's instances (ISO), if any. */
  earliestCreated: string | null;
  /** Deduped OAuth2 return-URL allow-list across the group (usually empty). */
  oauthUrls: string[];
}

/** Groups identities beyond this count are collapsed behind a "Show all" toggle. */
const VISIBLE_LIMIT = 12;

export default function FleetIdentitySection() {
  const [identities, setIdentities] = useState<AwsWorkloadIdentity[]>([]);
  const [total, setTotal] = useState(0);
  const [live, setLive] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const resp = await governAgentCoreApi.workloadIdentities();
        if (cancelled) return;
        setIdentities(resp.workload_identities ?? []);
        setTotal(resp.total ?? resp.workload_identities?.length ?? 0);
        setLive(Boolean(resp.live));
        setNote(resp.note ?? null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load workload identities');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Collapse the noisy name-only feed into one row per base name.
  const groups = useMemo<IdentityGroup[]>(() => {
    const byBase = new Map<string, IdentityGroup>();
    for (const identity of identities) {
      const base = baseNameOf(identity.name);
      let group = byBase.get(base);
      if (!group) {
        group = { baseName: base, count: 0, originalNames: [], earliestCreated: null, oauthUrls: [] };
        byBase.set(base, group);
      }
      group.count += 1;
      group.originalNames.push(identity.name);
      if (
        identity.created_at &&
        (!group.earliestCreated || new Date(identity.created_at) < new Date(group.earliestCreated))
      ) {
        group.earliestCreated = identity.created_at;
      }
      for (const url of identity.oauth2_return_urls ?? []) {
        if (!group.oauthUrls.includes(url)) group.oauthUrls.push(url);
      }
    }
    // Alphabetical by base name (no misleading "scoped-first" ordering).
    return Array.from(byBase.values()).sort((a, b) => a.baseName.localeCompare(b.baseName));
  }, [identities]);

  const uniqueCount = groups.length;
  const visibleGroups = showAll ? groups : groups.slice(0, VISIBLE_LIMIT);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Icon name="finger-print" className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <span className="text-sm font-semibold text-slate-900">AgentCore Identity</span>
          {live ? (
            <LiveDataBadge source="AgentCore" />
          ) : (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">Mock</span>
          )}
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">Workload Identities</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span><strong className="text-indigo-600">{total}</strong> identities</span>
          {uniqueCount > 0 && uniqueCount !== total && (
            <span><strong className="text-slate-600">{uniqueCount}</strong> unique</span>
          )}
        </div>
      </div>

      {/* Honest scoping note — machine identities are not IAM-scoped. */}
      <p className="flex items-start gap-1 px-4 pt-2 text-[10px] text-slate-500">
        <Icon name="information-circle" className="w-3 h-3 mt-px text-slate-400 shrink-0" />
        <span>
          Machine (workload) identities — resource permissions are governed by each agent's IAM
          execution role, not the identity.
        </span>
      </p>

      {/* Body */}
      <div className="px-4 py-3">
        {loading && (
          <div className="text-xs text-slate-400 py-4 text-center">Loading workload identities…</div>
        )}

        {!loading && error && (
          <div className="text-xs text-rose-600 py-4 text-center">{error}</div>
        )}

        {!loading && !error && identities.length === 0 && (
          <div className="text-xs text-slate-400 py-4 text-center">
            No AgentCore workload identities discovered yet.
          </div>
        )}

        {!loading && !error && identities.length > 0 && (
          <>
            <ul className="divide-y divide-slate-100/80 rounded-lg border border-slate-100 overflow-hidden">
              {visibleGroups.map((group) => (
                <li
                  key={group.baseName}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-white hover:bg-slate-50/80"
                >
                  <Icon name="finger-print" className="w-3 h-3 text-slate-300 shrink-0" />
                  <span
                    className="text-xs font-medium text-slate-800 truncate"
                    title={group.originalNames.join('\n')}
                  >
                    {group.baseName}
                  </span>
                  {group.count > 1 && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-mono shrink-0">
                      ×{group.count}
                    </span>
                  )}
                  <span className="flex-1" />
                  {group.oauthUrls.length > 0 && (
                    <span
                      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium shrink-0"
                      title={group.oauthUrls.join('\n')}
                    >
                      <Icon name="link" className="w-2.5 h-2.5" />
                      {group.oauthUrls.length} OAuth URL{group.oauthUrls.length === 1 ? '' : 's'}
                    </span>
                  )}
                  {formatDate(group.earliestCreated) && (
                    <span
                      className="inline-flex items-center gap-1 text-[9px] text-slate-400 font-medium shrink-0"
                      title={`Created ${formatDate(group.earliestCreated)}`}
                    >
                      <Icon name="calendar" className="w-2.5 h-2.5" />
                      {formatDate(group.earliestCreated)}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {groups.length > VISIBLE_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 hover:text-indigo-700"
              >
                <Icon name={showAll ? 'chevron-up' : 'chevron-down'} className="w-3 h-3" />
                {showAll ? 'Show fewer' : `Show all ${groups.length}`}
              </button>
            )}
          </>
        )}

        {!loading && !error && note && (
          <p className="text-[10px] text-slate-400 mt-2">{note}</p>
        )}
      </div>
    </div>
  );
}
