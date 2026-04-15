import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',  // Enable standalone output for Docker deployment
  images: {
    unoptimized: false,  // Enable image optimization in Docker
  },
  // Allow runtime environment variables
  env: {
    NEXT_PUBLIC_AWS_REGION: process.env.NEXT_PUBLIC_AWS_REGION,
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
    NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID,
    NEXT_PUBLIC_API_ENDPOINT: process.env.NEXT_PUBLIC_API_ENDPOINT,
    AGENTCORE_ENDPOINT: process.env.AGENTCORE_ENDPOINT,
    RISK_AGENTCORE_ENDPOINT: process.env.RISK_AGENTCORE_ENDPOINT,
  },
};

export default nextConfig;
