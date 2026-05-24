# Kak Kios — Bot Telegram Kios Desa

Bot manajemen kios via Telegram dengan kepribadian santai dan AI Groq/Gemini.

## Cara Jalankan

```bash
# Copy dan isi variabel .env
cp .env.example .env   # atau buat manual

# Verifikasi token & ambil link undangan grup (sekali saja)
npm run signal:setup

npm run signal:start
```

Tanpa Telegram (mode demo):
```bash
# Jalankan tanpa TELEGRAM_BOT_TOKEN → otomatis mode demo
npm run signal:start
```

## Variabel .env yang Dibutuhkan

| Variabel | Keterangan |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token bot dari [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_GROUP_ID` | Chat ID grup (biasanya angka negatif, mis. `-1001234567890`) |
| `TELEGRAM_RECIPIENT` | User ID Telegram tujuan notifikasi pribadi |
| `TELEGRAM_WHITELIST` | User ID yang boleh kirim perintah (pisah koma) |
| `TELEGRAM_GROUP_INVITE_LINK` | Link undangan grup (otomatis diisi `signal:setup`) |
| `GROQ_API_KEY` | API key Groq untuk AI utama |
| `GEMINI_API_KEY` | API key Gemini untuk AI cadangan |
| `PYTHON_BIN` | Path Python 3 (default: `python3`) |

> Identitas user pakai **User ID numerik Telegram** (bukan nomor HP). Cara dapat: user kirim pesan ke bot, ID-nya muncul di `logs/signal.log` (`Pesan dari <id>`). Bot harus jadi **admin grup** agar link undangan & keluarkan member berfungsi.

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
Telegram ──► bot-handler.js  (komunikasi & routing)
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
