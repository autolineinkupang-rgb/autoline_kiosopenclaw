/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Cegah clickjacking
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Cegah MIME sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Paksa HTTPS (aktif di Vercel)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Batasi referrer
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nonaktifkan fitur browser yang tidak dipakai
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Content Security Policy — cegah XSS
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",  // unsafe-inline diperlukan Next.js + Recharts
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig = {
  output: 'standalone',
  compress: true,
  poweredByHeader: false, // Sembunyikan "X-Powered-By: Next.js"

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
