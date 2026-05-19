import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from helper import (
    baca_csv, tulis_csv, cari_produk, tanggal_hari_ini, jam_sekarang,
    ok, err, baca_request, STOK_HEADERS, TX_HEADERS, PEM_HEADERS, DATA_DIR,
)


def aksi_cek(params):
    ok({'stok': baca_csv('stok.csv')})


def aksi_cari(params):
    nama = params.get('produk', '')
    stok = baca_csv('stok.csv')
    item = cari_produk(nama, stok)
    if not item:
        return err('Produk tidak ditemukan')
    ok({'item': item})


def aksi_exp(params):
    ok({'stok': baca_csv('stok.csv')})


def aksi_jual(params):
    nama = params.get('produk', '')
    qty = int(params.get('qty', 0))
    metode = params.get('metode', 'tunai')

    stok = baca_csv('stok.csv')
    item = cari_produk(nama, stok)
    if not item:
        return err('Produk tidak ditemukan')

    sisa = int(item['stok'])
    if sisa < qty:
        return err(f'Stok tidak cukup (ada: {sisa})')

    tanggal = tanggal_hari_ini()
    stok_baru = [
        {**s, 'stok': str(sisa - qty), 'last_update': tanggal}
        if s['id'] == item['id'] else s
        for s in stok
    ]
    tulis_csv('stok.csv', stok_baru, STOK_HEADERS)

    tx_data = baca_csv('transaksi.csv')
    max_id = max(
        (int(r['id'].replace('TRX-', '')) for r in tx_data if r.get('id', '').startswith('TRX-')),
        default=0,
    )
    total = qty * int(float(item['harga_jual']))
    tx = {
        'id': f"TRX-{str(max_id + 1).zfill(4)}",
        'tanggal': tanggal, 'jam': jam_sekarang(),
        'produk_id': item['id'], 'nama_produk': item['nama'],
        'kategori': item['kategori'], 'qty': str(qty),
        'harga_satuan': item['harga_jual'], 'total': str(total),
        'metode_bayar': metode, 'kasir': 'signal-bot',
        'catatan': '', 'session_id': '',
    }
    tx_data.append(tx)
    tulis_csv('transaksi.csv', tx_data, TX_HEADERS)

    ok({'item': item, 'qty': qty, 'total': total, 'sisa': sisa - qty, 'metode': metode})


def aksi_tambah(params):
    nama = params.get('produk', '')
    qty = int(params.get('qty', 0))
    harga_beli = int(float(params.get('harga', 0)))

    stok = baca_csv('stok.csv')
    item = cari_produk(nama, stok)
    if not item:
        return err('Produk tidak ditemukan')

    stok_lama = int(item['stok'])
    tanggal = tanggal_hari_ini()
    stok_baru = []
    for s in stok:
        if s['id'] == item['id']:
            updated = {**s, 'stok': str(stok_lama + qty), 'last_update': tanggal}
            if harga_beli > 0:
                updated['harga_beli'] = str(harga_beli)
            stok_baru.append(updated)
        else:
            stok_baru.append(s)
    tulis_csv('stok.csv', stok_baru, STOK_HEADERS)

    pem_data = baca_csv('pembelian.csv')
    max_pem = max(
        (int(r['id'].replace('PEM-', '')) for r in pem_data if r.get('id', '').startswith('PEM-')),
        default=0,
    )
    pem = {
        'id': f"PEM-{str(max_pem + 1).zfill(4)}",
        'session_id': '', 'tanggal': tanggal, 'jam': jam_sekarang(),
        'produk_id': item['id'], 'nama_produk': item['nama'],
        'qty': str(qty), 'harga_beli': str(harga_beli),
        'subtotal': str(qty * harga_beli),
        'supplier': item.get('supplier', ''),
        'kasir': 'signal-bot', 'catatan': '',
    }
    pem_data.append(pem)
    tulis_csv('pembelian.csv', pem_data, PEM_HEADERS)

    stok_item_baru = next(s for s in stok_baru if s['id'] == item['id'])
    ok({'item': item, 'qty': qty, 'harga_beli': harga_beli, 'stok_baru': stok_item_baru['stok']})


AKSI = {
    'cek': aksi_cek,
    'cari': aksi_cari,
    'exp': aksi_exp,
    'jual': aksi_jual,
    'tambah': aksi_tambah,
}

if __name__ == '__main__':
    req = baca_request()
    aksi = req.get('action', '')
    handler = AKSI.get(aksi)
    if handler:
        handler(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {aksi}')
