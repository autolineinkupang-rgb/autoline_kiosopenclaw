'use client';
import { useState, useEffect, useCallback } from 'react';
import StokTable from '../../components/StokTable';

export default function GudangPage() {
  const [stok, setStok] = useState([]);
  const [pembelian, setPembelian] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterKat, setFilterKat] = useState('semua');
  const [showExpOnly, setShowExpOnly] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    const [stokRes, pemRes] = await Promise.all([
      fetch('/api/stok').then(r => r.json()),
      fetch('/api/pembelian?limit=20').then(r => r.json()),
    ]);
    setStok(stokRes.data || []);
    setPembelian(pemRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const today = new Date().toISOString().split('T')[0];
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const expired = stok.filter(s => s.has_exp === '1' && s.exp_date && s.exp_date <= today);
  const nearExpiry = stok.filter(s => s.has_exp === '1' && s.exp_date && s.exp_date > today && s.exp_date <= in7Days);

  const kategoriList = ['semua', ...new Set(stok.map(s => s.kategori))];
  const filteredStok = stok.filter(s => {
    if (filterKat !== 'semua' && s.kategori !== filterKat) return false;
    if (showExpOnly && s.has_exp !== '1') return false;
    if (search && !s.nama.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function rp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="text-center text-gray-400">
        <div className="text-3xl mb-2">⏳</div>
        <p className="text-sm">Memuat inventaris...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Inventaris Gudang</h1>
          <p className="text-sm text-gray-500 mt-0.5">{stok.length} produk terdaftar · gunakan bot Signal untuk edit stok</p>
        </div>
        <button onClick={fetchData}
          className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
          ↻ Refresh
        </button>
      </div>

      {/* Expiry Alerts */}
      {(expired.length > 0 || nearExpiry.length > 0) && (
        <div className="space-y-2">
          {expired.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="font-semibold text-red-800 text-sm mb-2">KADALUARSA ({expired.length} produk)</h3>
              <div className="flex flex-wrap gap-2">
                {expired.map(s => (
                  <span key={s.id} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                    {s.nama} — exp {s.exp_date}
                  </span>
                ))}
              </div>
            </div>
          )}
          {nearExpiry.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="font-semibold text-amber-800 text-sm mb-2">HAMPIR KADALUARSA ({nearExpiry.length} produk dalam 7 hari)</h3>
              <div className="flex flex-wrap gap-2">
                {nearExpiry.map(s => (
                  <span key={s.id} className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                    {s.nama} — exp {s.exp_date}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stock table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide flex-1">
            Tabel Stok
            <span className="ml-2 text-gray-400 font-normal normal-case">{filteredStok.length} produk</span>
          </h2>
          <input
            type="search"
            placeholder="Cari produk..."
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-44"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            value={filterKat}
            onChange={e => setFilterKat(e.target.value)}
          >
            {kategoriList.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showExpOnly} onChange={e => setShowExpOnly(e.target.checked)} className="rounded" />
            Ada Exp Date
          </label>
        </div>
        <StokTable data={filteredStok} showExpiry={true} />
      </div>

      {/* Riwayat Pembelian — read only */}
      {pembelian.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">Riwayat Pembelian Terakhir</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="pb-2 pr-4 font-semibold">Tanggal</th>
                  <th className="pb-2 pr-4 font-semibold">Produk</th>
                  <th className="pb-2 pr-4 text-right font-semibold">Qty</th>
                  <th className="pb-2 pr-4 text-right font-semibold">Harga Beli</th>
                  <th className="pb-2 text-right font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...pembelian].reverse().map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-2.5 pr-4 text-gray-400 text-xs">{p.tanggal}</td>
                    <td className="py-2.5 pr-4 font-medium text-gray-800">{p.nama_produk}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-600">{p.qty}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-500">{rp(p.harga_beli)}</td>
                    <td className="py-2.5 text-right text-green-700 font-semibold">{rp(p.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
