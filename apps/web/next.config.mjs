const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // lets a production build run beside a live dev server without sharing its output directory
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  transpilePackages: ['@enigma/core', '@enigma/provenance', '@enigma/shared'],
  // Client components and export links call /api/*, which is forwarded to the Fastify API.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
