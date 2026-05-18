'use client';

export default function StokTable({ data, onEdit, onDelete, showExpiry = false }) {
  if (!data?.length) return <p className="text-gray-400 text-sm">Tidak ada data stok.</p>;

  const today = new Date().toISOString().split('T')[0];
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  function badgeStok(s) {
    const num = Number(s.stok), k = Number(s.stok_kritis), m = Number(s.stok_minimum);
    if (num <= k) return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">Kritis</span>;
    if (num <= m) return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Rendah</span>;
    return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Aman</span>;
  }

  function expBadge(s) {
    if (s.has_exp !== '1' || !s.exp_date) return <span className="text-gray-300 text-xs">—</span>;
    if (s.exp_date <= today) return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">EXPIRED {s.exp_date}</span>;
    if (s.exp_date <= in7) return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">{s.exp_date} ⚠</span>;
    return <span className="text-xs text-gray-500">{s.exp_date}</span>;
  }

  function formatRp(n) { return 'Rp ' + Number(n).toLocaleString('id-ID'); }

  function handleDelete(item) {
    if (!confirm(`Hapus "${item.nama}"? Data tidak dapat dikembalikan.`)) return;
    onDelete(item.id);
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
            {showExpiry && <th className="py-2 pr-4">Exp Date</th>}
            <th className="py-2 pr-4">Status</th>
            {onEdit && <th className="py-2 text-right">Aksi</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map(item => (
            <tr key={item.id} className={`hover:bg-gray-50 ${item.has_exp === '1' && item.exp_date && item.exp_date <= today ? 'bg-red-50' : ''}`}>
              <td className="py-2 pr-4 font-medium">{item.nama}</td>
              <td className="py-2 pr-4 text-gray-500 capitalize">{item.kategori}</td>
              <td className="py-2 pr-4 text-right font-mono">{item.stok} {item.satuan}</td>
              <td className="py-2 pr-4 text-right text-green-700">{formatRp(item.harga_jual)}</td>
              {showExpiry && <td className="py-2 pr-4">{expBadge(item)}</td>}
              <td className="py-2 pr-4">{badgeStok(item)}</td>
              {onEdit && (
                <td className="py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => onEdit(item)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-medium">Edit</button>
                    <button onClick={() => handleDelete(item)} className="px-2 py-1 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100 font-medium">Hapus</button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
