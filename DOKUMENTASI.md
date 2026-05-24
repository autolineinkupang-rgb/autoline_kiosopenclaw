# DOKUMENTASI LENGKAP — KIOS OPENCLAW v1.0
### Sistem Manajemen Kios Desa berbasis AI
**Pemilik:** Ruflo | **Dibuat:** 17 Mei 2026

---

## DAFTAR ISI

1. [Gambaran Umum Sistem](#1-gambaran-umum-sistem)
2. [Struktur Folder](#2-struktur-folder)
3. [Alur Kerja Sistem](#3-alur-kerja-sistem)
4. [File Konfigurasi](#4-file-konfigurasi)
5. [File Data CSV](#5-file-data-csv)
6. [File Memory](#6-file-memory)
7. [Scripts Utama](#7-scripts-utama)
8. [Telegram Bot](#8-telegram-bot)
9. [Dashboard Next.js](#9-dashboard-nextjs)
10. [File Root Project](#10-file-root-project)
11. [Keamanan Sistem](#11-keamanan-sistem)
12. [Jadwal Otomatis](#12-jadwal-otomatis)
13. [Panduan Baca Error](#13-panduan-baca-error)

---

## 1. GAMBARAN UMUM SISTEM

Kios Openclaw adalah sistem manajemen kios desa yang bekerja secara otomatis menggunakan AI. Sistem ini dirancang untuk:

- **Hemat biaya** — semua layanan gratis (Groq, Gemini, Vercel)
- **Hemat internet** — cocok untuk koneksi < 10 Mbps
- **Otomatis** — laporan terkirim otomatis 3x sehari
- **Mudah digunakan** — cukup kirim perintah via Telegram

### Teknologi yang Digunakan

| Komponen | Teknologi | Biaya |
|----------|-----------|-------|
| Backend/Scripts | Node.js v20 | Gratis |
| AI Utama | Groq Llama 4 Scout | Gratis |
| AI Cadangan | Google Gemini 2.0 Flash | Gratis |
| Chat/Bot | Telegram + Bot API | Gratis |
| Dashboard Web | Next.js 15 | Gratis |
| Hosting Dashboard | Vercel | Gratis selamanya |
| Database | File CSV lokal | Gratis |
| Penjadwalan | Windows Task Scheduler | Bawaan Windows |

### Cara Kerja Singkat

```
Ruflo kirim pesan Telegram
        ↓
Bot menerima & verifikasi pengirim (whitelist)
        ↓
Perintah diproses (stok/jual/laporan/dll)
        ↓
Data diambil dari file CSV lokal
        ↓
Jika perlu AI → Groq (utama) atau Gemini (cadangan)
        ↓
Hasil dikirim balik ke Telegram
        ↓
Dashboard Vercel menampilkan data real-time
```

---

## 2. STRUKTUR FOLDER

```
kios-openclaw/
│
├── config/                    ← Pengaturan sistem
│   ├── openclaw.json          ← Konfigurasi AI, jadwal, alert
│   ├── agent-kios.yaml        ← Instruksi perilaku AI (system prompt)
│   └── rufo.config.js         ← Konfigurasi task batching Ruflo
│
├── data/                      ← Database dalam format CSV
│   ├── stok.csv               ← Daftar produk + jumlah stok
│   ├── pulsa.csv              ← Daftar produk pulsa & token PLN
│   └── transaksi.csv          ← Riwayat semua transaksi penjualan
│
├── memory/                    ← Memori sistem (status real-time)
│   ├── kios-memory.json       ← Status harian, AI, Telegram, sistem
│   ├── checkpoint.json        ← Riwayat snapshot per 5 menit
│   └── pending-tasks.json     ← Antrian tugas yang belum selesai
│
├── scripts/                   ← Program otomatis
│   ├── laporan-harian.js      ← Buat & kirim laporan 3x sehari
│   ├── cek-stok.js            ← Monitor stok, alert jika kritis
│   ├── backup.js              ← Backup otomatis data setiap malam
│   ├── cctv-snapshot.js       ← Ambil foto dari kamera CCTV
│   ├── blockchain-logger.js   ← Catat transaksi ke chain lokal
│   ├── memory-checkpoint.js   ← Simpan snapshot memori tiap 5 menit
│   ├── startup.js             ← Titik masuk utama sistem
│   └── security.js            ← Fungsi keamanan bersama
│
├── signal/                    ← Bot Telegram (nama folder dipertahankan)
│   ├── bot-handler.js         ← Menerima & memproses perintah
│   ├── message-parser.js      ← Mengurai teks perintah
│   └── response-formatter.js  ← Format pesan balasan
│
├── dashboard/                 ← Website monitoring (Vercel)
│   ├── app/
│   │   ├── layout.js          ← Template HTML (header/footer)
│   │   ├── page.js            ← Halaman utama dashboard
│   │   ├── globals.css        ← Style global
│   │   └── api/
│   │       ├── stok/route.js      ← API endpoint data stok
│   │       ├── transaksi/route.js ← API endpoint transaksi
│   │       └── laporan/route.js   ← API endpoint laporan harian
│   ├── components/
│   │   ├── StokTable.js       ← Komponen tabel daftar stok
│   │   ├── AlertBanner.js     ← Komponen banner peringatan
│   │   └── TransaksiChart.js  ← Komponen grafik omzet mingguan
│   ├── middleware.js          ← Penjaga keamanan API (auth + rate limit)
│   ├── next.config.js         ← Konfigurasi Next.js + security headers
│   └── vercel.json            ← Pengaturan deploy ke Vercel
│
├── logs/                      ← File catatan aktivitas
│   ├── laporan.log            ← Log laporan harian
│   ├── stok.log               ← Log pengecekan stok
│   ├── checkpoint.log         ← Log checkpoint memori
│   ├── signal.log             ← Log aktivitas bot Telegram
│   ├── backup.log             ← Log backup harian
│   └── blockchain.log         ← Log blockchain logger
│
├── .env                       ← API keys & konfigurasi rahasia (JANGAN di-commit)
├── .env.example               ← Template .env yang aman untuk GitHub
├── .gitignore                 ← Daftar file yang tidak ikut ke GitHub
├── package.json               ← Daftar dependencies & npm scripts
└── INSTRUKSI-DEPLOY.md        ← Panduan deploy ke Vercel
```

---

## 3. ALUR KERJA SISTEM

### A. Startup (saat pertama kali dijalankan)

```
npm start  →  scripts/startup.js
                    ↓
         Cek file wajib ada (stok.csv, openclaw.json, kios-memory.json)
                    ↓
         Jalankan cek-stok.js  →  tampilkan status stok
                    ↓
         Jalankan laporan-harian.js --test  →  test laporan
                    ↓
         Jalankan memory-checkpoint.js di background (setiap 5 menit)
                    ↓
         Sistem siap beroperasi
```

### B. Alur Penjualan via Telegram

```
Ruflo: "jual mie instan goreng 5"
            ↓
bot-handler.js: verifikasi pengirim (whitelist)
            ↓
message-parser.js: urai perintah → { tipe: JUAL, produk: "mie instan goreng", qty: 5 }
            ↓
validasiPerintah(): qty harus > 0 dan angka
            ↓
catatJual(): cari produk di stok.csv → kurangi stok → catat ke transaksi.csv
            ↓
response-formatter.js: format pesan konfirmasi
            ↓
Ruflo terima: "✅ TRANSAKSI DICATAT — Mie Instan Goreng x5 = Rp 17.500"
```

### C. Alur Laporan Otomatis (3x sehari)

```
Windows Task Scheduler: jam 06:00 / 12:00 / 20:00
            ↓
node scripts/laporan-harian.js
            ↓
Baca transaksi.csv + stok.csv
            ↓
Hitung omzet, produk terlaris, stok kritis
            ↓
Kirim prompt ke Groq AI
            ↓ (jika Groq gagal/timeout)
Coba Gemini sebagai fallback
            ↓
Hasil laporan dikirim ke Telegram Ruflo
```

---

## 4. FILE KONFIGURASI

### `config/openclaw.json`

File JSON utama yang mengatur perilaku seluruh sistem.

```json
{
  "ai": {
    "primary": {
      "provider": "groq",
      "model": "meta-llama/llama-4-scout-17b-16e-instruct",
```

**Penjelasan setiap bagian:**

- **`ai.primary`** — AI utama yang dipakai untuk membuat laporan
  - `provider: "groq"` → pakai layanan Groq (gratis)
  - `model` → nama model AI spesifik: Llama 4 Scout (lebih cepat dari ChatGPT)
  - `max_tokens: 1024` → batas panjang jawaban AI (hemat kuota)
  - `temperature: 0.3` → angka 0-1, makin rendah makin konsisten/kaku, makin tinggi makin kreatif
  - `timeout_ms: 8000` → jika AI tidak respons dalam 8 detik, pindah ke fallback
  - `retry: 2` → coba ulang 2 kali jika gagal

- **`ai.fallback`** — AI cadangan jika Groq tidak bisa diakses
  - `provider: "gemini"` → pakai Google Gemini
  - `model: "gemini-2.0-flash"` → versi cepat Gemini

- **`kios`** — identitas kios
  - `jam_buka/tutup` → digunakan untuk menentukan "sesi" laporan
  - `timezone: "Asia/Makassar"` → WITA (UTC+8), penting agar laporan tidak salah waktu

- **`jadwal`** — format cron (digunakan Windows Task Scheduler)
  - `"0 6 * * *"` = setiap hari jam 06:00
  - `"0 */3 * * *"` = setiap 3 jam sekali
  - `"*/5 * * * *"` = setiap 5 menit

- **`alert.stok_kritis: 2`** → jika stok ≤ 2 unit, kirim alert MERAH
- **`alert.stok_minimum: 5`** → jika stok ≤ 5 unit, kirim alert KUNING

---

### `config/agent-kios.yaml`

File YAML berisi "kepribadian" dan instruksi untuk AI.

```yaml
system_prompt: |
  Kamu adalah asisten AI untuk manajemen Kios Desa Maju milik Ruflo.
```

- **`system_prompt`** — teks ini dikirim ke AI sebelum pertanyaan, memberitahu AI cara berperilaku
- **`jadwal`** — daftar tugas terjadwal beserta formatnya (ringkas/lengkap)
- **`prompt_templates`** — template teks yang diisi data sebelum dikirim ke AI
  - Contoh: `{omzet}` diganti angka omzet sebenarnya
  - Ini menghemat token karena AI tidak perlu menebak format

---

### `config/rufo.config.js`

Konfigurasi sistem Ruflo untuk mengelola task secara efisien.

```javascript
module.exports = {
  batch: {
    enabled: true,
    maxConcurrent: 3,   // Max 3 task berjalan bersamaan
    delayBetweenMs: 200 // Jeda 200ms antar task
  },
```

- **`batch`** — menjalankan beberapa task sekaligus untuk hemat waktu
  - `maxConcurrent: 3` → maksimal 3 proses paralel (tidak membebani RAM 8GB)
  - `delayBetweenMs: 200` → jeda antar task agar tidak kena rate limit API

- **`cache`** → file konfigurasi yang jarang berubah tidak dibaca ulang
  - Cara kerja: simpan hash (sidik jari) file, jika sama = tidak perlu baca ulang

- **`diff`** → saat update file, hanya kirim bagian yang berubah (hemat bandwidth desa)

- **`progress.continueOnError: true`** → jika 1 task gagal, lanjut ke task berikutnya (tidak berhenti total)

---

## 5. FILE DATA CSV

### `data/stok.csv`

Database utama produk kios. Format tabel dengan pemisah koma.

```
id,nama,kategori,satuan,stok,harga_beli,harga_jual,stok_minimum,stok_kritis,supplier,last_update
001,Beras Premium 5kg,sembako,karung,25,62000,70000,10,3,Pak Haji Soleh,2026-05-17
```

**Penjelasan setiap kolom:**

| Kolom | Penjelasan | Contoh |
|-------|-----------|--------|
| `id` | Kode unik produk | 001 |
| `nama` | Nama lengkap produk | Beras Premium 5kg |
| `kategori` | Jenis produk | sembako / snack / minuman |
| `satuan` | Unit hitungan | karung / botol / bungkus |
| `stok` | **Jumlah saat ini** — berubah saat ada penjualan | 25 |
| `harga_beli` | Harga beli dari supplier | 62000 |
| `harga_jual` | Harga jual ke pembeli | 70000 |
| `stok_minimum` | Batas KUNING — mulai perlu restock | 10 |
| `stok_kritis` | Batas MERAH — harus restock segera | 3 |
| `supplier` | Nama pemasok | Pak Haji Soleh |
| `last_update` | Tanggal terakhir stok diubah | 2026-05-17 |

**Cara sistem membaca:** Script menggunakan library `csv-parse` untuk membaca file ini menjadi array object JavaScript yang mudah diolah.

---

### `data/pulsa.csv`

Database produk pulsa dan token PLN. Berbeda dari stok biasa karena stok selalu 999 (stok virtual).

```
id,operator,nominal,harga_beli,harga_jual,tipe,stok,aktif
P001,Telkomsel,10000,9700,11000,pulsa,999,true
```

- `stok: 999` → pulsa tidak habis secara fisik, hanya membutuhkan saldo di aplikasi top-up
- `aktif: true/false` → bisa dinonaktifkan tanpa dihapus jika operator tidak tersedia
- `tipe: pulsa / token_listrik` → membedakan jenis produk

---

### `data/transaksi.csv`

Riwayat semua penjualan. Awalnya hanya berisi baris header, terisi saat ada transaksi.

```
id,tanggal,jam,produk_id,nama_produk,kategori,qty,harga_satuan,total,metode_bayar,kasir,catatan
TX1716001234,2026-05-17,08:30:00,008,Mie Instan Goreng,snack,5,3500,17500,tunai,signal-bot,
```

- `id: TX + timestamp` → setiap transaksi punya ID unik berdasarkan waktu (tidak bisa duplikat)
- `kasir: "signal-bot"` → transaksi dicatat otomatis dari perintah Telegram (label data sengaja dipertahankan)
- File ini **hanya ditambah** (append), tidak pernah dihapus — menjaga audit trail

---

## 6. FILE MEMORY

### `memory/kios-memory.json`

Otak sistem — menyimpan status real-time kios. Diupdate setiap kali ada aktivitas.

```json
{
  "harian": {
    "tanggal": "2026-05-17",
    "total_transaksi": 15,
    "omzet": 250000,
    "stok_kritis": ["Kopi Sachetan", "Snack Ringan Mix"]
  },
  "ai": {
    "provider_aktif": "groq",
    "total_token_digunakan": 4521,
    "fallback_count": 1
  }
}
```

**Bagian-bagian memory:**

- **`harian`** — reset setiap hari, berisi ringkasan hari berjalan
- **`bulanan`** — akumulasi omzet bulan ini
- **`alert.pending`** — alert yang belum dikirim (jika Telegram tidak aktif)
- **`ai`** — statistik penggunaan AI (berapa kali Groq gagal, berapa token terpakai)
- **`signal.status`** → `"connected"` atau `"disconnected"`
- **`system.startup_time`** → kapan sistem terakhir dinyalakan

**Mengapa menggunakan JSON bukan database?** Karena koneksi desa lemah dan JSON cukup untuk skala kios kecil. Tidak perlu install MySQL/PostgreSQL.

---

### `memory/checkpoint.json`

Riwayat snapshot sistem setiap 5 menit. Seperti "titik simpan" game.

```json
{
  "checkpoints": [
    {
      "id": 1,
      "ts": "2026-05-17T08:28:01.053Z",
      "snapshot": {
        "omzet_harian": 0,
        "total_tx": 0,
        "stok_kritis": [],
        "ai_provider": "groq"
      }
    }
  ],
  "last_id": 1,
  "max_keep": 288
}
```

- `max_keep: 288` → simpan maksimal 288 checkpoint = 24 jam × 12 (setiap 5 menit)
- Checkpoint lama dihapus otomatis agar file tidak membesar
- Berguna untuk melihat "jam berapa omzet mulai naik"

---

### `memory/pending-tasks.json`

Antrian tugas yang belum dieksekusi. Digunakan jika sistem restart saat ada tugas berjalan.

```json
{
  "queue": [],       ← tugas menunggu
  "processing": null, ← tugas sedang berjalan
  "completed": [],   ← tugas selesai
  "failed": []       ← tugas gagal
}
```

---

## 7. SCRIPTS UTAMA

### `scripts/startup.js` — Titik Masuk Sistem

File yang dijalankan pertama kali dengan `npm start`.

**Fungsi-fungsi di dalamnya:**

```javascript
function log(msg)
```
Mencatat pesan ke konsol DAN ke file `logs/startup.log` sekaligus. Setiap pesan diberi timestamp otomatis.

```javascript
function updateProgress(stage, status, detail)
```
Menyimpan status kemajuan ke `.rufo-progress.json`. Contoh: saat startup dimulai → status "running", setelah selesai → "completed". Berguna untuk debugging jika sistem crash di tengah jalan.

```javascript
function cekDependencies()
```
Memastikan file-file wajib ada sebelum sistem berjalan:
- `config/openclaw.json` → konfigurasi utama
- `data/stok.csv` → database stok
- `memory/kios-memory.json` → memori sistem

Jika ada yang kurang, sistem berhenti dan memberitahu file mana yang hilang.

```javascript
function jalankanService(nama, script, args)
```
Menjalankan script lain sebagai proses terpisah. Berbeda dengan `require()` biasa, ini menjalankan file sebagai program mandiri sehingga:
- Output ditampilkan realtime
- Jika satu script error, tidak menghancurkan startup
- Exit code 2 (stok kritis) tetap dianggap "berhasil" karena itu kondisi normal

```javascript
async function main()
```
Urutan kerja startup:
1. Tampilkan banner
2. Cek dependencies
3. Update `startup_time` di memory
4. Jalankan `cek-stok.js` — tahu kondisi awal stok
5. Jalankan `laporan-harian.js --test` — uji sistem laporan
6. Jalankan `memory-checkpoint.js` di background (terpisah dari proses utama)
7. Tampilkan instruksi penggunaan

**`checkpoint.unref()`** — perintah ini penting: memberitahu Node.js bahwa proses checkpoint boleh tetap berjalan meskipun proses startup sudah selesai. Tanpa ini, checkpoint akan ikut mati saat startup selesai.

---

### `scripts/laporan-harian.js` — Pembuat Laporan AI

Dijalankan 3x sehari oleh Windows Task Scheduler.

```javascript
const TZ = process.env.KIOS_TIMEZONE || 'Asia/Makassar';
```
Timezone diambil dari `.env`. Jika tidak diset, default ke WITA. Ini penting agar laporan tidak menampilkan "Pagi" saat sebenarnya sudah malam.

```javascript
function bacaTransaksi()
```
Membaca `transaksi.csv` dan mengubahnya menjadi array JavaScript. Jika file kosong (belum ada transaksi), mengembalikan array kosong `[]` tanpa error.

```javascript
function hitungLaporan(transaksi, stok, tanggal)
```
Otak perhitungan laporan:
- **Filter per tanggal**: hanya ambil transaksi hari ini, bukan semua riwayat
- **Hitung omzet**: jumlahkan kolom `total` dari semua transaksi hari ini
- **Top 3 produk**: hitung qty per produk, urutkan dari terbanyak, ambil 3 teratas
- **Stok kritis**: filter produk yang stoknya ≤ `stok_kritis`

```javascript
const sesi = jam < 10 ? 'Pagi' : jam < 16 ? 'Siang' : 'Malam';
```
Menentukan sesi berdasarkan jam:
- 00:00–09:59 → Pagi
- 10:00–15:59 → Siang
- 16:00–23:59 → Malam

```javascript
async function tanyaAI(prompt)
```
Mengirim pertanyaan ke Groq. Jika Groq gagal (timeout/error), otomatis coba `tanyaGemini()`. Ini adalah mekanisme **fallback** — sistem tidak berhenti meski satu AI tidak tersedia.

```javascript
if (isTest && !process.env.GROQ_API_KEY?.startsWith('gsk_A'))
```
Mode test: jika dijalankan dengan flag `--test` dan API key belum diisi (masih placeholder), laporan dibuat secara lokal tanpa memanggil API. Berguna saat setup awal untuk menguji sistem tanpa internet.

---

### `scripts/cek-stok.js` — Monitor Stok

```javascript
function kategorikanStok(stok)
```
Memisahkan produk menjadi 3 kelompok:
- **Kritis** (`stok ≤ stok_kritis`): perlu restock HARI INI
- **Rendah** (`stok_kritis < stok ≤ stok_minimum`): perlu restock minggu ini
- **Aman** (`stok > stok_minimum`): tidak perlu tindakan

```javascript
function tampilkanStok(stok)
```
Menampilkan status stok dalam format tabel yang rapi di terminal menggunakan:
- `.padEnd(25)` → padding kanan agar kolom nama rata
- `.padStart(3)` → padding kiri agar kolom angka rata kanan

```javascript
process.exit(2);
```
Exit code 2 berarti "selesai dengan peringatan — ada stok kritis". Digunakan oleh `startup.js` untuk membedakan "selesai normal (0)", "ada stok kritis (2)", dan "error (1)".

---

### `scripts/backup.js` — Backup Otomatis

```javascript
const filesToBackup = [
  ['data/stok.csv', 'stok.csv'],
  ['data/transaksi.csv', 'transaksi.csv'],
  ...
];
```
Daftar file yang dicadangkan. Format: [lokasi sumber, nama di folder backup].

```javascript
const semua = fs.readdirSync(BACKUP_DIR).sort();
if (semua.length > 7) {
  const hapus = semua.slice(0, semua.length - 7);
```
Rotasi backup otomatis: hanya simpan 7 hari terakhir. Folder backup diurutkan alfabet (karena nama folder adalah tanggal format YYYY-MM-DD, urutan alfabet = urutan waktu). Folder paling lama dihapus otomatis untuk menghemat storage.

---

### `scripts/blockchain-logger.js` — Audit Trail

Mencatat setiap transaksi penting ke dalam chain lokal yang tidak bisa dimanipulasi.

```javascript
function hash(data)
```
Menggunakan algoritma SHA-256 untuk membuat "sidik jari" dari data. Jika data diubah satu karakter pun, hash berubah total.

```javascript
function tambahBlok(data)
```
Cara kerja blockchain lokal:
1. Ambil blok terakhir dari chain
2. Buat blok baru dengan: data + hash blok sebelumnya (`prevHash`)
3. Hitung hash blok baru
4. Tambahkan ke chain

Karena setiap blok menyimpan hash blok sebelumnya, jika ada yang mengubah data lama, hash-nya tidak cocok lagi dengan blok berikutnya — kecurangan terdeteksi.

```javascript
function verifikasiChain()
```
Memeriksa integritas seluruh chain: untuk setiap blok, hitung ulang hash-nya dan bandingkan. Jika ada yang tidak cocok, laporan titik masalah.

```javascript
if (require.main === module)
```
Kode di dalam blok ini hanya berjalan jika file dijalankan langsung (`node blockchain-logger.js`), tidak berjalan jika file di-`require()` oleh file lain. Ini memungkinkan file berfungsi ganda: sebagai modul (di-import) dan sebagai program standalone.

---

### `scripts/memory-checkpoint.js` — Pencadangan Memori

```javascript
const INTERVAL_MS = 5 * 60 * 1000; // 5 menit
```
5 menit × 60 detik × 1000 milidetik = 300.000 ms. JavaScript menggunakan milidetik.

```javascript
function simpanCheckpoint()
```
Mengambil "foto" kondisi kios saat ini dan menyimpannya:
- Omzet sementara
- Jumlah transaksi
- Daftar stok kritis
- AI provider yang aktif

```javascript
checkpoint.checkpoints.slice(-checkpoint.max_keep)
```
`slice(-288)` mengambil 288 elemen terakhir dari array. Tanda minus artinya "hitung dari belakang". Ini cara Node.js menghapus data lama tanpa loop manual.

```javascript
if (process.argv.includes('--once'))
```
Jika dijalankan dengan flag `--once`, hanya simpan satu checkpoint lalu berhenti. Berguna untuk testing atau trigger manual.

```javascript
process.on('SIGTERM', () => ...)
process.on('SIGINT', () => ...)
```
Menangkap sinyal shutdown dari sistem operasi:
- `SIGTERM` → shutdown bersih dari Task Manager / sistem
- `SIGINT` → Ctrl+C dari terminal

Saat ditangkap, program mencatat "Checkpoint dihentikan" sebelum keluar, bukan langsung mati.

---

### `scripts/security.js` — Modul Keamanan

Digunakan oleh beberapa script lain, tidak dijalankan langsung.

```javascript
function sanitizeInput(teks)
```
Membersihkan teks masukan dari karakter berbahaya:
- `teks.slice(0, MAX_INPUT_LENGTH)` → potong jika lebih dari 200 karakter (cegah buffer overflow)
- `replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')` → hapus karakter kontrol tersembunyi yang bisa menipu sistem
- Karakter normal (huruf, angka, spasi, backtick) tetap dibiarkan karena diproses sebagai argumen, bukan string shell

```javascript
function sanitizeCsvField(val)
```
Membersihkan nilai sebelum ditulis ke CSV:
- Hapus `\r\n` → karakter ini bisa membuat satu data menjadi dua baris di CSV
- Tambahkan `'` di depan jika dimulai `=`, `+`, `-`, `@` → karakter ini ditafsirkan sebagai formula di Excel/LibreOffice (berbahaya jika dibuka dengan spreadsheet)

```javascript
function buatBarisCsvAman(obj)
```
Membuat satu baris CSV dari object transaksi dengan aman:
- Setiap field disanitasi terlebih dahulu
- Jika field mengandung koma atau tanda kutip, field dibungkus tanda kutip ganda
- Tanda kutip di dalam field di-escape menjadi `""`

```javascript
function cekRateLimit(pengirim)
```
Membatasi frekuensi perintah dari satu nomor HP:
- Menyimpan hitungan dalam `Map` (seperti kamus: nomor HP → {count, waktu})
- Jika lebih dari 20 perintah dalam 1 menit, tolak
- Window reset otomatis setelah 1 menit

```javascript
function isPhoneAllowed(phone, whitelistStr)
```
Memeriksa apakah nomor HP ada di daftar putih:
- `normalize()` → hapus spasi, tanda hubung, kurung dari nomor HP sebelum dibandingkan
- Ini mencegah masalah format: `+62-851-6506-1698` sama dengan `+6285165061698`

---

## 8. TELEGRAM BOT

> Folder masih bernama `signal/` (dipertahankan agar `require()` & npm scripts tidak berubah), tapi transport-nya sekarang **Telegram Bot API**.

### `signal/message-parser.js` — Pengurai Perintah

```javascript
const PERINTAH = {
  STOK: /^(stok|cek stok|stock)/i,
  JUAL: /^jual\s+(.+)\s+(\d+)/i,
```

Kumpulan **regular expression** (pola teks) untuk mengenali perintah. Penjelasan pola:
- `/^(stok|cek stok|stock)/i` → teks harus dimulai (`^`) dengan "stok" ATAU "cek stok" ATAU "stock", tidak peduli huruf besar/kecil (`i`)
- `/^jual\s+(.+)\s+(\d+)/i` → dimulai "jual", lalu spasi (`\s+`), lalu nama produk apa saja (`.+`, disimpan di grup 1), lalu spasi, lalu angka (`\d+`, disimpan di grup 2)

```javascript
function parsePerintah(teks)
```
Mengurai teks menjadi objek perintah terstruktur:
- `"jual mie instan 5"` → `{ tipe: 'JUAL', produk: 'mie instan', qty: 5 }`
- `"stok"` → `{ tipe: 'STOK' }`
- `"apa kabar"` → `{ tipe: 'AI_CHAT', teks: 'apa kabar' }` (tidak dikenali → diteruskan ke AI)

Perintah yang butuh ekstraksi data (JUAL, TAMBAH_STOK, HARGA) diperiksa duluan sebelum perulangan, karena pola mereka lebih spesifik.

```javascript
function validasiPerintah(parsed)
```
Validasi logika bisnis:
- `qty <= 0` → tidak masuk akal jual 0 atau -5 produk
- `isNaN(qty)` → qty bukan angka (jika parser salah ekstrak)

---

### `signal/response-formatter.js` — Pembuat Pesan Balasan

Semua fungsi di sini mengembalikan string teks yang diformat untuk dibaca di Telegram.

```javascript
function formatRupiah(n)
```
`Number(n).toLocaleString('id-ID')` → mengubah 17500 menjadi "17.500" menggunakan format Indonesia (titik sebagai pemisah ribuan).

```javascript
stokRingkas(stok)
```
Memfilter stok kritis dan rendah lalu format menjadi pesan dengan emoji. Tanda `*teks*` di Telegram (parse_mode Markdown) = **teks tebal**.

```javascript
konfirmasiJual(produk, qty, total, sisaStok)
```
Membuat konfirmasi transaksi. Jika `sisaStok <= 2`, otomatis tambahkan peringatan "Stok hampir habis!" — logika bisnis sederhana yang berguna.

---

### `signal/bot-handler.js` — Otak Bot

File terbesar dan terpenting dalam sistem bot.

```javascript
const axios = require('axios');
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
async function tgApi(method, params, timeout) { ... }
```
Semua komunikasi ke Telegram lewat satu helper `tgApi()` yang POST JSON ke endpoint Bot API. Karena body dikirim sebagai JSON (bukan argumen shell), input pengguna **tidak pernah dieksekusi sebagai perintah** — aman dari command injection.

```javascript
async function kirimPesan(teks, penerima)
```
Mengirim pesan ke Telegram via `sendMessage`. Dicoba dengan `parse_mode: 'Markdown'` (format `*tebal*` / `_miring_` sama seperti Signal); jika Telegram menolak parsing, dikirim ulang sebagai teks polos agar pesan tetap sampai. Pesan panjang dipecah `pecahPesan()` (maks 4096 karakter, batas Telegram).

```javascript
function envelopeFromTelegram(message) { ... }
```
Adaptor yang mengubah update Telegram menjadi objek envelope ber-format Signal (`sourceNumber`, `dataMessage.message`, `groupInfo.groupId`). Tujuannya: seluruh logika `prosesEnvelope()` tetap berjalan **tanpa perubahan** meski transport sudah ganti. Pengirim diambil dari `message.from.id` (User ID numerik Telegram).

```javascript
async function mulaiPolling() {
  const updates = await tgApi('getUpdates', { offset, timeout: 30 });
  for (const upd of updates) prosesEnvelope(envelopeFromTelegram(upd.message));
}
```
Bot menarik pesan masuk via **long polling** `getUpdates` (bukan webhook), jadi tidak perlu server publik. Tiap update disalurkan ke `prosesEnvelope` lewat adaptor di atas.

```javascript
if (!diWhitelist && !grupDiizinkan && !adaPendingKonfirmasi && !diTerdaftar) {
  log(`Ditolak dari ${sender || 'unknown'}`);
```
Jika pengirim tidak ada di `TELEGRAM_WHITELIST` (dan bukan anggota grup terdaftar), perintah langsung ditolak. Ini mencegah orang luar mengontrol kios.

---

## 9. DASHBOARD NEXT.JS

### `dashboard/middleware.js` — Penjaga Keamanan

File ini dijalankan **sebelum** setiap request ke `/api/*` — seperti satpam di pintu masuk.

```javascript
const store = new Map();
const WINDOW_MS = 60_000;
const MAX_REQ = 60;
```
Menyimpan catatan request per IP. Notasi `60_000` sama dengan `60000` — garis bawah hanya pemisah angka agar mudah dibaca.

```javascript
function rateLimitOk(ip)
```
Algoritma sliding window rate limiter:
- Cek apakah IP sudah ada di catatan
- Jika window sudah lewat 1 menit → reset hitungan
- Jika masih dalam window → tambah hitungan, tolak jika > 60

```javascript
if (API_KEY && API_KEY.length > 10)
```
Pengecekan API key hanya aktif jika `DASHBOARD_API_KEY` sudah diisi (panjang > 10 karakter). Ini memastikan sistem tetap bisa diakses saat testing sebelum API key dikonfigurasi.

```javascript
export const config = { matcher: ['/api/:path*'] }
```
Memberitahu Next.js bahwa middleware ini hanya berlaku untuk URL yang dimulai `/api/`. Halaman dashboard sendiri (/) tidak terpengaruh.

---

### `dashboard/next.config.js` — Konfigurasi Next.js

```javascript
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
```

Header HTTP keamanan yang dikirim bersama setiap respons:

| Header | Fungsi |
|--------|--------|
| `X-Frame-Options: SAMEORIGIN` | Cegah dashboard dibuka dalam iframe website lain (clickjacking) |
| `X-Content-Type-Options: nosniff` | Browser tidak boleh menebak tipe file — harus pakai yang dideklarasikan server |
| `Strict-Transport-Security` | Paksa browser selalu pakai HTTPS, bukan HTTP |
| `Referrer-Policy` | Batasi informasi yang dikirim saat klik link dari dashboard |
| `Permissions-Policy` | Matikan akses kamera, mikrofon, GPS dari halaman dashboard |
| `Content-Security-Policy` | Daftar sumber daya yang boleh dimuat — cegah XSS (sisipan script berbahaya) |

```javascript
poweredByHeader: false
```
Sembunyikan header `X-Powered-By: Next.js` dari respons. Menyembunyikan teknologi yang digunakan mempersulit penyerang mencari celah spesifik Next.js.

---

### `dashboard/app/layout.js` — Template Halaman

Dijalankan satu kali dan membungkus semua halaman. Berisi:
- `<html lang="id">` → memberitahu browser ini halaman Bahasa Indonesia (aksesibilitas)
- `export const metadata` → judul tab browser dan deskripsi SEO
- Header hijau dengan nama kios
- Footer dengan tahun otomatis (`new Date().getFullYear()`)
- `<main>` dengan lebar maksimal 6xl dan padding — agar tidak terlalu lebar di layar besar

---

### `dashboard/app/page.js` — Halaman Utama Dashboard

```javascript
'use client';
```
Menandai ini sebagai Client Component — dijalankan di browser pengguna, bukan di server. Diperlukan karena menggunakan `useState` dan `useEffect`.

```javascript
const [stok, setStok] = useState([]);
```
`useState` adalah cara React menyimpan data yang bisa berubah. Saat `setStok(dataBaru)` dipanggil, React otomatis render ulang tampilan dengan data baru.

```javascript
useEffect(() => {
  async function fetchData() { ... }
  fetchData();
  const interval = setInterval(fetchData, 5 * 60 * 1000);
  return () => clearInterval(interval);
}, []);
```
`useEffect` dengan `[]` di akhir → dijalankan sekali saat komponen pertama kali muncul.
- Ambil data dari 3 API sekaligus (`Promise.all` = paralel, lebih cepat)
- Set interval auto-refresh setiap 5 menit
- `return () => clearInterval(interval)` → bersihkan interval saat halaman ditutup (cegah memory leak)

```javascript
function StatCard({ label, value, icon, color })
```
Komponen kartu ringkasan kecil. Menerima props dan mengembalikan HTML. `colors[color] || colors.green` → jika warna tidak dikenal, pakai hijau sebagai default.

---

### `dashboard/components/StokTable.js` — Tabel Stok

```javascript
if (!data?.length) return <p>...</p>;
```
`data?.length` → operator `?.` (optional chaining): jika `data` adalah `null` atau `undefined`, tidak error, langsung kembalikan `undefined` (falsy). Cegah crash jika data belum dimuat.

```javascript
function badgeStok(stok, kritis, minimum)
```
Mengembalikan badge berwarna berdasarkan kondisi stok:
- `s <= k` → Kritis (merah)
- `s <= m` → Rendah (kuning)
- Sisanya → Aman (hijau)

---

### `dashboard/components/AlertBanner.js` — Banner Peringatan

Komponen sederhana yang menampilkan banner merah (kritis) atau kuning (rendah).

```javascript
items.slice(0, 5).map(item => ...)
{items.length > 5 && <li>...dan {items.length - 5} produk lainnya</li>}
```
Tampilkan maksimal 5 item. Jika lebih dari 5, tampilkan teks "...dan X produk lainnya" — menjaga UI tidak terlalu panjang.

---

### `dashboard/components/TransaksiChart.js` — Grafik Omzet

```javascript
const grouped = {};
data.forEach(tx => {
  if (!grouped[tgl]) grouped[tgl] = { tanggal: tgl, omzet: 0, jumlah: 0 };
  grouped[tgl].omzet += Number(tx.total || 0);
});
```
Mengelompokkan transaksi per tanggal dengan teknik "group by" menggunakan object sebagai hashmap. Setiap tanggal menjadi key, nilai adalah total omzet hari itu.

```javascript
.sort((a, b) => a.tanggal.localeCompare(b.tanggal))
.slice(-7)
```
Urutkan per tanggal (alfabet = kronologis karena format YYYY-MM-DD), lalu ambil 7 terakhir.

```javascript
const formatRp = (v) => 'Rp ' + (v / 1000).toFixed(0) + 'rb';
```
Format angka di sumbu Y grafik: 50000 → "Rp 50rb". Dipersingkat agar tidak tumpang tindih di grafik.

Library `recharts` mengurus rendering grafik batang secara otomatis dari array data yang diberikan.

---

### `dashboard/app/api/stok/route.js` — API Data Stok

```javascript
export async function GET()
```
Fungsi ini dipanggil saat ada request HTTP GET ke `/api/stok`. Next.js App Router menggunakan nama fungsi sebagai penanda metode HTTP.

```javascript
try {
  const content = readFileSync(CSV_PATH, 'utf8');
  data = parse(content, { columns: true, skip_empty_lines: true });
} catch {
  // File tidak ada — kembalikan array kosong, bukan error detail
}
```
Double try-catch: outer catch menangani error tak terduga dan mengembalikan pesan generik (tidak ekspos detail error ke client — prinsip keamanan "least information").

---

### `dashboard/app/api/transaksi/route.js` — API Data Transaksi

```javascript
const MAX_LIMIT = 500;
const rawLimit = parseInt(searchParams.get('limit') || '100', 10);
const limit = Number.isFinite(rawLimit) && rawLimit > 0
  ? Math.min(rawLimit, MAX_LIMIT)
  : 100;
```
Validasi parameter `limit` dari URL (`/api/transaksi?limit=50`):
- `parseInt(..., 10)` → konversi ke integer basis 10 (cegah injeksi hex/octal)
- `Number.isFinite()` → cegah `NaN`, `Infinity`
- `Math.min(rawLimit, MAX_LIMIT)` → tidak boleh minta lebih dari 500 data sekaligus (cegah dump database)

---

## 10. FILE ROOT PROJECT

### `.env` — Variabel Lingkungan

File ini berisi semua rahasia sistem. **JANGAN pernah upload ke GitHub.**

```
GROQ_API_KEY=gsk_...           ← Kunci akses Groq AI
GEMINI_API_KEY=AIza...         ← Kunci akses Google Gemini
TELEGRAM_BOT_TOKEN=123:ABC...  ← Token bot dari @BotFather
TELEGRAM_GROUP_ID=-100...      ← Chat ID grup
TELEGRAM_WHITELIST=123456789   ← User ID Telegram yang boleh beri perintah
DASHBOARD_API_KEY=...          ← Token keamanan dashboard web
```

Dibaca oleh `require('dotenv').config()` di setiap script yang membutuhkannya.

---

### `.gitignore` — File Pengecualian Git

```
.env          ← API keys rahasia
node_modules/ ← 200MB+ dependencies, tidak perlu diunggah
backups/      ← Data backup lokal
logs/*.log    ← Log berubah terus, tidak berguna di GitHub
```

Tanpa file ini, Git akan ikut mengupload semua file di atas ke GitHub.

---

### `package.json` — Manifes Project

```json
"scripts": {
  "start": "node scripts/startup.js",
  "laporan": "node scripts/laporan-harian.js",
  "cek-stok": "node scripts/cek-stok.js"
}
```
Kumpulan perintah singkat. `npm run laporan` lebih mudah diingat daripada `node /home/kevinman/kios-openclaw/scripts/laporan-harian.js`.

```json
"dependencies": {
  "groq-sdk": "^0.9.1",        ← Library resmi Groq
  "csv-parse": "^5.5.6",       ← Baca file CSV
  "csv-stringify": "^6.5.1",   ← Tulis file CSV
  "dayjs": "^1.11.13",         ← Olah tanggal/waktu (lebih ringan dari moment.js)
  "node-cron": "^3.0.3",       ← Jadwal tugas berulang
  "chalk": "^4.1.2",           ← Warna teks di terminal
  "dotenv": "^16.4.5"          ← Baca file .env
}
```

Tanda `^` berarti "versi ini atau versi minor lebih baru". Contoh `^0.9.1` = boleh install 0.9.5, tidak boleh 1.0.0 (major berbeda).

---

## 11. KEAMANAN SISTEM

Sistem menerapkan 7 lapisan keamanan:

| # | Lapisan | Implementasi | Melindungi dari |
|---|---------|-------------|-----------------|
| 1 | Command Injection | `spawnSync(cmd, [args])` (remote shell) | Perintah berbahaya via Telegram |
| 2 | Whitelist Pengirim | `isWhitelisted()` | Bot dikendalikan orang tak dikenal |
| 3 | Rate Limiting | `cekRateLimit()` + middleware | Spam & brute force |
| 4 | Input Sanitization | `sanitizeInput()` | Karakter kontrol tersembunyi |
| 5 | CSV Injection | `buatBarisCsvAman()` | Formula berbahaya di spreadsheet |
| 6 | API Authentication | `middleware.js` | Akses tak sah ke dashboard API |
| 7 | Security Headers | `next.config.js` | XSS, clickjacking, MIME sniffing |

---

## 12. JADWAL OTOMATIS

Format cron yang digunakan: `menit jam hari bulan hari-dalam-minggu`

| Jadwal | Format Cron | Artinya |
|--------|-------------|---------|
| Laporan Pagi | `0 6 * * *` | Setiap hari jam 06:00 |
| Laporan Siang | `0 12 * * *` | Setiap hari jam 12:00 |
| Laporan Malam | `0 20 * * *` | Setiap hari jam 20:00 |
| Cek Stok | `0 */3 * * *` | Setiap 3 jam (00:00, 03:00, 06:00, ...) |
| Backup | `0 22 * * *` | Setiap hari jam 22:00 |
| Checkpoint | `*/5 * * * *` | Setiap 5 menit |

---

## 13. PANDUAN BACA ERROR

### Error Umum dan Solusinya

| Error | Penyebab | Solusi |
|-------|----------|--------|
| `ENOENT: no such file or directory` | File CSV atau konfigurasi tidak ada | Jalankan ulang setup atau buat file yang hilang |
| `Groq gagal ... coba Gemini` | API Groq timeout atau rate limit | Normal — sistem otomatis fallback ke Gemini |
| `Token Telegram tidak valid` | `TELEGRAM_BOT_TOKEN` salah/kosong | Cek token dari @BotFather, set di `.env` |
| `getUpdates error: ... 409` | Ada instance bot lain yang sedang polling | Pastikan hanya satu proses `signal:start` berjalan |
| `⛔ Ditolak dari ...` | User ID tidak ada di whitelist | Tambahkan User ID ke `TELEGRAM_WHITELIST` di `.env` |
| `⏱️ Rate limit tercapai` | Terlalu banyak perintah dalam 1 menit | Tunggu 1 menit, kirim perintah kembali |
| `Stok tidak cukup` | Qty yang diminta melebihi stok | Cek stok dengan perintah "stok" |
| `exit code 1` | Error fatal pada script | Lihat log di `logs/` untuk detail |
| `exit code 2` | Ada stok kritis | Normal — bukan error, hanya peringatan |

### Cara Membaca Log

```
[2026-05-17 08:30:15] ✅ Checkpoint #42 disimpan
  ↑ Timestamp          ↑ Status    ↑ Pesan
```

Log tersimpan di folder `logs/`:
- `laporan.log` → lihat jika laporan tidak terkirim
- `stok.log` → lihat jika cek stok bermasalah
- `signal.log` → lihat jika bot tidak merespons
- `checkpoint.log` → lihat jika memory tidak tersimpan
- `backup.log` → lihat jika backup gagal
- `startup.log` → lihat jika sistem tidak bisa start

---

*Dokumentasi ini dibuat otomatis oleh Claude Code — 17 Mei 2026*
*Untuk pertanyaan teknis, jalankan ulang Claude Code di folder project ini.*

---

## 14. FITUR BARU (Update 23 Mei 2026)

> Panduan ini ditulis untuk **programmer pemula**.
> Tujuannya: kalau ada yang perlu diubah manual, Anda tahu file mana yang harus disentuh.

### 14.1 Role 'irma' + Approval Gate AI

**Apa itu?**
Role user baru bernama `irma`. Akses penuh seperti owner, **tapi** kalau dia mau pakai fungsi AI (chat AI, prediksi harga, dll), bot otomatis kirim notifikasi ke owner. Owner balas `aprove` → AI baru jalan.

**Kenapa berguna?**
Owner bisa kasih akses lebar ke asisten (`irma`) tanpa khawatir token AI dipakai sembarangan — semua pemakaian AI minta izin dulu.

**File yang terkait:**

| File | Apa isinya |
|---|---|
| `scripts/rbac.js` | Daftar role + permission. Ada konstanta `AI_INTENTS` (12 intent yang butuh approval) dan `OWNER_ONLY` (intent owner-only). |
| `signal/bot-handler.js` | Logika gate: `pendingAIApprovals` Map (state pending), `antriAIApproval()` (kirim notif), `cekBalasanApprovalAI()` (deteksi balasan owner), `jalankanAIYangDisetujui()` (eksekusi setelah aprove). |
| `signal/intent-handlers.js` | Case `KELOLA_USER` — terima role `irma` saat user ditambahkan. |
| `signal/intent-detector.js` | Regex `RE.KELOLA_USER` — match `tambah irma` & `hapus irma`. |

**Kalau mau ubah daftar intent yang butuh approval:**
1. Buka `scripts/rbac.js`
2. Cari constant `AI_INTENTS` (sekitar baris 15)
3. Tambah/hapus nama intent di set itu

**Kalau mau ubah waktu kedaluwarsa approval (default 5 menit):**
1. Buka `signal/bot-handler.js`
2. Cari `AI_APPROVAL_TTL_MS` (sekitar baris 175)
3. Ganti angkanya. Format: `menit * 60_000`. Contoh 10 menit = `10 * 60_000`.

**Kalau mau tambah/ubah kata kunci balasan owner (default: `aprove`, `setuju`, `oke`, dll):**
1. Buka `signal/bot-handler.js`
2. Cari fungsi `cekBalasanApprovalAI` (sekitar baris 245)
3. Edit regex `/^(aprove|approve|setuju|izin|izinkan|oke|ok|ya)$/i`

---

### 14.2 Ganti AI Model dari Telegram

**Apa itu?**
Owner bisa pilih AI model lewat perintah Telegram (`ganti ai utama gemini_flash_20`) — tidak perlu edit kode. API key tetap manual di `.env`.

**Kenapa berguna?**
- Kalau kuota Groq habis → tinggal ganti ke Gemini lewat Telegram.
- Test model baru tanpa restart bot.

**File yang terkait:**

| File | Apa isinya |
|---|---|
| `config/models.js` | Registri model. Tambah model baru di `DAFTAR_MODEL`. Fungsi `getModel(peran)`, `setModelAktif()`, `resetModel()`, `daftarModel()`. Override owner disimpan di `data/ai-models.json`. |
| `signal/intent-detector.js` | Regex `RE.GANTI_MODEL`, `RE.RESET_MODEL`, `RE.DAFTAR_MODEL_AI`. |
| `signal/intent-handlers.js` | Case `GANTI_MODEL` & `DAFTAR_MODEL_AI`. Juga update label TOKEN_USAGE: "Utama"→"AI Utama", "Fallback"→"AI Cadangan", "Batch"→"AI Batch". |
| `signal/delegation-policy.js` | `GANTI_MODEL` & `DAFTAR_MODEL_AI` masuk `LOCAL_INTENTS` (tidak boros token). |
| `scripts/rbac.js` | `OWNER_ONLY = {'GANTI_MODEL'}` — irma tidak boleh ganti model. |
| `data/ai-models.json` | File JSON persistence override. Format: `{"primary":"gemini_flash_20"}`. Kalau kosong `{}` = pakai default registry. |

**Kalau mau tambah model AI baru:**
1. Buka `config/models.js`
2. Tambah entry baru di `DAFTAR_MODEL`, contoh:
   ```js
   openai_gpt4: {
     provider   : 'openai',
     nama       : 'GPT-4',
     versi      : 'turbo',
     model_id   : 'gpt-4-turbo',
     env_key    : 'OPENAI_API_KEY',
     peran      : 'primary',  // primary | fallback | batch
     max_tokens : 1024,
     temperature: 0.3,
     timeout_ms : 8000,
   },
   ```
3. Set `OPENAI_API_KEY=sk-...` di `.env`
4. Restart bot
5. Sekarang owner bisa ketik: `ganti ai utama openai_gpt4`

> **CATATAN:** Tambah model dengan provider baru juga perlu update `signal/ai-handler.js` — tambah fungsi `tanyaOpenAI()` mirip `tanyaGroq()` / `tanyaGemini()`.

**Kalau mau reset semua override:**
Hapus / kosongkan file `data/ai-models.json`:
```bash
echo "{}" > data/ai-models.json
```

---

### 14.3 Bug Tracking — di mana lihat?

File: `data/bug-report.json`

Setiap bug ter-record dengan format:
```json
{
  "bug_id": "BUG-0003",
  "date": "2026-05-23 13:30",
  "error_type": "DetectionMiss",
  "location": "signal/intent-detector.js — RE.KELOLA_USER",
  "root_cause": "...",
  "input": "tambah irma Irma +6285",
  "fix_applied": "...",
  "test_result": "FIXED — ...",
  "prevention_rule": "..."
}
```

**Cara baca:**
- `fix_applied: null` = belum di-fix
- `test_result: "FIXED ..."` = sudah lulus test
- `prevention_rule` = aturan agar bug serupa tidak terulang

Sistem `self-debug` (file `skills/self-debug.js`) otomatis tambah bug ke file ini saat error terjadi di runtime.

---

### 14.4 Memory Leak Prevention

Bot punya beberapa `Map` in-memory untuk state pending (konfirmasi, approval). Tanpa cleanup, kalau user tidak balas, entry numpuk dan habiskan RAM.

**Cara cleanup ditangani:**

| Map | File | Cara cleanup |
|---|---|---|
| `pendingConfirmations` | `bot-handler.js:163` | Dihapus saat `cekKonfirmasi()` dipanggil (cek TTL). |
| `pendingAIApprovals` | `bot-handler.js:172` | `setInterval` periodik tiap 60 detik (lihat baris 178), hapus entry expired. |
| `ownerPendingApproval` | `bot-handler.js:174` | Sama dengan `pendingAIApprovals`. |
| `pendingRpc` | `bot-handler.js:254` | Per-request `setTimeout` cleanup. |

**Kalau bot RAM membengkak:**
1. Cek dengan `ps aux | grep bot-handler`
2. Restart bot — Map akan kosong lagi
3. Cek log `[AI-APPROVAL] cleanup: N approval kedaluwarsa dihapus` — kalau N besar, ada owner yang sering tidak balas approval

---

### 14.5 Daftar Singkat File Penting (Cheat Sheet untuk Programmer Pemula)

| Mau ubah apa? | Buka file ini |
|---|---|
| Tambah role baru | `scripts/rbac.js` (di `IZIN`) |
| Tambah/ubah permission per role | `scripts/rbac.js` (di `IZIN`) |
| Tambah perintah baru | `signal/intent-detector.js` (tambah regex) + handler di `signal/intent-handlers.js` atau `signal/bot-handler.js` |
| Ganti format respons | `signal/response-formatter.js` |
| Ganti AI model | `config/models.js` (`DAFTAR_MODEL`) |
| Tambah skill Python baru | Buat file di `skills/`, daftar di `signal/bridge.js` |
| Ganti jadwal cron | `cron/scheduler.js` |
| Tambah handler cron | `cron/handlers.js` |
| Edit data stok manual | `data/stok.csv` |
| Edit data user manual | `data/users.json` |
| Edit owner | `.env` → `TELEGRAM_WHITELIST=123456789` (User ID, bisa banyak, dipisah koma) |

---

*Update 23 Mei 2026 — Fitur role 'irma', AI approval gate, model switcher, memory leak fix.*
