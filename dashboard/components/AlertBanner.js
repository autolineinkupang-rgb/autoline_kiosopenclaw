'use client';

export default function AlertBanner({ tipe, pesan, items }) {
  const isKritis = tipe === 'kritis';
  return (
    <div className={`rounded-xl border p-4 ${isKritis ? 'bg-red-50 border-red-300' : 'bg-yellow-50 border-yellow-300'}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl">{isKritis ? '🚨' : '⚠️'}</span>
        <div>
          <p className={`font-semibold ${isKritis ? 'text-red-700' : 'text-yellow-700'}`}>{pesan}</p>
          {items?.length > 0 && (
            <ul className="mt-1 text-sm text-gray-600 list-disc list-inside">
              {items.slice(0, 5).map(item => (
                <li key={item.id}>{item.nama} — sisa {item.stok} {item.satuan}</li>
              ))}
              {items.length > 5 && <li>...dan {items.length - 5} produk lainnya</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
