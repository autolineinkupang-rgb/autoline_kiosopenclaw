import sys, os
from datetime import datetime, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from helper import baca_csv, ok, err, baca_request


def aksi_stok_kritis(params):
    stok = baca_csv('stok.csv')
    kritis = [s for s in stok if int(s['stok']) <= int(s['stok_kritis'])]
    rendah = [
        s for s in stok
        if int(s['stok']) > int(s['stok_kritis']) and int(s['stok']) <= int(s['stok_minimum'])
    ]
    ok({'kritis': kritis, 'rendah': rendah})


def aksi_exp_alert(params):
    stok = baca_csv('stok.csv')
    today = datetime.now().strftime('%Y-%m-%d')
    in7 = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')

    has_exp = [s for s in stok if s.get('has_exp') == '1']
    expired = [s for s in has_exp if s.get('exp_date') and s['exp_date'] <= today]
    hampir = [
        s for s in has_exp
        if s.get('exp_date') and today < s['exp_date'] <= in7
    ]
    ok({'expired': expired, 'hampir_exp': hampir})


AKSI = {
    'stok_kritis': aksi_stok_kritis,
    'exp_alert': aksi_exp_alert,
}

if __name__ == '__main__':
    req = baca_request()
    aksi = req.get('action', '')
    handler = AKSI.get(aksi)
    if handler:
        handler(req.get('params', {}))
    else:
        err(f'Aksi tidak dikenal: {aksi}')
