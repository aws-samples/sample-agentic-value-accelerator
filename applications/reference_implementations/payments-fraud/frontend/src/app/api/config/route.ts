import { NextResponse } from "next/server";

/**
 * Runtime config for the browser (Cognito IDs for Amplify). Served at runtime so the
 * same build can be repointed without rebuild. The AgentCore ARN is intentionally
 * NOT exposed here - it stays server-side in the BFF (/api/agent).
 */
export async function GET() {
  return NextResponse.json({
    awsRegion: process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1",
    cognitoUserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "",
    cognitoClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "",
  });
}
