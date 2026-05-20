"""
saran.py — PicaMan: generator saran otomatis untuk kios
- buat           : analisis data kios, buat saran (stok, harga, terlaris)
- daftar         : ambil saran yang belum terkirim
- tandai_terkirim: tandai saran sudah dikirim ke grup
"""
import sys, os, json, csv
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helper import ok, err, baca_request, DATA_DIR, format_rupiah

SARAN_FILE = os.path.join(DATA_DIR, 'openclaw-suggestions.json')
STOK_FILE  = os.path.join(DATA_DIR, 'stok.csv')
TX_FILE    = os.path.join(DATA_DIR, 'transaksi.csv')
KB_FILE    = os.path.join(DATA_DIR, 'knowledge-base.json')


def _wita():
    return datetime.utcnow() + timedelta(hours=8)


def _wita_str():
    return _wita().strftime('%Y-%m-%d %H:%M')


def _load():
    try:
        with open(SARAN_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {'saran': [], 'last_generated': None}


def _save(data):
    tmp = SARAN_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, SARAN_FILE)


def _id_baru(existing_ids):
    n = 1
    while f'saran-{n:04d}' in existing_ids:
        n += 1
    return f'saran-{n:04d}'


def _baca_stok():
    if not os.path.exists(STOK_FILE):
        return []
    with open(STOK_FILE, newline='', encoding='utf-8') as f:
        return [r for r in csv.DictReader(f)]


def _baca_tx_hari_ini():
    if not os.path.exists(TX_FILE):
        return []
    hari_ini = _wita().strftime('%Y-%m-%d')
    hasil = []
    with open(TX_FILE, newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r.get('tanggal', '') == hari_ini:
                hasil.append(r)
    return hasil


def _baca_kb():
    try:
        with open(KB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def _saran_stok(stok_list):
    """Saran berdasarkan stok kritis/hampir habis."""
    kritis = []
    rendah = []
    for s in stok_list:
        try:
            stok = int(float(s.get('stok', 0)))
            kritis_val = int(float(s.get('stok_kritis', 0)))
            minimum_val = int(float(s.get('stok_minimum', 0)))
            nama = s.get('nama', '')
            satuan = s.get('satuan', 'pcs')
            if stok <= kritis_val and stok >= 0:
                kritis.append(f"{nama} ({stok} {satuan})")
            elif stok <= minimum_val and stok > kritis_val:
                rendah.append(f"{nama} ({stok} {satuan})")
        except (ValueError, TypeError):
            continue

    pesan = []
    if kritis:
        daftar = ', '.join(kritis[:5])
        pesan.append(f"🚨 *Stok Kritis!* Segera restock:\n{daftar}")
    if rendah:
        daftar = ', '.join(rendah[:5])
        pesan.append(f"📦 *Stok Rendah:* {daftar}\nPertimbangkan restock dalam waktu dekat.")
    return pesan


def _saran_terlaris(tx_list):
    """Saran berdasarkan produk terlaris hari ini."""
    hitungan = {}
    for tx in tx_list:
        nama = tx.get('nama_produk', '').strip()
        if not nama:
            continue
        try:
            qty = int(float(tx.get('qty', 1)))
        except (ValueError, TypeError):
            qty = 1
        hitungan[nama] = hitungan.get(nama, 0) + qty

    if not hitungan:
        return []

    terurut = sorted(hitungan.items(), key=lambda x: x[1], reverse=True)
    top3 = [f"{n} ({q}x)" for n, q in terurut[:3]]
    return [f"🏆 *Terlaris Hari Ini:* {', '.join(top3)}"]


def _saran_harga(stok_list, kb):
    """Saran perbandingan harga kios vs harga referensi pasar."""
    harga_ref = kb.get('harga_referensi', {})
    if not harga_ref:
        return []

    lebih_mahal = []
    for s in stok_list:
        nama = s.get('nama', '').strip().lower()
        ref = harga_ref.get(nama)
        if not ref:
            continue
        try:
            harga_kios = int(float(s.get('harga_jual', 0)))
            harga_pasar = int(float(ref.get('harga', 0)))
            if harga_pasar > 0 and harga_kios > harga_pasar * 1.10:
                selisih = round(((harga_kios - harga_pasar) / harga_pasar) * 100)
                lebih_mahal.append(f"{s.get('nama')} (+{selisih}%)")
        except (ValueError, TypeError):
            continue

    if lebih_mahal:
        daftar = ', '.join(lebih_mahal[:3])
        return [f"💹 *Harga di atas pasar:* {daftar}\nPertimbangkan penyesuaian harga."]
    return []


# ── aksi_buat ─────────────────────────────────────────────────────────────────
def aksi_buat(_p):
    """Analisis data kios dan buat saran baru."""
    stok_list = _baca_stok()
    tx_hari_ini = _baca_tx_hari_ini()
    kb = _baca_kb()

    pesan_baru = []
    pesan_baru += _saran_stok(stok_list)
    pesan_baru += _saran_terlaris(tx_hari_ini)
    pesan_baru += _saran_harga(stok_list, kb)

    if not pesan_baru:
        ok({'saran': [], 'dibuat': 0, 'status': 'tidak ada saran baru'})
        return

    data = _load()
    existing_ids = {s.get('id', '') for s in data.get('saran', [])}
    ts = _wita_str()
    baru = []
    for pesan in pesan_baru:
        sid = _id_baru(existing_ids)
        existing_ids.add(sid)
        entri = {
            'id'      : sid,
            'ts'      : ts,
            'tipe'    : 'auto',
            'pesan'   : f"💡 *Saran PicaMan ({ts.split(' ')[1]} WITA):*\n{pesan}",
            'terkirim': False,
            'ts_kirim': None,
        }
        data['saran'].append(entri)
        baru.append(entri)

    data['last_generated'] = ts
    # Batas 200 saran — hapus yang sudah terkirim jika penuh
    if len(data['saran']) > 200:
        data['saran'] = [s for s in data['saran'] if not s.get('terkirim')][-200:]

    _save(data)
    ok({'saran': baru, 'dibuat': len(baru)})


# ── aksi_daftar ───────────────────────────────────────────────────────────────
def aksi_daftar(p):
    """Ambil saran yang belum terkirim."""
    maks = int(p.get('max', 5))
    data = _load()
    belum = [s for s in data.get('saran', []) if not s.get('terkirim')]
    ok({'saran': belum[:maks], 'total_belum': len(belum)})


# ── aksi_tandai_terkirim ──────────────────────────────────────────────────────
def aksi_tandai_terkirim(p):
    """Tandai saran sudah dikirim ke grup."""
    sid = str(p.get('id', '')).strip()
    if not sid:
        err('id saran kosong')
        return

    data = _load()
    ditemukan = False
    for s in data.get('saran', []):
        if s.get('id') == sid:
            s['terkirim'] = True
            s['ts_kirim'] = _wita_str()
            ditemukan = True
            break

    if not ditemukan:
        err(f'saran {sid} tidak ditemukan')
        return

    _save(data)
    ok({'status': 'ditandai', 'id': sid})


AKSI = {
    'buat'            : aksi_buat,
    'daftar'          : aksi_daftar,
    'tandai_terkirim' : aksi_tandai_terkirim,
}

if __name__ == '__main__':
    req = baca_request()
    handler = AKSI.get(req.get('action', ''))
    if handler:
        handler(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {req.get("action")}')
