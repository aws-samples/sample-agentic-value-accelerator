import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function getOAuthToken(): Promise<string> {
  const tokenEndpoint = process.env.REVIEWER_TOKEN_ENDPOINT!;
  const clientId = process.env.REVIEWER_CLIENT_ID!;
  const clientSecret = process.env.REVIEWER_CLIENT_SECRET!;
  const scope = process.env.REVIEWER_SCOPE!;

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get OAuth token');
  return data.access_token;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // Upload to S3
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    const bucket = process.env.REVIEWER_S3_BUCKET!;
    const key = `reviews/${Date.now()}-${file.name}`;
    const body = Buffer.from(await file.arrayBuffer());

    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));

    // Invoke agent
    const token = await getOAuthToken();
    const endpoint = process.env.REVIEWER_AGENT_ENDPOINT!;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `A regulatory report was uploaded for review. Read the file from bucket ${bucket} with key ${key} using the read_s3_file tool, then perform a full compliance review.` }),
    });

    if (!res.ok) throw new Error(`Agent returned ${res.status}: ${await res.text()}`);
    const data = await res.json();

    const text = data?.message?.content?.[0]?.text || data?.message || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: 'Could not parse agent response' }, { status: 500 });

    return NextResponse.json(JSON.parse(jsonMatch[0]));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
