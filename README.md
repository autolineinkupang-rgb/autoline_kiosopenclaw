# Kios Openclaw v5.0

Sistem manajemen kios desa berbasis AI — dioperasikan via Telegram, tanpa biaya langganan.

## Teknologi

| Komponen | Stack |
|---|---|
| Bot/Telegram | Node.js + Telegram Bot API |
| AI Utama | Groq (Llama 4 Scout) |
| AI Cadangan | Gemini 2.0 Flash |
| Skills | Python 3 (CSV lokal) |
| Dashboard | Next.js + Vercel |
| Jadwal | node-cron |

## Mulai Cepat

```bash
# 1. Isi variabel lingkungan
cp .env.example .env   # atau buat manual

# 2. Install dependensi
npm install

# 3. Jalankan bot Telegram
npm run signal:start
```

## Variabel .env

| Variabel | Keterangan |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token bot dari @BotFather |
| `TELEGRAM_GROUP_ID` | Chat ID grup (angka negatif) |
| `TELEGRAM_RECIPIENT` | User ID tujuan notifikasi |
| `TELEGRAM_WHITELIST` | User ID yang boleh pakai bot (pisah koma) |
| `GROQ_API_KEY` | API key Groq |
| `GEMINI_API_KEY` | API key Gemini |
| `PYTHON_BIN` | Path Python 3 (default: `python3`) |
| `GROQ_MODEL` | Override model Groq (opsional) |
| `GEMINI_MODEL` | Override model Gemini (opsional) |
| `MAX_RETRY` | Maks retry AI (default: 3) |
| `CACHE_TTL` | TTL cache AI dalam detik (default: 300) |

## Struktur Folder

```
signal/          — Bot handler (transport Telegram), AI, intent detector, formatter
skills/          — Modul Python (stok, laporan, kasir, dll) + JS helpers
scripts/         — Cron scripts, backup, security, setup
cron/            — Penjadwal laporan & alert
config/          — Konfigurasi sistem (openclaw.json)
data/            — Database CSV + file JSON
dashboard/       — Dashboard Next.js (web-only, deploy ke Vercel)
logs/            — Log bot & sistem
```

## Arsitektur

```
Telegram ──► bot-handler.js
               │
               ├── message-parser.js    (parse teks)
               ├── intent-detector.js   (routing perintah)
               ├── intent-handlers.js   (eksekusi intent baru)
               ├── response-formatter.js (format respons)
               ├── ai-handler.js        (Groq / Gemini + cache)
               └── bridge.js ──► skills/*.py  (CSV ops)
```

## Dokumentasi

Lihat `DOKUMENTASI.md` untuk dokumentasi lengkap dan `PERINTAH.md` untuk referensi perintah bot.
