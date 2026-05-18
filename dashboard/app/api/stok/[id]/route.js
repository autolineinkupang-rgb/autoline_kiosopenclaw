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

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = readStok();
    const idx = data.findIndex(r => r.id === id);

    if (idx === -1) return Response.json({ error: 'Produk tidak ditemukan' }, { status: 404 });

    data[idx] = {
      ...data[idx],
      nama: String(body.nama ?? data[idx].nama).trim(),
      kategori: String(body.kategori ?? data[idx].kategori).trim(),
      satuan: String(body.satuan ?? data[idx].satuan).trim(),
      stok: String(Number(body.stok ?? data[idx].stok)),
      harga_beli: String(Number(body.harga_beli ?? data[idx].harga_beli)),
      harga_jual: String(Number(body.harga_jual ?? data[idx].harga_jual)),
      stok_minimum: String(Number(body.stok_minimum ?? data[idx].stok_minimum)),
      stok_kritis: String(Number(body.stok_kritis ?? data[idx].stok_kritis)),
      supplier: String(body.supplier ?? data[idx].supplier).trim(),
      last_update: new Date().toISOString().split('T')[0],
      has_exp: String(Number(body.has_exp ?? data[idx].has_exp ?? 0)),
      exp_date: String(body.exp_date ?? data[idx].exp_date ?? '').trim(),
    };

    writeStok(data);
    return Response.json({ ok: true, data: data[idx] });
  } catch {
    return Response.json({ error: 'Gagal update produk' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const data = readStok();
    const idx = data.findIndex(r => r.id === id);

    if (idx === -1) return Response.json({ error: 'Produk tidak ditemukan' }, { status: 404 });

    data.splice(idx, 1);
    writeStok(data);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Gagal hapus produk' }, { status: 500 });
  }
}
