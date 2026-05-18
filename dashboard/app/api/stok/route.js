import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync, renameSync } from 'fs';
import path from 'path';

const CSV_PATH = path.join(process.cwd(), '..', 'data', 'stok.csv');
const HEADERS = ['id','nama','kategori','satuan','stok','harga_beli','harga_jual','stok_minimum','stok_kritis','supplier','last_update','has_exp','exp_date'];

function readStok() {
  try {
    const content = readFileSync(CSV_PATH, 'utf8');
    return parse(content, { columns: true, skip_empty_lines: true });
  } catch { return []; }
}

function csvLine(row) {
  return HEADERS.map(h => {
    const v = String(row[h] ?? '');
    return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
}

function writeStok(data) {
  const tmp = CSV_PATH + '.tmp';
  const lines = [HEADERS.join(','), ...data.map(csvLine)].join('\n') + '\n';
  writeFileSync(tmp, lines, 'utf8');
  renameSync(tmp, CSV_PATH);
}

export async function GET() {
  try {
    const data = readStok();
    return Response.json({ data, count: data.length, ts: new Date().toISOString() });
  } catch {
    return Response.json({ error: 'Gagal membaca data stok', data: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { nama, kategori, satuan, stok, harga_beli, harga_jual, stok_minimum, stok_kritis, supplier } = body;

    if (!nama?.trim() || !satuan?.trim() || harga_jual === undefined) {
      return Response.json({ error: 'Nama, satuan, dan harga jual wajib diisi' }, { status: 400 });
    }

    const data = readStok();
    const maxId = data.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0);

    const newItem = {
      id: String(maxId + 1).padStart(3, '0'),
      nama: String(nama).trim(),
      kategori: String(kategori || 'lainnya').trim(),
      satuan: String(satuan).trim(),
      stok: String(Number(stok) || 0),
      harga_beli: String(Number(harga_beli) || 0),
      harga_jual: String(Number(harga_jual) || 0),
      stok_minimum: String(Number(stok_minimum) || 0),
      stok_kritis: String(Number(stok_kritis) || 0),
      supplier: String(supplier || '').trim(),
      last_update: new Date().toISOString().split('T')[0],
      has_exp: String(Number(body.has_exp) || 0),
      exp_date: String(body.exp_date || '').trim(),
    };

    writeStok([...data, newItem]);
    return Response.json({ ok: true, data: newItem }, { status: 201 });
  } catch {
    return Response.json({ error: 'Gagal menyimpan produk' }, { status: 500 });
  }
}
