import { NextResponse } from 'next/server';

const API_KEY = process.env.DASHBOARD_API_KEY;

// Rate limiter in-memory (per IP, reset per menit)
const store = new Map();
const WINDOW_MS = 60_000;
const MAX_REQ = 60; // 60 request per menit per IP

function rateLimitOk(ip) {
  const now = Date.now();
  const e = store.get(ip) || { n: 0, t: now };
  if (now - e.t > WINDOW_MS) { store.set(ip, { n: 1, t: now }); return true; }
  e.n++;
  store.set(ip, e);
  return e.n <= MAX_REQ;
}

function tolak(pesan, status) {
  return new NextResponse(JSON.stringify({ error: pesan }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Hanya lindungi /api/* routes
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  // Rate limiting
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (!rateLimitOk(ip)) return tolak('Terlalu banyak permintaan', 429);

  // Autentikasi API key (jika dikonfigurasi)
  if (API_KEY && API_KEY.length > 10) {
    const auth = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (token !== API_KEY) return tolak('Tidak diizinkan', 401);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
