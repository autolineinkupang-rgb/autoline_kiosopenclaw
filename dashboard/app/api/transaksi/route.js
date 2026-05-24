import { readCsvData, isReadOnly, readOnlyResponse } from '../../../lib/store';

const MAX_LIMIT = 500;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : 100;
    const data = await readCsvData('kios:transaksi', 'transaksi.csv');
    const result = data.slice(-limit);
    return Response.json({ data: result, count: result.length, ts: new Date().toISOString() });
  } catch {
    return Response.json({ error: 'Gagal membaca data transaksi', data: [] }, { status: 500 });
  }
}

// Catat transaksi via Signal bot:
//   "jual gula 2"           → JUAL
//   "jual gula 2 qris"      → JUAL dengan metode bayar
//   "jual gula 2 tunai bayar 20000"  → JUAL + hitung kembalian
export async function POST() {
  if (isReadOnly()) return readOnlyResponse();
  return Response.json({ error: 'Endpoint write dinonaktifkan' }, { status: 405 });
}
