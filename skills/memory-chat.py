"""
memory-chat.py — PicaMan: memori percakapan Signal
- simpan  : catat percakapan (pesan + respons + intent)
- bersihkan: hapus entri grup > 1 hari, personal > 7 hari (tanpa ganggu file lain)
- baca    : ambil entri terbaru (untuk konteks AI)
- status  : statistik memori
"""
import sys, os, json
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helper import ok, err, baca_request, DATA_DIR

CHAT_FILE = os.path.join(DATA_DIR, 'memory-chat.json')
MAX_ENTRI = 2000
TTL_GRUP  = 24        # jam — entri grup dihapus setelah ini
TTL_PERSONAL = 24 * 7 # jam — entri personal disimpan 7 hari


def _wita():
    return datetime.utcnow() + timedelta(hours=8)


def _wita_str():
    return _wita().strftime('%Y-%m-%d %H:%M')


def _load():
    try:
        with open(CHAT_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def _save(data):
    tmp = CHAT_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CHAT_FILE)


def _parse_ts(ts_str):
    """Parse 'YYYY-MM-DD HH:MM' ke datetime, return None jika gagal."""
    try:
        return datetime.strptime(ts_str, '%Y-%m-%d %H:%M')
    except Exception:
        return None


# ── aksi_simpan ───────────────────────────────────────────────────────────────
def aksi_simpan(p):
    sender   = str(p.get('sender', '')).strip()
    pesan    = str(p.get('pesan', '')).strip()
    respons  = str(p.get('respons', '')).strip()
    intent   = str(p.get('intent', 'UNKNOWN')).strip()
    dari_grup = bool(p.get('dari_grup', False))

    if not pesan:
        return err('pesan kosong')

    entri = {
        'ts'       : _wita_str(),
        'sender'   : sender,
        'pesan'    : pesan[:300],
        'respons'  : respons[:500],
        'intent'   : intent,
        'dari_grup': dari_grup,
    }

    data = _load()
    data.append(entri)

    # Batasi ukuran
    if len(data) > MAX_ENTRI:
        data = data[-MAX_ENTRI:]

    _save(data)
    ok({'status': 'tersimpan', 'total': len(data)})


# ── aksi_bersihkan ────────────────────────────────────────────────────────────
def aksi_bersihkan(_p):
    """
    Hapus entri lama dari memori percakapan.
    - Entri dari grup  : dihapus jika > TTL_GRUP jam
    - Entri personal   : dihapus jika > TTL_PERSONAL jam
    Tidak menyentuh file lain (stok.csv, transaksi.csv, dll).
    """
    data    = _load()
    sebelum = len(data)
    now     = _wita()
    tersisa = []

    for e in data:
        ts = _parse_ts(e.get('ts', ''))
        if ts is None:
            tersisa.append(e)  # tidak bisa parse ts — simpan
            continue
        umur_jam = (now - ts).total_seconds() / 3600
        batas = TTL_GRUP if e.get('dari_grup') else TTL_PERSONAL
        if umur_jam <= batas:
            tersisa.append(e)

    _save(tersisa)
    dihapus = sebelum - len(tersisa)
    ok({
        'sebelum': sebelum,
        'sesudah': len(tersisa),
        'dihapus': dihapus,
        'ttl_grup_jam': TTL_GRUP,
        'ttl_personal_jam': TTL_PERSONAL,
    })


# ── aksi_baca ─────────────────────────────────────────────────────────────────
def aksi_baca(p):
    """Ambil entri terbaru. Filter: dari_grup=true/false/None(semua)."""
    n         = int(p.get('n', 20))
    hanya_grup = p.get('dari_grup')  # None = semua

    data = _load()
    if hanya_grup is not None:
        data = [e for e in data if bool(e.get('dari_grup')) == bool(hanya_grup)]

    ok({'entri': data[-n:], 'total': len(data)})


# ── aksi_status ───────────────────────────────────────────────────────────────
def aksi_status(_p):
    data     = _load()
    grup     = [e for e in data if e.get('dari_grup')]
    personal = [e for e in data if not e.get('dari_grup')]
    oldest   = data[0]['ts'] if data else '-'
    newest   = data[-1]['ts'] if data else '-'

    # Hitung entri grup yang sudah melebihi TTL
    now = _wita()
    akan_dihapus = 0
    for e in grup:
        ts = _parse_ts(e.get('ts', ''))
        if ts and (now - ts).total_seconds() / 3600 > TTL_GRUP:
            akan_dihapus += 1

    ok({
        'total'         : len(data),
        'dari_grup'     : len(grup),
        'personal'      : len(personal),
        'oldest'        : oldest,
        'newest'        : newest,
        'akan_dihapus'  : akan_dihapus,
        'ttl_grup_jam'  : TTL_GRUP,
    })


AKSI = {
    'simpan'    : aksi_simpan,
    'bersihkan' : aksi_bersihkan,
    'baca'      : aksi_baca,
    'status'    : aksi_status,
}

if __name__ == '__main__':
    req = baca_request()
    handler = AKSI.get(req.get('action', ''))
    if handler:
        handler(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {req.get("action")}')
