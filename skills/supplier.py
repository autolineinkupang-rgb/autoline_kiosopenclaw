import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from helper import baca_csv, tulis_csv, tanggal_hari_ini, ok, err, baca_request, DATA_DIR

SUPPLIER_HEADERS = ['id', 'nama', 'kontak', 'alamat', 'produk_utama', 'catatan']
SUPPLIER_FILE = 'supplier.csv'


def _cari(nama, data):
    q = nama.lower().strip()
    return next(
        (s for s in data if q in s['nama'].lower() or s['id'].lower() == q),
        None,
    )


def aksi_tambah(params):
    nama = str(params.get('nama', '')).strip()
    if not nama:
        return err('Nama supplier wajib diisi')

    data = baca_csv(SUPPLIER_FILE)
    if _cari(nama, data):
        return err(f'Supplier "{nama}" sudah terdaftar kak')

    max_id = max(
        (int(s['id'].replace('SUP-', '')) for s in data if s.get('id', '').startswith('SUP-')),
        default=0,
    )
    baru = {
        'id': f"SUP-{str(max_id + 1).zfill(3)}",
        'nama': nama,
        'kontak': str(params.get('kontak', '')).strip(),
        'alamat': str(params.get('alamat', '')).strip(),
        'produk_utama': str(params.get('produk_utama', '')).strip(),
        'catatan': str(params.get('catatan', '')).strip(),
    }
    data.append(baru)
    tulis_csv(SUPPLIER_FILE, data, SUPPLIER_HEADERS)
    ok({'supplier': baru})


def aksi_daftar(params):
    data = baca_csv(SUPPLIER_FILE)
    ok({'suppliers': data, 'total': len(data)})


def aksi_cari(params):
    nama = params.get('nama', '')
    data = baca_csv(SUPPLIER_FILE)
    item = _cari(nama, data)
    if not item:
        return err(f'Supplier "{nama}" tidak ditemukan')

    # Ambil produk yang di-supply (dari stok.csv)
    from helper import baca_csv as bc
    stok = bc('stok.csv')
    produk = [s['nama'] for s in stok if s.get('supplier', '').lower() == item['nama'].lower()]
    ok({'supplier': item, 'produk_supplied': produk})


def aksi_hapus(params):
    nama = params.get('nama', '')
    data = baca_csv(SUPPLIER_FILE)
    item = _cari(nama, data)
    if not item:
        return err(f'Supplier "{nama}" tidak ditemukan')
    data_baru = [s for s in data if s['id'] != item['id']]
    tulis_csv(SUPPLIER_FILE, data_baru, SUPPLIER_HEADERS)
    ok({'supplier': item})


AKSI = {
    'tambah': aksi_tambah,
    'daftar': aksi_daftar,
    'cari': aksi_cari,
    'hapus': aksi_hapus,
}

if __name__ == '__main__':
    req = baca_request()
    handler = AKSI.get(req.get('action', ''))
    if handler:
        handler(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {req.get("action")}')
