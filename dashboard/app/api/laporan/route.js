import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import path from 'path';
import dayjs from 'dayjs';

const DATA_DIR = path.join(process.cwd(), '..', 'data');
const MEMORY_FILE = path.join(process.cwd(), '..', 'memory', 'kios-memory.json');

export async function GET() {
  try {
    const today = dayjs().format('YYYY-MM-DD');

    let transaksi = [];
    try {
      const content = readFileSync(path.join(DATA_DIR, 'transaksi.csv'), 'utf8').trim();
      if (content.split('\n').length > 1) {
        transaksi = parse(content, { columns: true, skip_empty_lines: true });
      }
    } catch {}

    const hari = transaksi.filter(t => t.tanggal === today);
    const omzet = hari.reduce((s, t) => s + Number(t.total || 0), 0);
    const totalTx = hari.length;
    const target = 500000;
    const persen = omzet > 0 ? Math.round((omzet / target) * 100) : 0;

    const produkCount = {};
    hari.forEach(t => {
      produkCount[t.nama_produk] = (produkCount[t.nama_produk] || 0) + Number(t.qty || 0);
    });
    const top3 = Object.entries(produkCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([nama]) => nama);

    let memory = {};
    try { memory = JSON.parse(readFileSync(MEMORY_FILE, 'utf8')); } catch {}

    return Response.json({
      tanggal: today, omzet, totalTx, persen, top3, target,
      stokKritis: memory.harian?.stok_kritis || [],
      lastCheckpoint: memory.last_checkpoint,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
