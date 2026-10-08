/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pith/ui', '@pith/sdk'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.API_URL || 'http://127.0.0.1:8000'}/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
