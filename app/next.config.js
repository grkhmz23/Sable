/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'http://127.0.0.1:8899';
    // Only add rewrite if URL is valid
    if (rpcUrl && rpcUrl.startsWith('http')) {
      return [
        {
          source: '/api/rpc/:path*',
          destination: `${rpcUrl}/:path*`,
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
