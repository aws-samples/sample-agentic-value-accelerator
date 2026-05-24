import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function getOAuthToken(): Promise<string> {
  const tokenEndpoint = process.env.DEADLINE_TOKEN_ENDPOINT!;
  const clientId = process.env.DEADLINE_CLIENT_ID!;
  const clientSecret = process.env.DEADLINE_CLIENT_SECRET!;
  const scope = process.env.DEADLINE_SCOPE!;

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get OAuth token');
  return data.access_token;
}

export async function POST() {
  try {
    const token = await getOAuthToken();
    const endpoint = process.env.DEADLINE_AGENT_ENDPOINT!;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Run the daily compliance deadline check. Identify all at-risk filings and provide escalation recommendations.' }),
    });

    if (!res.ok) throw new Error(`Agent returned ${res.status}: ${await res.text()}`);
    const data = await res.json();

    // Extract structured JSON from agent response
    const text = data?.message?.content?.[0]?.text || data?.message || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: 'Could not parse agent response' }, { status: 500 });

    return NextResponse.json(JSON.parse(jsonMatch[0]));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
