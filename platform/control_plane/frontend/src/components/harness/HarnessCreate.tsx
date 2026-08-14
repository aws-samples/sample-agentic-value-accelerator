import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { harnessApi, type FoundationModel, type HarnessCreateRequest, type ToolConfig } from './api';
import { mcpApi, type McpServer } from '../mcp/api';

/**
 * 3-step Harness create / edit wizard.
 *   1. Basics       — name, execution role, model, system prompt
 *   2. Capabilities — tools + managed memory + guardrail id
 *   3. Review       — one-click submit
 *
 * Edit mode is triggered when the route provides a `:harnessId` param (e.g.
 * /harness/:id/edit). The wizard prefills from GetHarness, locks the name
 * field (AgentCore doesn't allow renames), and submits PATCH — which creates
 * a new immutable version per AgentCore's automatic versioning rules.
 *
 * Skills, VPC, BYO container, custom JWT auth, and inline function tools are
 * v2 per the locked plan.
 */
interface HarnessCreateProps {
  /** When true, wizard runs in edit mode and reads the harness id from useParams(). */
  editMode?: boolean;
}

// AgentCore tool names must be identifier-shaped. Convert an arbitrary MCP
// server display name (which the user can type freely) into something the
// harness accepts as a tool name.
function _sanitizeToolName(v: string): string {
  const cleaned = (v || '').replace(/[^A-Za-z0-9_]/g, '_');
  const trimmed = cleaned.replace(/^_+|_+$/g, '');
  if (!trimmed) return '';
  return /^[A-Za-z]/.test(trimmed) ? trimmed.slice(0, 48) : `mcp_${trimmed}`.slice(0, 48);
}

export default function HarnessCreate({ editMode = false }: HarnessCreateProps) {
  const nav = useNavigate();
  const { harnessId: routeHarnessId = '' } = useParams<{ harnessId?: string }>();
  const isEdit = editMode && !!routeHarnessId;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [prefillLoading, setPrefillLoading] = useState<boolean>(isEdit);

  const [name, setName] = useState('');
  const [roleArn, setRoleArn] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  // Default model choice — Haiku 4.5 by design (cheap, fast, capable enough for
  // most FSI scaffolds; users can override on the dropdown).
  //
  // IMPORTANT: Bedrock inference-profile IDs must be full-form, with the
  // date-and-version suffix (…YYYYMMDD-v1:0). The short "global.anthropic.
  // claude-haiku-4-5" alias is rejected by ConverseStream with
  // ValidationException: "The provided model identifier is invalid".
  const DEFAULT_MODEL_ID = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';

  // Static fallback the dropdown falls back to when the Bedrock
  // ListFoundationModels call is unavailable (missing IAM, region gap, or
  // pre-Terraform-apply local dev). Not exhaustive — just the curated set most
  // FSI teams reach for. IDs verified against `aws bedrock
  // list-inference-profiles` in us-east-1 on the golden account.
  const FALLBACK_MODELS: FoundationModel[] = [
    { modelId: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',  modelName: 'Claude Haiku 4.5',   providerName: 'Anthropic', inputModalities: ['TEXT'], outputModalities: ['TEXT'] },
    { modelId: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0', modelName: 'Claude Sonnet 4.5',  providerName: 'Anthropic', inputModalities: ['TEXT'], outputModalities: ['TEXT'] },
    { modelId: 'global.anthropic.claude-opus-4-5-20251101-v1:0',   modelName: 'Claude Opus 4.5',    providerName: 'Anthropic', inputModalities: ['TEXT'], outputModalities: ['TEXT'] },
    { modelId: 'us.amazon.nova-pro-v1:0',                          modelName: 'Amazon Nova Pro',    providerName: 'Amazon',    inputModalities: ['TEXT'], outputModalities: ['TEXT'] },
    { modelId: 'us.amazon.nova-lite-v1:0',                         modelName: 'Amazon Nova Lite',   providerName: 'Amazon',    inputModalities: ['TEXT'], outputModalities: ['TEXT'] },
  ];

  const [models, setModels] = useState<FoundationModel[]>([]);
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsErr, setModelsErr] = useState('');

  const [browser, setBrowser] = useState(false);
  const [codeInterp, setCodeInterp] = useState(false);
  // MCP tools attached to this harness — selected from the user's registered
  // MCP Servers (Build → MCP Servers). Stored as server_ids; URLs are looked
  // up at build time so an MCP server URL change in the registry propagates
  // to any harness edit without a stale copy.
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpServersLoading, setMcpServersLoading] = useState(true);
  const [selectedMcpIds, setSelectedMcpIds] = useState<Set<string>>(new Set());
  // In edit mode we may load harness tools before the registered-MCP list
  // arrives. Buffer the URLs from the harness so we can match them to server
  // IDs as soon as both are available.
  const [pendingMcpUrls, setPendingMcpUrls] = useState<Set<string> | null>(null);
  const [memoryOn, setMemoryOn] = useState(true);
  const [guardrailId, setGuardrailId] = useState('');
  const [guardrailVersion, setGuardrailVersion] = useState('DRAFT');

  useEffect(() => {
    harnessApi
      .listModels()
      .then((r) => {
        // Dynamic list wins when available; otherwise fall back to the curated
        // set so the wizard still functions.
        setModels(r.models && r.models.length > 0 ? r.models : FALLBACK_MODELS);
      })
      .catch((e) => {
        setModelsErr(String(e));
        setModels(FALLBACK_MODELS);
      })
      .finally(() => setModelsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Pre-fill the execution role ARN from the auto-provisioned Terraform role.
    // Empty string is fine — the field remains editable if the user wants to
    // override, or supply their own role in a fresh account.
    harnessApi
      .defaults()
      .then((d) => {
        if (d.execution_role_arn) setRoleArn(d.execution_role_arn);
      })
      .catch(() => {
        /* silent — user can still type their own ARN */
      });
    // Registered MCP servers — feeds the picker in Step 2. Failure is
    // non-fatal; user can still register one from /mcp and re-open the wizard.
    mcpApi
      .list()
      .then((r) => setMcpServers(r.servers || []))
      .catch(() => setMcpServers([]))
      .finally(() => setMcpServersLoading(false));
  }, []);

  // In edit mode, prefill every field from GetHarness so the wizard shows
  // the current state as its baseline. Users see exactly what they had
  // before, then advance through the same 3 steps to save changes.
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    harnessApi
      .get(routeHarnessId)
      .then((h) => {
        if (cancelled) return;
        // Unwrap the { harness: { ... } } envelope if the backend didn't already.
        const rec = ((h as Record<string, unknown>).harness as Record<string, unknown>) || (h as Record<string, unknown>);
        setName(String(rec.harnessName || ''));
        setRoleArn(String(rec.executionRoleArn || rec.execution_role_arn || ''));
        const sp = rec.systemPrompt as Array<{ text?: string }> | undefined;
        setSystemPrompt(sp?.[0]?.text || '');
        const model = rec.model as Record<string, unknown> | undefined;
        const bedrockCfg = (model?.bedrockModelConfig || {}) as Record<string, unknown>;
        const mid = String(
          bedrockCfg.modelId
            || (model?.openAiModelConfig as Record<string, unknown> | undefined)?.modelId
            || (model?.liteLlmModelConfig as Record<string, unknown> | undefined)?.modelId
            || DEFAULT_MODEL_ID,
        );
        setModelId(mid);
        // Tools — hydrate the toggles + MCP server selection from the wire shape.
        const tools = (rec.tools as Array<Record<string, unknown>>) || [];
        setBrowser(tools.some((t) => t.type === 'agentcore_browser'));
        setCodeInterp(tools.some((t) => t.type === 'agentcore_code_interpreter'));
        // Map remote_mcp tool URLs back to registered server IDs so the
        // picker checkboxes light up. Servers we don't recognize are
        // silently dropped (they'd need to be re-registered).
        const mcpUrlsOnHarness = new Set(
          tools
            .filter((t) => t.type === 'remote_mcp')
            .map((t) => {
              const cfg = (t.config as Record<string, unknown> | undefined)?.remoteMcp as Record<string, unknown> | undefined;
              return String(cfg?.url || '').trim();
            })
            .filter(Boolean),
        );
        // mcpServers may not have loaded yet — defer resolution via a second
        // effect below that runs once both have arrived.
        (rec as { __pendingMcpUrls?: Set<string> }).__pendingMcpUrls = mcpUrlsOnHarness;
        setPendingMcpUrls(mcpUrlsOnHarness);
        // Memory — managed if present, disabled otherwise.
        const mem = rec.memory as Record<string, unknown> | undefined;
        setMemoryOn(!!(mem?.managedMemoryConfiguration || mem?.agentCoreMemoryConfiguration));
        // Guardrail — pull from additionalParams.guardrailConfig.
        const guard = (bedrockCfg.additionalParams as Record<string, unknown> | undefined)?.guardrailConfig as Record<string, unknown> | undefined;
        if (guard) {
          setGuardrailId(String(guard.guardrailIdentifier || ''));
          setGuardrailVersion(String(guard.guardrailVersion || 'DRAFT'));
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(`Failed to load harness for editing: ${String(e)}`);
      })
      .finally(() => {
        if (!cancelled) setPrefillLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, routeHarnessId]);

  // Resolve harness-side MCP URLs to registered server IDs once both
  // registered servers and the harness have loaded.
  useEffect(() => {
    if (!pendingMcpUrls || mcpServers.length === 0) return;
    const ids = new Set<string>();
    for (const s of mcpServers) {
      if (pendingMcpUrls.has((s.url || '').trim())) ids.add(s.server_id);
    }
    setSelectedMcpIds(ids);
    setPendingMcpUrls(null);
  }, [pendingMcpUrls, mcpServers]);

  // Group models by provider for a readable dropdown
  const grouped = useMemo(() => {
    const g: Record<string, FoundationModel[]> = {};
    for (const m of models) {
      (g[m.providerName || 'Other'] ||= []).push(m);
    }
    return g;
  }, [models]);

  const tools: ToolConfig[] = useMemo(() => {
    const t: ToolConfig[] = [];
    if (browser) t.push({ type: 'agentcore_browser', name: 'browser' });
    if (codeInterp) t.push({ type: 'agentcore_code_interpreter', name: 'code_interpreter' });
    // Resolve selected server IDs to their registered URLs at build time.
    // Server name → tool name so the harness detail shows something readable.
    const selected = mcpServers.filter((s) => selectedMcpIds.has(s.server_id));
    selected.forEach((s) => {
      const toolName = _sanitizeToolName(s.name) || `mcp_${s.server_id.slice(0, 8)}`;
      t.push({ type: 'remote_mcp', name: toolName, url: s.url });
    });
    return t;
  }, [browser, codeInterp, mcpServers, selectedMcpIds]);

  // AgentCore CreateHarness accepts: [a-zA-Z][a-zA-Z0-9_]{0,39}
  //   - must start with a letter
  //   - letters, digits, underscores only (no hyphens, spaces, dots)
  //   - 1–40 chars
  const HARNESS_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
  const nameError = (() => {
    const n = name.trim();
    if (!n) return '';
    if (n.length > 40) return 'Name must be 40 characters or fewer.';
    if (!/^[a-zA-Z]/.test(n)) return 'Name must start with a letter.';
    if (!/^[a-zA-Z0-9_]+$/.test(n)) return 'Only letters, digits, and underscores (_) are allowed — no hyphens, spaces, or dots.';
    return '';
  })();

  const canNext1 = HARNESS_NAME_REGEX.test(name.trim()) && roleArn.trim().length > 0;
  const canNext2 = true; // all optional

  const buildRequest = (): HarnessCreateRequest => ({
    harness_name: name.trim(),
    execution_role_arn: roleArn.trim(),
    system_prompt: systemPrompt.trim() || undefined,
    model_id: modelId || undefined,
    api_format: 'converse_stream',
    tools,
    memory: memoryOn
      ? { mode: 'managed', strategies: ['SEMANTIC', 'SUMMARIZATION'], event_expiry_duration: 30 }
      : { mode: 'disabled' },
    guardrail: guardrailId.trim()
      ? { guardrail_id: guardrailId.trim(), guardrail_version: guardrailVersion.trim() || 'DRAFT' }
      : undefined,
  });

  const submit = async () => {
    setSubmitting(true);
    setErr('');
    try {
      if (isEdit) {
        // AgentCore's UpdateHarness produces a new immutable version. Name is
        // fixed by the API contract, so we omit it from the payload.
        const { harness_name: _omit, ...updates } = buildRequest();
        void _omit;
        await harnessApi.update(routeHarnessId, updates);
        nav(`/harness/${routeHarnessId}`);
      } else {
        const resp = await harnessApi.create(buildRequest());
        const id = (resp.harnessId || resp.harness_id || resp.harnessArn) as string;
        nav(id ? `/harness/${id}` : '/harness');
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (prefillLoading) {
    return (
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8 text-sm text-slate-400 text-center">
        Loading harness…
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link to="/harness" className="hover:text-slate-700">Harness</Link>
        <span>›</span>
        {isEdit && (
          <>
            <Link to={`/harness/${routeHarnessId}`} className="hover:text-slate-700">{name || routeHarnessId}</Link>
            <span>›</span>
          </>
        )}
        <span className="text-slate-700 font-medium">{isEdit ? 'Edit' : 'Create'}</span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-1">
        {isEdit ? `Edit harness · ${name || routeHarnessId}` : 'Create harness'}
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        {isEdit
          ? 'Update any field and save. AgentCore automatically creates a new immutable version — the DEFAULT endpoint moves to the new version, older versions remain callable via named endpoints.'
          : 'Declare model, tools, and memory. AWS runs the agent loop for you.'}
      </p>

      <Stepper step={step} />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Harness name</label>
              <input
                value={name}
                onChange={(e) => !isEdit && setName(e.target.value)}
                readOnly={isEdit}
                title={isEdit ? 'AgentCore does not allow renaming a harness. Delete and recreate to change the name.' : undefined}
                placeholder="researchAgent"
                aria-invalid={nameError ? 'true' : 'false'}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                  nameError
                    ? 'border-red-300 focus:ring-red-400/40'
                    : 'border-slate-300 focus:ring-indigo-400/40'
                }`}
              />
              <div className="text-[11px] text-slate-500 mt-1">
                Must start with a letter. Letters, digits, and underscores (<code className="bg-slate-100 px-1 rounded">_</code>) only.
                No hyphens, spaces, or dots. Max 40 characters.
              </div>
              {nameError && (
                <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-1">
                  {nameError}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-2">
                Execution role ARN
                <span className="text-[9px] font-bold text-emerald-700/80 bg-emerald-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                  AVA-managed
                </span>
              </label>
              <input
                value={roleArn}
                readOnly
                aria-readonly="true"
                tabIndex={-1}
                placeholder={roleArn ? '' : 'Provisioning… run deploy-full.sh if this stays empty.'}
                title="Managed by the harness_execution_role Terraform module. Not editable — AVA hands this role to CreateHarness for you."
                className="w-full border border-slate-200 bg-slate-50 text-slate-600 rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed select-all focus:outline-none"
              />
              <div className="text-[11px] text-slate-500 mt-1">
                Provisioned once per account/region by AVA (via the <code className="bg-slate-100 px-1 rounded">harness_execution_role</code> Terraform module) and passed on your behalf. No IAM setup needed.
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-2">
                Model
                <span className="text-[9px] font-bold text-emerald-700/80 bg-emerald-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                  Admin-controlled
                </span>
              </label>
              {/* v1: only Claude Haiku 4.5 is enabled for self-service Harness
                  creation. Broader model access is gated on admin approval —
                  reach out to platform admins to unlock additional providers. */}
              <select
                value={DEFAULT_MODEL_ID}
                disabled
                aria-disabled="true"
                tabIndex={-1}
                title="Only Claude Haiku 4.5 is enabled for self-service creation. Reach out to your platform admin to unlock other models."
                className="w-full border border-slate-200 bg-slate-50 text-slate-600 rounded-lg px-3 py-2 text-sm cursor-not-allowed focus:outline-none"
              >
                <option value={DEFAULT_MODEL_ID}>
                  Claude Haiku 4.5 — {DEFAULT_MODEL_ID}
                </option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">System prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
                placeholder="You are a helpful FSI research assistant. Cite sources."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2">Tools</div>
              <ToggleRow
                label="AgentCore Browser"
                hint="Managed web browsing and automation."
                on={browser}
                onChange={setBrowser}
              />
              <ToggleRow
                label="AgentCore Code Interpreter"
                hint="Sandboxed Python/JS/TS execution."
                on={codeInterp}
                onChange={setCodeInterp}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-slate-700">MCP servers</div>
                <Link to="/mcp" className="text-[11px] text-indigo-700 hover:underline">
                  Manage in MCP Servers →
                </Link>
              </div>
              {mcpServersLoading ? (
                <div className="text-xs text-slate-400 py-2">Loading registered MCP servers…</div>
              ) : mcpServers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4 text-xs text-slate-500">
                  No MCP servers registered yet.{' '}
                  <Link to="/mcp" className="text-indigo-700 hover:underline font-medium">
                    Register one
                  </Link>{' '}
                  from Build → MCP Servers, then return here.
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {mcpServers.map((s) => {
                    const on = selectedMcpIds.has(s.server_id);
                    return (
                      <label
                        key={s.server_id}
                        className="flex items-start gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setSelectedMcpIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(s.server_id)) next.delete(s.server_id);
                              else next.add(s.server_id);
                              return next;
                            })
                          }
                          className="mt-0.5 w-4 h-4 accent-indigo-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-800 font-medium truncate">{s.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono truncate">{s.url}</div>
                        </div>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0">
                          {s.auth_hint}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2">Memory</div>
              <ToggleRow
                label="Managed memory"
                hint="Semantic + summarization strategies, 30-day event retention."
                on={memoryOn}
                onChange={setMemoryOn}
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2">Guardrail (optional)</div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={guardrailId}
                  onChange={(e) => setGuardrailId(e.target.value)}
                  placeholder="Guardrail ARN"
                  className="col-span-2 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                />
                <input
                  value={guardrailVersion}
                  onChange={(e) => setGuardrailVersion(e.target.value)}
                  placeholder="DRAFT"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="text-xs font-semibold text-slate-700">Review</div>
            <ReviewRow k="Name" v={name} />
            <ReviewRow k="Execution role" v={roleArn} mono />
            <ReviewRow k="Model" v={modelId || 'Default (Claude Haiku 4.5)'} mono />
            <ReviewRow k="System prompt" v={systemPrompt || '—'} />
            <ReviewRow k="Tools" v={tools.length ? tools.map((t) => t.name).join(', ') : 'none'} />
            <ReviewRow k="Memory" v={memoryOn ? 'Managed (SEMANTIC + SUMMARIZATION, 30d)' : 'Disabled'} />
            <ReviewRow k="Guardrail" v={guardrailId ? `${guardrailId} @ ${guardrailVersion}` : 'none'} mono />

            {err && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {err}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
          <button
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
            disabled={step === 1}
            className="text-sm text-slate-500 disabled:opacity-40 hover:text-slate-800"
          >
            ← Back
          </button>

          {step < 3 && (
            <button
              onClick={() => setStep((s) => ((s + 1) as 1 | 2 | 3))}
              disabled={step === 1 ? !canNext1 : !canNext2}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2 rounded-lg"
            >
              Continue →
            </button>
          )}

          {step === 3 && (
            <button
              onClick={submit}
              disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2 rounded-lg"
            >
              {submitting
                ? isEdit ? 'Saving…' : 'Creating…'
                : isEdit ? 'Save new version' : 'Create harness'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = ['Basics', 'Capabilities', 'Review'];
  return (
    <div className="flex items-center gap-2">
      {items.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                active ? 'bg-indigo-600 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {done ? '✓' : n}
            </div>
            <span className={`text-xs ${active ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>{label}</span>
            {i < 2 && <div className="w-8 h-px bg-slate-200" />}
          </div>
        );
      })}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 py-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-indigo-600"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-800 group-hover:text-slate-900">{label}</div>
        <div className="text-[11px] text-slate-500">{hint}</div>
      </div>
    </label>
  );
}

function ReviewRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-3 text-sm border-b border-slate-100 py-2">
      <div className="text-slate-500 col-span-1">{k}</div>
      <div className={`text-slate-800 col-span-3 break-all ${mono ? 'font-mono text-xs' : ''}`}>{v || '—'}</div>
    </div>
  );
}
