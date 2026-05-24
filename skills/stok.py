import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from event_emit import emit as bus_emit


def _n(val, default=0):
    """Konversi aman ke int — handle None, '', string kosong."""
    try:
        s = str(val).strip()
        return int(float(s)) if s else default
    except (ValueError, TypeError):
        return default

from helper import (
    baca_csv, tulis_csv, cari_produk, tanggal_hari_ini, jam_sekarang,
    ok, err, baca_request, STOK_HEADERS, TX_HEADERS, PEM_HEADERS, PRICE_HIST_HEADERS, DATA_DIR,
)


def aksi_cek(params):
    ok({'stok': baca_csv('stok.csv')})


def aksi_cari(params):
    stok = baca_csv('stok.csv')
    item = cari_produk(params.get('produk', ''), stok)
    if not item:
        return err('Produk tidak ditemukan')
    ok({'item': item})


def aksi_exp(params):
    ok({'stok': baca_csv('stok.csv')})


def aksi_jual(params):
    nama = params.get('produk', '')
    qty = _n(params.get('qty'), 0)
    metode = params.get('metode', 'tunai')
    if qty <= 0:
        return err('Jumlah jual harus lebih dari 0')

    stok = baca_csv('stok.csv')
    item = cari_produk(nama, stok)
    if not item:
        return err('Produk tidak ditemukan')

    sisa = _n(item['stok'])
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
    total = qty * _n(item['harga_jual'])
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
    sisa_akhir = sisa - qty
    kritis_val = _n(item.get('stok_kritis', 2))
    if sisa_akhir <= 0:
        bus_emit('stok:habis', {'produk': item['nama']})
    elif sisa_akhir <= kritis_val:
        bus_emit('stok:kritis', {'produk': item['nama'], 'stok': sisa_akhir, 'kritis': kritis_val})
    ok({'item': item, 'qty': qty, 'total': total, 'sisa': sisa_akhir, 'metode': metode, 'txId': tx['id'], 'id': tx['id']})


def _catat_perubahan_harga(item, harga_lama, harga_baru, supplier):
    """Simpan audit trail perubahan harga beli ke price-history.csv."""
    hist = baca_csv('price-history.csv')
    max_id = max(
        (int(r['id'].replace('PHG-', '')) for r in hist if r.get('id', '').startswith('PHG-')),
        default=0,
    )
    hist.append({
        'id': f"PHG-{str(max_id + 1).zfill(4)}",
        'tanggal': tanggal_hari_ini(), 'jam': jam_sekarang(),
        'produk_id': item['id'], 'nama_produk': item['nama'],
        'harga_lama': str(harga_lama), 'harga_baru': str(harga_baru),
        'selisih': str(harga_baru - harga_lama),
        'supplier': supplier or item.get('supplier', ''),
        'kasir': 'signal-bot',
    })
    tulis_csv('price-history.csv', hist, PRICE_HIST_HEADERS)


def _auto_buat_produk(nama, harga_beli, qty_awal, supplier):
    """Buat produk baru otomatis dari data restock."""
    stok = baca_csv('stok.csv')
    max_id = max(
        (int(s['id']) for s in stok if s.get('id', '').isdigit()),
        default=0,
    )
    margin = 1.15  # 15% margin default
    harga_jual = int(harga_beli * margin) if harga_beli > 0 else 0
    return {
        'id': str(max_id + 1).zfill(3),
        'nama': nama.strip(),
        'kategori': 'umum',
        'satuan': 'pcs',
        'stok': str(qty_awal),
        'harga_beli': str(harga_beli),
        'harga_jual': str(harga_jual),
        'stok_minimum': '5',
        'stok_kritis': '2',
        'supplier': supplier or '',
        'last_update': tanggal_hari_ini(),
        'has_exp': '0',
        'exp_date': '',
    }


def aksi_tambah(params):
    nama = params.get('produk', '')
    qty = _n(params.get('qty'), 0)
    harga_beli = _n(params.get('harga'), 0)
    supplier = str(params.get('supplier', '')).strip()
    auto_create = params.get('auto_create', False)
    if qty <= 0:
        return err('Jumlah restock harus lebih dari 0')
    if harga_beli < 0:
        return err('Harga beli tidak boleh negatif')

    stok = baca_csv('stok.csv')
    item = cari_produk(nama, stok)

    # Auto-create jika produk belum ada
    if not item:
        if not auto_create:
            return err(f'Produk "{nama}" tidak ditemukan. Daftarkan dulu atau gunakan auto_create.')
        produk_baru = _auto_buat_produk(nama, harga_beli, qty, supplier)
        stok.append(produk_baru)
        tulis_csv('stok.csv', stok, STOK_HEADERS)
        # Catat ke pembelian
        pem_data = baca_csv('pembelian.csv')
        max_pem = max(
            (int(r['id'].replace('PEM-', '')) for r in pem_data if r.get('id', '').startswith('PEM-')),
            default=0,
        )
        pem_data.append({
            'id': f"PEM-{str(max_pem + 1).zfill(4)}",
            'session_id': '', 'tanggal': tanggal_hari_ini(), 'jam': jam_sekarang(),
            'produk_id': produk_baru['id'], 'nama_produk': produk_baru['nama'],
            'qty': str(qty), 'harga_beli': str(harga_beli),
            'subtotal': str(qty * harga_beli),
            'supplier': supplier or '', 'kasir': 'signal-bot', 'catatan': 'auto-create',
        })
        tulis_csv('pembelian.csv', pem_data, PEM_HEADERS)
        return ok({
            'item': produk_baru, 'qty': qty, 'harga_beli': harga_beli,
            'stok_baru': produk_baru['stok'], 'auto_created': True,
            'price_changed': False, 'harga_lama': harga_beli, 'supplier': supplier,
        })

    # Cek perubahan harga beli
    harga_lama = _n(item.get('harga_beli'), 0)
    price_changed = harga_beli > 0 and harga_beli != harga_lama
    if price_changed:
        _catat_perubahan_harga(item, harga_lama, harga_beli, supplier)

    stok_lama = _n(item['stok'])
    tanggal = tanggal_hari_ini()
    stok_baru = []
    for s in stok:
        if s['id'] == item['id']:
            updated = {**s, 'stok': str(stok_lama + qty), 'last_update': tanggal}
            if harga_beli > 0:
                updated['harga_beli'] = str(harga_beli)
            if supplier:
                updated['supplier'] = supplier
            stok_baru.append(updated)
        else:
            stok_baru.append(s)
    tulis_csv('stok.csv', stok_baru, STOK_HEADERS)

    pem_data = baca_csv('pembelian.csv')
    max_pem = max(
        (int(r['id'].replace('PEM-', '')) for r in pem_data if r.get('id', '').startswith('PEM-')),
        default=0,
    )
    pem_data.append({
        'id': f"PEM-{str(max_pem + 1).zfill(4)}",
        'session_id': '', 'tanggal': tanggal, 'jam': jam_sekarang(),
        'produk_id': item['id'], 'nama_produk': item['nama'],
        'qty': str(qty), 'harga_beli': str(harga_beli),
        'subtotal': str(qty * harga_beli),
        'supplier': supplier or item.get('supplier', ''),
        'kasir': 'signal-bot', 'catatan': '',
    })
    tulis_csv('pembelian.csv', pem_data, PEM_HEADERS)

    stok_item_baru = next(s for s in stok_baru if s['id'] == item['id'])
    ok({
        'item': item, 'qty': qty, 'harga_beli': harga_beli,
        'stok_baru': stok_item_baru['stok'],
        'price_changed': price_changed,
        'harga_lama': harga_lama,
        'supplier': supplier or item.get('supplier', ''),
        'auto_created': False,
    })


def aksi_tambah_produk(params):
    stok = baca_csv('stok.csv')
    max_id = max(
        (int(s['id']) for s in stok if s.get('id', '').isdigit()),
        default=0,
    )
    new_id = str(max_id + 1).zfill(3)
    exp_raw = str(params.get('exp_date', '')).strip()
    has_exp = '1' if exp_raw else '0'

    produk_baru = {
        'id': new_id,
        'nama': str(params.get('nama', '')).strip(),
        'kategori': str(params.get('kategori', 'umum')).strip(),
        'satuan': str(params.get('satuan', 'pcs')).strip(),
        'stok': str(_n(params.get('stok'), 0)),
        'harga_beli': str(_n(params.get('harga_beli'), 0)),
        'harga_jual': str(_n(params.get('harga_jual'), 0)),
        'stok_minimum': str(_n(params.get('stok_minimum'), 5)),
        'stok_kritis': str(_n(params.get('stok_kritis'), 2)),
        'supplier': str(params.get('supplier', '')).strip(),
        'last_update': tanggal_hari_ini(),
        'has_exp': has_exp,
        'exp_date': exp_raw,
    }

    if not produk_baru['nama']:
        return err('Nama produk wajib diisi')
    if int(produk_baru['harga_jual']) == 0:
        return err('Harga jual wajib diisi')
    if int(produk_baru['stok']) < 0:
        return err('Stok awal tidak boleh negatif')

    stok.append(produk_baru)
    tulis_csv('stok.csv', stok, STOK_HEADERS)
    ok({'produk': produk_baru})


def aksi_hapus(params):
    nama = params.get('produk', '')
    stok = baca_csv('stok.csv')
    item = cari_produk(nama, stok)
    if not item:
        return err('Produk tidak ditemukan')
    stok_baru = [s for s in stok if s['id'] != item['id']]
    tulis_csv('stok.csv', stok_baru, STOK_HEADERS)
    ok({'item': item})


def aksi_update_exp(params):
    nama = params.get('produk', '')
    exp_date = str(params.get('exp_date', '')).strip()
    if not exp_date:
        return err('exp_date wajib diisi')

    stok = baca_csv('stok.csv')
    item = cari_produk(nama, stok)
    if not item:
        return err('Produk tidak ditemukan')

    stok_baru = [
        {**s, 'has_exp': '1', 'exp_date': exp_date, 'last_update': tanggal_hari_ini()}
        if s['id'] == item['id'] else s
        for s in stok
    ]
    tulis_csv('stok.csv', stok_baru, STOK_HEADERS)
    ok({'item': next(s for s in stok_baru if s['id'] == item['id'])})


def aksi_set_stok(params):
    nama = params.get('produk', '')
    stok_baru_val = _n(params.get('stok_baru'), 0)
    if stok_baru_val < 0:
        return err('Stok baru tidak boleh negatif')

    stok = baca_csv('stok.csv')
    item = cari_produk(nama, stok)
    if not item:
        return err('Produk tidak ditemukan')

    stok_lama = _n(item['stok'])
    stok_updated = [
        {**s, 'stok': str(stok_baru_val), 'last_update': tanggal_hari_ini()}
        if s['id'] == item['id'] else s
        for s in stok
    ]
    tulis_csv('stok.csv', stok_updated, STOK_HEADERS)
    ok({'item': item, 'stok_lama': stok_lama, 'stok_baru': stok_baru_val})


def aksi_batalkan_tx(params):
    tx_id = str(params.get('id', '')).strip().upper()
    if not tx_id:
        return err('ID transaksi wajib diisi')

    tx_data = baca_csv('transaksi.csv')
    tx = next((t for t in tx_data if t['id'].upper() == tx_id), None)
    if not tx:
        return err(f'Transaksi {tx_id} tidak ditemukan')

    # Kembalikan stok
    stok = baca_csv('stok.csv')
    produk = next((s for s in stok if s['id'] == tx['produk_id']), None)
    if produk:
        qty_kembali = _n(tx['qty'])
        stok_updated = [
            {**s, 'stok': str(_n(s['stok']) + qty_kembali), 'last_update': tanggal_hari_ini()}
            if s['id'] == tx['produk_id'] else s
            for s in stok
        ]
        tulis_csv('stok.csv', stok_updated, STOK_HEADERS)

    # Hapus transaksi
    tx_baru = [t for t in tx_data if t['id'].upper() != tx_id]
    tulis_csv('transaksi.csv', tx_baru, TX_HEADERS)
    ok({'tx': tx})


def aksi_stok_menipis(params):
    """Return semua produk dengan stok <= stok_minimum."""
    stok = baca_csv('stok.csv')
    menipis = [
        {**s, 'qty_dibutuhkan': max(0, _n(s.get('stok_minimum', 5)) * 3 - _n(s['stok']))}
        for s in stok
        if _n(s.get('stok', 0)) <= _n(s.get('stok_minimum', 5))
    ]
    ok({'menipis': menipis})


AKSI = {
    'cek': aksi_cek,
    'cari': aksi_cari,
    'exp': aksi_exp,
    'jual': aksi_jual,
    'tambah': aksi_tambah,
    'tambah_produk': aksi_tambah_produk,
    'hapus': aksi_hapus,
    'update_exp': aksi_update_exp,
    'set_stok': aksi_set_stok,
    'batalkan_tx': aksi_batalkan_tx,
    'stok_menipis': aksi_stok_menipis,
}

if __name__ == '__main__':
    req = baca_request()
    aksi = req.get('action', '')
    handler = AKSI.get(aksi)
    if handler:
        handler(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {aksi}')
