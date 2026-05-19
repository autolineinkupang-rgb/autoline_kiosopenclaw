import sys, os, json
from datetime import datetime, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from helper import baca_csv, ok, err, baca_request, DATA_DIR, ROOT


def hitung_ringkasan(tx_list, tanggal=None):
    if tanggal:
        tx_list = [t for t in tx_list if t.get('tanggal') == tanggal]
    omzet = sum(int(float(t.get('total', 0))) for t in tx_list)
    return {
        'total_transaksi': len(tx_list),
        'omzet': omzet,
    }


def top_produk(tx_list, n=3):
    dari_produk = {}
    for t in tx_list:
        nama = t.get('nama_produk', '-')
        dari_produk[nama] = dari_produk.get(nama, 0) + int(float(t.get('qty', 0)))
    sorted_items = sorted(dari_produk.items(), key=lambda x: -x[1])
    return [nama for nama, _ in sorted_items[:n]]


def stok_kritis_list():
    stok = baca_csv('stok.csv')
    return [s['nama'] for s in stok if int(s['stok']) <= int(s['stok_kritis'])]


def aksi_ringkas(params):
    tanggal = params.get('tanggal', datetime.now().strftime('%Y-%m-%d'))
    tx_data = baca_csv('transaksi.csv')
    ringkasan = hitung_ringkasan(tx_data, tanggal)
    top3 = top_produk([t for t in tx_data if t.get('tanggal') == tanggal])
    kritis = stok_kritis_list()
    ok({
        'sesi': 'Harian',
        'tanggal': datetime.strptime(tanggal, '%Y-%m-%d').strftime('%d/%m/%Y'),
        'omzet': ringkasan['omzet'],
        'totalTx': ringkasan['total_transaksi'],
        'top3': top3,
        'stokKritis': kritis,
    })


def aksi_mingguan(params):
    hari_ini = datetime.now()
    tujuh_hari = [(hari_ini - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(7)]
    tx_data = baca_csv('transaksi.csv')
    tx_minggu = [t for t in tx_data if t.get('tanggal') in tujuh_hari]
    ringkasan = hitung_ringkasan(tx_minggu)
    top3 = top_produk(tx_minggu)
    ok({
        'sesi': 'Mingguan',
        'tanggal': f"{tujuh_hari[-1]} s/d {tujuh_hari[0]}",
        'omzet': ringkasan['omzet'],
        'totalTx': ringkasan['total_transaksi'],
        'top3': top3,
        'stokKritis': stok_kritis_list(),
    })


AKSI = {
    'ringkas': aksi_ringkas,
    'mingguan': aksi_mingguan,
}

if __name__ == '__main__':
    req = baca_request()
    aksi = req.get('action', '')
    handler = AKSI.get(aksi)
    if handler:
        handler(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {aksi}')
