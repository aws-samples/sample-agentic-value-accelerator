/**
 * Browser-side client for the /api/chat proxy.
 *
 * Usage:
 *   for await (const chunk of streamAgentReply({ message, sessionId, signal })) {
 *     setMessage(prev => prev + chunk);
 *   }
 *
 * The async iterator yields plain text chunks ready to be appended to the
 * assistant message. SSE framing and JSON-payload extraction are handled
 * here so the rest of the UI stays simple.
 */

import { dbg } from "./debug";

export interface StreamAgentReplyArgs {
  message: string;
  sessionId: string;
  signal?: AbortSignal;
}

/** Generate an AgentCore-compatible session ID (33–256 chars). */
export function newSessionId(): string {
  // crypto.randomUUID() returns 36 chars. Prefix to make intent clear and
  // comfortably exceed the 33-char minimum.
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `meridian-${uuid}`;
}

/**
 * Try to extract a human-readable text fragment from a single SSE `data:` line.
 *
 * Different agent frameworks emit different shapes (Strands yields
 * `{"data": "..."}` for content tokens; some yield plain strings; some emit
 * tool-use events we want to skip). This helper is intentionally generous.
 */
function extractText(raw: string): string {
  if (!raw) return "";
  // Try JSON first.
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object") {
      const candidates: unknown[] = [
        (parsed as Record<string, unknown>).data,
        (parsed as Record<string, unknown>).text,
        (parsed as Record<string, unknown>).output,
        (parsed as Record<string, unknown>).chunk,
        // Strands sometimes nests deltas: { "delta": { "text": "..." } }
        (parsed as { delta?: { text?: unknown } }).delta?.text,
      ];
      for (const c of candidates) {
        if (typeof c === "string") return c;
      }
      // No recognised text key — skip silently. Tool-use events, status
      // events, etc. fall here.
      return "";
    }
  } catch {
    // Not JSON — treat the line as raw text.
    return raw;
  }
  return "";
}

export async function* streamAgentReply({
  message,
  sessionId,
  signal,
}: StreamAgentReplyArgs): AsyncGenerator<string, void, unknown> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, sessionId }),
    signal,
  });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody?.error) detail = errBody.error;
    } catch {
      // ignore — keep the status text fallback
    }
    throw new Error(detail);
  }

  if (!res.body) {
    throw new Error("Empty response body from /api/chat.");
  }

  const contentType = res.headers.get("content-type") ?? "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");

  // Track everything we yield so we can log the final assembled string.
  let chunkCount = 0;
  let totalText = "";
  const yieldChunk = (text: string) => {
    chunkCount += 1;
    totalText += text;
    dbg.log(`stream chunk #${chunkCount}`, text);
    return text;
  };

  dbg.log("stream begin", { contentType, sessionId });

  // ---- Non-streaming path: collect the whole body, emit once. -----------
  if (!contentType.includes("event-stream")) {
    let full = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      full += decoder.decode(value, { stream: true });
    }
    full += decoder.decode();
    const text = extractText(full) || full;
    if (text) yield yieldChunk(text);
    dbg.text("stream complete (non-stream)", totalText);
    return;
  }

  // ---- SSE path: parse `data: ...\n\n` events incrementally. ------------
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line. \r\n is sometimes used.
    let separatorIndex: number;
    while (
      (separatorIndex = findEventBoundary(buffer)) !== -1
    ) {
      const rawEvent = buffer.slice(0, separatorIndex);
      // Skip past the boundary (\n\n or \r\n\r\n).
      buffer = buffer.slice(separatorIndex).replace(/^(\r?\n){2}/, "");

      const text = parseSseEvent(rawEvent);
      if (text) yield yieldChunk(text);
    }
  }

  // Flush any trailing event without a terminating blank line.
  buffer += decoder.decode();
  if (buffer.trim()) {
    const text = parseSseEvent(buffer);
    if (text) yield yieldChunk(text);
  }

  dbg.text(`stream complete (${chunkCount} chunks)`, totalText);
}

function findEventBoundary(buf: string): number {
  const a = buf.indexOf("\n\n");
  const b = buf.indexOf("\r\n\r\n");
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

function parseSseEvent(eventBlock: string): string {
  // An SSE event may have multiple `data:` lines that should be concatenated
  // with newlines per the spec. Other fields (event:, id:, retry:) are ignored.
  const lines = eventBlock.split(/\r?\n/);
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0) return "";
  const raw = dataLines.join("\n");
  // The `[DONE]` sentinel is sometimes emitted by frameworks copying OpenAI.
  if (raw === "[DONE]") return "";
  return extractText(raw);
}
