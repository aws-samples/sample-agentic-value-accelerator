import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep the AWS SDK as a real Node dependency in server code rather than letting
  // Next bundle it (renamed from experimental.serverComponentsExternalPackages in
  // Next 15+).
  serverExternalPackages: ["@aws-sdk/client-bedrock-agentcore"],
  // This app is a nested package inside the AVA monorepo; pin the workspace root so
  // Turbopack doesn't infer it from sibling lockfiles.
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
