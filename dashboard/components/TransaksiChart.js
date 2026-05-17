'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';

export default function TransaksiChart({ data }) {
  if (!data?.length) return (
    <div className="h-40 flex items-center justify-center text-gray-400 text-sm">
      Belum ada transaksi hari ini
    </div>
  );

  // Group by tanggal, ambil 7 hari terakhir
  const grouped = {};
  data.forEach(tx => {
    const tgl = tx.tanggal || 'unknown';
    if (!grouped[tgl]) grouped[tgl] = { tanggal: tgl, omzet: 0, jumlah: 0 };
    grouped[tgl].omzet += Number(tx.total || 0);
    grouped[tgl].jumlah += 1;
  });

  const chartData = Object.values(grouped)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
    .slice(-7)
    .map(d => ({ ...d, label: dayjs(d.tanggal).format('DD/MM') }));

  const formatRp = (v) => 'Rp ' + (v / 1000).toFixed(0) + 'rb';

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={formatRp} tick={{ fontSize: 10 }} />
        <Tooltip
          formatter={(v) => ['Rp ' + Number(v).toLocaleString('id-ID'), 'Omzet']}
          labelStyle={{ fontWeight: 'bold' }}
        />
        <Bar dataKey="omzet" fill="#16a34a" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
