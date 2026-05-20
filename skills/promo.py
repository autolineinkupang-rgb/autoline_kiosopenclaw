import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from helper import baca_csv, tanggal_hari_ini, ok, err, baca_request, DATA_DIR

PROMO_FILE = os.path.join(DATA_DIR, 'promo.json')


def _load():
    try:
        with open(PROMO_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {'promos': []}


def _save(data):
    with open(PROMO_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _aktif(promo):
    if not promo.get('aktif'):
        return False
    hari = tanggal_hari_ini()
    if promo.get('selesai') and promo['selesai'] < hari:
        return False
    if promo.get('mulai') and promo['mulai'] > hari:
        return False
    return True


def aksi_buat(params):
    produk = str(params.get('produk', '')).strip()
    tipe = str(params.get('tipe', 'persen')).strip()  # persen / fixed
    nilai = float(params.get('nilai', 0))

    if not produk or nilai <= 0:
        return err('produk dan nilai diskon wajib diisi')
    if tipe not in ('persen', 'fixed'):
        return err('tipe harus "persen" atau "fixed"')

    # Cek produk ada di stok
    stok = baca_csv('stok.csv')
    from helper import cari_produk
    item = cari_produk(produk, stok)
    if not item:
        return err(f'Produk "{produk}" tidak ditemukan di stok')

    data = _load()
    # Nonaktifkan promo lama produk yang sama
    for p in data['promos']:
        if p.get('produk_id') == item['id']:
            p['aktif'] = False

    max_id = max(
        (int(p['id'].replace('PROMO-', '')) for p in data['promos'] if p.get('id', '').startswith('PROMO-')),
        default=0,
    )
    promo_baru = {
        'id': f"PROMO-{str(max_id + 1).zfill(4)}",
        'produk': item['nama'],
        'produk_id': item['id'],
        'tipe': tipe,
        'nilai': nilai,
        'min_qty': int(params.get('min_qty', 1)),
        'aktif': True,
        'mulai': str(params.get('mulai', tanggal_hari_ini())),
        'selesai': str(params.get('selesai', '')) or None,
        'catatan': str(params.get('catatan', '')),
    }
    data['promos'].append(promo_baru)
    _save(data)
    ok({'promo': promo_baru, 'produk': item})


def aksi_cek(params):
    produk = str(params.get('produk', '')).strip()
    qty = int(params.get('qty', 1))
    harga_jual = int(params.get('harga_jual', 0))

    stok = baca_csv('stok.csv')
    from helper import cari_produk
    item = cari_produk(produk, stok)
    if not item:
        return ok({'promo': None, 'diskon': 0, 'harga_final': harga_jual})

    data = _load()
    promo = next(
        (p for p in data['promos']
         if p.get('produk_id') == item['id'] and _aktif(p) and qty >= p.get('min_qty', 1)),
        None,
    )
    if not promo:
        return ok({'promo': None, 'diskon': 0, 'harga_final': harga_jual})

    harga = harga_jual or int(float(item.get('harga_jual', 0)))
    if promo['tipe'] == 'persen':
        diskon = int(harga * promo['nilai'] / 100)
    else:
        diskon = int(promo['nilai'])

    ok({'promo': promo, 'diskon': diskon, 'harga_final': max(0, harga - diskon)})


def aksi_daftar(params):
    data = _load()
    aktif_only = params.get('aktif_only', False)
    promos = [p for p in data['promos'] if _aktif(p)] if aktif_only else data['promos']
    ok({'promos': promos, 'total': len(promos)})


def aksi_hapus(params):
    promo_id = str(params.get('id', '')).strip().upper()
    data = _load()
    promo = next((p for p in data['promos'] if p['id'] == promo_id), None)
    if not promo:
        return err(f'Promo {promo_id} tidak ditemukan')
    promo['aktif'] = False
    _save(data)
    ok({'promo': promo})


AKSI = {
    'buat': aksi_buat,
    'cek': aksi_cek,
    'daftar': aksi_daftar,
    'hapus': aksi_hapus,
}

if __name__ == '__main__':
    req = baca_request()
    handler = AKSI.get(req.get('action', ''))
    if handler:
        handler(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {req.get("action")}')
