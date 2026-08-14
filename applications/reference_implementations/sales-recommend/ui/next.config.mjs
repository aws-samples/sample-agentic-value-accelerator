/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output enables Docker-optimized builds (copies only what's
  // needed for production into .next/standalone). Required for ECS Fargate.
  output: "standalone",
};

export default nextConfig;
