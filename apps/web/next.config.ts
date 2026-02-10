import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: false, // xterm.js is incompatible with Strict Mode double-mounting
  transpilePackages: ['@vibepilot/protocol'],
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
