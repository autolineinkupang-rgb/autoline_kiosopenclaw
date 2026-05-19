import sys, os, json
from datetime import datetime, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from helper import baca_csv, ok, err, baca_request, DATA_DIR, ROOT


def _tx_periode(periode):
    """Kembalikan list tx sesuai periode: hari_ini / minggu / bulan."""
    tx_data = baca_csv('transaksi.csv')
    hari_ini = datetime.now().strftime('%Y-%m-%d')

    if periode == 'minggu':
        dates = {(datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(7)}
        return [t for t in tx_data if t.get('tanggal') in dates]
    if periode == 'bulan':
        bulan = datetime.now().strftime('%Y-%m')
        return [t for t in tx_data if t.get('tanggal', '').startswith(bulan)]
    # default: hari_ini
    return [t for t in tx_data if t.get('tanggal') == hari_ini]


def _hitung_laba(tx_list):
    """Hitung omzet, modal, laba dari daftar transaksi."""
    stok = baca_csv('stok.csv')
    harga_beli_map = {s['id']: int(float(s.get('harga_beli', 0))) for s in stok}

    omzet = sum(int(float(t.get('total', 0))) for t in tx_list)
    modal = sum(
        int(float(t.get('qty', 0))) * harga_beli_map.get(t.get('produk_id', ''), 0)
        for t in tx_list
    )
    return {'omzet': omzet, 'modal': modal, 'laba': omzet - modal}


def _top_produk(tx_list, n=3):
    dari = {}
    for t in tx_list:
        nama = t.get('nama_produk', '-')
        dari[nama] = dari.get(nama, 0) + int(float(t.get('qty', 0)))
    return [nama for nama, _ in sorted(dari.items(), key=lambda x: -x[1])[:n]]


def _stok_kritis_list():
    return [
        s['nama'] for s in baca_csv('stok.csv')
        if int(s['stok']) <= int(s['stok_kritis'])
    ]


def aksi_ringkas(params):
    tanggal = params.get('tanggal', datetime.now().strftime('%Y-%m-%d'))
    tx_data = baca_csv('transaksi.csv')
    hari = [t for t in tx_data if t.get('tanggal') == tanggal]
    laba = _hitung_laba(hari)
    ok({
        'sesi': 'Harian',
        'tanggal': datetime.strptime(tanggal, '%Y-%m-%d').strftime('%d/%m/%Y'),
        'omzet': laba['omzet'],
        'laba': laba['laba'],
        'totalTx': len(hari),
        'top3': _top_produk(hari),
        'stokKritis': _stok_kritis_list(),
    })


def aksi_mingguan(params):
    tx_list = _tx_periode('minggu')
    laba = _hitung_laba(tx_list)
    hari_ini = datetime.now()
    ok({
        'sesi': 'Mingguan',
        'tanggal': f"{(hari_ini - timedelta(days=6)).strftime('%d/%m')} s/d {hari_ini.strftime('%d/%m/%Y')}",
        'omzet': laba['omzet'],
        'laba': laba['laba'],
        'totalTx': len(tx_list),
        'top3': _top_produk(tx_list),
        'stokKritis': _stok_kritis_list(),
    })


def aksi_bulanan(params):
    tx_list = _tx_periode('bulan')
    laba = _hitung_laba(tx_list)
    ok({
        'sesi': 'Bulanan',
        'tanggal': datetime.now().strftime('%B %Y'),
        'omzet': laba['omzet'],
        'laba': laba['laba'],
        'totalTx': len(tx_list),
        'top3': _top_produk(tx_list),
        'stokKritis': _stok_kritis_list(),
    })


def aksi_laba(params):
    periode = params.get('periode', 'hari_ini')
    tx_list = _tx_periode(periode)
    laba = _hitung_laba(tx_list)
    label = {'hari_ini': 'Hari Ini', 'minggu': '7 Hari Terakhir', 'bulan': 'Bulan Ini'}.get(periode, periode)
    ok({'periode': label, 'totalTx': len(tx_list), **laba})


def aksi_riwayat(params):
    periode = params.get('periode', 'hari_ini')
    tx_list = _tx_periode(periode)
    label = {'hari_ini': 'Hari Ini', 'minggu': '7 Hari', 'bulan': 'Bulan Ini'}.get(periode, periode)
    ok({'periode': label, 'transaksi': tx_list[-20:]})  # max 20 terbaru


def aksi_terlaris(params):
    periode = params.get('periode', 'bulan')
    top_n = int(params.get('top', 10))
    tx_list = _tx_periode(periode)

    agg = {}
    for t in tx_list:
        nama = t.get('nama_produk', '-')
        qty = int(float(t.get('qty', 0)))
        total = int(float(t.get('total', 0)))
        if nama not in agg:
            agg[nama] = {'nama': nama, 'qty': 0, 'omzet': 0}
        agg[nama]['qty'] += qty
        agg[nama]['omzet'] += total

    sorted_produk = sorted(agg.values(), key=lambda x: -x['qty'])[:top_n]
    label = {'hari_ini': 'Hari Ini', 'minggu': '7 Hari Terakhir', 'bulan': 'Bulan Ini'}.get(periode, periode)
    ok({'periode': label, 'produk': sorted_produk, 'total_tx': len(tx_list)})


def aksi_riwayat_harga(params):
    produk = params.get('produk', '')
    hist = baca_csv('price-history.csv')
    if produk:
        q = produk.lower()
        hist = [h for h in hist if q in h.get('nama_produk', '').lower()]
    ok({'riwayat': hist[-20:], 'produk': produk})


AKSI = {
    'ringkas': aksi_ringkas,
    'mingguan': aksi_mingguan,
    'bulanan': aksi_bulanan,
    'laba': aksi_laba,
    'riwayat': aksi_riwayat,
    'terlaris': aksi_terlaris,
    'riwayat_harga': aksi_riwayat_harga,
}

if __name__ == '__main__':
    req = baca_request()
    aksi = req.get('action', '')
    handler = AKSI.get(aksi)
    if handler:
        handler(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {aksi}')
