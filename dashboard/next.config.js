/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  // Optimasi untuk hosting gratis Vercel
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
};

module.exports = nextConfig;
