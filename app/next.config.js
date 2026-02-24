/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    return [
      {
        source: '/api/rpc/:path*',
        destination: process.env.NEXT_PUBLIC_SOLANA_RPC_URL + '/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
