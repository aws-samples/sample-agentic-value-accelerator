import { NextRequest } from "next/server";
import { recordLead } from "@/lib/leadsStore";

/**
 * POST /api/lead
 *
 * Captures a self-reported visitor email from the email-capture modal. There
 * is no per-user datastore in this demo, so we simply log a structured line
 * server-side — on ECS Fargate this lands in the container's CloudWatch log
 * group, where it can be queried or shipped downstream later.
 *
 * Request body: { email: string }
 * Response:     { ok: true } on success.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LeadBody {
  email?: unknown;
}

// Kept in sync with lib/userIdentity.isValidEmail (server can't import a
// "use client"-adjacent module cleanly, and this must stay dependency-free).
function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (email.length < 3 || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  let body: LeadBody;
  try {
    body = (await req.json()) as LeadBody;
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!isValidEmail(email)) {
    return json({ error: "A valid `email` is required." }, 400);
  }

  // Structured, greppable log line for CloudWatch Logs Insights.
  console.log(
    JSON.stringify({
      event: "lead.email_captured",
      email,
      ts: new Date().toISOString(),
      ua: req.headers.get("user-agent") ?? undefined,
    })
  );

  // Persist to DynamoDB when a table is configured. Best-effort: a storage
  // failure must not break the visitor's experience (they already saved the
  // email client-side), so we don't surface it as an error.
  const persisted = await recordLead(email, {
    source: "email-capture-modal",
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return json({ ok: true, persisted }, 200);
}
