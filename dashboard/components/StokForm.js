'use client';
import { useState, useEffect } from 'react';

const KATEGORI = ['sembako', 'minuman', 'snack', 'rokok', 'kebersihan', 'obat', 'pulsa', 'lainnya'];
const EMPTY = { nama: '', kategori: 'sembako', satuan: '', stok: '', harga_beli: '', harga_jual: '', stok_minimum: '', stok_kritis: '', supplier: '', has_exp: false, exp_date: '' };

export default function StokForm({ item, onClose, onSaved }) {
  const isEdit = !!item?.id;
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (item?.id) {
      setForm({
        nama: item.nama || '', kategori: item.kategori || 'sembako',
        satuan: item.satuan || '', stok: item.stok || '',
        harga_beli: item.harga_beli || '', harga_jual: item.harga_jual || '',
        stok_minimum: item.stok_minimum || '', stok_kritis: item.stok_kritis || '',
        supplier: item.supplier || '',
        has_exp: item.has_exp === '1',
        exp_date: item.exp_date || '',
      });
    } else { setForm(EMPTY); }
  }, [item]);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.has_exp && !form.exp_date) { setError('Tanggal kadaluarsa wajib diisi untuk produk ber-exp date'); return; }
    setLoading(true);
    setError('');
    try {
      const url = isEdit ? `/api/stok/${item.id}` : '/api/stok';
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, has_exp: form.has_exp ? 1 : 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan');
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const input = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-gray-800">{isEdit ? 'Edit Produk' : '+ Tambah Produk'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl w-8 h-8 flex items-center justify-center">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Produk <span className="text-red-500">*</span></label>
            <input className={input} value={form.nama} onChange={e => set('nama', e.target.value)} required placeholder="Beras Premium 5kg" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
              <select className={input} value={form.kategori} onChange={e => set('kategori', e.target.value)}>
                {KATEGORI.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Satuan <span className="text-red-500">*</span></label>
              <input className={input} value={form.satuan} onChange={e => set('satuan', e.target.value)} required placeholder="karung / botol / bungkus" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stok <span className="text-red-500">*</span></label>
              <input type="number" min="0" className={input} value={form.stok} onChange={e => set('stok', e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Stok</label>
              <input type="number" min="0" className={input} value={form.stok_minimum} onChange={e => set('stok_minimum', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stok Kritis</label>
              <input type="number" min="0" className={input} value={form.stok_kritis} onChange={e => set('stok_kritis', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Harga Beli (Rp)</label>
              <input type="number" min="0" className={input} value={form.harga_beli} onChange={e => set('harga_beli', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Harga Jual (Rp) <span className="text-red-500">*</span></label>
              <input type="number" min="0" className={input} value={form.harga_jual} onChange={e => set('harga_jual', e.target.value)} required placeholder="0" />
            </div>
          </div>

          {form.harga_beli && form.harga_jual && Number(form.harga_beli) > 0 && (
            <div className="bg-green-50 rounded-lg px-4 py-2 text-sm text-green-700">
              Margin: Rp {(Number(form.harga_jual) - Number(form.harga_beli)).toLocaleString('id-ID')} ({Math.round((Number(form.harga_jual) - Number(form.harga_beli)) / Number(form.harga_beli) * 100)}%)
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
            <input className={input} value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Nama supplier" />
          </div>

          {/* Exp Date Section */}
          <div className="border rounded-xl p-4 bg-amber-50 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.has_exp} onChange={e => set('has_exp', e.target.checked)}
                className="w-4 h-4 rounded" />
              <div>
                <div className="text-sm font-semibold text-amber-800">Produk punya tanggal kadaluarsa</div>
                <div className="text-xs text-amber-600">Aktifkan untuk produk makanan/minuman/obat</div>
              </div>
            </label>
            {form.has_exp && (
              <div>
                <label className="block text-sm font-medium text-amber-800 mb-1">Tanggal Kadaluarsa <span className="text-red-500">*</span></label>
                <input type="date" className={input + ' bg-white'} value={form.exp_date}
                  onChange={e => set('exp_date', e.target.value)} required={form.has_exp}
                  min={new Date().toISOString().split('T')[0]} />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              {loading ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Tambah Produk'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
