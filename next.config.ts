import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.mypinata.cloud',
      },
      {
        protocol: 'https',
        hostname: 'gateway.pinata.cloud',
      },
      {
        protocol: 'https',
        hostname: '**.ipfs.dweb.link',
      },
    ],
  },
  transpilePackages: ['@bitauth/libauth', '@bch-wc2/web3modal-connector'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    // Support top-level await for libauth WASM
    config.experiments = {
      ...config.experiments,
      topLevelAwait: true,
      layers: true, // Enable layers for better WebAssembly support
    };

    // Add externals to ignore specific modules
    if (!config.externals) {
      config.externals = [];
    } else if (!Array.isArray(config.externals)) {
      // If externals is not an array, convert it to an array
      config.externals = [config.externals];
    }
    config.externals.push('pino-pretty', 'lokijs', 'encoding', 'bufferutil', 'utf-8-validate');

    return config;
  },
};

export default nextConfig;
