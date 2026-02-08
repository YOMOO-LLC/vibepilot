import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@vibepilot/protocol'],
  output: 'standalone',
};

export default nextConfig;
