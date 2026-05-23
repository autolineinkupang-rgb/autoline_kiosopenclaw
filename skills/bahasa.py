import sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helper import ok, err, baca_request, DATA_DIR

BAHASA_FILE = os.path.join(DATA_DIR, 'bahasa-map.json')

# ── Stopwords pencocokan produk ───────────────────────────────────────────────
STOPWORDS = {
    'beli','jual','cari','ada','mau','minta','pesan','ambil','kasih',
    'tambah','kurang','pcs','buah','pack','pak','bungkus','sachet',
    'dus','karton','lusin','dong','kak','ya','nih','satu','dua','tiga',
    'harga','berapa','stok','info','tolong','please','pls','rp','idr',
    'kg','gr','gram','liter','ml','ltr',
}

# ── Sinonim bawaan (tidak disimpan ke file, selalu tersedia) ──────────────────
_SINONIM_BAWAAN = {
    'minyak goreng' : ['minyak','miyak','minyak masak','minyak kelapa'],
    'gula pasir'    : ['gula','gula putih','gula granule','gula kg'],
    'mi goreng'     : ['mie goreng','indomie goreng','mie','mie instant'],
    'mi rebus'      : ['mie rebus','indomie rebus','mie kuah','mie biasa'],
    'telur ayam'    : ['telur','telor','telor ayam','telur kampung'],
    'beras'         : ['beras putih','padi','nasi mentah'],
    'sabun mandi'   : ['sabun','sabun batang','sabun cuci badan'],
    'kopi sachet'   : ['kopi','kopi bubuk','kopi instan'],
    'tepung terigu' : ['tepung','terigu','tepung serbaguna'],
    'garam dapur'   : ['garam','garam halus','garam kasar'],
    'rokok'         : ['rokk','rkok','cigaret'],
    'air mineral'   : ['air','aqua','air minum','minuman air'],
}

# ── Koreksi typo bawaan ───────────────────────────────────────────────────────
_KOREKSI_BAWAAN = {
    'miyak'   : 'minyak',   'mnyak'   : 'minyak',  'miak'    : 'minyak',
    'suus'    : 'susu',     'sus'     : 'susu',
    'bras'    : 'beras',    'bres'    : 'beras',
    'gla'     : 'gula',     'gla'     : 'gula',
    'tlur'    : 'telur',    'telor'   : 'telur',
    'mie'     : 'mi',       'mie goreng': 'mi goreng',
    'tempe'   : 'tempe',    'tahu'    : 'tahu',
    'indomie' : 'indomie',  'indo'    : 'indomie',
    'byar'    : 'bayar',    'byr'     : 'bayar',
    'sbnr'    : 'sebentar', 'skrg'    : 'sekarang',
    'rokk'    : 'rokok',    'rkok'    : 'rokok',
}


def _load():
    try:
        with open(BAHASA_FILE, 'r', encoding='utf-8') as f:
            custom = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        custom = {}
    data = {
        'sinonim'  : dict(_SINONIM_BAWAAN),
        'koreksi'  : dict(_KOREKSI_BAWAAN),
        'singkatan': {},
        'lokal'    : {},
    }
    # Gabungkan custom (custom override bawaan)
    for tipe in ('sinonim', 'koreksi', 'singkatan', 'lokal'):
        data[tipe].update(custom.get(tipe, {}))
    return data


def _simpan(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    custom = {
        'sinonim'  : {k: v for k, v in data['sinonim'].items()   if k not in _SINONIM_BAWAAN},
        'koreksi'  : {k: v for k, v in data['koreksi'].items()   if k not in _KOREKSI_BAWAAN},
        'singkatan': data.get('singkatan', {}),
        'lokal'    : data.get('lokal', {}),
    }
    with open(BAHASA_FILE, 'w', encoding='utf-8') as f:
        json.dump(custom, f, ensure_ascii=False, indent=2)


def _bersih(teks):
    t = str(teks).lower().strip()
    t = re.sub(r'[^\w\s]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def _levenshtein(a, b):
    if a == b: return 0
    if not a: return len(b)
    if not b: return len(a)
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev, dp[0] = dp[0], i
        for j in range(1, n + 1):
            tmp = dp[j]
            dp[j] = prev if a[i-1] == b[j-1] else 1 + min(prev, dp[j], dp[j-1])
            prev = tmp
    return dp[n]


def _normalisasi_internal(teks, data):
    """Normalisasi + koreksi + singkatan (tanpa spawn skill)."""
    t = _bersih(teks)
    # Koreksi typo (whole phrase dulu)
    if t in data['koreksi']:
        t = data['koreksi'][t]
    # Singkatan
    if t in data['singkatan']:
        t = data['singkatan'][t]
    # Lokal
    if t in data['lokal']:
        t = data['lokal'][t]
    # Koreksi per kata
    kata = t.split()
    terkoreksi = []
    for k in kata:
        if k in data['koreksi']:
            terkoreksi.append(data['koreksi'][k])
        elif k in data['singkatan']:
            terkoreksi.append(data['singkatan'][k])
        elif k in data['lokal']:
            terkoreksi.append(data['lokal'][k])
        else:
            terkoreksi.append(k)
    return ' '.join(terkoreksi)


def _varian_query(q_norm, data):
    """Kumpulkan semua varian query dari sinonim (dua arah)."""
    varian = {q_norm}
    for k, vs in data['sinonim'].items():
        k_n = _bersih(k)
        vs_n = [_bersih(v) for v in vs]
        if q_norm == k_n or q_norm in vs_n:
            varian.add(k_n)
            varian.update(vs_n)
    return varian


def _skor(query_set, nama_produk):
    """Skor kecocokan 0-1 antara himpunan varian query dan nama produk."""
    n = _bersih(nama_produk)
    best = 0.0
    for q in query_set:
        if not q: continue
        if q == n:
            return 1.0
        if q in n or n in q:
            best = max(best, 0.88)
            continue
        # Overlap kata (buang stopwords)
        kata_q = set(q.split()) - STOPWORDS
        kata_n = set(n.split()) - STOPWORDS
        if kata_q and kata_n:
            overlap = len(kata_q & kata_n) / max(len(kata_q), len(kata_n))
            if overlap >= 0.5:
                best = max(best, 0.65 + overlap * 0.25)
                continue
        # Levenshtein (hanya untuk string pendek agar cepat)
        if len(q) <= 20 and len(n) <= 20:
            d = _levenshtein(q, n)
            sim = 1.0 - d / max(len(q), len(n), 1)
            if sim > 0.6:
                best = max(best, sim * 0.85)
    return best


# ── Aksi ─────────────────────────────────────────────────────────────────────

def aksi_normalisasi(p):
    teks = str(p.get('teks', '')).strip()
    if not teks:
        return err('teks wajib diisi')
    data = _load()
    hasil = _normalisasi_internal(teks, data)
    ok({'original': teks, 'normalisasi': hasil, 'berubah': hasil != _bersih(teks)})


def aksi_sinonim(p):
    query = _bersih(str(p.get('query', '')))
    if not query:
        return err('query wajib diisi')
    data = _load()
    varian = _varian_query(query, data)
    ok({'query': query, 'varian': sorted(varian)})


def aksi_cocokkan(p):
    """
    Cocokkan query ke daftar produk menggunakan sinonim + Levenshtein.
    Input : { query: str, produk: [{nama, ...}], top: int, threshold: float }
    Output: { cocok: [...], skor: [...], varian: [...], normalisasi: str }
    """
    query     = str(p.get('query', '')).strip()
    produk_list = p.get('produk', [])
    top       = int(p.get('top', 3))
    threshold = float(p.get('threshold', 0.55))

    if not query:
        return err('query wajib diisi')

    data  = _load()
    q_norm = _normalisasi_internal(query, data)
    varian = _varian_query(q_norm, data)

    scored = []
    for prod in produk_list:
        nama = str(prod.get('nama', ''))
        if not nama:
            continue
        s = _skor(varian, nama)
        if s >= threshold:
            scored.append((prod, s))

    scored.sort(key=lambda x: x[1], reverse=True)
    top_hasil = scored[:top]

    ok({
        'query'      : query,
        'normalisasi': q_norm,
        'varian'     : sorted(varian),
        'cocok'      : [x[0] for x in top_hasil],
        'skor'       : [round(x[1], 3) for x in top_hasil],
        'ditemukan'  : len(top_hasil) > 0,
    })


def aksi_koreksi_typo(p):
    """Koreksi typo per kata menggunakan database + Levenshtein ke kata referensi."""
    teks     = str(p.get('teks', '')).strip()
    referensi = p.get('referensi', [])  # kata-kata valid (dari nama produk)
    if not teks:
        return err('teks wajib diisi')

    data = _load()
    t_bersih = _bersih(teks)
    kata = t_bersih.split()
    hasil = []

    for k in kata:
        if k in STOPWORDS or len(k) <= 2:
            hasil.append(k)
            continue
        # Cek database koreksi
        if k in data['koreksi']:
            hasil.append(data['koreksi'][k])
            continue
        # Fuzzy ke referensi (ambang: ≤25% panjang kata)
        if referensi:
            maks_dist = max(1, len(k) // 4)
            best_kata, best_d = k, 999
            for ref in referensi:
                ref_n = _bersih(ref)
                if len(ref_n) < 3:
                    continue
                d = _levenshtein(k, ref_n)
                if d < best_d and d <= maks_dist:
                    best_d, best_kata = d, ref_n
            hasil.append(best_kata)
        else:
            hasil.append(k)

    teks_baru = ' '.join(hasil)
    ok({'original': teks, 'koreksi': teks_baru, 'berubah': teks_baru != t_bersih})


def aksi_pelajari(p):
    """
    Simpan pemetaan kata baru.
    tipe  : sinonim | koreksi | singkatan | lokal
    kunci : kata/frase sumber
    nilai : kata/frase target (produk atau kata baku)
    """
    tipe  = str(p.get('tipe', 'sinonim'))
    kunci = _bersih(str(p.get('kunci', '')))
    nilai = str(p.get('nilai', '')).strip().lower()

    if not kunci or not nilai:
        return err('kunci dan nilai wajib diisi')
    if tipe not in ('sinonim', 'koreksi', 'singkatan', 'lokal'):
        return err(f'Tipe tidak dikenal: {tipe}. Pilih: sinonim/koreksi/singkatan/lokal')

    data = _load()

    if tipe == 'sinonim':
        # Dua arah: kunci adalah alias dari nilai
        entry = data['sinonim'].setdefault(nilai, [])
        if kunci not in entry:
            entry.append(kunci)
    else:
        data[tipe][kunci] = nilai

    _simpan(data)
    ok({'tipe': tipe, 'kunci': kunci, 'nilai': nilai, 'tersimpan': True})


def aksi_hapus(p):
    """Hapus entri dari database bahasa."""
    tipe  = str(p.get('tipe', 'sinonim'))
    kunci = _bersih(str(p.get('kunci', '')))
    if not kunci:
        return err('kunci wajib diisi')

    data = _load()
    if tipe == 'sinonim':
        # Hapus kunci dari semua daftar varian
        for k in list(data['sinonim']):
            data['sinonim'][k] = [v for v in data['sinonim'][k] if _bersih(v) != kunci]
        if kunci in data['sinonim']:
            del data['sinonim'][kunci]
    elif tipe in ('koreksi', 'singkatan', 'lokal'):
        data[tipe].pop(kunci, None)
    else:
        return err(f'Tipe tidak dikenal: {tipe}')

    _simpan(data)
    ok({'tipe': tipe, 'kunci': kunci, 'dihapus': True})


def aksi_status(p):
    data = _load()
    custom_sin = {k: v for k, v in data['sinonim'].items()  if k not in _SINONIM_BAWAAN}
    custom_kor = {k: v for k, v in data['koreksi'].items()  if k not in _KOREKSI_BAWAAN}
    ok({
        'sinonim_total'   : len(data['sinonim']),
        'sinonim_custom'  : len(custom_sin),
        'koreksi_total'   : len(data['koreksi']),
        'koreksi_custom'  : len(custom_kor),
        'singkatan'       : len(data.get('singkatan', {})),
        'lokal'           : len(data.get('lokal', {})),
        'contoh_sinonim'  : dict(list(data['sinonim'].items())[:5]),
        'contoh_koreksi'  : dict(list(data['koreksi'].items())[:5]),
        'singkatan_all'   : data.get('singkatan', {}),
        'lokal_all'       : data.get('lokal', {}),
    })


AKSI = {
    'normalisasi' : aksi_normalisasi,
    'sinonim'     : aksi_sinonim,
    'cocokkan'    : aksi_cocokkan,
    'koreksi_typo': aksi_koreksi_typo,
    'pelajari'    : aksi_pelajari,
    'hapus'       : aksi_hapus,
    'status'      : aksi_status,
}

if __name__ == '__main__':
    req = baca_request()
    fn  = AKSI.get(req.get('action', ''))
    if fn:
        fn(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {req.get("action")}')
