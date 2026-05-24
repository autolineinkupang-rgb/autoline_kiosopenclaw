import dayjs from 'dayjs';
import { readCsvData, readMemory, readSyncTs } from '../../../lib/store';

export async function GET() {
  try {
    const today = dayjs().format('YYYY-MM-DD');

    const [transaksi, memory, syncTs] = await Promise.all([
      readCsvData('kios:transaksi', 'transaksi.csv'),
      readMemory(),
      readSyncTs(),
    ]);

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
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([nama]) => nama);

    return Response.json({
      tanggal: today, omzet, totalTx, persen, top3, target,
      stokKritis: memory?.harian?.stok_kritis || [],
      lastCheckpoint: memory?.last_checkpoint,
      sync_ts: syncTs,
      ts: new Date().toISOString(),
    });
  } catch {
    return Response.json({ error: 'Gagal membuat laporan' }, { status: 500 });
  }
}
