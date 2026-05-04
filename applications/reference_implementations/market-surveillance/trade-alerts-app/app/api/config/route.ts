import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        awsRegion: process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1',
        cognitoUserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
        cognitoClientId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID || '',
        apiEndpoint: process.env.NEXT_PUBLIC_API_ENDPOINT || '',
        agentcoreEndpoint: process.env.AGENTCORE_ENDPOINT || '',
    });
}
