import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        source: '/((?!api/catalog/v1/).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Content-Security-Policy',
            value:
              "connect-src 'self'; frame-ancestors 'none'; form-action 'none'; object-src 'none'; base-uri 'self'",
          },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/:path((?!api/catalog/v1(?:/|$)).+)/',
        destination: '/:path',
        permanent: true,
      },
    ];
  },
};
export default config;
