import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { harnessApi, generateSessionId, harnessAuthHeaders } from './api';

type Tab = 'overview' | 'test' | 'versions' | 'configure';

interface Props {
  initialTab?: Tab;
}

export default function HarnessDetail({ initialTab = 'overview' }: Props) {
  const { harnessId = '' } = useParams();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [h, setH] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const reload = () => {
    if (!harnessId) return;
    setLoading(true);
    harnessApi
      .get(harnessId)
      .then(setH)
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harnessId]);

  const status = (h?.status as string) || '';
  // GetHarness returns `arn` (not `harnessArn`) — accept either.
  const arn = (h?.arn as string) || (h?.harnessArn as string) || '';

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-6 py-8">
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <Link to="/harness" className="hover:text-slate-700">Harness</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium truncate">{(h?.harnessName as string) || harnessId}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 truncate">
            {(h?.harnessName as string) || harnessId}
          </h1>
          <div className="text-[11px] text-slate-500 font-mono truncate">{arn}</div>
        </div>
        {status && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider bg-slate-100 text-slate-700">
            {status}
          </span>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {(['overview', 'test', 'versions', 'configure'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

      {!loading && !err && h && (
        <>
          {tab === 'overview' && <OverviewTab h={h} onSaved={reload} />}
          {tab === 'test' && <TestTab harnessArn={arn} />}
          {tab === 'versions' && <VersionsTab harnessId={harnessId} />}
          {tab === 'configure' && <ConfigureTab h={h} />}
        </>
      )}
    </div>
  );
}

function OverviewTab({ h, onSaved }: { h: Record<string, unknown>; onSaved: () => void }) {
  const model = h.model as Record<string, unknown> | undefined;
  const modelId =
    (model?.bedrockModelConfig as Record<string, unknown> | undefined)?.modelId ||
    (model?.openAiModelConfig as Record<string, unknown> | undefined)?.modelId ||
    (model?.liteLlmModelConfig as Record<string, unknown> | undefined)?.modelId ||
    'default';
  const tools = (h.tools as Array<Record<string, unknown>>) || [];
  const systemPromptOrig = ((h.systemPrompt as Array<{ text?: string }> | undefined)?.[0]?.text) || '';
  // Wire shape uses `harnessVersion`, `createdAt`, `updatedAt`. Response is
  // unwrapped from { harness: { ... } } server-side so these are top-level.
  const version = String(h.harnessVersion || h.version || '1');
  const createdAt = String(h.createdAt || '');
  const updatedAt = String(h.updatedAt || '');
  const harnessId = String(h.harnessId || '');

  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(systemPromptOrig);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setPrompt(systemPromptOrig);
    setErr('');
  }, [systemPromptOrig]);

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      const path = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/v1/harness/${harnessId}`;
      const resp = await fetch(path, {
        method: 'PATCH',
        headers: harnessAuthHeaders(),
        body: JSON.stringify({ system_prompt: prompt }),
      });
      if (!resp.ok) throw new Error(`${resp.status} ${await resp.text()}`);
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium"
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => { setEditing(false); setPrompt(systemPromptOrig); setErr(''); }}
              className="text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || prompt === systemPromptOrig}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-3 py-1.5 rounded-lg font-medium"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Model">
          <div className="text-sm font-mono text-slate-800 break-all">{String(modelId)}</div>
        </Card>
        <Card title="Version">
          <div className="text-sm text-slate-800">v{version}</div>
        </Card>
        <div className="md:col-span-2">
          <Card title="System prompt">
            {editing ? (
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
              />
            ) : (
              <div className="text-sm text-slate-700 whitespace-pre-wrap">{systemPromptOrig || '—'}</div>
            )}
          </Card>
        </div>
        <Card title="Tools">
          <div className="flex flex-wrap gap-1.5">
            {tools.length ? (
              tools.map((t, i) => (
                <span key={i} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  {String(t.name || t.type)}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400">No custom tools (shell + file_operations available by default)</span>
            )}
          </div>
        </Card>
        <Card title="Status">
          <div className="text-sm text-slate-800">{String(h.status || '—')}</div>
        </Card>
        <Card title="Created" mono>
          {createdAt ? createdAt.replace('T', ' ').slice(0, 19) : '—'}
        </Card>
        <Card title="Updated" mono>
          {updatedAt ? updatedAt.replace('T', ' ').slice(0, 19) : '—'}
        </Card>
      </div>
    </div>
  );
}

function TestTab({ harnessArn }: { harnessArn: string }) {
  const [sessionId] = useState(() => generateSessionId());
  const [actorId, setActorId] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [streaming, setStreaming] = useState(false);
  const [current, setCurrent] = useState('');
  const [err, setErr] = useState('');

  const send = async () => {
    if (!input.trim()) return;
    if (streaming) return;
    if (!harnessArn) {
      setErr('Harness ARN not loaded yet. Wait a second and try again, or reload the page.');
      return;
    }
    const userMsg = input.trim();
    setMessages((m) => [...m, { role: 'user', text: userMsg }]);
    setInput('');
    setStreaming(true);
    setCurrent('');
    setErr('');

    try {
      const resp = await fetch(harnessApi.invokeUrl(), {
        method: 'POST',
        headers: harnessAuthHeaders(),
        body: JSON.stringify({
          harness_arn: harnessArn,
          session_id: sessionId,
          actor_id: actorId || undefined,
          message: userMsg,
        }),
      });
      if (!resp.ok || !resp.body) {
        throw new Error(`${resp.status} ${resp.statusText}`);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';

      // Extracts any text field the event payload might carry. InvokeHarness
      // varies by SDK/service version — some events use `delta.text`, some
      // use `text`, some wrap in `chunk.bytes` or `content[].text`. Walking
      // the object is more forgiving than hard-coding a single path.
      // Walks any InvokeHarness event payload and pulls out the assistant
      // text. The Bedrock ConverseStream shape can arrive as any of:
      //   {"contentBlockDelta": {"delta": {"text": "..."}}}
      //   {"chunk": {"bytes": "<json-string>"}}
      //   {"chunk": {"bytes": {"delta": {"text": "..."}}}}  (after backend decode)
      //   {"payload": "<json-string>"}                       (some SDK variants)
      //   {"content": [{"text": "..."}]}                     (messageStop shape)
      // We handle all of them by recursing and — importantly — treating any
      // string value as a POSSIBLE nested JSON blob. Previously we returned
      // '' for non-`.text` strings, which silently dropped everything for
      // events where the JSON was inside a string field.
      const extractText = (obj: unknown, depth = 0): string => {
        if (obj == null) return '';
        if (depth > 8) return ''; // guard against pathological nesting
        if (typeof obj === 'string') {
          // A string that starts with { or [ is almost certainly a nested
          // JSON payload we need to parse. Anything else is either literal
          // text (which we don't emit from here — text always sits under a
          // `text:` key) or a value like "role":"assistant" that shouldn't
          // be surfaced.
          const trimmed = obj.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
              return extractText(JSON.parse(trimmed), depth + 1);
            } catch {
              return '';
            }
          }
          return '';
        }
        if (Array.isArray(obj)) return obj.map((v) => extractText(v, depth + 1)).join('');
        if (typeof obj === 'object') {
          const rec = obj as Record<string, unknown>;
          // Highest-fidelity direct field name first.
          if (typeof rec.text === 'string') return rec.text;
          if (rec.bytes !== undefined) {
            if (typeof rec.bytes === 'string') {
              try { return extractText(JSON.parse(rec.bytes), depth + 1); }
              catch { return rec.bytes; }
            }
            return extractText(rec.bytes, depth + 1);
          }
          let out = '';
          for (const v of Object.values(rec)) out += extractText(v, depth + 1);
          return out;
        }
        return '';
      };

      const finalize = () => {
        // Snapshot `acc` into a const BEFORE calling setMessages. The
        // functional updater `(m) => [...m, { text: acc }]` is deferred by
        // React — by the time it runs, the next line has already reset
        // `acc = ''`, so the closure reads '' and pushes an empty bubble.
        // Locking the value here breaks that closure trap.
        const finalText = acc;
        acc = '';
        setCurrent('');
        if (finalText) {
          setMessages((m) => [...m, { role: 'assistant', text: finalText }]);
        }
      };

      // SSE frame parser: split on blank lines, then extract event: + data: lines.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) { finalize(); break; }
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        for (const frame of frames) {
          const evtLine = frame.split('\n').find((l) => l.startsWith('event: '));
          const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          const evt = evtLine ? evtLine.slice(7).trim() : 'message';
          let data: unknown;
          try { data = JSON.parse(dataLine.slice(6)); } catch { continue; }

          if (evt === 'error' || evt === 'runtimeClientError') {
            const msg = (data as { message?: string })?.message || JSON.stringify(data);
            throw new Error(msg);
          }
          if (evt === 'messageStop' || evt === 'done') {
            finalize();
            continue;
          }
          // Every other event: try to pull text out of it.
          const chunk = extractText(data);
          if (chunk) {
            acc += chunk;
            setCurrent(acc);
          }
        }
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm min-h-[420px] flex flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto max-h-[520px] pr-1">
          {messages.length === 0 && !streaming && (
            <div className="text-xs text-slate-400 text-center py-12">Send a message to invoke the harness.</div>
          )}
          {messages.map((m, i) => (
            <MsgBubble key={i} role={m.role} text={m.text} />
          ))}
          {/* Show the in-flight streaming bubble ONLY while `current` has
              text — otherwise a stale empty bubble lingers after finalize()
              clears `current`, before setStreaming(false) runs. */}
          {streaming && current && <MsgBubble role="assistant" text={current + '▍'} />}
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask something…"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
            disabled={streaming}
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            Send
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <Card title="Session">
          <div className="text-[11px] font-mono text-slate-700 break-all">{sessionId}</div>
          <div className="text-[10px] text-slate-400 mt-1">Reused across turns to preserve conversation.</div>
        </Card>
        <Card title="Actor ID (optional)">
          <input
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            placeholder="user-123"
            className="w-full border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
          />
          <div className="text-[10px] text-slate-400 mt-1">Scopes long-term memory to a user.</div>
        </Card>
      </div>
    </div>
  );
}

function VersionsTab({ harnessId }: { harnessId: string }) {
  const [versions, setVersions] = useState<Array<Record<string, unknown>>>([]);
  const [endpoints, setEndpoints] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string>('');

  const reload = async () => {
    setLoading(true);
    try {
      const [v, e] = await Promise.all([harnessApi.versions(harnessId), harnessApi.endpoints(harnessId)]);
      setVersions((v.versions as Array<Record<string, unknown>>) || []);
      setEndpoints((e.endpoints as Array<Record<string, unknown>>) || []);
    } catch (x) {
      setErr(String(x));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harnessId]);

  const defaultEndpoint = useMemo(
    () => endpoints.find((e) => (e.endpointName || e.name) === 'DEFAULT'),
    [endpoints],
  );

  const promote = async (targetVersion: string) => {
    setBusy(targetVersion);
    setErr('');
    try {
      await harnessApi.updateEndpoint(harnessId, 'DEFAULT', targetVersion);
      await reload();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy('');
    }
  };

  if (loading) return <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>;

  return (
    <div className="space-y-6">
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

      <Card title="Endpoints">
        {endpoints.length === 0 ? (
          <div className="text-xs text-slate-400">No endpoints — DEFAULT tracks the latest version automatically.</div>
        ) : (
          <div className="space-y-2">
            {endpoints.map((e, i) => (
              <div key={i} className="flex items-center justify-between border-b border-slate-100 py-2">
                <div className="text-sm text-slate-800 font-medium">{String(e.endpointName || e.name)}</div>
                <div className="text-xs text-slate-500 font-mono">v{String(e.targetVersion || '?')}</div>
                <div className="text-[10px] text-slate-400 uppercase">{String(e.status || '')}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Versions">
        {versions.length === 0 ? (
          <div className="text-xs text-slate-400">No versions found.</div>
        ) : (
          <div className="space-y-1.5">
            {versions.map((v, i) => {
              const ver = String(v.version || v.harnessVersion || '?');
              const isDefault = defaultEndpoint && String(defaultEndpoint.targetVersion) === ver;
              return (
                <div key={i} className="flex items-center justify-between border-b border-slate-100 py-2">
                  <div className="text-sm font-mono text-slate-800">v{ver}</div>
                  <div className="text-[10px] text-slate-400">{String(v.createdAt || '').slice(0, 19).replace('T', ' ')}</div>
                  {isDefault ? (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full uppercase">
                      DEFAULT
                    </span>
                  ) : (
                    <button
                      onClick={() => promote(ver)}
                      disabled={busy === ver}
                      className="text-xs text-indigo-700 hover:underline disabled:opacity-50"
                    >
                      {busy === ver ? 'Promoting…' : 'Promote to DEFAULT'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function ConfigureTab({ h }: { h: Record<string, unknown> }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm">
      <div className="text-xs font-semibold text-slate-700 mb-2">Raw configuration</div>
      <div className="text-[11px] text-slate-500 mb-3">
        v1 shows the harness config read-only. Inline editing lands in v2 — for now, update via CLI (<code>agentcore update</code>) or call the backend PATCH directly.
      </div>
      <pre className="text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-[520px]">
        {JSON.stringify(h, null, 2)}
      </pre>
    </div>
  );
}

// ─── shared UI atoms ────────────────────────────────────────────────────────

function Card({ title, children, mono }: { title: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">{title}</div>
      <div className={mono ? 'font-mono text-xs text-slate-700' : ''}>{children}</div>
    </div>
  );
}

function MsgBubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
        }`}
      >
        {text}
      </div>
    </div>
  );
}
