/**
 * HarnessAuditViewer - Timeline view of harness audit runs and artifacts
 *
 * Implements the Visa VVAH (Verified Verifiable Audit History) pattern for
 * viewing harness governance audit data. Shows a timeline of harness runs,
 * expandable artifacts per run, gates passed/failed visualization, and
 * JSON export capability.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { Icon } from './icons';
import Drawer from './Drawer';

// Types matching backend models
interface HarnessAuditArtifact {
  artifact_id: string;
  harness_type: string;
  action_type: 'discovery' | 'invocation' | 'tool_use' | 'validation';
  timestamp: string;
  user_identity: string;
  session_id?: string;
  model_id?: string;
  tool_name?: string;
  target_path?: string;
  input_hash?: string;
  output_hash?: string;
  duration_ms: number;
  token_count?: number;
  policy_evaluation?: Record<string, unknown>;
  gates_passed: string[];
  gates_failed: string[];
  verdict: 'allowed' | 'blocked' | 'needs_review';
}

interface HarnessRunSummary {
  total_artifacts: number;
  by_action_type: Record<string, number>;
  by_verdict: Record<string, number>;
  total_duration_ms: number;
  total_tokens: number;
  gates_passed: number;
  gates_failed: number;
}

interface HarnessRunManifest {
  run_id: string;
  harness_type: string;
  harness_version: string;
  started_at: string;
  completed_at?: string;
  user_identity: string;
  config_hash: string;
  git_sha?: string;
  artifacts: string[];
  summary: HarnessRunSummary;
}

interface HarnessRunManifestWithArtifacts extends HarnessRunManifest {
  artifact_details: HarnessAuditArtifact[];
}

// API client
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function fetchRuns(): Promise<HarnessRunManifest[]> {
  const resp = await fetch(`${API_URL}/api/v1/govern/harness-audit/runs`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error('Failed to fetch runs');
  return resp.json();
}

async function fetchRunWithArtifacts(runId: string): Promise<HarnessRunManifestWithArtifacts> {
  const resp = await fetch(`${API_URL}/api/v1/govern/harness-audit/runs/${runId}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error('Failed to fetch run');
  return resp.json();
}

// MOCK_RUNS was removed here. Its last consumer was the artifact-fetch catch below, which
// substituted fabricated records when the store was unreachable. The run-list fetch already
// renders an honest `offline` state instead, so no fixture remains for this view.

// MOCK_ARTIFACTS was removed here. It was substituted into runArtifacts on any artifact
// fetch error, and handleExport bundles that array into a downloadable "AVA Harness Audit
// Bundle" - so a fetch failure produced fabricated evidence that could leave the browser as
// audit material. The failure is now surfaced and export is disabled for that run.

// Styling maps
const verdictStyles: Record<string, { bg: string; text: string }> = {
  allowed: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  blocked: { bg: 'bg-rose-100', text: 'text-rose-700' },
  needs_review: { bg: 'bg-amber-100', text: 'text-amber-700' },
};

const actionStyles: Record<string, { bg: string; text: string; border: string }> = {
  discovery: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  invocation: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  tool_use: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  validation: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString();
}

function GatesVisualization({ passed, failed }: { passed: string[]; failed: string[] }) {
  const total = passed.length + failed.length;
  if (total === 0) return null;
  const passRate = total > 0 ? (passed.length / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-slate-500">Gates:</span>
        <span className="text-emerald-600 font-medium">{passed.length} passed</span>
        {failed.length > 0 && (
          <span className="text-rose-600 font-medium">{failed.length} failed</span>
        )}
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${passRate}%` }}
        />
        {failed.length > 0 && (
          <div
            className="h-full bg-rose-500 transition-all"
            style={{ width: `${100 - passRate}%` }}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {passed.map((g) => (
          <span
            key={g}
            className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
          >
            {g}
          </span>
        ))}
        {failed.map((g) => (
          <span
            key={g}
            className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200"
          >
            {g}
          </span>
        ))}
      </div>
    </div>
  );
}

function ArtifactCard({ artifact, onClick }: { artifact: HarnessAuditArtifact; onClick: () => void }) {
  const style = actionStyles[artifact.action_type] || actionStyles.discovery;
  const verdictStyle = verdictStyles[artifact.verdict] || verdictStyles.allowed;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border ${style.border} ${style.bg} hover:shadow-md transition-shadow`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${style.text} ${style.bg}`}>
            {artifact.action_type.replace('_', ' ')}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${verdictStyle.bg} ${verdictStyle.text}`}>
            {artifact.verdict.replace('_', ' ')}
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">{artifact.artifact_id}</span>
      </div>

      <div className="space-y-1 text-[11px] text-slate-600 mb-3">
        {artifact.model_id && (
          <div className="flex items-center gap-2">
            <Icon name="cpu-chip" className="w-3.5 h-3.5 text-slate-400" />
            <span className="truncate">{artifact.model_id}</span>
          </div>
        )}
        {artifact.tool_name && (
          <div className="flex items-center gap-2">
            <Icon name="wrench" className="w-3.5 h-3.5 text-slate-400" />
            <span>{artifact.tool_name}</span>
            {artifact.target_path && (
              <span className="text-slate-400 truncate">{artifact.target_path}</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-4">
          <span className="text-slate-400">{formatDuration(artifact.duration_ms)}</span>
          {artifact.token_count && (
            <span className="text-slate-400">{artifact.token_count.toLocaleString()} tokens</span>
          )}
        </div>
      </div>

      <GatesVisualization passed={artifact.gates_passed} failed={artifact.gates_failed} />
    </button>
  );
}

function RunCard({
  run,
  expanded,
  onToggle,
  onExport,
  artifacts,
  artifactsUnavailable,
  onSelectArtifact,
}: {
  run: HarnessRunManifest;
  expanded: boolean;
  onToggle: () => void;
  onExport: () => void;
  artifacts: HarnessAuditArtifact[];
  /** True when this run's artifact fetch failed. Blocks export: an audit bundle must not
   *  be emitted with a silently empty artifact list. */
  artifactsUnavailable?: boolean;
  onSelectArtifact: (a: HarnessAuditArtifact) => void;
}) {
  const hasFailures = run.summary.gates_failed > 0 || (run.summary.by_verdict.blocked ?? 0) > 0;
  const hasReviews = (run.summary.by_verdict.needs_review ?? 0) > 0;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 hover:bg-slate-50/60 transition flex items-center gap-4"
      >
        <div className={`w-3 h-3 rounded-full ${
          hasFailures ? 'bg-rose-500' : hasReviews ? 'bg-amber-500' : 'bg-emerald-500'
        }`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{run.harness_type}</span>
            <span className="text-[10px] text-slate-400">v{run.harness_version}</span>
            {run.git_sha && (
              <span className="text-[10px] font-mono text-slate-400">@{run.git_sha.slice(0, 7)}</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 flex items-center gap-3 mt-0.5">
            <span>{formatTimestamp(run.started_at)}</span>
            <span>{run.user_identity}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[11px]">
          <div className="text-center">
            <div className="font-semibold text-slate-900">{run.summary.total_artifacts}</div>
            <div className="text-slate-400">artifacts</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-emerald-600">{run.summary.gates_passed}</div>
            <div className="text-slate-400">passed</div>
          </div>
          {run.summary.gates_failed > 0 && (
            <div className="text-center">
              <div className="font-semibold text-rose-600">{run.summary.gates_failed}</div>
              <div className="text-slate-400">failed</div>
            </div>
          )}
          <div className="text-center">
            <div className="font-semibold text-slate-900">{formatDuration(run.summary.total_duration_ms)}</div>
            <div className="text-slate-400">duration</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Disabled when the artifact fetch failed. handleExport bundles the artifacts
              array into a downloadable "AVA Harness Audit Bundle"; with an unreadable store
              that array is empty, and a bundle whose evidence section is silently empty is
              worse than no bundle. */}
          <button
            onClick={(e) => { e.stopPropagation(); if (!artifactsUnavailable) onExport(); }}
            disabled={artifactsUnavailable}
            className={`p-2 rounded-lg transition ${
              artifactsUnavailable
                ? 'text-slate-300 cursor-not-allowed'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
            }`}
            title={artifactsUnavailable
              ? 'Export unavailable — the artifacts for this run could not be read, so the bundle would contain no evidence.'
              : 'Export as JSON'}
          >
            <Icon name="arrow-down-tray" className="w-4 h-4" />
          </button>
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            className="w-5 h-5 text-slate-400"
          />
        </div>
      </button>

      {/* Expanded artifacts */}
      {expanded && (
        <div className="px-5 pb-5 pt-2 border-t border-slate-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {artifacts.map((a) => (
              <ArtifactCard key={a.artifact_id} artifact={a} onClick={() => onSelectArtifact(a)} />
            ))}
          </div>
          {artifacts.length === 0 && (
            artifactsUnavailable ? (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/60">
                <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600 flex-shrink-0 mt-px" />
                <div className="text-xs text-amber-800">
                  Artifacts for this run could not be read.
                  <span className="block text-[11px] text-amber-700/80 mt-0.5">
                    The artifact store is unreachable or the run's evidence has been expired. Nothing is shown
                    rather than substituting example artifacts — and export is disabled, because an audit
                    bundle without its evidence is not an audit bundle.
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400 text-sm py-4">
                Loading artifacts...
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function HarnessAuditViewer() {
  const [runs, setRuns] = useState<HarnessRunManifest[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'offline'>('loading');
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runArtifacts, setRunArtifacts] = useState<Record<string, HarnessAuditArtifact[]>>({});
  // Runs whose artifact fetch failed. Kept separate from runArtifacts so an empty list
  // (a run genuinely without artifacts) stays distinguishable from an unreadable one.
  const [artifactErrors, setArtifactErrors] = useState<Record<string, boolean>>({});
  const [selectedArtifact, setSelectedArtifact] = useState<HarnessAuditArtifact | null>(null);
  const mounted = useRef(true);

  // Load runs on mount
  useEffect(() => {
    mounted.current = true;
    fetchRuns()
      .then((data) => {
        if (!mounted.current) return;
        if (data.length > 0) {
          setRuns(data);
          setState('ready');
        } else {
          setState('empty');
        }
      })
      .catch(() => {
        if (!mounted.current) return;
        // Honest offline state — do NOT present MOCK_RUNS under a Live badge.
        // The backend/store is unreachable or unconfigured, so surface that plainly
        // instead of fabricating runs that would render beneath the LiveDataBadge.
        setState('offline');
      });
    return () => { mounted.current = false; };
  }, []);

  // Load artifacts when a run is expanded
  const handleToggleRun = useCallback(async (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
      return;
    }
    setExpandedRun(runId);

    // Check if we already have artifacts
    if (runArtifacts[runId]) return;
    setArtifactErrors((prev) => (prev[runId] ? { ...prev, [runId]: false } : prev));

    try {
      const data = await fetchRunWithArtifacts(runId);
      if (mounted.current) {
        setRunArtifacts((prev) => ({ ...prev, [runId]: data.artifact_details }));
      }
    } catch {
      // Honest failure, matching the run-list .catch above, which already states the rule:
      // do NOT present mock records under a Live badge. This branch used to substitute
      // MOCK_ARTIFACTS on any fetch error, so an unreachable artifact store rendered
      // fabricated evidence artifacts - and handleExport bundles exactly this array into a
      // downloadable "AVA Harness Audit Bundle", so the fabrication left the browser as
      // audit evidence. Record the failure instead and let the UI say so.
      if (mounted.current) {
        setArtifactErrors((prev) => ({ ...prev, [runId]: true }));
      }
    }
  }, [expandedRun, runArtifacts]);

  const handleExport = useCallback((run: HarnessRunManifest, artifacts: HarnessAuditArtifact[]) => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      format: 'AVA Harness Audit Bundle v1.0',
      manifest: run,
      artifacts: artifacts || [],
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `harness-audit-${run.run_id}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Summary stats
  const totalRuns = runs.length;
  const totalArtifacts = runs.reduce((acc, r) => acc + r.summary.total_artifacts, 0);
  const totalPassed = runs.reduce((acc, r) => acc + r.summary.gates_passed, 0);
  const totalFailed = runs.reduce((acc, r) => acc + r.summary.gates_failed, 0);
  const passRate = totalPassed + totalFailed > 0
    ? Math.round((totalPassed / (totalPassed + totalFailed)) * 100)
    : 100;

  return (
    <GovernPageLayout
      title="Harness Audit"
      description="Timeline of harness runs, artifacts, and governance gate results. Implements the Visa VVAH pattern for verifiable audit history."
      badge={
        state === 'ready' && runs.length > 0 ? (
          <LiveDataBadge source="Harness Audit API" detail={`${runs.length} runs`} />
        ) : (
          <MockDataBadge integration="Harness Audit API (S3/filesystem backend)" />
        )
      }
    >
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Harness Runs" value={totalRuns} />
          <StatCard label="Artifacts" value={totalArtifacts} />
          <StatCard label="Gate Pass Rate" value={`${passRate}%`} variant={passRate >= 90 ? 'success' : passRate >= 70 ? 'warning' : 'danger'} />
          <StatCard label="Gates Failed" value={totalFailed} variant={totalFailed > 0 ? 'danger' : 'muted'} />
        </div>

        {/* Loading state */}
        {state === 'loading' && (
          <div className="bg-white/80 rounded-xl border border-slate-200/60 shadow-sm p-6 text-center text-sm text-slate-400 animate-pulse">
            Loading harness audit data...
          </div>
        )}

        {/* Empty state */}
        {state === 'empty' && (
          <div className="bg-white/80 rounded-xl border border-slate-200/60 shadow-sm p-8 text-center">
            <Icon name="shield-check" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <div className="text-sm font-semibold text-slate-800 mb-1">No harness runs recorded</div>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              Harness audit artifacts are created when AI harnesses (Claude Code, MCP servers, Bedrock agents) execute with governance enabled.
            </p>
          </div>
        )}

        {/* Offline state */}
        {state === 'offline' && (
          <div className="text-[12px] text-amber-700 bg-amber-50/70 rounded-xl border border-amber-200 px-5 py-4">
            Backend unreachable or the harness audit store isn't configured. This surface requires the harness audit service to be running.
          </div>
        )}

        {/* Runs timeline */}
        {state === 'ready' && runs.length > 0 && (
          <div className="space-y-3">
            {runs.map((run) => (
              <RunCard
                key={run.run_id}
                run={run}
                expanded={expandedRun === run.run_id}
                onToggle={() => handleToggleRun(run.run_id)}
                onExport={() => handleExport(run, runArtifacts[run.run_id] || [])}
                artifacts={runArtifacts[run.run_id] || []}
                artifactsUnavailable={!!artifactErrors[run.run_id]}
                onSelectArtifact={setSelectedArtifact}
              />
            ))}
          </div>
        )}

        {/* Artifact detail drawer */}
        <Drawer
          open={selectedArtifact != null}
          onClose={() => setSelectedArtifact(null)}
          title={selectedArtifact ? `Artifact ${selectedArtifact.artifact_id}` : ''}
          subtitle={selectedArtifact?.timestamp ? formatTimestamp(selectedArtifact.timestamp) : ''}
          width="md"
        >
          {selectedArtifact && (
            <div className="space-y-5">
              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${actionStyles[selectedArtifact.action_type]?.text || ''} ${actionStyles[selectedArtifact.action_type]?.bg || ''}`}>
                  {selectedArtifact.action_type.replace('_', ' ')}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${verdictStyles[selectedArtifact.verdict]?.text || ''} ${verdictStyles[selectedArtifact.verdict]?.bg || ''}`}>
                  {selectedArtifact.verdict.replace('_', ' ')}
                </span>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">Harness Type</div>
                  <div className="text-sm text-slate-900 mt-1">{selectedArtifact.harness_type}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">User</div>
                  <div className="text-sm text-slate-900 mt-1">{selectedArtifact.user_identity}</div>
                </div>
                {selectedArtifact.session_id && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-400">Session</div>
                    <div className="text-sm text-slate-900 mt-1 font-mono">{selectedArtifact.session_id}</div>
                  </div>
                )}
                {selectedArtifact.model_id && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-400">Model</div>
                    <div className="text-sm text-slate-900 mt-1 truncate">{selectedArtifact.model_id}</div>
                  </div>
                )}
                {selectedArtifact.tool_name && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-400">Tool</div>
                    <div className="text-sm text-slate-900 mt-1">{selectedArtifact.tool_name}</div>
                  </div>
                )}
                {selectedArtifact.target_path && (
                  <div className="col-span-2">
                    <div className="text-[10px] uppercase tracking-widest text-slate-400">Target Path</div>
                    <div className="text-sm text-slate-900 mt-1 font-mono truncate">{selectedArtifact.target_path}</div>
                  </div>
                )}
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Duration</div>
                  <div className="text-lg font-semibold text-slate-900">{formatDuration(selectedArtifact.duration_ms)}</div>
                </div>
                {selectedArtifact.token_count && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Tokens</div>
                    <div className="text-lg font-semibold text-slate-900">{selectedArtifact.token_count.toLocaleString()}</div>
                  </div>
                )}
              </div>

              {/* Hashes */}
              {(selectedArtifact.input_hash || selectedArtifact.output_hash) && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Evidence Hashes</div>
                  <div className="space-y-1">
                    {selectedArtifact.input_hash && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-500">Input:</span>
                        <span className="font-mono text-slate-700">{selectedArtifact.input_hash}</span>
                      </div>
                    )}
                    {selectedArtifact.output_hash && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-500">Output:</span>
                        <span className="font-mono text-slate-700">{selectedArtifact.output_hash}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Gates */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Governance Gates</div>
                <GatesVisualization passed={selectedArtifact.gates_passed} failed={selectedArtifact.gates_failed} />
              </div>

              {/* Policy evaluation */}
              {selectedArtifact.policy_evaluation && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Policy Evaluation</div>
                  <pre className="bg-slate-50 rounded-lg p-3 text-[11px] text-slate-700 overflow-auto max-h-40">
                    {JSON.stringify(selectedArtifact.policy_evaluation, null, 2)}
                  </pre>
                </div>
              )}

              {/* Export button */}
              <div className="pt-3 border-t border-slate-100">
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(selectedArtifact, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `artifact-${selectedArtifact.artifact_id}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
                >
                  Export Artifact JSON
                </button>
              </div>
            </div>
          )}
        </Drawer>
      </div>
    </GovernPageLayout>
  );
}
