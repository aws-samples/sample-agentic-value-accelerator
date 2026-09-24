// Suite builder — slide-over for authoring an evaluation suite: name,
// JSONL dataset, and evaluator selection with per-evaluator thresholds.
// Hard gates are always on (that's what makes them gates).

import { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { EvaluatedApp, SuiteCase } from './types';
import { EVALUATORS } from './demoData';
import { evaluationApi } from './api';
import { GateChip } from './ScoreCard';

const JSONL_HINT = `{"input": {"customer_id": "CUST-4471"}, "expectedBehavior": "ESCALATE — offshore incorporation + PEP exposure requires EDD under MLR 2017 Reg. 33"}`;

// Serialize a stored case back into an editable JSONL line. Inputs that are
// JSON payloads are re-embedded as objects so the line stays readable.
function caseToLine(c: SuiteCase): string {
  let input: unknown = c.input;
  try {
    input = JSON.parse(c.input);
  } catch {
    /* plain-text input stays a string */
  }
  return JSON.stringify({
    ...(c.id ? { id: c.id } : {}),
    input,
    expectedBehavior: c.expectedBehavior,
    ...(c.agentResponse ? { agentResponse: c.agentResponse } : {}),
  });
}

interface Props {
  app: EvaluatedApp;
  onClose: () => void;
}

export default function SuiteBuilder({ app, onClose }: Props) {
  const [name, setName] = useState(`${app.name} — Evaluation Suite`);
  const [dataset, setDataset] = useState('');
  const [thresholds, setThresholds] = useState<Record<string, number>>(
    Object.fromEntries(EVALUATORS.map((e) => [e.id, e.defaultThreshold])),
  );
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(EVALUATORS.map((e) => [e.id, true])),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [loadedFromSuite, setLoadedFromSuite] = useState<string | null>(null);
  const [versions, setVersions] = useState<{ id: string; name: string; createdAt: string; caseCount: number }[]>([]);
  const [versionError, setVersionError] = useState<string | null>(null);

  const refreshVersions = () => evaluationApi.listSuites(app.deploymentId).then(setVersions);

  const removeVersion = async (id: string) => {
    setVersionError(null);
    const res = await evaluationApi.deleteSuite(id);
    if (!res.ok) setVersionError(res.error ?? 'Delete failed.');
    refreshVersions();
  };
  const [latencySlaS, setLatencySlaS] = useState(60);
  const [costBudget, setCostBudget] = useState(0.1);
  const [repeats, setRepeats] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Open pre-filled with the current suite so "add a case" means adding a
  // line, not re-typing the whole dataset. Saving creates a new suite
  // version; runs always pick the newest.
  useEffect(() => {
    evaluationApi.getSuite(app.deploymentId).then((suite) => {
      if (!suite) return;
      if (suite.name) setName(suite.name);
      if (suite.cases?.length) setDataset(suite.cases.map(caseToLine).join('\n'));
      if (suite.evaluators?.length) {
        setThresholds((t) => ({ ...t, ...Object.fromEntries(suite.evaluators!.map((e) => [e.id, e.threshold])) }));
        setEnabled((en) => ({ ...en, ...Object.fromEntries(suite.evaluators!.map((e) => [e.id, e.enabled])) }));
      }
      if (suite.latency_sla_ms) setLatencySlaS(suite.latency_sla_ms / 1000);
      if (suite.cost_budget_usd) setCostBudget(suite.cost_budget_usd);
      if (suite.repeats) setRepeats(suite.repeats);
      setLoadedFromSuite(suite.name || suite.id);
    });
    evaluationApi.listSuites(app.deploymentId).then(setVersions);
  }, [app.deploymentId]);

  // Append a ready-to-edit case line, cloning the shape of the last case so
  // the input matches what this agent's API expects.
  const addCase = () => {
    const last = parsedCases[parsedCases.length - 1];
    let input: unknown = { customer_id: 'CUST-XXXX' };
    if (last) {
      try {
        input = JSON.parse(last.input);
      } catch {
        input = last.input;
      }
    }
    const line = JSON.stringify({ input, expectedBehavior: 'Describe what a correct answer must contain for this case.' });
    setDataset((d) => (d.trim() ? `${d.trimEnd()}\n${line}` : line));
  };

  // Parse the JSONL textarea into case objects — the backend stores `cases`
  // verbatim and the runner reads input/expectedBehavior/agentResponse.
  const parsedCases = (() => {
    const raw = dataset
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('{'))
      .flatMap((l) => {
        try {
          const o = JSON.parse(l) as Record<string, unknown>;
          return [{
            id: typeof o.id === 'string' ? o.id : '',
            input: typeof o.input === 'string' ? o.input : JSON.stringify(o.input ?? ''),
            expectedBehavior: String(o.expectedBehavior ?? ''),
            ...(o.agentResponse ? { agentResponse: String(o.agentResponse) } : {}),
          }];
        } catch {
          return [];
        }
      });
    // Ids must be unique — pairwise comparison keys cases by id, so a
    // position-generated 'case-002' colliding with an explicit 'case-002'
    // on another line would silently corrupt head-to-head pairing.
    const seen = new Set<string>();
    let n = 0;
    return raw.map((c) => {
      let id = c.id;
      if (!id || seen.has(id)) {
        do {
          n += 1;
          id = `case-${String(n).padStart(3, '0')}`;
        } while (seen.has(id));
      }
      seen.add(id);
      return { ...c, id };
    });
  })();
  const caseCount = parsedCases.length;

  const save = async () => {
    setSaving(true);
    const { data, demo, error } = await evaluationApi.createSuite({
      name,
      target_deployment_id: app.deploymentId,
      cases: parsedCases,
      evaluators: EVALUATORS.map((e) => ({ id: e.id, threshold: thresholds[e.id], enabled: e.gate === 'hard' || enabled[e.id] })),
      latency_sla_ms: latencySlaS * 1000,
      cost_budget_usd: costBudget,
      repeats,
    });
    setSaving(false);
    if (!data) {
      setSaved(error ? `Save failed — ${error}` : 'Save failed.');
      return;
    }
    setSaved(demo ? `Saved locally (demo mode) — ${data.suiteId}` : `Suite saved — ${data.suiteId}`);
    refreshVersions();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto animate-fade-in">
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-slate-900">Configure evaluation suite</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Suite name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <p className="text-xs text-slate-400 mt-1">
              Target: {app.name} ({app.framework} · {app.source})
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Test cases — one per line
              </label>
              <button
                onClick={addCase}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 transition-colors"
              >
                + Add case
              </button>
            </div>
            <textarea
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
              rows={8}
              placeholder={JSONL_HINT}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-slate-300"
            />
            <p className="text-xs text-slate-400 mt-1">
              {caseCount > 0
                ? `${caseCount} case${caseCount === 1 ? '' : 's'} detected${loadedFromSuite ? ` — loaded from “${loadedFromSuite}”. Edit or add lines; saving creates a new suite version` : ''}.`
                : 'Each line: the input payload sent to the agent plus the expected behavior the judge scores against.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Evaluators</label>
            <div className="space-y-1.5">
              {EVALUATORS.map((e) => (
                <div key={e.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200/70">
                  <input
                    type="checkbox"
                    checked={e.gate === 'hard' ? true : enabled[e.id]}
                    disabled={e.gate === 'hard'}
                    onChange={(ev) => setEnabled({ ...enabled, [e.id]: ev.target.checked })}
                    className="accent-indigo-600 disabled:opacity-60"
                    title={e.gate === 'hard' ? 'Hard gates are always evaluated' : undefined}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 truncate">{e.name}</span>
                      <GateChip gate={e.gate} />
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{e.description}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-slate-400">≥</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={thresholds[e.id]}
                      onChange={(ev) => setThresholds({ ...thresholds, [e.id]: Number(ev.target.value) })}
                      className="w-14 rounded-md border border-slate-200 px-1.5 py-1 text-xs text-slate-800 tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <span className="text-[10px] text-slate-400">%</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Hard gates cannot be disabled — an agent that skips them cannot earn autonomy.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Performance targets
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                Latency SLA
                <input
                  type="number"
                  min={1}
                  value={latencySlaS}
                  onChange={(e) => setLatencySlaS(Number(e.target.value))}
                  className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <span className="text-xs text-slate-400">s</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                Cost budget
                <input
                  type="number"
                  min={0.001}
                  step={0.01}
                  value={costBudget}
                  onChange={(e) => setCostBudget(Number(e.target.value))}
                  className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <span className="text-xs text-slate-400">$/decision</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                Repeats
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={repeats}
                  onChange={(e) => setRepeats(Math.max(1, Math.min(5, Number(e.target.value))))}
                  className="w-14 rounded-md border border-slate-200 px-2 py-1 text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <span className="text-xs text-slate-400">×/case</span>
              </label>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Targets are a risk-appetite choice per suite. Repeats &gt; 1 measures run-to-run noise and adds ± error
              bars to scores (multiplies run time and cost).
            </p>
          </div>

          {versions.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Suite versions
              </label>
              <div className="space-y-1.5">
                {versions.map((v, i) => (
                  <div key={v.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200/70">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-800 truncate">{v.name}</span>
                        {i === 0 && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 shrink-0">
                            current
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {v.caseCount} case{v.caseCount === 1 ? '' : 's'} ·{' '}
                        {new Date(v.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                    <button
                      onClick={() => removeVersion(v.id)}
                      title={i === 0 ? 'Delete current suite — the next-newest becomes current' : 'Delete this version'}
                      className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Runs use the newest version. Deleting a suite never affects completed runs — they keep their
                own copy of the cases they were judged against.
              </p>
              {versionError && <p className="text-xs text-red-600 mt-1">{versionError}</p>}
            </div>
          )}

          <div className="flex items-center gap-3 pb-6">
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg px-4 py-2 shadow-sm transition-colors"
            >
              {saving ? 'Saving…' : 'Save suite'}
            </button>
            <button onClick={onClose} className="text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors">
              Cancel
            </button>
            {saved && <span className="text-xs text-emerald-600 font-medium">{saved}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
