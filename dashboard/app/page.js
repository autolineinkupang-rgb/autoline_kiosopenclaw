'use client';
import { useCallback, useEffect, useState } from 'react';
import StokTable from '../components/StokTable';
import AlertBanner from '../components/AlertBanner';
import TransaksiChart from '../components/TransaksiChart';

export default function Dashboard() {
  const [stok, setStok] = useState([]);
  const [transaksi, setTransaksi] = useState([]);
  const [laporan, setLaporan] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [stokRes, txRes, lapRes] = await Promise.all([
        fetch('/api/stok').then(r => r.json()),
        fetch('/api/transaksi').then(r => r.json()),
        fetch('/api/laporan').then(r => r.json()),
      ]);
      setStok(stokRes.data || []);
      setTransaksi(txRes.data || []);
      setLaporan(lapRes);
    } catch (err) { console.error('Fetch error:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const stokKritis = stok.filter(s => Number(s.stok) <= Number(s.stok_kritis));
  const stokRendah = stok.filter(s => Number(s.stok) > Number(s.stok_kritis) && Number(s.stok) <= Number(s.stok_minimum));
  const today = new Date().toISOString().split('T')[0];
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const expiredCount = stok.filter(s => s.has_exp === '1' && s.exp_date && s.exp_date <= today).length;
  const nearExpCount = stok.filter(s => s.has_exp === '1' && s.exp_date > today && s.exp_date <= in7).length;

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="text-center text-gray-400">
        <div className="text-3xl mb-2">⏳</div>
        <p className="text-sm">Memuat data kios...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {stokKritis.length > 0 && (
        <AlertBanner tipe="kritis" items={stokKritis} pesan={`${stokKritis.length} produk stok kritis — perlu restock segera!`} />
      )}
      {stokRendah.length > 0 && stokKritis.length === 0 && (
        <AlertBanner tipe="rendah" items={stokRendah} pesan={`${stokRendah.length} produk stok rendah — restock minggu ini`} />
      )}

      {laporan && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Omzet Hari Ini" value={formatRupiah(laporan.omzet)} accent="green" icon="💰" />
          <StatCard label="Transaksi" value={`${laporan.totalTx}x`} accent="blue" icon="🛒" />
          <StatCard label="Stok Kritis" value={stokKritis.length} accent={stokKritis.length > 0 ? 'red' : 'emerald'} icon="⚠️" />
          <StatCard label="Target Hari Ini" value={`${laporan.persen}%`} accent="violet" icon="🎯" />
          <StatCard label="Exp Alert" value={expiredCount + nearExpCount} accent={expiredCount > 0 ? 'red' : nearExpCount > 0 ? 'amber' : 'emerald'} icon="📅" />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">Omzet 7 Hari Terakhir</h2>
          <TransaksiChart data={transaksi} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Stok Produk</h2>
            <div className="flex gap-2 text-xs">
              <a href="/kasir" className="px-3 py-1.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors">
                Kasir
              </a>
              <a href="/gudang" className="px-3 py-1.5 bg-slate-700 text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors">
                Gudang
              </a>
            </div>
          </div>
          <StokTable data={stok} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, icon }) {
  const styles = {
    green:   'border-green-500 bg-green-50 text-green-700',
    emerald: 'border-emerald-500 bg-emerald-50 text-emerald-700',
    blue:    'border-blue-500 bg-blue-50 text-blue-700',
    red:     'border-red-500 bg-red-50 text-red-700',
    violet:  'border-violet-500 bg-violet-50 text-violet-700',
    amber:   'border-amber-500 bg-amber-50 text-amber-700',
  };
  return (
    <div className={`rounded-xl border-l-4 p-4 bg-white shadow-sm ${styles[accent] || styles.green}`}>
      <div className="text-lg mb-1">{icon}</div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
      <div className="text-xs opacity-70 mt-1 font-medium">{label}</div>
    </div>
  );
}

function formatRupiah(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
