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
- Harga tanpa titik/koma: `15000` bukan `15.000`
- Qty desimal OK: `beli minyak 1.5 harga 15000`
- Metode bayar default: `tunai`

---

*Kios Openclaw v5.0 — Ruflo, Rote Barat Laut, NTT*
