import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from helper import (
    baca_csv, tulis_csv, cari_produk, tanggal_hari_ini, jam_sekarang,
    ok, err, baca_request, STOK_HEADERS, PRICE_HIST_HEADERS, DATA_DIR,
)

BASE_FILE    = os.path.join(DATA_DIR, 'base-patterns.json')
REGISTRY_FILE = os.path.join(DATA_DIR, 'skill-registry.json')


def _n(val, default=0):
    try: return int(float(str(val).strip())) if str(val).strip() else default
    except: return default


def _load_json(path, default=None):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


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


def aksi_estimasi(params):
    """Estimasi harga jual ideal: harga beli × margin + perbandingan referensi pasar."""
    nama = params.get('produk', '')
    harga_beli_baru = params.get('harga_beli_baru')

    stok = baca_csv('stok.csv')
    item = cari_produk(nama, stok)
    if not item:
        return err('Produk tidak ditemukan')

    harga_beli = _n(harga_beli_baru) if harga_beli_baru else _n(item.get('harga_beli', 0))
    harga_jual_kini = _n(item.get('harga_jual', 0))

    if harga_beli == 0:
        return err('Harga beli belum tersedia untuk estimasi')

    # Estimasi dari harga beli dengan berbagai margin
    margin_10 = int(harga_beli * 1.10)
    margin_15 = int(harga_beli * 1.15)
    margin_20 = int(harga_beli * 1.20)
    margin_25 = int(harga_beli * 1.25)

    # Cek referensi pasar dari base-patterns.json
    base = _load_json(BASE_FILE)
    refs = base.get('harga_referensi', {})
    key = item['nama'].lower()
    ref = refs.get(key)
    if not ref:
        for k, v in refs.items():
            if key in k or k in key.split()[0]:
                ref = v
                break

    saran_harga = margin_15  # default
    saran_alasan = 'Margin 15% dari harga beli'

    if ref:
        pasar_mid = (ref['min'] + ref['max']) // 2
        if pasar_mid > margin_15:
            saran_harga = pasar_mid
            saran_alasan = f'Rata-rata pasar Rp{pasar_mid:,}'
        elif pasar_mid < margin_10:
            saran_harga = margin_10
            saran_alasan = 'Margin minimum 10% (pasar lebih murah)'
        else:
            saran_harga = pasar_mid
            saran_alasan = f'Referensi pasar Rp{ref["min"]:,}–Rp{ref["max"]:,}'

    ok({
        'produk'       : item['nama'],
        'harga_beli'   : harga_beli,
        'harga_jual_kini': harga_jual_kini,
        'estimasi': {
            'margin_10pct': margin_10,
            'margin_15pct': margin_15,
            'margin_20pct': margin_20,
            'margin_25pct': margin_25,
        },
        'saran_harga'  : saran_harga,
        'saran_alasan' : saran_alasan,
        'ada_referensi_pasar': ref is not None,
        'referensi_pasar': ref,
    })


def aksi_prediksi(params):
    """Prediksi tren harga berdasarkan riwayat perubahan price-history.csv."""
    nama = params.get('produk', '')

    stok = baca_csv('stok.csv')
    item = cari_produk(nama, stok)
    if not item:
        return err('Produk tidak ditemukan')

    hist = baca_csv('price-history.csv')
    riwayat = [
        h for h in hist
        if h.get('produk_id') == item['id'] or
           cari_produk(nama, [{'nama': h.get('nama_produk', ''), 'id': h.get('produk_id', '')}])
    ]
    riwayat.sort(key=lambda h: h.get('tanggal', ''))

    if len(riwayat) < 2:
        return ok({
            'produk'   : item['nama'],
            'tren'     : 'tidak_cukup_data',
            'pesan'    : f'Butuh minimal 2 riwayat perubahan harga. Saat ini: {len(riwayat)}',
            'harga_kini': _n(item.get('harga_beli', 0)),
        })

    # Hitung rata-rata kenaikan per periode
    perubahan = []
    for i in range(1, len(riwayat)):
        lama = _n(riwayat[i - 1].get('harga_baru', 0))
        baru = _n(riwayat[i].get('harga_baru', 0))
        if lama > 0:
            perubahan.append((baru - lama) / lama * 100)

    avg_perubahan = sum(perubahan) / len(perubahan) if perubahan else 0
    harga_kini = _n(riwayat[-1].get('harga_baru', item.get('harga_beli', 0)))

    if avg_perubahan > 2:
        tren = 'naik'
        proyeksi_7hari = int(harga_kini * (1 + avg_perubahan / 100))
    elif avg_perubahan < -2:
        tren = 'turun'
        proyeksi_7hari = int(harga_kini * (1 + avg_perubahan / 100))
    else:
        tren = 'stabil'
        proyeksi_7hari = harga_kini

    ok({
        'produk'        : item['nama'],
        'tren'          : tren,
        'avg_perubahan_pct': round(avg_perubahan, 2),
        'harga_kini'    : harga_kini,
        'proyeksi_7hari': proyeksi_7hari,
        'jumlah_riwayat': len(riwayat),
        'riwayat_terakhir': riwayat[-3:],
    })


def aksi_daftar_skill(params):
    """Tampilkan skill terdaftar di registry yang berkaitan dengan harga."""
    registry = _load_json(REGISTRY_FILE)
    kategori = registry.get('kategori', {}).get('perkiraan_harga', {})
    skills = kategori.get('skills', [])
    hasil = []
    for s in skills:
        aksi_list = [a['nama'] for a in s.get('aksi', s.get('fungsi', []))]
        hasil.append({'skill': s['nama'], 'tipe': s['tipe'], 'aksi': aksi_list})
    ok({'skills_harga': hasil, 'intent_signal': registry.get('intent_signal', {})})


AKSI = {
    'cek'          : aksi_cek,
    'update'       : aksi_update,
    'estimasi'     : aksi_estimasi,
    'prediksi'     : aksi_prediksi,
    'daftar_skill' : aksi_daftar_skill,
}

if __name__ == '__main__':
    req = baca_request()
    aksi = req.get('action', '')
    handler = AKSI.get(aksi)
    if handler:
        handler(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {aksi}')
