import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import path from 'path';

const CSV_PATH = path.join(process.cwd(), '..', 'data', 'transaksi.csv');

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') || 100);

    let data = [];
    try {
      const content = readFileSync(CSV_PATH, 'utf8').trim();
      if (content.split('\n').length > 1) {
        data = parse(content, { columns: true, skip_empty_lines: true });
      }
    } catch {}

    const result = data.slice(-limit);
    return Response.json({ data: result, count: result.length, ts: new Date().toISOString() });
  } catch (err) {
    return Response.json({ error: err.message, data: [] }, { status: 500 });
  }
}
