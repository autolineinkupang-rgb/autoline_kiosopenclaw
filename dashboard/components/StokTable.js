'use client';

export default function StokTable({ data }) {
  if (!data?.length) return <p className="text-gray-400 text-sm">Tidak ada data stok.</p>;

  function badgeStok(stok, kritis, minimum) {
    const s = Number(stok), k = Number(kritis), m = Number(minimum);
    if (s <= k) return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">🔴 Kritis</span>;
    if (s <= m) return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">🟡 Rendah</span>;
    return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">✅ Aman</span>;
  }

  function formatRp(n) {
    return 'Rp ' + Number(n).toLocaleString('id-ID');
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-500 border-b">
          <tr>
            <th className="py-2 pr-4">Produk</th>
            <th className="py-2 pr-4">Kategori</th>
            <th className="py-2 pr-4 text-right">Stok</th>
            <th className="py-2 pr-4 text-right">Harga Jual</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map(item => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="py-2 pr-4 font-medium">{item.nama}</td>
              <td className="py-2 pr-4 text-gray-500 capitalize">{item.kategori}</td>
              <td className="py-2 pr-4 text-right font-mono">{item.stok} {item.satuan}</td>
              <td className="py-2 pr-4 text-right text-green-700">{formatRp(item.harga_jual)}</td>
              <td className="py-2">{badgeStok(item.stok, item.stok_kritis, item.stok_minimum)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
