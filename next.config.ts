import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    root: process.cwd(),
  },
  // Next 16 writes AGENTS.md/CLAUDE.md on `next dev` unless this is off.
  agentRules: false,
  async rewrites() {
    const routes: { source: string; destination: string }[] = [];
    // Local development only: /api is served by a backend dev server when one exists.
    if (process.env.NODE_ENV === 'development' && process.env.API_PROXY_TARGET) {
      routes.push({ source: '/api/:path*', destination: `${process.env.API_PROXY_TARGET}/api/:path*` });
    }
    return routes;
  },
  images: {
    localPatterns: [
      {
        pathname: '/logos/**',
      },
    ],
  },
};

export default nextConfig;
