"""
self-learner.py — Bot self-learning skill
Belajar dari interaksi sendiri tanpa buang token:
- antri  : catat 1 interaksi ke queue (0 token)
- belajar: analisis lokal, simpan pelajaran, buat 1 batch kecil untuk AI
- status : statistik kualitas & jadwal
- ringkas: kompres queue (hapus duplikat)
"""

import sys, os, json, re
from datetime import datetime, timedelta
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helper import ok, err, baca_request, DATA_DIR, ROOT

# ── Paths ─────────────────────────────────────────────────────────────────────
QUEUE_FILE  = os.path.join(DATA_DIR, 'learn-queue.json')
STATE_FILE  = os.path.join(DATA_DIR, 'learn-state.json')
REPORT_FILE = os.path.join(DATA_DIR, 'learn-report.json')
AI_BATCH    = os.path.join(DATA_DIR, 'learn-pending-ai.json')
KB_FILE     = os.path.join(DATA_DIR, 'knowledge-base.json')
BASE_FILE   = os.path.join(DATA_DIR, 'base-patterns.json')
CONFIG_FILE = os.path.join(ROOT, 'config', 'openclaw.json')

MAX_QUEUE    = 500
AI_THRESHOLD = 5    # min frekuensi unknown sebelum masuk batch AI

# ── Helpers ───────────────────────────────────────────────────────────────────
def _load(path, default):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default

def _save(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

def _wita_now():
    return datetime.utcnow() + timedelta(hours=8)

def _wita_str():
    return _wita_now().strftime('%Y-%m-%d %H:%M')

def _lev(a, b):
    """Levenshtein distance, lokal 0 token."""
    a, b = a.lower(), b.lower()
    if len(a) > len(b):
        a, b = b, a
    row = list(range(len(a) + 1))
    for c in b:
        prev, row[0] = row[0], row[0] + 1
        for j, d in enumerate(a):
            save = row[j + 1]
            row[j + 1] = min(row[j] + 1, row[j + 1] + 1, prev + (0 if c == d else 1))
            prev = save
    return row[-1]

def _similar(a, b, thr=0.65):
    dist = _lev(a, b)
    return (1 - dist / max(len(a), len(b), 1)) >= thr

def _jam_belajar_cfg():
    cfg = _load(CONFIG_FILE, {})
    jb  = cfg.get('jadwal', {}).get('jam_belajar', '0 2 * * *')
    try:
        jam    = int(jb.split()[1])
        durasi = int(cfg.get('jadwal', {}).get('durasi_belajar_jam', 2))
    except Exception:
        jam, durasi = 2, 2
    return jam, durasi

def _dalam_jam_belajar():
    jam, durasi = _jam_belajar_cfg()
    h = _wita_now().hour
    return jam <= h < (jam + durasi)

def _boleh_belajar(paksa=False):
    if paksa:
        return True
    state = _load(STATE_FILE, {})
    last  = state.get('last_session', '')
    if last:
        try:
            diff = (_wita_now() - datetime.strptime(last, '%Y-%m-%d %H:%M')).total_seconds()
            if diff < 3600 * 6:
                return False
        except Exception:
            pass
    return _dalam_jam_belajar()

# ── aksi_antri ────────────────────────────────────────────────────────────────
def aksi_antri(p):
    """Tambah 1 interaksi ke learning queue (dipanggil setiap ada pesan)."""
    pesan    = p.get('pesan', '').strip()
    intent   = p.get('intent', 'UNKNOWN')
    berhasil = bool(p.get('berhasil', False))
    respons  = p.get('respons', '')

    if not pesan:
        return err('pesan kosong')

    queue = _load(QUEUE_FILE, [])

    # Merge duplikat beruntun untuk hemat storage
    if queue and queue[-1].get('pesan') == pesan and queue[-1].get('intent') == intent:
        queue[-1]['count'] = queue[-1].get('count', 1) + 1
        _save(QUEUE_FILE, queue)
        return ok({'status': 'merged', 'total': len(queue)})

    queue.append({
        'ts'       : _wita_str(),
        'pesan'    : pesan,
        'intent'   : intent,
        'berhasil' : berhasil,
        'resp_len' : len(respons),
        'count'    : 1,
    })

    if len(queue) > MAX_QUEUE:
        queue = queue[-MAX_QUEUE:]

    _save(QUEUE_FILE, queue)
    ok({'status': 'queued', 'total': len(queue)})

# ── aksi_belajar ──────────────────────────────────────────────────────────────
def aksi_belajar(p):
    """Sesi belajar: analisis lokal, buat batch AI minimal."""
    paksa = bool(p.get('paksa', False))
    if not _boleh_belajar(paksa):
        state = _load(STATE_FILE, {})
        ok({'status'     : 'skip',
            'alasan'     : 'bukan jam belajar atau terlalu cepat',
            'jam_belajar': _dalam_jam_belajar(),
            'last'       : state.get('last_session', '-')})
        return

    queue = _load(QUEUE_FILE, [])
    if not queue:
        ok({'status': 'skip', 'alasan': 'queue kosong'})
        return

    kb   = _load(KB_FILE, {})
    base = _load(BASE_FILE, {})

    hasil = {
        'sesi'           : _wita_str(),
        'total_antrian'  : len(queue),
        'pelajaran'      : [],
        'sinonim_saran'  : [],
        'ai_batch_dibuat': False,
        'token_hemat'    : 0,
    }

    # 1. Kelompokkan unknowns yang mirip (Levenshtein lokal, 0 token)
    unknowns    = [q for q in queue if q.get('intent') == 'UNKNOWN']
    unk_counter = Counter(q['pesan'].lower().strip() for q in unknowns)

    kelompok, sudah = [], set()
    for pesan_i, cnt_i in unk_counter.items():
        if pesan_i in sudah:
            continue
        grp = [(pesan_i, cnt_i)]
        for pesan_j, cnt_j in unk_counter.items():
            if pesan_j != pesan_i and pesan_j not in sudah and _similar(pesan_i, pesan_j):
                grp.append((pesan_j, cnt_j))
                sudah.add(pesan_j)
        sudah.add(pesan_i)
        kelompok.append(grp)

    for grp in kelompok:
        if len(grp) > 1:
            rep     = sorted(grp, key=lambda x: -x[1])[0][0]
            sinonim = [p for p, _ in grp if p != rep]
            hasil['sinonim_saran'].append({
                'kata_kunci': rep,
                'mirip'     : sinonim,
                'kemunculan': sum(c for _, c in grp),
            })

    # 2. Simpan alias otomatis dari sinonim dengan frekuensi cukup
    aliases = base.get('aliases', {})
    for s in hasil['sinonim_saran']:
        if s['kemunculan'] >= 3:
            for mirip in s['mirip']:
                aliases[mirip] = s['kata_kunci']
    base['aliases'] = aliases

    # 3. Buat batch AI hanya untuk unknowns berulang > threshold
    ai_kandidat = [
        {'pesan': p, 'frekuensi': c}
        for p, c in unk_counter.most_common(20)
        if c >= AI_THRESHOLD
    ]
    hasil['token_hemat'] = len(unk_counter) - len(ai_kandidat)

    if ai_kandidat:
        _save(AI_BATCH, {
            'instruksi': (
                'Daftar perintah tidak dikenal bot kios. Untuk tiap pesan tentukan: '
                '(1) intent yang tepat dari [JUAL,BELI,STOK,LAPORAN,HARGA_PASAR,'
                'BANTUAN,CUACA,HAPUS,TAMBAH_SUPPLIER,BUAT_PROMO,TERLARIS,'
                'UPDATE_HARGA_KIOS,TIDAK_RELEVAN], '
                '(2) pola regex singkat. Jawab JSON array: [{pesan,intent,pola_regex}]'
            ),
            'items'          : ai_kandidat,
            'dibuat'         : _wita_str(),
            'token_estimasi' : len(ai_kandidat) * 15,
        })
        hasil['ai_batch_dibuat']  = True
        hasil['ai_kandidat_jml']  = len(ai_kandidat)

    # 4. Analisis jam puncak
    jam_counter = Counter()
    for q in queue:
        if q.get('berhasil') and q.get('intent') not in ('UNKNOWN', 'BANTUAN'):
            try:
                jam_counter[q['ts'].split(' ')[1][:2]] += q.get('count', 1)
            except Exception:
                pass

    if jam_counter:
        puncak = jam_counter.most_common(3)
        base.setdefault('habits', {}).setdefault('peak_hours', {})
        for jam, cnt in puncak:
            base['habits']['peak_hours'][jam] = base['habits']['peak_hours'].get(jam, 0) + cnt
        hasil['pelajaran'].append('Jam puncak: ' + ', '.join(j for j, _ in puncak) + ' WITA')

    # 5. Analisis produk sering dicari
    produk_ctr = Counter()
    for q in queue:
        if q.get('intent') in ('JUAL', 'BELI', 'STOK', 'HARGA') and q.get('berhasil'):
            kata = re.sub(r'^(jual|beli|cek|stok|harga)\s*', '', q['pesan'], flags=re.I).strip()
            if kata and len(kata) > 2:
                produk_ctr[kata.lower()] += q.get('count', 1)

    if produk_ctr:
        base.setdefault('habits', {}).setdefault('top_products', {})
        for p, cnt in produk_ctr.most_common(5):
            base['habits']['top_products'][p] = base['habits']['top_products'].get(p, 0) + cnt
        hasil['pelajaran'].append('Top produk: ' + ', '.join(p for p, _ in produk_ctr.most_common(3)))

    # 6. Deteksi intent lemah (error rate tinggi)
    it_total, it_gagal = Counter(), Counter()
    for q in queue:
        it = q.get('intent', 'UNKNOWN')
        it_total[it] += 1
        if not q.get('berhasil'):
            it_gagal[it] += 1

    lemah = [
        {'intent': it, 'gagal_pct': round(it_gagal.get(it, 0) / total * 100)}
        for it, total in it_total.items()
        if total >= 3 and it_gagal.get(it, 0) / total > 0.3
    ]
    if lemah:
        lemah.sort(key=lambda x: -x['gagal_pct'])
        kb.setdefault('prevention_rules', [])
        for l in lemah[:3]:
            rule = f"Tingkatkan handler {l['intent']} — error rate {l['gagal_pct']}%"
            if rule not in kb['prevention_rules']:
                kb['prevention_rules'].append(rule)
        hasil['pelajaran'].append('Intent bermasalah: ' + ', '.join(l['intent'] for l in lemah[:3]))

    # 7. Update knowledge base
    berhasil_rate = sum(1 for q in queue if q.get('berhasil')) / max(len(queue), 1)
    kb['session_count'] = kb.get('session_count', 0) + 1
    kb.setdefault('best_practices', [])
    if berhasil_rate >= 0.9:
        bp = 'Tingkat keberhasilan ≥90%'
        if bp not in kb['best_practices']:
            kb['best_practices'].append(bp)

    hasil['berhasil_rate']    = round(berhasil_rate * 100, 1)
    hasil['unknowns_total']   = len(unk_counter)
    hasil['sinonim_ditemukan']= len(hasil['sinonim_saran'])

    _save(KB_FILE, kb)
    _save(BASE_FILE, base)

    # Simpan report (max 30 sesi)
    report = _load(REPORT_FILE, {'sesi_list': []})
    report['sesi_list'].append(hasil)
    if len(report['sesi_list']) > 30:
        report['sesi_list'] = report['sesi_list'][-30:]
    report['last_update'] = _wita_str()
    _save(REPORT_FILE, report)

    _save(STATE_FILE, {'last_session': _wita_str(), 'sesi_count': kb['session_count']})
    _save(QUEUE_FILE, [])

    ok(hasil)

# ── aksi_status ───────────────────────────────────────────────────────────────
def aksi_status(_p):
    state  = _load(STATE_FILE, {})
    report = _load(REPORT_FILE, {})
    queue  = _load(QUEUE_FILE, [])
    kb     = _load(KB_FILE, {})

    jam, dur    = _jam_belajar_cfg()
    sesi_list   = report.get('sesi_list', [])
    rates       = [s.get('berhasil_rate', 0) for s in sesi_list[-7:]]
    avg_rate    = round(sum(rates) / len(rates), 1) if rates else 0
    token_hemat = sum(s.get('token_hemat', 0) for s in sesi_list)
    ai_pending  = bool(_load(AI_BATCH, {}).get('items'))

    ok({
        'last_session'    : state.get('last_session', 'belum pernah'),
        'total_sesi'      : state.get('sesi_count', kb.get('session_count', 0)),
        'antrian_skrg'    : len(queue),
        'avg_sukses_7sesi': f'{avg_rate}%',
        'rules_aktif'     : len(kb.get('prevention_rules', [])),
        'jam_belajar'     : f'{jam:02d}:00–{(jam+dur):02d}:00 WITA',
        'bisa_belajar_skrg': _boleh_belajar(False),
        'ai_batch_pending': ai_pending,
        'token_hemat_total': token_hemat,
    })

# ── aksi_ringkas ──────────────────────────────────────────────────────────────
def aksi_ringkas(_p):
    queue = _load(QUEUE_FILE, [])
    if not queue:
        ok({'status': 'kosong'})
        return

    sebelum, merged = len(queue), {}
    for q in queue:
        key = f"{q.get('intent','')}::{q['pesan'].lower().strip()}"
        if key in merged:
            merged[key]['count'] = merged[key].get('count', 1) + q.get('count', 1)
        else:
            merged[key] = dict(q)

    baru = list(merged.values())
    _save(QUEUE_FILE, baru)
    ok({'sebelum': sebelum, 'sesudah': len(baru), 'hemat': sebelum - len(baru)})

# ── Entrypoint ────────────────────────────────────────────────────────────────
AKSI = {
    'antri'  : aksi_antri,
    'belajar': aksi_belajar,
    'status' : aksi_status,
    'ringkas': aksi_ringkas,
}

if __name__ == '__main__':
    req     = baca_request()
    action  = req.get('action', 'status')
    handler = AKSI.get(action)
    if handler:
        handler(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {action}')
