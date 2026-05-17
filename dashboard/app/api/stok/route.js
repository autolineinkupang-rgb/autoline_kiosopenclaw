import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import path from 'path';

const CSV_PATH = path.join(process.cwd(), '..', 'data', 'stok.csv');

export async function GET() {
  try {
    let data = [];
    try {
      const content = readFileSync(CSV_PATH, 'utf8');
      data = parse(content, { columns: true, skip_empty_lines: true });
    } catch {
      // File tidak ada — kembalikan array kosong, bukan error detail
    }
    return Response.json({ data, count: data.length, ts: new Date().toISOString() });
  } catch {
    // Jangan ekspos detail error ke client
    return Response.json({ error: 'Gagal membaca data stok', data: [] }, { status: 500 });
  }
}
