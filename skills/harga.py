import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from helper import (
    baca_csv, tulis_csv, cari_produk, tanggal_hari_ini, jam_sekarang,
    ok, err, baca_request, STOK_HEADERS, PRICE_HIST_HEADERS,
)


def aksi_cek(params):
    nama = params.get('produk', '')
    stok = baca_csv('stok.csv')
    item = cari_produk(nama, stok)
    if not item:
        return err('Produk tidak ditemukan')
    ok({'item': item})


def aksi_update(params):
    nama = params.get('produk', '')
    harga_jual = params.get('harga_jual')
    harga_beli = params.get('harga_beli')

    if harga_jual is None:
        return err('harga_jual wajib diisi')

    stok = baca_csv('stok.csv')
    item = cari_produk(nama, stok)
    if not item:
        return err('Produk tidak ditemukan')

    tanggal = tanggal_hari_ini()
    stok_baru = []
    for s in stok:
        if s['id'] == item['id']:
            updated = {**s, 'harga_jual': str(int(float(harga_jual))), 'last_update': tanggal}
            if harga_beli is not None:
                updated['harga_beli'] = str(int(float(harga_beli)))
            stok_baru.append(updated)
        else:
            stok_baru.append(s)
    tulis_csv('stok.csv', stok_baru, STOK_HEADERS)

    item_updated = next(s for s in stok_baru if s['id'] == item['id'])

    # Log perubahan harga jual ke price-history
    harga_lama_jual = int(float(item.get('harga_jual', 0)))
    harga_baru_jual = int(float(harga_jual))
    if harga_baru_jual != harga_lama_jual:
        hist = baca_csv('price-history.csv')
        max_id = max(
            (int(r['id'].replace('PHG-', '')) for r in hist if r.get('id', '').startswith('PHG-')),
            default=0,
        )
        hist.append({
            'id': f"PHG-{str(max_id + 1).zfill(4)}",
            'tanggal': tanggal_hari_ini(), 'jam': jam_sekarang(),
            'produk_id': item['id'], 'nama_produk': item['nama'],
            'harga_lama': str(harga_lama_jual), 'harga_baru': str(harga_baru_jual),
            'selisih': str(harga_baru_jual - harga_lama_jual),
            'supplier': '', 'kasir': 'signal-bot',
        })
        tulis_csv('price-history.csv', hist, PRICE_HIST_HEADERS)

    ok({'item': item_updated})


AKSI = {
    'cek': aksi_cek,
    'update': aksi_update,
}

if __name__ == '__main__':
    req = baca_request()
    aksi = req.get('action', '')
    handler = AKSI.get(aksi)
    if handler:
        handler(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {aksi}')
