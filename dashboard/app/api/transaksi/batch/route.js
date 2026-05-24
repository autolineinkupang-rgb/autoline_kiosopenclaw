import { isReadOnly, readOnlyResponse } from '../../../../lib/store';

// Endpoint batch checkout dinonaktifkan di Vercel.
// Untuk multi-item: kirim via Signal "jual massal" → bot parse list dan eksekusi.
//   Contoh: jual massal
//           gula | 2
//           beras | 1
//           minyak | 3

export async function POST() {
  if (isReadOnly()) return readOnlyResponse();
  return Response.json({ error: 'Endpoint batch dinonaktifkan' }, { status: 405 });
}
