/**
 * Server-side AgentCore invocation helper (backend-for-frontend).
 *
 * The browser cannot call the AgentCore runtime directly - it requires SigV4 (or a
 * Cognito JWT authorizer, which our runtime does not have). So Next.js API routes
 * call this helper, which signs the request with the server's AWS credentials
 * (standard provider chain: env vars, shared profile, or task/instance role).
 *
 * This module must only be imported from server code (route handlers).
 */
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";

const RUNTIME_ARN = process.env.AGENTCORE_RUNTIME_ARN ?? "";

// Derive the region from the runtime ARN itself (arn:aws:bedrock-agentcore:REGION:...)
// rather than AWS_REGION - the ambient shell AWS_REGION may point elsewhere and
// Next.js does not override already-exported env vars from .env files.
function regionFromArn(arn: string): string {
  const parts = arn.split(":");
  return parts.length > 3 && parts[3] ? parts[3] : (process.env.AGENTCORE_REGION ?? "us-east-1");
}
const REGION = regionFromArn(RUNTIME_ARN);

let _client: BedrockAgentCoreClient | null = null;
function client(): BedrockAgentCoreClient {
  if (!_client) _client = new BedrockAgentCoreClient({ region: REGION });
  return _client;
}

export interface AgentInvokeResult {
  /** Parsed JSON payload returned by the agent entrypoint. */
  data: unknown;
  /** AgentCore session id, useful for conversation threading. */
  sessionId?: string;
}

/**
 * Invoke the payments-fraud AgentCore runtime with a JSON payload matching the
 * entrypoint contract in src/strands/main.py (e.g. {action, account_id, prompt, ...}).
 */
export async function invokeAgent(
  payload: Record<string, unknown>,
  runtimeSessionId?: string,
): Promise<AgentInvokeResult> {
  if (!RUNTIME_ARN) {
    throw new Error("AGENTCORE_RUNTIME_ARN is not configured");
  }

  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: RUNTIME_ARN,
    contentType: "application/json",
    accept: "application/json",
    runtimeSessionId,
    payload: new TextEncoder().encode(JSON.stringify(payload)),
  });

  let response;
  try {
    response = await client().send(command);
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string; $metadata?: unknown; $fault?: unknown };
    console.error("[agentcore] invoke error:", {
      name: e.name,
      message: e.message,
      fault: e.$fault,
      metadata: e.$metadata,
      runtimeArn: RUNTIME_ARN,
    });
    throw err;
  }

  // response.response is a stream/byte array depending on runtime; normalize to text.
  const text = await streamToString(response.response);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return { data, sessionId: response.runtimeSessionId };
}

async function streamToString(body: unknown): Promise<string> {
  if (!body) return "";
  // Uint8Array / Buffer
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  // Web ReadableStream
  if (typeof (body as ReadableStream).getReader === "function") {
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return new TextDecoder().decode(concat(chunks));
  }
  // Node Readable (async iterable)
  if (typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === "function") {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
    }
    return new TextDecoder().decode(concat(chunks));
  }
  if (typeof body === "string") return body;
  return String(body);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
