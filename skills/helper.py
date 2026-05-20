import csv, json, os, sys
from datetime import datetime, timedelta

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DATA_DIR = os.path.join(ROOT, 'data')

STOK_HEADERS = [
    'id','nama','kategori','satuan','stok','harga_beli','harga_jual',
    'stok_minimum','stok_kritis','supplier','last_update','has_exp','exp_date',
]
TX_HEADERS = [
    'id','tanggal','jam','produk_id','nama_produk','kategori',
    'qty','harga_satuan','total','metode_bayar','kasir','catatan','session_id',
]
PEM_HEADERS = [
    'id','session_id','tanggal','jam','produk_id','nama_produk',
    'qty','harga_beli','subtotal','supplier','kasir','catatan',
]
PRICE_HIST_HEADERS = [
    'id','tanggal','jam','produk_id','nama_produk',
    'harga_lama','harga_baru','selisih','supplier','kasir',
]


def baca_csv(nama_file, headers=None):
    path = os.path.join(DATA_DIR, nama_file)
    if not os.path.exists(path):
        return []
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        return [dict(r) for r in reader]


def tulis_csv(nama_file, rows, headers):
    path = os.path.join(DATA_DIR, nama_file)
    tmp = path + '.tmp'
    with open(tmp, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=headers, extrasaction='ignore')
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, path)


def cari_produk(nama, stok_list):
    q = nama.lower().strip()
    kata = q.split()
    return next(
        (s for s in stok_list
         if s['id'].lower() == q
         or q in s['nama'].lower()
         or all(k in s['nama'].lower() for k in kata)),
        None,
    )


def format_rupiah(n):
    try:
        return f"Rp {int(float(n)):,}".replace(',', '.')
    except (ValueError, TypeError):
        return f"Rp {n}"


def tanggal_hari_ini():
    return datetime.now().strftime('%Y-%m-%d')


def jam_sekarang():
    return datetime.now().strftime('%H:%M:%S')


def ok(data):
    print(json.dumps({'ok': True, 'data': data}, ensure_ascii=False))
    sys.stdout.flush()


def err(pesan):
    print(json.dumps({'ok': False, 'error': pesan}, ensure_ascii=False))
    sys.stdout.flush()


def baca_request():
    return json.loads(sys.stdin.read())
