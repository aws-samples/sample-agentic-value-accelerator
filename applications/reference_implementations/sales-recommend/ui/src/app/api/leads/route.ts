import { listLeads, leadsEnabled } from "@/lib/leadsStore";

/**
 * GET /api/leads
 *
 * Returns captured visitor emails for the in-app "Visitors" view, most
 * recently seen first. Access control is inherited from the app's edge auth
 * (CloudFront Basic Auth / AVA SSO) — reaching this route already required a
 * valid session, so no additional gate is added here.
 *
 * Response: { enabled: boolean, count: number, leads: Lead[] }
 * When no table is configured (local dev), returns enabled:false + empty list.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = leadsEnabled();
  const leads = await listLeads();
  return new Response(
    JSON.stringify({ enabled, count: leads.length, leads }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
