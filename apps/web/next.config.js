/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enable React Compiler when available
    reactCompiler: false,
  },
  images: {
    domains: ['localhost', 'supabase.co'],
    formats: ['image/webp', 'image/avif'],
  },
  // Transpile packages from workspace
  transpilePackages: ['@procomp/ui', '@procomp/utils'],
  // Enable source maps in production for better debugging
  productionBrowserSourceMaps: true,
  // Optimize bundle size
  swcMinify: true,
  // Enable compression
  compress: true,
  // Strict mode for better React practices
  reactStrictMode: true,
  // Environment variables
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  // Headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },
  // Redirects for better SEO
  async redirects() {
    return [
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig; 