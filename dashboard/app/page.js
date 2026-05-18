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
      <p className="text-gray-400">Memuat data kios...</p>
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

      {/* Stats */}
      {laporan && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Omzet Hari Ini" value={formatRupiah(laporan.omzet)} icon="💰" color="green" />
          <StatCard label="Transaksi" value={`${laporan.totalTx}x`} icon="🛒" color="blue" />
          <StatCard label="Stok Kritis" value={stokKritis.length} icon="⚠️" color={stokKritis.length > 0 ? 'red' : 'green'} />
          <StatCard label="Target %" value={`${laporan.persen}%`} icon="🎯" color="purple" />
          <StatCard label="Exp Alert" value={expiredCount + nearExpCount} icon="📅" color={expiredCount > 0 ? 'red' : nearExpCount > 0 ? 'yellow' : 'green'} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        <section className="bg-white rounded-xl shadow p-4">
          <h2 className="text-base font-semibold mb-3 text-gray-700">Transaksi Minggu Ini</h2>
          <TransaksiChart data={transaksi} />
        </section>

        <section className="bg-white rounded-xl shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-700">Stok Produk</h2>
            <div className="flex gap-2 text-xs">
              <a href="/kasir" className="px-3 py-1 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Kasir</a>
              <a href="/gudang" className="px-3 py-1 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600">Gudang</a>
            </div>
          </div>
          <StokTable data={stok} />
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.green}`}>
      <div className="text-xl mb-1">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-70 mt-1">{label}</div>
    </div>
  );
}

function formatRupiah(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
