'use client';
import { useState, useEffect, useCallback } from 'react';
import StokTable from '../../components/StokTable';
import StokForm from '../../components/StokForm';
import ReStokForm from '../../components/ReStokForm';

export default function GudangPage() {
  const [stok, setStok] = useState([]);
  const [pembelian, setPembelian] = useState([]);
  const [stokForm, setStokForm] = useState(null);
  const [reStokForm, setReStokForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sukses, setSukses] = useState('');
  const [filterKat, setFilterKat] = useState('semua');
  const [showExpOnly, setShowExpOnly] = useState(false);

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

  async function handleDeleteStok(id) {
    try {
      await fetch(`/api/stok/${id}`, { method: 'DELETE' });
      fetchData();
    } catch {}
  }

  function handleStokSaved() { setStokForm(null); setSukses('Produk berhasil disimpan!'); fetchData(); }
  function handleReStokSaved(data) {
    setReStokForm(false);
    setSukses(`Pembelian berhasil! ${data.count} item stok diperbarui.`);
    fetchData();
  }

  const today = new Date().toISOString().split('T')[0];
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const expired = stok.filter(s => s.has_exp === '1' && s.exp_date && s.exp_date <= today);
  const nearExpiry = stok.filter(s => s.has_exp === '1' && s.exp_date && s.exp_date > today && s.exp_date <= in7Days);

  const kategoriList = ['semua', ...new Set(stok.map(s => s.kategori))];
  const filteredStok = stok.filter(s => {
    if (filterKat !== 'semua' && s.kategori !== filterKat) return false;
    if (showExpOnly && s.has_exp !== '1') return false;
    return true;
  });

  function rp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

  if (loading) return <div className="flex items-center justify-center min-h-64"><p className="text-gray-400">Memuat data...</p></div>;

  return (
    <div className="space-y-5">
      {/* Sukses banner */}
      {sukses && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl flex items-center justify-between text-sm">
          <span>{sukses}</span>
          <button onClick={() => setSukses('')} className="text-green-600 font-bold ml-4">&times;</button>
        </div>
      )}

      {/* Header actions */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Manajemen Stok</h1>
        <div className="flex gap-2">
          <button onClick={() => setReStokForm(true)}
            className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600">
            Catat Pembelian
          </button>
          <button onClick={() => setStokForm({})}
            className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700">
            + Produk Baru
          </button>
        </div>
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
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <h3 className="font-semibold text-yellow-800 text-sm mb-2">HAMPIR KADALUARSA dalam 7 hari ({nearExpiry.length} produk)</h3>
              <div className="flex flex-wrap gap-2">
                {nearExpiry.map(s => (
                  <span key={s.id} className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                    {s.nama} — exp {s.exp_date}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stock table */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-700">Tabel Stok</h2>
            <span className="text-xs text-gray-400">{filteredStok.length} produk</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showExpOnly} onChange={e => setShowExpOnly(e.target.checked)}
                className="rounded" />
              Hanya punya Exp Date
            </label>
            <select className="border rounded-lg px-2 py-1 text-xs" value={filterKat} onChange={e => setFilterKat(e.target.value)}>
              {kategoriList.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>
        <StokTable
          data={filteredStok}
          showExpiry={true}
          onEdit={(item) => setStokForm(item)}
          onDelete={handleDeleteStok}
        />
      </div>

      {/* Riwayat Pembelian */}
      {pembelian.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-base font-semibold text-gray-700 mb-3">Riwayat Pembelian Terakhir</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 border-b">
                <tr>
                  <th className="py-2 pr-4">Tanggal</th>
                  <th className="py-2 pr-4">Produk</th>
                  <th className="py-2 pr-4 text-right">Qty</th>
                  <th className="py-2 pr-4 text-right">Harga Beli</th>
                  <th className="py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...pembelian].reverse().map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-500 text-xs">{p.tanggal}</td>
                    <td className="py-2 pr-4 font-medium">{p.nama_produk}</td>
                    <td className="py-2 pr-4 text-right">{p.qty}</td>
                    <td className="py-2 pr-4 text-right text-gray-600">{rp(p.harga_beli)}</td>
                    <td className="py-2 text-right text-orange-700 font-medium">{rp(p.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {stokForm !== null && (
        <StokForm item={stokForm} onClose={() => setStokForm(null)} onSaved={handleStokSaved} />
      )}
      {reStokForm && (
        <ReStokForm stokData={stok} onClose={() => setReStokForm(false)} onSaved={handleReStokSaved} />
      )}
    </div>
  );
}
