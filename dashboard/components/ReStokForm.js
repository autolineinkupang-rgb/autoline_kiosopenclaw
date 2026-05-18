'use client';
import { useState } from 'react';

const EMPTY_ITEM = { produk_id: '', qty: '', harga_beli: '' };

export default function ReStokForm({ stokData, onClose, onSaved }) {
  const [supplier, setSupplier] = useState('');
  const [catatan, setCatatan] = useState('');
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function addItem() { setItems(p => [...p, { ...EMPTY_ITEM }]); }
  function removeItem(i) { setItems(p => p.filter((_, j) => j !== i)); }

  function updateItem(i, key, val) {
    setItems(p => p.map((item, j) => {
      if (j !== i) return item;
      const updated = { ...item, [key]: val };
      if (key === 'produk_id') {
        const produk = stokData.find(s => s.id === val);
        if (produk) updated.harga_beli = produk.harga_beli || '';
      }
      return updated;
    }));
  }

  const totalBayar = items.reduce((s, i) => s + (Number(i.qty) * Number(i.harga_beli) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const validItems = items.filter(i => i.produk_id && Number(i.qty) > 0);
    if (!validItems.length) { setError('Minimal satu item harus diisi dengan lengkap'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/pembelian', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier, catatan, kasir: 'Gudang',
          items: validItems.map(i => ({
            produk_id: i.produk_id,
            qty: Number(i.qty),
            harga_beli: Number(i.harga_beli) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan');
      onSaved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inp = 'border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-gray-800">Catat Pembelian Stok</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl w-8 h-8 flex items-center justify-center">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <input className={`w-full ${inp}`} value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Nama supplier / toko" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
              <input className={`w-full ${inp}`} value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Opsional" />
            </div>
          </div>

          <div className="border rounded-xl overflow-hidden">
            <div className="bg-orange-50 px-4 py-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-orange-800">Daftar Barang Dibeli</span>
              <button type="button" onClick={addItem}
                className="text-xs px-3 py-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium">
                + Tambah Baris
              </button>
            </div>
            <div className="divide-y">
              {items.map((item, i) => {
                const produk = stokData.find(s => s.id === item.produk_id);
                const subtotal = Number(item.qty) * Number(item.harga_beli) || 0;
                return (
                  <div key={i} className="px-4 py-3 grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <select className={`w-full ${inp}`} value={item.produk_id}
                        onChange={e => updateItem(i, 'produk_id', e.target.value)}>
                        <option value="">-- Pilih Produk --</option>
                        {stokData.map(s => (
                          <option key={s.id} value={s.id}>{s.nama} (stok: {s.stok})</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input type="number" min="1" placeholder="Qty"
                        className={`w-full ${inp}`} value={item.qty}
                        onChange={e => updateItem(i, 'qty', e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <input type="number" min="0" placeholder="Harga beli"
                        className={`w-full ${inp}`} value={item.harga_beli}
                        onChange={e => updateItem(i, 'harga_beli', e.target.value)} />
                    </div>
                    <div className="col-span-1 text-right text-xs text-gray-500 font-mono">
                      {subtotal > 0 ? `${(subtotal/1000).toFixed(0)}rb` : '-'}
                    </div>
                    <div className="col-span-1 text-right">
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(i)}
                          className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {totalBayar > 0 && (
              <div className="bg-orange-50 px-4 py-2 flex justify-between text-sm font-semibold text-orange-800">
                <span>Total Pembelian:</span>
                <span>Rp {totalBayar.toLocaleString('id-ID')}</span>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
              Batal
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
              {loading ? 'Menyimpan...' : 'Simpan Pembelian'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
