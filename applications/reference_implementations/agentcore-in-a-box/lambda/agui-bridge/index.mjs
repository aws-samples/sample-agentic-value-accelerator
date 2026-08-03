/**
 * AG-UI bridge — streaming relay between the CopilotKit/@ag-ui/client frontend and
 * the AgentCore Runtime.
 *
 * The browser cannot call InvokeAgentRuntime directly (it's an AWS data-plane
 * endpoint, not a CORS-able AG-UI POST target). This Lambda is exposed via a
 * Function URL in RESPONSE_STREAM mode: it accepts an AG-UI `RunAgentInput` POST,
 * invokes the runtime over HTTPS with the caller's Cognito bearer JWT and
 * `Accept: text/event-stream`, and pipes the runtime's SSE bytes straight back to
 * the browser. The agent already emits AG-UI events, so this is a near-passthrough
 * relay — it adds no AG-UI knowledge, only transport + auth + CORS.
 *
 * Auth model mirrors lambda/websocket/index.py: the runtime's customJWTAuthorizer
 * validates the bearer token on every invoke (the real security boundary); we also
 * pass the token in-band as `user_token` because the runtime consumes the header
 * for its own auth and does not forward it to the container (needed for the 3LO stash).
 *
 * Node 20 runtime, zero npm dependencies (built-in https + crypto).
 */
import https from 'node:https';
import { randomUUID } from 'node:crypto';

const REGION = process.env.REGION || process.env.AWS_REGION || 'us-west-2';
const AGENT_RUNTIME_ARN = process.env.AGENT_RUNTIME_ARN || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const DATAPLANE_HOST = `bedrock-agentcore.${REGION}.amazonaws.com`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-amzn-bedrock-agentcore-runtime-session-id',
  'Access-Control-Max-Age': '86400',
};

// AgentCore runtime session ids must be >= 33 chars.
function sessionIdFrom(input) {
  const tid = input?.threadId || input?.thread_id || '';
  if (tid && tid.length >= 33) return tid;
  return (randomUUID() + randomUUID()).replace(/-/g, '');
}

// Pull the latest user message text out of the AG-UI RunAgentInput.messages array.
function latestUserMessage(input) {
  const msgs = Array.isArray(input?.messages) ? input.messages : [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m && m.role === 'user') {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('');
      }
    }
  }
  return '';
}

function bearerFrom(event) {
  const h = event?.headers || {};
  // The browser SigV4-signs the request, so the Authorization header carries the AWS
  // signature — the Cognito JWT (the real app identity the runtime validates) rides in
  // x-meridian-cognito-token instead. Fall back to Authorization for the legacy
  // (non-SigV4) path so either transport works.
  const custom = h['x-meridian-cognito-token'] || h['X-Meridian-Cognito-Token'] || '';
  const raw = custom || h.authorization || h.Authorization || '';
  return raw.toLowerCase().startsWith('bearer ') ? raw.slice(7) : raw;
}

export const handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
  const method =
    event?.requestContext?.http?.method || event?.httpMethod || 'POST';

  // CORS preflight.
  if (method === 'OPTIONS') {
    responseStream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 204,
      headers: CORS_HEADERS,
    });
    responseStream.end();
    return;
  }

  const sse = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });

  const writeErr = (message) => {
    // Emit a well-formed AG-UI RUN_ERROR so the client unwinds cleanly.
    sse.write(`data: ${JSON.stringify({ type: 'RUN_ERROR', message })}\n\n`);
    sse.end();
  };

  try {
    const token = bearerFrom(event);
    if (!token) return writeErr('Missing bearer token');
    if (!AGENT_RUNTIME_ARN) return writeErr('AGENT_RUNTIME_ARN not configured');

    let body = event.body || '{}';
    if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
    let input;
    try {
      input = JSON.parse(body);
    } catch {
      return writeErr('Invalid JSON body (expected AG-UI RunAgentInput)');
    }

    const sessionId = sessionIdFrom(input);
    const fwd = input?.forwardedProps || {};
    // Map RunAgentInput → the agent's payload contract (same shape the WS Lambda uses).
    const payload = JSON.stringify({
      message: latestUserMessage(input),
      user_token: token,
      model_id: fwd.model_id || fwd.modelId || '',
      force_reauth: Boolean(fwd.force_reauth || fwd.forceReauth),
      thread_id: input?.threadId || input?.thread_id || sessionId,
      run_id: input?.runId || input?.run_id || '',
    });

    const escapedArn = encodeURIComponent(AGENT_RUNTIME_ARN);
    const path = `/runtimes/${escapedArn}/invocations?qualifier=DEFAULT`;

    await new Promise((resolve) => {
      const req = https.request(
        {
          host: DATAPLANE_HOST,
          path,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            let errBody = '';
            res.on('data', (c) => (errBody += c));
            res.on('end', () => {
              writeErr(`Runtime returned ${res.statusCode}: ${errBody.slice(0, 500)}`);
              resolve();
            });
            return;
          }
          // Relay SSE bytes straight through — the agent already emits AG-UI events.
          res.on('data', (chunk) => sse.write(chunk));
          res.on('end', () => {
            sse.end();
            resolve();
          });
        },
      );
      req.on('error', (e) => {
        writeErr(`Runtime invoke failed: ${e.message}`);
        resolve();
      });
      req.write(payload);
      req.end();
    });
  } catch (e) {
    writeErr(`Bridge error: ${e?.message || String(e)}`);
  }
});
