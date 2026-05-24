import sys, os, json, re
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


def _norm(s):
    return str(s or '').strip().lower()


def _num(v, default=0):
    try:
        s = str(v or '').strip()
        return int(float(s)) if s else default
    except Exception:
        return default


def _supplier_detail(nama, suppliers):
    q = _norm(nama)
    if not q:
        return None
    return next((s for s in suppliers if _norm(s.get('nama')) == q or q in _norm(s.get('nama')) or _norm(s.get('nama')) in q), None)


def _catatan_meta(catatan):
    teks = str(catatan or '')
    moq = ''
    lead_time = ''
    m = re.search(r'(?i)(?:moq|min(?:imum)?(?:\s+order)?|minimal)\s*[:=]?\s*([0-9]+(?:\s+\w+)?)', teks)
    if m:
        moq = m.group(1).strip()
    l = re.search(r'(?i)(?:lead\s*time|estimasi|kirim|pengiriman)\s*[:=]?\s*([0-9]+(?:\s*[-–]\s*[0-9]+)?\s*(?:hari|jam|minggu))', teks)
    if l:
        lead_time = l.group(1).strip()
    return moq, lead_time


def aksi_banding_harga(params):
    produk = str(params.get('produk', '')).strip()
    if not produk:
        return err('Nama produk wajib diisi')

    stok = baca_csv('stok.csv')
    suppliers = baca_csv(SUPPLIER_FILE)
    pembelian = baca_csv('pembelian.csv')
    q = _norm(produk)

    item = next(
        (s for s in stok
         if _norm(s.get('id')) == q
         or q in _norm(s.get('nama'))
         or all(k in _norm(s.get('nama')) for k in q.split())),
        None,
    )
    produk_id = item.get('id', '') if item else ''
    nama_produk = item.get('nama', produk) if item else produk

    entries = {}

    def add_entry(nama_supplier, harga, source, tanggal='', qty='', subtotal='', item_ref=None):
        key = _norm(nama_supplier) or '(tanpa supplier)'
        harga_int = _num(harga)
        existing = entries.get(key)
        if existing:
            old_harga = _num(existing.get('harga_beli'))
            old_tgl = existing.get('tanggal', '')
            if (harga_int > 0 and (old_harga <= 0 or harga_int < old_harga)) or (harga_int == old_harga and tanggal > old_tgl):
                pass
            else:
                return

        detail = _supplier_detail(nama_supplier, suppliers) or {}
        moq, lead_time = _catatan_meta(detail.get('catatan', ''))
        entries[key] = {
            'supplier': nama_supplier or '(tanpa supplier)',
            'harga_beli': str(harga_int) if harga_int else '',
            'tanggal': tanggal,
            'qty': str(qty or ''),
            'subtotal': str(subtotal or ''),
            'source': source,
            'kontak': detail.get('kontak', ''),
            'alamat': detail.get('alamat', ''),
            'produk_utama': detail.get('produk_utama', ''),
            'catatan': detail.get('catatan', ''),
            'moq': moq,
            'lead_time': lead_time,
            'current_stock_supplier': bool(item_ref),
        }

    for p in pembelian:
        nama_beli = _norm(p.get('nama_produk'))
        cocok = (produk_id and p.get('produk_id') == produk_id) or q in nama_beli or all(k in nama_beli for k in q.split())
        if not cocok:
            continue
        add_entry(
            p.get('supplier', ''),
            p.get('harga_beli', ''),
            'pembelian',
            p.get('tanggal', ''),
            p.get('qty', ''),
            p.get('subtotal', ''),
        )

    if item and item.get('supplier'):
        add_entry(
            item.get('supplier', ''),
            item.get('harga_beli', ''),
            'stok',
            item.get('last_update', ''),
            '',
            '',
            item,
        )

    for s in suppliers:
        utama = _norm(s.get('produk_utama'))
        if utama and (q in utama or any(k in utama for k in q.split())):
            key = _norm(s.get('nama'))
            if key not in entries:
                moq, lead_time = _catatan_meta(s.get('catatan', ''))
                entries[key] = {
                    'supplier': s.get('nama', ''),
                    'harga_beli': '',
                    'tanggal': '',
                    'qty': '',
                    'subtotal': '',
                    'source': 'supplier',
                    'kontak': s.get('kontak', ''),
                    'alamat': s.get('alamat', ''),
                    'produk_utama': s.get('produk_utama', ''),
                    'catatan': s.get('catatan', ''),
                    'moq': moq,
                    'lead_time': lead_time,
                    'current_stock_supplier': False,
                }

    hasil = list(entries.values())
    hasil.sort(key=lambda x: (_num(x.get('harga_beli')) <= 0, _num(x.get('harga_beli')) or 10**12, x.get('supplier', '')))
    priced = [h for h in hasil if _num(h.get('harga_beli')) > 0]
    best = priced[0] if priced else None

    ok({
        'produk': nama_produk,
        'produk_id': produk_id,
        'harga_beli_kini': item.get('harga_beli', '') if item else '',
        'stok_kini': item.get('stok', '') if item else '',
        'satuan': item.get('satuan', '') if item else '',
        'suppliers': hasil,
        'best': best,
        'total_supplier': len(hasil),
        'total_harga': len(priced),
    })


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
    'banding_harga': aksi_banding_harga,
}

if __name__ == '__main__':
    req = baca_request()
    handler = AKSI.get(req.get('action', ''))
    if handler:
        handler(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {req.get("action")}')
