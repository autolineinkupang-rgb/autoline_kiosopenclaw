# Kak Kios — Referensi Perintah Bot v5.0

Panduan perintah Signal untuk **Kios Desa Maju** milik Ruflo.

---

## JUAL / PENJUALAN

| Perintah | Contoh |
|---|---|
| `jual [produk] [qty]` | `jual beras 2` |
| `jual [produk] [qty] tunai/qris/transfer` | `jual gula 1 qris` |
| `jual [produk] [qty] tunai bayar [nominal]` | `jual minyak 1 tunai bayar 20000` |

---

## BELI / RESTOCK

| Perintah | Contoh |
|---|---|
| `beli [produk] [qty]` | `beli gula 50` |
| `beli [produk] [qty] harga [harga_beli]` | `beli beras 20 harga 68000` |
| `beli [produk] [qty] @ [harga]` | `beli minyak 12 @ 15000` |

### Restock Massal

```
restock massal:
Gula Pasir | 50 | 13000
Beras | 100 | 68000
Minyak | 24 | 15000
```

Atau satu baris: `restock massal: gula 50, beras 100`

---

## STOK & INVENTARIS

| Perintah | Keterangan |
|---|---|
| `stok` | Lihat semua stok |
| `cari [produk]` | Cari detail produk |
| `harga [produk]` | Cek harga jual produk |
| `cek harga [produk]` | Cek harga produk di kios |
| `harga pasar [produk]` | Analisis harga kompetitif |
| `harga kompetitif [produk]` | Cek daya saing harga |
| `exp` | Produk hampir kadaluarsa |
| `produk mau habis` | Stok kritis / menipis |
| `opname [produk] [stok_fisik]` | Sinkron stok fisik |
| `mutasi [produk]` | Riwayat keluar-masuk stok |
| `produk baru` | Produk baru hari ini |
| `produk baru minggu ini` | Produk baru minggu ini |

---

## LAPORAN

| Perintah | Keterangan |
|---|---|
| `laporan` | Ringkasan hari ini |
| `laporan mingguan` | Rekap minggu ini |
| `laporan bulanan` | Rekap bulan ini |
| `laba` | Laba/rugi hari ini |
| `riwayat` | Transaksi terakhir |
| `produk terlaris` | Top 10 produk terlaris |
| `riwayat harga [produk]` | Histori perubahan harga |

---

## TAMBAH / EDIT PRODUK

| Perintah | Contoh |
|---|---|
| `ubah harga [produk] jadi [harga]` | `ubah harga gula jadi 15000` |
| `hapus produk [nama]` | `hapus produk gula merah` |

### Tambah Produk Massal

```
tambah produk massal:
Susu Kaleng | sembako | pcs | 16000 | 14000 | 20
Kopi Sachet | minuman | bungkus | 2500 | 2000 | 50
```

_(format: nama | kategori | satuan | harga_jual | harga_beli | stok)_

---

## JUAL MASSAL / KASIR

```
jual banyak:
Gula Pasir | 2
Beras | 1
Minyak | 3
```

Atau: `jual banyak: gula 2, beras 1, minyak 3`

---

## SHIFT KASIR

| Perintah | Contoh |
|---|---|
| `buka shift [saldo_awal]` | `buka shift 500000` |
| `tutup shift [saldo_akhir]` | `tutup shift 750000` |
| `status shift` | Info shift aktif |

---

## PROMO & DISKON

| Perintah | Contoh |
|---|---|
| `buat promo [produk] [nilai]%` | `buat promo gula 10%` |
| `buat promo [produk] [nilai] rb` | `buat promo minyak 2 rb` |
| `lihat promo` | Daftar promo aktif |
| `hapus promo PROMO-0001` | Nonaktifkan promo |

---

## SUPPLIER

| Perintah | Contoh |
|---|---|
| `tambah supplier [nama]` | `tambah supplier Pak Ahmad` |
| `daftar supplier` | Semua supplier |
| `cari supplier [nama]` | Detail supplier |

---

## CUACA & PASOKAN

| Perintah | Keterangan |
|---|---|
| `cuaca` | Info cuaca & gelombang BMKG |
| `kapal` | Status kapal pasokan |

---

## SISTEM & AI

| Perintah | Keterangan |
|---|---|
| `status` | Status sistem & uptime |
| `performa` | Laporan performa bot |
| `laporan belajar` | Apa yang dipelajari bot hari ini |
| `shortcut` | Daftar pintasan perintah |
| `backup` | Backup data manual |
| `bantuan` | Panduan singkat perintah |

---

## PERINTAH BEBAS (AI)

Kirim pesan biasa dan bot akan menjawab menggunakan AI:

- _"berapa harga beras sekarang?"_
- _"ada promo apa hari ini?"_
- _"rekomendasikan produk apa yang perlu direstok"_

Bot akan membaca stok saat ini dan menjawab dengan konteks kios.

---

## CATATAN FORMAT

- Nama produk **tidak harus persis** — bot pakai fuzzy match
- Harga boleh pakai titik/koma: `15.000`, `15,000`, atau `Rp15.000` — semua jadi 15000
- Qty desimal OK: `beli minyak 1.5 harga 15000`
- Metode bayar default: `tunai`

---

## KELOLA USER (owner only)

Tambah atau hapus user yang boleh akses bot.

| Perintah | Contoh |
|---|---|
| `tambah kasir [nama] [nomor]` | `tambah kasir Budi +628123456789` |
| `tambah viewer [nama] [nomor]` | `tambah viewer Sari +628987654321` |
| `tambah irma [nama] [nomor]` | `tambah irma Asisten +628111222333` |
| `daftar kasir` | (lihat semua user aktif) |
| `hapus kasir [nomor]` | `hapus kasir +628123456789` |
| `hapus irma [nomor]` | `hapus irma +628111222333` |

### Apa beda role?

| Role | Akses |
|---|---|
| `owner` | Semua. Tidak butuh approval untuk AI. (Diset di `.env` lewat `SIGNAL_WHITELIST`) |
| `irma` | Semua. **Tapi setiap pakai AI butuh approval owner** (balas `aprove`). |
| `kasir` | Jual, lihat stok/laporan, shift. |
| `viewer` | Hanya lihat stok & laporan. |

### Alur approval AI (role `irma`)

1. User `irma` ketik perintah AI, contoh: `chat ai apa rekomendasi produk?`
2. Bot kirim notifikasi ke owner: *"Irma akan pakai AI model. Balas aprove untuk izinkan."*
3. Owner balas `aprove` (atau `setuju`, `oke`, `ya`) → AI jalan, hasil dikirim ke `irma`.
4. Owner balas `tolak` (atau `batal`) → permintaan ditolak.
5. Kalau owner tidak balas dalam **5 menit**, permintaan kedaluwarsa otomatis.

---

## GANTI AI MODEL (owner only)

Owner bisa pilih model AI yang dipakai untuk peran *AI Utama / AI Cadangan / AI Batch*.
API key tetap diset manual di `.env` (`GROQ_API_KEY`, `GEMINI_API_KEY`).

| Perintah | Contoh |
|---|---|
| `daftar model` | Lihat semua model + status key |
| `ganti ai utama [id]` | `ganti ai utama gemini_flash_20` |
| `ganti ai cadangan [id]` | `ganti ai cadangan groq_llama4_scout` |
| `ganti ai batch [id]` | `ganti ai batch groq_llama31_8b` |
| `reset ai utama` | Kembali ke default registry |

**Model ID** ada di `config/models.js`. Sekarang tersedia:
- `groq_llama4_scout` — Llama 4 Scout 17B (cepat, default AI Utama)
- `groq_llama31_8b` — Llama 3.1 8B (irit token, default AI Batch)
- `gemini_flash_20` — Gemini 2.0 Flash (default AI Cadangan)

Tambah model baru? Edit `config/models.js` → tambah entry di `DAFTAR_MODEL` dengan `provider`, `model_id`, `env_key`, `peran`. Sistem otomatis cek key tersedia sebelum izinkan switch.

---

*Kios Openclaw v5.0 — Ruflo, Rote Barat Laut, NTT*
