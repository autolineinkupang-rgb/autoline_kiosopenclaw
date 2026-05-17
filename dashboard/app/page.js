'use client';

import { useEffect, useState } from 'react';
import StokTable from '../components/StokTable';
import AlertBanner from '../components/AlertBanner';
import TransaksiChart from '../components/TransaksiChart';

export default function Dashboard() {
  const [stok, setStok] = useState([]);
  const [transaksi, setTransaksi] = useState([]);
  const [laporan, setLaporan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [stokRes, txRes, lapRes] = await Promise.all([
          fetch('/api/stok').then(r => r.json()),
          fetch('/api/transaksi').then(r => r.json()),
          fetch('/api/laporan').then(r => r.json()),
        ]);
        setStok(stokRes.data || []);
        setTransaksi(txRes.data || []);
        setLaporan(lapRes);
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    // Auto-refresh setiap 5 menit
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const stokKritis = stok.filter(s => Number(s.stok) <= Number(s.stok_kritis));
  const stokRendah = stok.filter(s => Number(s.stok) > Number(s.stok_kritis) && Number(s.stok) <= Number(s.stok_minimum));

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <p className="text-gray-500">⏳ Memuat data kios...</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {stokKritis.length > 0 && (
        <AlertBanner
          tipe="kritis"
          items={stokKritis}
          pesan={`${stokKritis.length} produk stok kritis — perlu restock segera!`}
        />
      )}
      {stokRendah.length > 0 && stokKritis.length === 0 && (
        <AlertBanner
          tipe="rendah"
          items={stokRendah}
          pesan={`${stokRendah.length} produk stok rendah — restock minggu ini`}
        />
      )}

      {/* Ringkasan Harian */}
      {laporan && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Omzet Hari Ini" value={formatRupiah(laporan.omzet)} icon="💰" color="green" />
          <StatCard label="Transaksi" value={`${laporan.totalTx}x`} icon="🛒" color="blue" />
          <StatCard label="Stok Kritis" value={stokKritis.length} icon="⚠️" color={stokKritis.length > 0 ? 'red' : 'green'} />
          <StatCard label="Target %" value={`${laporan.persen}%`} icon="🎯" color="purple" />
        </div>
      )}

      {/* Chart Transaksi */}
      <section className="bg-white rounded-xl shadow p-4">
        <h2 className="text-lg font-semibold mb-3 text-gray-700">📈 Transaksi Minggu Ini</h2>
        <TransaksiChart data={transaksi} />
      </section>

      {/* Tabel Stok */}
      <section className="bg-white rounded-xl shadow p-4">
        <h2 className="text-lg font-semibold mb-3 text-gray-700">📦 Stok Produk</h2>
        <StokTable data={stok} />
      </section>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.green}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-70 mt-1">{label}</div>
    </div>
  );
}

function formatRupiah(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}
