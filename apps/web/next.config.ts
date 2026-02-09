import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@vibepilot/protocol'],
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
