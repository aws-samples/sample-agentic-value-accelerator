import { NextRequest } from "next/server";
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";

/**
 * POST /api/chat
 *
 * Server-side proxy that forwards a chat message to a Bedrock AgentCore
 * Runtime and streams the response back to the browser. AWS credentials
 * stay on the Next.js server — they are never inlined into the client
 * bundle and never sent over the wire.
 *
 * Request body:
 *   {
 *     message:   string  // user prompt
 *     sessionId: string  // 33–256 chars; reuse to keep multi-turn context
 *   }
 *
 * Response:
 *   Content-Type: text/event-stream  (or whatever the agent returns)
 *   Body: passthrough of the AgentCore response stream.
 */

// AWS SDK requires Node APIs — opt out of Edge runtime.
export const runtime = "nodejs";
// Streaming responses can't be cached or pre-rendered.
export const dynamic = "force-dynamic";

interface ChatRequestBody {
  message?: unknown;
  sessionId?: unknown;
}

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

function serverError(message: string, detail?: unknown) {
  // Don't leak internals in the response, but log them server-side.
  console.error("[/api/chat]", message, detail);
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  // ---- Validate env ------------------------------------------------------
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  const agentRuntimeArn = process.env.AGENT_RUNTIME_ARN;
  const qualifier = process.env.AGENT_RUNTIME_QUALIFIER ?? "DEFAULT";

  // When running on ECS with a task role, explicit keys aren't needed —
  // the SDK auto-discovers credentials from the container metadata service.
  if (!region) {
    return serverError(
      "AWS_REGION is not configured. Set it in .env.local or ECS task definition."
    );
  }
  if (!agentRuntimeArn) {
    return serverError(
      "AGENT_RUNTIME_ARN is not configured. Set it in .env.local."
    );
  }

  // ---- Validate body -----------------------------------------------------
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId : undefined;

  if (!message) {
    return badRequest("`message` is required.");
  }
  if (!sessionId || sessionId.length < 33 || sessionId.length > 256) {
    return badRequest("`sessionId` must be 33–256 characters long.");
  }

  // ---- Invoke AgentCore -------------------------------------------------
  // When explicit keys are provided (local dev), use them.
  // Otherwise let the SDK discover credentials from the environment
  // (ECS task role, instance profile, etc.)
  const clientConfig: Record<string, unknown> = { region };
  if (accessKeyId && secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    };
  }
  const client = new BedrockAgentCoreClient(clientConfig);

  // AgentCore expects a JSON byte payload; the agent's @app.entrypoint
  // receives this dict (e.g. payload["prompt"]).
  const payload = new TextEncoder().encode(JSON.stringify({ prompt: message }));

  let result;
  try {
    result = await client.send(
      new InvokeAgentRuntimeCommand({
        agentRuntimeArn,
        qualifier,
        runtimeSessionId: sessionId,
        contentType: "application/json",
        // Ask AgentCore to stream events as SSE when the agent supports it.
        accept: "text/event-stream",
        payload,
      })
    );
  } catch (err) {
    return serverError("Failed to invoke AgentCore runtime.", err);
  }

  const sdkStream = result.response;
  if (!sdkStream) {
    return serverError("AgentCore returned an empty response body.");
  }

  // The SDK gives us a Node.js Readable. Wrap it into a Web ReadableStream
  // so we can return it from a Next.js Response.
  const webStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Node Readable is async-iterable in Node 18+.
        for await (const chunk of sdkStream as AsyncIterable<Uint8Array>) {
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      // Best-effort cleanup if the client disconnects.
      const maybeDestroyable = sdkStream as { destroy?: () => void };
      maybeDestroyable.destroy?.();
    },
  });

  return new Response(webStream, {
    headers: {
      "content-type": result.contentType ?? "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
