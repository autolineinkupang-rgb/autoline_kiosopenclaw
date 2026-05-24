import { readCsvData, readSyncTs, isReadOnly, readOnlyResponse } from '../../../lib/store';

export async function GET() {
  try {
    const data = await readCsvData('kios:stok', 'stok.csv');
    const syncTs = await readSyncTs();
    return Response.json({
      data,
      count: data.length,
      ts: new Date().toISOString(),
      sync_ts: syncTs,    // kapan VPS terakhir push data ke Redis
    });
  } catch {
    return Response.json({ error: 'Gagal membaca data stok', data: [] }, { status: 500 });
  }
}

export async function POST() {
  // Dashboard di Vercel tidak boleh tulis langsung — sumber data ada di VPS.
  // Untuk tambah produk, owner kirim perintah Signal ke bot:
  //   "tambah produk gula 1 kg 15000"
  if (isReadOnly()) return readOnlyResponse();
  return Response.json({ error: 'Endpoint write dinonaktifkan' }, { status: 405 });
}
