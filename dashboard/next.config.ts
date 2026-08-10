import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  agentRules: false,
  allowedDevOrigins: ['100.107.41.153'],
};

export default nextConfig;
