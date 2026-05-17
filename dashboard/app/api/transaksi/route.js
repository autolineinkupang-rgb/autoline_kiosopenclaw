import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import path from 'path';

const CSV_PATH = path.join(process.cwd(), '..', 'data', 'transaksi.csv');
const MAX_LIMIT = 500; // Cegah dump seluruh database sekaligus

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // Validasi dan batasi parameter limit
    const rawLimit = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : 100;

    let data = [];
    try {
      const content = readFileSync(CSV_PATH, 'utf8').trim();
      if (content.split('\n').length > 1) {
        data = parse(content, { columns: true, skip_empty_lines: true });
      }
    } catch {
      // File tidak ada — bukan error
    }

    const result = data.slice(-limit);
    return Response.json({ data: result, count: result.length, ts: new Date().toISOString() });
  } catch {
    return Response.json({ error: 'Gagal membaca data transaksi', data: [] }, { status: 500 });
  }
}
