/**
 * RegionDiscoveryPrompt — auto-prompt to bring active-but-ungoverned AWS regions
 * under governance.
 *
 * Scans the account's enabled regions (via governRegionsApi.discovery) for governed-AI
 * signals and, when regions with real AI activity are NOT yet in the governed set,
 * surfaces a banner letting the operator pull them in with one click. Renders nothing
 * when every active region is already governed.
 */

import { useCallback, useEffect, useState } from 'react';
import { governRegionsApi, type AwsRegionScopeResponse, type AwsRegionSignal } from '../../api/client';
import { Icon } from './icons';

/** 'govern_risk_posture' -> 'risk posture'. Reads the registry rather than a hand-kept list. */
function surfaceLabel(surface: string): string {
  return surface.replace(/^govern_/, '').replace(/_/g, ' ');
}

function signalSummary(r: AwsRegionSignal): string {
  const parts: string[] = [];
  if (r.agent_runtimes) parts.push(`${r.agent_runtimes} agents`);
  if (r.workload_identities) parts.push(`${r.workload_identities} identities`);
  if (r.guardrails) parts.push(`${r.guardrails} guardrails`);
  if (r.gateways) parts.push(`${r.gateways} gateways`);
  if (r.knowledge_bases) parts.push(`${r.knowledge_bases} KBs`);
  if (r.has_bedrock_activity && !parts.length) parts.push('Bedrock activity');
  return parts.join(' · ') || 'AI activity';
}

export default function RegionDiscoveryPrompt() {
  const [regions, setRegions] = useState<AwsRegionSignal[]>([]);
  const [ungoverned, setUngoverned] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  // Which Govern surfaces actually fan out. Governing a region does NOT make every
  // panel cover it, so the confirmation message reads this instead of claiming it does.
  const [scope, setScope] = useState<AwsRegionScopeResponse | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [r, s] = await Promise.all([
        governRegionsApi.discovery(),
        governRegionsApi.scope().catch(() => null),
      ]);
      setRegions(r.regions ?? []);
      setUngoverned(r.discovered_ungoverned ?? []);
      setScope(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to scan regions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const pullIn = async () => {
    if (!ungoverned.length) return;
    setApplying(true);
    try {
      await governRegionsApi.govern(ungoverned, 'add');
      setJustAdded(true);
      await load(); // refresh — pulled-in regions now report governed
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update governed regions');
    } finally {
      setApplying(false);
    }
  };

  // Success flash after pulling regions in (banner will otherwise render nothing).
  if (justAdded && ungoverned.length === 0) {
    const multiRegion = scope?.by_scope?.['multi-region'] ?? [];
    const total = scope?.surfaces?.length ?? 0;
    return (
      <div className="mb-6 rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 flex items-start gap-2 animate-fade-in">
        <Icon name="check-circle" className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
        <span className="text-sm text-emerald-800">
          Regions brought under governance.
          {multiRegion.length > 0 && total > 0 ? (
            <>
              {' '}
              {multiRegion.length} of {total} Govern surfaces aggregate across the governed
              set ({multiRegion.map(surfaceLabel).join(', ')}). The rest read one region
              each, or one account-wide endpoint.
            </>
          ) : (
            <> Panels that aggregate across regions will include them; single-region panels still read one region each.</>
          )}
        </span>
      </div>
    );
  }

  // Only prompt when there's something actionable.
  if (loading || error || ungoverned.length === 0) return null;

  const candidates = regions.filter((r) => ungoverned.includes(r.region));

  return (
    <div className="mb-6 rounded-xl border border-amber-200/70 bg-amber-50/60 backdrop-blur-sm shadow-sm overflow-hidden animate-fade-in">
      <div className="px-4 py-3 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <Icon name="globe-alt" className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">
              AI activity detected in {ungoverned.length} region{ungoverned.length > 1 ? 's' : ''} outside governance
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              These regions have governed-AI resources or Bedrock activity but aren't in your governed set —
              their posture, guardrails, and telemetry are not being aggregated.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {candidates.map((r) => (
                <span
                  key={r.region}
                  className="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md bg-white border border-amber-200 text-slate-700"
                  title={signalSummary(r)}
                >
                  <Icon name="map-pin" className="w-3 h-3 text-amber-500" />
                  <span className="font-mono font-medium">{r.region}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{signalSummary(r)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={pullIn}
          disabled={applying}
          className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
        >
          <Icon name={applying ? 'arrow-path' : 'plus'} className={`w-3.5 h-3.5 ${applying ? 'animate-spin' : ''}`} />
          {applying ? 'Adding…' : 'Bring under governance'}
        </button>
      </div>
    </div>
  );
}
