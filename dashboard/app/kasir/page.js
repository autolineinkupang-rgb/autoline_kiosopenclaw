'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

const METODE = ['tunai', 'qris', 'transfer'];
const METODE_LABEL = { tunai: 'TUNAI', qris: 'QRIS', transfer: 'TRANSFER' };

export default function KasirPage() {
  const [stok, setStok] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [activeKat, setActiveKat] = useState('semua');
  const [metodeBayar, setMetodeBayar] = useState('tunai');
  const [uangDiterima, setUangDiterima] = useState('');
  const [loading, setLoading] = useState(false);
  const [sukses, setSukses] = useState(null);
  const searchRef = useRef(null);

  const fetchStok = useCallback(() => {
    fetch('/api/stok').then(r => r.json()).then(d => setStok(d.data || []));
  }, []);

  useEffect(() => { fetchStok(); searchRef.current?.focus(); }, [fetchStok]);

  const kategoriList = useMemo(() => ['semua', ...new Set(stok.map(s => s.kategori))], [stok]);

  const filtered = useMemo(() => stok.filter(s => {
    if (Number(s.stok) <= 0) return false;
    if (activeKat !== 'semua' && s.kategori !== activeKat) return false;
    if (search && !s.nama.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [stok, activeKat, search]);

  function addToCart(produk) {
    setCart(prev => {
      const idx = prev.findIndex(c => c.produk_id === produk.id);
      const maxQty = Number(stok.find(s => s.id === produk.id)?.stok || 0);
      if (idx >= 0) {
        if (prev[idx].qty >= maxQty) return prev;
        return prev.map((c, i) => i === idx
          ? { ...c, qty: c.qty + 1, subtotal: (c.qty + 1) * c.harga }
          : c);
      }
      return [...prev, {
        produk_id: produk.id, nama: produk.nama, satuan: produk.satuan,
        harga: Number(produk.harga_jual), qty: 1,
        subtotal: Number(produk.harga_jual), maxQty,
      }];
    });
    setSearch('');
    searchRef.current?.focus();
  }

  function setQty(produk_id, qty) {
    if (qty <= 0) { setCart(prev => prev.filter(c => c.produk_id !== produk_id)); return; }
    setCart(prev => prev.map(c => c.produk_id === produk_id
      ? { ...c, qty: Math.min(qty, c.maxQty), subtotal: Math.min(qty, c.maxQty) * c.harga }
      : c));
  }

  const total = cart.reduce((s, c) => s + c.subtotal, 0);
  const kembalian = metodeBayar === 'tunai' && uangDiterima ? Number(uangDiterima) - total : null;

  async function checkout() {
    if (!cart.length) return;
    setLoading(true);
    try {
      const res = await fetch('/api/transaksi/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(c => ({ produk_id: c.produk_id, qty: c.qty })),
          metode_bayar: metodeBayar, kasir: 'Kasir',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal checkout');
      setSukses({ total, itemCount: cart.length, kembalian, metode: metodeBayar });
      setCart([]); setUangDiterima('');
      fetchStok();
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  }

  function rp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

  function stokBadge(s) {
    const stokNum = Number(s.stok), kritis = Number(s.stok_kritis), min = Number(s.stok_minimum);
    if (stokNum <= kritis) return 'bg-red-100 text-red-700';
    if (stokNum <= min) return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-700';
  }

  if (sukses) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="bg-white rounded-3xl shadow-xl p-10 text-center max-w-sm w-full">
          <div className="text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Transaksi Berhasil!</h2>
          <p className="text-gray-500 text-sm mb-6">{sukses.itemCount} item — {METODE_LABEL[sukses.metode]}</p>
          <div className="bg-green-50 rounded-2xl p-5 mb-6">
            <div className="text-sm text-gray-500 mb-1">Total Dibayar</div>
            <div className="text-4xl font-bold text-green-700">{rp(sukses.total)}</div>
            {sukses.kembalian !== null && sukses.kembalian >= 0 && (
              <div className="text-lg font-semibold text-gray-700 mt-2">
                Kembalian: {rp(sukses.kembalian)}
              </div>
            )}
          </div>
          <button onClick={() => { setSukses(null); searchRef.current?.focus(); }}
            className="w-full px-6 py-3 bg-green-600 text-white rounded-xl text-lg font-bold hover:bg-green-700">
            Transaksi Baru
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-160px)]">
      {/* Left: Products */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search */}
        <div className="mb-3">
          <input ref={searchRef} type="search"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-green-500"
            placeholder="Cari produk... (ketik nama)"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Category filter */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 flex-shrink-0">
          {kategoriList.map(k => (
            <button key={k} onClick={() => setActiveKat(k)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap border ${
                activeKat === k ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
              }`}>
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              {search ? `Tidak ada produk "${search}"` : 'Semua produk habis'}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
              {filtered.map(s => (
                <button key={s.id} onClick={() => addToCart(s)}
                  className="bg-white border rounded-xl p-3 text-left hover:border-green-500 hover:shadow-md transition-all active:scale-95">
                  <div className="font-semibold text-sm text-gray-800 leading-tight mb-2 line-clamp-2">{s.nama}</div>
                  <div className="text-green-700 font-bold text-base">{rp(s.harga_jual)}</div>
                  <div className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${stokBadge(s)}`}>
                    {s.stok} {s.satuan}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-white rounded-2xl shadow border">
        <div className="px-4 py-3 border-b">
          <h2 className="font-bold text-gray-800">Keranjang {cart.length > 0 && <span className="text-green-600">({cart.length})</span>}</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
          {cart.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Klik produk untuk menambahkan</p>
          ) : cart.map(c => (
            <div key={c.produk_id} className="flex items-center gap-2 py-2 border-b last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{c.nama}</div>
                <div className="text-xs text-green-700">{rp(c.harga)} / {c.satuan}</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setQty(c.produk_id, c.qty - 1)}
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-red-100 text-gray-600 font-bold flex items-center justify-center text-sm">−</button>
                <span className="w-6 text-center text-sm font-bold">{c.qty}</span>
                <button onClick={() => setQty(c.produk_id, c.qty + 1)}
                  disabled={c.qty >= c.maxQty}
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-green-100 text-gray-600 font-bold flex items-center justify-center text-sm disabled:opacity-30">+</button>
              </div>
              <div className="text-xs font-semibold text-gray-700 w-16 text-right">{rp(c.subtotal)}</div>
            </div>
          ))}
        </div>

        <div className="border-t px-4 py-4 space-y-3">
          {/* Total */}
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-700">TOTAL</span>
            <span className="text-2xl font-bold text-green-700">{rp(total)}</span>
          </div>

          {/* Metode bayar */}
          <div className="flex gap-2">
            {METODE.map(m => (
              <button key={m} onClick={() => setMetodeBayar(m)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${
                  metodeBayar === m ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 border-gray-200 hover:border-blue-400'
                }`}>
                {METODE_LABEL[m]}
              </button>
            ))}
          </div>

          {/* Uang diterima (TUNAI only) */}
          {metodeBayar === 'tunai' && total > 0 && (
            <div>
              <input type="number" min={total} placeholder="Uang diterima (Rp)"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={uangDiterima} onChange={e => setUangDiterima(e.target.value)} />
              {kembalian !== null && (
                <div className={`mt-1 text-sm font-semibold ${kembalian >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {kembalian >= 0 ? `Kembalian: ${rp(kembalian)}` : 'Uang kurang!'}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {cart.length > 0 && (
              <button onClick={() => setCart([])}
                className="px-3 py-2 border rounded-lg text-sm text-red-500 hover:bg-red-50">
                Hapus
              </button>
            )}
            <button onClick={checkout} disabled={loading || !cart.length || (metodeBayar === 'tunai' && kembalian !== null && kembalian < 0)}
              className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-40">
              {loading ? 'Proses...' : 'CHECKOUT'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
