# Kak Kios — Bot Signal Kios Desa

Bot manajemen kios via Signal dengan kepribadian santai dan AI Groq/Gemini.

## Cara Jalankan

```bash
# Copy dan isi variabel .env
cp .env.example .env   # atau buat manual

npm run signal:start
```

Tanpa Signal (mode demo):
```bash
# Jalankan tanpa SIGNAL_PHONE_NUMBER → otomatis mode demo
npm run signal:start
```

## Variabel .env yang Dibutuhkan

| Variabel | Keterangan |
|---|---|
| `SIGNAL_PHONE_NUMBER` | Nomor HP terdaftar di signal-cli (e.g. `+6281234567890`) |
| `SIGNAL_RECIPIENT` | Nomor HP tujuan notifikasi |
| `SIGNAL_WHITELIST` | Nomor-nomor yang boleh kirim perintah (pisah koma) |
| `SIGNAL_CLI_PATH` | Path ke signal-cli (default: `signal-cli`) |
| `GROQ_API_KEY` | API key Groq untuk AI utama |
| `GEMINI_API_KEY` | API key Gemini untuk AI cadangan |
| `PYTHON_BIN` | Path Python 3 (default: `python3`) |

## Perintah Bot

| Perintah | Contoh |
|---|---|
| Cek stok | `stok` |
| Cari produk | `cari mie goreng` |
| Jual barang | `jual beras 2 tunai` |
| Beli/restock | `beli gula 10 13500` |
| Cek harga | `harga minyak` |
| Laporan hari ini | `laporan` |
| Status kadaluarsa | `exp` |
| Backup data | `backup` |
| Status sistem | `status` |
| Bantuan | `bantuan` |
| Bebas/AI | _ngobrol bebas_ |

## Arsitektur

```
Signal ──► bot-handler.js  (komunikasi & routing)
               │
               ├──► message-parser.js   (parse perintah)
               ├──► response-formatter.js (format pesan)
               ├──► ai-handler.js       (Groq / Gemini)
               └──► bridge.js ──► skills/*.py
                                   ├── stok.py   (cek/jual/beli/cari/exp)
                                   ├── laporan.py (harian/mingguan)
                                   ├── harga.py  (cek/update harga)
                                   ├── notif.py  (alert kritis/exp)
                                   └── helper.py (utilitas bersama)
```

Bridge memanggil Python via `spawnSync` (stdin → stdout JSON), sehingga JS dan Python terisolasi.

## Struktur Data

- `data/stok.csv` — inventaris produk
- `data/transaksi.csv` — log penjualan
- `data/pembelian.csv` — log pembelian/restock
- `logs/signal.log` — log bot (error tidak dikirim ke chat)
