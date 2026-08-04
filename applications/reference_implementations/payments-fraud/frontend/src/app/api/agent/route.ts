/**
 * BFF proxy: browser -> this route -> AgentCore runtime (SigV4, server-side creds).
 *
 * Accepts the same payload shape the agent entrypoint expects
 * ({action, account_id, prompt, transaction, case_id, ...}) and returns the agent's
 * JSON result. Keeps AWS credentials and the runtime ARN entirely server-side.
 */
import { NextRequest, NextResponse } from "next/server";

import { invokeAgent } from "@/lib/agentcore";

// AgentCore calls can take a while; allow up to the platform max for this route.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const sessionId =
    typeof body.session_id === "string" ? (body.session_id as string) : undefined;

  try {
    const { data, sessionId: runtimeSessionId } = await invokeAgent(body, sessionId);
    return NextResponse.json({ ok: true, result: data, sessionId: runtimeSessionId });
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : "";
    let message = err instanceof Error ? err.message : String(err);

    // The BFF signs AgentCore calls with the server's AWS credentials. The most
    // common local failure is expired/absent creds - give an actionable hint
    // instead of the raw SDK string.
    const isCredError =
      name === "CredentialsProviderError" ||
      /could not load credentials|security token.*expired|ExpiredToken/i.test(message);
    if (isCredError) {
      message =
        "The server has no valid AWS credentials to call AgentCore. " +
        "Refresh the AWS credentials in the environment running this app " +
        "(e.g. AWS_PROFILE, environment variables, or your role/SSO session) and try again.";
    }

    // Surface a clean error to the UI; full detail stays in server logs.
    console.error("[/api/agent] invocation failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
