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

    // Handle specific modules differently for Server vs Client
    if (isServer) {
      // On Server, mark these as external so they are not bundled (fixes native module issues)
      if (!config.externals) {
        config.externals = [];
      } else if (!Array.isArray(config.externals)) {
        config.externals = [config.externals];
      }
      config.externals.push('pino-pretty', 'lokijs', 'encoding', 'bufferutil', 'utf-8-validate');
    } else {
      // On Client, alias them to mocks or throwers
      config.resolve.alias = {
        ...config.resolve.alias,
        'bufferutil': path.join(__dirname, 'src/utils/throw-error.js'),
        'utf-8-validate': path.join(__dirname, 'src/utils/throw-error.js'),
        'pino-pretty': false,
        'lokijs': false,
        'encoding': false,
      };
    }

    return config;
  },
};

export default nextConfig;
