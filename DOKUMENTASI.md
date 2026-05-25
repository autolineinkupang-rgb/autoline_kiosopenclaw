# DOKUMENTASI LENGKAP — KIOS OPENCLAW
### Sistem Manajemen Kios Desa berbasis AI
**Pemilik:** Ruflo | **Lokasi:** Rote Barat Laut, NTT | **Versi:** 5.1

> Dokumen ini menggabungkan **tiga panduan jadi satu**: dokumentasi teknis,
> referensi perintah bot, dan instruksi deploy. Ditulis untuk programmer pemula —
> kalau ada yang perlu diubah manual, Anda tahu file mana yang harus disentuh.

---

## DAFTAR ISI

1. [Gambaran Umum Sistem](#1-gambaran-umum-sistem)
2. [Kebutuhan RAM & Spesifikasi Server](#2-kebutuhan-ram--spesifikasi-server)
3. [Struktur Folder](#3-struktur-folder)
4. [Arsitektur & Alur Kerja](#4-arsitektur--alur-kerja)
5. [File Konfigurasi](#5-file-konfigurasi)
6. [File Data](#6-file-data)
7. [File Memory](#7-file-memory)
8. [Scripts Utama](#8-scripts-utama)
9. [Telegram Bot](#9-telegram-bot)
10. [PicaMan — Skill Python](#10-picaman--skill-python)
11. [Dashboard Next.js (Vercel)](#11-dashboard-nextjs-vercel)
12. [Keamanan Sistem](#12-keamanan-sistem)
13. [Jadwal Otomatis (node-cron)](#13-jadwal-otomatis-node-cron)
14. [Referensi Perintah Bot](#14-referensi-perintah-bot)
15. [Instruksi Deploy](#15-instruksi-deploy)
16. [Panduan Baca Error](#16-panduan-baca-error)
17. [Fitur Lanjutan & Cheat Sheet](#17-fitur-lanjutan--cheat-sheet)

---

## 1. GAMBARAN UMUM SISTEM

Kios Openclaw adalah sistem manajemen kios desa yang bekerja otomatis menggunakan AI.
Dirancang untuk:

- **Hemat biaya** — semua layanan gratis (Groq, Gemini, Vercel, Upstash, Oracle Cloud)
- **Hemat internet** — cocok untuk koneksi < 10 Mbps, respons dikompresi & di-cache
- **Otomatis 24/7** — laporan & riset harga terkirim otomatis tanpa disuruh
- **Mudah** — cukup kirim perintah via Telegram

### Teknologi yang Digunakan

| Komponen | Teknologi | Biaya |
|----------|-----------|-------|
| Backend/Bot | Node.js v20+ | Gratis |
| Skill bisnis (stok, harga, dll) | Python 3 (stdlib only) | Gratis |
| AI Utama | Groq Llama 4 Scout 17B | Gratis |
| AI Cadangan | Google Gemini 2.0 Flash | Gratis |
| Chat/Bot | Telegram Bot API (long polling) | Gratis |
| Penjadwalan | `node-cron` (di dalam proses bot) | — |
| Proses 24/7 | PM2 | Gratis |
| Hosting bot | VPS Oracle Cloud Always Free | Gratis selamanya |
| Dashboard Web | Next.js 15 + Vercel | Gratis |
| Jembatan data VPS↔Vercel | Upstash Redis (REST) | Gratis (free tier) |
| Database | File CSV/JSON lokal | Gratis |

### Identitas Sistem

- **Nama bot (persona Telegram):** Irma
- **Nama mesin skill (Python bridge):** PicaMan
- **Kios:** Kios Desa Maju, jam buka 06:00–21:00, timezone **WITA (Asia/Makassar, UTC+8)**

### Cara Kerja Singkat

```
Ruflo kirim pesan Telegram
        ↓
Bot (long polling) terima & verifikasi pengirim (whitelist + RBAC role)
        ↓
intent-detector.js urai perintah → intent + parameter
        ↓
Lokal? → PicaMan (skill Python) baca/tulis CSV-JSON     Perlu AI? → Groq → (gagal) Gemini
        ↓                                                       ↓
response-formatter.js format balasan ←──────────────────────────┘
        ↓
Balasan dikirim ke Telegram + data ringkas ditulis ke Upstash Redis
        ↓
Dashboard Vercel baca Redis → tampil read-only ke web
```

---

## 2. KEBUTUHAN RAM & SPESIFIKASI SERVER

Pertanyaan paling sering: **"VPS-nya butuh RAM berapa?"** Ringkasnya: **sistem ini ringan.**

### Yang berjalan 24/7 di VPS

| Proses | RAM (terukur / realistis) | Catatan |
|--------|---------------------------|---------|
| Bot Node.js (`signal/bot-handler.js`) | **66 MB idle**, ~90–150 MB jalan | Long polling + node-cron + Map state in-memory |
| PM2 daemon | ~30–50 MB | Process manager (auto-restart) |
| Skill Python (PicaMan) | ~15–30 MB **sesaat** | Spawn on-demand, stdlib only, timeout 15 dtk, lalu mati |
| OS Ubuntu Server (minimal) | ~150–250 MB | Sistem operasi dasar |

> Angka 66 MB diukur langsung: satu proses Node memuat **semua** dependency bot
> (axios, groq-sdk, gemini, csv-parse, dayjs, node-cron, dll) → RSS 66 MB.

**Total pemakaian aktif di VPS: ~250–450 MB.** PM2 sudah dipasang batas
`max_memory_restart: 400M` di `config/ecosystem.config.js` — kalau proses bot
membengkak melewati 400 MB (indikasi memory leak), PM2 otomatis restart.

### Rekomendasi RAM VPS

| Pilihan | RAM | Verdict |
|---------|-----|---------|
| Minimum mutlak | **512 MB** | Jalan, tapi sempit saat `npm install` / update. Tambahkan swap 1 GB. |
| **Direkomendasikan** | **1 GB** (Oracle `VM.Standard.E2.1.Micro` Always Free) | Nyaman, ada headroom. |
| Ideal / berlebih | **6 GB** (Oracle Ampere `VM.Standard.A1.Flex`, ARM, Always Free) | Sangat lega — pilihan terbaik karena gratis. |

### Catatan penting

- **Dashboard TIDAK pakai RAM VPS.** Dashboard berjalan di **Vercel** (serverless).
  Folder `dashboard/node_modules` (±512 MB) hanya untuk **build** di Vercel, bukan
  runtime di server Anda. VPS hanya menulis data ringkas ke Upstash Redis.
- **Disk:** project tanpa `node_modules` < 50 MB. Backend `node_modules` hanya ±40 MB
  (dependency produksi sedikit). 5–10 GB disk VPS sudah sangat cukup.
- **Untuk dev lokal (WSL/Windows):** bot saja ~150 MB. Kalau juga menjalankan
  `npm run dashboard` (`next dev`) tambah ~300–500 MB; build dashboard memuncak
  ~0.5–1 GB. Sediakan ±2 GB RAM bebas untuk dev nyaman — tapi sistem kios-nya
  sendiri tetap ringan.

---

## 3. STRUKTUR FOLDER

```
kios-openclaw/
│
├── config/                     ← Pengaturan sistem
│   ├── openclaw.json           ← Konfigurasi AI, jadwal, alert, hosting
│   ├── agent-kios.yaml         ← System prompt / perilaku AI
│   ├── models.js               ← Registri model AI (switcher)
│   ├── rufo.config.js          ← Konfigurasi task batching
│   └── ecosystem.config.js     ← Konfigurasi PM2 (deploy 24/7)
│
├── data/                       ← Database CSV + JSON
│   ├── stok.csv                ← Produk + jumlah stok
│   ├── pulsa.csv               ← Pulsa & token PLN (stok virtual)
│   ├── transaksi.csv           ← Riwayat penjualan (append-only)
│   ├── pembelian.csv           ← Riwayat restock/pembelian
│   ├── price-history.csv       ← Histori perubahan harga
│   ├── supplier.csv            ← Daftar supplier
│   ├── users.json              ← User + role (owner/irma/kasir/viewer)
│   ├── shift.json              ← Shift kasir aktif
│   ├── promo.json              ← Promo & diskon
│   ├── ai-models.json          ← Override model AI pilihan owner
│   ├── token-usage.json        ← Statistik pemakaian token AI
│   ├── bug-report.json         ← Log bug (self-debug)
│   ├── knowledge-base.json     ← Basis pengetahuan bot
│   ├── learn-*.json            ← State sesi belajar mandiri bot
│   └── ...                     ← bahasa-map, base-patterns, dll
│
├── memory/                     ← Status real-time sistem
│   ├── kios-memory.json        ← Status harian, AI, sistem
│   ├── checkpoint.json         ← Snapshot tiap 5 menit
│   └── pending-tasks.json      ← Antrian tugas
│
├── scripts/                    ← Program & util Node
│   ├── startup.js              ← Titik masuk (npm start)
│   ├── laporan-harian.js       ← Buat & kirim laporan AI
│   ├── cek-stok.js             ← Monitor stok + alert
│   ├── backup.js               ← Backup otomatis (rotasi 7 hari)
│   ├── memory-checkpoint.js    ← Snapshot memori tiap 5 menit
│   ├── blockchain-logger.js    ← Audit trail hash-chain lokal
│   ├── cctv-snapshot.js        ← Ambil foto CCTV
│   ├── security.js             ← Fungsi keamanan bersama
│   ├── rbac.js                 ← Role + permission (owner/irma/kasir/viewer)
│   ├── redis.js                ← Klien Upstash Redis (sync ke Vercel)
│   ├── event-bus.js            ← Event bus internal
│   ├── url-safety.js           ← Validasi URL aman (web-search)
│   ├── send-report.js          ← Kirim laporan manual ke Telegram
│   ├── signal-setup.js         ← Verifikasi token & link grup
│   └── vps-setup.sh            ← Skrip setup sekali-jalan di VPS
│
├── signal/                     ← Bot Telegram (nama folder dipertahankan)
│   ├── bot-handler.js          ← Otak bot: polling, gate, RPC ke skill
│   ├── intent-detector.js      ← Regex pengenal perintah → intent
│   ├── intent-handlers.js      ← Eksekusi tiap intent
│   ├── message-parser.js       ← Parser teks perintah
│   ├── response-formatter.js   ← Format pesan balasan
│   ├── ai-handler.js           ← tanyaGroq() / tanyaGemini() + fallback
│   ├── bridge.js               ← Jembatan Node → skill Python (PicaMan)
│   ├── delegation-policy.js    ← Intent lokal vs intent yang perlu AI
│   └── local-processor.js      ← Proses cepat tanpa AI
│
├── skills/                     ← Skill Python (PicaMan) + util JS
│   ├── stok.py  harga.py  laporan.py  promo.py  supplier.py
│   ├── kasir.js gudang.js cuaca.js market-intel.js web-search.js
│   ├── bahasa.py  saran.py  memory-chat.py  notif.py
│   ├── self-learner.py  self-debug.js  learning-engine.js
│   └── helper.py  event_emit.py
│
├── cron/                       ← Penjadwalan dalam-proses
│   ├── scheduler.js            ← Daftar jadwal node-cron (WITA)
│   └── handlers.js             ← Implementasi tiap tugas terjadwal
│
├── dashboard/                  ← Website monitoring (deploy ke Vercel)
│   ├── app/ (page.js, layout.js, api/*)
│   ├── components/ (StokTable, AlertBanner, TransaksiChart)
│   ├── middleware.js  next.config.js  vercel.json
│
├── logs/                       ← Catatan aktivitas (*.log, pm2-*.log)
├── backups/                    ← Backup harian (rotasi 7 hari)
│
├── .env                        ← Rahasia (JANGAN commit)
├── .env.example                ← Template aman
├── package.json                ← Dependencies & npm scripts
└── DOKUMENTASI.md              ← (file ini)
```

---

## 4. ARSITEKTUR & ALUR KERJA

### A. Satu Proses, Banyak Fungsi

Inti sistem adalah **satu proses Node.js** (`signal/bot-handler.js`) yang dijalankan
24/7 oleh PM2. Proses ini sekaligus:

1. **Long polling Telegram** — tarik pesan masuk via `getUpdates` (tanpa webhook/port).
2. **node-cron** — semua tugas terjadwal jalan di dalam proses ini (lihat bagian 13).
3. **Jembatan PicaMan** — saat butuh logika bisnis, ia `spawnSync` skill Python.
4. **Sync Redis** — tulis ringkasan data ke Upstash agar dashboard Vercel bisa baca.

> Karena semua dalam satu proses, **tidak perlu cron sistem / Task Scheduler** di VPS.

### B. Alur Penjualan via Telegram

```
Ruflo: "jual mie instan goreng 5"
   ↓ bot-handler.js: verifikasi pengirim (whitelist + role RBAC)
   ↓ intent-detector.js: → { intent: JUAL, produk: "mie instan goreng", qty: 5 }
   ↓ validasi: qty harus > 0 & angka
   ↓ bridge.js → skills/stok.py action "jual": kurangi stok.csv, catat transaksi.csv
   ↓ response-formatter.js: format konfirmasi
   ↓ redis.set(): update ringkasan untuk dashboard
Ruflo terima: "✅ TRANSAKSI DICATAT — Mie Instan Goreng x5 = Rp 17.500"
```

### C. Alur AI dengan Fallback

```
Perintah butuh AI (chat bebas, rekomendasi, analisis harga)
   ↓ ai-handler.js → tanyaGroq() (model AI Utama)
   ↓ (timeout 8 dtk / error) → tanyaGemini() (AI Cadangan)
   ↓ hasil diformat & dikirim; token dicatat di data/token-usage.json
```

### D. Sync VPS → Dashboard Vercel

Dashboard **tidak** mengakses VPS langsung. Alurnya:

```
VPS (bot) ──tulis──> Upstash Redis (REST) <──baca── Dashboard Vercel (read-only)
```

`scripts/redis.js` adalah klien REST sederhana (`get/set/del/incr`). Kalau env
`UPSTASH_REDIS_REST_URL` / `_TOKEN` kosong, fungsi `tersedia()` bernilai false dan
sistem tetap jalan (sync di-skip, tidak error).

---

## 5. FILE KONFIGURASI

### `config/openclaw.json` — Konfigurasi Utama

```json
{
  "ai": {
    "primary":  { "provider": "groq",   "model": "meta-llama/llama-4-scout-17b-16e-instruct",
                  "max_tokens": 1024, "temperature": 0.3, "timeout_ms": 8000, "retry": 2 },
    "fallback": { "provider": "gemini", "model": "gemini-2.0-flash",
                  "max_tokens": 1024, "temperature": 0.3, "timeout_ms": 10000, "retry": 1 },
    "token_limit_harian": 50000
  },
  "kios": { "nama": "Kios Desa Maju", "timezone": "Asia/Makassar", "jam_buka": "06:00", "jam_tutup": "21:00" },
  "alert": { "stok_minimum": 5, "stok_kritis": 2, "omzet_target_harian": 500000 }
}
```

- **`ai.primary/fallback`** — `timeout_ms` → kalau AI tak respons dalam batas ini,
  pindah ke fallback. `temperature` rendah = jawaban konsisten.
- **`token_limit_harian: 50000`** — rem pemakaian token AI per hari (hemat kuota).
- **`alert.stok_kritis: 2`** → stok ≤ 2 = alert MERAH; **`stok_minimum: 5`** → ≤ 5 = KUNING.
- **`timezone: "Asia/Makassar"`** → WITA, dipakai semua jadwal & label sesi laporan.

### `config/models.js` — Registri Model AI (Switcher)

Daftar model yang bisa dipilih owner via Telegram tanpa edit kode. Model tersedia:
`groq_llama4_scout` (default Utama), `groq_llama31_8b` (default Batch),
`gemini_flash_20` (default Cadangan). Override owner disimpan di `data/ai-models.json`.
Lihat bagian 17 untuk cara menambah model.

### `config/agent-kios.yaml` — Kepribadian AI

`system_prompt` dikirim ke AI sebelum pertanyaan (memberi tahu cara berperilaku);
`prompt_templates` mengisi data ke teks siap-kirim agar hemat token.

### `config/rufo.config.js` — Task Batching

`maxConcurrent: 3` (maks 3 proses paralel, tidak membebani RAM),
`delayBetweenMs: 200` (jeda antar task agar tidak kena rate limit API),
`progress.continueOnError: true` (1 task gagal tidak menghentikan semuanya).

### `config/ecosystem.config.js` — PM2 (Deploy 24/7)

```js
{ name: 'kios-bot', script: 'signal/bot-handler.js',
  autorestart: true, restart_delay: 5000, exp_backoff_restart_delay: 5000,
  max_restarts: 20, min_uptime: '30s',
  max_memory_restart: '400M',           // restart kalau RAM > 400MB (anti-leak)
  instances: 1, exec_mode: 'fork' }     // WAJIB 1 instance (long polling dobel = error 409)
```

---

## 6. FILE DATA

### `data/stok.csv`

```
id,nama,kategori,satuan,stok,harga_beli,harga_jual,stok_minimum,stok_kritis,supplier,last_update
001,Beras Premium 5kg,sembako,karung,25,62000,70000,10,3,Pak Haji Soleh,2026-05-17
```

| Kolom | Arti |
|-------|------|
| `stok` | Jumlah saat ini — berubah tiap penjualan/restock |
| `stok_minimum` | Batas KUNING (perlu restock minggu ini) |
| `stok_kritis` | Batas MERAH (restock segera) |

### File data lain

- **`data/pulsa.csv`** — pulsa/token PLN, `stok: 999` (virtual), `aktif: true/false`.
- **`data/transaksi.csv`** — append-only, ID = `TX` + timestamp (audit trail).
- **`data/pembelian.csv`** / **`price-history.csv`** — riwayat restock & perubahan harga.
- **`data/supplier.csv`** — daftar pemasok.
- **`data/users.json`** — user + role. Edit manual untuk tambah/hapus user.
- **`data/shift.json`** — shift kasir aktif (saldo awal/akhir).
- **`data/promo.json`** — promo & diskon aktif.
- **`data/ai-models.json`** — override model AI owner; `{}` = pakai default registry.
- **`data/token-usage.json`** — statistik pemakaian token (rem `token_limit_harian`).
- **`data/bug-report.json`** — log bug otomatis dari `skills/self-debug.js` (lihat 17.3).

> **Kenapa CSV/JSON, bukan MySQL?** Koneksi desa lemah & skala kios kecil. File datar
> cukup, tidak perlu install/maintenance database server (hemat RAM juga).

---

## 7. FILE MEMORY

### `memory/kios-memory.json`

Otak status real-time: ringkasan `harian` (omzet, transaksi, stok kritis),
`bulanan`, statistik `ai` (token terpakai, jumlah fallback), status koneksi,
dan `system.startup_time`.

### `memory/checkpoint.json`

Snapshot kondisi kios tiap 5 menit (`max_keep: 288` = 24 jam). Checkpoint lama
dihapus otomatis dengan `slice(-288)`. Berguna lihat "jam berapa omzet naik".

### `memory/pending-tasks.json`

Antrian tugas: `queue` / `processing` / `completed` / `failed`. Berguna kalau
sistem restart saat ada tugas berjalan.

---

## 8. SCRIPTS UTAMA

### `scripts/startup.js` — Titik Masuk (`npm start`)
Cek dependencies wajib (`openclaw.json`, `stok.csv`, `kios-memory.json`), jalankan
cek-stok, test laporan, lalu spawn `memory-checkpoint.js` di background
(`.unref()` agar tetap hidup setelah startup selesai). Exit code 2 (stok kritis)
dianggap "normal", bukan error.

### `scripts/laporan-harian.js` — Pembuat Laporan AI
Baca `transaksi.csv` + `stok.csv`, hitung omzet/top-produk/stok-kritis,
kirim prompt ke AI (Groq → fallback Gemini). Timezone dari `.env`
(default WITA). Mode `--test` membuat laporan lokal tanpa panggil API.

### `scripts/cek-stok.js` — Monitor Stok
Kelompokkan: **Kritis** (≤ stok_kritis), **Rendah** (≤ stok_minimum), **Aman**.
`process.exit(2)` = selesai dengan peringatan stok kritis.

### `scripts/backup.js` — Backup Otomatis
Backup CSV/JSON penting; rotasi otomatis simpan **7 hari terakhir** (folder
diurut alfabet = kronologis karena format tanggal YYYY-MM-DD).

### `scripts/blockchain-logger.js` — Audit Trail
Hash-chain SHA-256 lokal: tiap blok simpan `prevHash`. Ubah data lama → hash
tak cocok → kecurangan terdeteksi. `verifikasiChain()` cek integritas.

### `scripts/rbac.js` — Role & Permission
Definisi role (`IZIN`), `AI_INTENTS` (intent yang butuh approval owner), dan
`OWNER_ONLY` (intent khusus owner, mis. `GANTI_MODEL`). Lihat bagian 17.1.

### `scripts/redis.js` — Klien Upstash Redis
`get/set/del/incr` via REST. Jembatan data VPS → dashboard Vercel.
Aman saat env kosong (`tersedia()` → false, sync di-skip).

### `scripts/security.js` — Modul Keamanan
`sanitizeInput()` (potong 200 char, buang karakter kontrol), `sanitizeCsvField()`
(cegah CSV/formula injection), `cekRateLimit()` (maks 20 perintah/menit per user),
`isPhoneAllowed()` (whitelist dengan normalisasi format nomor).

---

## 9. TELEGRAM BOT

> Folder masih bernama `signal/` (dipertahankan agar `require()` & npm scripts tak
> berubah), tapi transport-nya kini **Telegram Bot API**.

### `signal/bot-handler.js` — Otak Bot
- `tgApi(method, params)` — semua komunikasi ke Telegram via POST JSON. Karena body
  JSON (bukan argumen shell), input user **tak pernah dieksekusi sebagai perintah**.
- `kirimPesan()` — coba `parse_mode: Markdown`, fallback teks polos; pesan panjang
  dipecah maks 4096 char (batas Telegram).
- `mulaiPolling()` — `getUpdates` long polling (timeout 30 dtk), **tanpa webhook**.
- Verifikasi: pengirim harus di `TELEGRAM_WHITELIST` atau anggota grup terdaftar.
- **Penting:** hanya boleh **satu** instance polling. Dua proses = error `409 Conflict`.

### `signal/intent-detector.js` — Pengenal Perintah
Kumpulan regex memetakan teks → intent + parameter. Perintah berparameter
(JUAL, TAMBAH_STOK, HARGA) dicek lebih dulu karena polanya spesifik. Teks tak
dikenal → diteruskan ke AI sebagai chat bebas.

### `signal/intent-handlers.js` — Eksekusi Intent
Satu `case` per intent: panggil skill PicaMan via `bridge.js`, format hasil.

### `signal/ai-handler.js` — Lapisan AI
`tanyaGroq()` / `tanyaGemini()` + logika fallback otomatis & pencatatan token.

### `signal/delegation-policy.js` — Lokal vs AI
`LOCAL_INTENTS` diproses tanpa AI (hemat token); sisanya boleh memanggil AI.

---

## 10. PICAMAN — SKILL PYTHON

**PicaMan** = nama mesin skill. `signal/bridge.js` menjembatani Node → Python:

- `callSkill(skill, action, params)` → `spawnSync('python3', ['skills/<skill>.py'])`,
  kirim `{action, params}` sebagai JSON lewat file stdin, baca JSON dari stdout.
- **Cache baca:** aksi read-only (mis. `stok/cek`, `laporan/ringkas`) di-cache sesuai
  TTL (`_CACHE_TTL`) agar tidak spawn Python berulang.
- **Invalidasi tulis:** aksi tulis (`stok/jual`, `harga/update`, …) mem-flush cache
  skill + cache terkait (`_CASCADE_INVALIDATE`, mis. ubah `stok` → reset `laporan`/`harga`).
- **Timeout 15 dtk** per panggilan; output non-JSON dianggap error.

> Skill Python **hanya pakai stdlib** — tidak ada `pip install`, jadi setup ringan
> dan hemat RAM (proses Python sesaat lalu mati).

Daftar skill: `stok`, `harga`, `laporan`, `promo`, `supplier`, `bahasa`, `saran`,
`memory-chat`, `notif`, `self-learner` (Python); `kasir`, `gudang`, `cuaca`,
`market-intel`, `web-search`, `learning-engine`, `self-debug` (JS).

---

## 11. DASHBOARD NEXT.JS (VERCEL)

Dashboard **read-only** untuk pantau kios dari web. Data dibaca dari Upstash Redis
(diisi VPS), bukan akses langsung ke VPS.

- **`middleware.js`** — penjaga `/api/*`: rate limit sliding window (60 req/menit/IP)
  + cek `DASHBOARD_API_KEY` (aktif jika key > 10 char).
- **`next.config.js`** — security headers (X-Frame-Options, CSP, HSTS, dll),
  `poweredByHeader: false`.
- **`app/page.js`** — Client Component; fetch 3 API paralel (`Promise.all`),
  auto-refresh tiap 5 menit, `clearInterval` saat unmount (cegah memory leak).
- **Komponen:** `StokTable` (badge kritis/rendah/aman), `AlertBanner` (maks 5 item),
  `TransaksiChart` (grafik omzet 7 hari via recharts).
- **API:** `/api/stok`, `/api/transaksi` (validasi `limit` maks 500), `/api/laporan`.

---

## 12. KEAMANAN SISTEM

| # | Lapisan | Implementasi | Melindungi dari |
|---|---------|-------------|-----------------|
| 1 | Command Injection | `tgApi()` POST JSON; `spawnSync(cmd, [args])` | Perintah berbahaya via pesan |
| 2 | Whitelist + RBAC | `isPhoneAllowed()` + `rbac.js` | Bot dikendalikan orang asing |
| 3 | Rate Limiting | `cekRateLimit()` (bot) + middleware (dashboard) | Spam & brute force |
| 4 | Input Sanitization | `sanitizeInput()` | Karakter kontrol tersembunyi |
| 5 | CSV Injection | `buatBarisCsvAman()` | Formula berbahaya di spreadsheet |
| 6 | AI Approval Gate | `pendingAIApprovals` + role `irma` | Pemakaian token AI tak terkontrol |
| 7 | API Authentication | `middleware.js` (`DASHBOARD_API_KEY`) | Akses tak sah ke dashboard |
| 8 | Security Headers | `next.config.js` | XSS, clickjacking, MIME sniffing |
| 9 | URL Safety | `scripts/url-safety.js` | SSRF / URL berbahaya di web-search |
| 10 | Audit Trail | `blockchain-logger.js` | Manipulasi data transaksi lama |

---

## 13. JADWAL OTOMATIS (node-cron)

Semua jadwal berjalan **di dalam proses bot** via `cron/scheduler.js`
(`cron/handlers.js` = implementasinya). Timezone **WITA (Asia/Makassar)**.
**Tidak perlu** cron sistem / Windows Task Scheduler.

| Waktu (WITA) | Tugas | Format Cron |
|--------------|-------|-------------|
| 01:30 | Ringkas queue belajar | `30 1 * * *` |
| 02:00 | Sesi belajar mandiri bot | `0 2 * * *` |
| 02:30 | Apply AI batch → base-patterns | `30 2 * * *` |
| 03:00 | Bersihkan memori percakapan grup (>1 hari) | `0 3 * * *` |
| 06:00 | Riset & banding harga top 10 produk | `0 6 * * *` |
| 06:30 | Saran PicaMan (pagi) | `30 6 * * *` |
| 07:00 | Alert gudang + cuaca | `0 7 * * *` |
| 08:00 (Senin) | Riset harga pasar mingguan | `0 8 * * 1` |
| 12:00 | Saran PicaMan (siang) | `0 12 * * *` |
| 20:00 | Laporan harian | `0 20 * * *` |
| 23:00 | Laporan belajar + self-improvement | `0 23 * * *` |
| tiap 30 mnt | Cek gelombang (musim angin Apr–Nov) | `*/30 * * * *` |

> Ubah jadwal di `cron/scheduler.js`; tambah/ubah implementasi di `cron/handlers.js`.

---

## 14. REFERENSI PERINTAH BOT

Semua perintah dikirim sebagai pesan Telegram ke bot. Nama produk **tidak harus
persis** (fuzzy match). Harga boleh `15.000` / `15,000` / `Rp15.000` → jadi `15000`.

### Jual / Penjualan
| Perintah | Contoh |
|---|---|
| `jual [produk] [qty]` | `jual beras 2` |
| `jual [produk] [qty] tunai/qris/transfer` | `jual gula 1 qris` |
| `jual [produk] [qty] tunai bayar [nominal]` | `jual minyak 1 tunai bayar 20000` |

**Jual massal:**
```
jual banyak:
Gula Pasir | 2
Beras | 1
```
Atau: `jual banyak: gula 2, beras 1, minyak 3`

### Beli / Restock
| Perintah | Contoh |
|---|---|
| `beli [produk] [qty]` | `beli gula 50` |
| `beli [produk] [qty] harga [harga_beli]` | `beli beras 20 harga 68000` |
| `beli [produk] [qty] @ [harga]` | `beli minyak 12 @ 15000` |

**Restock massal:**
```
restock massal:
Gula Pasir | 50 | 13000
Beras | 100 | 68000
```

### Stok & Inventaris
| Perintah | Keterangan |
|---|---|
| `stok` | Lihat semua stok |
| `cari [produk]` | Cari detail produk |
| `harga [produk]` / `cek harga [produk]` | Cek harga jual |
| `harga pasar [produk]` / `harga kompetitif [produk]` | Analisis daya saing harga |
| `exp` | Produk hampir kadaluarsa |
| `produk mau habis` | Stok kritis / menipis |
| `opname [produk] [stok_fisik]` | Sinkron stok fisik |
| `mutasi [produk]` | Riwayat keluar-masuk stok |
| `produk baru` / `produk baru minggu ini` | Produk baru |

### Laporan
| Perintah | Keterangan |
|---|---|
| `laporan` | Ringkasan hari ini |
| `laporan mingguan` / `laporan bulanan` | Rekap |
| `laba` | Laba/rugi hari ini |
| `riwayat` | Transaksi terakhir |
| `produk terlaris` | Top 10 produk |
| `riwayat harga [produk]` | Histori perubahan harga |

### Tambah / Edit Produk
| Perintah | Contoh |
|---|---|
| `ubah harga [produk] jadi [harga]` | `ubah harga gula jadi 15000` |
| `hapus produk [nama]` | `hapus produk gula merah` |

**Tambah produk massal** (format: `nama \| kategori \| satuan \| harga_jual \| harga_beli \| stok`):
```
tambah produk massal:
Susu Kaleng | sembako | pcs | 16000 | 14000 | 20
```

### Shift Kasir
| Perintah | Contoh |
|---|---|
| `buka shift [saldo_awal]` | `buka shift 500000` |
| `tutup shift [saldo_akhir]` | `tutup shift 750000` |
| `status shift` | Info shift aktif |

### Promo & Diskon
| Perintah | Contoh |
|---|---|
| `buat promo [produk] [nilai]%` | `buat promo gula 10%` |
| `buat promo [produk] [nilai] rb` | `buat promo minyak 2 rb` |
| `lihat promo` / `hapus promo PROMO-0001` | Kelola promo |

### Supplier
| Perintah | Contoh |
|---|---|
| `tambah supplier [nama]` | `tambah supplier Pak Ahmad` |
| `daftar supplier` / `cari supplier [nama]` | Lihat/cari |

### Cuaca & Pasokan
| Perintah | Keterangan |
|---|---|
| `cuaca` | Info cuaca & gelombang BMKG |
| `kapal` | Status kapal pasokan |

### Sistem & AI
| Perintah | Keterangan |
|---|---|
| `status` | Status sistem & uptime |
| `performa` | Laporan performa bot |
| `laporan belajar` | Apa yang dipelajari bot hari ini |
| `shortcut` | Daftar pintasan |
| `backup` | Backup data manual |
| `bantuan` | Panduan singkat |

### Perintah Bebas (AI)
Kirim pesan biasa, bot menjawab pakai AI dengan konteks stok terkini, mis.
_"rekomendasikan produk apa yang perlu direstok"_.

### Kelola User (owner only)
| Perintah | Contoh |
|---|---|
| `tambah kasir [nama] [nomor]` | `tambah kasir Budi +628123456789` |
| `tambah viewer [nama] [nomor]` | `tambah viewer Sari +628987654321` |
| `tambah irma [nama] [nomor]` | `tambah irma Asisten +628111222333` |
| `daftar kasir` | Lihat semua user aktif |
| `hapus kasir [nomor]` / `hapus irma [nomor]` | Hapus user |

**Beda role:** `owner` (semua, tanpa approval AI) · `irma` (semua, **tiap pakai AI
butuh approval owner**) · `kasir` (jual + lihat + shift) · `viewer` (lihat saja).

### Ganti AI Model (owner only)
| Perintah | Contoh |
|---|---|
| `daftar model` | Lihat semua model + status key |
| `ganti ai utama [id]` | `ganti ai utama gemini_flash_20` |
| `ganti ai cadangan [id]` | `ganti ai cadangan groq_llama4_scout` |
| `ganti ai batch [id]` | `ganti ai batch groq_llama31_8b` |
| `reset ai utama` | Kembali ke default registry |

Model ID: `groq_llama4_scout`, `groq_llama31_8b`, `gemini_flash_20`. Tambah model
baru → edit `config/models.js` (lihat 17.2).

---

## 15. INSTRUKSI DEPLOY

### 15.1 Isi API Keys di `.env`

```bash
cp .env.example .env
nano .env
```

Wajib diisi:
```
GROQ_API_KEY=gsk_...            # dari console.groq.com (GRATIS)
GEMINI_API_KEY=AIza...          # dari aistudio.google.com (GRATIS)
TELEGRAM_BOT_TOKEN=123456:ABC-... # dari @BotFather
TELEGRAM_GROUP_ID=-1001234567890  # chat id grup (angka negatif)
TELEGRAM_RECIPIENT=123456789      # user id owner
TELEGRAM_WHITELIST=123456789      # user id yang boleh kirim perintah (pisah koma)
```
Opsional (sync dashboard) — dari dashboard Upstash:
```
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
DASHBOARD_API_KEY=...             # token keamanan API dashboard
```

### 15.2 Test Lokal

```bash
npm install
npm run cek-stok        # Cek stok
npm run test:laporan    # Test laporan (tanpa panggil API)
node signal/bot-handler.js   # Test bot (Ctrl+C untuk stop)
```

### 15.3 Setup Bot Telegram

1. Buka [@BotFather](https://t.me/BotFather) → `/newbot` → salin **bot token**.
2. Buat grup, tambahkan bot, **jadikan bot admin** (untuk link undangan & kelola member).
3. Dapatkan `TELEGRAM_GROUP_ID`: tambahkan [@RawDataBot](https://t.me/RawDataBot)
   sementara ke grup, atau cek `logs/signal.log` saat ada pesan grup masuk
   (chat id grup biasanya `-100...`).
4. Isi `.env` (lihat 15.1).
5. Verifikasi & ambil link undangan grup:
   ```bash
   npm run signal:setup
   ```

### 15.4 Deploy 24/7 ke VPS Oracle Cloud (Linux)

Bot pakai **long polling** → tidak butuh domain, port masuk, atau webhook. Cocok
dengan **Oracle Cloud Always Free** (gratis selamanya). Lihat bagian 2 untuk
rekomendasi RAM (1 GB E2.1.Micro nyaman; 6 GB Ampere A1.Flex ideal).

**a) Buat VM**
1. [cloud.oracle.com](https://cloud.oracle.com) → **Compute → Instances → Create Instance**.
2. Image **Ubuntu 22.04/24.04**. Shape: **Ampere (ARM) A1.Flex** (1 OCPU / 6 GB)
   atau **E2.1.Micro** (1 GB). Keduanya Always Free.
3. Simpan **SSH private key**.
4. **Tidak perlu** buka port di Security List — bot hanya butuh koneksi keluar.

**b) Masuk & ambil kode**
```bash
ssh -i kunci-private.key ubuntu@<IP_PUBLIK_VM>
git clone https://github.com/autolineinkupang-rgb/autoline_kiosopenclaw.git
cd autoline_kiosopenclaw
git checkout telegram          # branch transport Telegram
```

**c) Isi `.env`** (lihat 15.1):
```bash
cp .env.example .env && nano .env
```

**d) Setup otomatis (Node 20 + Python 3 + PM2 + dependency)**
```bash
bash scripts/vps-setup.sh
```
Skrip ini memasang Node.js 20, Python 3, PM2, `npm install --omit=dev`, lalu start
bot via PM2. Di akhir PM2 mencetak satu perintah `sudo env ...` —
**jalankan perintah itu** agar bot otomatis hidup lagi setelah VM reboot.

**e) Verifikasi & operasional**
```bash
npm run signal:setup     # verifikasi token & ambil link grup (sekali)
pm2 status               # cek bot hidup
pm2 logs kios-bot        # log real-time
pm2 restart kios-bot     # restart manual
```

**f) Update kode ke depannya**
```bash
cd autoline_kiosopenclaw
git pull
npm install --omit=dev
pm2 reload kios-bot      # restart tanpa downtime berarti
```

> Laporan terjadwal sudah ditangani `node-cron` **di dalam** proses bot — tidak perlu
> cron sistem di VPS.

### 15.5 Deploy Dashboard ke Vercel (terpisah dari VPS)

```bash
cd dashboard
npm install
npx vercel login
npx vercel --prod        # pilih nama project, mis. kiossaya
```
Set env yang sama (`UPSTASH_REDIS_REST_URL/_TOKEN`, `DASHBOARD_API_KEY`) di
**Vercel Dashboard → Settings → Environment Variables**. Dashboard live di
`https://<nama>.vercel.app`.

**Setup Upstash Redis (jembatan data):**
- Buat database di [console.upstash.com](https://console.upstash.com) (free tier).
- Salin `UPSTASH_REDIS_REST_URL` & `_TOKEN` ke `.env` VPS **dan** ke env Vercel.
- VPS menulis ringkasan data ke Redis; dashboard Vercel membacanya (read-only).

---

## 16. PANDUAN BACA ERROR

| Error | Penyebab | Solusi |
|-------|----------|--------|
| `ENOENT: no such file or directory` | File CSV/konfigurasi hilang | Jalankan ulang setup atau buat file yang hilang |
| `Groq gagal ... coba Gemini` | Groq timeout/rate limit | Normal — fallback otomatis ke Gemini |
| `getUpdates error: ... 409` | Ada instance bot lain polling | Pastikan hanya **satu** `kios-bot` jalan (`pm2 status`) |
| `Token Telegram tidak valid` | `TELEGRAM_BOT_TOKEN` salah/kosong | Cek token dari @BotFather, set di `.env` |
| `⛔ Ditolak dari ...` | User ID tak ada di whitelist | Tambahkan ke `TELEGRAM_WHITELIST` di `.env` |
| `⏱️ Rate limit tercapai` | > 20 perintah/menit | Tunggu 1 menit |
| `Stok tidak cukup` | Qty > stok | Cek dengan `stok` |
| `[<skill>.py] ...` | Skill Python error | Cek input & lihat `logs/signal.log` |
| PM2 sering restart | RAM > 400 MB atau crash | `pm2 logs kios-bot`, cek leak/error |
| `exit code 2` | Ada stok kritis | Normal — peringatan, bukan error |

**Cara baca log** (folder `logs/`):
```
[2026-05-17 08:30:15 WITA] [cron] ✅ Checkpoint #42 disimpan
  ↑ Timestamp                ↑ Sumber  ↑ Pesan
```
File: `signal.log` (bot & cron), `laporan.log`, `stok.log`, `backup.log`,
`startup.log`, `pm2-out.log` / `pm2-error.log` (PM2).

---

## 17. FITUR LANJUTAN & CHEAT SHEET

### 17.1 Role `irma` + Approval Gate AI
Role `irma` = akses penuh seperti owner, **tapi** tiap pakai fungsi AI, bot kirim
notifikasi ke owner; owner balas `aprove` (atau `setuju`/`oke`/`ya`) → AI jalan.
Owner bisa kasih akses lebar ke asisten tanpa khawatir token AI dipakai sembarangan.

| File | Isi |
|---|---|
| `scripts/rbac.js` | `AI_INTENTS` (intent butuh approval), `OWNER_ONLY` |
| `signal/bot-handler.js` | `pendingAIApprovals` Map, `antriAIApproval()`, `cekBalasanApprovalAI()`, `jalankanAIYangDisetujui()` |
| `signal/intent-detector.js` | `RE.KELOLA_USER` (match `tambah irma`/`hapus irma`) |

- Ubah TTL approval (default 5 mnt): `AI_APPROVAL_TTL_MS` di `bot-handler.js`, format `menit * 60_000`.
- Ubah kata kunci balasan: regex di `cekBalasanApprovalAI()`.

### 17.2 Tambah Model AI Baru
1. `config/models.js` → tambah entry di `DAFTAR_MODEL`:
   ```js
   openai_gpt4: { provider:'openai', nama:'GPT-4', model_id:'gpt-4-turbo',
     env_key:'OPENAI_API_KEY', peran:'primary', max_tokens:1024, temperature:0.3, timeout_ms:8000 }
   ```
2. Set `OPENAI_API_KEY=sk-...` di `.env`.
3. **Provider baru** juga perlu fungsi baru di `signal/ai-handler.js`
   (mis. `tanyaOpenAI()` mirip `tanyaGroq()`).
4. Restart bot → owner ketik `ganti ai utama openai_gpt4`.

Reset semua override: `echo "{}" > data/ai-models.json`.

### 17.3 Bug Tracking & Self-Debug
`skills/self-debug.js` otomatis catat error runtime ke `data/bug-report.json`
(`bug_id`, `error_type`, `location`, `root_cause`, `fix_applied`, `test_result`,
`prevention_rule`). `fix_applied: null` = belum di-fix.

### 17.4 Memory Leak Prevention
Map state in-memory dibersihkan otomatis:

| Map | Cleanup |
|---|---|
| `pendingConfirmations` | Saat `cekKonfirmasi()` (cek TTL) |
| `pendingAIApprovals` / `ownerPendingApproval` | `setInterval` tiap 60 dtk hapus yang expired |
| `pendingRpc` | Per-request `setTimeout` |
| PicaMan `_cache` (bridge.js) | TTL + batas 120 entri (buang terlama) |

Kalau RAM bengkak: `pm2 logs kios-bot` cek pesan cleanup; `pm2 restart kios-bot`.

### 17.5 Cheat Sheet — Mau ubah apa, buka file mana?

| Mau ubah | File |
|---|---|
| Tambah/ubah role & permission | `scripts/rbac.js` |
| Tambah perintah baru | `signal/intent-detector.js` (regex) + `signal/intent-handlers.js` |
| Ganti format respons | `signal/response-formatter.js` |
| Ganti / tambah AI model | `config/models.js` |
| Tambah skill Python | Buat `skills/<nama>.py`, daftar di `signal/bridge.js` |
| Ganti jadwal otomatis | `cron/scheduler.js` (jadwal) + `cron/handlers.js` (logika) |
| Batas RAM / perilaku PM2 | `config/ecosystem.config.js` |
| Edit data stok/user manual | `data/stok.csv` / `data/users.json` |
| Ganti owner | `.env` → `TELEGRAM_WHITELIST` (user id, pisah koma) |

---

*Dokumentasi gabungan (teknis + perintah + deploy) — Kios Openclaw v5.1*
*Ruflo, Rote Barat Laut, NTT. Untuk pertanyaan teknis, jalankan Claude Code di folder ini.*
