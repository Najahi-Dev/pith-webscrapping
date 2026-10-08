/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pith/ui', '@pith/sdk'],
  async rewrites() {
    const rawApiUrl = process.env.API_URL || 'http://127.0.0.1:8000';
    const normalizedApiUrl = rawApiUrl.replace(/\/+$/, '');
    return [
      {
        source: '/api/v1/:path*',
        destination: `${normalizedApiUrl}/v1/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${normalizedApiUrl}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

