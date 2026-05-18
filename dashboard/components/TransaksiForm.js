'use client';
import { useState } from 'react';

const METODE = ['tunai', 'transfer', 'qris'];

export default function TransaksiForm({ stokData, onClose, onSaved }) {
  const [form, setForm] = useState({ produk_id: '', qty: '1', metode_bayar: 'tunai', catatan: '', kasir: 'Ruflo' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sukses, setSukses] = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const produkTerpilih = stokData.find(s => s.id === form.produk_id);
  const total = produkTerpilih ? Number(form.qty || 0) * Number(produkTerpilih.harga_jual) : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/transaksi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, qty: Number(form.qty) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mencatat transaksi');
      setSukses({ total, stok_sisa: data.stok_sisa, produk: produkTerpilih?.nama });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLanjut() {
    setSukses(null);
    setForm(f => ({ ...f, produk_id: '', qty: '1', catatan: '' }));
    onSaved();
  }

  const input = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  if (sukses) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">Transaksi Berhasil!</h2>
          <p className="text-gray-500 text-sm mb-4">{sukses.produk}</p>
          <div className="bg-green-50 rounded-xl p-4 mb-6">
            <div className="text-3xl font-bold text-green-700">Rp {sukses.total.toLocaleString('id-ID')}</div>
            <div className="text-xs text-gray-500 mt-1">Sisa stok: {sukses.stok_sisa}</div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">Tutup</button>
            <button onClick={handleLanjut} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Transaksi Lagi</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">🛒 Catat Transaksi</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produk <span className="text-red-500">*</span></label>
            <select className={input} value={form.produk_id} onChange={e => set('produk_id', e.target.value)} required>
              <option value="">-- Pilih Produk --</option>
              {stokData.map(s => (
                <option key={s.id} value={s.id} disabled={Number(s.stok) <= 0}>
                  {s.nama} — stok: {s.stok} {s.satuan}{Number(s.stok) <= 0 ? ' (HABIS)' : ''}
                </option>
              ))}
            </select>
          </div>

          {produkTerpilih && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm grid grid-cols-2 gap-1">
              <span className="text-gray-500">Harga satuan:</span>
              <span className="font-medium text-right">Rp {Number(produkTerpilih.harga_jual).toLocaleString('id-ID')}</span>
              <span className="text-gray-500">Stok tersedia:</span>
              <span className="font-medium text-right">{produkTerpilih.stok} {produkTerpilih.satuan}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Qty <span className="text-red-500">*</span></label>
              <input type="number" min="1" max={produkTerpilih?.stok || 9999} className={input}
                value={form.qty} onChange={e => set('qty', e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Metode Bayar</label>
              <select className={input} value={form.metode_bayar} onChange={e => set('metode_bayar', e.target.value)}>
                {METODE.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          {total > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Total Pembayaran</div>
              <div className="text-3xl font-bold text-green-700">Rp {total.toLocaleString('id-ID')}</div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
            <input className={input} value={form.catatan} onChange={e => set('catatan', e.target.value)} placeholder="Opsional" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">Batal</button>
            <button type="submit" disabled={loading || !form.produk_id} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Menyimpan...' : 'Catat Jual'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
