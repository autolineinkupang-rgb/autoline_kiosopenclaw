import { readCsvData, isReadOnly, readOnlyResponse } from '../../../lib/store';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const data = await readCsvData('kios:pembelian', 'pembelian.csv');
    return Response.json({ data: data.slice(-limit), count: data.length });
  } catch {
    return Response.json({ error: 'Gagal membaca data pembelian', data: [] }, { status: 500 });
  }
}

// Catat pembelian/restock via Signal bot:
//   "beli gula 5 13000"                   → restock 5 qty harga 13000
//   "restock gula 10 13000 dari UD Maju"  → restock dengan supplier
export async function POST() {
  if (isReadOnly()) return readOnlyResponse();
  return Response.json({ error: 'Endpoint write dinonaktifkan' }, { status: 405 });
}
