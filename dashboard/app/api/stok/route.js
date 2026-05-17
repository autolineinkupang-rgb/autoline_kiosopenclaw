import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import path from 'path';

const CSV_PATH = path.join(process.cwd(), '..', 'data', 'stok.csv');

export async function GET() {
  try {
    // Coba baca dari file lokal (dev) atau Vercel KV (prod)
    let data;
    try {
      const content = readFileSync(CSV_PATH, 'utf8');
      data = parse(content, { columns: true, skip_empty_lines: true });
    } catch {
      // Fallback: data kosong jika di Vercel tanpa KV
      data = [];
    }
    return Response.json({ data, count: data.length, ts: new Date().toISOString() });
  } catch (err) {
    return Response.json({ error: err.message, data: [] }, { status: 500 });
  }
}
