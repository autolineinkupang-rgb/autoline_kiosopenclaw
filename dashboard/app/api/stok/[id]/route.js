import { isReadOnly, readOnlyResponse } from '../../../../lib/store';

// Endpoint write per-produk dinonaktifkan di Vercel.
// Sumber data resmi: bot Signal di VPS. Untuk edit:
//   "update harga gula jadi 16000"  (UPDATE_HARGA_KIOS)
//   "set stok beras 50"             (SET_STOK)
//   "hapus produk minyak"           (HAPUS_PRODUK)

export async function PUT() {
  if (isReadOnly()) return readOnlyResponse();
  return Response.json({ error: 'Endpoint write dinonaktifkan' }, { status: 405 });
}

export async function DELETE() {
  if (isReadOnly()) return readOnlyResponse();
  return Response.json({ error: 'Endpoint delete dinonaktifkan' }, { status: 405 });
}
